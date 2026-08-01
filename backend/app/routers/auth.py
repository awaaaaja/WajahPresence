"""Router contoh endpoint terproteksi JWT (auth check untuk Sprint 0).

Endpoint real untuk wajah/lokasi akan memakai dependency get_current_user ini.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.security import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def read_current_user(
    user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> dict[str, Any]:
    """Kembalikan klaim JWT user yang sedang login (verifikasi JWT Supabase)."""
    return user
