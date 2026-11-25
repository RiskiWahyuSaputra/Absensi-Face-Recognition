export interface ShiftRule {
  startTime: string; // "HH:MM:SS"
  endTime: string; // "HH:MM:SS"
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
}

export interface TodayLogItem {
  attendanceType: "check_in" | "check_out";
  recordedAt: Date;
}

export type AttendanceDecision =
  | {
      action: "ignore_duplicate";
      message: string;
    }
  | {
      action: "ignore_too_early_checkout";
      message: string;
    }
  | {
      action: "record";
      attendanceType: "check_in" | "check_out";
      status: "on_time" | "late" | "early_leave" | "normal";
      label: string;
    };

function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Mesin aturan absensi sesuai PRD:
 * - F-04: Absen ganda dalam < duplicateWindowMinutes (default 5 menit) diabaikan.
 * - F-03: Absen pertama hari itu = check_in (masuk); absen berikutnya setelah >= checkoutMinHours (default 4 jam) = check_out (pulang).
 * - Menghitung status ketepatan waktu (on_time, late, early_leave) berdasarkan shift & toleransi.
 */
export function evaluateAttendanceEvent(params: {
  now: Date;
  todayLogs: TodayLogItem[];
  shift: ShiftRule | null;
  duplicateWindowMinutes: number;
  checkoutMinHours: number;
}): AttendanceDecision {
  const { now, todayLogs, shift, duplicateWindowMinutes, checkoutMinHours } = params;

  // Cek duplikat dalam rentang 5 menit (F-04)
  if (todayLogs.length > 0) {
    const latest = todayLogs[todayLogs.length - 1];
    const diffMinutes = (now.getTime() - latest.recordedAt.getTime()) / 60_000;
    if (diffMinutes >= 0 && diffMinutes < duplicateWindowMinutes) {
      return {
        action: "ignore_duplicate",
        message: `Absen ganda diabaikan (Anda baru saja absen ${Math.max(1, Math.floor(diffMinutes))} menit yang lalu).`,
      };
    }
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const hasCheckIn = todayLogs.some((l) => l.attendanceType === "check_in");

  if (!hasCheckIn) {
    // Absen pertama hari ini = MASUK
    let status: "on_time" | "late" = "on_time";
    let label = "Tepat Waktu";

    if (shift) {
      const limitMinutes =
        timeStringToMinutes(shift.startTime) + shift.lateToleranceMinutes;
      if (nowMinutes > limitMinutes) {
        status = "late";
        const lateBy = nowMinutes - timeStringToMinutes(shift.startTime);
        label = `Terlambat (${lateBy} menit)`;
      }
    }

    return {
      action: "record",
      attendanceType: "check_in",
      status,
      label,
    };
  }

  // Sudah ada check_in hari ini -> cek apakah sudah >= 4 jam untuk pulang (F-03)
  const firstCheckIn = todayLogs.find((l) => l.attendanceType === "check_in")!;
  const hoursSinceCheckIn =
    (now.getTime() - firstCheckIn.recordedAt.getTime()) / 3_600_000;

  if (hoursSinceCheckIn < checkoutMinHours) {
    return {
      action: "ignore_too_early_checkout",
      message: `Anda sudah absen masuk. Absen pulang baru dapat dicatat minimal ${checkoutMinHours} jam setelah masuk.`,
    };
  }

  let status: "on_time" | "early_leave" = "on_time";
  let label = "Pulang Tepat Waktu";

  if (shift) {
    const minCheckoutMinutes =
      timeStringToMinutes(shift.endTime) - shift.earlyLeaveToleranceMinutes;
    if (nowMinutes < minCheckoutMinutes) {
      status = "early_leave";
      label = "Pulang Cepat";
    }
  }

  return {
    action: "record",
    attendanceType: "check_out",
    status,
    label,
  };
}
