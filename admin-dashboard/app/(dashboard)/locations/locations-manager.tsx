"use client";

import { useCallback, useEffect, useState } from "react";
import { LocateFixed, MapPinOff, Plus, Trash2, X } from "lucide-react";

import Modal from "@/components/ui/modal";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
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
  const [deleteTarget, setDeleteTarget] = useState<LocationRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [locStatus, setLocStatus] = useState<string | null>(null);

  const supabase = createClient();
  const { toast } = useToast();

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("Browser tidak mendukung Geolocation API", "error");
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
      toast("Isi nama, koordinat, dan radius dengan benar", "error");
      return;
    }
    if (radius <= 0) {
      toast("Radius harus lebih dari 0 meter", "error");
      return;
    }

    const payload = { nama_site: form.nama_site.trim(), lat, lng, radius_meter: radius };
    const { error } = editing
      ? await supabase.from("locations").update(payload).eq("id", editing.id)
      : await supabase.from("locations").insert(payload);

    if (error) {
      toast(`Gagal menyimpan: ${error.message}`, "error");
      return;
    }
    setEditing(null);
    setForm(emptyForm);
    await reload();
    toast(editing ? "Lokasi diperbarui" : "Lokasi ditambahkan", "success");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("locations").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast(`Gagal menghapus: ${error.message}`, "error");
      return;
    }
    setDeleteTarget(null);
    await reload();
    toast("Lokasi dihapus", "success");
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const input =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div>
      {isAdmin && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {editing ? `Edit: ${editing.nama_site}` : "Tambah lokasi geofence"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Nama site</label>
              <input
                className={input}
                value={form.nama_site}
                onChange={(e) => setForm({ ...form, nama_site: e.target.value })}
                placeholder="mis. Kampus A"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Radius (meter)</label>
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
              <label className="mb-1 block text-xs text-muted">Latitude</label>
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
              <label className="mb-1 block text-xs text-muted">Longitude</label>
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
              Pakai lokasi saya
            </Button>
            <Button type="button" size="sm" onClick={save}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {editing ? "Simpan perubahan" : "Tambah lokasi"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Batal
              </Button>
            )}
          </div>
          {locStatus && <p className="mt-2 text-xs text-muted">{locStatus}</p>}
        </div>
      )}

      {rows.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-border bg-surface py-10 text-center shadow-sm">
          <MapPinOff className="h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted">
            Belum ada lokasi. Tambahkan lokasi agar geofence absensi aktif.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-gray-50 text-xs uppercase tracking-wide text-muted">
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
                <td className="px-4 py-3 font-medium text-foreground">{r.nama_site}</td>
                <td className="px-4 py-3 font-mono text-muted">{r.lat.toFixed(5)}</td>
                <td className="px-4 py-3 font-mono text-muted">{r.lng.toFixed(5)}</td>
                <td className="px-4 py-3 text-muted">{r.radius_meter} m</td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="mr-3 font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(r)}
                      className="inline-flex items-center gap-1 font-medium text-destructive hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Hapus
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Hapus lokasi geofence"
        description={
          deleteTarget
            ? `Yakin hapus "${deleteTarget.nama_site}"? Absen dari lokasi ini tidak akan terverifikasi lagi.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="destructive" loading={deleting} onClick={confirmDelete}>
              Hapus Lokasi
            </Button>
          </>
        }
      />
    </div>
  );
}
