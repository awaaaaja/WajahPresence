"""Attendance logging — mencatat SEMUA percobaan absen (FR-2.8, Prompt 2.3).

Setiap cabang alur wajib menulis log: liveness gagal, matching gagal,
lokasi gagal, diblokir, dan sukses — lengkap dengan rejection_reason spesifik
dan foto bukti (khusus kasus gagal/mencurigakan, NFR-5: retention 90 hari).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import settings
from app.core.database import engine
from app.services.storage_service import (
    StorageError,
    delete_file,
    list_files,
    upload_file,
)

logger = logging.getLogger(__name__)

# Foto bukti disimpan hanya untuk status non-success (audit kasus gagal/
# mencurigakan — NFR-5 retention 90 hari berlaku di sana; sukses sudah
# punya referensi embedding di face_embeddings).
STATUS_WITH_EVIDENCE = {"rejected", "suspicious"}


async def _upload_evidence(user_id: str, image_bytes: bytes) -> str | None:
    path = f"{user_id}/{int(time.time() * 1000)}.jpg"
    try:
        await upload_file(
            settings.storage_attendance_bucket, path, image_bytes, "image/jpeg"
        )
        return path
    except StorageError:
        logger.exception("Gagal upload foto bukti absen user=%s", user_id)
        return None


async def log_attempt(
    conn: AsyncConnection,
    user_id: str | None,
    status: str,
    rejection_reason: str | None = None,
    confidence_score: float | None = None,
    lat: float | None = None,
    lng: float | None = None,
    gps_accuracy: float | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    ip_geo_lat: float | None = None,
    ip_geo_lng: float | None = None,
    ip_mismatch_flag: bool = False,
    evidence_image: bytes | None = None,
) -> dict[str, Any]:
    """Tulis satu baris attendance_logs memakai koneksi yang DIBERIKAN.

    Menerima koneksi dari pemanggil (bukan membuat sendiri) agar semua query
    dalam satu request berjalan di koneksi yang sama — menghindari overhead
    handshake ulang per query (NFR-1).
    """
    photo_path = None
    if evidence_image is not None and status in STATUS_WITH_EVIDENCE:
        photo_path = await _upload_evidence(user_id or "unknown", evidence_image)

    # cosine similarity bisa negatif; kolom DB check between 0 and 1.
    conf = (
        min(1.0, max(0.0, confidence_score))
        if confidence_score is not None
        else None
    )
    result = await conn.execute(
        text(
            "insert into public.attendance_logs "
            "(user_id, timestamp, status, confidence_score, lat, lng, "
            " gps_accuracy, ip_address, ip_geolocation_lat, ip_geolocation_lng, "
            " ip_mismatch_flag, photo_capture_url, user_agent, rejection_reason) "
            "values (:uid, now(), :status, :conf, :lat, :lng, :acc, :ip, "
            ":ipglat, :ipglng, :ipmm, :photo, :ua, :reason) "
            "returning id::text, timestamp::text"
        ),
        {
            "uid": user_id,
            "status": status,
            "conf": conf,
            "lat": lat,
            "lng": lng,
            "acc": gps_accuracy,
            "ip": ip_address,
            "ipglat": ip_geo_lat,
            "ipglng": ip_geo_lng,
            "ipmm": ip_mismatch_flag,
            "photo": photo_path,
            "ua": user_agent,
            "reason": rejection_reason,
        },
    )
    row = result.mappings().first()
    log_id = row["id"] if row else None
    timestamp = row["timestamp"] if row else datetime.now(timezone.utc).isoformat()

    logger.info(
        "Attendance log user=%s status=%s reason=%s conf=%s",
        user_id, status, rejection_reason, confidence_score,
    )
    return {"id": log_id, "timestamp": timestamp, "status": status}


async def log_success_background(
    user_id: str,
    confidence_score: float | None = None,
    lat: float | None = None,
    lng: float | None = None,
    gps_accuracy: float | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    ip_geo_lat: float | None = None,
    ip_geo_lng: float | None = None,
    ip_mismatch_flag: bool = False,
    status: str = "success",
    rejection_reason: str | None = None,
) -> None:
    """Tulis log absen di background (koneksi sendiri) — dipakai untuk status
    'success' maupun 'suspicious' yang DITERIMA (FR-2.6: flag, bukan reject).

    Critical path absen (NFR-1) tidak menunggu roundtrip insert+commit
    (~0.6-1.6 dtk via pooler). Log REJECTED tetap sinkron karena dipakai
    rate limiter; log suspicious yang diterima tidak memblokir apa pun.
    """
    try:
        async with engine.begin() as conn:
            await log_attempt(
                conn, user_id, status, rejection_reason=rejection_reason,
                confidence_score=confidence_score,
                lat=lat, lng=lng, gps_accuracy=gps_accuracy,
                ip_address=ip_address, user_agent=user_agent,
                ip_geo_lat=ip_geo_lat, ip_geo_lng=ip_geo_lng,
                ip_mismatch_flag=ip_mismatch_flag,
            )
    except Exception:  # noqa: BLE001 - jangan sampai request gagal krn log
        logger.exception("Gagal menulis log %s di background (user=%s)", status, user_id)


async def cleanup_expired_evidence() -> dict[str, int]:
    """Retention policy (NFR-5): hapus foto bukti absen yang lebih tua dari
    `evidence_retention_days` hari dari bucket `attendance-evidence`.

    Log baris TETAP tersimpan (audit), hanya objek foto yang dihapus —
    sesuai PRD: "foto capture absensi disimpan maksimal 90 hari (dikonfigurasi)".
    Dipanggil berkala oleh background task di main.py.

    Returns:
        dict {deleted, skipped, error} untuk log & test.
    """
    cutoff = datetime.now(timezone.utc).timestamp() - settings.evidence_retention_days * 86400
    deleted = 0
    skipped = 0
    errors = 0
    try:
        files = await list_files(settings.storage_attendance_bucket)
    except StorageError:
        logger.exception("Retention: gagal list bucket %s", settings.storage_attendance_bucket)
        return {"deleted": 0, "skipped": 0, "error": 1}

    for name, updated_at in files:
        try:
            if updated_at is None:
                # Tidak ada metadata waktu -> tidak bisa diputuskan, skip.
                skipped += 1
                continue
            age_s = cutoff - _parse_ts(updated_at)
            if age_s > 0:
                await delete_file(settings.storage_attendance_bucket, name)
                deleted += 1
            else:
                skipped += 1
        except (StorageError, ValueError):
            errors += 1
            logger.exception("Retention: gagal proses file %s", name)
    if deleted:
        logger.info("Retention: hapus %d foto evidence > %d hari (skip %d, error %d)",
                    deleted, settings.evidence_retention_days, skipped, errors)
    return {"deleted": deleted, "skipped": skipped, "error": errors}


def _parse_ts(value: str) -> float:
    """ISO8601 dari storage API -> epoch (s). Format: 2026-07-01T08:00:00.000Z."""
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
