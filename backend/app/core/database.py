"""Koneksi database ke Supabase Postgres via SQLAlchemy async + asyncpg.

Backend memakai connection string langsung (bukan Supabase client SDK)
karena butuh akses SQL penuh untuk pgvector / PostGIS.
"""

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Base class untuk ORM models (diisi di fase berikutnya)."""


def create_db_engine() -> AsyncEngine:
    # TANPA pool_pre_ping: setiap checkout akan menjalankan SELECT 1 (satu
    # roundtrip penuh ke pooler Supabase ~300-900 ms) dan mematikan NFR-1.
    # Stale connection ditangani pool_recycle + pooler idle timeout.
    # Port 6543 (transaction pooler): session pooler 5432 tidak dapat
    # dijangkau dari network ini (Sprint 5.2) — asyncpg butuh
    # statement_cache_size=0 agar prepared statement tidak tabrakan
    # dengan mode transaction pgbouncer.
    return create_async_engine(
        settings.database_url,
        pool_size=10,
        max_overflow=0,
        pool_recycle=600,
        connect_args={"statement_cache_size": 0},
    )


engine: AsyncEngine = create_db_engine()
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """FastAPI dependency: session database per request."""
    async with async_session_maker() as session:
        yield session
