"""
Download model AI open-source komersial sesuai PRD:
- OpenCV YuNet (MIT License): face_detection_yunet_2023mar.onnx
- OpenCV SFace (Apache 2.0 License): face_recognition_sface_2021dec.onnx

Silent-Face-Anti-Spoofing (Apache 2.0) ONNX opsional dapat diletakkan di:
  models/silent_face_antispoof.onnx
Jika belum tersedia, layanan menggunakan kombinasi analisis passive liveness
multi-cue (frekuensi Moire FFT, distribusi warna YCrCb/HSV, glare layar, dan
perbedaan frame/kedip mata).
"""

import argparse
import os
import urllib.request

MODELS = {
    "face_detection_yunet_2023mar.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_detection_yunet/face_detection_yunet_2023mar.onnx"
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_recognition_sface/face_recognition_sface_2021dec.onnx"
    ),
}


def download_models(output_dir: str) -> None:
    os.makedirs(output_dir, exist_ok=True)
    for filename, url in MODELS.items():
        dest = os.path.join(output_dir, filename)
        if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
            print(f"[SKIP] {filename} sudah ada.")
            continue
        print(f"[DOWNLOAD] {filename} ...")
        urllib.request.urlretrieve(url, dest)
        size_kb = os.path.getsize(dest) / 1024
        print(f"[OK] {filename} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="models")
    args = parser.parse_args()
    download_models(args.output_dir)
