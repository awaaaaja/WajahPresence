-- Sprint 0 / Prompt 0.6: Skema tabel awal (PRD.md §6)
-- users, face_embeddings, locations, attendance_logs
-- RLS policies di migrasi terpisah (000003_rls_policies.sql).

-- ---------------------------------------------------------------
-- users
-- ---------------------------------------------------------------
create table if not exists public.users (
    id                 uuid primary key references auth.users (id) on delete cascade,
    nama               text not null,
    nim_nip            text,
    email              text not null unique,
    role               text not null default 'user' check (role in ('user', 'admin', 'superadmin')),
    status_enrollment  text not null default 'not_enrolled'
                       check (status_enrollment in ('not_enrolled', 'pending', 'approved', 'rejected')),
    created_at         timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);
create index if not exists users_status_enrollment_idx on public.users (status_enrollment);

-- ---------------------------------------------------------------
-- face_embeddings  (vector 512-dim, HANYA diakses via service role)
-- ---------------------------------------------------------------
create table if not exists public.face_embeddings (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.users (id) on delete cascade,
    embedding     vector(512) not null,
    sample_angle  text not null check (sample_angle in ('front', 'left', 'right', 'up', 'down')),
    photo_url     text,
    created_at    timestamptz not null default now()
);

create index if not exists face_embeddings_user_id_idx on public.face_embeddings (user_id);
-- Index HNSW untuk cosine similarity search (bukan hanya kolom biasa)
create index if not exists face_embeddings_embedding_idx
    on public.face_embeddings
    using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------
-- locations  (geofence site; PostGIS geography + spatial index)
-- ---------------------------------------------------------------
create table if not exists public.locations (
    id           uuid primary key default gen_random_uuid(),
    nama_site    text not null,
    lat          double precision not null check (lat between -90 and 90),
    lng          double precision not null check (lng between -180 and 180),
    radius_meter double precision not null check (radius_meter > 0),
    created_at   timestamptz not null default now(),
    -- Kolom generata geometry(Point, 4326) tersinkron dari lat/lng
    geom         geography(Point, 4326)
                 generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored
);

-- Index spasial GIST (untuk ST_DWithin geofence check)
create index if not exists locations_geom_idx on public.locations using gist (geom);

-- ---------------------------------------------------------------
-- attendance_logs  (setiap percobaan absen, sukses/gagal/mencurigakan)
-- ---------------------------------------------------------------
create table if not exists public.attendance_logs (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid references public.users (id) on delete set null,
    timestamp           timestamptz not null default now(),
    status              text not null check (status in ('success', 'rejected', 'suspicious')),
    confidence_score    double precision check (confidence_score between 0 and 1),
    lat                 double precision check (lat between -90 and 90),
    lng                 double precision check (lng between -180 and 180),
    gps_accuracy        double precision,
    ip_address          inet,
    ip_geolocation_lat  double precision,
    ip_geolocation_lng  double precision,
    ip_mismatch_flag    boolean not null default false,
    photo_capture_url   text,
    user_agent          text,
    rejection_reason    text
);

create index if not exists attendance_logs_user_timestamp_idx
    on public.attendance_logs (user_id, timestamp desc);
create index if not exists attendance_logs_status_idx on public.attendance_logs (status);
create index if not exists attendance_logs_timestamp_idx on public.attendance_logs (timestamp desc);
