"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import LivenessCapture, {
  CapturedSample,
} from "@/components/liveness-capture";
import { backendFetch } from "@/utils/backend";
import { createClient } from "@/utils/supabase/client";

const POLICY_VERSION = "2026-08-01-v1";

const ANGLES: { angle: string; label: string; guide: string }[] = [
  { angle: "front", label: "Depan", guide: "Hadapkan wajah lurus ke kamera" },
  { angle: "left", label: "Kiri", guide: "Putar wajah sedikit ke KIRI" },
  { angle: "right", label: "Kanan", guide: "Putar wajah sedikit ke KANAN" },
  { angle: "up", label: "Atas", guide: "Angkat wajah sedikit ke ATAS" },
  { angle: "down", label: "Bawah", guide: "Turunkan wajah sedikit ke BAWAH" },
];

type Step =
  | { name: "consent" }
  | { name: "capture"; index: number }
  | { name: "review" }
  | { name: "done" };

export default function RegistrasiPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [nama, setNama] = useState("");
  const [nimNip, setNimNip] = useState("");
  const [step, setStep] = useState<Step>({ name: "consent" });
  const [samples, setSamples] = useState<(CapturedSample | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace("/login?next=/registrasi");
          return;
        }
        setToken(data.session.access_token);
      });
  }, [router]);

  const current = useMemo(
    () => (step.name === "capture" ? ANGLES[step.index] : null),
    [step],
  );

  const onCaptured = (sample: CapturedSample) => {
    if (step.name !== "capture") return;
    const next = [...samples];
    next[step.index] = sample;
    setSamples(next);
    if (step.index < ANGLES.length - 1) {
      setStep({ name: "capture", index: step.index + 1 });
    } else {
      setStep({ name: "review" });
    }
  };

  const submit = async () => {
    if (!samples.every(Boolean)) return;
    setSubmitting(true);
    setError(null);
    try {
      // Consent wajib tercatat sebelum enrollment (NFR-4)
      await backendFetch("/enrollment/consent", token, {
        method: "POST",
        body: JSON.stringify({ policy_version: POLICY_VERSION }),
      });
      await backendFetch("/enrollment", token, {
        method: "POST",
        body: JSON.stringify({
          nama: nama.trim(),
          nim_nip: nimNip.trim() || null,
          policy_version: POLICY_VERSION,
          samples: samples.map((s) => ({
            angle: s!.angle,
            image_base64: s!.imageBase64,
          })),
        }),
      });
      setStep({ name: "done" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrasi gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-blue-600 px-5 py-6 text-white">
        <Link href="/" className="text-sm text-blue-100">
          ← Kembali
        </Link>
        <h1 className="mt-2 text-xl font-bold">Registrasi Wajah</h1>
        <p className="mt-1 text-sm text-blue-100">
          {step.name === "done" ? "Selesai" : "Ambil 5 sample wajah dari sudut berbeda"}
        </p>
      </header>

      <section className="p-5">
        {step.name === "consent" && (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-semibold text-gray-800">Data Diri</p>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="nama" className="mb-1 block text-sm font-medium text-gray-700">
                    Nama Lengkap
                  </label>
                  <input
                    id="nama"
                    type="text"
                    required
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Nama sesuai dokumen"
                  />
                </div>
                <div>
                  <label htmlFor="nim" className="mb-1 block text-sm font-medium text-gray-700">
                    NIM / NIP <span className="text-gray-400">(opsional)</span>
                  </label>
                  <input
                    id="nim"
                    type="text"
                    value={nimNip}
                    onChange={(e) => setNimNip(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Nomor induk"
                  />
                </div>
              </div>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm text-gray-600">
                Saya menyetujui data biometrik (foto &amp; representasi wajah) saya disimpan
                dan dipakai hanya untuk keperluan verifikasi absensi, sesuai kebijakan privasi
                institusi (versi {POLICY_VERSION}).
              </span>
            </label>

            <button
              type="button"
              disabled={!consent || !nama.trim()}
              onClick={() => setStep({ name: "capture", index: 0 })}
              className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Lanjut ke Pengambilan Sample
            </button>
            {!consent && (
              <p className="mt-3 text-center text-xs text-gray-400">
                Centang persetujuan dan isi nama untuk melanjutkan.
              </p>
            )}
          </>
        )}

        {step.name === "capture" && current && (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm">
                <p className="font-semibold text-gray-800">
                  Sample {step.index + 1} dari {ANGLES.length}: {current.label}
                </p>
                <p className="text-gray-500">{Math.round(((step.index + 1) / ANGLES.length) * 100)}%</p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${((step.index + 1) / ANGLES.length) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex gap-1.5">
                {ANGLES.map((a, i) => (
                  <span
                    key={a.angle}
                    className={`flex-1 rounded py-1 text-center text-xs font-medium ${
                      i < step.index
                        ? "bg-green-100 text-green-700"
                        : i === step.index
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            </div>

            <LivenessCapture
              angle={current.angle}
              angleLabel={current.label}
              guideText={current.guide}
              authToken={token}
              onCaptured={onCaptured}
            />

            {step.index > 0 && (
              <button
                type="button"
                onClick={() => setStep({ name: "capture", index: step.index - 1 })}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                ← Sample Sebelumnya
              </button>
            )}
          </>
        )}

        {step.name === "review" && (
          <>
            <p className="text-sm text-gray-600">
              Periksa kelima sample. Gunakan tombol untuk mengulang salah satu sudut.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {ANGLES.map((a, i) => (
                <div key={a.angle} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {samples[i] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/jpeg;base64,${samples[i]!.imageBase64}`}
                      alt={`Sample ${a.label}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setStep({ name: "capture", index: i })}
                    className="w-full py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    Ulangi {a.label}
                  </button>
                </div>
              ))}
            </div>

            {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Mengirim registrasi..." : "Kirim Registrasi"}
            </button>
          </>
        )}

        {step.name === "done" && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
            <p className="text-3xl">✓</p>
            <p className="mt-2 font-semibold text-green-800">Registrasi wajah diterima</p>
            <p className="mt-1 text-sm text-green-700">
              Status saat ini: <b>menunggu persetujuan admin</b>. Kamu akan bisa absen setelah
              disetujui.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700"
            >
              Kembali ke Beranda
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
