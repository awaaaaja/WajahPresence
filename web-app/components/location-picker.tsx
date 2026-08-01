"use client";

import { useCallback, useEffect, useState } from "react";

type GeoStatus = "idle" | "requesting" | "active" | "denied" | "unsupported" | "error";

export default function LocationPicker() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setErrorMessage("Browser ini tidak mendukung Geolocation API.");
      return;
    }
    setStatus("requesting");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus("active");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setErrorMessage("Izin lokasi ditolak. Izinkan akses lokasi lalu coba lagi.");
        } else {
          setStatus("error");
          setErrorMessage(`Gagal mendapatkan lokasi: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => () => setPosition(null), []);

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      {status === "active" && position ? (
        <div className="space-y-1 text-sm text-gray-700">
          <p>
            Lat: <span className="font-mono">{position.lat.toFixed(6)}</span>
          </p>
          <p>
            Lng: <span className="font-mono">{position.lng.toFixed(6)}</span>
          </p>
          <p>
            Accuracy: <span className="font-mono">{position.accuracy.toFixed(1)} m</span>
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500">
            {status === "denied" || status === "error" || status === "unsupported"
              ? errorMessage
              : "Lokasi dipakai untuk verifikasi geofence saat proses absensi."}
          </p>
          {status === "denied" && (
            <p className="mt-1 text-xs text-gray-400">
              Buka pengaturan browser, izinkan lokasi untuk situs ini, lalu muat ulang halaman.
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={requestLocation}
        disabled={status === "requesting"}
        className="mt-3 w-full rounded-lg bg-gray-800 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
      >
        {status === "requesting" ? "Meminta lokasi..." : "Ambil Lokasi"}
      </button>
    </div>
  );
}
