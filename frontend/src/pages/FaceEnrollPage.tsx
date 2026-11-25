import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import { captureVideoFrame, useWebcam } from "../lib/useWebcam";
import { Alert, Notice, PageHeader } from "../components/ui";
import { errMsg } from "../lib/format";

const POSES = [
  { key: "front", label: "Hadap lurus ke kamera", optional: false },
  { key: "left", label: "Sedikit menoleh ke kiri", optional: false },
  { key: "right", label: "Sedikit menoleh ke kanan", optional: false },
  { key: "glasses_alt", label: "Dengan / tanpa kacamata", optional: true },
  { key: "neutral", label: "Ekspresi netral atau senyum", optional: true },
];
const MIN_PHOTOS = 3;

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
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [verify, setVerify] = useState<{ matched: boolean; text: string } | null>(null);

  const { error: cameraError, retry: retryCamera } = useWebcam(videoRef);
  const poseIdx = Math.min(captures.length, POSES.length - 1);
  const currentPose = POSES[poseIdx];
  const allTaken = captures.length >= POSES.length;

  useEffect(() => {
    if (cameraError) setNotice(null);
  }, [cameraError]);

  function takeSnapshot(): string | null {
    return captureVideoFrame(videoRef.current, canvasRef.current, 0.88);
  }

  async function handleCapturePose() {
    const img = takeSnapshot();
    if (!img) return;
    setChecking(true);
    setNotice(null);
    try {
      const res = await apiFetch<{
        quality: { passed: boolean; quality_score: number; reasons: string[] };
      }>("/face-registration/quality-check", {
        method: "POST",
        body: JSON.stringify({ imageBase64: img }),
      });

      if (!res.quality.passed) {
        setNotice({ tone: "warning", text: `Foto ditolak: ${res.quality.reasons.join(" ")}` });
        return;
      }

      setCaptures((prev) => [
        ...prev,
        { poseLabel: currentPose.key, imageBase64: img, qualityScore: res.quality.quality_score },
      ]);
      setNotice({
        tone: "success",
        text: `"${currentPose.label}" lolos (kualitas ${(res.quality.quality_score * 100).toFixed(0)}%).`,
      });
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal mengecek kualitas foto") });
    } finally {
      setChecking(false);
    }
  }

  async function handleEnrollSubmit() {
    if (!employeeId || captures.length < MIN_PHOTOS) return;
    setChecking(true);
    setNotice(null);
    try {
      const res = await apiFetch<{ message: string }>(`/face-registration/${employeeId}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          photos: captures.map((c) => ({ poseLabel: c.poseLabel, imageBase64: c.imageBase64 })),
        }),
      });
      setEnrolled(true);
      setNotice({ tone: "success", text: res.message });
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menyimpan vektor wajah") });
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
      setVerify({
        matched: res.matched,
        text: res.matched
          ? `Wajah dikenali. Skor ${(res.score * 100).toFixed(1)}% (ambang ${(res.threshold * 100).toFixed(0)}%).`
          : `Belum cocok, skor ${(res.score * 100).toFixed(1)}%. Perbaiki pencahayaan atau daftar ulang.`,
      });
    } catch (err) {
      setVerify({ matched: false, text: errMsg(err, "Gagal uji verifikasi") });
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setCaptures([]);
    setNotice(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link
            to="/employees"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Karyawan
          </Link>
        }
        title="Registrasi Wajah"
        description="Ambil 3 sampai 5 foto. Tiap foto dicek otomatis: satu wajah, cukup terang, tidak buram. Foto tidak disimpan, hanya vektor wajah terenkripsi."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Kamera */}
        <div className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-900">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => e.currentTarget.play().catch(() => {})}
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Panduan oval wajah */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[72%] aspect-[4/5] rounded-[50%] border-2 border-dashed border-white/60" />
            </div>

            {!enrolled && !allTaken && (
              <div className="absolute inset-x-3 top-3 flex justify-center">
                <div className="rounded-lg bg-slate-950/80 px-3 py-1.5 text-center text-sm font-semibold text-white">
                  {currentPose.label}
                </div>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-6 text-center text-white">
                <p className="max-w-xs text-sm">{cameraError}</p>
                <button onClick={retryCamera} className="btn btn-secondary btn-sm">
                  <RefreshCw className="h-3.5 w-3.5" /> Nyalakan ulang kamera
                </button>
              </div>
            )}
          </div>

          {!enrolled ? (
            <button
              onClick={handleCapturePose}
              disabled={checking || allTaken || !!cameraError}
              className="btn btn-dark w-full py-3"
            >
              <Camera className="h-4 w-4" />
              {checking ? "Mengecek kualitas..." : allTaken ? "Semua pose sudah diambil" : "Ambil foto"}
            </button>
          ) : (
            <button onClick={handleVerifyTest} disabled={checking || !!cameraError} className="btn btn-dark w-full py-3">
              <CheckCircle2 className="h-4 w-4" />
              {checking ? "Mencocokkan..." : "Uji pengenalan wajah"}
            </button>
          )}
        </div>

        {/* Langkah */}
        <div className="card flex flex-col">
          <div className="card-header">
            <h2 className="card-title">
              Foto terkumpul <span className="text-slate-500">{captures.length}/{POSES.length}</span>
            </h2>
            {captures.length > 0 && !enrolled && (
              <button onClick={reset} className="btn btn-ghost btn-sm">
                <RefreshCw className="h-3.5 w-3.5" /> Ulangi
              </button>
            )}
          </div>

          <ol className="flex-1 divide-y divide-slate-100">
            {POSES.map((p, i) => {
              const cap = captures[i];
              const isCurrent = !enrolled && i === captures.length;
              return (
                <li
                  key={p.key}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex items-center gap-3 px-4 py-2.5 sm:px-5 ${isCurrent ? "bg-brand-50/60" : ""}`}
                >
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {cap ? (
                      <img src={cap.imageBase64} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">
                        {i + 1}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${isCurrent ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                      {p.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {cap
                        ? `Kualitas ${(cap.qualityScore * 100).toFixed(0)}%`
                        : p.optional
                        ? "Opsional"
                        : "Wajib"}
                    </div>
                  </div>
                  {cap && <Check className="h-4 w-4 shrink-0 text-brand-700" aria-label="Sudah diambil" />}
                </li>
              );
            })}
          </ol>

          <div className="space-y-3 border-t border-slate-200 p-4 sm:p-5">
            {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
            {verify && <Alert tone={verify.matched ? "success" : "warning"}>{verify.text}</Alert>}

            {!enrolled && (
              <button
                onClick={handleEnrollSubmit}
                disabled={checking || captures.length < MIN_PHOTOS}
                className="btn btn-primary w-full"
              >
                <ShieldCheck className="h-4 w-4" />
                {captures.length < MIN_PHOTOS
                  ? `Ambil ${MIN_PHOTOS - captures.length} foto lagi`
                  : `Enkripsi & simpan ${captures.length} foto`}
              </button>
            )}
            {enrolled && (
              <Link to="/employees" className="btn btn-secondary w-full">
                Selesai, kembali ke daftar karyawan
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
