import { cookies } from "next/headers";

import AttendanceMap from "@/components/attendance-map";
import Button from "@/components/ui/button";
import { backendFetch, LogPage } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const MAP_LIMIT = 2000;

const inputClass =
  "mt-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const start = sp.start ?? "";
  const end = sp.end ?? "";
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let data: LogPage | null = null;
  let error: string | null = null;
  if (session) {
    try {
      const query = new URLSearchParams({
        page: "1",
        page_size: String(MAP_LIMIT),
        only_located: "true",
      });
      if (start) query.set("start_date", start);
      if (end) query.set("end_date", end);
      data = await backendFetch<LogPage>(`/admin/logs?${query.toString()}`, session.access_token);
    } catch (err) {
      error = err instanceof Error ? err.message : "Gagal memuat data peta";
    }
  }

  return (
    <div>
      <h2 className="mb-4 font-mono text-xl font-semibold text-foreground">Peta Absensi</h2>

      <form method="get" action="/map" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col text-xs text-muted">
          Dari
          <input
            type="date"
            name="start"
            defaultValue={start}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          Sampai
          <input
            type="date"
            name="end"
            defaultValue={end}
            className={inputClass}
          />
        </label>
        <Button type="submit" size="sm">
          Tampilkan
        </Button>
      </form>

      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      {!session && <p className="text-sm text-muted">Login diperlukan.</p>}

      {data && (
        <>
          <p className="mb-2 text-sm text-muted">
            {data.total} titik lokasi absen (maks. {MAP_LIMIT} ditampilkan, marker dikelompokkan otomatis).
          </p>
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
            <AttendanceMap items={data.items} />
          </div>
        </>
      )}
    </div>
  );
}
