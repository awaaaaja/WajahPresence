"""Entry point aplikasi FastAPI — skeleton Sprint 0."""

import asyncio
import logging
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.routers import admin, attendance, auth, enrollment, face, health, liveness
from app.services.storage_service import StorageError, ensure_bucket

logger = logging.getLogger(__name__)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def _warm_face_model() -> None:
    """Load + satu inference dummy agar request pertama tidak kena ONNX warmup."""
    from app.services.face_service import get_face_analyzer, get_fast_detector

    analyzer = get_face_analyzer()
    analyzer.get(np.zeros((128, 128, 3), dtype=np.uint8))
    fast = get_fast_detector()
    fast.get(np.zeros((128, 128, 3), dtype=np.uint8))
    logger.info("Face model + fast detector warm (inference OK)")


async def _warm_db_pages() -> None:
    """Panaskan page cache/index yang dipakai alur absen.

    Request pertama setelah restart membayar cold page cache (gate ~1.0s ->
    ~0.6s, insert log ~1.6s -> ~0.6s). Dengan warmup ini, user pertama
    mendapat kinerja steady-state.
    """
    async with engine.connect() as conn:
        await conn.execute(text("select count(*) from public.users"))
        await conn.execute(text("select count(*) from public.face_embeddings"))
        await conn.execute(text("select count(*) from public.attendance_logs"))
        await conn.execute(
            text(
                "select u.id::text from public.face_embeddings fe "
                "join public.users u on u.id = fe.user_id "
                "order by fe.embedding <=> "
                "(select embedding from public.face_embeddings limit 1) limit 1"
            )
        )
        # Warm path insert attendance_logs (index + partial index)
        await conn.execute(
            text(
                "insert into public.attendance_logs (user_id, status, rejection_reason) "
                "values (null, 'rejected', 'startup-warmup')"
            )
        )
        await conn.execute(
            text("delete from public.attendance_logs where rejection_reason = 'startup-warmup'")
        )
        await conn.commit()
    logger.info("Halaman DB absen hangat")


async def _db_keepalive() -> None:
    """Ping berkala ke DB agar koneksi pool tidak di-recycle pooler.

    Handshake ke Supabase pooler ~0.5-2 dtk; dengan koneksi hangat di pool,
    request pertama tidak membayar handshake itu (NFR-1).
    """
    while True:
        await asyncio.sleep(30)
        try:
            async with engine.connect() as conn:
                await conn.execute(text("select 1"))
        except Exception:  # noqa: BLE001 - jangan matikan task
            logger.exception("Keepalive DB gagal (diabaikan)")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Bucket privat dibuat sekali saat startup (idempotent) — dipakai oleh
    # enrollment (face-samples) dan log absen (attendance-evidence).
    for bucket in (settings.storage_face_bucket, settings.storage_attendance_bucket):
        try:
            await ensure_bucket(bucket, public=False)
        except StorageError as exc:
            logger.warning("Gagal memastikan bucket %s: %s", bucket, exc)

    # Warmup pool DB (handshake pooler ~0.5-2 dtk) + model InsightFace,
    # agar request pertama (E2E / user) tidak membayar overhead ini.
    try:
        async with engine.connect() as conn:
            await conn.execute(text("select 1"))
        logger.info("Pool DB hangat (select 1 OK)")
    except Exception:  # noqa: BLE001 - jangan gagalkan startup
        logger.exception("Warmup pool DB gagal (diabaikan)")
    try:
        await asyncio.to_thread(_warm_face_model)
    except Exception:  # noqa: BLE001 - jangan gagalkan startup
        logger.exception("Warmup face model gagal (diabaikan)")
    try:
        await _warm_db_pages()
    except Exception:  # noqa: BLE001 - jangan gagalkan startup
        logger.exception("Warmup halaman DB gagal (diabaikan)")

    keepalive = asyncio.create_task(_db_keepalive())
    try:
        yield
    finally:
        keepalive.cancel()
        await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Backend face processing & location validation — Sistem Absensi",
        lifespan=lifespan,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(face.router)
    app.include_router(liveness.router)
    app.include_router(enrollment.router)
    app.include_router(attendance.router)
    app.include_router(admin.router)
    return app


app = create_app()
