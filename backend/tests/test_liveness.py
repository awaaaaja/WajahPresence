"""Unit test liveness server-side (Prompt 1.3).

Skenario:
  (a) frame berbeda (wajah bergerak)      -> passed
  (b) frame identik (foto statis)         -> rejected
  (b2) frame tengah tanpa wajah           -> rejected
  (c) urutan pose tidak sesuai challenge  -> rejected (anti replay video)
"""

from __future__ import annotations

import base64
import pathlib

import numpy as np

from app.services.liveness_service import (
    MIDDLE_FRAME_INDEX,
    _mean_frame_diff,
    _yaw_from_kps,
    analyze_frames,
    check_analyzed_frames,
    check_frames,
    classify_pose,
)

TEST_DIR = pathlib.Path(__file__).resolve().parent / "loadtest" / "faces"


def _read_b64(name: str) -> str:
    with open(TEST_DIR / name, "rb") as f:
        return base64.b64encode(f.read()).decode()


def test_mean_frame_diff_identical_is_zero() -> None:
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    assert _mean_frame_diff(img, img) == 0.0


def test_mean_frame_diff_different_is_positive() -> None:
    a = np.zeros((100, 100, 3), dtype=np.uint8)
    b = np.full((100, 100, 3), 255, dtype=np.uint8)
    assert _mean_frame_diff(a, b) > 100.0


def test_check_frames_identical_photo_rejected() -> None:
    """(b) Foto statis: frame identik -> ditolak."""
    img = _read_b64("obama.jpg")
    result = check_frames(
        [base64.b64decode(img) for _ in range(3)], min_mean_diff=2.0
    )
    assert result.passed is False
    assert any("identik" in r for r in result.reasons)


def test_check_frames_moving_frames_passed() -> None:
    """(a) Wajah bergerak: frame berbeda + wajah terdeteksi -> lolos."""
    obama = base64.b64decode(_read_b64("obama.jpg"))
    biden = base64.b64decode(_read_b64("biden.jpg"))
    result = check_frames([obama, biden, obama], min_mean_diff=2.0)
    assert result.passed is True
    assert result.reasons == []


def test_check_frames_middle_frame_without_face_rejected() -> None:
    """(b2) Frame tengah kosong -> ditolak."""
    obama = base64.b64decode(_read_b64("obama.jpg"))
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    import cv2

    ok, buf = cv2.imencode(".jpg", blank)
    assert ok
    blank_bytes = buf.tobytes()
    result = check_frames([obama, blank_bytes, obama], min_mean_diff=2.0)
    assert result.passed is False
    assert any("Wajah tidak terdeteksi" in r for r in result.reasons)


def test_pose_classify_front() -> None:
    assert classify_pose(0.0) == "front"
    assert classify_pose(0.05) == "front"


def test_pose_classify_turn() -> None:
    assert classify_pose(0.15) == "left"
    assert classify_pose(-0.15) == "right"


def test_yaw_front_photo_near_zero() -> None:
    """Foto wajah menghadap lurus -> yaw mendekati 0."""
    analyzed = analyze_frames([base64.b64decode(_read_b64("obama.jpg"))])
    faces = analyzed[0][1]
    assert len(faces) == 1
    assert abs(_yaw_from_kps(faces[0].kps)) < 0.08


def test_check_frames_pose_mismatch_rejected() -> None:
    """(c) Replay video: urutan pose klaim tidak sesuai frame -> ditolak."""
    obama = base64.b64decode(_read_b64("obama.jpg"))
    biden = base64.b64decode(_read_b64("biden.jpg"))
    # Klaim [left, front, right] tapi semua frame menghadap lurus -> harus ditolak
    result = check_frames(
        [obama, obama, biden], min_mean_diff=2.0,
        expected_poses=["left", "front", "right"],
    )
    assert result.passed is False
    assert any("pose tidak sesuai" in r.lower() for r in result.reasons)


def test_check_frames_pose_all_front_passes() -> None:
    """Challenge [front, front, front] dengan frame menghadap lurus -> lolos."""
    import cv2

    obama = base64.b64decode(_read_b64("obama.jpg"))
    biden = base64.b64decode(_read_b64("biden.jpg"))
    img = cv2.imdecode(np.frombuffer(biden, np.uint8), cv2.IMREAD_COLOR)
    ok, buf = cv2.imencode(".jpg", np.fliplr(img))
    assert ok
    flipped = buf.tobytes()  # mirror: yaw berbalik tanda, tetap diklasifikasi front
    result = check_frames(
        [obama, biden, flipped], min_mean_diff=2.0,
        expected_poses=["front", "front", "front"],
    )
    assert result.passed is True


def test_check_analyzed_frames_reuses_analysis() -> None:
    """check_analyzed_frames memakai hasil analyze_frames (tanpa deteksi ulang)."""
    obama = base64.b64decode(_read_b64("obama.jpg"))
    biden = base64.b64decode(_read_b64("biden.jpg"))
    analyzed = analyze_frames([obama, biden, obama])
    result = check_analyzed_frames(analyzed, min_mean_diff=2.0)
    assert result.passed is True
    # frame tengah punya wajah -> embedding bisa diambil dari hasil ini
    assert len(analyzed[MIDDLE_FRAME_INDEX][1]) == 1
