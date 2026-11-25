import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Image } from "lucide-react";
import { apiFetch, getAuthToken } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, Modal, Notice, PageHeader, TableMessage } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { errMsg, fmtDateTime } from "../lib/format";

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
  const [logs, setLogs] = useState<AttendanceLog[] | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; log: AttendanceLog } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ logs: AttendanceLog[] }>(
        `/attendance/logs?onlyPendingReview=${onlyPending}`
      );
      setLogs(res.logs);
    } catch (e) {
      setLogs([]);
      setNotice({ tone: "error", text: errMsg(e, "Gagal memuat log absensi") });
    }
  }, [onlyPending]);

  useEffect(() => {
    setLogs(null);
    loadLogs();
  }, [loadLogs]);

  async function openProofPhoto(log: AttendanceLog) {
    setBusyId(log.id);
    try {
      const res = await fetch(`/api/attendance/logs/${log.id}/proof-photo`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) {
        setNotice({
          tone: "warning",
          text: "Foto bukti tidak tersedia, kemungkinan sudah dihapus otomatis setelah 90 hari.",
        });
        return;
      }
      setPhoto({ url: URL.createObjectURL(await res.blob()), log });
    } finally {
      setBusyId(null);
    }
  }

  function closePhoto() {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  }

  async function handleHrReview(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/attendance/logs/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ note: "Foto bukti fallback PIN valid" }),
      });
      setNotice({ tone: "success", text: "Absen PIN sudah diverifikasi." });
      closePhoto();
      loadLogs();
    } catch (e) {
      setNotice({ tone: "error", text: errMsg(e, "Gagal memverifikasi") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Absensi"
        description="Waktu server, kiosk, skor kecocokan, dan foto bukti setiap absen. Foto bukti dihapus otomatis setelah 90 hari."
      />

      {notice && (
        <Alert tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      <section className="card overflow-hidden">
        {isHrOrIt && (
          <div className="card-header">
            <div className="flex gap-1" role="tablist" aria-label="Saring log">
              {[
                { v: false, label: "Semua log" },
                { v: true, label: "Perlu tinjauan HR" },
              ].map((t) => (
                <button
                  key={String(t.v)}
                  role="tab"
                  aria-selected={onlyPending === t.v}
                  onClick={() => setOnlyPending(t.v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    onlyPending === t.v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Waktu server</th>
                <th>Jenis</th>
                <th>Status</th>
                <th>Metode &amp; skor</th>
                <th>Kiosk</th>
                <th className="text-right">Bukti</th>
              </tr>
            </thead>
            <tbody>
              {logs === null && <TableMessage colSpan={7}>Memuat log absensi...</TableMessage>}
              {logs?.length === 0 && (
                <TableMessage colSpan={7}>
                  {onlyPending
                    ? "Tidak ada absen PIN yang menunggu tinjauan. Semua sudah diverifikasi."
                    : "Belum ada absen tercatat. Log muncul setelah karyawan absen di kiosk."}
                </TableMessage>
              )}
              {logs?.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="cell-primary">
                    <div className="font-semibold text-slate-900">{l.full_name}</div>
                    <div className="text-xs text-slate-500">{l.nik}</div>
                  </td>
                  <td data-label="Waktu" className="whitespace-nowrap">
                    <div className="text-slate-900">{fmtDateTime(l.recorded_at)}</div>
                    {l.is_offline_synced && (
                      <div className="text-xs text-indigo-700">Dikirim dari antrean offline</div>
                    )}
                  </td>
                  <td data-label="Jenis" className="font-medium">
                    {l.attendance_type === "check_in" ? "Masuk" : "Pulang"}
                  </td>
                  <td data-label="Status">
                    <StatusBadge value={l.status} />
                  </td>
                  <td data-label="Metode">
                    <div className="flex flex-col items-end gap-1 md:items-start">
                      <StatusBadge value={l.method} />
                      {l.match_score !== null && (
                        <span className="text-xs text-slate-500">
                          Cocok {(l.match_score * 100).toFixed(1)}% · Liveness{" "}
                          {((l.liveness_score || 0) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="Kiosk" className="text-slate-600">
                    {l.kiosk_name || "–"}
                  </td>
                  <td className="cell-actions md:text-right">
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {l.proof_photo_path && (
                        <button
                          onClick={() => openProofPhoto(l)}
                          disabled={busyId === l.id}
                          className="btn btn-secondary btn-sm"
                        >
                          <Image className="h-3.5 w-3.5" /> Foto
                        </button>
                      )}
                      {isHrOrIt && l.needs_hr_review && (
                        <button
                          onClick={() => handleHrReview(l.id)}
                          disabled={busyId === l.id}
                          className="btn btn-primary btn-sm"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verifikasi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {photo && (
        <Modal
          title={`Foto bukti · ${photo.log.full_name}`}
          description={`${photo.log.attendance_type === "check_in" ? "Masuk" : "Pulang"} · ${fmtDateTime(
            photo.log.recorded_at
          )}`}
          onClose={closePhoto}
        >
          <img
            src={photo.url}
            alt={`Foto bukti absensi ${photo.log.full_name}`}
            className="aspect-[4/3] w-full rounded-lg bg-slate-100 object-cover"
          />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={closePhoto} className="btn btn-secondary">
              Tutup
            </button>
            {isHrOrIt && photo.log.needs_hr_review && (
              <button
                onClick={() => handleHrReview(photo.log.id)}
                disabled={busyId === photo.log.id}
                className="btn btn-primary"
              >
                <CheckCircle2 className="h-4 w-4" /> Foto valid, verifikasi
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
