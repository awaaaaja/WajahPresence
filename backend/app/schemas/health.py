"""Schema Pydantic untuk endpoint health."""

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str
    database: Literal["connected", "error"]
    detail: str | None = None
