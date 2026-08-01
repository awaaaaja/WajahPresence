"""Unit test face service — Prompt 1.1 (konsistensi embedding) + Review
Sprint 2 (validasi threshold matching 0.6).

Threshold tidak boleh menolak variasi wajar wajah yang sama (cahaya, rotasi,
mirror, blur) tetapi harus menolak wajah orang lain. Data kembar/wajah mirip
tidak tersedia di lingkungan test — dokumentasikan sebagai keterbatasan,
validasi terdekat: variasi foto + lintas orang.
"""

from __future__ import annotations

import pathlib

import cv2

from app.core.config import settings
from app.services.face_service import (
    DEFAULT_MATCH_THRESHOLD,
    EMBEDDING_DIM,
    FaceError,
    cosine_similarity,
    extract_embedding,
)

TEST_DIR = pathlib.Path("/tmp/opencode/faces")


def _read(path: str) -> bytes:
    with open(TEST_DIR / path, "rb") as f:
        return f.read()


def _embed_variant(img, quality: int = 90):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return extract_embedding(buf.tobytes())


def test_embedding_dimension() -> None:
    with open(TEST_DIR / "obama.jpg", "rb") as f:
        emb = extract_embedding(f.read())
    assert emb.shape == (EMBEDDING_DIM,)


def test_embedding_consistency_same_photo() -> None:
    with open(TEST_DIR / "obama.jpg", "rb") as f:
        data = f.read()
    emb1 = extract_embedding(data)
    emb2 = extract_embedding(data)
    assert cosine_similarity(emb1, emb2) > 0.99


def test_embedding_different_face_low_similarity() -> None:
    with open(TEST_DIR / "obama.jpg", "rb") as f:
        obama = extract_embedding(f.read())
    with open(TEST_DIR / "biden.jpg", "rb") as f:
        biden = extract_embedding(f.read())
    assert cosine_similarity(obama, biden) < 0.3


def test_embedding_empty_image_raises() -> None:
    try:
        extract_embedding(b"")
    except FaceError:
        pass
    else:
        raise AssertionError("seharusnya FaceError untuk gambar kosong")


def test_match_threshold_default_config() -> None:
    """Threshold matching terkonfigurasi (0.6) dan terhubung ke settings."""
    assert DEFAULT_MATCH_THRESHOLD == 0.6
    assert settings.match_threshold == DEFAULT_MATCH_THRESHOLD


def test_match_threshold_same_person_variations_accepted() -> None:
    """Review Sprint 2: wajah yang sama dengan variasi wajar (cahaya, rotasi,
    mirror, blur, kontras) harus tetap di ATAS threshold 0.6."""
    img = cv2.imread(str(TEST_DIR / "obama.jpg"))
    h, w = img.shape[:2]
    base = extract_embedding(_read("obama.jpg"))

    variants = {
        "bright+20": cv2.convertScaleAbs(img, alpha=1.2, beta=10),
        "bright-30": cv2.convertScaleAbs(img, alpha=0.7, beta=-15),
        "flip": cv2.flip(img, 1),
        "blur5": cv2.GaussianBlur(img, (5, 5), 0),
        "contrast": cv2.convertScaleAbs(img, alpha=1.4, beta=0),
    }
    m = cv2.getRotationMatrix2D((w // 2, h // 2), -4, 1.0)
    variants["rot-4"] = cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE)

    for name, variant in variants.items():
        sim = cosine_similarity(base, _embed_variant(variant))
        assert sim > settings.match_threshold, (
            f"variasi '{name}' turun di bawah threshold: sim={sim:.3f}"
        )


def test_match_threshold_different_person_rejected() -> None:
    """Review Sprint 2: wajah orang lain harus di BAWAH threshold 0.6."""
    obama = extract_embedding(_read("obama.jpg"))
    biden = extract_embedding(_read("biden.jpg"))
    sim = cosine_similarity(obama, biden)
    assert sim < settings.match_threshold, f"lintas orang terlalu mirip: sim={sim:.3f}"
