import React from "react";

const STYLES: Record<string, string> = {
  on_time: "bg-brand-50 text-brand-800 ring-brand-600/20",
  late: "bg-amber-50 text-amber-800 ring-amber-600/25",
  early_leave: "bg-orange-50 text-orange-800 ring-orange-600/25",
  absent: "bg-rose-50 text-rose-700 ring-rose-600/20",
  approved: "bg-brand-50 text-brand-800 ring-brand-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  pending: "bg-slate-100 text-slate-700 ring-slate-500/20",
  consented: "bg-brand-50 text-brand-800 ring-brand-600/20",
  declined_pin_only: "bg-amber-50 text-amber-800 ring-amber-600/25",
  face: "bg-sky-50 text-sky-800 ring-sky-600/20",
  pin_fallback: "bg-violet-50 text-violet-800 ring-violet-600/20",
  manual_correction: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
};

const LABELS: Record<string, string> = {
  on_time: "Tepat Waktu",
  late: "Terlambat",
  early_leave: "Pulang Cepat",
  absent: "Belum Hadir",
  approved: "Disetujui",
  rejected: "Ditolak",
  pending: "Menunggu",
  consented: "Setuju (Wajah)",
  declined_pin_only: "Pakai PIN",
  face: "Wajah",
  pin_fallback: "PIN + Foto",
  manual_correction: "Koreksi",
};

export const StatusBadge: React.FC<{ value: string | null | undefined }> = ({ value }) => {
  if (!value) return <span className="text-xs text-slate-400">–</span>;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        STYLES[value] || "bg-slate-100 text-slate-700 ring-slate-500/20"
      }`}
    >
      {LABELS[value] || value}
    </span>
  );
};
