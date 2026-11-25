import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiFetch, downloadProtectedFile } from "../lib/api";

interface RecapRow {
  nik: string;
  fullName: string;
  department: string;
  shiftName: string;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  pinFallbackCount: number;
  absentDays: number;
}

export const ReportsPage: React.FC = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [workdays, setWorkdays] = useState(0);
  const [rows, setRows] = useState<RecapRow[]>([]);

  useEffect(() => {
    apiFetch<{ month: string; workdays: number; rows: RecapRow[] }>(
      `/reports/monthly?month=${month}`
    ).then((res) => {
      setWorkdays(res.workdays);
      setRows(res.rows);
    });
  }, [month]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rekap Bulanan &amp; Ekspor HR</h1>
          <p className="text-sm text-slate-500">
            Hari kerja efektif bulan {month}: <strong>{workdays} hari</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          />
          <button
            onClick={() =>
              downloadProtectedFile(
                `/reports/monthly/export?month=${month}&format=xlsx`,
                `rekap-absensi-${month}.xlsx`
              )
            }
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Ekspor Excel (.xlsx)
          </button>
          <button
            onClick={() =>
              downloadProtectedFile(
                `/reports/monthly/export?month=${month}&format=csv`,
                `rekap-absensi-${month}.csv`
              )
            }
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Ekspor CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-5 py-3">NIK / Nama</th>
                <th className="px-5 py-3">Departemen</th>
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3 text-center">Hadir</th>
                <th className="px-5 py-3 text-center">Terlambat</th>
                <th className="px-5 py-3 text-center">Pulang Cepat</th>
                <th className="px-5 py-3 text-center">Fallback PIN</th>
                <th className="px-5 py-3 text-center">Tidak Hadir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.nik}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{r.fullName}</div>
                    <div className="text-xs text-slate-500">{r.nik}</div>
                  </td>
                  <td className="px-5 py-3">{r.department}</td>
                  <td className="px-5 py-3">{r.shiftName}</td>
                  <td className="px-5 py-3 text-center font-semibold text-emerald-700">
                    {r.presentDays}
                  </td>
                  <td className="px-5 py-3 text-center text-amber-700">{r.lateDays}</td>
                  <td className="px-5 py-3 text-center text-orange-700">{r.earlyLeaveDays}</td>
                  <td className="px-5 py-3 text-center text-purple-700">{r.pinFallbackCount}</td>
                  <td className="px-5 py-3 text-center text-rose-700">{r.absentDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
