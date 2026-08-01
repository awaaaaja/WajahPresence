"""Router admin — Prompt 1.6.

Akses dibatasi untuk role admin/superadmin (dicek server-side dari tabel
users, memakai koneksi service role — tidak mempercayai klaim dari client).
Foto sample privat ditampilkan via signed URL (bukan URL publik).
"""

from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.security import get_current_user
from app.services.log_export import build_pdf, build_xlsx
from app.services.storage_service import StorageError, delete_file, get_signed_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

# Cache role admin per user (TTL 60 dtk) — lihat get_current_admin.
_ADMIN_ROLE_CACHE: dict[str, tuple[int, bool]] = {}
_ADMIN_ROLE_TTL_MS = 60_000


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


class UserSummary(BaseModel):
    id: str
    nama: str
    email: str
    role: str
    status_enrollment: str
    rejection_reason: str | None = None
    created_at: str
    sample_count: int = 0


class FaceSample(BaseModel):
    angle: str
    photo_url: str | None = None
    signed_url: str | None = None
    created_at: str


class UserDetail(BaseModel):
    id: str
    nama: str
    email: str
    nim_nip: str | None = None
    role: str
    status_enrollment: str
    rejection_reason: str | None = None
    created_at: str
    samples: list[FaceSample]
    consents: list[dict[str, str]]


class DecisionRequest(BaseModel):
    approved: bool
    reason: str | None = Field(default=None, max_length=500)


class DecisionResponse(BaseModel):
    user_id: str
    status_enrollment: str


async def get_current_admin(user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    """Dependency: user yang sedang login harus admin/superadmin.

    Role di-cache 60 dtk per user (TTL) utk menghemat 1 roundtrip pooler
    (~1 dtk) per request — dashboard admin biasa memuat banyak data.
    """
    uid = user["sub"]
    cached = _ADMIN_ROLE_CACHE.get(uid)
    if cached is not None and cached[0] > _now_ms() - _ADMIN_ROLE_TTL_MS:
        if cached[1]:
            return user
        raise HTTPException(status_code=403, detail="Butuh role admin")

    async with engine.connect() as conn:
        result = await conn.execute(
            text("select role from public.users where id = :uid"),
            {"uid": uid},
        )
        role = result.scalar()
    is_admin = role in ("admin", "superadmin")
    _ADMIN_ROLE_CACHE[uid] = (_now_ms(), is_admin)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Butuh role admin")
    return user


@router.get("/users", response_model=list[UserSummary])
async def list_users(
    status: str | None = None,
    q: str | None = None,
    _admin: dict = Depends(get_current_admin),
) -> list[UserSummary]:
    """List user dengan status enrollment; filter ?status= & ?q= (nama/email)."""
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "select u.id::text, u.nama, u.email, u.role, u.status_enrollment, "
                "       u.rejection_reason, u.created_at::text, "
                "       (select count(*) from public.face_embeddings fe "
                "         where fe.user_id = u.id) as sample_count "
                "from public.users u "
                "where (cast(:status as text) is null or u.status_enrollment = :status) "
                "and (cast(:q as text) is null or u.nama ilike '%' || :q || '%' "
                "     or u.email ilike '%' || :q || '%') "
                "order by u.created_at desc"
            ),
            {"status": status, "q": q},
        )
        return [UserSummary(**dict(r._mapping)) for r in rows]


@router.get("/users/{user_id}", response_model=UserDetail)
async def get_user_detail(
    user_id: str,
    _admin: dict = Depends(get_current_admin),
) -> UserDetail:
    """Detail user + 5 foto sample (signed URL) + riwayat consent."""
    async with engine.connect() as conn:
        user_row = await conn.execute(
            text(
                "select u.id::text, u.nama, u.email, u.nim_nip, u.role, u.status_enrollment, "
                "       u.rejection_reason, u.created_at::text "
                "from public.users u where u.id = :uid"
            ),
            {"uid": user_id},
        )
        row = user_row.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="User tidak ditemukan")

        sample_rows = await conn.execute(
            text(
                "select sample_angle, photo_url, created_at::text "
                "from public.face_embeddings where user_id = :uid "
                "order by created_at"
            ),
            {"uid": user_id},
        )
        consent_rows = await conn.execute(
            text(
                "select policy_version, accepted_at::text "
                "from public.biometric_consents where user_id = :uid "
                "order by accepted_at desc"
            ),
            {"uid": user_id},
        )

    samples: list[FaceSample] = []
    for s in sample_rows.mappings():
        signed = None
        if s["photo_url"]:
            try:
                signed = await get_signed_url("face-samples", s["photo_url"], expires_in=3600)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gagal signed URL %s: %s", s["photo_url"], exc)
        samples.append(
            FaceSample(
                angle=s["sample_angle"],
                photo_url=s["photo_url"],
                signed_url=signed,
                created_at=s["created_at"],
            )
        )

    return UserDetail(
        id=row["id"],
        nama=row["nama"],
        email=row["email"],
        nim_nip=row["nim_nip"],
        role=row["role"],
        status_enrollment=row["status_enrollment"],
        rejection_reason=row["rejection_reason"],
        created_at=row["created_at"],
        samples=samples,
        consents=[
            {"policy_version": c["policy_version"], "accepted_at": c["accepted_at"]}
            for c in consent_rows.mappings()
        ],
    )


@router.post("/users/{user_id}/decision", response_model=DecisionResponse)
async def decide_enrollment(
    user_id: str,
    req: DecisionRequest,
    _admin: dict = Depends(get_current_admin),
) -> DecisionResponse:
    """Approve/reject registrasi wajah user (status pending -> approved/rejected)."""
    if req.approved and req.reason:
        raise HTTPException(
            status_code=422, detail="Alasan reject hanya untuk status rejected"
        )
    new_status = "approved" if req.approved else "rejected"

    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "update public.users "
                "set status_enrollment = :status, rejection_reason = :reason "
                "where id = :uid and status_enrollment = 'pending' "
                "returning id"
            ),
            {"status": new_status, "reason": req.reason if not req.approved else None, "uid": user_id},
        )
        if result.scalar() is None:
            raise HTTPException(
                status_code=409, detail="User tidak dalam status pending (sudah diputuskan)"
            )

    logger.info("Admin decision user=%s -> %s", user_id, new_status)
    return DecisionResponse(user_id=user_id, status_enrollment=new_status)


class ReEnrollResponse(BaseModel):
    user_id: str
    status_enrollment: str
    deleted_embeddings: int
    deleted_photos: int


@router.post("/users/{user_id}/re-enroll", response_model=ReEnrollResponse)
async def re_enroll_user(
    user_id: str,
    _admin: dict = Depends(get_current_admin),
) -> ReEnrollResponse:
    """Hapus embedding lama + foto sample utk registrasi ulang (Prompt 4.1).

    Wajib lewat backend (bukan client SDK) karena tabel face_embeddings
    tertutup total dari client (RLS) dan storage sample bersifat privat.
    """
    async with engine.connect() as conn:
        photo_rows = await conn.execute(
            text("select photo_url from public.face_embeddings where user_id = :uid"),
            {"uid": user_id},
        )
        photo_paths = [r[0] for r in photo_rows if r[0]]

    deleted_photos = 0
    for path in photo_paths:
        try:
            await delete_file(settings.storage_face_bucket, path)
            deleted_photos += 1
        except StorageError as exc:
            # Foto yang gagal dihapus jangan memblokir re-enroll; path DB
            # tetap dihapus supaya tidak menumpuk embedding usang.
            logger.warning("Gagal hapus foto sample %s: %s", path, exc)

    async with engine.begin() as conn:
        deleted = await conn.execute(
            text("delete from public.face_embeddings where user_id = :uid returning id"),
            {"uid": user_id},
        )
        n_emb = len(deleted.fetchall())
        await conn.execute(
            text(
                "update public.users "
                "set status_enrollment = 'not_enrolled', rejection_reason = null "
                "where id = :uid"
            ),
            {"uid": user_id},
        )

    logger.info("Re-enroll user=%s: %d embedding, %d foto dihapus", user_id, n_emb, deleted_photos)
    return ReEnrollResponse(
        user_id=user_id, status_enrollment="not_enrolled",
        deleted_embeddings=n_emb, deleted_photos=deleted_photos,
    )


# ---------------------------------------------------------------------------
# Log absensi (Sprint 4, Prompt 4.2/4.3/4.5)
# ---------------------------------------------------------------------------

LOG_SELECT_COLS = (
    "al.id::text, al.timestamp::text, u.nama, u.email, al.status, "
    "al.confidence_score, al.lat, al.lng, al.gps_accuracy, "
    "al.ip_address::text, al.ip_mismatch_flag, al.rejection_reason, "
    "al.reviewed_at::text, al.reviewed_by::text, al.review_note, "
    "al.photo_capture_url, al.user_agent, "
    "al.ip_geolocation_lat, al.ip_geolocation_lng"
)


def _log_filters(
    start_date: str | None = None,
    end_date: str | None = None,
    user: str | None = None,
    status: str | None = None,
    site: str | None = None,
    reviewed: str | None = None,
    only_located: bool = False,
) -> tuple[list[str], dict[str, object]]:
    clauses: list[str] = []
    params: dict[str, object] = {}
    if start_date:
        clauses.append("al.timestamp >= cast(cast(:start_date as text) as timestamptz)")
        params["start_date"] = start_date
    if end_date:
        clauses.append("al.timestamp < cast(cast(:end_date as text) as timestamptz) + interval '1 day'")
        params["end_date"] = end_date
    if user:
        clauses.append("(u.nama ilike '%' || :user || '%' or u.email ilike '%' || :user || '%')")
        params["user"] = user
    if status:
        clauses.append("al.status = :status")
        params["status"] = status
    if site:
        clauses.append(
            "exists (select 1 from public.locations l "
            "where l.nama_site = :site "
            "and al.lat is not null and al.lng is not null "
            "and st_dwithin(l.geom, "
            "st_setsrid(st_makepoint(al.lng, al.lat), 4326)::geography, "
            "l.radius_meter))"
        )
        params["site"] = site
    if reviewed == "true":
        clauses.append("al.reviewed_at is not null")
    elif reviewed == "false":
        clauses.append("al.reviewed_at is null")
    if only_located:
        clauses.append("al.lat is not null and al.lng is not null")
    return clauses, params


class LogRow(BaseModel):
    id: str
    timestamp: str
    nama: str | None = None
    email: str | None = None
    status: str
    confidence_score: float | None = None
    lat: float | None = None
    lng: float | None = None
    site: str | None = None
    gps_accuracy: float | None = None
    ip_address: str | None = None
    ip_mismatch_flag: bool = False
    rejection_reason: str | None = None
    reviewed_at: str | None = None
    reviewed_by: str | None = None
    review_note: str | None = None


class LogPage(BaseModel):
    items: list[LogRow]
    total: int
    page: int
    page_size: int


class LogDetail(LogRow):
    photo_capture_url: str | None = None
    photo_signed_url: str | None = None
    user_agent: str | None = None
    ip_geolocation_lat: float | None = None
    ip_geolocation_lng: float | None = None


@router.get("/logs", response_model=LogPage)
async def list_logs(
    start_date: str | None = None,
    end_date: str | None = None,
    user: str | None = None,
    status: str | None = None,
    site: str | None = None,
    reviewed: str | None = None,
    only_located: bool = False,
    page: int = 1,
    page_size: int = 50,
    _admin: dict = Depends(get_current_admin),
) -> LogPage:
    """List log absensi server-side: filter + pagination (Prompt 4.2).

    Site diturunkan dari lat/lng terhadap tabel locations (geofence), jadi
    tidak butuh kolom site_id di attendance_logs.
    """
    page = max(1, page)
    page_size = min(200, max(1, page_size))
    clauses, params = _log_filters(
        start_date, end_date, user, status, site, reviewed, only_located
    )
    where = ("where " + " and ".join(clauses)) if clauses else ""
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

    # SATU roundtrip utk count + halaman (count(*) over () = total keseluruhan
    # sebelum limit/offset). 2 query berurutan = 2x latensi pooler (~1 dtk).
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "select " + LOG_SELECT_COLS + ", " + site_select + ", "
                "count(*) over () as total_count "
                "from public.attendance_logs al "
                "left join public.users u on u.id = al.user_id " + where + " "
                "order by al.timestamp desc "
                "limit :limit offset :offset"
            ),
            {**params, "limit": page_size, "offset": offset},
        )
        mapped = rows.mappings().all()

    total = int(mapped[0]["total_count"]) if mapped else 0
    items = []
    for r in mapped:
        d = dict(r)
        d.pop("photo_capture_url")
        d.pop("user_agent")
        d.pop("ip_geolocation_lat")
        d.pop("ip_geolocation_lng")
        d.pop("total_count")
        items.append(LogRow(**d))
    return LogPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/logs/export")
async def export_logs(
    format: Literal["xlsx", "pdf"] = "xlsx",
    start_date: str | None = None,
    end_date: str | None = None,
    user: str | None = None,
    status: str | None = None,
    site: str | None = None,
    _admin: dict = Depends(get_current_admin),
) -> Response:
    """Export laporan mengikuti filter aktif (Prompt 4.5). Cap 50.000 baris.

    Dideklarasikan SEBELUM /logs/{log_id} supaya path 'export' tidak tertangkap
    sebagai log_id.
    """
    clauses, params = _log_filters(start_date, end_date, user, status, site)
    where = ("where " + " and ".join(clauses)) if clauses else ""
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
                "select " + LOG_SELECT_COLS + ", " + site_select + " "
                "from public.attendance_logs al "
                "left join public.users u on u.id = al.user_id " + where + " "
                "order by al.timestamp desc "
                "limit 50000"
            ),
            params,
        )
        data = [dict(r) for r in rows.mappings()]

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    title = "Laporan Absensi"
    if format == "xlsx":
        content = build_xlsx(data, title)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"laporan_absensi_{stamp}.xlsx"
    else:
        content = build_pdf(data, title)
        media = "application/pdf"
        filename = f"laporan_absensi_{stamp}.pdf"

    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/logs/{log_id}", response_model=LogDetail)
async def get_log_detail(
    log_id: str,
    _admin: dict = Depends(get_current_admin),
) -> LogDetail:
    """Detail log: foto bukti via signed URL + semua sinyal lokasi (4.3)."""
    async with engine.connect() as conn:
        row = await conn.execute(
            text(
                "select " + LOG_SELECT_COLS + " "
                "from public.attendance_logs al "
                "left join public.users u on u.id = al.user_id "
                "where al.id = :lid"
            ),
            {"lid": log_id},
        )
        m = row.mappings().first()
        if m is None:
            raise HTTPException(status_code=404, detail="Log tidak ditemukan")

    signed = None
    if m["photo_capture_url"]:
        try:
            signed = await get_signed_url(
                settings.storage_attendance_bucket, m["photo_capture_url"], expires_in=3600
            )
        except StorageError as exc:
            logger.warning("Gagal signed URL foto bukti %s: %s", m["photo_capture_url"], exc)

    return LogDetail(
        id=m["id"], timestamp=m["timestamp"], nama=m["nama"], email=m["email"],
        status=m["status"], confidence_score=m["confidence_score"],
        lat=m["lat"], lng=m["lng"], gps_accuracy=m["gps_accuracy"],
        ip_address=m["ip_address"], ip_mismatch_flag=m["ip_mismatch_flag"],
        rejection_reason=m["rejection_reason"], reviewed_at=m["reviewed_at"],
        reviewed_by=m["reviewed_by"], review_note=m["review_note"],
        photo_capture_url=m["photo_capture_url"], photo_signed_url=signed,
        user_agent=m["user_agent"],
        ip_geolocation_lat=m["ip_geolocation_lat"],
        ip_geolocation_lng=m["ip_geolocation_lng"],
    )


class ReviewRequest(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class ReviewResponse(BaseModel):
    id: str
    reviewed_at: str
    reviewed_by: str
    review_note: str | None


@router.post("/logs/{log_id}/review", response_model=ReviewResponse)
async def review_log(
    log_id: str,
    req: ReviewRequest,
    admin: dict = Depends(get_current_admin),
) -> ReviewResponse:
    """Tandai log (biasanya suspicious) sudah direview admin + catatan manual."""
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "update public.attendance_logs "
                "set reviewed_at = now(), reviewed_by = :admin_id, review_note = :note "
                "where id = :lid "
                "returning reviewed_at::text, reviewed_by::text"
            ),
            {"admin_id": admin["sub"], "note": req.note, "lid": log_id},
        )
        row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Log tidak ditemukan")
    logger.info("Admin %s mereview log %s", admin["sub"], log_id)
    return ReviewResponse(
        id=log_id,
        reviewed_at=row["reviewed_at"],
        reviewed_by=row["reviewed_by"],
        review_note=req.note,
    )
