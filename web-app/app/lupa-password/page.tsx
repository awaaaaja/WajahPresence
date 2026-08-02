"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";

import Button from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground transition-colors duration-200 focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function LupaPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!EMAIL_RE.test(email.trim())) {
      setError("Masukkan email yang valid.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());

    if (resetError) {
      setError("Gagal mengirim email reset. Coba lagi nanti.");
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 pb-safe">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-md">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lupa Password</h1>
            <p className="text-sm text-muted">Kami kirim tautan reset ke email Anda</p>
          </div>
        </div>

        {sent ? (
          <div className="mt-8 space-y-5">
            <p
              role="status"
              className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success"
            >
              Jika email terdaftar, tautan reset sudah dikirim ke {email.trim()}. Cek kotak
              masuk (termasuk folder spam), lalu ikuti tautannya.
            </p>
            <Button variant="primary" fullWidth onClick={() => setSent(false)}>
              Kirim ulang
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Kembali ke halaman masuk
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className={inputClass}
                placeholder="nama@email.com"
                aria-invalid={!!error}
              />
              {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
            </div>

            <Button type="submit" fullWidth loading={loading}>
              {loading ? "Mengirim..." : "Kirim tautan reset"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Kembali ke halaman masuk
          </Link>
        </div>
      </div>
    </main>
  );
}
