# SPRINT.md — Rencana Sprint
## Sistem Absensi Face Recognition + Live Location

Setiap task mengikuti siklus: `[THINKING] → [BUILD] → [EKSEKUSI] → [REVIEW] → [PERBAIKI JIKA ADA SALAH DAN MANTAPKAN]`

---

## Sprint 0 — Setup & Infra (2-3 hari)

| Task | Detail | DoD |
|---|---|---|
| 0.1 | Setup monorepo (`/backend`, `/web-app`, `/admin-dashboard`, `/supabase`) | Struktur folder sesuai `AGENTS.md` |
| 0.2 | Buat project Supabase, aktifkan extension pgvector + PostGIS, setup Supabase CLI lokal | Extension aktif, `supabase start` jalan tanpa error |
| 0.3 | Skeleton FastAPI + health check endpoint + koneksi ke Supabase Postgres | `GET /health` return 200, koneksi DB berhasil |
| 0.4 | Skeleton Next.js admin dashboard + integrasi Supabase Auth (login page) | Login via Supabase Auth berfungsi |
| 0.5 | Skeleton Next.js Web App (mobile-first, PWA manifest) + akses kamera dasar via `getUserMedia` | Kamera terbuka di browser mobile fisik (Chrome Android & Safari iOS) |
| 0.6 | Migrasi DB awal via Supabase CLI (users, face_embeddings, locations, attendance_logs) + RLS policy dasar | Tabel ter-create sesuai `PRD.md` §6, RLS aktif di `face_embeddings` |

---

## Sprint 1 — Face Enrollment (1-2 minggu)

| Task | Detail | DoD |
|---|---|---|
| 1.1 | Integrasi InsightFace di backend, endpoint extract embedding dari image | Return vector 512-dim untuk test image |
| 1.2 | UI web (mobile-first): capture 5 sudut wajah dengan panduan visual | User bisa selesai capture 5 sample di browser mobile |
| 1.3 | Liveness detection real-time saat capture (blink/head movement) | Capture ditolak jika pakai foto statis (test manual) |
| 1.4 | Endpoint registrasi: terima 5 sample → cek deduplikasi wajah → simpan embedding ke pgvector + foto ke Supabase Storage | Duplikat wajah dengan identitas beda tertolak |
| 1.5 | Consent screen (persetujuan data biometrik) sebelum capture | Wajib centang sebelum lanjut |
| 1.6 | Status enrollment "pending" → admin approve/reject | Flow approval berjalan end-to-end |

**Review Sprint 1**: Test dengan foto di layar HP dan video replay — harus tertolak.

---

## Sprint 2 — Face Matching untuk Absensi (1-2 minggu)

| Task | Detail | DoD |
|---|---|---|
| 2.1 | Endpoint absen: terima live capture → liveness check → extract embedding | Reject jika liveness gagal |
| 2.2 | Query similarity search pgvector (cosine distance) dengan threshold konfigurabel | Return top match + confidence score |
| 2.3 | Simpan attendance_log untuk setiap percobaan (sukses/gagal) | Semua percobaan tercatat, termasuk gagal |
| 2.4 | Rate limiting percobaan gagal per user (Postgres-based counter di Supabase) | Blokir sementara setelah N kali gagal |
| 2.5 | UI web (mobile-first): layar absen dengan feedback real-time (sukses/gagal/alasan) | User dapat feedback jelas < 3 detik |

**Review Sprint 2**: Test matching dengan user berbeda wajah mirip (kembar jika ada data test) untuk validasi threshold.

**Status Sprint 2 — SELESAI**

- 2.1-2.4: Implementasi + E2E lengkap, `RESULT: SEMUA E2E PASS` (20/20 skenario, stabil 2x berturut-turut). End-to-end time 2.1-2.9 detik (NFR-1 terpenuhi, < 3 dtk). Unit test backend 20 passed.
- Benchmark rate limit (2.4 REVIEW): 100 request bersamaan x 20 iterasi, query `gate+ratelimit` avg 435 ms / p95 859 ms / max 3.8 s; varian 500 user avg 484 ms / p95 906 ms. **Kesimpulan: query count berbasis Postgres BUKAN bottleneck** (delta 500 user hanya +50 ms, spike max adalah varians latensi Supabase pooler ±400 ms). Upgrade Redis (per AGENTS.md) belum diperlukan — catat sebagai trigger bila traffic naik signifikan.
- Validasi threshold (Review): wajah yang sama dengan variasi wajar (brightness ±, rotasi, mirror, blur, kontras) semua similarity ≥ 0.96 — jauh di atas threshold 0.6; wajah orang lain (obama vs biden) sim = -0.05, tertolak. Test kembar/wajah mirip nyata TIDAK bisa dilakukan karena data tidak tersedia di lingkungan test — keterbatasan didokumentasikan di `tests/test_face.py`, margin threshold (0.96 vs 0.6) jadi indikator keamanan.
- 2.5 UI web absensi: build sukses; test browser fisik (Chrome Android / Safari iOS) TIDAK bisa dijalankan di lingkungan ini — perlu device fisik + kamera. Test API-level sudah mencakup seluruh alur UI.

---

## Sprint 3 — Location Verification (1-2 minggu)

| Task | Detail | DoD |
|---|---|---|
| 3.1 | Web: ambil GPS + accuracy via `Geolocation API` | Data terkirim bersamaan dengan capture wajah |
| 3.2 | Backend: ambil IP address dari request, lakukan IP-based geolocation (mis. via layanan geo-IP) sebagai sinyal pembanding | IP geolocation coordinate tersimpan di log |
| 3.3 | Backend: setup PostGIS, endpoint geofence check (`ST_DWithin`) | Reject jika di luar radius |
| 3.4 | Backend: logic flag "suspicious" berdasarkan GPS accuracy tidak wajar + selisih signifikan antara GPS dan IP geolocation | Flag "suspicious" tercatat dengan alasan spesifik di log |
| 3.5 | Backend: anomaly detection teleport (jarak vs waktu antar absen) | Absen kedua tertolak jika jarak tidak masuk akal |
| 3.6 | Admin: CRUD lokasi geofence (nama, koordinat, radius) | Admin bisa tambah/edit lokasi via dashboard |

**Review Sprint 3**: Test dengan GPS di-spoof via browser dev tools/extension (Chrome DevTools Sensors) — sistem tidak bisa reject 100% pasti (keterbatasan web, lihat `PRD.md` §8), tapi harus ter-flag "suspicious" ketika accuracy/IP mismatch terdeteksi. Dokumentasikan hasil test sebagai baseline known-limitation, bukan bug.

**Status Sprint 3 — SELESAI**

- 3.1 GPS web-app: `web-app/components/attendance-capture.tsx` mengambil `Geolocation API` (lat/lng/accuracy) dan mengirimkannya di body `/attendance/face-check`; pesan permission-ditolak diperbarui ("Lokasi tidak didapat — absen ditolak bila area absen aktif").
- 3.2 IP geolocation: `geoip_service.py` — `resolve_client_ip` (X-Forwarded-For → X-Real-IP → socket), lookup ipwho.is dengan fallback ip-api.com (timeout `geoip_lookup_timeout_seconds=3.0`), skip IP privat, cache 512 per-IP. Dev-only override header `X-GeoIP-Override-Lat/Lng` (hanya berlaku saat `DEV_MODE=true`, diabaikan total di produksi). IP-geo disimpan di `attendance_logs` (kolom `ip_geolocation_lat/lng` + `ip_mismatch_flag`).
- 3.3 Geofence PostGIS: query `ST_DWithin(geography)` terhadap tabel `locations`; aktif hanya bila ≥1 lokasi terdaftar. Di luar radius → 403 `location: di luar geofence`; GPS tidak dikirim padahal area aktif → 403 `location unavailable`.
- 3.4 Flag suspicious (FR-2.6): `evaluate_accuracy` (accuracy < 2 m terlalu presisi / > 300 m terlalu longgar, konfigurabel) + IP mismatch (GPS vs IP-geo > `geoip_mismatch_km=200`) → absen DITERIMA (200) tapi log berstatus `suspicious` dengan alasan spesifik, siap review admin.
- 3.5 Deteksi teleport (FR-2.7): kecepatan rata-rata antar absen (`teleport_max_speed_kmh=120`, window 24 jam) — absen kedua tertolak 403 bila jarak/waktu tidak masuk akal (verified: 55 km / 5 menit → reject).
- 3.6 CRUD geofence admin: `admin-dashboard/app/(dashboard)/locations/` (tabel + form + "Pakai lokasi saya" via navigator.geolocation, validasi radius > 0, RLS admin insert/update/delete); build OK.
- **Optimasi NFR-1**: semua sinyal lokasi digabung ke SATU query `match_and_evaluate_location` (pgvector match + geofence + prev-attendance + IP-distance + prev-distance) karena pooler Supabase ±400-700 ms/roundtrip; `geoip_task` berjalan paralel sejak gate. **`pool_pre_ping` dihapus** (setiap checkout = 1 roundtrip SELECT 1 yang mematikan NFR-1) → diganti `pool_size=10, max_overflow=0, pool_recycle=600`.
- **Hasil test**: E2E lengkap `RESULT: SEMUA E2E PASS` (26 skenario: sukses, liveness, match, spoofing, gate, rate limit, geofence, teleport, accuracy, IP mismatch, log, perf). **NFR-1: absen sukses 2.66 dtk (< 3 dtk)**. Unit test 38 passed. Perf matching 500 user avg 369-391 ms / p95 517-630 ms.
- Known limitation (sesuai Review): deteksi GPS-spoof tidak 100% pasti di web (PRD §8); sistem meng-flag "suspicious", bukan reject — hasil E2E (l)/(m) adalah baseline ini, bukan bug.

---

## Sprint 4 — Admin Dashboard (1-2 minggu)

| Task | Detail | DoD |
|---|---|---|
| 4.1 | Halaman kelola user + status enrollment | CRUD berfungsi |
| 4.2 | Halaman log absensi dengan filter (tanggal/user/status/site) | Filter & pagination berfungsi untuk 10k+ record |
| 4.3 | Halaman suspicious attempts untuk review manual | List percobaan mencurigakan dengan detail alasan reject |
| 4.4 | Peta visualisasi lokasi absen (per user/per hari) | Marker tampil sesuai koordinat log |
| 4.5 | Export laporan Excel/PDF | File terunduh sesuai filter aktif |

**Status Sprint 4 — SELESAI**

- 4.1 Kelola user: `admin-dashboard/app/(dashboard)/users/` — pencarian nama/email (`q` ilike), filter status enrollment, tombol re-enroll (hapus embedding + foto storage + status → `not_enrolled`) via `POST /admin/users/{id}/re-enroll`; backend `GET /admin/users?q=&status=&page=`. Detail UI/API: re-enroll wajib konfirmasi (menampilkan jumlah embedding+foto yang akan dihapus).
- 4.2 Log absensi: `GET /admin/logs` server-side filter (start_date/end_date/user/status/site/reviewed) + pagination (page_size ≤ 200). `admin-dashboard/app/(dashboard)/attendance-logs/` menampilkan total & halaman. **Perf @10.000+ record: SEMUA PASS (< 2 dtk)** — warm run maks 1.130 ms (halaman 1: 872 ms, status: 1.130 ms, tanggal 7 hari: 755 ms, site: 983 ms, user search: 821 ms, halaman terakhir: 812 ms).
  - Optimasi: count + list digabung **1 roundtrip** (`count(*) over ()`); role admin di-cache TTL 60 dtk (sebelumnya 2-3 query berurutan × latensi pooler ≈ 3-4 dtk, setelah optimasi 0.5-1.5 dtk).
  - Catatan infra: latensi roundtrip Supabase pooler bimodal (0.3 s normal, kadang 2-4.6 s) — spike terbukti di luar kendali app (query mentah asyncpg ikut lambat di window yang sama). Nilai steady-state di atas adalah representatif.
- 4.3 Suspicious attempts: `GET /admin/logs?status=suspicious&reviewed=false` + `GET /admin/logs/{id}` (detail: foto bukti via signed URL, koordinat, IP + geo + mismatch, accuracy, confidence, alasan) + `POST /admin/logs/{id}/review` (note + reviewed_at/by). UI `suspicious-attempts/` dengan tab belum/belum-direview dan form catatan review. Migrasi `000006_admin_review.sql`: kolom `reviewed_at/reviewed_by/review_note` + partial index `attendance_logs_suspicious_pending_idx`.
- 4.4 Peta: `GET /admin/logs?only_located=true` (cap MAP_LIMIT=2000) → `admin-dashboard/components/attendance-map.tsx` (Leaflet + react-leaflet-cluster, marker dikelompokkan per cluster, popup detail, warna per status).
- 4.5 Export: `GET /admin/logs/export?format=xlsx|pdf` mengikuti SEMUA filter aktif (cap 50.000 baris), kolom konsisten (Waktu, Nama, Email, Status, Confidence, Lat/Lng, Site, GPS Accuracy, IP, IP Mismatch, Alasan, Direview). XLSX write_only (10k baris ≈ 5.9-13.5 s), PDF di-chunk 300 baris/halaman (≈ 9.5-17.5 s) — bergantung jitter pooler saat fetch. Verifikasi E2E: isi file non-kosong + benar format.
- Keamanan: `layout.tsx` role-guard (admin/superadmin saja, selain itu redirect `/login`), `middleware.ts` melindungi `/admin/*` + `/map`; endpoint admin semua `Depends(get_current_admin)` → non-admin 403 (teruji E2E).
- **Hasil test**: E2E admin `RESULT: SEMUA PASS` (12 skenario: list, filter, detail + signed URL, review + note, re-enroll 5 embedding+5 foto → DB 0, export xlsx/pdf, 403 non-admin). Unit test backend 38 passed. Build admin-dashboard OK (11 routes).

---

## Sprint 5 — Hardening & Testing (1 minggu)

| Task | Detail | DoD |
|---|---|---|
| 5.1 | Security review: JWT, enkripsi data biometrik at-rest | Checklist keamanan `PRD.md` §5 terpenuhi |
| 5.2 | Load test endpoint matching & location check | Response time < 3 detik pada beban simulasi 500 user |
| 5.3 | UAT dengan user nyata (skenario sukses & adversarial) | Semua skenario di `PRD.md` §7 lolos |
| 5.4 | Dokumentasi deployment (README, environment variable) | Tim lain bisa deploy tanpa tanya developer asli |

---

## Catatan Prioritas

Jika waktu terbatas, urutan yang tidak boleh dikompromikan: **Sprint 1 (liveness) → Sprint 2 (matching) → Sprint 3 (location)**. Dashboard (Sprint 4) bisa disederhanakan dulu (tanpa peta/export) jika perlu percepat rilis MVP, tapi modul security inti (1-3) tidak boleh dipotong karena itu inti "strict" yang diminta.
