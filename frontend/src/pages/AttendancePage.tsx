import React, { useEffect, useState } from "react";
import { Image, CheckCircle2 } from "lucide-react";
import { apiFetch, getAuthToken } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";

interface AttendanceLog {
  id: string;
  nik: string;
  full_name: string;
  department: string;
  attendance_date: string;
  attendance_type: "check_in" | "check_out";
  status: string;
  method: string;
  match_score: number | null;
  liveness_score: number | null;
  proof_photo_path: string | null;
  needs_hr_review: boolean;
  is_offline_synced: boolean;
  recorded_at: string;
  kiosk_name: string | null;
}

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const isHrOrIt = user?.role === "hr_admin" || user?.role === "it_admin";
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [onlyPending, setOnlyPending] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  async function loadLogs() {
    const res = await apiFetch<{ logs: AttendanceLog[] }>(
      `/attendance/logs?onlyPendingReview=${onlyPending}`
    );
    setLogs(res.logs);
  }

  useEffect(() => {
    loadLogs();
  }, [onlyPending]);

  async function openProofPhoto(id: string) {
    const res = await fetch(`/api/attendance/logs/${id}/proof-photo`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    if (!res.ok) {
      alert("Foto bukti tidak tersedia atau sudah dihapus otomatis (> 90 hari).");
      return;
    }
    const blob = await res.blob();
    setPhotoUrl(URL.createObjectURL(blob));
  }

  async function handleHrReview(id: string) {
    await apiFetch(`/attendance/logs/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ note: "Foto bukti fallback PIN valid" }),
    });
    loadLogs();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Log Absensi &amp; Foto Bukti</h1>
          <p className="text-sm text-slate-500">
            Menyimpan waktu server, ID kiosk, skor kecocokan, dan foto bukti (dihapus otomatis setelah 90 hari).
          </p>
        </div>
        {isHrOrIt && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="rounded border-slate-300"
            />
            Hanya yang perlu tinjauan HR (Fallback PIN)
          </label>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-5 py-3">Waktu Server</th>
                <th className="px-5 py-3">Karyawan</th>
                <th className="px-5 py-3">Jenis</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Metode &amp; Skor</th>
                <th className="px-5 py-3">Kiosk</th>
                <th className="px-5 py-3 text-right">Bukti / Tinjau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                    {new Date(l.recorded_at).toLocaleString("id-ID")}
                    {l.is_offline_synced && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px]">
                        Sync Offline
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-medium">{l.full_name}</div>
                    <div className="text-xs text-slate-500">{l.nik}</div>
                  </td>
                  <td className="px-5 py-3 text-xs font-medium">
                    {l.attendance_type === "check_in" ? "Masuk" : "Pulang"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge value={l.status} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge value={l.method} />
                    {l.match_score !== null && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Cocok {(l.match_score * 100).toFixed(1)}% · Live{" "}
                        {((l.liveness_score || 0) * 100).toFixed(0)}%
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600">{l.kiosk_name || "-"}</td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    {l.proof_photo_path && (
                      <button
                        onClick={() => openProofPhoto(l.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs cursor-pointer"
                      >
                        <Image className="w-3.5 h-3.5" /> Foto
                      </button>
                    )}
                    {isHrOrIt && l.needs_hr_review && (
                      <button
                        onClick={() => handleHrReview(l.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verifikasi HR
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Belum ada log absensi pada periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {photoUrl && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => {
            URL.revokeObjectURL(photoUrl);
            setPhotoUrl(null);
          }}
        >
          <div className="bg-white rounded-2xl p-3 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <img src={photoUrl} alt="Foto Bukti Absensi" className="w-full rounded-xl" />
            <button
              onClick={() => {
                URL.revokeObjectURL(photoUrl);
                setPhotoUrl(null);
              }}
              className="mt-3 w-full py-2 rounded-lg bg-slate-900 text-white text-sm cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
