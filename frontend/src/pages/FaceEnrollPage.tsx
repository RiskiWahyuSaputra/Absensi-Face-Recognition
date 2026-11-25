import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Camera, CheckCircle2, ArrowLeft, ShieldCheck, RefreshCw } from "lucide-react";
import { apiFetch } from "../lib/api";

const POSES = [
  { key: "front", label: "1. Hadap Lurus ke Kamera" },
  { key: "left", label: "2. Sedikit Menoleh Kiri" },
  { key: "right", label: "3. Sedikit Menoleh Kanan" },
  { key: "glasses_alt", label: "4. Tanpa / Dengan Kacamata (Opsional)" },
  { key: "neutral", label: "5. Ekspresi Netral / Senyum (Opsional)" },
];

interface CapturedPose {
  poseLabel: string;
  imageBase64: string;
  qualityScore: number;
}

export const FaceEnrollPage: React.FC = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [captures, setCaptures] = useState<CapturedPose[]>([]);
  const [poseIdx, setPoseIdx] = useState(0);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [enrolled, setEnrolled] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeedback("Gagal mengakses kamera. Pastikan izin kamera aktif dan tidak dipakai tab lain.");
        }
      });

    return () => {
      cancelled = true;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function takeSnapshot(): string | null {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return null;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88);
  }

  async function handleCapturePose() {
    const img = takeSnapshot();
    if (!img) return;
    setChecking(true);
    setFeedback("");
    try {
      const res = await apiFetch<{
        quality: { passed: boolean; quality_score: number; reasons: string[] };
      }>("/face-registration/quality-check", {
        method: "POST",
        body: JSON.stringify({ imageBase64: img }),
      });

      if (!res.quality.passed) {
        setFeedback(`Foto ditolak: ${res.quality.reasons.join(" ")}`);
        return;
      }

      const currentPose = POSES[poseIdx];
      setCaptures((prev) => [
        ...prev,
        {
          poseLabel: currentPose.key,
          imageBase64: img,
          qualityScore: res.quality.quality_score,
        },
      ]);
      setPoseIdx((i) => Math.min(POSES.length - 1, i + 1));
      setFeedback(
        `Pose "${currentPose.label}" lolos kualitas (skor ${(res.quality.quality_score * 100).toFixed(0)}%).`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Gagal mengecek kualitas foto");
    } finally {
      setChecking(false);
    }
  }

  async function handleEnrollSubmit() {
    if (!employeeId || captures.length < 3) return;
    setChecking(true);
    setFeedback("");
    try {
      const res = await apiFetch<{ message: string }>(`/face-registration/${employeeId}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          photos: captures.map((c) => ({
            poseLabel: c.poseLabel,
            imageBase64: c.imageBase64,
          })),
        }),
      });
      setEnrolled(true);
      setFeedback(res.message);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Gagal menyimpan vektor wajah");
    } finally {
      setChecking(false);
    }
  }

  async function handleVerifyTest() {
    if (!employeeId) return;
    const img = takeSnapshot();
    if (!img) return;
    setChecking(true);
    try {
      const res = await apiFetch<{ matched: boolean; score: number; threshold: number }>(
        `/face-registration/${employeeId}/verify-test`,
        { method: "POST", body: JSON.stringify({ imageBase64: img }) }
      );
      setVerifyResult(
        res.matched
          ? `BERHASIL DIKENALI! Skor kecocokan: ${(res.score * 100).toFixed(1)}% (ambang ${(res.threshold * 100).toFixed(0)}%).`
          : `Belum cocok (skor ${(res.score * 100).toFixed(1)}%). Silakan ulangi pencahayaan/registrasi.`
      );
    } catch (err) {
      setVerifyResult(err instanceof Error ? err.message : "Gagal uji verifikasi");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/employees"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Karyawan
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Registrasi Wajah Karyawan (3–5 Foto)</h1>
          <p className="text-sm text-slate-500">
            Tiap foto dicek otomatis (1 wajah, cukup terang, tidak buram). Foto tidak disimpan — hanya
            vektor terenkripsi AES-256.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-2xl overflow-hidden relative aspect-[4/3]">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-3 left-3 right-3 bg-slate-950/80 text-white px-3.5 py-2 rounded-xl text-xs">
            Panduan: <strong>{POSES[poseIdx]?.label}</strong>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="font-semibold text-slate-800 flex items-center justify-between">
              <span>Foto Terkumpul ({captures.length}/5)</span>
              {captures.length > 0 && !enrolled && (
                <button
                  onClick={() => {
                    setCaptures([]);
                    setPoseIdx(0);
                  }}
                  className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => {
                const cap = captures[i];
                return (
                  <div
                    key={i}
                    className="aspect-square rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center text-xs text-slate-400"
                  >
                    {cap ? (
                      <img src={cap.imageBase64} alt={cap.poseLabel} className="w-full h-full object-cover" />
                    ) : (
                      <span>#{i + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {feedback && (
              <div className="p-3 rounded-lg bg-slate-100 text-slate-800 text-xs">{feedback}</div>
            )}

            {verifyResult && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                {verifyResult}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            {!enrolled ? (
              <>
                <button
                  onClick={handleCapturePose}
                  disabled={checking || captures.length >= 5}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  {checking ? "Mengecek Kualitas..." : `Ambil Foto (${POSES[poseIdx]?.label})`}
                </button>
                <button
                  onClick={handleEnrollSubmit}
                  disabled={checking || captures.length < 3}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Enkripsi &amp; Simpan Vektor ({captures.length} foto)
                </button>
              </>
            ) : (
              <button
                onClick={handleVerifyTest}
                disabled={checking}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Uji Coba Pengenalan Wajah Sekarang
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
