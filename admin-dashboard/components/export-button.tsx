"use client";

import { useState } from "react";

import { BACKEND_URL } from "@/utils/backend";

export default function ExportButton({
  token,
  filters,
}: {
  token: string;
  filters: { start: string; end: string; q: string; status: string; site: string };
}) {
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "xlsx" | "pdf") {
    if (!token) return;
    setBusy(format);
    setError(null);
    try {
      const query = new URLSearchParams({ format });
      if (filters.start) query.set("start_date", filters.start);
      if (filters.end) query.set("end_date", filters.end);
      if (filters.q) query.set("user", filters.q);
      if (filters.status) query.set("status", filters.status);
      if (filters.site) query.set("site", filters.site);

      const resp = await fetch(`${BACKEND_URL}/admin/logs/export?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? `Gagal export (HTTP ${resp.status})`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = resp.headers.get("content-disposition") ?? "";
      a.download = disposition.match(/filename="([^"]+)"/)?.[1] ?? `laporan_absensi.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal export");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => download("xlsx")}
        disabled={busy !== null}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy === "xlsx" ? "…" : "Export Excel"}
      </button>
      <button
        type="button"
        onClick={() => download("pdf")}
        disabled={busy !== null}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy === "pdf" ? "…" : "Export PDF"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
