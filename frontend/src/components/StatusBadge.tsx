import React from "react";

const STYLES: Record<string, string> = {
  on_time: "bg-emerald-100 text-emerald-800",
  late: "bg-amber-100 text-amber-800",
  early_leave: "bg-orange-100 text-orange-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  pending: "bg-slate-200 text-slate-700",
  consented: "bg-emerald-100 text-emerald-800",
  declined_pin_only: "bg-amber-100 text-amber-800",
  face: "bg-sky-100 text-sky-800",
  pin_fallback: "bg-purple-100 text-purple-800",
  manual_correction: "bg-indigo-100 text-indigo-800",
};

const LABELS: Record<string, string> = {
  on_time: "Tepat Waktu",
  late: "Terlambat",
  early_leave: "Pulang Cepat",
  approved: "Disetujui",
  rejected: "Ditolak",
  pending: "Menunggu",
  consented: "Disetujui (Wajah)",
  declined_pin_only: "Alternatif PIN",
  face: "Wajah",
  pin_fallback: "Fallback PIN",
  manual_correction: "Koreksi",
};

export const StatusBadge: React.FC<{ value: string | null | undefined }> = ({ value }) => {
  if (!value) return <span className="text-slate-400 text-xs">-</span>;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        STYLES[value] || "bg-slate-100 text-slate-700"
      }`}
    >
      {LABELS[value] || value}
    </span>
  );
};
