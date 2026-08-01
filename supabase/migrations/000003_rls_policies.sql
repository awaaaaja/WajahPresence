-- Sprint 0 / Prompt 0.6: RLS policy — prinsip least-privilege
--
--   users             : pemilik bisa baca/update barisnya sendiri
--   face_embeddings   : TERTUTUP TOTAL dari client (tanpa policy apa pun),
--                       hanya bisa diakses via service role (backend FastAPI)
--   locations         : semua user terautentikasi bisa baca; hanya admin yang tulis
--   attendance_logs   : pemilik bisa baca lognya sendiri; admin bisa baca semua
--
-- Catatan: service role & postgres role menembus RLS, tidak butuh policy.

-- Helper: cek apakah user yang login berperan admin/superadmin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role in ('admin', 'superadmin')
    );
$$;

-- ---------------------------------------------------------------
-- users
-- ---------------------------------------------------------------
alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
    on public.users for select
    to authenticated
    using (id = auth.uid());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
    on public.users for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Tidak ada policy INSERT/DELETE untuk client: pembuatan/penghapusan user
-- dilakukan backend via service role.

-- ---------------------------------------------------------------
-- face_embeddings  — sengaja TIDAK punya policy apa pun (tertutup total)
-- ---------------------------------------------------------------
alter table public.face_embeddings enable row level security;

-- ---------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------
alter table public.locations enable row level security;

drop policy if exists "locations_select_authenticated" on public.locations;
create policy "locations_select_authenticated"
    on public.locations for select
    to authenticated
    using (true);

drop policy if exists "locations_insert_admin" on public.locations;
create policy "locations_insert_admin"
    on public.locations for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "locations_update_admin" on public.locations;
create policy "locations_update_admin"
    on public.locations for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "locations_delete_admin" on public.locations;
create policy "locations_delete_admin"
    on public.locations for delete
    to authenticated
    using (public.is_admin());

-- ---------------------------------------------------------------
-- attendance_logs
-- ---------------------------------------------------------------
alter table public.attendance_logs enable row level security;

drop policy if exists "attendance_logs_select_own_or_admin" on public.attendance_logs;
create policy "attendance_logs_select_own_or_admin"
    on public.attendance_logs for select
    to authenticated
    using (user_id = auth.uid() or public.is_admin());

-- Tidak ada policy INSERT untuk client: log ditulis backend via service role.
