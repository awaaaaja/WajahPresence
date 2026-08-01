# AGENTS.md — Panduan Kerja AI Agent (OpenCode)
## Sistem Absensi Face Recognition + Live Location

### 1. Konteks Proyek

Baca `PRD.md` dan `PLAN.md` terlebih dahulu sebelum mengerjakan task apapun. Semua keputusan teknis harus konsisten dengan tech stack yang sudah ditentukan di sana. Jangan mengganti library/layanan inti (InsightFace, pgvector, PostGIS, FastAPI, Next.js, Supabase) tanpa konfirmasi eksplisit dari user.

Proyek ini adalah **Web App (mobile-first UI, PWA)**, bukan native app. Semua akses kamera/lokasi HARUS via browser Web API (`getUserMedia`, `Geolocation API`) — jangan asumsikan tersedia native module seperti mock-location detection atau WiFi BSSID scanning, karena keduanya tidak ada di browser. Lihat `PRD.md` §8 untuk keterbatasan yang sudah disepakati.

### 2. Alur Kerja Wajib (Stage-Gated)

Setiap task besar HARUS melalui siklus berikut, tidak boleh loncat tahap:

1. **[THINKING]** — Jelaskan pemahaman terhadap task, identifikasi ambiguitas, susun rencana teknis singkat sebelum menulis kode
2. **[BUILD]** — Implementasi kode sesuai rencana
3. **[EKSEKUSI]** — Jalankan/test kode yang dibuat (unit test, manual run, atau simulasi)
4. **[REVIEW]** — Evaluasi hasil terhadap acceptance criteria di `SPRINT.md`/`PRD.md`
5. **[PERBAIKI JIKA ADA SALAH DAN MANTAPKAN]** — Perbaiki bug/gap, lalu finalisasi

Agent tidak boleh melompat langsung ke [BUILD] tanpa [THINKING] eksplisit, terutama untuk modul yang menyentuh security (face matching threshold, location validation, auth).

### 3. Struktur Repo yang Diharapkan

```
/backend         → FastAPI, face matching service, location service (khusus proses yang butuh Python)
/web-app         → Next.js user-facing app (enrollment + absensi), mobile-first, PWA
/admin-dashboard → Next.js admin panel (bisa digabung dengan /web-app via route /admin jika dipilih arsitektur single-project)
/supabase        → migrasi SQL, RLS policies, seed data, konfigurasi lokal Supabase CLI
/docs            → PLAN.md, PRD.md, AGENTS.md, SPRINT.md, PROMPTS.md
```

### 4. Aturan Khusus per Domain

**Face Recognition & Liveness**
- Threshold matching TIDAK boleh diturunkan demi "kemudahan testing" tanpa flag eksplisit `DEV_MODE`
- Liveness check tidak boleh di-bypass di kode production path, walau untuk keperluan demo — buat mode terpisah yang jelas ditandai
- Semua embedding disimpan sebagai vector, jangan simpan foto mentah sebagai satu-satunya sumber matching (foto hanya untuk audit)

**Location Verification**
- Jangan pernah percaya koordinat GPS tunggal tanpa cross-check (accuracy value + IP geolocation + anomaly teleport check) — ini prinsip inti "strict" yang masih relevan meskipun di web, walau tidak sekuat native app
- Perhitungan jarak geofence gunakan PostGIS (`ST_DWithin`), bukan hitungan manual Haversine di application layer, untuk akurasi dan performa
- Jangan klaim di kode/komentar/UI bahwa sistem "anti fake-GPS" secara mutlak — selalu framing sebagai "deteksi indikasi mencurigakan", karena browser tidak punya API definitif untuk ini (lihat `PRD.md` §8)

**Supabase**
- Gunakan `service_role` key HANYA di backend FastAPI (server-side), tidak pernah diekspos ke client Next.js
- Client Next.js hanya boleh pakai `anon` key, dan HARUS tunduk pada RLS policy — jangan matikan RLS demi kemudahan development
- Tabel `face_embeddings` WAJIB punya RLS yang menolak akses langsung dari client sama sekali (akses hanya lewat FastAPI dengan service role)
- Tabel yang aman diakses langsung dari client via Supabase SDK (dengan RLS user-scoped): `locations` (read-only untuk user biasa), `attendance_logs` milik user sendiri
- Migrasi skema database ditulis sebagai SQL file di `/supabase/migrations`, dikelola via Supabase CLI, bukan diubah manual lewat dashboard untuk environment production

**Keamanan & Privasi**
- Semua endpoint FastAPI yang menerima data wajah/lokasi WAJIB memvalidasi JWT dari Supabase Auth (verifikasi signature menggunakan Supabase JWT secret)
- Jangan log embedding mentah atau foto wajah ke console/log file biasa — gunakan storage khusus dengan akses terbatas
- Rate limit endpoint absensi per user (mis. max 10 percobaan gagal per jam) — v1 menggunakan counter berbasis tabel Postgres di Supabase (query count dalam window waktu), upgrade ke Redis jika volume traffic mulai signifikan

### 5. Konvensi Kode

- Backend: Python type hints wajib, Pydantic untuk semua request/response schema
- Frontend/Web App: TypeScript strict mode, tidak ada `any` tanpa justifikasi komentar
- Commit message: `[FASE-X] deskripsi singkat` mengikuti fase di `PLAN.md`
- Bahasa dokumentasi kode & komentar: Bahasa Indonesia untuk konteks bisnis, Inggris untuk istilah teknis umum

### 6. Testing Minimum

- Backend: unit test untuk face matching threshold logic, location validation logic (bukan hanya happy path — wajib test kasus reject)
- Web App: test manual liveness flow di browser mobile fisik (Chrome Android & Safari iOS — perilaku `getUserMedia`/`Geolocation API` berbeda antar browser)
- Selalu sertakan test case "adversarial": foto statis, GPS di-spoof via browser dev tools/extension, IP via VPN

### 7. Output yang Diharapkan dari Agent

Untuk setiap task di `SPRINT.md`, agent menghasilkan:
- Kode yang berjalan (bukan pseudocode) kecuali diminta sebaliknya
- Ringkasan singkat perubahan (bukan penjelasan panjang lebar)
- Daftar file yang diubah/dibuat
- Catatan jika ada deviasi dari `PRD.md` beserta alasannya

### 8. Larangan

- Jangan generate kredensial/API key palsu ke dalam kode — gunakan environment variable placeholder
- Jangan hardcode koordinat lokasi asli ke dalam kode, gunakan seed data terpisah
- Jangan menonaktifkan validasi keamanan (liveness, geofence check) untuk "mempercepat development" tanpa penanda `DEV_MODE` yang jelas dan terpisah dari build production
- Jangan minta permission kamera/lokasi browser sekaligus di awal — minta sesuai konteks (kamera saat mulai capture, lokasi saat mulai proses absen) agar tidak menakuti user dan sesuai best practice PWA
