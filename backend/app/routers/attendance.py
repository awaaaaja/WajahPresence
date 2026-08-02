"""Router absensi wajah — Sprint 2-3 (Prompt 2.1-2.4, 3.2-3.5, security-critical).

Urutan validasi (fail-fast — jangan matching jika liveness gagal):

  1. Liveness server-side: frame beda + wajah ada + urutan pose sesuai
     challenge (anti foto statis & replay video). Frame statis ditolak dari
     diff piksel MURAH, tanpa deteksi wajah.
  2. Matching: embedding frame tengah vs SEMUA embedding via pgvector,
     cosine >= threshold (0.6, dari config).
  3. Gate + rate limit (Sprint 5.2): user terdaftar & status 'approved',
     percobaan gagal > batas dalam window -> 429. Digabung ke query
     matching (1 roundtrip DB, NFR-1).
  4. Lokasi (Sprint 3, multi-signal — FR-2.3/2.4/2.5/2.6/2.7):
     a. Geofence PostGIS (ST_DWithin) — reject bila di luar radius.
        Aktif hanya bila ada lokasi terkonfigurasi; bila area aktif dan
        client tidak mengirim lokasi -> reject (tidak bisa diverifikasi).
     b. IP geolocation lookup (paralel sejak awal) sebagai sinyal pembanding.
     c. GPS accuracy tidak wajar ATAU selisih GPS-vs-IP besar -> status
        log 'suspicious' (absen TETAP diterima, FR-2.6 flag utk review admin).
     d. Teleport (FR-2.7): kecepatan antar-absen > batas -> REJECT.
  5. Log SEMUA percobaan (FR-2.8) + foto bukti untuk kasus gagal/mencurigakan.

Performa (NFR-1, < 3 detik):
  - SATU koneksi DB untuk seluruh request (handshake pooler ~0.5-2 dtk).
  - Gate/rate-limit + lookup IP-geo berjalan PARALEL dengan liveness
    CPU-bound (asyncio + thread) — gate digabung ke query matching
    (Sprint 5.2: 2 roundtrip -> 1, pooler ~400-700 ms per roundtrip).
  - Deteksi 3 frame dijalankan paralel (thread pool — onnxruntime aman
    dipanggil konkuren); ekstraksi embedding juga di thread pool.
  - Frame statis (foto/layar diam) ditolak dari diff piksel MURAH, tanpa
    deteksi wajah sama sekali.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import settings
from app.core.database import engine
from app.core.security import get_current_user
from app.services.face_service import FaceError, decode_image, embedding_of_face, embedding_to_string
from app.services.geoip_service import lookup_ip, resolve_client_ip
from app.services.liveness_service import analyze_images, check_analyzed_frames, frame_mean_diffs
from app.services.location_service import (
    evaluate_accuracy,
    match_and_evaluate_location,
    teleport_reason_from,
)
from app.services.log_service import log_attempt, log_success_background

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attendance", tags=["attendance"])

MIDDLE_FRAME_INDEX = 1


class AttendanceRequest(BaseModel):
    frames: list[str] = Field(
        min_length=3, max_length=5, description="3-5 frame base64 dari window liveness"
    )
    poses: list[str] = Field(
        min_length=3, max_length=5, description="Urutan pose challenge dari server"
    )
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    gps_accuracy: float | None = Field(default=None, ge=0)


class AttendanceResponse(BaseModel):
    status: str
    nama: str | None = None
    timestamp: str | None = None
    confidence: float | None = None
    message: str = ""
    reasons: list[str] = []


@router.post("/face-check", response_model=AttendanceResponse)
async def face_check(
    req: AttendanceRequest,
    request: Request,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> AttendanceResponse:
    """Verifikasi absen: liveness -> matching -> lokasi -> log."""
    user_id = user["sub"]
    t0 = time.perf_counter()
    user_agent = request.headers.get("user-agent")
    ip = resolve_client_ip(dict(request.headers), request.client.host if request.client else None)

    def step(name: str, t: float) -> None:
        logger.info("  [timing] %-14s %.0f ms", name, (time.perf_counter() - t) * 1000)
    # --- Decode frame (validasi base64+jpg) sebelum query DB -----------------
    try:
        imgs = [decode_image(base64.b64decode(f, validate=True)) for f in req.frames]
    except FaceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Salah satu frame bukan base64 valid") from exc
    if len(imgs) != len(req.poses):
        raise HTTPException(status_code=422, detail="Jumlah frame dan poses tidak sama")
    step("auth+parse+decode", t0)

    middle_idx = MIDDLE_FRAME_INDEX if len(imgs) > MIDDLE_FRAME_INDEX else 0
    middle_frame = base64.b64decode(req.frames[middle_idx])

    # --- SATU koneksi utk seluruh request ------------------------------------
    t_conn = time.perf_counter()
    async with engine.connect() as conn:
        step("connect", t_conn)
        # IP geolocation lookup (Sprint 3) — jaringan, berjalan paralel dengan
        # liveness/matching supaya tidak menambah critical path (NFR-1).
        geoip_task = asyncio.create_task(lookup_ip(ip, dict(request.headers)))

        # Frame statis: tolak dari diff piksel (tanpa deteksi wajah).
        diffs = frame_mean_diffs(imgs)
        static_min = min(diffs) if diffs else float("inf")
        is_static = static_min < settings.liveness_min_mean_diff

        if not is_static:
            liveness_future = asyncio.to_thread(analyze_images, imgs)

        if is_static:
            geoip_task.cancel()
            msg = (
                f"Frame terlalu identik (diff={static_min:.2f} < "
                f"{settings.liveness_min_mean_diff}) — indikasi foto statis / layar diam"
            )
            await log_attempt(
                conn, user_id, "rejected",
                rejection_reason="liveness: " + msg,
                ip_address=ip, user_agent=user_agent, evidence_image=middle_frame,
            )
            await conn.commit()
            raise HTTPException(
                status_code=403,
                detail={"message": "Pemeriksaan liveness gagal", "reasons": [msg]},
            )

        # --- Liveness: wajah + urutan pose challenge --------------------------
        t = time.perf_counter()
        analyzed = await liveness_future
        try:
            liveness = check_analyzed_frames(
                analyzed, min_mean_diff=settings.liveness_min_mean_diff,
                expected_poses=req.poses,
            )
        except FaceError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        step("liveness", t)

        if not liveness.passed:
            geoip_task.cancel()
            await log_attempt(
                conn, user_id, "rejected",
                rejection_reason="liveness: " + "; ".join(liveness.reasons),
                ip_address=ip, user_agent=user_agent, evidence_image=middle_frame,
            )
            await conn.commit()
            raise HTTPException(
                status_code=403,
                detail={"message": "Pemeriksaan liveness gagal", "reasons": liveness.reasons},
            )

        # --- Matching via pgvector + gate/rate-limit (SATU roundtrip DB) ------
        t_e = time.perf_counter()
        try:
            embedding = await asyncio.to_thread(embedding_of_face, analyzed[middle_idx][1][0])
        except FaceError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        emb_str = embedding_to_string(embedding)
        step("embedding", t_e)

        t4 = time.perf_counter()
        # Matching pgvector + GATE + SEMUA sinyal lokasi dalam SATU query
        # (NFR-1: pooler ~400-700 ms per roundtrip — query terpisah jadi Nx
        # lipat). Gate/rate-limit hasil query ikut dicocokkan di sini.
        # geoip_task harus selesai dulu (ip distance ada di query gabungan).
        ip_geo = await geoip_task
        best, signals = await match_and_evaluate_location(
            conn, user_id, req.lat, req.lng,
            ip_geo.lat if ip_geo else None, ip_geo.lng if ip_geo else None,
            emb_str,
        )
        step("match+gate+location", t4)

        # --- Gate: user terdaftar & status approved (dari query gabungan) -----
        if not signals.me_exists:
            raise HTTPException(status_code=404, detail="User tidak terdaftar")
        if signals.my_status != "approved":
            await log_attempt(
                conn, user_id, "rejected",
                rejection_reason=f"status_enrollment={signals.my_status}",
                ip_address=ip, user_agent=user_agent,
            )
            await conn.commit()
            raise HTTPException(
                status_code=403,
                detail="Wajah belum disetujui admin — absen tidak diizinkan",
            )

        # --- Rate limit (sebelum log sukses) ----------------------------------
        failures = int(signals.failures or 0)
        if failures >= settings.rate_limit_max_failures:
            t2 = time.perf_counter()
            first = await conn.execute(
                text(
                    "select timestamp from public.attendance_logs "
                    "where user_id = :uid and timestamp >= now() - make_interval(mins => :win) "
                    "and status in ('rejected', 'suspicious') "
                    "order by timestamp asc limit 1"
                ),
                {"uid": user_id, "win": settings.rate_limit_window_minutes},
            )
            first_ts = first.scalar()
            step("rate-limit detail", t2)
            if first_ts is not None:
                unblock = first_ts + timedelta(minutes=settings.rate_limit_block_minutes)
                now = datetime.now(timezone.utc)
                if unblock > now:
                    retry = int((unblock - now).total_seconds() // 60) + 1
                    await log_attempt(
                        conn, user_id, "rejected",
                        rejection_reason="blocked: terlalu banyak percobaan gagal",
                        ip_address=ip, user_agent=user_agent,
                    )
                    await conn.commit()
                    raise HTTPException(
                        status_code=429,
                        detail={
                            "message": "Terlalu banyak percobaan yang gagal. "
                            f"Coba lagi dalam {retry} menit.",
                            "retry_after_minutes": retry,
                        },
                    )

        t_match = time.perf_counter()
        sim = best["sim"] if best else 0.0
        match_ok = best is not None and sim >= settings.match_threshold

        if not match_ok:
            await log_attempt(
                conn, user_id, "rejected",
                rejection_reason=(
                    f"match: wajah tidak dikenal (best_sim={sim:.3f} < "
                    f"{settings.match_threshold})"
                ),
                confidence_score=sim, ip_address=ip, user_agent=user_agent,
                evidence_image=middle_frame,
            )
            await conn.commit()
            raise HTTPException(
                status_code=403,
                detail={"message": "Wajah tidak dikenali sistem", "reasons": [f"confidence {sim:.3f}"]},
            )

        if best["id"] != user_id:
            # Wajah dikenali sebagai user LAIN -> percobaan mencurigakan (spoofing)
            await log_attempt(
                conn, user_id, "suspicious",
                rejection_reason="match: wajah cocok dengan user lain",
                confidence_score=sim, ip_address=ip, user_agent=user_agent,
                evidence_image=middle_frame,
            )
            await conn.commit()
            raise HTTPException(
                status_code=403,
                detail={"message": "Wajah tidak sesuai akun yang login", "reasons": ["identity mismatch"]},
            )

        # --- Lokasi (Sprint 3, multi-signal): geofence, IP cross-check, teleport
        # Sinyal sudah dihitung di query gabungan (match+location) di atas.
        suspicious_reasons: list[str] = []
        ip_mismatch = False
        if req.lat is not None and req.lng is not None:
            # 3.3 Geofence PostGIS (ST_DWithin) — aktif hanya bila ada lokasi.
            if signals.has_geofences and not signals.inside:
                await log_attempt(
                    conn, user_id, "rejected", rejection_reason="location: di luar geofence",
                    confidence_score=sim, lat=req.lat, lng=req.lng,
                    gps_accuracy=req.gps_accuracy, ip_address=ip, user_agent=user_agent,
                    evidence_image=middle_frame,
                )
                await conn.commit()
                raise HTTPException(
                    status_code=403,
                    detail={"message": "Lokasi di luar area absen yang diizinkan", "reasons": ["outside geofence"]},
                )

            # 3.4 Flag suspicious (FR-2.6) — bukan reject: absen diterima,
            # status log 'suspicious' utk review admin.
            suspicious_reasons = list(evaluate_accuracy(req.gps_accuracy))
            if signals.ip_dist_m is not None and signals.ip_dist_m / 1000.0 > settings.geoip_mismatch_km:
                ip_mismatch = True
                suspicious_reasons.append(
                    f"ip mismatch GPS-vs-IP {signals.ip_dist_m / 1000.0:.0f} km"
                )

            # 3.5 Anomali teleport (FR-2.7) — reject bila jarak/waktu tidak
            # masuk akal (jarak prev sudah dihitung PostGIS di query gabungan).
            if signals.prev_dist_m is not None and signals.prev_ts is not None:
                tp = teleport_reason_from(signals.prev_ts, signals.prev_dist_m)
                if tp is not None:
                    await log_attempt(
                        conn, user_id, "rejected", rejection_reason="location: " + tp,
                        confidence_score=sim, lat=req.lat, lng=req.lng,
                        gps_accuracy=req.gps_accuracy, ip_address=ip, user_agent=user_agent,
                        evidence_image=middle_frame,
                    )
                    await conn.commit()
                    raise HTTPException(
                        status_code=403,
                        detail={"message": "Lokasi tidak masuk akal (anomali teleport)", "reasons": [tp]},
                    )
        elif signals.has_geofences:
            # 3.3 Area absen aktif tapi client tidak mengirim lokasi (permission
            # ditolak / GPS gagal) -> tidak bisa diverifikasi -> reject.
            await log_attempt(
                conn, user_id, "rejected", rejection_reason="location: lokasi tidak tersedia",
                confidence_score=sim, ip_address=ip, user_agent=user_agent,
                evidence_image=middle_frame,
            )
            await conn.commit()
            raise HTTPException(
                status_code=403,
                detail={"message": "Lokasi tidak tersedia — area absen aktif wajib mengirim lokasi", "reasons": ["location unavailable"]},
            )

        # --- Log sukses / suspicious-diterima (background, critical path NFR-1)
        log_status = "suspicious" if suspicious_reasons else "success"
        log_reason = "location: " + "; ".join(suspicious_reasons) if suspicious_reasons else None
        asyncio.create_task(
            log_success_background(
                user_id, sim, req.lat, req.lng, req.gps_accuracy, ip, user_agent,
                ip_geo_lat=ip_geo.lat if ip_geo else None,
                ip_geo_lng=ip_geo.lng if ip_geo else None,
                ip_mismatch_flag=ip_mismatch,
                status=log_status,
                rejection_reason=log_reason,
            )
        )
        ts = datetime.now(timezone.utc).isoformat()
        step("log+prepare", t_match)

    elapsed = time.perf_counter() - t0
    logger.info("Absen %s user=%s sim=%.3f dalam %.1f dtk", log_status, user_id, sim, elapsed)
    return AttendanceResponse(
        status="success",
        nama=best["nama"],
        timestamp=ts,
        confidence=sim,
        message=(
            "Absensi berhasil dicatat"
            if log_status == "success"
            else "Absensi dicatat — lokasi mencurigakan, menunggu review admin"
        ),
    )


class MyLogRow(BaseModel):
    id: str
    timestamp: str
    status: str
    location_name: str | None = None
    confidence: float | None = None
    reasons: list[str] = []


class MyLogPage(BaseModel):
    logs: list[MyLogRow]
    total: int
    page: int
    page_size: int


@router.get("/logs/mine", response_model=MyLogPage)
async def my_attendance_logs(
    month: str | None = None,
    page: int = 1,
    page_size: int = 20,
    user: Annotated[dict[str, Any], Depends(get_current_user)] = None,
) -> MyLogPage:
    """Riwayat absen user sendiri (FR-2.8 user view): filter bulan + pagination.

    Hanya log milik user yang login — dijamin oleh filter user_id di query
    (backend memakai service role, sehingga RLS tidak bisa diandalkan).
    """
    page = max(1, page)
    page_size = min(50, max(1, page_size))
    user_id = user["sub"]

    month_start: str | None = None
    month_end: str | None = None
    if month:
        try:
            y, m = (int(x) for x in month.split("-"))
            month_start = f"{y:04d}-{m:02d}-01"
            if m == 12:
                month_end = f"{y + 1:04d}-01-01"
            else:
                month_end = f"{y:04d}-{m + 1:02d}-01"
        except ValueError:
            month_start = None

    clauses = ["al.user_id = :user_id"]
    params: dict[str, object] = {"user_id": user_id}
    if month_start and month_end:
        clauses.append("al.timestamp >= cast(:month_start as timestamptz)")
        clauses.append("al.timestamp < cast(:month_end as timestamptz)")
        params["month_start"] = month_start
        params["month_end"] = month_end
    where = " and ".join(clauses)
    offset = (page - 1) * page_size

    site_select = (
        "(select l.nama_site from public.locations l "
        "where l.geom is not null and al.lat is not null and al.lng is not null "
        "and st_dwithin(l.geom, "
        "st_setsrid(st_makepoint(al.lng, al.lat), 4326)::geography, "
        "l.radius_meter) "
        "order by st_distance(l.geom, "
        "st_setsrid(st_makepoint(al.lng, al.lat), 4326)::geography) "
        "limit 1) as site"
    )

    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "select al.id::text, al.timestamp::text, al.status, "
                "al.confidence_score, al.rejection_reason, "
                + site_select + ", count(*) over () as total_count "
                "from public.attendance_logs al "
                "where " + where + " "
                "order by al.timestamp desc "
                "limit :limit offset :offset"
            ),
            {**params, "limit": page_size, "offset": offset},
        )
        mapped = rows.mappings().all()

    total = int(mapped[0]["total_count"]) if mapped else 0
    logs: list[MyLogRow] = []
    for r in mapped:
        reason_raw = r["rejection_reason"]
        reasons: list[str] = []
        if reason_raw:
            reasons = [
                p.strip()
                for p in reason_raw.split(";")
                if p.strip()
            ]
        logs.append(
            MyLogRow(
                id=r["id"],
                timestamp=r["timestamp"],
                status=r["status"],
                location_name=r["site"],
                confidence=r["confidence_score"],
                reasons=reasons,
            )
        )
    return MyLogPage(logs=logs, total=total, page=page, page_size=page_size)
