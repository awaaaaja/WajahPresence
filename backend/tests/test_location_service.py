"""Unit test location validation — Sprint 3 (Prompt 3.2-3.5).

Fokus logika murni (accuracy, speed, IP resolve, geoip override dev).
Fungsi yang butuh PostGIS (ST_DWithin, ST_Distance, teleport terhadap riwayat
DB) diverifikasi lewat E2E karena butuh koneksi Supabase.
"""

from __future__ import annotations

import asyncio

import pytest

from app.core.config import settings
from app.services.geoip_service import GeoIPResult, lookup_ip, resolve_client_ip
from app.services.location_service import (
    compute_speed_kmh,
    evaluate_accuracy,
    teleport_reason_from,
)
from datetime import datetime, timedelta, timezone


# --------------------------------------------------------------------------
# GPS accuracy (FR-2.6) — Prompt 3.4
# --------------------------------------------------------------------------

def test_accuracy_normal_no_flag() -> None:
    assert evaluate_accuracy(20.0) == []


def test_accuracy_too_precise_flagged() -> None:
    reasons = evaluate_accuracy(0.5)
    assert len(reasons) == 1 and "presisi" in reasons[0]


def test_accuracy_too_loose_flagged() -> None:
    reasons = evaluate_accuracy(500.0)
    assert len(reasons) == 1 and "longgar" in reasons[0]


def test_accuracy_none_no_flag() -> None:
    assert evaluate_accuracy(None) == []


# --------------------------------------------------------------------------
# Teleport speed (FR-2.7) — Prompt 3.5
# --------------------------------------------------------------------------

def test_speed_50km_5min() -> None:
    assert compute_speed_kmh(50_000, 300) == pytest.approx(600.0)


def test_speed_normal_drive() -> None:
    assert compute_speed_kmh(30_000, 1800) == pytest.approx(60.0)


def test_speed_zero_dt_none() -> None:
    assert compute_speed_kmh(50_000, 0) is None
    assert compute_speed_kmh(50_000, -10) is None


def test_teleport_50km_5min_rejected() -> None:
    prev = datetime.now(timezone.utc) - timedelta(minutes=5)
    reason = teleport_reason_from(prev, 50_000)
    assert reason is not None and "teleport" in reason
    assert "600 km/jam" in reason


def test_teleport_normal_drive_accepted() -> None:
    prev = datetime.now(timezone.utc) - timedelta(hours=1)
    assert teleport_reason_from(prev, 30_000) is None


def test_teleport_same_location_accepted() -> None:
    prev = datetime.now(timezone.utc) - timedelta(minutes=1)
    assert teleport_reason_from(prev, 2.0) is None


# --------------------------------------------------------------------------
# IP resolution (Prompt 3.2)
# --------------------------------------------------------------------------

def test_resolve_xff_first() -> None:
    headers = {"x-forwarded-for": "203.0.113.5, 10.0.0.1", "x-real-ip": "10.0.0.1"}
    assert resolve_client_ip(headers, "127.0.0.1") == "203.0.113.5"


def test_resolve_x_real_ip_fallback() -> None:
    headers = {"x-real-ip": "203.0.113.9"}
    assert resolve_client_ip(headers, "127.0.0.1") == "203.0.113.9"


def test_resolve_client_host_fallback() -> None:
    assert resolve_client_ip({}, "127.0.0.1") == "127.0.0.1"


# --------------------------------------------------------------------------
# GeoIP lookup (Prompt 3.2)
# --------------------------------------------------------------------------

def test_lookup_private_ip_none() -> None:
    # IP privat tidak pernah di-lookup ke layanan publik.
    for ip in ("127.0.0.1", "10.1.2.3", "192.168.1.1"):
        assert asyncio.run(lookup_ip(ip)) is None


def test_lookup_none_ip() -> None:
    assert asyncio.run(lookup_ip(None)) is None


def test_dev_override_honored() -> None:
    assert settings.dev_mode, "test ini butuh DEV_MODE=true (di .env)"
    result = asyncio.run(
        lookup_ip(
            "127.0.0.1",
            {"x-geoip-override-lat": "-6.2", "x-geoip-override-lng": "106.8"},
        )
    )
    assert isinstance(result, GeoIPResult)
    assert result.lat == pytest.approx(-6.2)
    assert result.lng == pytest.approx(106.8)


def test_dev_override_invalid_ignored() -> None:
    result = asyncio.run(
        lookup_ip(
            "127.0.0.1",
            {"x-geoip-override-lat": "bukan-angka", "x-geoip-override-lng": "106.8"},
        )
    )
    assert result is None


def test_override_ignored_when_not_dev_mode() -> None:
    previous = settings.dev_mode
    settings.dev_mode = False
    try:
        # IP privat + dev_mode off + override -> header harus DIABAIKAN,
        # dan IP privat tanpa lookup -> None (tanpa jaringan).
        result = asyncio.run(
            lookup_ip(
                "127.0.0.1",
                {"x-geoip-override-lat": "-6.2", "x-geoip-override-lng": "106.8"},
            )
        )
        assert result is None
    finally:
        settings.dev_mode = previous
