"""UAT Sprint 5.3 — skenario PRD §7 + Prompt 5.3 (API-level).

Device fisik tidak tersedia di lingkungan ini (preseden Sprint 2/3: test
API-level mencakup seluruh alur UI; scenario GPS-spoof via devtools/extension
tidak bisa dijalankan dari browser — di API disimulasikan via header override
yang persis sama dengan input yang dihasilkan extension/devtools).

Skenario:
  R1 registrasi normal                 -> pending, approve, 5 embedding + 5 foto
  R2 registrasi duplikat wajah         -> 409 (dedup; wajah sudah milik user lain)
  A1 absen normal (dalam geofence)     -> 200 success
  A2 absen frame statis (foto/video di layar HP) -> 403 liveness
  A3 absen wajah orang lain (terdaftar)          -> 403 + log suspicious
  A4 absen GPS accuracy tidak wajar (spoof)      -> 200 + log suspicious
  A5 absen di luar radius              -> 403 geofence
  A6 absen IP mismatch (VPN/extension spoof)     -> 200 + log suspicious
  A7 anomali teleport                  -> 403
  A8 rate limit (>=10 gagal)           -> 429

Catatan data: UAT Normal memakai wajah obama; skenario dedup (R2) diuji
dengan wajah yang sama (obama) terhadap UAT Normal — persis PRD §7
"tidak bisa duplikat wajah"; A3 memakai wajah biden (tidak terdaftar).

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

FACE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "loadtest", "faces")
POLICY = "2026-08-01-v1"
MAIL1, MAIL2 = "uat.normal@test.com", "uat.evil@test.com"
PW = "UatTest123!"
SITE1, SITE2 = "uat-site1", "uat-site2"
LAT1, LNG1 = -6.200000, 106.816666
LAT2, LNG2 = -2.000000, 112.000000
RADIUS = 300.0
SF_LAT, SF_LNG = 37.774900, -122.419400

PASS: list[str] = []
FAIL: list[str] = []


def enc(path):
    return base64.b64encode(open(path, "rb").read()).decode()


def frames_normal():
    """Wajah obama — dipakai UAT Normal."""
    return [enc(f"{FACE_DIR}/biden_small.jpg"),
            enc(f"{FACE_DIR}/obama_small.jpg"),
            enc(f"{FACE_DIR}/biden_small.jpg")]


def frames_static():
    f = enc(f"{FACE_DIR}/obama_small.jpg")
    return [f, f, f]


def frames_evil():
    """Wajah biden — TIDAK terdaftar siapa pun -> 'wajah tidak dikenal'."""
    return [enc(f"{FACE_DIR}/obama_small.jpg"),
            enc(f"{FACE_DIR}/biden_small.jpg"),
            enc(f"{FACE_DIR}/obama_small.jpg")]


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))


async def db_exec(sql, *args):
    conn = await asyncpg.connect(DB, ssl="require", statement_cache_size=0)
    try:
        await conn.execute(sql, *args)
    finally:
        await conn.close()


async def db_fetch(sql, *args):
    conn = await asyncpg.connect(DB, ssl="require", statement_cache_size=0)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def purge():
    for m in (MAIL1, MAIL2):
        await db_exec(
            "delete from public.attendance_logs where user_id in "
            "(select id from public.users where email = $1)", m)
        await db_exec(
            "delete from public.face_embeddings where user_id in "
            "(select id from public.users where email = $1)", m)
        await db_exec(
            "delete from public.biometric_consents where user_id in "
            "(select id from public.users where email = $1)", m)
        await db_exec("delete from public.users where email = $1", m)
        await db_exec("delete from auth.users where email = $1", m)
    await db_exec("delete from public.locations where nama_site = any($1)",
                  [[SITE1, SITE2]])


async def create_user(mail: str, nama: str, nim: str) -> str:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={"apikey": ANON, "Authorization": f"Bearer {SERVICE_ROLE}"},
            json={"email": mail, "password": PW, "email_confirm": True,
                  "user_metadata": {"nama": nama, "nim_nip": nim}},
        )
        r.raise_for_status()
        r = await c.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                         headers={"apikey": ANON},
                         json={"email": mail, "password": PW})
        r.raise_for_status()
        return r.json()["access_token"]


async def enroll(tok: str, nama: str, nim: str, face_path: str) -> httpx.Response:
    """Enroll 5 sudut dari SATU wajah (jangan campur wajah lain seperti
    pola loadtest — embedding campur membuat semua wajah 'match')."""
    hdr = {"Authorization": f"Bearer {tok}"}
    img = enc(face_path)
    async with httpx.AsyncClient(timeout=240) as c:
        r = await c.post(f"{BASE}/enrollment/consent",
                         json={"policy_version": POLICY}, headers=hdr)
        r.raise_for_status()
        angles = ["front", "left", "right", "up", "down"]
        samples = [{"image_base64": img, "angle": a} for a in angles]
        return await c.post(f"{BASE}/enrollment",
                            json={"nama": nama, "nim_nip": nim,
                                  "samples": samples, "policy_version": POLICY},
                            headers=hdr)


def geo_hdr(tok: str, lat, lng, acc: float):
    return {"Authorization": f"Bearer {tok}",
            "X-GeoIP-Override-Lat": str(lat),
            "X-GeoIP-Override-Lng": str(lng)}


async def face_check(tok: str, frames, poses, lat, lng, acc, ip_lat=None, ip_lng=None):
    payload = {"frames": frames, "poses": poses,
               "lat": lat, "lng": lng, "gps_accuracy": acc}
    hdr = {"Authorization": f"Bearer {tok}"}
    if ip_lat is not None:
        hdr["X-GeoIP-Override-Lat"] = str(ip_lat)
        hdr["X-GeoIP-Override-Lng"] = str(ip_lng)
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(f"{BASE}/attendance/face-check", json=payload, headers=hdr)
    return r


async def latest_log(mail: str):
    rows = await db_fetch(
        "select status, coalesce(rejection_reason, '') as reason, "
        "confidence_score, gps_accuracy from public.attendance_logs "
        "where user_id = (select id from public.users where email = $1) "
        "order by timestamp desc limit 1", mail)
    return rows[0] if rows else None


async def wait_log(mail: str, statuses: tuple[str, ...],
                   max_wait: float = 15.0) -> dict | None:
    """Poll log terbaru sampai status masuk daftar yang diharapkan.
    Log sukses/suspicious ditulis background setelah upload evidence
    (optimasi NFR-1) — tidak bisa langsung dibaca setelah respon."""
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < max_wait:
        log = await latest_log(mail)
        if log is not None and log["status"] in statuses:
            return log
        await asyncio.sleep(0.5)
    return await latest_log(mail)


async def run():
    await purge()
    await db_exec(
        "insert into public.locations (nama_site, lat, lng, radius_meter) "
        "values ($1, $2, $3, $4)", SITE1, LAT1, LNG1, RADIUS)
    await db_exec(
        "insert into public.locations (nama_site, lat, lng, radius_meter) "
        "values ($1, $2, $3, $4)", SITE2, LAT2, LNG2, RADIUS)

    # ---------- R1 registrasi normal ----------
    tok1 = await create_user(MAIL1, "UAT Normal", "UAT-001")
    r = await enroll(tok1, "UAT Normal", "UAT-001",
                     f"{FACE_DIR}/obama_small.jpg")
    check("R1 enroll normal 200", r.status_code == 200,
          f"code={r.status_code}")
    await db_exec(
        "update public.users set status_enrollment = 'approved' "
        "where email = $1", MAIL1)
    n_emb = await db_fetch(
        "select (select count(*) from public.face_embeddings fe "
        "where fe.user_id = u.id) emb, "
        "(select count(*) from public.face_embeddings fe "
        "where fe.user_id = u.id and fe.photo_url is not null) samp "
        "from public.users u where u.email = $1", MAIL1)
    emb, samp = n_emb[0]["emb"], n_emb[0]["samp"]
    check("R1 5 embedding + 5 foto tersimpan", emb == 5 and samp == 5,
          f"emb={emb} samp={samp}")

    # ---------- R2 registrasi duplikat wajah ----------
    tok2 = await create_user(MAIL2, "UAT Evil", "UAT-002")
    r = await enroll(tok2, "UAT Evil", "UAT-002",
                     f"{FACE_DIR}/obama_small.jpg")
    check("R2 duplikat wajah ditolak 409", r.status_code == 409,
          f"code={r.status_code} {r.text[:150]}")

    # ---------- A1 absen normal ----------
    r = await face_check(tok1, frames_normal(), ["front"] * 3,
                         LAT1, LNG1, 5.0, LAT1, LNG1)
    log = await wait_log(MAIL1, ("success",))
    check("A1 absen normal 200", r.status_code == 200, f"code={r.status_code}")
    check("A1 log success", log is not None and log["status"] == "success",
          f"log={log['status'] if log else None}")

    # ---------- A2 frame statis (foto/video di layar) ----------
    r = await face_check(tok1, frames_static(), ["front"] * 3,
                         LAT1, LNG1, 5.0, LAT1, LNG1)
    log = await latest_log(MAIL1)
    check("A2 replay ditolak 403", r.status_code == 403, f"code={r.status_code}")
    check("A2 log rejected liveness",
          log is not None and log["status"] == "rejected" and "liveness" in log["reason"],
          f"log={log['status'] if log else None}:{log['reason'][:60] if log else ''}")

    # ---------- A3 wajah orang lain (tidak terdaftar) ----------
    r = await face_check(tok1, frames_evil(), ["front"] * 3,
                         LAT1, LNG1, 5.0, LAT1, LNG1)
    log = await latest_log(MAIL1)
    check("A3 wajah lain ditolak 403", r.status_code == 403, f"code={r.status_code}")
    check("A3 log rejected match",
          log is not None and log["status"] == "rejected" and "match" in log["reason"],
          f"log={log['status'] if log else None}:{log['reason'][:60] if log else ''}")

    # ---------- A4 GPS accuracy tidak wajar (spoof) ----------
    r = await face_check(tok1, frames_normal(), ["front"] * 3,
                         LAT1, LNG1, 0.5, LAT1, LNG1)
    log = await wait_log(MAIL1, ("suspicious",))
    check("A4 spoof accuracy diterima 200", r.status_code == 200,
          f"code={r.status_code}")
    check("A4 log suspicious accuracy",
          log is not None and log["status"] == "suspicious"
          and "accuracy" in log["reason"],
          f"log={log['status'] if log else None}:{log['reason'][:60] if log else ''}")

    # ---------- A5 di luar radius ----------
    r = await face_check(tok1, frames_normal(), ["front"] * 3,
                         LAT1 + 0.05, LNG1 + 0.05, 5.0, LAT1, LNG1)
    log = await latest_log(MAIL1)
    check("A5 luar geofence ditolak 403", r.status_code == 403,
          f"code={r.status_code}")
    check("A5 log rejected geofence",
          log is not None and log["status"] == "rejected" and "geofence" in log["reason"],
          f"log={log['status'] if log else None}")

    # ---------- A6 IP mismatch (VPN) ----------
    r = await face_check(tok1, frames_normal(), ["front"] * 3,
                         LAT1, LNG1, 5.0, SF_LAT, SF_LNG)
    log = await wait_log(MAIL1, ("suspicious",))
    check("A6 VPN diterima 200", r.status_code == 200, f"code={r.status_code}")
    check("A6 log suspicious ip mismatch",
          log is not None and log["status"] == "suspicious"
          and "ip mismatch" in log["reason"],
          f"log={log['status'] if log else None}:{log['reason'][:60] if log else ''}")

    # ---------- A7 anomali teleport ----------
    r = await face_check(tok1, frames_normal(), ["front"] * 3,
                         LAT2, LNG2, 5.0, LAT2, LNG2)
    log = await latest_log(MAIL1)
    check("A7 teleport ditolak 403", r.status_code == 403, f"code={r.status_code}")
    check("A7 log rejected teleport",
          log is not None and log["status"] == "rejected" and "teleport" in log["reason"],
          f"log={log['status'] if log else None}:{log['reason'][:60] if log else ''}")

    # ---------- A8 rate limit ----------
    for _ in range(6):
        await face_check(tok1, frames_static(), ["front"] * 3,
                         LAT1, LNG1, 5.0, LAT1, LNG1)
    r = await face_check(tok1, frames_normal(), ["front"] * 3,
                         LAT1, LNG1, 5.0, LAT1, LNG1)
    log = await latest_log(MAIL1)
    check("A8 rate limit 429", r.status_code == 429, f"code={r.status_code}")
    check("A8 log rejected blocked",
          log is not None and log["status"] == "rejected" and "blocked" in log["reason"],
          f"log={log['status'] if log else None}")

    await purge()
    print(f"\nUAT 5.3: {len(PASS)} PASS, {len(FAIL)} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(run())
