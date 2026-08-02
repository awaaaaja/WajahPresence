import { cookies } from "next/headers";
import { Users, UserCheck, CalendarCheck, ShieldAlert } from "lucide-react";

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
    {
      label: "Total User",
      value: totalUsers,
      icon: Users,
      iconClass: "bg-primary-soft text-primary",
    },
    {
      label: "Registrasi Pending",
      value: pendingUsers,
      icon: UserCheck,
      iconClass: "bg-warning-soft text-warning",
    },
    {
      label: "Absensi Hari Ini",
      value: todayLogs,
      icon: CalendarCheck,
      iconClass: "bg-success-soft text-success",
    },
    {
      label: "Mencurigakan (review)",
      value: suspiciousTotal,
      icon: ShieldAlert,
      iconClass: "bg-destructive-soft text-destructive",
    },
  ];

  return (
    <div>
      <h2 className="mb-4 font-mono text-xl font-semibold text-foreground">Dashboard</h2>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, iconClass }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{label}</p>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">
              {value ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
