import { cookies } from "next/headers";

import AttendanceMap from "@/components/attendance-map";
import { backendFetch, LogPage } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const MAP_LIMIT = 2000;

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
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Peta Absensi</h2>

      <form method="get" action="/map" className="mb-4 flex items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex flex-col text-xs text-gray-500">
          Dari
          <input
            type="date"
            name="start"
            defaultValue={start}
            className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Sampai
          <input
            type="date"
            name="end"
            defaultValue={end}
            className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Tampilkan
        </button>
      </form>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!session && <p className="text-sm text-gray-500">Login diperlukan.</p>}

      {data && (
        <>
          <p className="mb-2 text-sm text-gray-500">
            {data.total} titik lokasi absen (maks. {MAP_LIMIT} ditampilkan, marker dikelompokkan otomatis).
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <AttendanceMap items={data.items} />
          </div>
        </>
      )}
    </div>
  );
}
