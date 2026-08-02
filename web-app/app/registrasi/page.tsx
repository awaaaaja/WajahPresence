"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";

import LivenessCapture, {
  CapturedSample,
} from "@/components/liveness-capture";
import PageHeader from "@/components/page-header";
import Button from "@/components/ui/button";
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

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground transition-colors duration-200 focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

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

  const stepTitle =
    step.name === "done"
      ? "Selesai"
      : step.name === "capture"
        ? `Sample ${step.index + 1} dari ${ANGLES.length}`
        : "Ambil 5 sample wajah dari sudut berbeda";

  return (
    <main className="min-h-screen bg-background pb-10 pb-safe">
      <PageHeader
        title="Registrasi Wajah"
        description={stepTitle}
        right={
          <span className="text-sm font-semibold text-blue-100">
            {step.name === "capture"
              ? `${Math.round(((step.index + 1) / ANGLES.length) * 100)}%`
              : ""}
          </span>
        }
      />

      <section className="mx-auto w-full max-w-lg p-5">
        {step.name === "consent" && (
          <>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-sm font-semibold text-foreground">Data Diri</p>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="nama" className="mb-1 block text-sm font-medium text-foreground">
                    Nama Lengkap
                  </label>
                  <input
                    id="nama"
                    type="text"
                    required
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    className={inputClass}
                    placeholder="Nama sesuai dokumen"
                  />
                </div>
                <div>
                  <label htmlFor="nim" className="mb-1 block text-sm font-medium text-foreground">
                    NIM / NIP <span className="text-muted">(opsional)</span>
                  </label>
                  <input
                    id="nim"
                    type="text"
                    value={nimNip}
                    onChange={(e) => setNimNip(e.target.value)}
                    className={inputClass}
                    placeholder="Nomor induk"
                  />
                </div>
              </div>
            </div>

            <label className="mt-4 flex min-h-[44px] items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
              />
              <span className="text-sm leading-relaxed text-foreground">
                Saya menyetujui data biometrik (foto &amp; representasi wajah) saya disimpan
                dan dipakai hanya untuk keperluan verifikasi absensi, sesuai kebijakan privasi
                institusi (versi {POLICY_VERSION}).
              </span>
            </label>

            <Button
              type="button"
              fullWidth
              disabled={!consent || !nama.trim()}
              onClick={() => setStep({ name: "capture", index: 0 })}
              className="mt-5"
            >
              Lanjut ke Pengambilan Sample
            </Button>
            {!consent && (
              <p className="mt-3 text-center text-xs text-muted">
                Centang persetujuan dan isi nama untuk melanjutkan.
              </p>
            )}
          </>
        )}

        {step.name === "capture" && current && (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm">
                <p className="font-semibold text-foreground">
                  {current.label}
                </p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${((step.index + 1) / ANGLES.length) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex gap-1.5">
                {ANGLES.map((a, i) => (
                  <span
                    key={a.angle}
                    className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold ${
                      i < step.index
                        ? "bg-success-soft text-success"
                        : i === step.index
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-muted"
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
              <Button
                type="button"
                variant="outline"
                fullWidth
                className="mt-3"
                onClick={() => setStep({ name: "capture", index: step.index - 1 })}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Sample Sebelumnya
              </Button>
            )}
          </>
        )}

        {step.name === "review" && (
          <>
            <p className="text-sm text-muted">
              Periksa kelima sample. Gunakan tombol untuk mengulang salah satu sudut.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {ANGLES.map((a, i) => (
                <div key={a.angle} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                  {samples[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/jpeg;base64,${samples[i]!.imageBase64}`}
                      alt={`Sample ${a.label}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-gray-100">
                      <CheckCircle2 className="h-6 w-6 text-gray-300" aria-hidden="true" />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => setStep({ name: "capture", index: i })}
                    className="rounded-none"
                  >
                    Ulangi {a.label}
                  </Button>
                </div>
              ))}
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="button"
              fullWidth
              loading={submitting}
              disabled={submitting}
              onClick={submit}
              className="mt-5"
            >
              {submitting ? "Mengirim registrasi..." : "Kirim Registrasi"}
            </Button>
          </>
        )}

        {step.name === "done" && (
          <div className="rounded-xl border border-success bg-success-soft p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
            <p className="mt-3 text-lg font-semibold text-foreground">
              Registrasi wajah diterima
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              Status saat ini: <b>menunggu persetujuan admin</b>. Kamu akan bisa absen setelah
              disetujui.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-base font-semibold text-white transition-all duration-200 hover:bg-accent-hover focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98]"
            >
              Kembali ke Beranda
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
