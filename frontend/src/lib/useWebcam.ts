import { RefObject, useCallback, useEffect, useState } from "react";

const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 15000;
// Stream yang hidup lebih singkat dari ini dianggap "langsung crash"
const STABLE_AFTER_MS = 10000;
// Berhenti mencoba otomatis setelah sekian kali crash beruntun, agar tidak memperparah webcam
const MAX_QUICK_FAILURES = 4;

// Urutan constraint yang dicoba. 1280x720 didahulukan karena di banyak webcam UVC (mis. HP Wide
// Vision HD) resolusi ini hanya tersedia sebagai MJPEG, sehingga Chrome tidak memakai YUYV mentah
// yang membuat firmware webcam crash/putus-sambung di Linux.
const CONSTRAINT_CHAIN: MediaTrackConstraints[] = [
  { width: { exact: 1280 }, height: { exact: 720 } },
  { width: { ideal: 640 }, height: { ideal: 480 } },
  {},
];

async function acquireStream(): Promise<MediaStream> {
  let lastErr: unknown;
  for (const video of CONSTRAINT_CHAIN) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: Object.keys(video).length ? video : true,
        audio: false,
      });
    } catch (err) {
      // Izin ditolak berlaku untuk semua constraint, tidak perlu mencoba sisanya
      if (err instanceof DOMException && err.name === "NotAllowedError") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Ambil frame video sebagai JPEG, diperkecil agar lebar maksimal `maxWidth`. */
export function captureVideoFrame(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  quality: number,
  maxWidth = 640
): string | null {
  if (!video || !canvas || video.readyState < 2) return null;
  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 480;
  const scale = Math.min(1, maxWidth / srcW);
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Menyalakan webcam ke <video> dan menyalakannya kembali otomatis bila track berakhir
 * (mis. webcam USB putus-sambung di level kernel) atau saat perangkat kamera muncul lagi.
 * Bila webcam crash berulang kali tepat setelah dibuka, percobaan otomatis dihentikan dan
 * `retry()` bisa dipanggil manual.
 */
export function useWebcam(videoRef: RefObject<HTMLVideoElement | null>): {
  error: string | null;
  retry: () => void;
} {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = RETRY_MIN_MS;
    let starting = false;
    let startedAt = 0;
    let quickFailures = 0;
    let gaveUp = false;

    const stopStream = () => {
      stream?.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      stream = null;
    };

    const isLive = () => !!stream?.getVideoTracks().some((t) => t.readyState === "live");

    const scheduleRetry = () => {
      if (disposed || retryTimer || gaveUp) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        start();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    };

    const start = async () => {
      if (disposed || starting) return;
      starting = true;
      try {
        stopStream();
        const s = await acquireStream();
        if (disposed) {
          // Komponen sudah unmount selama menunggu izin/perangkat: jangan biarkan webcam tertahan
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        s.getVideoTracks().forEach((t) => {
          t.onended = () => {
            if (disposed) return;
            if (Date.now() - startedAt < STABLE_AFTER_MS) {
              quickFailures += 1;
            } else {
              quickFailures = 0;
              retryDelay = RETRY_MIN_MS;
            }
            if (quickFailures >= MAX_QUICK_FAILURES) {
              gaveUp = true;
              stopStream();
              setError("Webcam terus terputus sesaat setelah dinyalakan (kemungkinan masalah hardware webcam)");
              return;
            }
            setError("Kamera terputus, menyambung ulang...");
            scheduleRetry();
          };
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => {});
        }
        startedAt = Date.now();
        setError(null);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? `${err.name}: ${err.message}` : "Akses kamera ditolak");
        // Izin ditolak user tidak akan pulih dengan retry; error lain (perangkat hilang/sibuk) dicoba lagi
        if (!(err instanceof DOMException && err.name === "NotAllowedError")) scheduleRetry();
      } finally {
        starting = false;
      }
    };

    // Perangkat muncul kembali: jadwalkan (bukan langsung) percobaan, tetap mengikuti backoff
    const onDeviceChange = () => {
      if (!isLive() && !starting) scheduleRetry();
    };

    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    start();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
      stopStream();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [videoRef, attempt]);

  return { error, retry };
}
