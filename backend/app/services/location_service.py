"""Location validation (Sprint 3, Prompt 3.3-3.5) — geofence, IP cross-check,
anomaly teleport. Semua perhitungan jarak memakai PostGIS (AGENTS.md §4).

Prinsip (PRD.md §8): multi-signal, bukan deteksi definitif. GPS accuracy
tidak wajar / GPS-vs-IP mismatch -> flag "suspicious" (absen DITERIMA,
FR-2.6). Teleport -> reject (FR-2.7).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LocationSignals:
    """Hasil evaluasi lokasi dalam SATU roundtrip DB (NFR-1).

    Semua jarak memakai PostGIS geography (AGENTS.md §4), bukan Haversine.
    """

    has_geofences: bool
    inside: bool | None = None  # None bila tidak ada koordinat GPS
    prev_ts: datetime | None = None  # absen sukses/suspicious terakhir (teleport)
    prev_lat: float | None = None
    prev_lng: float | None = None
    ip_dist_m: float | None = None  # jarak GPS vs IP-geolocation
    prev_dist_m: float | None = None  # jarak GPS ke absen terakhir (teleport)


async def match_and_evaluate_location(
    conn: AsyncConnection,
    user_id: str,
    lat: float,
    lng: float,
    ip_geo_lat: float | None,
    ip_geo_lng: float | None,
    embedding_str: str,
    max_hours: float | None = None,
) -> tuple[dict[str, Any] | None, LocationSignals]:
    """Match pgvector + SEMUA sinyal lokasi dalam SATU query.

    Penggabungan ini krusial utk NFR-1 (< 3 dtk): koneksi pooler Supabase
    ~400-700 ms per roundtrip, jadi 3 query terpisah (matching, geofence,
    teleport-prev) menjadi 3x lipat waktu kritis. Satu roundtrip total.
    """
    max_hours = max_hours if max_hours is not None else settings.teleport_max_interval_hours
    result = await conn.execute(
        text(
            "with pt as ("
            "  select st_setsrid(st_makepoint(:lng, :lat), 4326)::geography as g"
            "), match_row as ("
            "  select u.id::text as u_id, u.nama as u_nama, "
            "         u.status_enrollment as u_status, "
            "         1 - (fe.embedding <=> cast(:emb as vector)) as sim "
            "  from public.face_embeddings fe "
            "  join public.users u on u.id = fe.user_id "
            "  order by fe.embedding <=> cast(:emb as vector) "
            "  limit 1"
            ") "
            "select "
            "  match_row.u_id, match_row.u_nama, match_row.u_status, match_row.sim, "
            "  (select count(*) from public.locations) as total_locations, "
            "  exists(select 1 from public.locations l "
            "         where st_dwithin(l.geom, pt.g, l.radius_meter)) as inside, "
            "  (select al.timestamp from public.attendance_logs al "
            "   where al.user_id = :uid and al.status in ('success', 'suspicious') "
            "   and al.lat is not null and al.lng is not null "
            "   and al.timestamp >= now() - interval '1 hour' * :max_hours "
            "   order by al.timestamp desc limit 1) as prev_ts, "
            "  (select al.lat from public.attendance_logs al "
            "   where al.user_id = :uid and al.status in ('success', 'suspicious') "
            "   and al.lat is not null and al.lng is not null "
            "   and al.timestamp >= now() - interval '1 hour' * :max_hours "
            "   order by al.timestamp desc limit 1) as prev_lat, "
            "  (select al.lng from public.attendance_logs al "
            "   where al.user_id = :uid and al.status in ('success', 'suspicious') "
            "   and al.lat is not null and al.lng is not null "
            "   and al.timestamp >= now() - interval '1 hour' * :max_hours "
            "   order by al.timestamp desc limit 1) as prev_lng, "
            "  case when cast(:ipglat as double precision) is not null then "
            "    st_distance(pt.g, st_setsrid(st_makepoint("
            "      cast(:ipglng as double precision), cast(:ipglat as double precision)"
            "    ), 4326)::geography) "
            "  end as ip_dist_m, "
            "  case when (select al.lat from public.attendance_logs al "
            "             where al.user_id = :uid and al.status in "
            "             ('success', 'suspicious') "
            "             and al.lat is not null and al.lng is not null "
            "             and al.timestamp >= now() - interval '1 hour' * :max_hours "
            "             order by al.timestamp desc limit 1) is not null "
            "  then "
            "    st_distance(pt.g, st_setsrid(st_makepoint("
            "      (select al.lng from public.attendance_logs al "
            "       where al.user_id = :uid and al.status in ('success', 'suspicious') "
            "       and al.lat is not null and al.lng is not null "
            "       and al.timestamp >= now() - interval '1 hour' * :max_hours "
            "       order by al.timestamp desc limit 1), "
            "      (select al.lat from public.attendance_logs al "
            "       where al.user_id = :uid and al.status in ('success', 'suspicious') "
            "       and al.lat is not null and al.lng is not null "
            "       and al.timestamp >= now() - interval '1 hour' * :max_hours "
            "       order by al.timestamp desc limit 1)"
            "    ), 4326)::geography) "
            "  end as prev_dist_m "
            "from pt, match_row"
        ),
        {
            "lat": lat,
            "lng": lng,
            "emb": embedding_str,
            "uid": user_id,
            "max_hours": max_hours,
            "ipglat": ip_geo_lat,
            "ipglng": ip_geo_lng,
        },
    )
    row = result.mappings().first()
    if row is None or row["u_id"] is None:
        return None, LocationSignals(has_geofences=False)

    match = {
        "id": row["u_id"],
        "nama": row["u_nama"],
        "status_enrollment": row["u_status"],
        "sim": row["sim"],
    }
    signals = LocationSignals(
        has_geofences=int(row["total_locations"] or 0) > 0,
        inside=bool(row["inside"]),
        prev_ts=row["prev_ts"],
        prev_lat=row["prev_lat"],
        prev_lng=row["prev_lng"],
        ip_dist_m=float(row["ip_dist_m"]) if row["ip_dist_m"] is not None else None,
        prev_dist_m=float(row["prev_dist_m"]) if row["prev_dist_m"] is not None else None,
    )
    return match, signals


def evaluate_accuracy(accuracy_m: float | None) -> list[str]:
    """Accuracy tidak wajar -> alasan flag suspicious (FR-2.6).

    Terlalu presisi (< min): indikasi mock/ternormalisasi. Terlalu longgar
    (> max): sinyal lemah (cell tower) / tidak valid sebagai bukti lokasi.
    """
    if accuracy_m is None:
        return []
    reasons: list[str] = []
    if accuracy_m < settings.gps_accuracy_min_m:
        reasons.append(f"accuracy terlalu presisi ({accuracy_m:.1f} m < {settings.gps_accuracy_min_m:.0f} m)")
    if accuracy_m > settings.gps_accuracy_max_m:
        reasons.append(f"accuracy terlalu longgar ({accuracy_m:.0f} m > {settings.gps_accuracy_max_m:.0f} m)")
    return reasons


def compute_speed_kmh(dist_m: float, dt_seconds: float) -> float | None:
    """Kecepatan rata-rata antar dua absen; None bila waktu tidak valid."""
    if dt_seconds <= 0:
        return None
    return (dist_m / 1000.0) / (dt_seconds / 3600.0)


def teleport_reason_from(
    prev_ts: datetime, dist_m: float, dt_seconds: float | None = None
) -> str | None:
    """Alasan reject teleport berbasis kecepatan rata-rata (murni, utk test)."""
    dt = dt_seconds if dt_seconds is not None else (datetime.now(timezone.utc) - prev_ts).total_seconds()
    speed = compute_speed_kmh(dist_m, dt)
    if speed is None or speed <= settings.teleport_max_speed_kmh:
        return None
    return (
        f"teleport: {dist_m / 1000:.0f} km ditempuh dalam {dt / 60:.0f} menit "
        f"({speed:.0f} km/jam > {settings.teleport_max_speed_kmh:.0f} km/jam)"
    )
