import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-blue-600 px-5 pb-6 pt-10 text-white">
        <h1 className="text-2xl font-bold">Sistem Absensi</h1>
        <p className="mt-1 text-sm text-blue-100">
          Face recognition + verifikasi lokasi live
        </p>
      </header>

      <section className="flex flex-1 flex-col gap-4 p-5">
        <Link
          href="/registrasi"
          className="rounded-xl bg-white p-5 shadow-sm transition active:scale-[0.99]"
        >
          <h2 className="text-lg font-semibold text-gray-900">Registrasi Wajah</h2>
          <p className="mt-1 text-sm text-gray-500">
            Daftarkan wajah sekali (5 sudut) sebelum bisa absen.
          </p>
        </Link>
        <Link
          href="/absensi"
          className="rounded-xl bg-white p-5 shadow-sm transition active:scale-[0.99]"
        >
          <h2 className="text-lg font-semibold text-gray-900">Absensi Harian</h2>
          <p className="mt-1 text-sm text-gray-500">
            Absen dengan wajah + lokasi real-time.
          </p>
        </Link>
      </section>
    </main>
  );
}
