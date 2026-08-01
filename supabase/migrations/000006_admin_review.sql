-- Sprint 4 (Prompt 4.3): review manual percobaan mencurigakan.
-- Kolom review admin di attendance_logs + index untuk antrian pending.

alter table public.attendance_logs
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text;

-- Antrian review: list suspicious yang belum direview (timestamp desc).
create index if not exists attendance_logs_suspicious_pending_idx
  on public.attendance_logs (timestamp desc)
  where status = 'suspicious' and reviewed_at is null;
