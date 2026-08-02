"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, ScanFace } from "lucide-react";

import Button from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid email or password")) {
    return "Email atau password salah.";
  }
  if (m.includes("email not confirmed") || m.includes("not verified")) {
    return "Email belum dikonfirmasi. Periksa kotak masuk Anda.";
  }
  if (m.includes("too many") || m.includes("rate limit") || m.includes("429")) {
    return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
  }
  if (m.includes("user already registered")) {
    return "Email ini sudah terdaftar. Silakan masuk.";
  }
  if (m.includes("unexpected failure") || m.includes("network") || m.includes("fetch")) {
    return "Terjadi masalah koneksi. Periksa internet lalu coba lagi.";
  }
  if (m.includes("timeout") || m.includes("timed out")) {
    return "Waktu permintaan habis. Coba lagi.";
  }
  return message;
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground transition-colors duration-200 focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<"email" | "password" | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!EMAIL_RE.test(email.trim())) {
      setFieldError("email");
      return;
    }
    if (!password) {
      setFieldError("password");
      return;
    }
    setFieldError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(mapAuthError(error.message));
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 pb-safe">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-md">
            <ScanFace className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Masuk</h1>
            <p className="text-sm text-muted">Lanjutkan untuk absen</p>
          </div>
        </div>

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
                setFieldError(null);
              }}
              className={inputClass}
              placeholder="nama@email.com"
              aria-invalid={fieldError === "email"}
            />
            {fieldError === "email" && (
              <p className="mt-1 text-sm text-destructive">Masukkan email yang valid.</p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <Link
                href="/lupa-password"
                className="text-sm font-medium text-primary hover:underline"
              >
                Lupa password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldError(null);
                }}
                className={inputClass + " pr-11"}
                aria-invalid={fieldError === "password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {showPassword ? (
                  <EyeOff className="h-4.5 w-4.5" aria-hidden="true" />
                ) : (
                  <Eye className="h-4.5 w-4.5" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldError === "password" && (
              <p className="mt-1 text-sm text-destructive">Password wajib diisi.</p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={loading}>
            {loading ? "Memeriksa..." : "Masuk"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Belum punya akun?{" "}
          <Link href="/daftar" className="font-medium text-primary hover:underline">
            Daftar dengan kode undangan
          </Link>
        </p>

        <div className="mt-4 text-center">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </main>
  );
}
