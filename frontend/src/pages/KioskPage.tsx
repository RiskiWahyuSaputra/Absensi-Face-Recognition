import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wifi,
  WifiOff,
  Settings,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ScanFace,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { getKioskToken, kioskFetch, setKioskToken } from "../lib/api";
import {
  enqueueOfflineAttendance,
  getAllQueuedAttendance,
  removeQueuedAttendance,
} from "../lib/offlineQueue";

interface KioskResult {
  type: "success" | "warning" | "error" | "offline";
  title: string;
  subtitle: string;
  meta?: string;
}

export const KioskPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [clock, setClock] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [kioskName, setKioskName] = useState("Kiosk Pintu Masuk");
  const [maxFailBeforePin, setMaxFailBeforePin] = useState(3);
  const [failCount, setFailCount] = useState(0);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [result, setResult] = useState<KioskResult | null>(null);

  // Fallback PIN modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinNik, setPinNik] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);

  // Token config modal
  const [showConfig, setShowConfig] = useState(false);
  const [tokenInput, setTokenInput] = useState(getKioskToken());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Online/offline listeners
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Start webcam (single acquire + fallback simple constraints + explicit play)
  const startCamera = useCallback(async () => {
    try {
      const existing = videoRef.current?.srcObject as MediaStream | null;
      existing?.getTracks().forEach((tr) => tr.stop());

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch {
        // Fallback tanpa constraint resolusi bila driver webcam Linux menolak ideal width/height
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      return stream;
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : "Akses kamera ditolak";
      setResult({
        type: "error",
        title: "Kamera Tidak Tersedia",
        subtitle: `Izinkan akses kamera pada browser (${msg}).`,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    startCamera().then((s) => {
      activeStream = s;
    });
    return () => {
      activeStream?.getTracks().forEach((tr) => tr.stop());
      if (videoRef.current) {
        const cur = videoRef.current.srcObject as MediaStream | null;
        cur?.getTracks().forEach((tr) => tr.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [startCamera]);

  const refreshQueueCount = useCallback(async () => {
    const items = await getAllQueuedAttendance().catch(() => []);
    setQueueCount(items.length);
  }, []);

  const loadKioskInfo = useCallback(async () => {
    try {
      const res = await kioskFetch<{
        kiosk: { name: string; location: string };
        maxFaceFailBeforePin: number;
      }>("/kiosk/info");
      if (res.ok && res.data.kiosk) {
        setKioskName(`${res.data.kiosk.name} · ${res.data.kiosk.location}`);
        setMaxFailBeforePin(res.data.maxFaceFailBeforePin || 3);
      }
    } catch {
      // Offline mode
    }
  }, []);

  // Sync offline queue automatically when online
  const syncOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const items = await getAllQueuedAttendance().catch(() => []);
    if (items.length === 0) return;

    for (const item of items) {
      try {
        const endpoint = item.mode === "pin" ? "/kiosk/attendance/pin" : "/kiosk/attendance/face";
        const body =
          item.mode === "pin"
            ? {
                nik: item.nik,
                pin: item.pin,
                imageBase64: item.imageBase64,
                clientRecordedAt: item.clientRecordedAt,
                isOfflineSynced: true,
              }
            : {
                imageBase64: item.imageBase64,
                secondaryImageBase64: item.secondaryImageBase64,
                clientRecordedAt: item.clientRecordedAt,
                isOfflineSynced: true,
              };
        const res = await kioskFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          if (item.id !== undefined) {
            await removeQueuedAttendance(item.id);
          }
        }
      } catch {
        break; // Masih offline
      }
    }
    refreshQueueCount();
  }, [refreshQueueCount]);

  useEffect(() => {
    loadKioskInfo();
    refreshQueueCount();
  }, [loadKioskInfo, refreshQueueCount]);

  useEffect(() => {
    if (isOnline) {
      syncOfflineQueue();
    }
  }, [isOnline, syncOfflineQueue]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }, []);

  const showTemporaryResult = useCallback((res: KioskResult, ms = 3500) => {
    setResult(res);
    setTimeout(() => {
      setResult((prev) => (prev === res ? null : prev));
    }, ms);
  }, []);

  /**
   * F-01 & F-02: Auto-capture tanpa menekan tombol, ambil 2 frame selisih 350ms
   * untuk cek liveness pasif + kedip/gerakan alami.
   */
  const runFaceAttempt = useCallback(async () => {
    if (scanning || showPinModal || showConfig) return;
    const frame1 = captureFrame();
    if (!frame1) return;

    setScanning(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const frame2 = captureFrame() || undefined;

      if (!navigator.onLine) {
        await enqueueOfflineAttendance({
          mode: "face",
          imageBase64: frame1,
          secondaryImageBase64: frame2,
          clientRecordedAt: new Date().toISOString(),
        });
        await refreshQueueCount();
        showTemporaryResult({
          type: "offline",
          title: "Disimpan di Antrean Offline",
          subtitle: "Internet terputus. Absen akan dikirim otomatis saat tersambung.",
        });
        return;
      }

      const res = await kioskFetch<{
        ignored?: boolean;
        message?: string;
        attendanceType?: string;
        statusLabel?: string;
        recordedAt?: string;
        matchScore?: number;
        employee?: { fullName: string; nik: string; department: string };
      }>("/kiosk/attendance/face", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: frame1,
          secondaryImageBase64: frame2,
        }),
      });

      if (res.ok) {
        setFailCount(0);
        if (res.data.ignored) {
          showTemporaryResult({
            type: "warning",
            title: res.data.employee?.fullName || "Sudah Absen",
            subtitle: res.data.message || "Absen ganda diabaikan",
          });
        } else {
          const jenis = res.data.attendanceType === "check_out" ? "ABSEN PULANG" : "ABSEN MASUK";
          const jam = res.data.recordedAt
            ? new Date(res.data.recordedAt).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          showTemporaryResult(
            {
              type: "success",
              title: res.data.employee?.fullName || "Berhasil",
              subtitle: `${jenis} · ${res.data.statusLabel || "Tercatat"}`,
              meta: `Pukul ${jam} · Skor ${(Number(res.data.matchScore || 0) * 100).toFixed(1)}%`,
            },
            4500
          );
        }
        return;
      }

      // Wajah tidak ada di frame -> jangan hitung gagal
      if (res.data.code === "NO_FACE") {
        return;
      }

      // Liveness gagal atau tidak cocok -> hitung kegagalan (PRD: 3x gagal beralih ke PIN)
      const nextFails = failCount + 1;
      setFailCount(nextFails);

      if (nextFails >= maxFailBeforePin) {
        setShowPinModal(true);
        setFailCount(0);
        showTemporaryResult({
          type: "warning",
          title: "Beralih ke Fallback PIN",
          subtitle: `Gagal verifikasi wajah ${maxFailBeforePin}×. Gunakan NIK & PIN.`,
        });
      } else {
        showTemporaryResult({
          type: "error",
          title:
            res.data.code === "LIVENESS_FAILED"
              ? "Absen Ditolak (Anti-Spoofing)"
              : "Wajah Tidak Dikenali",
          subtitle: `${res.data.error || "Silakan coba lagi"} (Percobaan ${nextFails}/${maxFailBeforePin})`,
        });
      }
    } catch {
      // Network/server error -> simpan ke antrean offline IndexedDB
      await enqueueOfflineAttendance({
        mode: "face",
        imageBase64: frame1,
        clientRecordedAt: new Date().toISOString(),
      });
      await refreshQueueCount();
      showTemporaryResult({
        type: "offline",
        title: "Server Tidak Terjangkau",
        subtitle: "Absen masuk antrean offline & akan dikirim otomatis saat tersambung.",
      });
    } finally {
      setScanning(false);
    }
  }, [
    captureFrame,
    failCount,
    maxFailBeforePin,
    refreshQueueCount,
    scanning,
    showConfig,
    showPinModal,
    showTemporaryResult,
  ]);

  // F-01: Loop deteksi otomatis tiap 2.5 detik tanpa menekan tombol
  useEffect(() => {
    if (!autoScanEnabled || showPinModal || showConfig) return;
    const interval = setInterval(() => {
      runFaceAttempt();
    }, 2500);
    return () => clearInterval(interval);
  }, [autoScanEnabled, runFaceAttempt, showConfig, showPinModal]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const photo = captureFrame();
    if (!photo) return;
    setPinSubmitting(true);

    try {
      if (!navigator.onLine) {
        await enqueueOfflineAttendance({
          mode: "pin",
          nik: pinNik,
          pin: pinCode,
          imageBase64: photo,
          clientRecordedAt: new Date().toISOString(),
        });
        await refreshQueueCount();
        setShowPinModal(false);
        setPinNik("");
        setPinCode("");
        showTemporaryResult({
          type: "offline",
          title: "Absen PIN Masuk Antrean Offline",
          subtitle: "Akan dikirim otomatis saat internet kembali tersambung.",
        });
        return;
      }

      const res = await kioskFetch<{
        ignored?: boolean;
        message?: string;
        attendanceType?: string;
        statusLabel?: string;
        employee?: { fullName: string };
      }>("/kiosk/attendance/pin", {
        method: "POST",
        body: JSON.stringify({
          nik: pinNik,
          pin: pinCode,
          imageBase64: photo,
        }),
      });

      if (!res.ok) {
        showTemporaryResult({
          type: "error",
          title: "Fallback PIN Gagal",
          subtitle: res.data.error || "NIK atau PIN salah",
        });
        return;
      }

      setShowPinModal(false);
      setPinNik("");
      setPinCode("");
      showTemporaryResult(
        {
          type: "success",
          title: res.data.employee?.fullName || "Berhasil (PIN)",
          subtitle: res.data.ignored
            ? res.data.message || "Sudah absen"
            : `${res.data.attendanceType === "check_out" ? "ABSEN PULANG" : "ABSEN MASUK"} · ${res.data.statusLabel}`,
          meta: "Ditandai untuk ditinjau HR (Fallback PIN + Foto)",
        },
        4500
      );
    } finally {
      setPinSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header Kiosk */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <ScanFace className="w-6 h-6" />
          </div>
          <div>
            <div className="font-semibold text-base">{kioskName}</div>
            <div className="text-xs text-slate-400">
              Berdiri di depan kamera — deteksi wajah &amp; liveness otomatis
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold tracking-wider">
              {clock.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
            <div className="text-xs text-slate-400">
              {clock.toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>

          <div
            className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${
              isOnline
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? "Online" : "Offline Mode"}
          </div>

          {queueCount > 0 && (
            <button
              onClick={syncOfflineQueue}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Antrean: {queueCount}
            </button>
          )}

          <button
            onClick={() => setShowConfig(true)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            title="Pengaturan Token Kiosk"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Camera Viewport */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <div className="relative w-full max-w-2xl aspect-[4/3] rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) => e.currentTarget.play().catch(() => {})}
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Face Oval Guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`w-64 h-80 rounded-[50%] border-4 transition-colors duration-300 ${
                scanning
                  ? "border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.4)]"
                  : "border-white/50"
              }`}
            />
          </div>

          {/* Scanning status pill */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-slate-950/75 backdrop-blur text-xs font-medium text-slate-200">
            {scanning
              ? "Memverifikasi keaslian wajah (Liveness + SFace)..."
              : autoScanEnabled
              ? "Posisikan wajah di dalam bingkai oval"
              : "Pemindaian otomatis dijeda"}
          </div>

          {/* Result Banner Overlay */}
          {result && (
            <div
              className={`absolute bottom-5 left-5 right-5 p-5 rounded-2xl backdrop-blur-md border shadow-xl flex items-center gap-4 ${
                result.type === "success"
                  ? "bg-emerald-950/90 border-emerald-500 text-emerald-50"
                  : result.type === "error"
                  ? "bg-rose-950/90 border-rose-500 text-rose-50"
                  : "bg-amber-950/90 border-amber-500 text-amber-50"
              }`}
            >
              {result.type === "success" ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-10 h-10 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="text-xl font-bold">{result.title}</div>
                <div className="text-sm opacity-90">{result.subtitle}</div>
                {result.meta && <div className="text-xs opacity-75 mt-0.5">{result.meta}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setAutoScanEnabled((v) => !v)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium cursor-pointer"
          >
            {autoScanEnabled ? "Jeda Scan Otomatis" : "Aktifkan Scan Otomatis"}
          </button>
          <button
            onClick={() => setShowPinModal(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            Absen Pakai PIN (Alternatif / Fallback)
          </button>
          <Link
            to="/"
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-sm text-slate-300 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard HR
          </Link>
        </div>
      </main>

      {/* Modal Fallback PIN + Foto */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-1">Absen dengan PIN + Foto Bukti</h2>
            <p className="text-xs text-slate-400 mb-4">
              Digunakan bila wajah gagal 3× atau karyawan memilih alternatif PIN (UU PDP). Foto akan
              diambil otomatis untuk ditinjau HR.
            </p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">NIK Karyawan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: EMP-001"
                  value={pinNik}
                  onChange={(e) => setPinNik(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">PIN 6 Digit</label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  placeholder="••••••"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm tracking-widest"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pinSubmitting}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium cursor-pointer"
                >
                  {pinSubmitting ? "Mengirim..." : "Catat Absen PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Token Perangkat Kiosk */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-1">Konfigurasi Token Kiosk</h2>
            <p className="text-xs text-slate-400 mb-4">
              Tiap tablet memiliki token unik dari Admin IT yang dapat dicabut sewaktu-waktu.
            </p>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm font-mono mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfig(false)}
                className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm cursor-pointer"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  setKioskToken(tokenInput);
                  setShowConfig(false);
                  loadKioskInfo();
                }}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium cursor-pointer"
              >
                Simpan Token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
