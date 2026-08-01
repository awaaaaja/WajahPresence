"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/utils/supabase/client";

type LocationRow = {
  id: string;
  nama_site: string;
  lat: number;
  lng: number;
  radius_meter: number;
  created_at: string;
};

const emptyForm = { nama_site: "", lat: "", lng: "", radius_meter: "" };

export default function LocationsManager({
  initial,
  isAdmin,
}: {
  initial: LocationRow[];
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<LocationRow[]>(initial);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [locStatus, setLocStatus] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const notify = (ok: boolean, text: string) => {
    setMessage({ ok, text });
    if (!ok) return;
    setTimeout(() => setMessage(null), 3000);
  };

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      notify(false, "Browser tidak mendukung Geolocation API");
      return;
    }
    setLocStatus("Mendapatkan lokasi...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }));
        setLocStatus("Lokasi OK — periksa nilai & radius sebelum simpan");
      },
      () => setLocStatus("Gagal mendapat lokasi — masukkan koordinat manual"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const radius = Number(form.radius_meter);
    if (!form.nama_site.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) {
      notify(false, "Isi nama, koordinat, dan radius dengan benar");
      return;
    }
    if (radius <= 0) {
      notify(false, "Radius harus lebih dari 0 meter");
      return;
    }

    const payload = { nama_site: form.nama_site.trim(), lat, lng, radius_meter: radius };
    const { error } = editing
      ? await supabase.from("locations").update(payload).eq("id", editing.id)
      : await supabase.from("locations").insert(payload);

    if (error) {
      notify(false, `Gagal menyimpan: ${error.message}`);
      return;
    }
    setEditing(null);
    setForm(emptyForm);
    await reload();
    notify(true, editing ? "Lokasi diperbarui" : "Lokasi ditambahkan");
  };

  const remove = async (id: string) => {
    if (!window.confirm("Hapus lokasi geofence ini?")) return;
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) {
      notify(false, `Gagal menghapus: ${error.message}`);
      return;
    }
    await reload();
    notify(true, "Lokasi dihapus");
  };

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from("locations")
      .select("id, nama_site, lat, lng, radius_meter, created_at")
      .order("created_at", { ascending: false });
    if (!error && data) setRows(data as LocationRow[]);
  }, [supabase]);

  const startEdit = (row: LocationRow) => {
    setEditing(row);
    setForm({
      nama_site: row.nama_site,
      lat: String(row.lat),
      lng: String(row.lng),
      radius_meter: String(row.radius_meter),
    });
  };

  const input =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div>
      {message && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}

      {isAdmin && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            {editing ? `Edit: ${editing.nama_site}` : "Tambah lokasi geofence"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Nama site</label>
              <input
                className={input}
                value={form.nama_site}
                onChange={(e) => setForm({ ...form, nama_site: e.target.value })}
                placeholder="mis. Kampus A"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Radius (meter)</label>
              <input
                className={input}
                type="number"
                min={1}
                value={form.radius_meter}
                onChange={(e) => setForm({ ...form, radius_meter: e.target.value })}
                placeholder="mis. 100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Latitude</label>
              <input
                className={input}
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                placeholder="-6.2088"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Longitude</label>
              <input
                className={input}
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
                placeholder="106.8456"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Pakai lokasi saya
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {editing ? "Simpan perubahan" : "Tambah lokasi"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
            )}
          </div>
          {locStatus && <p className="mt-2 text-xs text-gray-500">{locStatus}</p>}
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-gray-500">
          Belum ada lokasi. Tambahkan lokasi agar geofence absensi aktif (Sprint 3).
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Latitude</th>
              <th className="px-4 py-3">Longitude</th>
              <th className="px-4 py-3">Radius</th>
              {isAdmin && <th className="px-4 py-3">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.nama_site}</td>
                <td className="px-4 py-3 text-gray-600">{r.lat.toFixed(5)}</td>
                <td className="px-4 py-3 text-gray-600">{r.lng.toFixed(5)}</td>
                <td className="px-4 py-3 text-gray-600">{r.radius_meter} m</td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <button
                      onClick={() => startEdit(r)}
                      className="mr-3 font-medium text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(r.id)} className="font-medium text-red-600 hover:underline">
                      Hapus
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
