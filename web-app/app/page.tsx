import Link from "next/link";
import { ScanFace, CalendarCheck, History, ShieldCheck } from "lucide-react";

const ACTIONS = [
  {
    href: "/registrasi",
    title: "Registrasi Wajah",
    description: "Daftarkan wajah sekali (5 sudut) sebelum bisa absen.",
    icon: ScanFace,
    iconClass: "bg-primary-soft text-primary",
  },
  {
    href: "/absensi",
    title: "Absensi Harian",
    description: "Absen dengan verifikasi wajah + lokasi real-time.",
    icon: CalendarCheck,
    iconClass: "bg-success-soft text-success",
  },
  {
    href: "/riwayat",
    title: "Riwayat Absensi",
    description: "Lihat riwayat absensi dan status kehadiranmu.",
    icon: History,
    iconClass: "bg-info-soft text-primary",
  },
];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-background pb-safe">
      <header className="bg-gradient-to-b from-primary to-blue-800 px-5 pb-8 pt-12 text-white pt-safe">
        <div className="mx-auto max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-blue-50">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Wajah + lokasi terverifikasi
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">WajahPresence</h1>
          <p className="mt-2 text-sm leading-relaxed text-blue-100">
            Sistem absensi dengan face recognition dan verifikasi lokasi live.
          </p>
        </div>
      </header>

      <section className="mx-auto w-full max-w-lg flex-1 p-5">
        <div className="flex flex-col gap-4">
          {ACTIONS.map(({ href, title, description, icon: Icon, iconClass }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 rounded-xl bg-surface p-5 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-foreground">
                  {title}
                </span>
                <span className="mt-1 block text-sm text-muted">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
