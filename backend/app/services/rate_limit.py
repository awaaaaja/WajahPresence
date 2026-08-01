"""Rate limiting via Postgres counter (Prompt 2.4).

Keputusan v1: tanpa Redis — hitung percobaan GAGAL user dalam sliding window
dari tabel attendance_logs (sudah ada + ber-index). Jika melebihi threshold,
user diblokir sementara (status 429). Blokir otomatis hilang saat window
block_minutes berlalu (tidak ada state tambahan yang perlu di-reset).

Index pendukung: (user_id, timestamp desc) existing + partial index
(user_id, timestamp) where status in ('rejected','suspicious') — migrasi 000005.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

logger = logging.getLogger(__name__)


class RateLimitedError(Exception):
    """User diblokir sementara karena terlalu banyak percobaan gagal."""

    def __init__(self, retry_after_minutes: int) -> None:
        self.retry_after_minutes = retry_after_minutes
        super().__init__(
            "Terlalu banyak percobaan yang gagal. "
            f"Coba lagi dalam {retry_after_minutes} menit."
        )


async def count_recent_failures(user_id: str, window_minutes: int | None = None) -> int:
    """Jumlah percobaan gagal user dalam window menit terakhir (sliding window)."""
    window = window_minutes or settings.rate_limit_window_minutes
    since = datetime.now(timezone.utc) - timedelta(minutes=window)
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "select count(*) from public.attendance_logs "
                "where user_id = :uid and timestamp >= :since "
                "and status in ('rejected', 'suspicious')"
            ),
            {"uid": user_id, "since": since},
        )
        return int(result.scalar() or 0)


async def check_rate_limit(user_id: str) -> None:
    """Raises RateLimitedError bila user melebihi batas percobaan gagal.

    Sliding window: window_minutes terakhir; batas diblokir = window_minutes
    di masa depan (blokir otomatis reset setelah window berlalu).
    """
    failures = await count_recent_failures(user_id)
    if failures >= settings.rate_limit_max_failures:
        # Kapan blokir berakhir: block_minutes ke depan dari PERCOBAAN PERTAMA
        # dalam window (agar tidak bergeser terus saat user tetap mencoba).
        window_start = datetime.now(timezone.utc) - timedelta(
            minutes=settings.rate_limit_window_minutes
        )
        async with engine.connect() as conn:
            first = await conn.execute(
                text(
                    "select timestamp from public.attendance_logs "
                    "where user_id = :uid and timestamp >= :since "
                    "and status in ('rejected', 'suspicious') "
                    "order by timestamp asc limit 1"
                ),
                {"uid": user_id, "since": window_start},
            )
            first_ts = first.scalar()
        if first_ts is not None:
            unblock = first_ts + timedelta(minutes=settings.rate_limit_block_minutes)
            now = datetime.now(timezone.utc)
            if unblock > now:
                retry = int((unblock - now).total_seconds() // 60) + 1
                raise RateLimitedError(retry)
