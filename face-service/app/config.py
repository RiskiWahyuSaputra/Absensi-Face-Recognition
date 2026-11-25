import os


class Settings:
    API_KEY: str = os.getenv("FACE_SERVICE_API_KEY", "internal_face_service_shared_secret")
    MODEL_DIR: str = os.getenv("MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "models"))
    YUNET_MODEL: str = os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx")
    SFACE_MODEL: str = os.path.join(MODEL_DIR, "face_recognition_sface_2021dec.onnx")
    SILENT_FACE_MODEL: str = os.path.join(MODEL_DIR, "silent_face_antispoof.onnx")
    LIVENESS_THRESHOLD: float = float(os.getenv("LIVENESS_THRESHOLD", "0.50"))
    DETECTION_SCORE_THRESHOLD: float = float(os.getenv("DETECTION_SCORE_THRESHOLD", "0.75"))
    MIN_FACE_SIZE_PX: int = int(os.getenv("MIN_FACE_SIZE_PX", "80"))
    MIN_BRIGHTNESS: float = float(os.getenv("MIN_BRIGHTNESS", "45.0"))
    MAX_BRIGHTNESS: float = float(os.getenv("MAX_BRIGHTNESS", "225.0"))
    MIN_SHARPNESS: float = float(os.getenv("MIN_SHARPNESS", "35.0"))


settings = Settings()
