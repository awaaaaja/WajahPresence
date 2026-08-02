import { cookies } from "next/headers";

import ExportButton from "@/components/export-button";
import StatusBadge from "@/components/status-badge";
import Button from "@/components/ui/button";
import { backendFetch, LogPage } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const PAGE_SIZE = 50;

const inputClass =
  "mt-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default async function AttendanceLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    q?: string;
    status?: string;
    site?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filters = {
    start: sp.start ?? "",
    end: sp.end ?? "",
    q: sp.q ?? "",
    status: sp.status ?? "",
    site: sp.site ?? "",
  };

  let data: LogPage | null = null;
  let error: string | null = null;
  if (session) {
    try {
      const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (filters.start) query.set("start_date", filters.start);
      if (filters.end) query.set("end_date", filters.end);
      if (filters.q) query.set("user", filters.q);
      if (filters.status) query.set("status", filters.status);
      if (filters.site) query.set("site", filters.site);
      data = await backendFetch<LogPage>(`/admin/logs?${query.toString()}`, session.access_token);
    } catch (err) {
      error = err instanceof Error ? err.message : "Gagal memuat log";
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <h2 className="mb-4 font-mono text-xl font-semibold text-foreground">Attendance Logs</h2>

      <form method="get" action="/attendance-logs" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col text-xs text-muted">
          Dari
          <input
            type="date"
            name="start"
            defaultValue={filters.start}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          Sampai
          <input
            type="date"
            name="end"
            defaultValue={filters.end}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          User
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Nama / email"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          Status
          <select name="status" defaultValue={filters.status} className={inputClass}>
            <option value="">Semua</option>
            <option value="success">Sukses</option>
            <option value="rejected">Ditolak</option>
            <option value="suspicious">Mencurigakan</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-muted">
          Site
          <input
            type="text"
            name="site"
            defaultValue={filters.site}
            placeholder="Nama lokasi"
            className={inputClass}
          />
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
        <ExportButton token={session?.access_token ?? ""} filters={filters} />
      </form>

      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      {!session && <p className="text-sm text-muted">Login diperlukan.</p>}

      {data && (
        <>
          <p className="mb-2 text-sm text-muted">
            {data.total} log (hal. {page}/{totalPages})
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-gray-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Koordinat</th>
                  <th className="px-4 py-3">Alasan</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {new Date(l.timestamp).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{l.nama ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">{l.site ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-muted">{l.confidence_score != null ? l.confidence_score.toFixed(3) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-muted">
                      {l.lat != null && l.lng != null ? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted" title={l.rejection_reason ?? ""}>
                      {l.rejection_reason ?? (l.ip_mismatch_flag ? "ip mismatch" : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <a
              href={`/attendance-logs?${new URLSearchParams({ ...filters, page: String(Math.max(1, page - 1)) })}`}
              aria-disabled={page <= 1}
              className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                page <= 1 ? "pointer-events-none text-gray-300" : "bg-surface text-muted hover:bg-gray-100"
              }`}
            >
              ← Sebelumnya
            </a>
            <a
              href={`/attendance-logs?${new URLSearchParams({ ...filters, page: String(page + 1) })}`}
              aria-disabled={page >= totalPages}
              className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                page >= totalPages ? "pointer-events-none text-gray-300" : "bg-surface text-muted hover:bg-gray-100"
              }`}
            >
              Berikutnya →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
