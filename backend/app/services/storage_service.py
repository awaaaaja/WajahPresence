"""Supabase Storage helper — HANYA dipakai backend (service role key).

Menggunakan REST API Storage langsung (httpx), tanpa SDK tambahan.
"""

from __future__ import annotations

import httpx

from app.core.config import settings

STORAGE_BASE = f"{settings.supabase_url}/storage/v1"

_HEADERS = {
    "apikey": settings.supabase_service_role_key,
    "Authorization": f"Bearer {settings.supabase_service_role_key}",
}


class StorageError(Exception):
    pass


async def ensure_bucket(bucket_id: str, public: bool = False) -> None:
    """Buat bucket jika belum ada (idempotent)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{STORAGE_BASE}/bucket/{bucket_id}", headers=_HEADERS)
        if resp.status_code == 200:
            return
        resp = await client.post(
            f"{STORAGE_BASE}/bucket",
            headers=_HEADERS,
            json={"id": bucket_id, "name": bucket_id, "public": public},
        )
        if resp.status_code not in (200, 201, 409):
            raise StorageError(f"Gagal buat bucket: {resp.status_code} {resp.text}")


async def upload_file(
    bucket_id: str, object_path: str, data: bytes, content_type: str
) -> str:
    """Upload file ke bucket privat, return object path."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.put(
            f"{STORAGE_BASE}/object/{bucket_id}/{object_path}",
            headers={**_HEADERS, "Content-Type": content_type},
            content=data,
        )
        if resp.status_code not in (200, 201):
            raise StorageError(f"Gagal upload: {resp.status_code} {resp.text}")
    return object_path


async def get_signed_url(bucket_id: str, object_path: str, expires_in: int = 3600) -> str:
    """Buat signed URL sementara untuk akses file privat (mis. oleh admin)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{STORAGE_BASE}/object/sign/{bucket_id}/{object_path}",
            headers=_HEADERS,
            json={"expiresIn": expires_in},
        )
        if resp.status_code not in (200, 201):
            raise StorageError(f"Gagal buat signed URL: {resp.status_code} {resp.text}")
    data = resp.json()
    # signedURL dikembalikan relatif ke /storage/v1/ (mis. /object/sign/<bucket>/<path>?token=...)
    return f"{settings.supabase_url}/storage/v1{data['signedURL']}"


async def delete_file(bucket_id: str, object_path: str) -> None:
    """Hapus file dari bucket."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(
            f"{STORAGE_BASE}/object/{bucket_id}/{object_path}", headers=_HEADERS
        )
        if resp.status_code not in (200, 202):
            raise StorageError(f"Gagal hapus: {resp.status_code} {resp.text}")


async def list_files(
    bucket_id: str, prefix: str = "", limit: int = 100
) -> list[tuple[str, str | None]]:
    """List semua file di bucket privat, dengan pagination.

    Returns:
        list[(name, updated_at)] — updated_at ISO8601 (None jika tidak ada
        metadata waktu dari storage provider).
    """
    names: list[tuple[str, str | None]] = []
    async with httpx.AsyncClient(timeout=60) as client:
        offset = 0
        while True:
            resp = await client.post(
                f"{STORAGE_BASE}/object/list/{bucket_id}",
                headers=_HEADERS,
                json={
                    "prefix": prefix,
                    "limit": limit,
                    "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                },
            )
            if resp.status_code != 200:
                raise StorageError(f"Gagal list file: {resp.status_code} {resp.text}")
            items = resp.json()
            if not items:
                break
            names.extend((it["name"], it.get("updated_at")) for it in items)
            if len(items) < limit:
                break
            offset += limit
    return names
