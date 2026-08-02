"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";

import Button from "@/components/ui/button";
import { backendFetch } from "@/utils/backend";

interface Props {
  userId: string;
  status: string;
  token: string;
  samples: { angle: string; signed_url: string | null }[];
}

export default function DecisionForm({ userId, status, token, samples }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending") {
    return null;
  }

  const decide = async (approved: boolean) => {
    if (!approved && !reason.trim()) {
      setError("Alasan wajib diisi saat menolak.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await backendFetch(`/admin/users/${userId}/decision`, token, {
        method: "POST",
        body: JSON.stringify({
          approved,
          reason: approved ? null : reason.trim(),
        }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Keputusan Admin</h3>
      <p className="mt-1 text-xs text-muted">
        Verifikasi foto sample ({samples.length}) sebelum menyetujui.
      </p>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Alasan penolakan (wajib jika menolak)"
        rows={2}
        className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="success"
          disabled={busy}
          onClick={() => decide(true)}
          className="flex-1"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {busy ? "Menyimpan..." : "Approve"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          onClick={() => decide(false)}
          className="flex-1"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {busy ? "Menyimpan..." : "Reject"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Hanya user berstatus pending yang dapat diputuskan.
      </p>
    </div>
  );
}
