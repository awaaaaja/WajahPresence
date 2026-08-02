"""Konfigurasi aplikasi via environment variables (pydantic-settings).

Semua credential dibaca dari .env — tidak ada nilai hardcoded.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "wajahpresence-backend"
    app_version: str = "0.1.0"
    debug: bool = False
    dev_mode: bool = False

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    supabase_url: str = "https://YOUR_PROJECT_REF.supabase.co"
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    cors_origins: list[str] = []

    # Face matching (FR-2.2) — threshold cosine similarity, default 0.6
    match_threshold: float = 0.6
    # Liveness server-side (Prompt 1.3) — minimal mean frame diff (skala 0-255)
    liveness_min_mean_diff: float = 2.0
    # Bucket privat Supabase Storage untuk foto sample wajah
    storage_face_bucket: str = "face-samples"
    # Bucket privat untuk foto bukti percobaan absen (NFR-5: retention 90 hari)
    storage_attendance_bucket: str = "attendance-evidence"
    # Rate limiting (Prompt 2.4) — blokir sementara setelah N gagal dalam window
    rate_limit_max_failures: int = 10
    rate_limit_window_minutes: int = 60
    rate_limit_block_minutes: int = 15

    # Location verification (Sprint 3, FR-2.5/2.6/2.7) — semua threshold
    # mudah di-tuning tanpa ubah kode (Prompt 3.4 REVIEW).
    geoip_lookup_timeout_seconds: float = 3.0
    # GPS accuracy di bawah/atas nilai ini -> flag "suspicious" (bukan reject),
    # indikasi mock (terlalu presisi) atau sinyal lemah (terlalu longgar).
    gps_accuracy_min_m: float = 2.0
    gps_accuracy_max_m: float = 300.0
    # Selisih GPS vs IP-geolocation melebihi ini (km) -> ip_mismatch_flag +
    # status suspicious. IP geo bisa meleset puluhan km di area urban.
    geoip_mismatch_km: float = 200.0
    # Teleport (FR-2.7): kecepatan antar-absen melebihi ini (km/jam) -> reject.
    teleport_max_speed_kmh: float = 120.0
    # Hanya bandingkan absen terakhir dalam jendela ini (jam); lebih lama = riwayat baru.
    teleport_max_interval_hours: float = 24.0

    # Retention policy (NFR-5): foto bukti absen dihapus otomatis setelah N hari.
    evidence_retention_days: int = 90
    # Interval task pembersihan retention (jam) — jalan sebagai background task.
    evidence_cleanup_interval_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
