"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { backendFetch } from "@/utils/backend";

const ANGLE_LABEL: Record<string, string> = {
  front: "Depan",
  left: "Kiri",
  right: "Kanan",
  up: "Atas",
  down: "Bawah",
};

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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Keputusan Admin</h3>
      <p className="mt-1 text-xs text-gray-500">
        Verifikasi foto sample ({samples.length}) sebelum menyetujui.
      </p>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Alasan penolakan (wajib jika menolak)"
        rows={2}
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Reject"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {ANGLE_LABEL["front"] && "Hanya user berstatus pending yang dapat diputuskan."}
      </p>
    </div>
  );
}
