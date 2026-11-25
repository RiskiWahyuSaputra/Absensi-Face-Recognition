import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { apiFetch } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, PageHeader, TableMessage } from "../components/ui";
import { errMsg, fmtLongDate, fmtTime } from "../lib/format";

interface TodaySummary {
  date: string;
  stats: {
    totalEmployees: number;
    presentCount: number;
    lateCount: number;
    notPresentCount: number;
    pendingReviewCount: number;
  };
  employees: Array<{
    employee_id: string;
    nik: string;
    full_name: string;
    department: string;
    shift_name: string | null;
    check_in_at: string | null;
    check_in_status: string | null;
    check_in_method: string | null;
    check_out_at: string | null;
    check_out_status: string | null;
    needs_hr_review: boolean;
  }>;
}

type Filter = "all" | "absent" | "late" | "review";

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<TodaySummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<TodaySummary>("/attendance/today-summary"));
    } catch (e) {
      setError(errMsg(e, "Gagal memuat kehadiran hari ini"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.employees.filter((e) => {
      if (filter === "absent" && e.check_in_at) return false;
      if (filter === "late" && e.check_in_status !== "late") return false;
      if (filter === "review" && !e.needs_hr_review) return false;
      if (!q) return true;
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
      );
    });
  }, [data, filter, query]);

  const s = data?.stats;
  const presentPct = s && s.totalEmployees > 0 ? Math.round((s.presentCount / s.totalEmployees) * 100) : 0;

  const filters: Array<{ key: Filter; label: string; count?: number }> = [
    { key: "all", label: "Semua", count: s?.totalEmployees },
    { key: "absent", label: "Belum hadir", count: s?.notPresentCount },
    { key: "late", label: "Terlambat", count: s?.lateCount },
    { key: "review", label: "Perlu tinjauan", count: s?.pendingReviewCount },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kehadiran Hari Ini"
        description={data ? fmtLongDate(data.date) : "Memuat tanggal..."}
        actions={
          <button onClick={load} disabled={loading} className="btn btn-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Muat ulang
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {s && (
        <section className="card grid grid-cols-3 gap-px overflow-hidden bg-slate-200 lg:grid-cols-4">
          {/* Ringkasan utama: proporsi hadir */}
          <div className="col-span-3 bg-white p-4 sm:p-5 lg:col-span-1">
            <div className="text-xs font-semibold text-slate-500">Sudah hadir</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-slate-900">{s.presentCount}</span>
              <span className="text-sm text-slate-500">dari {s.totalEmployees} karyawan</span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={presentPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Persentase kehadiran"
            >
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${presentPct}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-slate-500">{presentPct}% hadir</div>
          </div>
          <StatButton
            label="Belum hadir"
            value={s.notPresentCount}
            tone="text-rose-700"
            active={filter === "absent"}
            onClick={() => setFilter(filter === "absent" ? "all" : "absent")}
          />
          <StatButton
            label="Terlambat"
            value={s.lateCount}
            tone="text-amber-700"
            active={filter === "late"}
            onClick={() => setFilter(filter === "late" ? "all" : "late")}
          />
          <StatButton
            label="Perlu tinjauan"
            value={s.pendingReviewCount}
            tone="text-violet-700"
            active={filter === "review"}
            onClick={() => setFilter(filter === "review" ? "all" : "review")}
            hint={
              s.pendingReviewCount > 0 ? (
                <Link to="/attendance" className="font-semibold text-brand-700 hover:underline">
                  Tinjau foto bukti
                </Link>
              ) : (
                "Tidak ada antrean"
              )
            }
          />
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="card-header">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Saring karyawan">
            {filters.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f.label}
                {f.count !== undefined && (
                  <span className={filter === f.key ? "ml-1.5 text-slate-300" : "ml-1.5 text-slate-400"}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, NIK, departemen"
              aria-label="Cari karyawan"
              className="input py-2 pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Karyawan</th>
              <th>Status</th>
              <th>Masuk</th>
              <th>Pulang</th>
              <th>Metode</th>
              <th>Shift</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && <TableMessage colSpan={6}>Memuat data kehadiran...</TableMessage>}
            {data && rows.length === 0 && (
              <TableMessage colSpan={6}>
                {data.employees.length === 0
                  ? "Belum ada karyawan aktif. Tambahkan karyawan di menu Karyawan & Wajah."
                  : "Tidak ada karyawan yang cocok dengan saringan ini."}
              </TableMessage>
            )}
            {rows.map((e) => (
              <tr key={e.employee_id} className="hover:bg-slate-50/70">
                <td className="cell-primary">
                  <div className="font-semibold text-slate-900">{e.full_name}</div>
                  <div className="text-xs text-slate-500">
                    {e.nik} · {e.department}
                  </div>
                </td>
                <td data-label="Status">
                  <StatusBadge value={e.check_in_at ? e.check_in_status : "absent"} />
                </td>
                <td data-label="Masuk" className="font-medium text-slate-900">
                  {fmtTime(e.check_in_at)}
                </td>
                <td data-label="Pulang" className="text-slate-700">
                  {fmtTime(e.check_out_at)}
                </td>
                <td data-label="Metode">
                  <StatusBadge value={e.check_in_method} />
                </td>
                <td data-label="Shift" className="text-slate-600">
                  {e.shift_name || "–"}
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

const StatButton: React.FC<{
  label: string;
  value: number;
  tone: string;
  active: boolean;
  onClick: () => void;
  hint?: React.ReactNode;
}> = ({ label, value, tone, active, onClick, hint }) => (
  <div className={`relative p-4 transition-colors sm:p-5 ${active ? "bg-slate-50" : "bg-white hover:bg-slate-50"}`}>
    <button
      onClick={onClick}
      aria-pressed={active}
      className="absolute inset-0"
      aria-label={`Saring: ${label}`}
    />
    <div className="text-xs font-semibold leading-snug text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-bold sm:text-3xl ${tone}`}>{value}</div>
    <div className="relative mt-2 hidden text-xs text-slate-500 sm:block">
      {hint ?? (active ? "Sedang disaring · klik untuk semua" : "Klik untuk menyaring")}
    </div>
  </div>
);
