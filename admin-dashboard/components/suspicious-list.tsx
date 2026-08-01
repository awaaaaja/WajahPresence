"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BACKEND_URL, LogDetail, LogRow, ReviewResult } from "@/utils/backend";

const STATUS_STYLE: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  suspicious: "bg-yellow-100 text-yellow-700",
};

export default function SuspiciousList({
  items,
  token,
  reviewed,
}: {
  items: LogRow[];
  token: string;
  reviewed: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDetail(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/admin/logs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error((data as { detail?: string }).detail ?? `Gagal (HTTP ${resp.status})`);
      }
      setDetail(data as LogDetail);
      setNote((data as LogDetail).review_note ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail");
      setOpenId(null);
    } finally {
      setLoading(false);
    }
  }

  async function submitReview(id: string) {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/admin/logs/${id}/review`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error((data as { detail?: string }).detail ?? `Gagal (HTTP ${resp.status})`);
      }
      const result = data as ReviewResult;
      window.alert(`Log ${result.id.slice(0, 8)} direview pada ${result.reviewed_at}`);
      setOpenId(null);
      setDetail(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan review");
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        {reviewed === "true" ? "Belum ada log yang direview." : "Tidak ada antrian review."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {items.map((l) => (
        <div key={l.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => openDetail(l.id)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status]}`}>
                  {l.status}
                </span>
                <span className="text-sm font-medium text-gray-900">{l.nama ?? "—"}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {new Date(l.timestamp).toLocaleString("id-ID")} · site {l.site ?? "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">{l.rejection_reason ?? "—"}</p>
              <p className="mt-1 text-xs text-gray-400">{l.reviewed_at ? "✓ direview" : "pending"}</p>
            </div>
          </button>

          {openId === l.id && (
            <div className="border-t border-gray-100 px-4 py-4">
              {loading ? (
                <p className="text-sm text-gray-500">Memuat detail…</p>
              ) : detail ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    {detail.photo_signed_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={detail.photo_signed_url}
                        alt="Foto bukti"
                        className="max-h-56 w-full rounded-lg border border-gray-200 object-contain"
                      />
                    )}
                    <p className="text-xs text-gray-500">
                      <strong>Alasan:</strong> {detail.rejection_reason ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      <strong>Koordinat:</strong>{" "}
                      {detail.lat != null && detail.lng != null
                        ? `${detail.lat.toFixed(5)}, ${detail.lng.toFixed(5)}`
                        : "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      <strong>IP:</strong> {detail.ip_address ?? "—"} (geo{" "}
                      {detail.ip_geolocation_lat != null
                        ? `${detail.ip_geolocation_lat.toFixed(2)}, ${detail.ip_geolocation_lng?.toFixed(2)}`
                        : "—"}
                      ), mismatch: {detail.ip_mismatch_flag ? "ya" : "tidak"}
                    </p>
                    <p className="text-xs text-gray-500">
                      <strong>GPS accuracy:</strong> {detail.gps_accuracy ?? "—"} m ·{" "}
                      <strong>confidence:</strong> {detail.confidence_score?.toFixed(3) ?? "—"}
                    </p>
                    {detail.reviewed_at && (
                      <p className="text-xs text-green-600">
                        <strong>Direview:</strong> {new Date(detail.reviewed_at).toLocaleString("id-ID")}
                        {detail.review_note ? ` — ${detail.review_note}` : ""}
                      </p>
                    )}
                  </div>

                  {reviewed === "false" && (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-600">Catatan review</label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={4}
                        placeholder="Catatan admin (mis. hasil verifikasi manual)…"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => submitReview(l.id)}
                        disabled={saving}
                        className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? "Menyimpan…" : "Tandai sudah direview"}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
