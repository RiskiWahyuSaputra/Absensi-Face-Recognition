import base64
import cv2
import numpy as np
from fastapi.testclient import TestClient
from app.config import settings
from app.main import app

client = TestClient(app)


def _make_blank_b64() -> str:
    img = np.full((240, 320, 3), 120, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return base64.b64encode(buf.tobytes()).decode("ascii")


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_auth_required():
    resp = client.post("/api/v1/quality-check", json={"image_base64": _make_blank_b64()})
    assert resp.status_code == 401


def test_quality_check_no_face():
    resp = client.post(
        "/api/v1/quality-check",
        headers={"x-api-key": settings.API_KEY},
        json={"image_base64": _make_blank_b64()},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["passed"] is False
    assert data["face_count"] == 0
