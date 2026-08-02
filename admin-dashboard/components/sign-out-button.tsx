"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { createClient } from "@/utils/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-gray-100"
    >
      <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
      Keluar
    </button>
  );
}
