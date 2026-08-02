"""Face embedding service — InsightFace buffalo_l.

Model di-load SEKALI saat startup (lazy singleton), bukan per request, karena
inisialisasi berat (~2-3 dtk). Inference CPU ~200-800 ms/gambar.
"""

from __future__ import annotations

import logging
import threading
import time
from functools import lru_cache
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 512

MODEL_NAME = "buffalo_l"
DET_SIZE = (640, 640)

FAST_DET_SIZE = (320, 320)

# det_size single-analyzer di-switch antar thread (liveness memakai pool).
_det_lock = threading.Lock()

DEFAULT_MATCH_THRESHOLD = 0.6  # cosine similarity (FR-2.2, dikonfigurasi admin)


class FaceError(Exception):
    """Error terkait pemrosesan wajah (tidak ada wajah, multi wajah, dsb)."""


@lru_cache(maxsize=1)
def get_face_analyzer() -> Any:
    """Lazy singleton FaceAnalysis — load sekali per proses server.

    SATU session ONNX untuk SEMUA jalur (640px & 320px) — tidak ada session
    deteksi kedua, hemat memori signifikan (Sprint 5.6: instance Railway OOM
    saat memuat fast detector terpisah).
    """
    from insightface.app import FaceAnalysis

    logger.info("Loading InsightFace model '%s' (CPU)...", MODEL_NAME)
    start = time.perf_counter()
    analyzer = FaceAnalysis(
        name=MODEL_NAME,
        providers=["CPUExecutionProvider"],
        allowed_modules=["detection", "recognition"],
    )
    analyzer.prepare(ctx_id=-1, det_size=DET_SIZE)
    elapsed = time.perf_counter() - start
    logger.info("InsightFace model siap dalam %.2f dtk", elapsed)
    return analyzer


def detect_faces_fast(img: np.ndarray) -> list[Any]:
    """Deteksi wajah cepat (320px) memakai analyzer tunggal.

    Setara dengan fast detector lama (deteksi SAJA di 320px, ~8x lebih cepat
    dari 640px) tapi tanpa session ONNX kedua: hanya meng-switch input_size
    det_model sementara. Lock serial antar thread (liveness memakai pool);
    embedding/recognition tetap dihitung manual oleh pemanggil.
    """
    analyzer = get_face_analyzer()
    det = analyzer.det_model
    prev = tuple(det.input_size) if det.input_size is not None else None
    with _det_lock:
        det.input_size = FAST_DET_SIZE
        try:
            return analyzer.get(img)
        finally:
            det.input_size = prev


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode bytes -> BGR image (OpenCV)."""
    if not image_bytes:
        raise FaceError("Gambar kosong")
    data = np.frombuffer(image_bytes, dtype=np.uint8)
    try:
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    except cv2.error as exc:
        raise FaceError("Gambar tidak valid (format tidak didukung atau korup)") from exc
    if img is None:
        raise FaceError("Gambar tidak valid (format tidak didukung atau korup)")
    return img


def extract_embedding(image_bytes: bytes) -> np.ndarray:
    """Deteksi wajah + ekstrak normed embedding 512-dim.

    Memakai fast detector (320px, ~8x lebih cepat dari 640px) + model
    recognition saja untuk crop wajah ter-align (Sprint 5.2 — NFR-1).
    Konsistensi embedding antar jalur dipertahankan: liveness/face-check
    memakai jalur yang sama. Cosine vs jalur 640px ~0.97 (diuji).

    Raises:
        FaceError: gambar invalid, wajah tidak ditemukan, atau lebih dari satu wajah.
    """
    img = decode_image(image_bytes)
    analyzer = get_face_analyzer()

    start = time.perf_counter()
    faces = detect_faces_fast(img)
    elapsed_ms = (time.perf_counter() - start) * 1000

    if len(faces) == 0:
        raise FaceError("Wajah tidak terdeteksi di gambar — arahkan wajah ke kamera dengan cahaya cukup")
    if len(faces) > 1:
        raise FaceError("Lebih dari satu wajah terdeteksi — hanya satu orang yang boleh terlihat")

    face = faces[0]
    if face.det_score < 0.5:
        raise FaceError("Kualitas deteksi wajah terlalu rendah, coba ambil ulang dengan cahaya lebih baik")

    embedding = analyzer.models["recognition"].get(img, face).astype(np.float32)
    logger.debug("Inference embedding: %.1f ms, det_score=%.3f", elapsed_ms, face.det_score)
    return embedding


def estimate_head_pose(image_bytes: bytes) -> dict[str, float]:
    """Estimasi arah hadap kepala dari 5 landmark InsightFace.

    Mengembalikan yaw ternormalisasi: seberapa jauh titik hidung bergeser
    dari titik tengah antar-mata, dinormalisasi jarak antar-mata.

    Konvensi (frame kamera TIDAK dimirror — apa adanya dari getUserMedia):
      yaw > 0  -> hidung bergeser ke KANAN gambar (orang menoleh ke KIRI-nya)
      yaw < 0  -> hidung bergeser ke KIRI gambar  (orang menoleh ke KANAN-nya)
      yaw ~ 0  -> menghadap lurus ke kamera

    Raises:
        FaceError: gambar invalid / wajah tidak terdeteksi.
    """
    img = decode_image(image_bytes)
    analyzer = get_face_analyzer()
    faces = analyzer.get(img)
    if len(faces) == 0:
        raise FaceError("Wajah tidak terdeteksi — tidak bisa estimasi pose")

    # Urutan kps insightface: [mata_kanan, mata_kiri, hidung, mulut_kanan, mulut_kiri].
    # Urutan bisa beda antar model, jadi urutkan: dua titik paling atas = mata.
    kps = np.asarray(faces[0].kps, dtype=np.float64)
    by_y = kps[np.argsort(kps[:, 1])]
    eye_right, eye_left = by_y[0], by_y[1]
    nose = by_y[2]

    eye_distance = float(np.linalg.norm(eye_right - eye_left))
    if eye_distance < 1e-6:
        raise FaceError("Landmark mata tidak valid")

    mid_eyes_x = float((eye_right[0] + eye_left[0]) / 2)
    yaw = (float(nose[0]) - mid_eyes_x) / eye_distance

    return {"yaw": yaw, "det_score": float(faces[0].det_score)}


def embedding_of_face(face: Any) -> np.ndarray:
    """Ambil embedding dari hasil deteksi yang SUDAH dihitung.

    Memakai hasil analyzer.get() yang sudah ada (mis. dari liveness check)
    agar frame tidak dideteksi dua kali — penting untuk NFR-1 (< 3 detik).
    """
    if face.det_score < 0.5:
        raise FaceError("Kualitas deteksi wajah terlalu rendah, coba ambil ulang dengan cahaya lebih baik")
    return face.normed_embedding.astype(np.float32)


def cosine_similarity(emb_a: np.ndarray, emb_b: np.ndarray) -> float:
    """Cosine similarity antara dua embedding (1.0 = identik)."""
    a = emb_a.astype(np.float64) / (np.linalg.norm(emb_a) + 1e-12)
    b = emb_b.astype(np.float64) / (np.linalg.norm(emb_b) + 1e-12)
    return float(np.dot(a, b))


def embedding_to_string(embedding: np.ndarray) -> str:
    """Representasi string untuk INSERT ::vector di Postgres."""
    return "[" + ",".join(f"{v:.6f}" for v in embedding.tolist()) + "]"
