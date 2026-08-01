"""Verifikasi JWT dari Supabase Auth (AGENTS.md §4: wajib di endpoint wajah/lokasi).

Supabase Auth menandatangani token user dengan HS256 memakai JWT secret project
(Dashboard -> Settings -> API -> JWT Secret). Verifikasi dilakukan lokal via PyJWT.
"""

import logging
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)

JWT_ALGORITHM = "HS256"
SUPABASE_ISSUER = "supabase"


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """Verifikasi signature + klaim dasar token JWT Supabase.

    Returns:
        Payload JWT (berisi sub/aud/email dsb).

    Raises:
        HTTPException 401/503 jika token invalid atau konfigurasi belum lengkap.
    """
    secret = settings.supabase_jwt_secret
    if not secret:
        if settings.dev_mode:
            # Hanya untuk development lokal; build production wajib punya secret.
            logger.warning(
                "SUPABASE_JWT_SECRET belum diset dan DEV_MODE=true: "
                "verifikasi signature di-skip (JANGAN dipakai di production)."
            )
            try:
                return jwt.decode(token, options={"verify_signature": False})
            except jwt.DecodeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid"
                ) from exc
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SUPABASE_JWT_SECRET belum dikonfigurasi di server",
        )

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            issuer=SUPABASE_ISSUER,
            options={"require": ["sub", "exp", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token kedaluwarsa"
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid"
        ) from exc
    return payload


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict[str, Any]:
    """FastAPI dependency: pengguna terautentikasi (payload JWT Supabase)."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Butuh header Authorization: Bearer <token>",
        )
    return verify_supabase_jwt(credentials.credentials)
