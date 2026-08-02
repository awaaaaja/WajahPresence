"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { History, MapPin, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

import PageHeader from "@/components/page-header";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import { backendFetch } from "@/utils/backend";
import { createClient } from "@/utils/supabase/client";

interface AttendanceLogEntry {
  id: string;
  timestamp: string;
  status: "success" | "suspicious";
  location_name: string | null;
  confidence: number | null;
  reasons: string[];
}

interface LogPage {
  logs: AttendanceLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

const PAGE_SIZE = 20;

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RiwayatPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [month, setMonth] = useState(todayMonth());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace("/login?next=/riwayat");
          return;
        }
        setToken(data.session.access_token);
      });
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        month,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      const result = await backendFetch<LogPage>(`/attendance/logs/mine?${qs}`, token);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat riwayat");
    } finally {
      setLoading(false);
    }
  }, [token, month, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <main className="min-h-screen bg-background pb-10 pb-safe">
      <PageHeader title="Riwayat Absensi" description="Catatan kehadiran kamu" />

      <section className="mx-auto w-full max-w-lg p-5">
        <div className="mb-4 flex items-center gap-3">
          <label htmlFor="month" className="text-sm font-medium text-foreground">
            Bulan
          </label>
          <input
            id="month"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading && !data && (
          <p className="py-8 text-center text-sm text-muted">Memuat riwayat...</p>
        )}

        {!loading && data && data.logs.length === 0 && (
          <div className="flex flex-col items-center rounded-xl border border-border bg-surface py-10 text-center shadow-sm">
            <Inbox className="h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-foreground">Belum ada absensi</p>
            <p className="mt-1 text-xs text-muted">Tidak ada catatan pada bulan ini.</p>
          </div>
        )}

        {data && data.logs.length > 0 && (
          <ul className="flex flex-col gap-3">
            {data.logs.map((log) => (
              <li
                key={log.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={log.status === "success" ? "success" : "warning"}>
                    {log.status === "success" ? "Berhasil" : "Mencurigakan"}
                  </Badge>
                  <span className="ml-auto text-xs font-medium text-muted">
                    {new Date(log.timestamp).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {log.location_name ?? "Lokasi tidak teridentifikasi"}
                </div>
                {log.confidence !== null && (
                  <p className="mt-1 text-xs text-muted">
                    Skor kecocokan: {(log.confidence * 100).toFixed(1)}%
                  </p>
                )}
                {log.reasons.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-xs text-muted">
                    {log.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {data && data.logs.length > 0 && (
          <div className="mt-5 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Sebelumnya
            </Button>
            <span className="text-xs font-medium text-muted">
              Halaman {page} dari {totalPages} · {data.total} catatan
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          Data ditampilkan dari catatan terbaru
        </p>
      </section>
    </main>
  );
}
