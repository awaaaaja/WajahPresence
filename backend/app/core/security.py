"""Verifikasi JWT dari Supabase Auth (AGENTS.md §4: wajib di endpoint wajah/lokasi).

Supabase saat ini menandatangani access token dengan **ES256** memakai key dari
JWKS (`/auth/v1/.well-known/jwks.json`). Key lama (HS256 via JWT secret) tetap
didukung sebagai fallback ("legacy JWT secret"). Verifikasi dilakukan lokal via
PyJWT + cryptography, dengan JWKS di-cache 1 jam.

Selalu menolak token ber-role anon/service_role (klaim `role`) — hanya access
token user (`role=authenticated`) yang sah di endpoint backend.
"""

import logging
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)

JWT_ALGORITHMS_ES = ["ES256"]
JWT_ALGORITHM_HS = "HS256"
SUPABASE_ISSUER = "supabase"
JWKS_TTL_SECONDS = 3600

# Issuer di claim `iss` token = URL auth project (bukan "supabase").
_AUTH_ISSUER = f"{settings.supabase_url.rstrip('/')}/auth/v1"

_JWKS_CACHE: tuple[float, dict[str, dict[str, Any]]] | None = None


async def _fetch_jwks() -> dict[str, dict[str, Any]]:
    """Ambil JWKS project (cache 1 jam), return dict {kid: key}. Gagal -> {}."""
    global _JWKS_CACHE
    import time

    now = time.monotonic()
    if _JWKS_CACHE and now - _JWKS_CACHE[0] < JWKS_TTL_SECONDS:
        return _JWKS_CACHE[1]
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            keys = {k["kid"]: k for k in resp.json().get("keys", []) if k.get("kid")}
        _JWKS_CACHE = (now, keys)
        return keys
    except Exception:  # noqa: BLE001 - JWKS gagal -> fallback jalur lain
        logger.warning("Gagal ambil JWKS dari %s (fallback ke legacy/dev)", url, exc_info=True)
        _JWKS_CACHE = (now, {})
        return {}


def _require_user_role(payload: dict[str, Any]) -> dict[str, Any]:
    """Klaim `role` adalah postgres role (anon/authenticated/service_role).

    Menolak anon & service_role menutup jalur akses endpoint user dengan key
    client/anonymous (defense-in-depth, Sprint 5.1 audit).
    """
    if payload.get("role") != "authenticated":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token bukan access token user (role harus 'authenticated')",
        )
    return payload


def _decode_common(
    token: str, key: Any, algorithms: list[str]
) -> dict[str, Any]:
    return jwt.decode(
        token,
        key,
        algorithms=algorithms,
        issuer=_AUTH_ISSUER,
        audience="authenticated",
        options={"require": ["sub", "exp", "iss", "aud"]},
    )


def _jwk_to_pem(jwk: dict[str, str]) -> bytes:
    """Konversi key JWK (P-256) ke format PEM untuk PyJWT."""
    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    x = int.from_bytes(base64.urlsafe_b64decode(jwk["x"] + "=="), "big")
    y = int.from_bytes(base64.urlsafe_b64decode(jwk["y"] + "=="), "big")
    pub = ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()
    return pub.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )


def _raise_invalid(exc: Exception) -> None:
    if isinstance(exc, jwt.ExpiredSignatureError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token kedaluwarsa"
        ) from exc
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid"
    ) from exc


async def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """Verifikasi token (ES256 via JWKS -> HS256 legacy -> dev-mode skip)."""
    # 1) Jalur utama: ES256 memakai public key JWKS (cocokkan kid).
    keys = await _fetch_jwks()
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.InvalidTokenError as exc:
        _raise_invalid(exc)
        raise
    if kid and kid in keys:
        try:
            payload = _decode_common(token, _jwk_to_pem(keys[kid]), JWT_ALGORITHMS_ES)
            return _require_user_role(payload)
        except HTTPException:
            raise
        except jwt.InvalidTokenError as exc:
            # Signature invalid utk key ini -> langsung tolak (bukan fallback).
            _raise_invalid(exc)
            raise

    # 2) Fallback: legacy HS256 (JWT secret lama yang masih terbit untuk token lama).
    if settings.supabase_jwt_secret:
        try:
            payload = _decode_common(
                token, settings.supabase_jwt_secret, [JWT_ALGORITHM_HS]
            )
            return _require_user_role(payload)
        except HTTPException:
            raise
        except jwt.InvalidTokenError as exc:
            _raise_invalid(exc)
            raise

    # 3) Terakhir: DEV_MODE tanpa kunci sama sekali (hanya development lokal).
    if settings.dev_mode:
        logger.warning(
            "Verifikasi signature di-skip (DEV_MODE=true tanpa JWKS/secret) — "
            "JANGAN dipakai di production."
        )
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
        except jwt.DecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid"
            ) from exc
        return _require_user_role(payload)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Kunci verifikasi JWT belum dikonfigurasi di server",
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict[str, Any]:
    """FastAPI dependency: pengguna terautentikasi (payload JWT Supabase)."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Butuh header Authorization: Bearer <token>",
        )
    return await verify_supabase_jwt(credentials.credentials)
