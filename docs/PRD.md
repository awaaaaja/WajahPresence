# PRD.md — Product Requirements Document
## Sistem Absensi Face Recognition + Live Location Verification

### 1. Latar Belakang

Sistem absensi konvensional (kartu, QR statis, GPS check-in biasa) rentan disalahgunakan: titip absen, foto wajah statis, atau fake GPS. Produk ini dirancang untuk institusi (kampus/sekolah/kantor) yang butuh kepastian tinggi bahwa orang yang absen benar-benar hadir secara fisik di lokasi yang sah.

### 2. Target Pengguna

- **User/Karyawan/Mahasiswa**: melakukan registrasi wajah sekali, lalu absen harian
- **Admin**: approve registrasi, kelola lokasi geofence, monitoring, generate laporan
- **Superadmin**: kelola admin, konfigurasi sistem, audit global

### 3. User Stories

**Registrasi**
- Sebagai user baru, saya ingin mendaftar dengan mengambil foto wajah dari beberapa sudut, agar sistem bisa mengenali saya secara akurat.
- Sebagai admin, saya ingin approve/reject hasil registrasi wajah user, agar hanya wajah valid yang masuk sistem.

**Absensi**
- Sebagai user, saya ingin absen hanya dengan mengarahkan wajah ke kamera tanpa input manual, agar prosesnya cepat.
- Sebagai user, saya ingin sistem menolak absen saya jika saya menggunakan foto/video orang lain (bukan wajah live).
- Sebagai user, saya ingin sistem menolak absen saya jika saya berada di luar lokasi yang ditentukan atau menggunakan fake GPS.

**Admin**
- Sebagai admin, saya ingin melihat log absensi lengkap (waktu, lokasi, confidence score, foto capture) untuk audit.
- Sebagai admin, saya ingin mendapat notifikasi/flag ketika ada percobaan absen mencurigakan (fake GPS terdeteksi, wajah tidak match berulang).
- Sebagai admin, saya ingin mengatur lokasi geofence (koordinat + radius) per site/cabang.

### 4. Functional Requirements

#### 4.1 Modul Registrasi Wajah (Strict Enrollment)
- FR-1.1: Sistem WAJIB mengambil minimal 5 sample wajah (depan, kiri, kanan, atas, bawah) saat registrasi
- FR-1.2: Setiap sample WAJIB melalui liveness check real-time (deteksi kedip/gerakan) sebelum diterima
- FR-1.3: Sistem menolak registrasi jika wajah terdeteksi sudah terdaftar di akun lain (deduplikasi via embedding similarity)
- FR-1.4: Embedding hasil registrasi disimpan sebagai vector 512-dim di pgvector (Supabase Postgres), foto asli disimpan di Supabase Storage
- FR-1.5: Status akun user setelah registrasi = "pending" hingga di-approve admin (opsional, tergantung kebijakan institusi)

#### 4.2 Modul Absensi
- FR-2.1: Sistem WAJIB menjalankan liveness detection sebelum face matching
- FR-2.2: Face matching menggunakan cosine similarity terhadap embedding tersimpan, threshold minimum dikonfigurasi admin (default 0.6)
- FR-2.3: Sistem mengambil GPS coordinate + accuracy (via browser Geolocation API) secara bersamaan dengan capture wajah
- FR-2.4: Sistem mengambil IP address request dan melakukan IP-based geolocation sebagai sinyal pembanding terhadap GPS coordinate
- FR-2.5: Absen ditolak jika lokasi di luar radius geofence yang dikonfigurasi (dihitung via PostGIS)
- FR-2.6: Absen di-flag "mencurigakan" jika GPS accuracy value tidak wajar (terlalu presisi/terlalu longgar dibanding kondisi normal) atau jika IP geolocation menyimpang signifikan dari GPS coordinate yang dilaporkan
- FR-2.6a: **Known limitation** — browser tidak menyediakan API untuk mendeteksi mock-location secara langsung (berbeda dari native app). Sistem mengandalkan kombinasi sinyal tidak langsung (accuracy, IP, anomaly), bukan deteksi definitif
- FR-2.7: Sistem mendeteksi anomali teleport (jarak antar-absen tidak masuk akal secara waktu tempuh)
- FR-2.8: Setiap percobaan absen (sukses/gagal) tercatat di log dengan timestamp, confidence score, koordinat, dan status

#### 4.3 Modul Admin Dashboard
- FR-3.1: CRUD data user dan status enrollment
- FR-3.2: Kelola lokasi geofence (nama site, koordinat pusat, radius)
- FR-3.3: Lihat log absensi dengan filter tanggal/user/status/site
- FR-3.4: Lihat daftar percobaan mencurigakan (suspicious attempts) untuk review manual
- FR-3.5: Export laporan absensi ke Excel/PDF
- FR-3.6: Visualisasi lokasi absen di peta (per user/per hari)

### 5. Non-Functional Requirements

- NFR-1: Response time proses matching wajah + lokasi < 3 detik (end-to-end)
- NFR-2: Data biometrik (embedding & foto) dienkripsi at-rest (bawaan Supabase). Tabel `face_embeddings` WAJIB memiliki Row-Level Security (RLS) aktif dan hanya bisa diakses via service role key dari backend FastAPI — tidak pernah diekspos ke client-side SDK
- NFR-3: Sistem harus tetap berfungsi untuk minimal 500 user terdaftar tanpa penurunan akurasi signifikan
- NFR-4: Consent eksplisit (checkbox + penjelasan penggunaan data biometrik) wajib ditampilkan sebelum registrasi wajah
- NFR-5: Retention policy: foto capture absensi disimpan maksimal 90 hari (dikonfigurasi), embedding wajah disimpan selama akun aktif

### 6. Data Model (Ringkasan)

**users**: id, nama, nim_nip, email, role, status_enrollment, created_at

**face_embeddings**: id, user_id, embedding (vector 512), sample_angle, photo_url, created_at

**locations**: id, nama_site, lat, lng, radius_meter

**attendance_logs**: id, user_id, timestamp, status (success/rejected/suspicious), confidence_score, lat, lng, gps_accuracy, ip_address, ip_geolocation_lat, ip_geolocation_lng, ip_mismatch_flag, photo_capture_url, user_agent, rejection_reason

### 7. Kriteria Sukses (Definition of Done per Fase)

- Registrasi: user tidak bisa daftar dengan foto statis (harus lolos liveness) dan tidak bisa duplikat wajah
- Absensi: percobaan dengan foto/video di layar HP tertolak; percobaan dengan fake GPS app tertolak
- Dashboard: admin bisa melihat dan mem-filter seluruh log dalam < 2 detik untuk 10.000 record

### 8. Keterbatasan Diketahui (Web vs Native App)

Produk ini dibangun sebagai **Web App (mobile-first, PWA)**, bukan native app. Konsekuensi keamanan yang perlu disadari institusi pengguna:

- **Tidak ada deteksi mock-location langsung** — browser tidak mengekspos API untuk mengetahui apakah GPS coordinate berasal dari aplikasi fake-GPS. Native app (Android) punya API ini, web tidak.
- **Tidak ada WiFi BSSID scanning** — browser tidak punya izin akses daftar WiFi sekitar sama sekali, sehingga layer verifikasi ini tidak tersedia.
- Sebagai gantinya, sistem mengandalkan **GPS accuracy check**, **IP-based geolocation cross-check**, dan **anomaly/teleport detection** — kombinasi ini mengurangi risiko tapi tidak menghilangkan kemungkinan spoofing GPS oleh user yang punya pengetahuan teknis (misal via browser extension fake-geolocation atau developer tools).
- Layer wajah (liveness detection + face matching) tetap sekuat rencana awal karena tidak bergantung pada API native.
- Jika institusi butuh jaminan lokasi setara native app di masa depan, opsi upgrade ke PWA dengan wrapper native minimal (Capacitor) bisa dipertimbangkan sebagai fase lanjutan — dicatat sebagai potensi roadmap, bukan scope v1.

### 9. Out of Scope (v1)

- Payroll/integrasi penggajian
- Absen offline tanpa koneksi internet
- Multi-wajah dalam satu frame (absen berjamaah dalam satu capture)
