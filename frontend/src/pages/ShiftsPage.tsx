import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Alert, ConfirmDialog, Notice, PageHeader } from "../components/ui";
import { errMsg, fmtLongDate } from "../lib/format";

interface ShiftRow {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  early_leave_tolerance_minutes: number;
}

interface HolidayRow {
  id: string;
  holiday_date: string;
  name: string;
}

const EMPTY_SHIFT = {
  name: "",
  startTime: "08:00",
  endTime: "17:00",
  lateToleranceMinutes: 15,
  earlyLeaveToleranceMinutes: 0,
};

export const ShiftsPage: React.FC = () => {
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT);
  const [holidayForm, setHolidayForm] = useState({ holidayDate: "", name: "" });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"shift" | "holiday" | "delete" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | null>(null);

  async function load() {
    try {
      const res = await apiFetch<{ shifts: ShiftRow[]; holidays: HolidayRow[] }>("/shifts");
      setShifts(res.shifts);
      setHolidays(res.holidays);
    } catch (e) {
      setShifts([]);
      setNotice({ tone: "error", text: errMsg(e, "Gagal memuat shift") });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addShift(e: React.FormEvent) {
    e.preventDefault();
    setBusy("shift");
    try {
      await apiFetch("/shifts", {
        method: "POST",
        body: JSON.stringify({
          ...shiftForm,
          lateToleranceMinutes: Number(shiftForm.lateToleranceMinutes),
          earlyLeaveToleranceMinutes: Number(shiftForm.earlyLeaveToleranceMinutes),
        }),
      });
      setNotice({ tone: "success", text: `Shift "${shiftForm.name}" ditambahkan.` });
      setShiftForm(EMPTY_SHIFT);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menambah shift") });
    } finally {
      setBusy(null);
    }
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    setBusy("holiday");
    try {
      await apiFetch("/shifts/holidays", { method: "POST", body: JSON.stringify(holidayForm) });
      setNotice({ tone: "success", text: `Hari libur "${holidayForm.name}" ditambahkan.` });
      setHolidayForm({ holidayDate: "", name: "" });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menambah hari libur") });
    } finally {
      setBusy(null);
    }
  }

  async function removeHoliday() {
    if (!deleteTarget) return;
    setBusy("delete");
    try {
      await apiFetch(`/shifts/holidays/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: errMsg(err, "Gagal menghapus hari libur") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shift & Hari Libur"
        description="Jam masuk, jam pulang, toleransi keterlambatan, dan kalender libur yang dipakai untuk menghitung status absen."
      />

      {notice && (
        <Alert tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Shift */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Shift kerja</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {shifts === null && <li className="px-5 py-6 text-sm text-slate-500">Memuat shift...</li>}
            {shifts?.length === 0 && (
              <li className="px-5 py-6 text-sm text-slate-500">Belum ada shift. Tambahkan di bawah.</li>
            )}
            {shifts?.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    Toleransi terlambat {s.late_tolerance_minutes} menit
                    {s.early_leave_tolerance_minutes > 0 &&
                      ` · pulang cepat ${s.early_leave_tolerance_minutes} menit`}
                  </div>
                </div>
                <div className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-800">
                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                </div>
              </li>
            ))}
          </ul>

          <form onSubmit={addShift} className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <div className="col-span-2 text-xs font-semibold text-slate-700">Tambah shift</div>
            <div className="col-span-2">
              <label htmlFor="s-name" className="sr-only">Nama shift</label>
              <input
                id="s-name"
                required
                placeholder="Nama shift, mis. Shift Pagi"
                value={shiftForm.name}
                onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="s-start" className="field-label">Masuk</label>
              <input id="s-start" type="time" required value={shiftForm.startTime}
                onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} className="input" />
            </div>
            <div>
              <label htmlFor="s-end" className="field-label">Pulang</label>
              <input id="s-end" type="time" required value={shiftForm.endTime}
                onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} className="input" />
            </div>
            <div>
              <label htmlFor="s-late" className="field-label">Toleransi terlambat (menit)</label>
              <input id="s-late" type="number" min={0} value={shiftForm.lateToleranceMinutes}
                onChange={(e) => setShiftForm({ ...shiftForm, lateToleranceMinutes: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label htmlFor="s-early" className="field-label">Toleransi pulang cepat (menit)</label>
              <input id="s-early" type="number" min={0} value={shiftForm.earlyLeaveToleranceMinutes}
                onChange={(e) => setShiftForm({ ...shiftForm, earlyLeaveToleranceMinutes: Number(e.target.value) })} className="input" />
            </div>
            <button type="submit" disabled={busy === "shift"} className="btn btn-primary col-span-2 sm:col-span-1 sm:justify-self-start">
              <Plus className="h-4 w-4" /> {busy === "shift" ? "Menyimpan..." : "Tambah shift"}
            </button>
          </form>
        </section>

        {/* Hari libur */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Hari libur</h2>
            <span className="text-xs text-slate-500">{holidays.length} tanggal</span>
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {shifts !== null && holidays.length === 0 && (
              <li className="px-5 py-6 text-sm text-slate-500">
                Belum ada hari libur. Tanggal yang ditambahkan tidak dihitung sebagai hari kerja.
              </li>
            )}
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{h.name}</div>
                  <div className="text-xs text-slate-500">{fmtLongDate(h.holiday_date)}</div>
                </div>
                <button
                  onClick={() => setDeleteTarget(h)}
                  aria-label={`Hapus ${h.name}`}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={addHoliday} className="grid gap-3 border-t border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-end sm:p-5">
            <div className="text-xs font-semibold text-slate-700 sm:col-span-3">Tambah hari libur</div>
            <div>
              <label htmlFor="h-date" className="sr-only">Tanggal</label>
              <input id="h-date" type="date" required value={holidayForm.holidayDate}
                onChange={(e) => setHolidayForm({ ...holidayForm, holidayDate: e.target.value })} className="input" />
            </div>
            <div>
              <label htmlFor="h-name" className="sr-only">Nama hari libur</label>
              <input id="h-name" required placeholder="Nama hari libur" value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} className="input" />
            </div>
            <button type="submit" disabled={busy === "holiday"} className="btn btn-dark">
              <Plus className="h-4 w-4" /> Tambah
            </button>
          </form>
        </section>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Hapus hari libur?"
          confirmLabel="Hapus"
          danger
          busy={busy === "delete"}
          onConfirm={removeHoliday}
          onCancel={() => setDeleteTarget(null)}
        >
          <strong className="text-slate-900">{deleteTarget.name}</strong> ({fmtLongDate(deleteTarget.holiday_date)})
          akan kembali dihitung sebagai hari kerja.
        </ConfirmDialog>
      )}
    </div>
  );
};
