import React, { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, Modal, Notice, PageHeader, TableMessage } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { errMsg, fmtDateTime, fmtShortDate, fmtTime } from "../lib/format";

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

type Decision = "approved" | "rejected";

export const CorrectionsPage: React.FC = () => {
  const { user } = useAuth();
  const canApprove =
    user?.role === "supervisor" || user?.role === "hr_admin" || user?.role === "it_admin";

  const [list, setList] = useState<CorrectionRow[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [showForm, setShowForm] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceType, setAttendanceType] = useState<"check_in" | "check_out">("check_in");
  const [timeStr, setTimeStr] = useState("08:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [review, setReview] = useState<{ row: CorrectionRow; decision: Decision } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  async function load() {
    try {
      const res = await apiFetch<{ corrections: CorrectionRow[] }>("/corrections");
      setList(res.corrections);
    } catch (e) {
      setList([]);
      setNotice({ tone: "error", text: errMsg(e, "Gagal memuat koreksi") });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const requestedTime = new Date(`${attendanceDate}T${timeStr}:00`).toISOString();
      await apiFetch("/corrections", {
        method: "POST",
        body: JSON.stringify({ attendanceDate, attendanceType, requestedTime, reason }),
      });
      setShowForm(false);
      setReason("");
      setNotice({ tone: "success", text: "Pengajuan koreksi terkirim dan menunggu persetujuan atasan." });
      load();
    } catch (err) {
      setFormError(errMsg(err, "Gagal mengirim pengajuan"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!review) return;
    setSubmitting(true);
    try {
      await apiFetch(`/corrections/${review.row.id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: review.decision, reviewNote: reviewNote.trim() || undefined }),
      });
      setNotice({
        tone: "success",
        text: `Koreksi ${review.row.full_name} ${review.decision === "approved" ? "disetujui" : "ditolak"}.`,
      });
      setReview(null);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menyimpan keputusan") });
    } finally {
      setSubmitting(false);
    }
  }

  function openReview(row: CorrectionRow, decision: Decision) {
    setReviewNote("");
    setReview({ row, decision });
  }

  const pendingCount = list?.filter((c) => c.status === "pending").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Koreksi Absen"
        description="Ajukan perbaikan jam absen yang terlewat. Setiap pengajuan dan keputusan tercatat lengkap: siapa, kapan, dan alasannya."
        actions={
          <button
            onClick={() => {
              setFormError("");
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" /> Ajukan koreksi
          </button>
        }
      />

      {notice && (
        <Alert tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Daftar pengajuan</h2>
          {canApprove && pendingCount > 0 && (
            <span className="text-xs font-semibold text-amber-700">{pendingCount} menunggu keputusan</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Diajukan untuk</th>
                <th>Alasan</th>
                <th>Status</th>
                <th>Peninjau</th>
                {canApprove && <th className="text-right">Keputusan</th>}
              </tr>
            </thead>
            <tbody>
              {list === null && <TableMessage colSpan={6}>Memuat pengajuan...</TableMessage>}
              {list?.length === 0 && (
                <TableMessage colSpan={6}>
                  Belum ada pengajuan. Klik "Ajukan koreksi" bila ada absen yang terlewat.
                </TableMessage>
              )}
              {list?.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="cell-primary">
                    <div className="font-semibold text-slate-900">{c.full_name}</div>
                    <div className="text-xs text-slate-500">{c.nik}</div>
                  </td>
                  <td data-label="Untuk" className="whitespace-nowrap">
                    <div className="font-medium text-slate-900">
                      {c.attendance_type === "check_in" ? "Masuk" : "Pulang"} {fmtTime(c.requested_time)}
                    </div>
                    <div className="text-xs text-slate-500">{fmtShortDate(c.attendance_date)}</div>
                  </td>
                  <td data-label="Alasan" className="text-slate-700 md:max-w-xs">
                    {c.reason}
                  </td>
                  <td data-label="Status">
                    <StatusBadge value={c.status} />
                  </td>
                  <td data-label="Peninjau" className="text-xs text-slate-600">
                    {c.reviewed_by_name ? (
                      <>
                        <div className="font-medium text-slate-800">{c.reviewed_by_name}</div>
                        {c.reviewed_at && <div>{fmtDateTime(c.reviewed_at)}</div>}
                        {c.review_note && <div className="mt-0.5 italic">"{c.review_note}"</div>}
                      </>
                    ) : (
                      "Belum ditinjau"
                    )}
                  </td>
                  {canApprove && (
                    <td className="cell-actions md:text-right">
                      {c.status === "pending" && (
                        <div className="flex gap-2 md:justify-end">
                          <button onClick={() => openReview(c, "approved")} className="btn btn-primary btn-sm">
                            <Check className="h-3.5 w-3.5" /> Setujui
                          </button>
                          <button onClick={() => openReview(c, "rejected")} className="btn btn-danger-soft btn-sm">
                            <X className="h-3.5 w-3.5" /> Tolak
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <Modal
          title="Ajukan koreksi absen"
          description="Atasan akan meninjau pengajuan ini."
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <Alert tone="error">{formError}</Alert>}
            <fieldset>
              <legend className="field-label">Jenis absen</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["check_in", "Masuk"],
                    ["check_out", "Pulang"],
                  ] as const
                ).map(([v, label]) => (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600 ${
                      attendanceType === v
                        ? "border-brand-600 bg-brand-50 text-brand-800"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="attendanceType"
                      value={v}
                      checked={attendanceType === v}
                      onChange={() => setAttendanceType(v)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="corr-date" className="field-label">
                  Tanggal
                </label>
                <input
                  id="corr-date"
                  type="date"
                  required
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="corr-time" className="field-label">
                  Jam sebenarnya
                </label>
                <input
                  id="corr-time"
                  type="time"
                  required
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label htmlFor="corr-reason" className="field-label">
                Alasan
              </label>
              <textarea
                id="corr-reason"
                required
                minLength={5}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Jelaskan kenapa absen terlewat"
                className="input"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">
                Batal
              </button>
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? "Mengirim..." : "Kirim pengajuan"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {review && (
        <Modal
          title={review.decision === "approved" ? "Setujui koreksi" : "Tolak koreksi"}
          description={`${review.row.full_name} · ${
            review.row.attendance_type === "check_in" ? "Masuk" : "Pulang"
          } ${fmtTime(review.row.requested_time)}, ${fmtShortDate(review.row.attendance_date)}`}
          onClose={() => setReview(null)}
        >
          <form onSubmit={submitReview} className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">"{review.row.reason}"</div>
            <div>
              <label htmlFor="review-note" className="field-label">
                {review.decision === "approved" ? "Catatan (opsional)" : "Alasan penolakan"}
              </label>
              <textarea
                id="review-note"
                rows={3}
                required={review.decision === "rejected"}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="input"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setReview(null)} className="btn btn-secondary">
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`btn ${review.decision === "approved" ? "btn-primary" : "btn-danger"}`}
              >
                {submitting ? "Menyimpan..." : review.decision === "approved" ? "Setujui" : "Tolak"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
