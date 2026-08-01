-- Sprint 1 / Prompt 1.5 & 1.6:
-- biometric_consents (NFR-4: consent tercatat untuk audit)
-- users.rejection_reason (alasan reject oleh admin)

create table if not exists public.biometric_consents (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references public.users (id) on delete cascade,
    policy_version text not null,
    accepted_at    timestamptz not null default now()
);

create index if not exists biometric_consents_user_id_idx
    on public.biometric_consents (user_id, accepted_at desc);

alter table public.biometric_consents enable row level security;

-- Pemilik bisa melihat consent-nya sendiri; INSERT hanya via service role
-- (backend FastAPI) — tidak ada policy insert untuk client.
drop policy if exists "biometric_consents_select_own" on public.biometric_consents;
create policy "biometric_consents_select_own"
    on public.biometric_consents for select
    to authenticated
    using (user_id = auth.uid());

alter table public.users add column if not exists rejection_reason text;
