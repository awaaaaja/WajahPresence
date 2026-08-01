# PLAN.md — Sistem Absensi Face Recognition + Live Location

## 1. Ringkasan Proyek

Sistem absensi berbasis pengenalan wajah (strict enrollment) yang dikombinasikan dengan verifikasi lokasi real-time anti-fake-GPS. Tujuan utama: memastikan absensi hanya bisa dilakukan oleh orang yang terdaftar, secara live (bukan foto), di lokasi yang sah (bukan GPS palsu).

## 2. Tujuan (Goals)

- Menghilangkan absensi titip/joki melalui verifikasi wajah + liveness detection
- Menghilangkan absensi dari luar lokasi melalui multi-signal location verification
- Menyediakan audit trail lengkap untuk setiap percobaan absen (berhasil maupun gagal/mencurigakan)
- Dashboard admin untuk kelola user, approval enrollment, dan monitoring anomali

## 3. Non-Goals (Di luar Scope Awal)

- Tidak menjamin 100% anti-spoofing pada device root/jailbreak tingkat lanjut (mitigasi, bukan eliminasi total)
- Tidak mencakup payroll/penggajian otomatis (hanya pencatatan kehadiran)
- Versi awal tidak mendukung absen offline (butuh koneksi internet untuk validasi backend)

## 4. Arsitektur Tingkat Tinggi

```
[Web App - Next.js, Mobile-First UI, PWA]
   ├─ Auth: Supabase Auth
   ├─ Upload foto: Supabase Storage
   ├─ Face Capture + Liveness (getUserMedia + TensorFlow.js/MediaPipe di browser)
   ├─ GPS (Geolocation API) + Accuracy Check
   ├─ CRUD sederhana (locations, profile) → langsung ke Supabase via client SDK
   └─ ---> API Request (khusus proses wajah) ---> [Backend FastAPI - Face Processing Service]
                                  ├─ Face Matching Service (InsightFace + pgvector di Supabase Postgres)
                                  ├─ Location Validation Service (PostGIS di Supabase + GPS accuracy + IP geolocation cross-check)
                                  ├─ Anomaly Detection (rule-based, termasuk teleport check)
                                  └─ Audit Log Service
                                        │
                              [Supabase: PostgreSQL + pgvector + PostGIS extension]
                              [Supabase Storage untuk foto wajah]

[Admin Dashboard - Next.js]
   └─ Kelola user, approval, monitoring, laporan
```

Catatan: User-facing web app dan Admin Dashboard bisa dibuat sebagai satu Next.js project dengan route terpisah (`/app` untuk user, `/admin` untuk admin) atau dua project terpisah. Rekomendasi: satu project untuk efisiensi development awal, dipecah nanti kalau perlu scaling terpisah.

Backend FastAPI hanya menangani proses yang butuh Python (face embedding extraction, verifikasi liveness server-side). Operasi CRUD sederhana (kelola user, lokasi, baca log) bisa langsung dari Next.js ke Supabase via client SDK tanpa lewat FastAPI, mengurangi kompleksitas.

## 5. Tech Stack Final

| Layer | Pilihan |
|---|---|
| Web App (User) | Next.js 14 (App Router) + TypeScript + Tailwind, mobile-first responsive, PWA (installable) |
| Admin Dashboard | Next.js 14 (App Router) + TypeScript + Tailwind |
| Kamera Browser | `getUserMedia` (MediaDevices API) |
| Backend API (Face Processing) | FastAPI (Python 3.11+) — khusus proses yang butuh Python |
| Face Recognition | InsightFace (buffalo_l) — jalan di FastAPI |
| Liveness Detection | MediaPipe Face Mesh (via TensorFlow.js/WASM di browser untuk pre-check) + verifikasi ulang di FastAPI |
| Database | Supabase (PostgreSQL 16 terkelola) + pgvector + PostGIS extension |
| Auth | Supabase Auth (JWT bawaan, termasuk row-level security) |
| Object Storage | Supabase Storage (S3-compatible) |
| Cache/Rate Limit | Postgres-based counter (v1, via Supabase) — upgrade ke Redis kalau traffic tinggi |
| Deployment | Supabase (managed) untuk DB/Auth/Storage; Docker/VPS untuk FastAPI; Vercel untuk Next.js |

## 6. Milestone Besar

| Fase | Output | Estimasi |
|---|---|---|
| Fase 0 — Setup & Infra | Setup project Supabase, repo, skeleton BE (FastAPI) + Web App | 2-3 hari |
| Fase 1 — Face Enrollment | Registrasi wajah multi-angle + liveness | 1-2 minggu |
| Fase 2 — Face Matching Absensi | Absen via wajah + pgvector search | 1-2 minggu |
| Fase 3 — Location Verification | GPS + geofence + IP cross-check + anomaly detection | 1-2 minggu |
| Fase 4 — Admin Dashboard | Kelola user, log, laporan, monitoring | 1-2 minggu |
| Fase 5 — Hardening & Testing | Security review, load test, UAT | 1 minggu |

Detail per-sprint ada di `SPRINT.md`. Spesifikasi fungsional lengkap ada di `PRD.md`. Aturan kerja untuk AI agent ada di `AGENTS.md`.

## 7. Risiko Utama

- **False Accept/Reject wajah** → mitigasi: threshold tuning + multi-sample enrollment
- **Fake GPS jauh lebih mudah di-bypass di web dibanding native app** (browser tidak punya API mock-location detection, tidak ada WiFi BSSID scan) → mitigasi: GPS accuracy check + IP geolocation cross-check + anomaly teleport detection. Ini **known limitation**, bukan solusi setara native app — didokumentasikan eksplisit ke user/institusi
- **Privasi data biometrik** → mitigasi: enkripsi at-rest, retention policy, consent eksplisit saat registrasi
- **Performa inference di device low-end** → mitigasi: proses matching berat di backend, device hanya capture + pre-check ringan
- **Row-Level Security (RLS) Supabase salah konfigurasi** → berisiko data user lain (termasuk embedding wajah) bisa diakses langsung dari client via Supabase SDK. Mitigasi: RLS wajib aktif di semua tabel sensitif sejak awal, akses tabel `face_embeddings` HANYA lewat service role key di backend FastAPI, tidak pernah lewat client-side SDK

## 8. Alur Kerja Pengembangan

Mengikuti workflow stage-gated standar:
`[THINKING] → [BUILD] → [EKSEKUSI] → [REVIEW] → [PERBAIKI JIKA ADA SALAH DAN MANTAPKAN]`

Setiap sprint di `SPRINT.md` mengikuti siklus ini per task.
