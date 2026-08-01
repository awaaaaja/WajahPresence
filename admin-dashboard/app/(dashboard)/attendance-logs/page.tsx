import { cookies } from "next/headers";

import ExportButton from "@/components/export-button";
import { backendFetch, LogPage } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const STATUS_STYLE: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  suspicious: "bg-yellow-100 text-yellow-700",
};

const PAGE_SIZE = 50;

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
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Attendance Logs</h2>

      <form method="get" action="/attendance-logs" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex flex-col text-xs text-gray-500">
          Dari
          <input
            type="date"
            name="start"
            defaultValue={filters.start}
            className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Sampai
          <input
            type="date"
            name="end"
            defaultValue={filters.end}
            className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          User
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Nama / email"
            className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Status
          <select name="status" defaultValue={filters.status} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
            <option value="">Semua</option>
            <option value="success">Sukses</option>
            <option value="rejected">Ditolak</option>
            <option value="suspicious">Mencurigakan</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Site
          <input
            type="text"
            name="site"
            defaultValue={filters.site}
            placeholder="Nama lokasi"
            className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Filter
        </button>
        <ExportButton token={session?.access_token ?? ""} filters={filters} />
      </form>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!session && <p className="text-sm text-gray-500">Login diperlukan.</p>}

      {data && (
        <>
          <p className="mb-2 text-sm text-gray-500">
            {data.total} log (hal. {page}/{totalPages})
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
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
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {new Date(l.timestamp).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{l.nama ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{l.site ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{l.confidence_score != null ? l.confidence_score.toFixed(3) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {l.lat != null && l.lng != null ? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600" title={l.rejection_reason ?? ""}>
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
              className={`rounded-lg px-3 py-1.5 text-sm ${page <= 1 ? "pointer-events-none text-gray-300" : "bg-white text-gray-600 hover:bg-gray-100"}`}
            >
              ← Sebelumnya
            </a>
            <a
              href={`/attendance-logs?${new URLSearchParams({ ...filters, page: String(page + 1) })}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${page >= totalPages ? "pointer-events-none text-gray-300" : "bg-white text-gray-600 hover:bg-gray-100"}`}
            >
              Berikutnya →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
