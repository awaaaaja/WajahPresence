import Link from "next/link";
import { cookies } from "next/headers";

import SuspiciousList from "@/components/suspicious-list";
import { backendFetch, LogPage } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const PAGE_SIZE = 25;

export default async function SuspiciousAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const reviewed = sp.reviewed === "true" ? "true" : "false";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
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
        status: "suspicious",
        reviewed,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      data = await backendFetch<LogPage>(`/admin/logs?${query.toString()}`, session.access_token);
    } catch (err) {
      error = err instanceof Error ? err.message : "Gagal memuat percobaan mencurigakan";
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <h2 className="mb-1 font-mono text-xl font-semibold text-foreground">Suspicious Attempts</h2>
      <p className="mb-4 text-sm text-muted">
        Percobaan absen yang ter-flag mencurigakan (accuracy/IP mismatch) untuk direview manual.
      </p>

      <div className="mb-4 flex gap-2">
        <Link
          href="/suspicious-attempts"
          aria-current={reviewed === "false" ? "page" : undefined}
          className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
            reviewed === "false" ? "bg-primary text-white" : "bg-surface text-muted hover:bg-gray-100"
          }`}
        >
          Belum direview
        </Link>
        <Link
          href="/suspicious-attempts?reviewed=true"
          aria-current={reviewed === "true" ? "page" : undefined}
          className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
            reviewed === "true" ? "bg-primary text-white" : "bg-surface text-muted hover:bg-gray-100"
          }`}
        >
          Sudah direview
        </Link>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      {!session && <p className="text-sm text-muted">Login diperlukan.</p>}

      {data && (
        <>
          <p className="mb-2 text-sm text-muted">
            {data.total} percobaan (hal. {page}/{totalPages})
          </p>
          <SuspiciousList
            items={data.items}
            token={session?.access_token ?? ""}
            reviewed={reviewed}
          />
          <div className="mt-4 flex items-center justify-between">
            <Link
              href={`/suspicious-attempts?${new URLSearchParams({ reviewed, page: String(Math.max(1, page - 1)) })}`}
              aria-disabled={page <= 1}
              className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                page <= 1 ? "pointer-events-none text-gray-300" : "bg-surface text-muted hover:bg-gray-100"
              }`}
            >
              ← Sebelumnya
            </Link>
            <Link
              href={`/suspicious-attempts?${new URLSearchParams({ reviewed, page: String(page + 1) })}`}
              aria-disabled={page >= totalPages}
              className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                page >= totalPages ? "pointer-events-none text-gray-300" : "bg-surface text-muted hover:bg-gray-100"
              }`}
            >
              Berikutnya →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
