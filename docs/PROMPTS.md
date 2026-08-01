# PROMPTS.md — Prompt Siap Pakai untuk OpenCode
## Sistem Absensi Face Recognition + Live Location

Setiap prompt mengasumsikan agent sudah membaca `PLAN.md`, `PRD.md`, `AGENTS.md`, dan `SPRINT.md` di root repo. Jalankan satu prompt per task, tunggu hasil [REVIEW] sebelum lanjut ke prompt berikutnya.

---

## Sprint 0 — Setup & Infra

### Prompt 0.1 — Setup Monorepo
```
[THINKING] Baca AGENTS.md bagian struktur repo. Rencanakan struktur folder monorepo untuk proyek ini sebelum membuat file apapun.

[BUILD] Buat struktur monorepo dengan folder: /backend (FastAPI), /web-app (Next.js 14 App Router + TypeScript + Tailwind, mobile-first, konfigurasi PWA), /admin-dashboard (Next.js 14 App Router + TypeScript + Tailwind), /supabase (untuk migrasi SQL & konfigurasi Supabase CLI), /docs (pindahkan PLAN.md, PRD.md, AGENTS.md, SPRINT.md, PROMPTS.md ke sini). Inisialisasi masing-masing project dengan konfigurasi dasar (package.json, tsconfig, requirements.txt/pyproject.toml).

[EKSEKUSI] Jalankan install dependency di masing-masing folder, pastikan tidak ada error.

[REVIEW] Konfirmasi struktur folder sesuai AGENTS.md §3. Laporkan versi tiap tool yang terpasang.
```

### Prompt 0.2 — Setup Project Supabase
```
[THINKING] Rencanakan setup project Supabase (bisa via dashboard Supabase atau Supabase CLI untuk local development). Pastikan extension pgvector dan PostGIS diaktifkan. Rencanakan juga struktur environment variable untuk connection string dan API key (anon key vs service role key), gunakan placeholder di .env.example, jangan hardcode.

[BUILD] Setup Supabase CLI di /supabase, jalankan `supabase init`, konfigurasi `supabase/config.toml`. Buat migrasi awal yang mengaktifkan extension: `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS postgis;`. Buat .env.example dengan variable SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

[EKSEKUSI] Jalankan `supabase start` untuk local development, cek extension aktif via `supabase db` atau psql.

[REVIEW] Pastikan service_role key TIDAK pernah masuk ke kode frontend (/web-app, /admin-dashboard), hanya dipakai di /backend. Laporkan versi Postgres dan extension yang aktif.
```

### Prompt 0.3 — Skeleton Backend FastAPI
```
[THINKING] Rencanakan struktur folder /backend mengikuti best practice FastAPI (routers, services, models, schemas). Pastikan Pydantic dipakai untuk semua schema sesuai AGENTS.md §5. Rencanakan koneksi ke Supabase Postgres via connection string langsung (bukan lewat Supabase client SDK, karena backend butuh akses SQL penuh untuk query pgvector/PostGIS) dan verifikasi JWT dari Supabase Auth untuk endpoint yang butuh autentikasi.

[BUILD] Buat skeleton FastAPI dengan endpoint GET /health, konfigurasi koneksi database ke Supabase Postgres via SQLAlchemy/asyncpg, middleware verifikasi JWT Supabase Auth, dan struktur folder routers/services/models/schemas.

[EKSEKUSI] Jalankan server, test GET /health return 200 dengan payload status.

[REVIEW] Cek type hints lengkap di semua fungsi, tidak ada credential hardcoded.
```

### Prompt 0.4 — Skeleton Admin Dashboard
```
[THINKING] Rencanakan halaman awal admin dashboard: login page (integrasi Supabase Auth) dan layout dasar dengan sidebar navigasi (Users, Locations, Attendance Logs, Suspicious Attempts).

[BUILD] Buat skeleton Next.js 14 App Router dengan Tailwind, integrasi Supabase client SDK (@supabase/supabase-js atau @supabase/ssr untuk App Router), halaman /login menggunakan Supabase Auth, layout dengan sidebar, dan placeholder untuk halaman-halaman utama.

[EKSEKUSI] Jalankan dev server, screenshot/cek halaman login render dengan benar.

[REVIEW] Pastikan TypeScript strict mode aktif, tidak ada any tanpa justifikasi.
```

### Prompt 0.5 — Skeleton Web App (Mobile-First, PWA)
```
[THINKING] Rencanakan navigasi dasar web app: halaman Registrasi, halaman Absensi, dan permission handling untuk kamera (getUserMedia) + lokasi (Geolocation API). Rencanakan juga manifest.json dan service worker dasar untuk PWA agar bisa "Add to Home Screen".

[BUILD] Buat skeleton Next.js 14 dengan layout mobile-first (viewport meta tag benar, komponen responsive dari breakpoint terkecil), navigasi dasar, PWA manifest, dan implementasi akses kamera minimal via getUserMedia dengan fallback pesan jelas jika browser tidak mendukung.

[EKSEKUSI] Jalankan di browser mobile fisik (Chrome Android dan Safari iOS), pastikan kamera terbuka dan permission diminta dengan benar. Test juga "Add to Home Screen".

[REVIEW] Konfirmasi permission kamera dan lokasi diminta di tahap yang tepat (bukan sekaligus di awal), dan UI tetap mobile-first tanpa overflow/scroll horizontal di layar kecil.
```

### Prompt 0.6 — Migrasi Database Awal + RLS Policy
```
[THINKING] Rencanakan skema tabel sesuai PRD.md §6: users, face_embeddings, locations, attendance_logs. Pastikan tipe data embedding pakai vector(512) dan locations pakai geography/geometry PostGIS. Rencanakan juga RLS policy untuk masing-masing tabel: face_embeddings HARUS tertutup total dari client (hanya bisa diakses via service role di backend), users bisa dibaca terbatas oleh pemiliknya sendiri, locations bisa dibaca semua user terautentikasi tapi hanya admin yang bisa tulis, attendance_logs hanya bisa dibaca oleh pemiliknya sendiri dan admin.

[BUILD] Buat migrasi SQL di /supabase/migrations menggunakan Supabase CLI (`supabase migration new init_schema`) untuk keempat tabel tersebut dengan foreign key dan index yang sesuai (index pada embedding untuk similarity search, index spasial pada locations). Tambahkan migrasi terpisah untuk RLS policy sesuai rencana di atas.

[EKSEKUSI] Jalankan `supabase db reset` atau `supabase migration up`, cek tabel ter-create dengan struktur benar via Supabase Studio atau psql. Test RLS dengan mencoba akses face_embeddings pakai anon key — harus ditolak.

[REVIEW] Verifikasi index untuk pgvector (ivfflat/hnsw) dan index spasial PostGIS sudah dibuat, bukan hanya kolom biasa. Konfirmasi RLS aktif di semua tabel (bukan hanya face_embeddings) dan policy sudah sesuai prinsip least-privilege.
```

---

## Sprint 1 — Face Enrollment

### Prompt 1.1 — Integrasi InsightFace
```
[THINKING] Rencanakan service extraction embedding menggunakan InsightFace (buffalo_l). Pertimbangkan apakah model di-load sekali saat startup (bukan per-request) untuk performa.

[BUILD] Buat service di /backend/services/face_service.py yang menerima image (bytes/base64) dan mengembalikan embedding vector 512-dim. Buat endpoint internal untuk testing.

[EKSEKUSI] Test dengan beberapa foto sample, pastikan embedding konsisten (foto sama menghasilkan embedding mirip, foto beda menghasilkan embedding berbeda).

[REVIEW] Ukur waktu inference per gambar, laporkan apakah perlu optimasi (batching/GPU) sesuai NFR-1 di PRD.md.
```

### Prompt 1.2 — UI Capture Multi-Angle
```
[THINKING] Rencanakan UX capture 5 sudut wajah (depan, kiri, kanan, atas, bawah) dengan panduan visual yang jelas (overlay guide di kamera) agar user awam bisa mengikuti.

[BUILD] Buat halaman registrasi di web app (mobile-first) dengan flow capture 5 sample berurutan menggunakan getUserMedia, progress indicator, dan overlay panduan posisi wajah di atas video stream.

[EKSEKUSI] Test di browser mobile fisik (Chrome Android & Safari iOS), pastikan user bisa menyelesaikan 5 capture tanpa kebingungan.

[REVIEW] Cek UX: apakah ada opsi retake per sample jika hasil buram/tidak jelas.
```

### Prompt 1.3 — Liveness Detection saat Capture
```
[THINKING] Rencanakan integrasi liveness detection di browser menggunakan MediaPipe Face Mesh (via TensorFlow.js/WASM) untuk deteksi blink/head movement real-time di client. Rencanakan juga verifikasi ulang di backend (jangan hanya percaya hasil client-side, karena client-side check bisa dimanipulasi) — kirim beberapa frame ke backend untuk cross-check tambahan.

[BUILD] Implementasikan liveness check client-side yang wajib lolos sebelum sample capture diterima, DITAMBAH verifikasi ulang server-side. Tandai jelas bagian ini sebagai security-critical sesuai AGENTS.md §4.

[EKSEKUSI] Test dengan: (a) wajah asli langsung, (b) foto wajah di layar HP lain, (c) video replay wajah. Kasus (b) dan (c) HARUS tertolak.

[REVIEW] Laporkan hasil ketiga skenario test secara eksplisit. Jika (b) atau (c) lolos, ini bug kritis — masuk tahap PERBAIKI sebelum lanjut.
```

### Prompt 1.4 — Endpoint Registrasi dengan Deduplikasi
```
[THINKING] Rencanakan endpoint yang menerima 5 sample, extract embedding masing-masing, cek similarity terhadap SEMUA embedding user lain yang sudah terdaftar (bukan hanya user ini) untuk deteksi duplikasi wajah.

[BUILD] Buat endpoint POST /enrollment yang: extract embedding tiap sample → cek deduplikasi via pgvector similarity search → jika ada match dengan user lain di atas threshold, reject dengan pesan jelas → jika lolos, simpan embedding ke pgvector dan foto ke Supabase Storage (gunakan service role key dari backend, bucket privat bukan public), set status "pending".

[EKSEKUSI] Test: daftar user A dengan wajah tertentu, lalu coba daftar user B dengan foto wajah yang sama — harus tertolak.

[REVIEW] Konfirmasi pesan error informatif tapi tidak membocorkan identitas user lain yang match (privasi).
```

### Prompt 1.5 — Consent Screen
```
[THINKING] Rencanakan konten consent yang menjelaskan penggunaan data biometrik secara jelas dan sesuai NFR-4 di PRD.md.

[BUILD] Buat screen consent sebelum proses capture dimulai, dengan checkbox wajib dicentang dan teks penjelasan penggunaan data wajah.

[EKSEKUSI] Test flow: user tidak bisa lanjut ke capture tanpa mencentang consent.

[REVIEW] Pastikan consent tercatat di database (timestamp + versi kebijakan) untuk keperluan audit.
```

### Prompt 1.6 — Flow Approval Admin
```
[THINKING] Rencanakan halaman admin untuk review registrasi pending: tampilkan 5 foto sample, data user, tombol approve/reject.

[BUILD] Buat endpoint dan UI admin dashboard untuk list registrasi pending, detail per user, dan aksi approve/reject dengan alasan (jika reject).

[EKSEKUSI] Test end-to-end: user daftar → status pending → admin approve → status user jadi verified → user bisa mulai absen.

[REVIEW] Cek notifikasi ke user (jika ada modul notifikasi) saat status berubah.
```

---

## Sprint 2 — Face Matching untuk Absensi

### Prompt 2.1 — Endpoint Absen dengan Liveness Check
```
[THINKING] Rencanakan endpoint absen yang urutan validasinya: liveness check DULU, baru extract embedding. Jangan lakukan face matching jika liveness gagal (hemat komputasi + prinsip fail-fast).

[BUILD] Buat endpoint POST /attendance/face-check yang menjalankan liveness check di awal, reject langsung jika gagal dengan status jelas.

[EKSEKUSI] Test dengan foto statis — harus reject di tahap liveness, tidak sampai proses matching.

[REVIEW] Cek response time untuk kasus reject (harus cepat, tidak menunggu proses matching yang tidak perlu).
```

### Prompt 2.2 — Similarity Search dengan pgvector
```
[THINKING] Rencanakan query pgvector untuk mencari embedding user dengan cosine distance terkecil. Tentukan threshold default (0.6) sebagai konfigurasi, bukan hardcode.

[BUILD] Implementasikan query similarity search, kembalikan user_id kandidat + confidence score. Simpan threshold di tabel konfigurasi atau environment variable yang bisa diubah admin.

[EKSEKUSI] Test dengan beberapa user terdaftar, pastikan matching benar untuk masing-masing dan reject untuk wajah tidak terdaftar.

[REVIEW] Ukur waktu query untuk skenario 500 user terdaftar sesuai NFR-3 di PRD.md.
```

### Prompt 2.3 — Attendance Log untuk Semua Percobaan
```
[THINKING] Rencanakan struktur log yang mencatat SEMUA percobaan (sukses, gagal liveness, gagal matching, gagal lokasi) — bukan hanya yang sukses, sesuai FR-2.8 di PRD.md.

[BUILD] Implementasikan logging attendance_logs di setiap cabang alur (liveness gagal, matching gagal, lokasi gagal, sukses) dengan rejection_reason yang spesifik.

[EKSEKUSI] Test semua skenario gagal, cek log tercatat dengan reason yang benar.

[REVIEW] Pastikan foto capture ikut tersimpan untuk audit, terutama pada kasus gagal/mencurigakan.
```

### Prompt 2.4 — Rate Limiting via Postgres Counter
```
[THINKING] Rencanakan rate limit percobaan gagal per user (misal max 10 gagal per jam, lalu blokir sementara) menggunakan tabel Postgres di Supabase (bukan Redis, sesuai keputusan v1 untuk mengurangi kompleksitas infra) — query COUNT dengan window waktu berjalan (sliding window sederhana) terhadap attendance_logs yang berstatus gagal.

[BUILD] Implementasikan service rate limiting di backend yang query jumlah percobaan gagal user dalam N menit terakhir dari tabel attendance_logs, blokir jika melebihi threshold. Tambahkan index pada kolom (user_id, timestamp, status) untuk performa query ini.

[EKSEKUSI] Test dengan simulasi percobaan gagal berulang, pastikan blokir aktif setelah limit tercapai dan otomatis reset setelah window waktu berlalu.

[REVIEW] Ukur performa query rate-limit di bawah beban (misal 100 request bersamaan) — jika mulai jadi bottleneck, catat sebagai kandidat upgrade ke Redis di roadmap, bukan langsung ganti sekarang. Cek pesan yang diterima user saat terblokir cukup jelas tanpa membocorkan detail teknis rate limit.
```

### Prompt 2.5 — UI Absen dengan Feedback Real-time
```
[THINKING] Rencanakan UX layar absen: kamera aktif otomatis, feedback visual jelas untuk status sukses/gagal/alasan, tanpa perlu tombol manual berlebihan.

[BUILD] Buat halaman absen web (mobile-first) dengan feedback real-time (indikator loading, hasil sukses dengan nama+waktu, hasil gagal dengan alasan spesifik).

[EKSEKUSI] Test end-to-end di browser mobile fisik untuk skenario sukses dan gagal.

[REVIEW] Ukur waktu dari capture sampai feedback muncul, pastikan < 3 detik sesuai NFR-1.
```

---

## Sprint 3 — Location Verification

### Prompt 3.1 — Ambil GPS + Accuracy via Geolocation API
```
[THINKING] Rencanakan penggunaan browser Geolocation API (navigator.geolocation.getCurrentPosition) dengan opsi enableHighAccuracy: true. Ingat bahwa browser TIDAK punya API untuk deteksi mock-location secara langsung — ini keterbatasan yang sudah didokumentasikan di PRD.md §8, jangan coba buat solusi "seolah-olah" mendeteksinya.

[BUILD] Implementasikan pengambilan GPS coordinate + accuracy value di web app, kirim ke backend bersamaan dengan request absen. Tangani kasus permission ditolak user dengan pesan jelas.

[EKSEKUSI] Test di browser mobile fisik, pastikan coordinate dan accuracy terkirim dengan benar. Test juga skenario permission ditolak.

[REVIEW] Konfirmasi tidak ada logic yang salah mengklaim "mendeteksi fake GPS" — sistem hanya mencatat accuracy value untuk dianalisis di backend (lihat Prompt 3.4).
```

### Prompt 3.2 — IP-Based Geolocation di Backend
```
[THINKING] Rencanakan pengambilan IP address dari request header di backend, lalu lookup IP geolocation (via layanan geo-IP, bisa self-hosted database seperti MaxMind GeoLite2 atau API pihak ketiga). Ini menggantikan fungsi WiFi BSSID yang tidak tersedia di web.

[BUILD] Implementasikan service di backend yang mengambil IP address dari request, lookup koordinat perkiraan via geo-IP, simpan sebagai data pembanding terhadap GPS coordinate yang dilaporkan client.

[EKSEKUSI] Test dengan koneksi WiFi normal (harus dekat dengan GPS asli) dan test dengan VPN aktif (harus terdeteksi selisih signifikan).

[REVIEW] Catat bahwa IP geolocation punya akurasi lebih rendah dari GPS (bisa meleset beberapa km di area urban) — pastikan threshold selisih yang dipakai untuk flag "suspicious" mempertimbangkan hal ini, jangan terlalu sensitif hingga banyak false positive.
```

### Prompt 3.3 — Geofence Check dengan PostGIS
```
[THINKING] Rencanakan query PostGIS ST_DWithin untuk cek apakah koordinat user berada dalam radius lokasi yang terdaftar. Jangan pakai perhitungan Haversine manual di application layer sesuai AGENTS.md §4.

[BUILD] Buat service location_service.py dengan fungsi cek geofence menggunakan PostGIS query.

[EKSEKUSI] Test dengan koordinat dalam radius (harus lolos) dan di luar radius (harus reject).

[REVIEW] Cek performa query dengan index spasial aktif.
```

### Prompt 3.4 — Flagging Suspicious Berdasarkan Accuracy & IP Mismatch
```
[THINKING] Rencanakan logika: jika GPS dalam radius geofence TAPI accuracy value tidak wajar ATAU selisih GPS-vs-IP-geolocation melebihi threshold, status jadi "suspicious" (bukan langsung reject total) agar admin bisa review manual, sesuai FR-2.6.

[BUILD] Implementasikan logic scoring berdasarkan kombinasi: accuracy value, selisih jarak GPS vs IP geolocation, dan riwayat anomali user tersebut. Set status attendance_log sesuai kombinasi hasil.

[EKSEKUSI] Test kombinasi: GPS valid+accuracy wajar+IP cocok (sukses), GPS valid+IP mismatch signifikan (suspicious), GPS di luar radius (reject).

[REVIEW] Pastikan ketiga skenario menghasilkan status dan rejection_reason yang berbeda dan jelas di log. Dokumentasikan threshold yang dipakai agar mudah di-tuning admin tanpa ubah kode.
```

### Prompt 3.5 — Anomaly Detection Teleport
```
[THINKING] Rencanakan rule: bandingkan lokasi & waktu absen terakhir user dengan absen saat ini, hitung apakah jarak tempuh secara fisik masuk akal (kecepatan maksimum realistis, misal 120 km/jam untuk buffer kendaraan).

[BUILD] Implementasikan rule-based anomaly check yang berjalan sebelum absen dicatat sebagai sukses.

[EKSEKUSI] Test dengan simulasi dua absen berjarak 50km dalam 5 menit — harus ter-flag/reject.

[REVIEW] Pastikan rule ini tidak false-positive untuk user yang memang berpindah lokasi wajar (misal naik kendaraan dalam waktu cukup).
```

### Prompt 3.6 — CRUD Lokasi Geofence di Admin
```
[THINKING] Rencanakan form admin untuk tambah/edit lokasi: nama site, koordinat (bisa pilih via peta), radius meter.

[BUILD] Buat halaman CRUD lokasi di admin dashboard dengan peta interaktif untuk memilih koordinat (Mapbox/Leaflet).

[EKSEKUSI] Test tambah lokasi baru, edit radius, edit koordinat.

[REVIEW] Konfirmasi perubahan lokasi langsung berlaku untuk validasi absen berikutnya tanpa perlu restart service.
```

---

## Sprint 4 — Admin Dashboard

### Prompt 4.1 — Halaman Kelola User
```
[THINKING] Rencanakan tabel user dengan kolom status enrollment, aksi (lihat detail, nonaktifkan, re-enroll). CRUD data user biasa (nama, status, dll) bisa langsung via Supabase client SDK dari Next.js dengan RLS admin-only. Khusus aksi "re-enroll" (hapus embedding lama) HARUS lewat endpoint FastAPI karena menyentuh tabel face_embeddings yang tertutup dari client.

[BUILD] Buat halaman CRUD user dengan tabel, search, dan filter status — operasi baca/edit data biasa via Supabase SDK langsung, tombol "re-enroll" memanggil endpoint FastAPI khusus.

[EKSEKUSI] Test seluruh operasi CRUD dari UI.

[REVIEW] Pastikan aksi "re-enroll" menghapus embedding lama dengan benar (tidak menumpuk data usang).
```

### Prompt 4.2 — Halaman Log Absensi
```
[THINKING] Rencanakan tabel log dengan filter tanggal/user/status/site dan pagination untuk performa dengan data besar.

[BUILD] Buat halaman log absensi dengan server-side filtering dan pagination.

[EKSEKUSI] Test dengan data dummy 10.000+ record, ukur waktu load.

[REVIEW] Pastikan performa < 2 detik sesuai kriteria sukses di PRD.md §7.
```

### Prompt 4.3 — Halaman Suspicious Attempts
```
[THINKING] Rencanakan tampilan detail per percobaan mencurigakan: foto capture, alasan flag, koordinat, opsi admin untuk mark reviewed.

[BUILD] Buat halaman khusus suspicious attempts dengan detail lengkap dan aksi review.

[EKSEKUSI] Test dengan data suspicious dari Sprint 3, pastikan semua detail tampil benar.

[REVIEW] Cek apakah admin bisa menambahkan catatan manual saat review.
```

### Prompt 4.4 — Peta Visualisasi
```
[THINKING] Rencanakan peta yang menampilkan marker lokasi absen per user/per hari menggunakan data attendance_logs.

[BUILD] Buat komponen peta (Leaflet/Mapbox) dengan marker dan popup detail saat diklik.

[EKSEKUSI] Test dengan beberapa data log, pastikan marker muncul di koordinat yang benar.

[REVIEW] Cek performa render jika marker jumlahnya banyak (clustering jika perlu).
```

### Prompt 4.5 — Export Laporan
```
[THINKING] Rencanakan format export Excel dan PDF yang mengikuti filter aktif di halaman log.

[BUILD] Implementasikan endpoint export dan tombol download di UI.

[EKSEKUSI] Test export dengan berbagai kombinasi filter, buka file hasil untuk verifikasi data benar.

[REVIEW] Pastikan file tidak korup dan format rapi untuk dibaca manual oleh non-teknis.
```

---

## Sprint 5 — Hardening & Testing

### Prompt 5.1 — Security Review
```
[THINKING] Rencanakan checklist review berdasarkan PRD.md §5: JWT di semua endpoint sensitif, enkripsi at-rest data biometrik, tidak ada credential hardcoded.

[BUILD] Lakukan audit kode terhadap checklist, perbaiki temuan.

[EKSEKUSI] Jalankan test penetrasi dasar (coba akses endpoint tanpa token, coba SQL injection di input umum).

[REVIEW] Laporkan seluruh temuan dan status perbaikannya dalam bentuk checklist.
```

### Prompt 5.2 — Load Testing
```
[THINKING] Rencanakan skenario load test untuk endpoint matching wajah dan location check dengan simulasi 500 user.

[BUILD] Buat script load test (misal dengan Locust/k6).

[EKSEKUSI] Jalankan load test, kumpulkan metrik response time dan error rate.

[REVIEW] Bandingkan hasil dengan NFR-1 (< 3 detik), identifikasi bottleneck jika ada.
```

### Prompt 5.3 — UAT Skenario Adversarial
```
[THINKING] Rencanakan daftar skenario UAT: registrasi normal, registrasi dengan foto statis, absen normal, absen dengan foto/video replay, absen dengan GPS di-spoof via browser dev tools/extension, absen di luar radius, absen dengan VPN aktif (IP mismatch).

[BUILD] Susun dokumen test case UAT dengan expected result untuk masing-masing skenario. Untuk skenario GPS spoofing, expected result adalah "ter-flag suspicious untuk review admin", BUKAN "reject otomatis pasti" — sesuai keterbatasan yang didokumentasikan di PRD.md §8.

[EKSEKUSI] Jalankan seluruh skenario dengan user nyata/device fisik.

[REVIEW] Laporkan skenario mana yang lolos/gagal, prioritaskan perbaikan untuk skenario security-critical yang gagal.
```

### Prompt 5.4 — Dokumentasi Deployment
```
[THINKING] Rencanakan isi README yang cukup lengkap agar tim lain bisa deploy tanpa bertanya ke developer asli, sesuai AGENTS.md.

[BUILD] Tulis README.md dengan langkah setup environment, environment variable yang dibutuhkan, cara deploy backend/web-app/admin-dashboard, dan troubleshooting umum.

[EKSEKUSI] Minta orang lain (atau simulasikan) mengikuti README dari nol.

[REVIEW] Perbaiki bagian yang ambigu atau kurang jelas berdasarkan hasil simulasi.
```

---

## Catatan Penggunaan

- Jalankan prompt secara berurutan per sprint, jangan skip tahap [THINKING] meskipun task terlihat sederhana
- Jika agent menemukan gap antara PRD.md dan implementasi, agent wajib melaporkan di tahap [REVIEW] sebelum lanjut, bukan diam-diam mengubah scope
- Untuk task security-critical (liveness, location validation), selalu minta agent menjalankan skenario adversarial di tahap [EKSEKUSI], bukan hanya happy path
