"""Router liveness cross-check — Prompt 1.3 (security-critical).

Alur baru (anti video replay):
  1. Client minta challenge -> server kirim urutan pose ACK acak
     (mis. [left, front, right]) — tidak bisa ditebak sebelumnya.
  2. Client menampilkan instruksi per fase dan wajib menuruti.
  3. Client kirim 1 frame per fase + urutan pose yang diklaim.
  4. Server verifikasi ulang: frame beda, ada wajah, DAN arah hadap tiap
     frame sesuai urutan challenge (estimasi pose dari landmark sendiri,
     tidak percaya klaim client).
"""

import base64
import random
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.security import get_current_user
from app.schemas.face import (
    LivenessChallengeResponse,
    LivenessCheckRequest,
    LivenessCheckResponse,
)
from app.services.face_service import FaceError
from app.services.liveness_service import check_frames

router = APIRouter(prefix="/liveness", tags=["liveness"])

POSE_POOL: list[Literal["front", "left", "right"]] = ["front", "left", "right"]
CHALLENGE_PHASES = 3
PHASE_DURATION_MS = 1500
CHALLENGE_VERSION = "pose-v1"


@router.get("/challenge", response_model=LivenessChallengeResponse)
async def liveness_challenge(
    _user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> LivenessChallengeResponse:
    """Buat challenge pose acak untuk window liveness berikutnya."""
    poses = random.sample(POSE_POOL, CHALLENGE_PHASES)
    return LivenessChallengeResponse(
        poses=poses, phase_duration_ms=PHASE_DURATION_MS, version=CHALLENGE_VERSION
    )


@router.post("/check", response_model=LivenessCheckResponse)
async def liveness_check(
    req: LivenessCheckRequest,
    _user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> LivenessCheckResponse:
    """Cross-check server-side: frame beda + ada wajah + urutan pose sesuai challenge."""
    try:
        frames = [base64.b64decode(f, validate=True) for f in req.frames]
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Salah satu frame bukan base64 valid") from exc

    try:
        result = check_frames(
            frames,
            min_mean_diff=settings.liveness_min_mean_diff,
            expected_poses=req.poses,
        )
    except FaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return LivenessCheckResponse(
        passed=result.passed, reasons=result.reasons, frame_count=len(frames)
    )
