import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import DecisionForm from "@/components/decision-form";
import StatusBadge from "@/components/status-badge";
import { backendFetch, UserDetail } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const ANGLE_LABEL: Record<string, string> = {
  front: "Depan",
  left: "Kiri",
  right: "Kanan",
  up: "Atas",
  down: "Bawah",
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return <p className="text-sm text-gray-500">Login diperlukan.</p>;
  }

  let user: UserDetail;
  try {
    user = await backendFetch<UserDetail>(`/admin/users/${id}`, session.access_token);
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      notFound();
    }
    return (
      <div>
        <Link href="/users" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke Users
        </Link>
        <p role="alert" className="mt-4 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {err instanceof Error ? err.message : "Gagal memuat detail user"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/users" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Kembali ke Users
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h2 className="font-mono text-xl font-semibold text-foreground">{user.nama}</h2>
        <StatusBadge status={user.status_enrollment} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {user.email}
        {user.nim_nip ? ` · ${user.nim_nip}` : ""}
      </p>

      {user.rejection_reason && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          Alasan penolakan: {user.rejection_reason}
        </p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Foto Sample (5 sudut)</h3>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {user.samples.map((s) => (
              <div key={s.angle} className="text-center">
                {s.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.signed_url}
                    alt={`Sample ${s.angle}`}
                    className="aspect-[3/4] w-full rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-border bg-gray-100 text-[10px] text-muted">
                    -
                  </div>
                )}
                <p className="mt-1 text-xs text-muted">
                  {ANGLE_LABEL[s.angle] ?? s.angle}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Riwayat Consent Biometrik</h3>
            {user.consents.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Tidak ada consent tercatat.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {user.consents.map((c) => (
                  <li key={c.accepted_at}>
                    v{c.policy_version} · {new Date(c.accepted_at).toLocaleString("id-ID")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DecisionForm
            userId={user.id}
            status={user.status_enrollment}
            token={session.access_token}
            samples={user.samples}
          />
        </div>
      </div>
    </div>
  );
}
