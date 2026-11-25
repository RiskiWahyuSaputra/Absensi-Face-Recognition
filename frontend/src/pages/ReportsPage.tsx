import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiFetch, downloadProtectedFile } from "../lib/api";
import { Alert, Notice, PageHeader, TableMessage } from "../components/ui";
import { errMsg } from "../lib/format";

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

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

/** Angka nol ditampilkan redup agar yang bukan nol langsung terlihat */
const Num: React.FC<{ v: number; tone?: string }> = ({ v, tone = "text-slate-900" }) => (
  <span className={v === 0 ? "text-slate-300" : `font-semibold ${tone}`}>{v}</span>
);

export const ReportsPage: React.FC = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [workdays, setWorkdays] = useState<number | null>(null);
  const [rows, setRows] = useState<RecapRow[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);

  useEffect(() => {
    if (!month) return;
    setRows(null);
    apiFetch<{ month: string; workdays: number; rows: RecapRow[] }>(`/reports/monthly?month=${month}`)
      .then((res) => {
        setWorkdays(res.workdays);
        setRows(res.rows);
      })
      .catch((e) => {
        setRows([]);
        setNotice({ tone: "error", text: errMsg(e, "Gagal memuat rekap") });
      });
  }, [month]);

  async function exportFile(format: "xlsx" | "csv") {
    setExporting(format);
    try {
      await downloadProtectedFile(
        `/reports/monthly/export?month=${month}&format=${format}`,
        `rekap-absensi-${month}.${format}`
      );
    } catch (e) {
      setNotice({ tone: "error", text: errMsg(e, "Gagal mengunduh file") });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rekap Bulanan"
        description={
          workdays !== null && month ? (
            <>
              {monthLabel(month)} · <strong className="text-slate-700">{workdays} hari kerja efektif</strong>
            </>
          ) : (
            "Rekap kehadiran per karyawan untuk penggajian."
          )
        }
        actions={
          <>
            <label htmlFor="month" className="sr-only">
              Bulan
            </label>
            <input
              id="month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input w-auto py-2"
            />
            <button onClick={() => exportFile("xlsx")} disabled={!!exporting} className="btn btn-primary">
              <Download className="h-4 w-4" />
              {exporting === "xlsx" ? "Mengunduh..." : "Excel"}
            </button>
            <button onClick={() => exportFile("csv")} disabled={!!exporting} className="btn btn-secondary">
              <Download className="h-4 w-4" />
              {exporting === "csv" ? "Mengunduh..." : "CSV"}
            </button>
          </>
        }
      />

      {notice && (
        <Alert tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Shift</th>
                <th className="text-right">Hadir</th>
                <th className="text-right">Terlambat</th>
                <th className="text-right">Pulang cepat</th>
                <th className="text-right">Pakai PIN</th>
                <th className="text-right">Tidak hadir</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && <TableMessage colSpan={7}>Memuat rekap {monthLabel(month)}...</TableMessage>}
              {rows?.length === 0 && (
                <TableMessage colSpan={7}>Belum ada data kehadiran untuk {monthLabel(month)}.</TableMessage>
              )}
              {rows?.map((r) => (
                <tr key={r.nik} className="hover:bg-slate-50/70">
                  <td className="cell-primary">
                    <div className="font-semibold text-slate-900">{r.fullName}</div>
                    <div className="text-xs text-slate-500">
                      {r.nik} · {r.department}
                    </div>
                  </td>
                  <td data-label="Shift" className="text-slate-600">
                    {r.shiftName}
                  </td>
                  <td data-label="Hadir" className="md:text-right">
                    <Num v={r.presentDays} tone="text-brand-700" />
                  </td>
                  <td data-label="Terlambat" className="md:text-right">
                    <Num v={r.lateDays} tone="text-amber-700" />
                  </td>
                  <td data-label="Pulang cepat" className="md:text-right">
                    <Num v={r.earlyLeaveDays} tone="text-orange-700" />
                  </td>
                  <td data-label="Pakai PIN" className="md:text-right">
                    <Num v={r.pinFallbackCount} tone="text-violet-700" />
                  </td>
                  <td data-label="Tidak hadir" className="md:text-right">
                    <Num v={r.absentDays} tone="text-rose-700" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
