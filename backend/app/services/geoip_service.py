"""IP geolocation (Sprint 3, Prompt 3.2) — sinyal pembanding terhadap GPS.

Keterbatasan web (PRD.md §8): ini BUKAN deteksi definitif, hanya sinyal
pembanding. Browser tidak punya akses WiFi BSSID; IP-geo adalah penggantinya.

Provider: ipwho.is (HTTPS gratis, tanpa key) dengan fallback ip-api.com
(free tier hanya HTTP). Kegagalan lookup TIDAK pernah memblokir absen —
hanya menghilangkan sinyal pembanding.

Dev-only override: saat DEV_MODE=true, header X-GeoIP-Override-Lat/Lng dari
client dipakai sebagai hasil lookup (untuk test deterministik E2E). Header
ini DIABAIKAN total saat DEV_MODE=false.
"""

from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GEOIP_OVERRIDE_LAT_HEADER = "x-geoip-override-lat"
GEOIP_OVERRIDE_LNG_HEADER = "x-geoip-override-lng"


@dataclass(frozen=True)
class GeoIPResult:
    lat: float
    lng: float
    city: str | None = None
    country: str | None = None


# Cache per-IP sederhana (hasil lookup layanan publik, jarang berubah).
_cache: dict[tuple[str, bool], GeoIPResult | None] = {}
_CACHE_MAX = 512


def resolve_client_ip(headers: dict[str, str], fallback: str | None) -> str | None:
    """IP client dari header proxy (X-Forwarded-For/X-Real-IP), fallback socket."""
    xff = headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    xri = headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return fallback


def _is_private(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # bukan IP valid — jangan lookup
    return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved


def _parse_ipwhois(data: dict[str, Any]) -> GeoIPResult | None:
    if not data.get("success"):
        return None
    lat = data.get("latitude")
    lng = data.get("longitude")
    if lat is None or lng is None:
        return None
    return GeoIPResult(lat=float(lat), lng=float(lng), city=data.get("city"), country=data.get("country"))


def _parse_ipapi(data: dict[str, Any]) -> GeoIPResult | None:
    if data.get("status") != "success":
        return None
    lat = data.get("lat")
    lon = data.get("lon")
    if lat is None or lon is None:
        return None
    return GeoIPResult(lat=float(lat), lng=float(lon))


async def _lookup_remote(ip: str) -> GeoIPResult | None:
    timeout = settings.geoip_lookup_timeout_seconds
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.get(f"https://ipwho.is/{ip}")
            if r.status_code == 200:
                result = _parse_ipwhois(r.json())
                if result is not None:
                    return result
        except httpx.HTTPError as exc:
            logger.debug("geoip ipwho.is gagal: %s", exc)
        try:
            r = await client.get(f"http://ip-api.com/json/{ip}?fields=status,lat,lon")
            if r.status_code == 200:
                result = _parse_ipapi(r.json())
                if result is not None:
                    return result
        except httpx.HTTPError as exc:
            logger.debug("geoip ip-api gagal: %s", exc)
    return None


def _cached(ip: str, override: bool, value: GeoIPResult | None) -> GeoIPResult | None:
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[(ip, override)] = value
    return value


async def lookup_ip(ip: str | None, headers: dict[str, str] | None = None) -> GeoIPResult | None:
    """Geolokasi sebuah IP. None bila gagal / IP privat / tidak ada sinyal."""
    if not ip:
        return None
    headers = headers or {}

    # Override dev-only (test deterministik) — DIABAIKAN di produksi.
    if settings.dev_mode:
        olat = headers.get(GEOIP_OVERRIDE_LAT_HEADER)
        olng = headers.get(GEOIP_OVERRIDE_LNG_HEADER)
        if olat is not None and olng is not None:
            try:
                return _cached(ip, True, GeoIPResult(lat=float(olat), lng=float(olng)))
            except ValueError:
                logger.warning("header geoip override tidak valid: lat=%s lng=%s", olat, olng)
                return None

    if _is_private(ip):
        return None

    key = (ip, False)
    if key in _cache:
        return _cache[key]
    result = await _lookup_remote(ip)
    if result is not None:
        logger.info("geoip: %s -> %s, %s (%.4f, %.4f)", ip, result.city, result.country, result.lat, result.lng)
    else:
        logger.info("geoip: lookup %s tidak menghasilkan sinyal", ip)
    return _cached(ip, False, result)
