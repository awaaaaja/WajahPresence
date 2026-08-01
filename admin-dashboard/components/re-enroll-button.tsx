"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BACKEND_URL, ReEnrollResult } from "@/utils/backend";

export default function ReEnrollButton({
  userId,
  nama,
  token,
  disabled,
}: {
  userId: string;
  nama: string;
  token: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReEnroll() {
    if (!window.confirm(`Hapus data wajah "${nama}" dan minta registrasi ulang?`)) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/admin/users/${userId}/re-enroll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error((data as { detail?: string }).detail ?? `Gagal (HTTP ${resp.status})`);
      }
      const result = data as ReEnrollResult;
      window.alert(
        `Berhasil: ${result.deleted_embeddings} embedding & ${result.deleted_photos} foto dihapus. Status: ${result.status_enrollment}`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal re-enroll");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        onClick={handleReEnroll}
        disabled={disabled || busy}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          disabled
            ? "cursor-not-allowed text-gray-300"
            : "text-amber-700 hover:bg-amber-50"
        }`}
        title={disabled ? "Belum ada data wajah" : "Hapus embedding lama untuk registrasi ulang"}
      >
        {busy ? "…" : "Re-enroll"}
      </button>
      {error && <span className="ml-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}
