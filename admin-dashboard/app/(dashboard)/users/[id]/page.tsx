import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import DecisionForm from "@/components/decision-form";
import { backendFetch, UserDetail } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const ANGLE_LABEL: Record<string, string> = {
  front: "Depan",
  left: "Kiri",
  right: "Kanan",
  up: "Atas",
  down: "Bawah",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  not_enrolled: "bg-gray-100 text-gray-500",
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
        <Link href="/users" className="text-sm text-blue-600 hover:underline">
          ← Kembali ke Users
        </Link>
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {err instanceof Error ? err.message : "Gagal memuat detail user"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/users" className="text-sm text-blue-600 hover:underline">
        ← Kembali ke Users
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold text-gray-900">{user.nama}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            STATUS_STYLE[user.status_enrollment] ?? ""
          }`}
        >
          {user.status_enrollment}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {user.email}
        {user.nim_nip ? ` · ${user.nim_nip}` : ""}
      </p>

      {user.rejection_reason && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Alasan penolakan: {user.rejection_reason}
        </p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Foto Sample (5 sudut)</h3>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {user.samples.map((s) => (
              <div key={s.angle} className="text-center">
                {s.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.signed_url}
                    alt={`Sample ${s.angle}`}
                    className="aspect-[3/4] w-full rounded-lg border border-gray-200 object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-[10px] text-gray-400">
                    -
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {ANGLE_LABEL[s.angle] ?? s.angle}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Riwayat Consent Biometrik</h3>
            {user.consents.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">Tidak ada consent tercatat.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
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
