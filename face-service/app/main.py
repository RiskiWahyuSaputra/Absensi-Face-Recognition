import base64
from typing import Optional
import cv2
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from app.config import settings
from app.schemas import (
    AnalyzeResponse,
    BoundingBox,
    ImageRequest,
    LivenessResponse,
    QualityCheckResponse,
)
from app.services.detector import FaceDetectorService
from app.services.liveness import LivenessService
from app.services.quality import evaluate_face_quality
from app.services.recognizer import FaceRecognizerService

app = FastAPI(
    title="Absensi Face Recognition Service",
    description="OpenCV YuNet (MIT) + SFace (Apache 2.0) + Passive Liveness Anti-Spoofing",
    version="1.0.0",
)

detector = FaceDetectorService()
recognizer = FaceRecognizerService()
liveness_service = LivenessService()


def verify_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid face service API key")


def decode_base64_image(data: str) -> np.ndarray:
    try:
        if "," in data:
            data = data.split(",", 1)[1]
        raw_bytes = base64.b64decode(data)
        np_arr = np.frombuffer(raw_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Decoded image is empty")
        return img
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Gambar tidak valid: {exc}") from exc


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "detector": detector.backend,
        "recognizer": recognizer.backend,
        "liveness": liveness_service.method,
    }


@app.post("/api/v1/quality-check", response_model=QualityCheckResponse, dependencies=[Depends(verify_api_key)])
def quality_check(req: ImageRequest) -> QualityCheckResponse:
    img = decode_base64_image(req.image_base64)
    faces, _ = detector.detect(img)
    result = evaluate_face_quality(img, faces)
    return QualityCheckResponse(**result)


@app.post("/api/v1/analyze", response_model=AnalyzeResponse, dependencies=[Depends(verify_api_key)])
def analyze_face(req: ImageRequest) -> AnalyzeResponse:
    """
    Pipeline lengkap untuk Kiosk & Registrasi:
    1. Deteksi wajah (YuNet)
    2. Cek kualitas
    3. Cek liveness / anti-spoofing (Silent-Face + blink/motion opsional)
    4. Ekstraksi vektor 128-dimensi (SFace) jika lolos
    """
    img = decode_base64_image(req.image_base64)
    secondary_img = decode_base64_image(req.secondary_image_base64) if req.secondary_image_base64 else None

    faces, _ = detector.detect(img)
    quality = evaluate_face_quality(img, faces)

    if len(faces) == 0:
        return AnalyzeResponse(
            face_detected=False,
            face_count=0,
            bbox=None,
            liveness=LivenessResponse(
                is_live=False,
                score=0.0,
                method=liveness_service.method,
                reason="Wajah tidak terdeteksi",
            ),
            embedding=None,
            quality=QualityCheckResponse(**quality),
            model_info={
                "detector": detector.backend,
                "recognizer": recognizer.backend,
                "liveness": liveness_service.method,
            },
        )

    primary = faces[0]
    bbox = BoundingBox(
        x=primary["x"],
        y=primary["y"],
        w=primary["w"],
        h=primary["h"],
        confidence=primary["confidence"],
    )

    liveness_res = liveness_service.check(
        img,
        primary,
        secondary_bgr=secondary_img,
        threshold=req.liveness_threshold,
    )

    embedding = recognizer.extract_embedding(img, primary)

    return AnalyzeResponse(
        face_detected=True,
        face_count=len(faces),
        bbox=bbox,
        liveness=LivenessResponse(**liveness_res),
        embedding=embedding,
        quality=QualityCheckResponse(**quality),
        model_info={
            "detector": detector.backend,
            "recognizer": recognizer.backend,
            "liveness": liveness_service.method,
        },
    )
