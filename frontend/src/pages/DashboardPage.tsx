import React, { useEffect, useState } from "react";
import { Users, CheckCircle, Clock, UserX, AlertCircle } from "lucide-react";
import { apiFetch } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";

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

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<TodaySummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<TodaySummary>("/attendance/today-summary")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="p-4 bg-rose-50 text-rose-700 rounded-xl">{error}</div>;
  if (!data) return <div className="text-slate-500">Memuat dashboard kehadiran...</div>;

  const cards = [
    {
      label: "Total Karyawan Aktif",
      value: data.stats.totalEmployees,
      icon: <Users className="w-5 h-5 text-slate-600" />,
      bg: "bg-white",
    },
    {
      label: "Hadir Hari Ini",
      value: data.stats.presentCount,
      icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
      bg: "bg-white",
    },
    {
      label: "Terlambat",
      value: data.stats.lateCount,
      icon: <Clock className="w-5 h-5 text-amber-600" />,
      bg: "bg-white",
    },
    {
      label: "Belum Hadir",
      value: data.stats.notPresentCount,
      icon: <UserX className="w-5 h-5 text-rose-600" />,
      bg: "bg-white",
    },
    {
      label: "Perlu Tinjauan HR (PIN)",
      value: data.stats.pendingReviewCount,
      icon: <AlertCircle className="w-5 h-5 text-purple-600" />,
      bg: "bg-white",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Kehadiran Hari Ini</h1>
        <p className="text-sm text-slate-500">Tanggal: {data.date}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`${c.bg} p-5 rounded-xl border border-slate-200 shadow-xs`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">{c.label}</span>
              {c.icon}
            </div>
            <div className="text-2xl font-bold text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 font-semibold text-slate-800">
          Status Kehadiran Real-Time
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-5 py-3">NIK / Nama</th>
                <th className="px-5 py-3">Departemen</th>
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3">Masuk</th>
                <th className="px-5 py-3">Pulang</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Metode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.employees.map((e) => (
                <tr key={e.employee_id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{e.full_name}</div>
                    <div className="text-xs text-slate-500">{e.nik}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{e.department}</td>
                  <td className="px-5 py-3 text-slate-600">{e.shift_name || "-"}</td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {e.check_in_at
                      ? new Date(e.check_in_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {e.check_out_at
                      ? new Date(e.check_out_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td className="px-5 py-3">
                    {e.check_in_at ? (
                      <StatusBadge value={e.check_in_status} />
                    ) : (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs bg-rose-50 text-rose-700 font-medium">
                        Belum Hadir
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge value={e.check_in_method} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
