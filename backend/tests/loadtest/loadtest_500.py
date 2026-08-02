"""Load test Sprint 5.2 — 500 request /attendance/face-check (4 fase conc).

Setup: purge data Load User -> create auth user -> consent -> enroll 5 sample
(obama.jpg varian) -> approve langsung via SQL -> lokasi 'load-site' + geofence.
Kriteria NFR-1: p95 < 3000 ms, err = 0.

Jalan: env SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, DATABASE_URL
(port 6543 — session pooler 5432 tidak terjangkau, lihat docs/SPRINT.md 5.2).
"""
import asyncio
import base64
import os
import sys
import time

import httpx
import asyncpg

BASE = "http://127.0.0.1:8000"
SUPABASE_URL = "https://axylfxhgjeolpjrrnukn.supabase.co"
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANON = os.environ["SUPABASE_ANON_KEY"]
DB = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")

EMAIL = "load@test.com"
PASSWORD = "LoadTest123!"
NAMA = "Load User"
SITE = "load-site"
LAT, LNG, RADIUS = -6.200000, 106.816666, 300.0
POLICY = "2026-08-01-v1"
FACE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "faces")

ANGLES = ["front", "left", "right", "up", "down"]


async def db_exec(sql, *args):
    conn = await asyncpg.connect(DB, ssl="require", statement_cache_size=0)
    try:
        await conn.execute(sql, *args)
    finally:
        await conn.close()


async def db_val(sql, *args):
    conn = await asyncpg.connect(DB, ssl="require", statement_cache_size=0)
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


async def purge():
    await db_exec(
        "delete from public.attendance_logs where user_id in "
        "(select id from public.users where nama = $1)", NAMA)
    await db_exec(
        "delete from public.face_embeddings where user_id in "
        "(select id from public.users where nama = $1)", NAMA)
    await db_exec("delete from public.biometric_consents where user_id in "
                  "(select id from public.users where nama = $1)", NAMA)
    await db_exec("delete from public.users where nama = $1", NAMA)
    await db_exec("delete from public.locations where nama_site = $1", SITE)
    await db_exec("delete from auth.users where email = $1", EMAIL)


def make_frames():
    def enc(path):
        return base64.b64encode(open(path, "rb").read()).decode()
    return [enc(f"{FACE_DIR}/biden_small.jpg"),
            enc(f"{FACE_DIR}/obama_small.jpg"),
            enc(f"{FACE_DIR}/biden_small.jpg")]


async def setup(force: bool = False):
    if not force:
        ready = await db_val(
            "select count(*) from public.users u join public.locations l on 1=1 "
            "where u.nama = $1 and u.status_enrollment = 'approved' "
            "and l.nama_site = $2 and (select count(*) from public.face_embeddings fe "
            "where fe.user_id = u.id) = 5", NAMA, SITE)
        if ready:
            print("setup SKIP (sudah siap)")
            return
    await purge()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={"apikey": ANON, "Authorization": f"Bearer {SERVICE_ROLE}"},
            json={"email": EMAIL, "password": PASSWORD,
                  "email_confirm": True,
                  "user_metadata": {"nama": NAMA, "nim_nip": "LT-001"}},
        )
        r.raise_for_status()
        r = await c.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                         headers={"apikey": ANON},
                         json={"email": EMAIL, "password": PASSWORD})
        r.raise_for_status()
        tok = r.json()["access_token"]
    frames = make_frames()
    hdr = {"Authorization": f"Bearer {tok}"}
    async with httpx.AsyncClient(timeout=240) as c:
        r = await c.post(f"{BASE}/enrollment/consent",
                         json={"policy_version": POLICY}, headers=hdr)
        r.raise_for_status()
        samples = [{"image_base64": f, "angle": a} for f, a in zip(frames * 5, ANGLES * 2)][:5]
        r = await c.post(f"{BASE}/enrollment",
                         json={"nama": NAMA, "nim_nip": "LT-001",
                               "samples": samples, "policy_version": POLICY},
                         headers=hdr)
        if r.status_code != 200:
            print("ENROLL GAGAL:", r.status_code, r.text[:300])
            sys.exit(1)
    await db_exec(
        "update public.users set status_enrollment = 'approved' where nama = $1", NAMA)
    await db_exec(
        "insert into public.locations (nama_site, lat, lng, radius_meter) "
        "values ($1, $2, $3, $4)", SITE, LAT, LNG, RADIUS)
    print("setup OK")


async def token_of():
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                         headers={"apikey": ANON},
                         json={"email": EMAIL, "password": PASSWORD})
        r.raise_for_status()
        return r.json()["access_token"]


async def warmup():
    tok = await token_of()
    payload = {"frames": make_frames(), "poses": ["front", "front", "front"],
               "lat": LAT, "lng": LNG, "gps_accuracy": 5.0}
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(f"{BASE}/attendance/face-check",
                         json=payload,
                         headers={"Authorization": f"Bearer {tok}",
                                  "X-GeoIP-Override-Lat": str(LAT),
                                  "X-GeoIP-Override-Lng": str(LNG)})
    print("warmup:", r.status_code, r.text[:200])
    if r.status_code != 200:
        sys.exit(2)


async def phase(conc: int, n: int, tok: str):
    lat, err = [], []
    payload = {"frames": make_frames(), "poses": ["front", "front", "front"],
               "lat": LAT, "lng": LNG, "gps_accuracy": 5.0}
    hdr = {"Authorization": f"Bearer {tok}",
           "X-GeoIP-Override-Lat": str(LAT), "X-GeoIP-Override-Lng": str(LNG)}
    sem = asyncio.Semaphore(conc)

    async def one(_i):
        async with sem:
            t0 = time.perf_counter()
            try:
                async with httpx.AsyncClient(timeout=180) as c:
                    r = await c.post(f"{BASE}/attendance/face-check",
                                     json=payload, headers=hdr)
                dt = (time.perf_counter() - t0) * 1000
                if r.status_code != 200:
                    err.append((r.status_code, r.text[:100]))
                else:
                    lat.append(dt)
            except Exception as exc:
                err.append(("EXC", str(exc)[:100]))

    await asyncio.gather(*[one(i) for i in range(n)])
    ok = sorted(lat)
    if ok:
        p50 = ok[len(ok) // 2]
        p95 = ok[int(len(ok) * 0.95) - 1]
        print(f"conc={conc:>2} | n={n} ok={len(ok)} err={len(err)} | "
              f"p50={p50:.0f} p95={p95:.0f} max={ok[-1]:.0f} ms")
    else:
        print(f"conc={conc:>2} | n={n} ok=0 err={len(err)} | contoh: {err[:3]}")


async def main(force: bool = False):
    await setup(force)
    await warmup()
    tok = await token_of()
    for conc in (5, 10, 20, 30):
        await phase(conc, 125, tok)


if __name__ == "__main__":
    force = "--force" in sys.argv
    asyncio.run(main(force))
