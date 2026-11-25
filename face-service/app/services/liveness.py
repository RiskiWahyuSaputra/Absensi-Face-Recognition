import os
from typing import Optional
import cv2
import numpy as np
from app.config import settings

try:
    import onnxruntime as ort
except Exception:
    ort = None


class LivenessService:
    """
    Anti-spoofing pasif (mencegah foto cetak, layar HP, dan video):
    1. Jika model ONNX Silent-Face-Anti-Spoofing (Apache 2.0) tersedia di MODEL_DIR,
       gunakan inferensi ONNX MiniFASNet.
    2. Jika tidak, gunakan analisis passive liveness multi-cue:
       - Deteksi pola Moire / layar digital (spektrum frekuensi tinggi FFT)
       - Deteksi pantulan glare layar HP (rasio piksel saturasi tinggi)
       - Kekayaan warna kulit pada ruang warna YCrCb & HSV
       - Ketajaman lokal (Laplacian)
    3. Cek tambahan kedip mata / gerakan mikro bila frame kedua (secondary_image) dikirim kiosk.
    """

    def __init__(self) -> None:
        self.ort_session = None
        self.method = "passive_multicue"
        if ort is not None and os.path.exists(settings.SILENT_FACE_MODEL):
            self.ort_session = ort.InferenceSession(
                settings.SILENT_FACE_MODEL,
                providers=["CPUExecutionProvider"],
            )
            self.method = "silent_face_onnx"

    def _run_silent_face_onnx(self, image_bgr: np.ndarray, bbox: dict) -> float:
        h, w = image_bgr.shape[:2]
        scale = 2.7
        cx = bbox["x"] + bbox["w"] / 2.0
        cy = bbox["y"] + bbox["h"] / 2.0
        box_size = max(bbox["w"], bbox["h"]) * scale
        x1 = int(max(0, cx - box_size / 2.0))
        y1 = int(max(0, cy - box_size / 2.0))
        x2 = int(min(w, cx + box_size / 2.0))
        y2 = int(min(h, cy + box_size / 2.0))

        crop = image_bgr[y1:y2, x1:x2]
        resized = cv2.resize(crop, (80, 80))
        blob = resized.astype(np.float32).transpose(2, 0, 1)[None, :, :, :]
        input_name = self.ort_session.get_inputs()[0].name
        logits = self.ort_session.run(None, {input_name: blob})[0][0]
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)
        # Index 1 adalah kelas "real face" pada MiniFASNetV2
        return float(probs[1]) if len(probs) > 1 else float(probs[0])

    def _run_passive_multicue(self, image_bgr: np.ndarray, bbox: dict) -> tuple[float, Optional[str]]:
        x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
        crop = image_bgr[y : y + h, x : x + w]
        if crop.size == 0:
            return 0.0, "Area wajah tidak valid"

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)

        # 1. Cek pantulan layar HP (overexposed glare)
        glare_ratio = float(np.mean(gray > 248))
        glare_score = max(0.0, 1.0 - glare_ratio * 8.0)

        # 2. Cek keragaman warna kulit di ruang YCrCb (foto cetak/layar sering flat/bergeser)
        ycrcb = cv2.cvtColor(crop, cv2.COLOR_BGR2YCrCb)
        cr_std = float(np.std(ycrcb[:, :, 1]))
        cb_std = float(np.std(ycrcb[:, :, 2]))
        color_score = min(1.0, (cr_std + cb_std) / 18.0)

        # 3. Cek pola frekuensi tinggi (Moire layar monitor/HP)
        resized = cv2.resize(gray, (128, 128)).astype(np.float32)
        f = np.fft.fft2(resized)
        fshift = np.fft.fftshift(f)
        mag = np.log1p(np.abs(fshift))
        center_mask = np.zeros_like(mag, dtype=bool)
        center_mask[48:80, 48:80] = True
        high_freq_energy = float(np.mean(mag[~center_mask]))
        low_freq_energy = float(np.mean(mag[center_mask])) + 1e-6
        freq_ratio = high_freq_energy / low_freq_energy
        # Rasio wajar wajah asli berada di kisaran 0.35 - 0.80
        moire_score = 1.0 if 0.30 <= freq_ratio <= 0.85 else max(0.2, 1.0 - abs(freq_ratio - 0.58))

        # 4. Tekstur lokal (Laplacian)
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        texture_score = min(1.0, lap_var / 80.0) if lap_var > 15.0 else 0.15

        score = (0.30 * glare_score) + (0.30 * color_score) + (0.20 * moire_score) + (0.20 * texture_score)
        reason = None
        if glare_ratio > 0.12:
            reason = "Terdeteksi pantulan cahaya layar HP/foto"
        elif lap_var <= 15.0:
            reason = "Gambar terlalu datar/buram (indikasi spoofing)"
        return round(float(np.clip(score, 0.0, 1.0)), 4), reason

    def _check_blink_or_motion(
        self,
        frame1_bgr: np.ndarray,
        frame2_bgr: np.ndarray,
        bbox: dict,
    ) -> bool:
        x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
        # Fokus area mata & wajah bagian atas untuk cek kedip/gerakan alami
        eye_h = max(10, int(h * 0.55))
        c1 = frame1_bgr[y : y + eye_h, x : x + w]
        c2 = frame2_bgr[y : y + eye_h, x : x + w]
        if c1.size == 0 or c2.size == 0 or c1.shape != c2.shape:
            return False
        g1 = cv2.cvtColor(c1, cv2.COLOR_BGR2GRAY).astype(np.float32)
        g2 = cv2.cvtColor(c2, cv2.COLOR_BGR2GRAY).astype(np.float32)
        mean_diff = float(np.mean(np.abs(g1 - g2)))
        # Foto statis memiliki diff mendekati 0 (< 1.2); kedip/gerakan mikro alami > 1.5
        return 1.5 <= mean_diff <= 45.0

    def check(
        self,
        image_bgr: np.ndarray,
        bbox: dict,
        secondary_bgr: Optional[np.ndarray] = None,
        threshold: Optional[float] = None,
    ) -> dict:
        thresh = threshold if threshold is not None else settings.LIVENESS_THRESHOLD
        reason = None

        if self.ort_session is not None:
            score = self._run_silent_face_onnx(image_bgr, bbox)
        else:
            score, reason = self._run_passive_multicue(image_bgr, bbox)

        blink_detected: Optional[bool] = None
        if secondary_bgr is not None:
            blink_detected = self._check_blink_or_motion(image_bgr, secondary_bgr, bbox)
            if blink_detected:
                score = min(1.0, score + 0.08)
            else:
                score = max(0.0, score - 0.12)
                if reason is None:
                    reason = "Tidak terdeteksi gerakan alami/kedipan mata (indikasi foto statis)"

        is_live = score >= thresh
        if not is_live and reason is None:
            reason = "Gagal verifikasi keaslian wajah (foto atau layar HP terdeteksi)"

        return {
            "is_live": bool(is_live),
            "score": round(float(score), 4),
            "method": self.method,
            "blink_or_motion_detected": blink_detected,
            "reason": None if is_live else reason,
        }
