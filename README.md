# WajahPresence

Sistem absensi **face recognition + live location** (web app mobile-first, PWA).
User absen dengan scan wajah (liveness detection) + lokasi GPS yang
divalidasi multi-signal; admin mereview log & user via dashboard.

Arsitektur (Prompt 0.1):

```
/backend           FastAPI — face processing (InsightFace), location validation (PostGIS), liveness
/web-app           Next.js 14 App Router — user: enrollment + absensi, mobile-first PWA
/admin-dashboard   Next.js 14 App Router — admin: review user, log, ekspor
/supabase          Migrasi SQL (RLS, pgvector, PostGIS), konfigurasi
/docs              AGENTS.md, PRD.md, PLAN.md, SPRINT.md, PROMPTS.md
```

## Prasyarat

- Python 3.11+ (backend), Node.js 18+ (frontend)
- Proyek Supabase (Postgres + Auth + Storage) — ekstensi `vector` (pgvector) dan `postgis` WAJIB aktif
- Model InsightFace (buffalo_l) didownload otomatis ke `~/.insightface/models` saat pertama jalan

## 1. Database (Supabase)

1. Buat proyek di Supabase Dashboard.
2. Aktifkan ekstensi di SQL editor: `create extension if not exists vector; create extension if not exists postgis;`
3. Jalan-kan migrasi dalam urutan: `supabase/migrations/` (via Supabase CLI atau SQL editor Dashboard).
4. Buat bucket storage privat: `face-samples` dan `attendance-evidence` (backend juga membuat otomatis saat dipakai).

## 2. Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt        # (atau: uv sync — lihat pyproject.toml)
cp .env.example .env                   # isi nilai: DATABASE_URL, SUPABASE_URL, SERVICE_ROLE_KEY, dst.
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Swagger: `http://localhost:8000/docs` (cek log "JWKS hangat" = verifikasi JWT siap).
- **DATABASE_URL wajib memakai transaction pooler port 6543** (`aws-0-<region>.pooler.supabase.com:6543`), BUKAN session pooler 5432 (maks 15 koneksi, rentan `EMAXCONNSESSION`). Semua koneksi asyncpg memakai `statement_cache_size=0` (diwajibkan mode transaction pgbouncer) — sudah diatur di `app/core/database.py`, jangan diubah tanpa alasan.
- `DEV_MODE=true` menghormati header `X-GeoIP-Override-Lat/Lng` (test deterministik) dan detail error di `/health`. **Wajib false di production.**
- Env var lengkap: `backend/.env.example` (threshold face/liveness/rate-limit/lokasi/retensi semua bisa di-tuning tanpa ubah kode).

## 3. Frontend

```bash
# web-app (user) dan admin-dashboard (admin) — masing-masing:
cd web-app            # atau admin-dashboard
npm install
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_BACKEND_URL
npm run dev
```

Frontend hanya memakai anon/publishable key + RLS (tabel `face_embeddings` tertutup total dari client). Service role key TIDAK boleh ada di frontend.

## 4. Uji (backend)

```bash
cd backend && .venv/bin/python -m pytest tests/ -q        # unit + E2E API (38 test)
.venv/bin/python tests/loadtest/loadtest_500.py --force   # load test NFR-1 (butuh env)
.venv/bin/python tests/uat/uat_53.py                      # UAT PRD §7 (19 skenario)
```

Script test butuh env: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `DATABASE_URL` (port 6543). Lihat `docs/SPRINT.md` 5.2/5.3 untuk hasil & konteks.

## 5. Deployment Free Tier (aktif)

| Komponen | Host | URL |
|---|---|---|
| web-app (user) | Vercel Hobby | https://wajahpresence-web.vercel.app |
| admin-dashboard | Vercel Hobby | https://wajahpresence-admin.vercel.app |
| backend (FastAPI) | Railway (trial $5/30 hari) | https://wajahpresence-backend-production.up.railway.app |
| database + auth + storage | Supabase Free | (proyek yang sama dengan dev) |

Cara deploy ulang:
- **Frontend**: `cd web-app && vercel deploy --prod --yes` (env di dashboard Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BACKEND_URL`)
- **Backend**: `cd backend && railway up` — build via `Dockerfile` (apt libs utk cv2 + pre-download model InsightFace ke image, cold start ±4-5 menit), start `uvicorn app.main:app` di port `$PORT`, healthcheck `/health` (timeout 15 menit). Konfigurasi: `railway.toml` + `nixpacks.toml`.
- **Env backend production**: `DEV_MODE=false`, `CORS_ORIGINS` = JSON array berisi domain Vercel, `DATABASE_URL` port 6543 (lihat `backend/.env.example`).

Catatan free tier (hasil uji produksi):
- Backend Railway trial: RAM 1 GB (naikkan via API `serviceInstanceLimitsUpdate` bila perlu; default 512 MB → **OOM saat load model InsightFace** — sudah dinaikkan ke 1 GB). CPU shared lemah: face-check ±6 dtk/request (vs 2,7 dtk di dev box), enrollment ±50 dtk.
- IP egress Railway (AWS US) ≠ lokasi kantor → absen selalu ter-flag `suspicious` (IP mismatch) — normal untuk demo dari cloud; solusi saat hosting di IDN: `CORS_ORIGINS` + region Railway di Asia Tenggara, atau set `GEOIP_MISMATCH_KM` lebih besar.
- Trial Railway habis 30 hari / kredit $5 — migrasi cepat ke HF Spaces CPU (Dockerfile sudah siap) bila perlu.

## 6. Catatan Deployment (hasil Sprint 5.2-5.3)

- **NFR-1 (p95 < 3 dtk)**: tercapai utk skenario 1 user mobile (p95 2,7 dtk) di mesin dev 4-core. Burst ≥5 request serentak butuh ≥8 core / GPU (liveness CPU-bound). 
- **Keamanan lokasi (PRD §8)**: web app TIDAK bisa mendeteksi fake-GPS secara definitif; sistem menandai `suspicious` (accuracy tidak wajar, IP mismatch, anomali teleport) untuk review admin — bukan reject otomatis. Ini keterbatasan browser yang sudah disepakati, bukan bug.
- **Retensi (NFR-5)**: foto bukti absen otomatis dihapus setelah `EVIDENCE_RETENTION_DAYS` (90).
- Backend minimal 1 vCPU @ 2 core, RAM 4 GB (model InsightFace ~1 GB); disarankan 4 core untuk headroom liveness.
