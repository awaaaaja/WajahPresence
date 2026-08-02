import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}

export default function PageHeader({
  title,
  description,
  backHref = "/",
  backLabel = "Kembali",
  right,
}: PageHeaderProps) {
  return (
    <header className="bg-gradient-to-b from-primary to-blue-800 px-5 pb-6 pt-5 text-white pt-safe">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-blue-100 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
        {right}
      </div>
      <div className="mx-auto mt-2 max-w-lg">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-blue-100">{description}</p>}
      </div>
    </header>
  );
}
