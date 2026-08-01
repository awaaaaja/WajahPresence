-- Sprint 2 / Prompt 2.4: index pendukung rate limiting (sliding window)
-- Query rate limit: count(*) dari attendance_logs untuk (user_id, timestamp >= X)
-- dengan status gagal. Index partial ini memperkecil baca (hanya baris gagal).

create index if not exists attendance_logs_failures_idx
    on public.attendance_logs (user_id, timestamp desc)
    where status in ('rejected', 'suspicious');
