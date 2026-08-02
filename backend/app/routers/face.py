"""Router testing ekstraksi embedding — Prompt 1.1.

Endpoint internal untuk verifikasi integrasi InsightFace.
"""

import base64
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.schemas.face import FaceEmbeddingRequest, FaceEmbeddingResponse
from app.services.face_service import EMBEDDING_DIM, FaceError, extract_embedding

router = APIRouter(prefix="/face", tags=["face"])


@router.post("/embedding", response_model=FaceEmbeddingResponse)
async def get_embedding(
    req: FaceEmbeddingRequest,
    _user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> FaceEmbeddingResponse:
    """Ekstrak embedding 512-dim dari satu gambar (untuk testing/dev)."""
    try:
        image_bytes = base64.b64decode(req.image_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="image_base64 tidak valid") from exc

    start = time.perf_counter()
    try:
        embedding = extract_embedding(image_bytes)
    except FaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    elapsed_ms = (time.perf_counter() - start) * 1000

    return FaceEmbeddingResponse(
        embedding=embedding.tolist(),
        dimension=EMBEDDING_DIM,
        inference_ms=round(elapsed_ms, 1),
    )
