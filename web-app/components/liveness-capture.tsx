"use client";

import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";

import Button from "@/components/ui/button";

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
const EYE_OUTER_RIGHT = 33; // mata kanan (sisi kiri gambar)
const EYE_OUTER_LEFT = 263; // mata kiri (sisi kanan gambar)

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

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export interface CapturedSample {
  angle: string;
  imageBase64: string;
  framesBase64: string[];
  poses: string[];
}

type Status =
  | "starting"
  | "active"
  | "liveness"
  | "verifying"
  | "captured"
  | "error";

interface Props {
  angle: string;
  angleLabel: string;
  guideText: string;
  authToken: string | null;
  onCaptured: (sample: CapturedSample) => void;
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

function yawFromLandmarks(
  landmarks: { x: number; y: number }[],
): number {
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

export default function LivenessCapture({
  angle,
  angleLabel,
  guideText,
  authToken,
  onCaptured,
}: Props) {
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
  const [preview, setPreview] = useState<string | null>(null);
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

  const runLiveness = useCallback(async () => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video) return;

    // Challenge pose acak DARI SERVER (tidak bisa ditebak client)
    let poses: string[];
    let phaseDurationMs = 1500;
    try {
      const resp = await fetch(`${BACKEND_URL}/liveness/challenge`, {
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

    setStatus("liveness");
    setBlinkCount(0);
    setPhaseIndex(0);
    setErrorMessage(null);

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
        const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
        setCountdown(remaining);
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

        // Simpan 1 frame per fase (maks 3) + nilai pose pada akhir fase
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

    if (frames.length < poses.length) {
      setStatus("active");
      setErrorMessage("Frame liveness tidak lengkap. Coba lagi.");
      return;
    }
    if (blinks < MIN_BLINKS) {
      setStatus("active");
      setErrorMessage(
        "Tidak terdeteksi kedipan mata. Ulangi dan berkediplah saat proses berjalan.",
      );
      return;
    }
    if (poseMatches < MIN_POSE_MATCHES) {
      setStatus("active");
      setErrorMessage(
        "Gerakan kepala tidak sesuai instruksi. Ikuti petunjuk arah (KIRI/KANAN/LURUS) lalu coba lagi.",
      );
      return;
    }
    if (frameFaceLost) {
      setStatus("active");
      setErrorMessage(
        "Wajah tidak terlihat selama proses. Posisikan wajah di tengah lalu coba lagi.",
      );
      return;
    }

    setStatus("verifying");
    try {
      const resp = await fetch(`${BACKEND_URL}/liveness/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken ?? ""}`,
        },
        body: JSON.stringify({
          frames: frames.map((f) => f.split(",")[1] ?? f),
          poses,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.passed) {
        setStatus("active");
        setErrorMessage(
          "Pemeriksaan liveness gagal: " +
            (data.reasons?.join(", ") ?? data.detail?.message ?? "coba lagi"),
        );
        return;
      }

      const photo = frames[1] ?? frameToDataUrl();
      if (!photo) {
        setStatus("error");
        setErrorMessage("Gagal mengambil foto sample.");
        return;
      }
      setPreview(photo);
      setStatus("captured");
      onCaptured({
        angle,
        imageBase64: photo.split(",")[1] ?? photo,
        framesBase64: frames.map((f) => f.split(",")[1] ?? f),
        poses,
      });
    } catch {
      setStatus("active");
      setErrorMessage("Server liveness tidak dapat dijangkau. Coba lagi.");
    }
  }, [authToken, angle, frameToDataUrl, onCaptured]);

  const retake = useCallback(() => {
    setStatus("active");
    setErrorMessage(null);
    setPreview(null);
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
        {/* Overlay panduan sudut (tahap siap) */}
        {status === "active" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <svg viewBox="0 0 100 75" className="h-full w-full opacity-70" aria-hidden="true">
              {angle === "front" && (
                <ellipse cx="50" cy="40" rx="22" ry="28" fill="none" stroke="#93c5fd" strokeWidth="2" />
              )}
              {angle === "left" && (
                <ellipse cx="38" cy="40" rx="22" ry="28" fill="none" stroke="#93c5fd" strokeWidth="2" />
              )}
              {angle === "right" && (
                <ellipse cx="62" cy="40" rx="22" ry="28" fill="none" stroke="#93c5fd" strokeWidth="2" />
              )}
              {angle === "up" && (
                <ellipse cx="50" cy="32" rx="22" ry="28" fill="none" stroke="#93c5fd" strokeWidth="2" />
              )}
              {angle === "down" && (
                <ellipse cx="50" cy="48" rx="22" ry="28" fill="none" stroke="#93c5fd" strokeWidth="2" />
              )}
            </svg>
            <p className="absolute bottom-3 left-0 right-0 px-4 text-center text-sm font-medium text-white drop-shadow">
              {guideText}
            </p>
          </div>
        )}

        {/* Status liveness challenge */}
        {status === "liveness" && currentPose && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55">
            <p className="text-4xl font-bold text-white">{POSE_LABEL[currentPose]}</p>
            <p className="text-sm text-gray-200">{POSE_GUIDE[currentPose]}</p>
            <div className="mt-2 flex gap-1.5">
              {challenge!.map((p, i) => (
                <span
                  key={i}
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    i < phaseIndex
                      ? "bg-success text-white"
                      : i === phaseIndex
                        ? "bg-primary text-white"
                        : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {POSE_LABEL[p]}
                </span>
              ))}
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{countdown}</p>
            <p className="text-xs text-gray-300">
              Kedipan: {blinkCount} / {MIN_BLINKS} · Posisi sesuai: {poseMatchCount} / {MIN_POSE_MATCHES}
            </p>
          </div>
        )}
        {status === "verifying" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-sm text-white">Memeriksa liveness...</p>
          </div>
        )}
        {status === "captured" && preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Sample ${angleLabel}`} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-300">Memuat model wajah...</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {errorMessage && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        {status === "active" && (
          <Button type="button" fullWidth onClick={runLiveness}>
            <Camera className="h-4 w-4" aria-hidden="true" />
            Ambil Sample ({angleLabel})
          </Button>
        )}
        {status === "captured" && (
          <Button type="button" variant="outline" fullWidth onClick={retake}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Ulangi
          </Button>
        )}
      </div>
    </div>
  );
}
