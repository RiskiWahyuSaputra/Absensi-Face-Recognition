from typing import List, Optional
from pydantic import BaseModel, Field


class ImageRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded JPEG/PNG image (with or without data URI prefix)")
    secondary_image_base64: Optional[str] = Field(
        None,
        description="Optional second frame (e.g. 300-600ms later) for blink/motion liveness verification",
    )
    liveness_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)


class BoundingBox(BaseModel):
    x: int
    y: int
    w: int
    h: int
    confidence: float


class QualityCheckResponse(BaseModel):
    passed: bool
    face_count: int
    brightness: float
    sharpness: float
    face_size: int
    quality_score: float
    reasons: List[str]
    bbox: Optional[BoundingBox] = None


class LivenessResponse(BaseModel):
    is_live: bool
    score: float
    method: str
    blink_or_motion_detected: Optional[bool] = None
    reason: Optional[str] = None


class AnalyzeResponse(BaseModel):
    face_detected: bool
    face_count: int
    bbox: Optional[BoundingBox] = None
    liveness: LivenessResponse
    embedding: Optional[List[float]] = None
    quality: Optional[QualityCheckResponse] = None
    model_info: dict
