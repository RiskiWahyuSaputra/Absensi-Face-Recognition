import React, { useEffect, useState } from "react";
import { Check, X, Plus } from "lucide-react";
import { apiFetch } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";

interface CorrectionRow {
  id: string;
  nik: string;
  full_name: string;
  attendance_date: string;
  attendance_type: "check_in" | "check_out";
  requested_time: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

export const CorrectionsPage: React.FC = () => {
  const { user } = useAuth();
  const canApprove =
    user?.role === "supervisor" || user?.role === "hr_admin" || user?.role === "it_admin";

  const [list, setList] = useState<CorrectionRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceType, setAttendanceType] = useState<"check_in" | "check_out">("check_in");
  const [timeStr, setTimeStr] = useState("08:00");
  const [reason, setReason] = useState("");

  async function load() {
    const res = await apiFetch<{ corrections: CorrectionRow[] }>("/corrections");
    setList(res.corrections);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const requestedTime = new Date(`${attendanceDate}T${timeStr}:00`).toISOString();
    await apiFetch("/corrections", {
      method: "POST",
      body: JSON.stringify({ attendanceDate, attendanceType, requestedTime, reason }),
    });
    setShowForm(false);
    setReason("");
    load();
  }

  async function handleReview(id: string, decision: "approved" | "rejected") {
    const reviewNote = window.prompt(
      decision === "approved" ? "Catatan persetujuan (opsional):" : "Alasan penolakan:"
    );
    await apiFetch(`/corrections/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, reviewNote: reviewNote || undefined }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Koreksi Absensi &amp; Persetujuan</h1>
          <p className="text-sm text-slate-500">
            Semua pengajuan dan persetujuan koreksi tercatat lengkap (siapa, kapan, alasan).
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Ajukan Koreksi
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-5 py-3">Karyawan</th>
                <th className="px-5 py-3">Tanggal &amp; Jam</th>
                <th className="px-5 py-3">Alasan</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Audit Persetujuan</th>
                {canApprove && <th className="px-5 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{c.full_name}</div>
                    <div className="text-xs text-slate-500">{c.nik}</div>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <div className="font-medium">
                      {c.attendance_date.slice(0, 10)} ·{" "}
                      {c.attendance_type === "check_in" ? "Masuk" : "Pulang"}
                    </div>
                    <div className="font-mono text-slate-500">
                      {new Date(c.requested_time).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-700 max-w-xs">{c.reason}</td>
                  <td className="px-5 py-3">
                    <StatusBadge value={c.status} />
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {c.reviewed_by_name ? (
                      <>
                        <div>Oleh: {c.reviewed_by_name}</div>
                        <div>{c.review_note || "-"}</div>
                      </>
                    ) : (
                      "Menunggu peninjauan"
                    )}
                  </td>
                  {canApprove && (
                    <td className="px-5 py-3 text-right space-x-1.5 whitespace-nowrap">
                      {c.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleReview(c.id, "approved")}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Setujui
                          </button>
                          <button
                            onClick={() => handleReview(c.id, "rejected")}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-xs cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Tolak
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    Belum ada pengajuan koreksi absensi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold mb-4">Ajukan Koreksi Absensi</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Jam</label>
                  <input
                    type="time"
                    required
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Jenis Absen</label>
                <select
                  value={attendanceType}
                  onChange={(e) => setAttendanceType(e.target.value as "check_in" | "check_out")}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="check_in">Absen Masuk</option>
                  <option value="check_out">Absen Pulang</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Alasan Koreksi</label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Lupa absen pulang karena lembur rapat klien"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium cursor-pointer"
                >
                  Kirim Pengajuan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
