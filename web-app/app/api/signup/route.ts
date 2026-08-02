import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inviteCode = process.env.SIGNUP_INVITE_CODE;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_MAX = 100;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

function passwordErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN) {
    errors.push(`minimal ${PASSWORD_MIN} karakter`);
  }
  if (password.length > PASSWORD_MAX) {
    errors.push(`maksimal ${PASSWORD_MAX} karakter`);
  }
  if (!/[A-Z]/.test(password)) errors.push("1 huruf besar");
  if (!/[a-z]/.test(password)) errors.push("1 huruf kecil");
  if (!/[0-9]/.test(password)) errors.push("1 angka");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("1 simbol (mis. !@#$)");
  return errors;
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey || !inviteCode) {
    return NextResponse.json(
      { error: "Pendaftaran belum dikonfigurasi di server (env)" },
      { status: 500 },
    );
  }

  let body: { nama?: string; nimNip?: string; email?: string; password?: string; inviteCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const nama = (body.nama ?? "").trim();
  const nimNip = (body.nimNip ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const kode = body.inviteCode ?? "";

  if (kode !== inviteCode) {
    return NextResponse.json(
      { error: "Kode undangan salah. Hubungi admin untuk mendapatkan kode." },
      { status: 403 },
    );
  }
  if (!nama || nama.length > NAME_MAX) {
    return NextResponse.json({ error: "Nama wajib diisi (maks 100 karakter)" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
  }
  const pwErrs = passwordErrors(password);
  if (pwErrs.length > 0) {
    return NextResponse.json(
      { error: `Password harus memenuhi: ${pwErrs.join(", ")}` },
      { status: 400 },
    );
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };

  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nama },
    }),
  });

  if (!createRes.ok) {
    const detail = (await createRes.json().catch(() => ({}))) as { msg?: string };
    const msg = String(detail?.msg ?? "").toLowerCase();
    if (msg.includes("already registered")) {
      return NextResponse.json(
        { error: "Email ini sudah terdaftar. Silakan login." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Gagal membuat akun. Coba lagi atau hubungi admin." },
      { status: 502 },
    );
  }

  const created = await createRes.json();
  const userId: string = created.id;

  const usersRes = await fetch(`${supabaseUrl}/rest/v1/users?on_conflict=id`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: userId,
      nama,
      nim_nip: nimNip || null,
      email,
      role: "user",
      status_enrollment: "not_enrolled",
    }),
  });

  if (!usersRes.ok) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers,
    });
    return NextResponse.json(
      { error: "Gagal menyimpan profil akun. Coba lagi." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email });
}
