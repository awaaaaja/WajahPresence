"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export default function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
        active
          ? "bg-primary-soft text-primary"
          : "text-foreground hover:bg-gray-100"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
