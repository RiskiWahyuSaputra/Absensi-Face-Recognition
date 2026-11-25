import os
from typing import List, Tuple
import cv2
import numpy as np
from app.config import settings


class FaceDetectorService:
    """
    Deteksi wajah menggunakan OpenCV YuNet (MIT License, berjalan di CPU).
    Jika file ONNX belum tersedia (misal saat unit test offline), fallback ke Haar Cascade bawaan OpenCV.
    """

    def __init__(self) -> None:
        self.yunet = None
        self.backend = "haar_fallback"
        if os.path.exists(settings.YUNET_MODEL) and hasattr(cv2, "FaceDetectorYN"):
            self.yunet = cv2.FaceDetectorYN.create(
                model=settings.YUNET_MODEL,
                config="",
                input_size=(320, 320),
                score_threshold=settings.DETECTION_SCORE_THRESHOLD,
                nms_threshold=0.3,
                top_k=10,
            )
            self.backend = "opencv_yunet"
        else:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self.haar = cv2.CascadeClassifier(cascade_path)

    def detect(self, image_bgr: np.ndarray) -> Tuple[List[dict], OptionalFaces]:
        h, w = image_bgr.shape[:2]
        if self.yunet is not None:
            self.yunet.setInputSize((w, h))
            _, raw_faces = self.yunet.detect(image_bgr)
            if raw_faces is None or len(raw_faces) == 0:
                return [], None
            results = []
            for row in raw_faces:
                x, y, fw, fh = int(row[0]), int(row[1]), int(row[2]), int(row[3])
                conf = float(row[14])
                results.append(
                    {
                        "x": max(0, x),
                        "y": max(0, y),
                        "w": max(1, fw),
                        "h": max(1, fh),
                        "confidence": round(conf, 4),
                        "raw": row,
                    }
                )
            # Urutkan dari wajah terbesar
            results.sort(key=lambda r: r["w"] * r["h"], reverse=True)
            return results, raw_faces

        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        rects = self.haar.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        results = []
        for (x, y, fw, fh) in rects:
            results.append(
                {
                    "x": int(x),
                    "y": int(y),
                    "w": int(fw),
                    "h": int(fh),
                    "confidence": 0.90,
                    "raw": None,
                }
            )
        results.sort(key=lambda r: r["w"] * r["h"], reverse=True)
        return results, None


OptionalFaces = object
