import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "../lib/api";

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

export const ShiftsPage: React.FC = () => {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [shiftForm, setShiftForm] = useState({
    name: "",
    startTime: "08:00",
    endTime: "17:00",
    lateToleranceMinutes: 15,
    earlyLeaveToleranceMinutes: 0,
  });
  const [holidayForm, setHolidayForm] = useState({ holidayDate: "", name: "" });

  async function load() {
    const res = await apiFetch<{ shifts: ShiftRow[]; holidays: HolidayRow[] }>("/shifts");
    setShifts(res.shifts);
    setHolidays(res.holidays);
  }

  useEffect(() => {
    load();
  }, []);

  async function addShift(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch("/shifts", {
      method: "POST",
      body: JSON.stringify({
        ...shiftForm,
        lateToleranceMinutes: Number(shiftForm.lateToleranceMinutes),
        earlyLeaveToleranceMinutes: Number(shiftForm.earlyLeaveToleranceMinutes),
      }),
    });
    setShiftForm({
      name: "",
      startTime: "08:00",
      endTime: "17:00",
      lateToleranceMinutes: 15,
      earlyLeaveToleranceMinutes: 0,
    });
    load();
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch("/shifts/holidays", {
      method: "POST",
      body: JSON.stringify(holidayForm),
    });
    setHolidayForm({ holidayDate: "", name: "" });
    load();
  }

  async function removeHoliday(id: string) {
    await apiFetch(`/shifts/holidays/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Aturan Jam Kerja, Shift &amp; Hari Libur</h1>
        <p className="text-sm text-slate-500">
          Atur jam masuk, jam pulang, toleransi keterlambatan, dan kalender hari libur kantor.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shifts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Daftar Shift</h2>
          <div className="space-y-2">
            {shifts.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-sm"
              >
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} · Toleransi terlambat{" "}
                    {s.late_tolerance_minutes} mnt
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={addShift} className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Nama Shift Baru"
              value={shiftForm.name}
              onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
              className="col-span-2 px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="time"
              required
              value={shiftForm.startTime}
              onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="time"
              required
              value={shiftForm.endTime}
              onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="number"
              min={0}
              placeholder="Toleransi Terlambat (mnt)"
              value={shiftForm.lateToleranceMinutes}
              onChange={(e) =>
                setShiftForm({ ...shiftForm, lateToleranceMinutes: Number(e.target.value) })
              }
              className="col-span-2 px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <button
              type="submit"
              className="col-span-2 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium cursor-pointer"
            >
              Tambah Shift
            </button>
          </form>
        </div>

        {/* Holidays */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Hari Libur Nasional / Kantor</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {holidays.map((h) => (
              <div
                key={h.id}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-sm"
              >
                <div>
                  <div className="font-medium">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.holiday_date.slice(0, 10)}</div>
                </div>
                <button
                  onClick={() => removeHoliday(h.id)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {holidays.length === 0 && (
              <div className="text-xs text-slate-400">Belum ada hari libur ditambahkan.</div>
            )}
          </div>

          <form onSubmit={addHoliday} className="pt-4 border-t border-slate-200 space-y-3">
            <input
              type="date"
              required
              value={holidayForm.holidayDate}
              onChange={(e) => setHolidayForm({ ...holidayForm, holidayDate: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              required
              placeholder="Nama Hari Libur"
              value={holidayForm.name}
              onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-slate-900 text-white text-sm font-medium cursor-pointer"
            >
              Tambah Hari Libur
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
