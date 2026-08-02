"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Home } from "lucide-react";

import AttendanceCapture, { AttendanceResult } from "@/components/attendance-capture";
import PageHeader from "@/components/page-header";
import Badge from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";

export default function AbsensiPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceResult | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace("/login?next=/absensi");
          return;
        }
        setToken(data.session.access_token);
      });
  }, [router]);

  return (
    <main className="min-h-screen bg-background pb-10 pb-safe">
      <PageHeader title="Absensi Harian" description="Verifikasi wajah + lokasi real-time" />

      <section className="mx-auto w-full max-w-lg p-5">
        {result && (
          <div
            className={`mb-5 rounded-xl border p-4 shadow-sm ${
              result.success ? "border-success bg-success-soft" : "border-destructive bg-destructive-soft"
            }`}
            role={result.success ? "status" : "alert"}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              )}
              <p className="text-base font-bold text-foreground">
                {result.success ? "Absensi Berhasil" : "Absensi Ditolak"}
              </p>
              <span className="ml-auto">
                <Badge variant={result.success ? "success" : "danger"}>
                  {result.success ? "Tercatat" : "Ditolak"}
                </Badge>
              </span>
            </div>
            {result.success && result.nama && (
              <p className="mt-2 text-sm text-foreground">
                {result.nama}
                {result.timestamp
                  ? ` · ${new Date(result.timestamp).toLocaleString("id-ID")}`
                  : ""}
                {result.confidence !== undefined
                  ? ` · skor ${(result.confidence * 100).toFixed(1)}%`
                  : ""}
              </p>
            )}
            {!result.success && (
              <>
                <p className="mt-2 text-sm text-foreground">{result.message}</p>
                {result.reasons && result.reasons.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-sm text-foreground">
                    {result.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
                {result.retryAfterMinutes !== undefined && (
                  <p className="mt-1 text-sm text-foreground">
                    Coba lagi dalam ±{result.retryAfterMinutes} menit.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {!result?.success && (
          <div className="space-y-5">
            <p className="text-sm text-muted">
              Ikuti instruksi arah di layar (KIRI/KANAN/LURUS) dan berkediplah normal selama
              verifikasi. Lokasi diambil bersamaan dengan verifikasi wajah.
            </p>
            <AttendanceCapture authToken={token} onResult={setResult} />
          </div>
        )}

        {result?.success && (
          <Link
            href="/"
            className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-base font-semibold text-white transition-all duration-200 hover:bg-accent-hover focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98]"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Kembali ke Beranda
          </Link>
        )}
      </section>
    </main>
  );
}
