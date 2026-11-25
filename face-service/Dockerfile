FROM python:3.11-slim

WORKDIR /app

# OpenCV headless system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts ./scripts
COPY app ./app

# Download OpenCV YuNet (MIT) & SFace (Apache 2.0) ONNX models at build time
RUN mkdir -p /app/models && python scripts/download_models.py --output-dir /app/models || true

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
