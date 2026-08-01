-- Sprint 0 / Prompt 0.2: Aktifkan extension yang dibutuhkan
-- pgvector  -> face embeddings (vector 512-dim similarity search)
-- postgis   -> geofence & spatial queries (ST_DWithin)

create extension if not exists vector with schema extensions;
create extension if not exists postgis with schema extensions;

-- Pastikan search_path mencakup schema extensions agar type vector/geography
-- bisa dipakai langsung tanpa prefix di query aplikasi.
alter database postgres set search_path to public, extensions;
