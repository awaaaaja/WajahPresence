"""Router enrollment wajah — Prompt 1.4 (security-critical).

Alur: consent tercatat -> 5 sample diterima -> embedding tiap sample ->
deduplikasi via pgvector (terhadap SEMUA user lain) -> simpan embedding +
foto ke Supabase Storage (bucket privat, service role) -> status "pending".
"""

from __future__ import annotations

import base64
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.security import get_current_user
from app.schemas.face import (
    ConsentRequest,
    ConsentResponse,
    EnrollmentRequest,
    EnrollmentResponse,
)
from app.services.face_service import (
    FaceError,
    cosine_similarity,
    embedding_to_string,
    extract_embedding,
)
from app.services.storage_service import (
    StorageError,
    ensure_bucket,
    upload_file,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enrollment", tags=["enrollment"])

CONSENT_POLICY_VERSION = "2026-08-01-v1"


@router.post("/consent", response_model=ConsentResponse)
async def record_consent(
    req: ConsentRequest,
    user: dict = Depends(get_current_user),
) -> ConsentResponse:
    """Catat persetujuan data biometrik (NFR-4) — wajib sebelum enrollment."""
    user_id = user["sub"]
    email = user.get("email") or ""
    try:
        async with engine.begin() as conn:
            # Pastikan row public.users ada (FK consent -> users); nama diisi saat enrollment
            await conn.execute(
                text(
                    "insert into public.users (id, nama, email, status_enrollment) "
                    "values (:uid, :nama, :email, 'not_enrolled') "
                    "on conflict (id) do nothing"
                ),
                {"uid": user_id, "nama": email.split("@")[0], "email": email},
            )
            row = await conn.execute(
                text(
                    "insert into public.biometric_consents (user_id, policy_version) "
                    "values (:uid, :version) returning accepted_at::text"
                ),
                {"uid": user_id, "version": req.policy_version},
            )
            accepted_at = row.scalar()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gagal mencatat consent")
        raise HTTPException(status_code=500, detail="Gagal menyimpan consent") from exc

    return ConsentResponse(
        accepted=True, policy_version=req.policy_version, accepted_at=accepted_at or "now"
    )


async def _has_consent(user_id: str) -> bool:
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "select 1 from public.biometric_consents "
                "where user_id = :uid limit 1"
            ),
            {"uid": user_id},
        )
        return result.scalar() is not None


async def _find_duplicate(embedding_str: str, exclude_user_id: str) -> float | None:
    """Cari embedding user LAIN yang mirip dengan embedding ini (cosine)."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "select 1 - (embedding <=> cast(:emb as vector)) as sim "
                "from public.face_embeddings "
                "where user_id <> :uid "
                "order by embedding <=> cast(:emb as vector) "
                "limit 1"
            ),
            {"emb": embedding_str, "uid": exclude_user_id},
        )
        return result.scalar()


@router.post("", response_model=EnrollmentResponse)
async def enroll(
    req: EnrollmentRequest,
    user: dict = Depends(get_current_user),
) -> EnrollmentResponse:
    """Registrasi wajah 5 sudut dengan deduplikasi antar user."""
    user_id = user["sub"]
    email = user.get("email") or ""

    if not await _has_consent(user_id):
        raise HTTPException(
            status_code=409,
            detail="Persetujuan data biometrik (consent) belum tercatat",
        )

    # Cek: user sudah pernah enroll?
    async with engine.connect() as conn:
        existing = await conn.execute(
            text("select count(*) from public.face_embeddings where user_id = :uid"),
            {"uid": user_id},
        )
        if existing.scalar() > 0:
            raise HTTPException(
                status_code=409, detail="User ini sudah pernah melakukan registrasi wajah"
            )

    # 1) Ekstrak embedding tiap sample + simpan foto untuk upload
    embeddings: list[str] = []
    photos: list[tuple[str, bytes]] = []
    start_total = time.perf_counter()

    for sample in req.samples:
        try:
            image_bytes = base64.b64decode(sample.image_base64, validate=True)
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Sample {sample.angle}: base64 tidak valid"
            ) from exc
        try:
            embedding = extract_embedding(image_bytes)
        except FaceError as exc:
            raise HTTPException(
                status_code=422, detail=f"Sample {sample.angle}: {exc}"
            ) from exc
        embeddings.append(embedding_to_string(embedding))
        photos.append((f"{user_id}/{sample.angle}.jpg", image_bytes))

    # 2) Deduplikasi wajah terhadap SEMUA user lain (FR-1.3)
    for i, sample in enumerate(req.samples):
        sim = await _find_duplicate(embeddings[i], exclude_user_id=user_id)
        if sim is not None and sim >= settings.match_threshold:
            logger.info("Dedup REJECT user=%s pada sample %s (sim=%.3f)", user_id, sample.angle, sim)
            raise HTTPException(
                status_code=409,
                # Pesan tidak membocorkan identitas user lain yang match (privasi)
                detail="Wajah ini sudah terdaftar untuk akun lain",
            )

    # 3) Simpan foto + embedding, set status pending
    try:
        await ensure_bucket(settings.storage_face_bucket, public=False)
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "insert into public.users (id, nama, nim_nip, email, status_enrollment) "
                    "values (:uid, :nama, :nim_nip, :email, 'pending') "
                    "on conflict (id) do update "
                    "set nama = :nama, nim_nip = :nim_nip, status_enrollment = 'pending'"
                ),
                {
                    "uid": user_id,
                    "nama": req.nama,
                    "nim_nip": req.nim_nip,
                    "email": email,
                },
            )
            for i, sample in enumerate(req.samples):
                photo_path = f"{user_id}/{sample.angle}.jpg"
                await upload_file(
                    settings.storage_face_bucket, photo_path, photos[i][1], "image/jpeg"
                )
                await conn.execute(
                    text(
                        "insert into public.face_embeddings "
                        "(user_id, embedding, sample_angle, photo_url) "
                        "values (:uid, cast(:emb as vector), :angle, :url)"
                    ),
                    {
                        "uid": user_id,
                        "emb": embeddings[i],
                        "angle": sample.angle,
                        "url": photo_path,
                    },
                )
    except StorageError as exc:
        logger.error("Gagal upload storage saat enroll: %s", exc)
        raise HTTPException(status_code=500, detail="Gagal menyimpan foto sample") from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gagal simpan data enrollment")
        raise HTTPException(status_code=500, detail="Gagal menyimpan data enrollment") from exc

    elapsed = time.perf_counter() - start_total
    logger.info(
        "Enrollment SUKSES user=%s, 5 embedding, storage upload, %.1f dtk", user_id, elapsed
    )
    return EnrollmentResponse(
        status="pending",
        message="Registrasi wajah diterima. Menunggu persetujuan admin.",
    )
