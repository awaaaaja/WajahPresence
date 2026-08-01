"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AttendanceCapture, { AttendanceResult } from "@/components/attendance-capture";
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
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-blue-600 px-5 py-6 text-white">
        <Link href="/" className="text-sm text-blue-100">
          ← Kembali
        </Link>
        <h1 className="mt-2 text-xl font-bold">Absensi Harian</h1>
        <p className="mt-1 text-sm text-blue-100">Verifikasi wajah + lokasi real-time</p>
      </header>

      <section className="p-5">
        {result && (
          <div
            className={`mb-5 rounded-xl border p-4 ${
              result.success
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p className={`text-base font-bold ${result.success ? "text-green-800" : "text-red-800"}`}>
              {result.success ? "✓ Absensi Berhasil" : "✗ Absensi Ditolak"}
            </p>
            {result.success && result.nama && (
              <p className="mt-1 text-sm text-green-700">
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
                <p className="mt-1 text-sm text-red-700">{result.message}</p>
                {result.reasons && result.reasons.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-red-600">
                    {result.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
                {result.retryAfterMinutes !== undefined && (
                  <p className="mt-1 text-xs text-red-600">
                    Coba lagi dalam ±{result.retryAfterMinutes} menit.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {!result?.success && (
          <div className="space-y-5">
            <p className="text-xs text-gray-500">
              Ikuti instruksi arah di layar (KIRI/KANAN/LURUS) dan berkediplah normal selama
              verifikasi. Lokasi diambil bersamaan dengan verifikasi wajah.
            </p>
            <AttendanceCapture authToken={token} onResult={setResult} />
          </div>
        )}

        {result?.success && (
          <Link
            href="/"
            className="mt-5 block w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            Kembali ke Beranda
          </Link>
        )}
      </section>
    </main>
  );
}
