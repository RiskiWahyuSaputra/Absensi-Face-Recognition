export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2026-11-25" atau ISO → "Rabu, 25 November 2026" */
export function fmtLongDate(dateLike: string | Date): string {
  const d = typeof dateLike === "string" ? new Date(dateLike.slice(0, 10) + "T00:00:00") : dateLike;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function fmtShortDate(dateLike: string): string {
  return new Date(dateLike.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
