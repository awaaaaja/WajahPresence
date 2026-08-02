"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

import StatusBadge from "@/components/status-badge";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BACKEND_URL, LogDetail, LogRow, ReviewResult } from "@/utils/backend";

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
  const { toast } = useToast();
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
      toast(`Log ${result.id.slice(0, 8)} direview pada ${result.reviewed_at}`, "success");
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
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
        {reviewed === "true" ? "Belum ada log yang direview." : "Tidak ada antrian review."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      {items.map((l) => (
        <div key={l.id} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <button
            type="button"
            onClick={() => openDetail(l.id)}
            aria-expanded={openId === l.id}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-gray-50"
          >
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge status={l.status} />
                <span className="text-sm font-medium text-foreground">{l.nama ?? "—"}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {new Date(l.timestamp).toLocaleString("id-ID")} · site {l.site ?? "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">{l.rejection_reason ?? "—"}</p>
              <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted">
                {l.reviewed_at ? "sudah direview" : "pending"}
                {openId === l.id ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </p>
            </div>
          </button>

          {openId === l.id && (
            <div className="border-t border-border px-4 py-4">
              {loading ? (
                <p className="text-sm text-muted">Memuat detail…</p>
              ) : detail ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    {detail.photo_signed_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={detail.photo_signed_url}
                        alt="Foto bukti"
                        className="max-h-56 w-full rounded-lg border border-border object-contain"
                      />
                    )}
                    <p className="text-xs text-muted">
                      <strong>Alasan:</strong> {detail.rejection_reason ?? "—"}
                    </p>
                    <p className="text-xs text-muted">
                      <strong>Koordinat:</strong>{" "}
                      {detail.lat != null && detail.lng != null
                        ? `${detail.lat.toFixed(5)}, ${detail.lng.toFixed(5)}`
                        : "—"}
                    </p>
                    <p className="text-xs text-muted">
                      <strong>IP:</strong> {detail.ip_address ?? "—"} (geo{" "}
                      {detail.ip_geolocation_lat != null
                        ? `${detail.ip_geolocation_lat.toFixed(2)}, ${detail.ip_geolocation_lng?.toFixed(2)}`
                        : "—"}
                      ), mismatch: {detail.ip_mismatch_flag ? "ya" : "tidak"}
                    </p>
                    <p className="text-xs text-muted">
                      <strong>GPS accuracy:</strong> {detail.gps_accuracy ?? "—"} m ·{" "}
                      <strong>confidence:</strong> {detail.confidence_score?.toFixed(3) ?? "—"}
                    </p>
                    {detail.reviewed_at && (
                      <p className="text-xs text-success">
                        <strong>Direview:</strong> {new Date(detail.reviewed_at).toLocaleString("id-ID")}
                        {detail.review_note ? ` — ${detail.review_note}` : ""}
                      </p>
                    )}
                  </div>

                  {reviewed === "false" && (
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`note-${l.id}`} className="text-xs font-medium text-muted">
                        Catatan review
                      </label>
                      <textarea
                        id={`note-${l.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={4}
                        placeholder="Catatan admin (mis. hasil verifikasi manual)…"
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      <Button
                        type="button"
                        onClick={() => submitReview(l.id)}
                        loading={saving}
                        disabled={saving}
                        className="self-start"
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        {saving ? "Menyimpan..." : "Tandai sudah direview"}
                      </Button>
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
