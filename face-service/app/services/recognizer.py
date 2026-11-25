import os
from typing import List, Optional
import cv2
import numpy as np
from app.config import settings


class FaceRecognizerService:
    """
    Ekstraksi vektor wajah 128-dimensi menggunakan OpenCV SFace (Apache 2.0 License).
    Fallback deterministik 128-dimensi (L2-normalized) hanya dipakai bila file ONNX
    belum diunduh di lingkungan pengembangan/testing tanpa internet.
    """

    def __init__(self) -> None:
        self.sface = None
        self.backend = "fallback_descriptor"
        if os.path.exists(settings.SFACE_MODEL) and hasattr(cv2, "FaceRecognizerSF"):
            self.sface = cv2.FaceRecognizerSF.create(
                model=settings.SFACE_MODEL,
                config="",
            )
            self.backend = "opencv_sface"

    def extract_embedding(
        self,
        image_bgr: np.ndarray,
        face_dict: dict,
    ) -> List[float]:
        if self.sface is not None and face_dict.get("raw") is not None:
            aligned = self.sface.alignCrop(image_bgr, face_dict["raw"])
            feature = self.sface.feature(aligned)
            vec = feature.flatten().astype(np.float32)
            norm = float(np.linalg.norm(vec))
            if norm > 0:
                vec = vec / norm
            return [round(float(v), 6) for v in vec]

        # Fallback 128-dim descriptor (dev/test without ONNX)
        x, y, w, h = face_dict["x"], face_dict["y"], face_dict["w"], face_dict["h"]
        crop = image_bgr[y : y + h, x : x + w]
        if crop.size == 0:
            crop = image_bgr
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        resized = cv2.resize(gray, (16, 8), interpolation=cv2.INTER_AREA)
        vec = resized.flatten().astype(np.float32)
        vec = vec - float(np.mean(vec))
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec = vec / norm
        return [round(float(v), 6) for v in vec]

    @staticmethod
    def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        a = np.asarray(vec_a, dtype=np.float32)
        b = np.asarray(vec_b, dtype=np.float32)
        denom = float(np.linalg.norm(a) * np.linalg.norm(b))
        if denom == 0.0:
            return 0.0
        return float(np.dot(a, b) / denom)
