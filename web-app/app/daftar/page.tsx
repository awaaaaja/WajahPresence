"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, ScanFace } from "lucide-react";

import Button from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

type FieldName = "nama" | "nimNip" | "email" | "inviteCode" | "password" | "konfirmasi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PASSWORD_RULES = [
  { label: "minimal 8 karakter", test: (p: string) => p.length >= 8 },
  { label: "1 huruf besar", test: (p: string) => /[A-Z]/.test(p) },
  { label: "1 huruf kecil", test: (p: string) => /[a-z]/.test(p) },
  { label: "1 angka", test: (p: string) => /[0-9]/.test(p) },
  { label: "1 simbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground transition-colors duration-200 focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function DaftarPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nama: "",
    nimNip: "",
    email: "",
    inviteCode: "",
    password: "",
    konfirmasi: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passed = PASSWORD_RULES.filter((r) => r.test(form.password)).length;
  const strength = passed === 0 ? 0 : passed === 5 ? 100 : passed * 20;

  const set = (field: FieldName) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!form.nama.trim()) next.nama = "Nama wajib diisi";
    if (!EMAIL_RE.test(form.email.trim())) next.email = "Format email tidak valid";
    if (!form.inviteCode.trim()) next.inviteCode = "Kode undangan wajib diisi";
    if (passed < 5) next.password = "Password belum memenuhi semua ketentuan";
    if (form.konfirmasi !== form.password) next.konfirmasi = "Konfirmasi password tidak sama";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: form.nama,
          nimNip: form.nimNip,
          email: form.email,
          password: form.password,
          inviteCode: form.inviteCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Gagal mendaftar. Coba lagi.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) {
        setFormError("Akun berhasil dibuat, tapi gagal masuk otomatis. Silakan login.");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setFormError("Terjadi kesalahan jaringan. Coba lagi.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 pb-safe">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-md">
            <ScanFace className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Buat Akun</h1>
            <p className="text-sm text-muted">Pendaftaran dengan kode undangan</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="nama" className="mb-1.5 block text-sm font-medium text-foreground">
              Nama Lengkap
            </label>
            <input
              id="nama"
              type="text"
              required
              autoComplete="name"
              autoCapitalize="words"
              value={form.nama}
              onChange={set("nama")}
              className={inputClass}
              placeholder="Nama sesuai identitas"
              aria-invalid={!!errors.nama}
            />
            {errors.nama && <p className="mt-1 text-sm text-destructive">{errors.nama}</p>}
          </div>

          <div>
            <label htmlFor="nimNip" className="mb-1.5 block text-sm font-medium text-foreground">
              NIM / NIP <span className="text-muted">(opsional)</span>
            </label>
            <input
              id="nimNip"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={form.nimNip}
              onChange={set("nimNip")}
              className={inputClass}
              placeholder="Contoh: 2024-001"
            />
          </div>

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
              value={form.email}
              onChange={set("email")}
              className={inputClass}
              placeholder="nama@email.com"
              aria-invalid={!!errors.email}
            />
            {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="inviteCode" className="mb-1.5 block text-sm font-medium text-foreground">
              Kode Undangan
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <input
                id="inviteCode"
                type="text"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={form.inviteCode}
                onChange={set("inviteCode")}
                className={inputClass + " pl-10"}
                placeholder="Kode dari admin"
                aria-invalid={!!errors.inviteCode}
              />
            </div>
            {errors.inviteCode && <p className="mt-1 text-sm text-destructive">{errors.inviteCode}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                value={form.password}
                onChange={set("password")}
                className={inputClass + " pr-11"}
                aria-invalid={!!errors.password}
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
            <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(form.password);
                return (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-xs ${
                      form.password && ok ? "text-success" : "text-muted"
                    }`}
                  >
                    <span aria-hidden="true">{form.password && ok ? "✓" : "•"}</span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={strength}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Kekuatan password"
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  strength <= 20 ? "bg-destructive" : strength <= 60 ? "bg-accent" : "bg-success"
                }`}
                style={{ width: `${strength}%` }}
              />
            </div>
            {errors.password && <p className="mt-1 text-sm text-destructive">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="konfirmasi" className="mb-1.5 block text-sm font-medium text-foreground">
              Ulangi Password
            </label>
            <div className="relative">
              <input
                id="konfirmasi"
                type={showConfirm ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                value={form.konfirmasi}
                onChange={set("konfirmasi")}
                className={inputClass + " pr-11"}
                aria-invalid={!!errors.konfirmasi}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Sembunyikan konfirmasi" : "Tampilkan konfirmasi"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {showConfirm ? (
                  <EyeOff className="h-4.5 w-4.5" aria-hidden="true" />
                ) : (
                  <Eye className="h-4.5 w-4.5" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.konfirmasi && <p className="mt-1 text-sm text-destructive">{errors.konfirmasi}</p>}
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}

          <Button type="submit" fullWidth loading={loading}>
            {loading ? "Mendaftarkan..." : "Daftar"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Sudah punya akun?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Masuk
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
