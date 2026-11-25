import React, { useEffect, useId, useRef } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export const PageHeader: React.FC<{
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}> = ({ title, description, actions, back }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {back}
      <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
  </div>
);

type Tone = "success" | "error" | "warning" | "info";

const TONE: Record<Tone, { box: string; icon: React.ReactNode }> = {
  success: {
    box: "border-brand-200 bg-brand-50 text-brand-900",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-700" />,
  },
  error: {
    box: "border-rose-200 bg-rose-50 text-rose-900",
    icon: <XCircle className="h-4 w-4 shrink-0 text-rose-600" />,
  },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />,
  },
  info: {
    box: "border-slate-200 bg-slate-50 text-slate-800",
    icon: <Info className="h-4 w-4 shrink-0 text-slate-500" />,
  },
};

export const Alert: React.FC<{
  tone: Tone;
  children: React.ReactNode;
  onClose?: () => void;
}> = ({ tone, children, onClose }) => (
  <div
    role={tone === "error" ? "alert" : "status"}
    className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${TONE[tone].box}`}
  >
    <span className="mt-0.5">{TONE[tone].icon}</span>
    <div className="min-w-0 flex-1">{children}</div>
    {onClose && (
      <button
        onClick={onClose}
        aria-label="Tutup pesan"
        className="-m-1 rounded p-1 opacity-60 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

export type Notice = { tone: Tone; text: string } | null;

/**
 * Dialog: lembar dari bawah di ponsel, kotak di tengah mulai sm.
 * Tutup dengan Esc atau klik latar.
 */
export const Modal: React.FC<{
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
  dark?: boolean;
}> = ({ title, description, onClose, children, size = "md", dark = false }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Fokus ke elemen isian pertama, atau panel itu sendiri
    const first = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button[data-autofocus]"
    );
    (first ?? panelRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none sm:rounded-2xl sm:p-6 ${
          size === "lg" ? "sm:max-w-xl" : "sm:max-w-md"
        } ${dark ? "border border-slate-700 bg-slate-900 text-white" : "bg-white shadow-xl"}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-base font-bold sm:text-lg">
              {title}
            </h2>
            {description && (
              <p className={`mt-1 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className={`-mr-1.5 -mt-1 rounded-lg p-1.5 ${
              dark ? "text-slate-400 hover:bg-slate-800" : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }) => (
  <Modal title={title} onClose={onCancel}>
    <div className="text-sm text-slate-600">{children}</div>
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button onClick={onCancel} className="btn btn-secondary">
        Batal
      </button>
      <button
        data-autofocus
        onClick={onConfirm}
        disabled={busy}
        className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
      >
        {busy ? "Memproses..." : confirmLabel}
      </button>
    </div>
  </Modal>
);

/** Baris kosong / memuat / gagal di dalam tabel */
export const TableMessage: React.FC<{ colSpan: number; children: React.ReactNode }> = ({
  colSpan,
  children,
}) => (
  <tr>
    <td colSpan={colSpan} className="cell-empty px-5 py-10 text-center text-sm text-slate-500">
      {children}
    </td>
  </tr>
);
