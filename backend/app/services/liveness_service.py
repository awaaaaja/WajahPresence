"""Liveness cross-check server-side (security-critical — AGENTS.md §4).

Klien (MediaPipe di browser) melakukan deteksi kedip + challenge pose sebagai
check utama. Server TIDAK percaya begitu saja pada hasil client: setiap
sample wajib melewati verifikasi ulang di sini — beberapa frame dari window
liveness diperiksa:

  1. Frame harus berbeda cukup antar waktu (foto statis / replay layar
     diam menghasilkan frame hampir identik).
  2. Wajah harus terdeteksi di frame tengah (bukan frame kosong/teks).
  3. Challenge pose acak dari server: tiap frame harus menunjukkan arah
     hadap yang sesuai urutan yang diklaim (LURUS/KIRI/KANAN). Video replay
     wajah generik tidak mengikuti urutan acak -> tertolak.

Keterbatasan jujur: video rekaman yang MENGIKUTI urutan challenge yang sama
dengan timing pas bisa lolos — butuh liveness aktif lebih lanjut (NFR-2.2
hardening) untuk produksi.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

from app.services.face_service import (
    FaceError,
    decode_image,
    get_face_analyzer,
    get_fast_detector,
)

logger = logging.getLogger(__name__)

ANALYZE_FRAME_SIZE = 96  # resize kecil untuk perbandingan cepat
MIDDLE_FRAME_INDEX = 1

# Threshold pose (yaw ternormalisasi). Kalibrasi akhir di perangkat fisik.
YAW_TURN = 0.10   # dianggap menoleh bila |yaw| >= ini
YAW_FRONT_MAX = 0.12  # dianggap lurus bila |yaw| <= ini
POSE_MATCH_RATIO = 0.6  # minimal proporsi frame yang pose-nya sesuai

VALID_POSES = {"front", "left", "right"}


class LivenessResult:
    def __init__(self, passed: bool, reasons: list[str]) -> None:
        self.passed = passed
        self.reasons = reasons


def _mean_frame_diff(a: np.ndarray, b: np.ndarray) -> float:
    """Mean absolute difference antara dua frame grayscale (skala 0-255)."""
    gray_a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    small_a = cv2.resize(gray_a, (ANALYZE_FRAME_SIZE, ANALYZE_FRAME_SIZE))
    small_b = cv2.resize(gray_b, (ANALYZE_FRAME_SIZE, ANALYZE_FRAME_SIZE))
    return float(np.mean(np.abs(small_a.astype(np.float32) - small_b.astype(np.float32))))


def _yaw_from_kps(kps: np.ndarray) -> float:
    """Yaw ternormalisasi dari 5 landmark (kps) insightface.

    Dua titik paling atas = mata, titik ketiga = hidung.
    Konvensi: yaw > 0 -> hidung bergeser ke kanan gambar (orang menoleh ke kiri-nya).
    """
    kps = np.asarray(kps, dtype=np.float64)
    by_y = kps[np.argsort(kps[:, 1])]
    eye_right, eye_left = by_y[0], by_y[1]
    nose = by_y[2]
    eye_distance = float(np.linalg.norm(eye_right - eye_left))
    if eye_distance < 1e-6:
        raise FaceError("Landmark mata tidak valid")
    mid_eyes_x = float((eye_right[0] + eye_left[0]) / 2)
    return (float(nose[0]) - mid_eyes_x) / eye_distance


def classify_pose(yaw: float) -> str:
    """Klasifikasikan yaw ternormalisasi menjadi pose LURUS/KIRI/KANAN.

    Konvensi (frame tidak dimirror):
      yaw > +YAW_TURN   -> hidung ke kanan gambar = orang menoleh ke KIRI-nya
      yaw < -YAW_TURN   -> hidung ke kiri gambar  = orang menoleh ke KANAN-nya
      |yaw| <= YAW_FRONT_MAX -> lurus
      antara -> ambigu (dihitung tidak sesuai).
    """
    if yaw >= YAW_TURN:
        return "left"
    if yaw <= -YAW_TURN:
        return "right"
    if abs(yaw) <= YAW_FRONT_MAX:
        return "front"
    return "ambiguous"


def analyze_frames(image_bytes_list: list[bytes]) -> list[tuple[np.ndarray, list]]:
    """Decode + deteksi wajah SEKALI per frame (optimasi: 1 deteksi, dipakai
    untuk presence check DAN estimasi pose — bukan 2 deteksi per frame).

    Hasilnya bisa dipakai ulang untuk mengambil embedding frame tengah
    (face.normed_embedding sudah dihitung oleh analyzer.get), sehingga alur
    absen tidak perlu deteksi ulang.
    """
    return analyze_images([decode_image(b) for b in image_bytes_list])


def frame_mean_diffs(imgs: list[np.ndarray]) -> list[float]:
    """Mean absolute diff antar frame berurutan (skala 0-255).

    Murah (~ms) — dipakai alur absen untuk menolak foto statis / layar diam
    TANPA deteksi wajah sama sekali.
    """
    return [_mean_frame_diff(imgs[i], imgs[i + 1]) for i in range(len(imgs) - 1)]


def analyze_images(imgs: list[np.ndarray]) -> list[tuple[np.ndarray, list]]:
    """Deteksi wajah per frame SECARA PARALEL, memakai detektor tercepat.

    - Semua frame memakai detektor ringan 320px (deteksi saja) — ~8x lebih
      cepat dari 640px (Sprint 5.2, NFR-1: 640px ~1.1 dtk vs 320px ~0.16 dtk).
    - Frame tengah: embedding dihitung dari crop ter-align (norm_crop 112px)
      via model recognition SAJA — konsisten dengan enrollment yang memakai
      jalur yang sama (cosine vs jalur 640px ~0.97, diuji).

    onnxruntime session aman dipanggil dari banyak thread — kunci NFR-1.
    """
    if len(imgs) <= 1:
        main = get_face_analyzer()
        return [(img, main.get(img)) for img in imgs]

    fast = get_fast_detector()
    rec = get_face_analyzer().models["recognition"]

    def detect(i: int, img: np.ndarray) -> tuple[np.ndarray, list]:
        faces = fast.get(img)
        if i == MIDDLE_FRAME_INDEX and faces:
            faces[0].embedding = rec.get(img, faces[0])
        return img, faces

    results: list = [None] * len(imgs)
    with ThreadPoolExecutor(max_workers=min(len(imgs), 3)) as pool:
        for i, res in enumerate(pool.map(lambda p: detect(p[0], p[1]), enumerate(imgs))):
            results[i] = res
    return results


def check_analyzed_frames(
    analyzed: list[tuple[np.ndarray, list]],
    min_mean_diff: float = 2.0,
    expected_poses: list[str] | None = None,
) -> LivenessResult:
    """Verifikasi liveness dari hasil analyze_frames (tanpa deteksi ulang)."""
    if len(analyzed) < 3:
        raise FaceError("Liveness check butuh minimal 3 frame")
    if expected_poses is not None:
        if len(expected_poses) != len(analyzed):
            raise FaceError(
                f"Jumlah pose ({len(expected_poses)}) tidak sama dengan jumlah frame "
                f"({len(analyzed)})"
            )
        invalid = set(expected_poses) - VALID_POSES
        if invalid:
            raise FaceError(f"Pose tidak dikenal: {sorted(invalid)}")

    reasons: list[str] = []

    frames = [img for img, _ in analyzed]
    diffs = [
        _mean_frame_diff(frames[i], frames[i + 1]) for i in range(len(frames) - 1)
    ]
    min_diff = min(diffs) if diffs else 0.0
    if min_diff < min_mean_diff:
        reasons.append(
            f"Frame terlalu identik (diff={min_diff:.2f} < {min_mean_diff}) — "
            "indikasi foto statis / layar diam"
        )

    middle_img, middle_faces = analyzed[MIDDLE_FRAME_INDEX] if len(analyzed) > MIDDLE_FRAME_INDEX else analyzed[0]
    if len(middle_faces) != 1:
        reasons.append("Wajah tidak terdeteksi di frame tengah")

    if expected_poses is not None:
        matched = 0
        pose_details: list[str] = []
        for i, ((_img, faces), expected) in enumerate(zip(analyzed, expected_poses)):
            if len(faces) != 1:
                reasons.append(f"Frame {i + 1}: wajah tidak terdeteksi")
                continue
            try:
                actual = classify_pose(_yaw_from_kps(faces[0].kps))
            except FaceError as exc:
                reasons.append(f"Frame {i + 1}: {exc}")
                continue
            ok = actual == expected
            if ok:
                matched += 1
            pose_details.append(f"f{i + 1}={actual}('{expected}'{'✓' if ok else '✗'})")
        needed = max(1, int(round(POSE_MATCH_RATIO * len(expected_poses))))
        if matched < needed:
            reasons.append(
                f"Urutan pose tidak sesuai challenge ({matched}/{len(expected_poses)} cocok, "
                f"butuh {needed}) — indikasi replay video: {', '.join(pose_details)}"
            )

    passed = len(reasons) == 0
    return LivenessResult(passed=passed, reasons=reasons)


def check_frames(
    image_bytes_list: list[bytes],
    min_mean_diff: float = 2.0,
    expected_poses: list[str] | None = None,
) -> LivenessResult:
    """Verifikasi liveness dari beberapa frame.

    Args:
        image_bytes_list: 3-5 frame dari window liveness.
        expected_poses: urutan pose acak dari server challenge (sama panjang
            dengan jumlah frame). None = mode lama (tanpa verifikasi pose).

    Raises:
        FaceError: salah satu frame tidak bisa di-decode / pose tidak valid.
    """
    analyzed = analyze_frames(image_bytes_list)
    return check_analyzed_frames(analyzed, min_mean_diff, expected_poses)
