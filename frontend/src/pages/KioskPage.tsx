import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wifi,
  WifiOff,
  Settings,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CloudOff,
  ScanFace,
  RefreshCw,
  ArrowLeft,
  Pause,
  Play,
  CameraOff,
} from "lucide-react";
import { Modal } from "../components/ui";
import { getKioskToken, kioskFetch, setKioskToken } from "../lib/api";
import {
  enqueueOfflineAttendance,
  getAllQueuedAttendance,
  removeQueuedAttendance,
} from "../lib/offlineQueue";
import { captureVideoFrame, useWebcam } from "../lib/useWebcam";

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

  // Webcam dengan auto-reconnect bila perangkat putus-sambung
  const { error: cameraError, retry: retryCamera } = useWebcam(videoRef);

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

  const captureFrame = useCallback(
    (): string | null => captureVideoFrame(videoRef.current, canvasRef.current, 0.82),
    []
  );

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

  const resultStyle =
    result?.type === "success"
      ? { box: "bg-brand-700 text-white", icon: <CheckCircle2 className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" /> }
      : result?.type === "error"
      ? { box: "bg-rose-600 text-white", icon: <XCircle className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" /> }
      : result?.type === "offline"
      ? { box: "bg-indigo-600 text-white", icon: <CloudOff className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" /> }
      : { box: "bg-amber-400 text-amber-950", icon: <AlertTriangle className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" /> };

  const statusText = cameraError
    ? "Kamera belum siap"
    : scanning
    ? "Memverifikasi wajah..."
    : autoScanEnabled
    ? "Posisikan wajah di dalam bingkai"
    : "Pemindaian otomatis dijeda";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600">
            <ScanFace className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold sm:text-base">{kioskName}</div>
            <div className="hidden text-xs text-slate-400 sm:block">Absen otomatis dengan wajah</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              isOnline ? "bg-brand-500/15 text-brand-300" : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
          </div>
          {queueCount > 0 && (
            <button
              onClick={syncOfflineQueue}
              title="Kirim antrean offline sekarang"
              className="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {queueCount}
              <span className="hidden sm:inline">antrean</span>
            </button>
          )}
          <button
            onClick={() => setShowConfig(true)}
            aria-label="Pengaturan token kiosk"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
        {/* Jam: di atas kamera pada layar sempit */}
        <div className="text-center lg:hidden">
          <div className="text-4xl font-bold tracking-tight sm:text-5xl">
            {clock.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {clock.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Kamera */}
        <div className="relative mx-auto aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) => e.currentTarget.play().catch(() => {})}
            className="h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Bingkai oval: berubah hijau saat verifikasi berjalan */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`aspect-[4/5] h-[70%] rounded-[50%] border-4 transition-colors duration-300 ${
                scanning ? "border-brand-400" : "border-white/50"
              }`}
            />
          </div>

          <div className="absolute inset-x-0 top-3 flex justify-center px-3">
            <div className="rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-slate-100 sm:text-sm">
              {statusText}
            </div>
          </div>

          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/90 p-6 text-center">
              <CameraOff className="h-10 w-10 text-slate-500" />
              <div>
                <div className="font-semibold">Kamera tidak tersedia</div>
                <p className="mt-1 max-w-sm text-sm text-slate-400">{cameraError}</p>
              </div>
              <button onClick={retryCamera} className="btn bg-white text-slate-900 hover:bg-slate-200">
                <RefreshCw className="h-4 w-4" /> Nyalakan ulang kamera
              </button>
            </div>
          )}

          {result && (
            <div
              role="status"
              aria-live="polite"
              className={`absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl p-4 sm:inset-x-4 sm:bottom-4 sm:gap-4 sm:p-5 ${resultStyle.box}`}
            >
              {resultStyle.icon}
              <div className="min-w-0">
                <div className="truncate text-lg font-bold sm:text-2xl">{result.title}</div>
                <div className="text-sm opacity-90 sm:text-base">{result.subtitle}</div>
                {result.meta && <div className="mt-0.5 text-xs opacity-80">{result.meta}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Panel samping */}
        <div className="flex flex-col justify-center gap-6">
          <div className="hidden lg:block">
            <div className="text-6xl font-bold tracking-tight">
              {clock.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              <span className="text-3xl text-slate-500">
                :{String(clock.getSeconds()).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-2 text-base text-slate-400">
              {clock.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>

          <ol className="hidden space-y-3 text-sm text-slate-300 lg:block">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold">1</span>
              Berdiri sekitar setengah meter dari tablet.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold">2</span>
              Pastikan seluruh wajah masuk ke bingkai oval.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold">3</span>
              Tunggu sebentar. Absen tercatat otomatis tanpa menekan tombol.
            </li>
          </ol>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            <button
              onClick={() => setShowPinModal(true)}
              className="btn bg-white py-3.5 text-base text-slate-900 hover:bg-slate-200"
            >
              <KeyRound className="h-5 w-5" />
              Absen pakai PIN
            </button>
            <button
              onClick={() => setAutoScanEnabled((v) => !v)}
              className="btn bg-slate-800 py-3.5 text-slate-200 hover:bg-slate-700"
            >
              {autoScanEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {autoScanEnabled ? "Jeda pemindaian" : "Lanjutkan pemindaian"}
            </button>
          </div>

          <Link
            to="/"
            className="inline-flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 lg:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke dashboard HR
          </Link>
        </div>
      </main>

      {showPinModal && (
        <Modal
          dark
          title="Absen dengan PIN"
          description="Foto kamu tetap diambil sebagai bukti dan ditinjau HR."
          onClose={() => setShowPinModal(false)}
        >
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label htmlFor="pin-nik" className="mb-1.5 block text-xs font-semibold text-slate-300">
                NIK karyawan
              </label>
              <input
                id="pin-nik"
                type="text"
                required
                autoComplete="off"
                placeholder="mis. EMP-001"
                value={pinNik}
                onChange={(e) => setPinNik(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-3 text-base text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="pin-code" className="mb-1.5 block text-xs font-semibold text-slate-300">
                PIN 6 angka
              </label>
              <input
                id="pin-code"
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoComplete="off"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="btn flex-1 bg-slate-800 py-3 text-slate-200 hover:bg-slate-700"
              >
                Batal
              </button>
              <button type="submit" disabled={pinSubmitting} className="btn btn-primary flex-1 py-3">
                {pinSubmitting ? "Mengirim..." : "Catat absen"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showConfig && (
        <Modal
          dark
          title="Token kiosk"
          description="Setiap tablet punya token unik dari Admin IT. Token bisa dicabut kapan saja."
          onClose={() => setShowConfig(false)}
        >
          <label htmlFor="kiosk-token" className="sr-only">
            Token kiosk
          </label>
          <input
            id="kiosk-token"
            type="text"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-3 font-mono text-sm text-white focus:border-brand-500 focus:outline-none"
          />
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              onClick={() => setShowConfig(false)}
              className="btn flex-1 bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              Tutup
            </button>
            <button
              onClick={() => {
                setKioskToken(tokenInput);
                setShowConfig(false);
                loadKioskInfo();
              }}
              className="btn btn-primary flex-1"
            >
              Simpan token
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
