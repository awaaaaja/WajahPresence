import { cookies } from "next/headers";

import { backendFetch, LogPage, UserSummary } from "@/utils/backend";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardHomePage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let totalUsers: number | null = null;
  let pendingUsers: number | null = null;
  let todayLogs: number | null = null;
  let suspiciousTotal: number | null = null;
  let error: string | null = null;

  if (session) {
    try {
      const [users, logsToday, suspicious] = await Promise.all([
        backendFetch<UserSummary[]>("/admin/users", session.access_token),
        backendFetch<LogPage>(
          `/admin/logs?start_date=${new Date().toISOString().slice(0, 10)}&page_size=1`,
          session.access_token,
        ),
        backendFetch<LogPage>(
          "/admin/logs?status=suspicious&reviewed=false&page_size=1",
          session.access_token,
        ),
      ]);
      totalUsers = users.length;
      pendingUsers = users.filter((u) => u.status_enrollment === "pending").length;
      todayLogs = logsToday.total;
      suspiciousTotal = suspicious.total;
    } catch (err) {
      error = err instanceof Error ? err.message : "Gagal memuat statistik";
    }
  }

  const cards = [
    { label: "Total User", value: totalUsers },
    { label: "Registrasi Pending", value: pendingUsers },
    { label: "Absensi Hari Ini", value: todayLogs },
    { label: "Mencurigakan (review)", value: suspiciousTotal },
  ];

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Dashboard</h2>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {card.value ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
