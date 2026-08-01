"""Schema Pydantic untuk modul face / liveness / enrollment / consent."""

from typing import Literal

from pydantic import BaseModel, Field


class FaceEmbeddingRequest(BaseModel):
    image_base64: str = Field(description="Gambar ter-encode base64 (JPEG/PNG)")


class FaceEmbeddingResponse(BaseModel):
    embedding: list[float]
    dimension: int
    det_score: float | None = None
    inference_ms: float


class LivenessCheckRequest(BaseModel):
    frames: list[str] = Field(
        min_length=3, max_length=5, description="3-5 frame base64 dari window liveness"
    )
    poses: list[Literal["front", "left", "right"]] | None = Field(
        default=None,
        min_length=3,
        max_length=5,
        description="Urutan pose challenge acak dari server (wajib untuk flow baru)",
    )


class LivenessCheckResponse(BaseModel):
    passed: bool
    reasons: list[str]
    frame_count: int


class LivenessChallengeResponse(BaseModel):
    poses: list[Literal["front", "left", "right"]]
    phase_duration_ms: int
    version: str


class ConsentRequest(BaseModel):
    policy_version: str = Field(min_length=1, description="Versi kebijakan consent yang disetujui")


class ConsentResponse(BaseModel):
    accepted: bool
    accepted_at: str
    policy_version: str


class EnrollmentSample(BaseModel):
    angle: Literal["front", "left", "right", "up", "down"]
    image_base64: str


class EnrollmentRequest(BaseModel):
    nama: str = Field(min_length=1, description="Nama lengkap user")
    nim_nip: str | None = None
    samples: list[EnrollmentSample] = Field(min_length=5, max_length=5)
    policy_version: str = Field(min_length=1)


class EnrollmentResponse(BaseModel):
    status: Literal["pending"]
    message: str


class EnrollmentError(BaseModel):
    detail: str
