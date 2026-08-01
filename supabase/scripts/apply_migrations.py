"""Script dev: terapkan migrasi SQL /supabase/migrations ke Supabase Postgres.

Penggunaan (ganti path ke venv backend):
    DATABASE_URL="postgresql+asyncpg://..." python apply_migrations.py [--check]

Setiap file dieksekusi dalam satu transaksi, berurutan sesuai urutan nama file.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


async def run() -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL belum diset (postgresql+asyncpg://... atau postgresql://...)")

    # asyncpg murni tidak kenal driver prefix SQLAlchemy
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        sys.exit(f"Tidak ada file .sql di {MIGRATIONS_DIR}")

    conn = await asyncpg.connect(dsn, ssl="require")
    try:
        for file in migration_files:
            sql = file.read_text(encoding="utf-8")
            print(f"[{file.name}] menerapkan ...")
            if "--check" in sys.argv:
                continue
            async with conn.transaction():
                await conn.execute(sql)
            print(f"[{file.name}] OK")
    finally:
        await conn.close()

    print("Semua migrasi selesai.")


if __name__ == "__main__":
    asyncio.run(run())
