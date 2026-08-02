import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MapPin,
  Clock3,
  ShieldAlert,
  Map,
} from "lucide-react";

import NavLink from "@/components/nav-link";
import SignOutButton from "@/components/sign-out-button";
import { ToastProvider } from "@/components/ui/toast";
import { createClient } from "@/utils/supabase/server";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/attendance-logs", label: "Attendance Logs", icon: Clock3 },
  { href: "/suspicious-attempts", label: "Suspicious Attempts", icon: ShieldAlert },
  { href: "/map", label: "Peta", icon: Map },
];

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Proteksi role: dashboard hanya untuk admin/superadmin (server-side).
  const { data: roleRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!roleRow || (roleRow.role !== "admin" && roleRow.role !== "superadmin")) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full flex-col gap-1 border-b border-border bg-surface p-4 md:w-64 md:border-b-0 md:border-r">
        <div className="mb-4">
          <h1 className="font-mono text-lg font-bold text-foreground">
            WajahPresence
          </h1>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="mt-4 md:mt-auto">
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 bg-background p-4 md:p-8">
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  );
}
