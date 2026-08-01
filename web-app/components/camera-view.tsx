"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unsupported"
  | "error";

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("requesting");
    setErrorMessage(null);

    // Deteksi dukungan browser sebelum meminta permission
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setErrorMessage(
        "Browser ini tidak mendukung akses kamera (getUserMedia). Gunakan Chrome/Safari terbaru.",
      );
      return;
    }

    try {
      // Hanya minta kamera menghadap user (selfie) untuk absensi wajah
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("active");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setStatus("denied");
        setErrorMessage(
          "Izin kamera ditolak. Buka pengaturan browser dan izinkan akses kamera, lalu coba lagi.",
        );
      } else if (name === "NotFoundError") {
        setStatus("error");
        setErrorMessage("Tidak ditemukan kamera di perangkat ini.");
      } else if (name === "NotReadableError") {
        setStatus("error");
        setErrorMessage("Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.");
      } else {
        setStatus("error");
        setErrorMessage(`Gagal mengakses kamera: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  return (
    <div className="w-full">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gray-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {status !== "active" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {status === "idle" || status === "requesting" ? (
              <p className="text-sm text-gray-300">
                {status === "requesting" ? "Meminta izin kamera..." : "Kamera belum aktif"}
              </p>
            ) : (
              <p className="text-sm text-gray-300">{errorMessage}</p>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={startCamera}
        disabled={status === "requesting"}
        className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status === "requesting" ? "Memproses..." : "Aktifkan Kamera"}
      </button>
    </div>
  );
}
