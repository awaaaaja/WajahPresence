"use client";

import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";

import { backendFetch } from "@/utils/backend";

const MEDIAPIPE_VERSION = "1.0.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const EAR_CLOSED_THRESHOLD = 0.22;
const YAW_TURN = 0.10;
const YAW_FRONT_MAX = 0.12;
const MIN_BLINKS = 1;
const MIN_POSE_MATCHES = 2;

const EYE_LANDMARKS = {
  left: [33, 160, 158, 133, 153, 144],
  right: [362, 385, 387, 263, 373, 380],
};
const NOSE_TIP = 1;
const EYE_OUTER_RIGHT = 33;
const EYE_OUTER_LEFT = 263;

const POSE_LABEL: Record<string, string> = {
  front: "LURUS",
  left: "KIRI",
  right: "KANAN",
};
const POSE_GUIDE: Record<string, string> = {
  front: "Hadapkan wajah lurus ke kamera",
  left: "Putar wajah sedikit ke KIRI",
  right: "Putar wajah sedikit ke KANAN",
};

type Status =
  | "starting"
  | "active"
  | "liveness"
  | "verifying"
  | "success"
  | "error";

export interface AttendanceResult {
  success: boolean;
  nama?: string;
  timestamp?: string;
  confidence?: number;
  message: string;
  reasons?: string[];
  retryAfterMinutes?: number;
}

interface Props {
  authToken: string | null;
  onResult: (result: AttendanceResult) => void;
}

function earFromLandmarks(
  landmarks: { x: number; y: number }[],
  indices: number[],
): number {
  const [p0, p1, p2, p3, p4, p5] = indices.map((i) => landmarks[i]);
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  return (dist(p1, p5) + dist(p2, p4)) / (2 * dist(p0, p3));
}

function yawFromLandmarks(landmarks: { x: number; y: number }[]): number {
  const noseX = landmarks[NOSE_TIP]?.x ?? 0.5;
  const eyeRightX = landmarks[EYE_OUTER_RIGHT]?.x ?? 0.4;
  const eyeLeftX = landmarks[EYE_OUTER_LEFT]?.x ?? 0.6;
  const eyeDist = Math.abs(eyeLeftX - eyeRightX) || 1e-6;
  return (noseX - (eyeRightX + eyeLeftX) / 2) / eyeDist;
}

function classifyYaw(yaw: number): string {
  if (yaw >= YAW_TURN) return "left";
  if (yaw <= -YAW_TURN) return "right";
  if (Math.abs(yaw) <= YAW_FRONT_MAX) return "front";
  return "ambiguous";
}

export default function AttendanceCapture({ authToken, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  const [status, setStatus] = useState<Status>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [challenge, setChallenge] = useState<string[] | null>(null);
  const [blinkCount, setBlinkCount] = useState(0);
  const [poseMatchCount, setPoseMatchCount] = useState(0);
  const [locationStatus, setLocationStatus] = useState<string>("Mendapatkan lokasi...");
  const [modelReady, setModelReady] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        if (cancelled) return;
        let landmarker: FaceLandmarker;
        try {
          landmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO",
            numFaces: 1,
          });
        } catch {
          landmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numFaces: 1,
          });
        }
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setModelReady(true);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            "Gagal memuat model deteksi wajah. Periksa koneksi internet lalu muat ulang halaman.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!modelReady || status !== "starting") return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("active");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            err instanceof DOMException && err.name === "NotAllowedError"
              ? "Izin kamera ditolak. Izinkan akses kamera lalu coba lagi."
              : "Gagal mengakses kamera.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modelReady, status]);

  const frameToDataUrl = useCallback((quality = 0.72) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 480, 360);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  const start = useCallback(async () => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video) return;

    setStatus("liveness");
    setErrorMessage(null);

    // Lokasi real-time (FR-2.3): diambil saat proses verifikasi
    let lat: number | null = null;
    let lng: number | null = null;
    let accuracy: number | null = null;
    setLocationStatus("Mendapatkan lokasi...");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      accuracy = pos.coords.accuracy;
      setLocationStatus("Lokasi OK");
    } catch {
      setLocationStatus("Lokasi tidak didapat — absen ditolak bila area absen aktif");
    }

    // Challenge pose acak dari server
    let poses: string[];
    let phaseDurationMs = 1500;
    try {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}/liveness/challenge`, {
        headers: { Authorization: `Bearer ${authToken ?? ""}` },
      });
      if (!resp.ok) throw new Error("challenge failed");
      const data = await resp.json();
      poses = data.poses;
      phaseDurationMs = data.phase_duration_ms ?? 1500;
    } catch {
      setStatus("active");
      setErrorMessage("Gagal mengambil challenge liveness dari server. Coba lagi.");
      return;
    }
    setChallenge(poses);

    const totalMs = poses.length * phaseDurationMs;
    const frames: string[] = [];
    const start = performance.now();
    let lastVideoTime = -1;
    let wasOpen = true;
    let blinkStarted = false;
    let blinks = 0;
    let poseMatches = 0;
    let frameFaceLost = false;
    let lastYaw: number | null = null;

    await new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - start;
        setCountdown(Math.max(0, Math.ceil((totalMs - elapsed) / 1000)));
        const phase = Math.min(poses.length - 1, Math.floor(elapsed / phaseDurationMs));
        setPhaseIndex(phase);

        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          if (result.faceLandmarks.length > 0) {
            const lm = result.faceLandmarks[0];
            const ear =
              (earFromLandmarks(lm, EYE_LANDMARKS.left) +
                earFromLandmarks(lm, EYE_LANDMARKS.right)) /
              2;
            const eyeOpen = ear > EAR_CLOSED_THRESHOLD;
            if (!eyeOpen && wasOpen && !blinkStarted) blinkStarted = true;
            if (eyeOpen && blinkStarted) {
              blinks += 1;
              blinkStarted = false;
            }
            wasOpen = eyeOpen;
            setBlinkCount(blinks);
            lastYaw = yawFromLandmarks(lm);
          } else {
            frameFaceLost = true;
          }
        }

        const phaseStart = phase * phaseDurationMs;
        const inPhaseMs = elapsed - phaseStart;
        if (frames.length <= phase && inPhaseMs >= phaseDurationMs * 0.7) {
          const frame = frameToDataUrl();
          if (frame) {
            frames.push(frame);
            const actual = classifyYaw(lastYaw ?? 0);
            if (actual === poses[phase]) poseMatches += 1;
            setPoseMatchCount(poseMatches);
          }
        }

        if (elapsed < totalMs) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      tick();
    });

    if (blinks < MIN_BLINKS) {
      setStatus("active");
      setErrorMessage("Tidak terdeteksi kedipan mata. Coba lagi dan berkediplah normal.");
      return;
    }
    if (poseMatches < MIN_POSE_MATCHES) {
      setStatus("active");
      setErrorMessage("Gerakan kepala tidak sesuai instruksi. Ikuti arah KIRI/KANAN/LURUS lalu coba lagi.");
      return;
    }
    if (frameFaceLost || frames.length < poses.length) {
      setStatus("active");
      setErrorMessage("Wajah tidak terlihat sepanjang proses. Posisikan wajah di tengah lalu coba lagi.");
      return;
    }

    // Kirim ke backend: liveness cross-check + matching (fail-fast di server)
    setStatus("verifying");
    try {
      const result = await backendFetch<AttendanceResult>("/attendance/face-check", authToken, {
        method: "POST",
        body: JSON.stringify({
          frames: frames.map((f) => f.split(",")[1] ?? f),
          poses,
          lat,
          lng,
          gps_accuracy: accuracy,
        }),
      });
      setStatus("success");
      onResult({ ...result, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memproses absen";
      let reasons: string[] | undefined;
      let retryAfterMinutes: number | undefined;
      let cleanMsg = msg;
      try {
        const parsed = JSON.parse(msg);
        cleanMsg = parsed.message ?? msg;
        reasons = parsed.reasons;
        retryAfterMinutes = parsed.retry_after_minutes;
      } catch {
        // pesan detail biasa
      }
      setStatus("error");
      onResult({ success: false, message: cleanMsg, reasons, retryAfterMinutes });
    }
  }, [authToken, frameToDataUrl, onResult]);

  const reset = useCallback(() => {
    setStatus("active");
    setErrorMessage(null);
    setChallenge(null);
    setPoseMatchCount(0);
  }, []);

  const currentPose = challenge ? challenge[phaseIndex] : null;

  return (
    <div className="w-full">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {status === "active" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <svg viewBox="0 0 100 75" className="h-full w-full opacity-70">
              <ellipse cx="50" cy="40" rx="22" ry="28" fill="none" stroke="#3b82f6" strokeWidth="2" />
            </svg>
            <p className="absolute bottom-3 left-0 right-0 px-4 text-center text-sm font-medium text-white drop-shadow">
              Hadapkan wajah ke kamera
            </p>
          </div>
        )}

        {status === "liveness" && currentPose && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55">
            <p className="text-4xl font-bold text-white">{POSE_LABEL[currentPose]}</p>
            <p className="text-sm text-gray-200">{POSE_GUIDE[currentPose]}</p>
            <div className="mt-2 flex gap-1.5">
              {challenge!.map((p, i) => (
                <span
                  key={i}
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    i < phaseIndex
                      ? "bg-green-500 text-white"
                      : i === phaseIndex
                        ? "bg-blue-500 text-white"
                        : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {POSE_LABEL[p]}
                </span>
              ))}
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{countdown}</p>
            <p className="text-xs text-gray-300">
              Kedipan: {blinkCount}/{MIN_BLINKS} · Posisi: {poseMatchCount}/{MIN_POSE_MATCHES}
            </p>
            <p className="text-[11px] text-gray-400">{locationStatus}</p>
          </div>
        )}

        {status === "verifying" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-sm text-white">Memverifikasi wajah & lokasi...</p>
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-300">Memuat model wajah...</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {errorMessage && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
      )}

      <div className="mt-4">
        {status === "active" && (
          <button
            type="button"
            onClick={start}
            className="w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            Mulai Verifikasi Absen
          </button>
        )}
        {status === "success" && (
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Absen Lagi
          </button>
        )}
        {status === "error" && (
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
}
