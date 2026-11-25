from typing import List
import cv2
import numpy as np
from app.config import settings


def evaluate_face_quality(image_bgr: np.ndarray, faces: List[dict]) -> dict:
    """
    Cek kualitas foto registrasi wajah sesuai PRD:
    - Tepat satu wajah terdeteksi
    - Ukuran wajah memadai
    - Pencahayaan cukup terang (tidak terlalu gelap / silau)
    - Tidak buram (Laplacian variance)
    """
    reasons: List[str] = []
    face_count = len(faces)

    if face_count == 0:
        return {
            "passed": False,
            "face_count": 0,
            "brightness": 0.0,
            "sharpness": 0.0,
            "face_size": 0,
            "quality_score": 0.0,
            "reasons": ["Wajah tidak terdeteksi. Pastikan wajah menghadap kamera."],
            "bbox": None,
        }

    if face_count > 1:
        reasons.append(f"Terdeteksi {face_count} wajah. Pastikan hanya 1 orang di depan kamera.")

    primary = faces[0]
    x, y, w, h = primary["x"], primary["y"], primary["w"], primary["h"]
    face_size = min(w, h)
    crop = image_bgr[y : y + h, x : x + w]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.size > 0 else cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    brightness = float(np.mean(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    if face_size < settings.MIN_FACE_SIZE_PX:
        reasons.append("Wajah terlalu jauh dari kamera. Mohon mendekat.")
    if brightness < settings.MIN_BRIGHTNESS:
        reasons.append("Pencahayaan terlalu gelap. Tambah cahaya di depan wajah.")
    elif brightness > settings.MAX_BRIGHTNESS:
        reasons.append("Pencahayaan terlalu silau/terang.")
    if sharpness < settings.MIN_SHARPNESS:
        reasons.append("Foto terlalu buram. Mohon diam sejenak saat pengambilan gambar.")

    # Hitung skor kualitas gabungan 0..1
    b_norm = 1.0 - min(1.0, abs(brightness - 135.0) / 135.0)
    s_norm = min(1.0, sharpness / 150.0)
    sz_norm = min(1.0, face_size / 180.0)
    quality_score = round((0.35 * b_norm + 0.35 * s_norm + 0.30 * sz_norm) if face_count == 1 else 0.2, 4)

    return {
        "passed": len(reasons) == 0,
        "face_count": face_count,
        "brightness": round(brightness, 2),
        "sharpness": round(sharpness, 2),
        "face_size": face_size,
        "quality_score": quality_score,
        "reasons": reasons,
        "bbox": {
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "confidence": primary["confidence"],
        },
    }
