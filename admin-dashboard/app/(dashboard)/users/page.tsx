import Link from "next/link";
import { cookies } from "next/headers";
import { Search } from "lucide-react";

import ReEnrollButton from "@/components/re-enroll-button";
import StatusBadge from "@/components/status-badge";
import Button from "@/components/ui/button";
import { backendFetch, UserSummary } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

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
      <h2 className="mb-4 font-mono text-xl font-semibold text-foreground">Users</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/users?status=${f.key}${q ? `&q=${q}` : ""}` : `/users${q ? `?q=${q}` : ""}`}
            aria-current={(status ?? undefined) === f.key ? "page" : undefined}
            className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              (status ?? undefined) === f.key
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:bg-gray-100"
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
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button type="submit" size="sm">
            <Search className="h-4 w-4" aria-hidden="true" />
            Cari
          </Button>
        </form>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {users.length === 0 && !error && (
        <p className="text-sm text-muted">Belum ada user.</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-gray-50 text-xs uppercase tracking-wide text-muted">
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
                <td className="px-4 py-3 font-medium text-foreground">{u.nama}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.status_enrollment} />
                </td>
                <td className="px-4 py-3 text-muted">{u.sample_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/users/${u.id}`} className="font-medium text-primary hover:underline">
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
