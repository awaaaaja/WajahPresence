"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import Modal from "@/components/ui/modal";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
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
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReEnroll() {
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
      toast(
        `Berhasil: ${result.deleted_embeddings} embedding & ${result.deleted_photos} foto dihapus. Status: ${result.status_enrollment}`,
        "success",
      );
      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal re-enroll");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || busy}
        className={`inline-flex min-h-[40px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
          disabled
            ? "cursor-not-allowed text-gray-300"
            : "text-warning hover:bg-warning-soft"
        }`}
        title={disabled ? "Belum ada data wajah" : "Hapus embedding lama untuk registrasi ulang"}
      >
        {busy ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Re-enroll
      </button>

      <Modal
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title="Re-enroll user"
        description={`Hapus data wajah "${nama}" dan minta registrasi ulang?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button variant="destructive" loading={busy} onClick={handleReEnroll}>
              Hapus & Minta Ulang
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
