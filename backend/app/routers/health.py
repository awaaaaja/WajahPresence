"""Router health check: GET /health."""

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Cek status service + koneksi database Supabase Postgres."""
    db_status: str = "connected"
    detail: str | None = None
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - health check harus selalu merespons
        db_status = "error"
        detail = str(exc) if settings.dev_mode else None

    return HealthResponse(
        status="ok" if db_status == "connected" else "degraded",
        service=settings.app_name,
        version=settings.app_version,
        database=db_status,  # type: ignore[arg-type]
        detail=detail,
    )
