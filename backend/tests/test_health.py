"""Unit test skeleton Sprint 0 (Prompt 0.3)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["service"] == "wajahpresence-backend"
    assert body["status"] in ("ok", "degraded")
    assert body["database"] in ("connected", "error")


def test_auth_me_requires_token() -> None:
    """Endpoint terproteksi harus menolak request tanpa Authorization header."""
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_my_logs_requires_token() -> None:
    """Riwayat absen user (Sprint 5.5) wajib punya JWT user."""
    resp = client.get("/attendance/logs/mine")
    assert resp.status_code == 401
