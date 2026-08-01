import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import SignOutButton from "@/components/sign-out-button";
import { createClient } from "@/utils/supabase/server";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/users", label: "Users", icon: "👥" },
  { href: "/locations", label: "Locations", icon: "📍" },
  { href: "/attendance-logs", label: "Attendance Logs", icon: "🕒" },
  { href: "/suspicious-attempts", label: "Suspicious Attempts", icon: "⚠️" },
  { href: "/map", label: "Peta", icon: "🗺️" },
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
      <aside className="flex w-full flex-col gap-1 border-b border-gray-200 bg-white p-4 md:w-64 md:border-b-0 md:border-r">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-gray-900">Absensi Admin</h1>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 md:mt-auto">
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 bg-gray-50 p-4 md:p-8">{children}</main>
    </div>
  );
}
