import Link from "next/link";
import { cookies } from "next/headers";

import ReEnrollButton from "@/components/re-enroll-button";
import { backendFetch, UserSummary } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  not_enrolled: "bg-gray-100 text-gray-500",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return <p className="text-sm text-gray-500">Login diperlukan.</p>;
  }

  let users: UserSummary[] = [];
  let error: string | null = null;
  try {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (q) query.set("q", q);
    users = await backendFetch<UserSummary[]>(`/admin/users?${query.toString()}`, session.access_token);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal memuat data user";
  }

  const filters = [
    { key: undefined, label: "Semua" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "not_enrolled", label: "Belum Enroll" },
  ];

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Users</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/users?status=${f.key}${q ? `&q=${q}` : ""}` : `/users${q ? `?q=${q}` : ""}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              (status ?? undefined) === f.key
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form method="get" action="/users" className="ml-auto flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cari nama / email…"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Cari
          </button>
        </form>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {users.length === 0 && !error && (
        <p className="text-sm text-gray-500">Belum ada user.</p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Samples</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.nama}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[u.status_enrollment] ?? STATUS_STYLE.not_enrolled
                    }`}
                  >
                    {u.status_enrollment}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.sample_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/users/${u.id}`} className="font-medium text-blue-600 hover:underline">
                      Detail
                    </Link>
                    <ReEnrollButton
                      userId={u.id}
                      nama={u.nama}
                      token={session.access_token}
                      disabled={u.sample_count === 0}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
