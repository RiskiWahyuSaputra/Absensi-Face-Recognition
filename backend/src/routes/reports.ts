import { Router } from "express";
import { query } from "../config/db";
import { requireAuth, requireRoles } from "../middleware/auth";
import {
  generateRecapCsv,
  generateRecapExcelBuffer,
  MonthlyRecapRow,
} from "../services/exportService";

const router = Router();

function countWorkdaysInMonth(year: number, monthIndex0: number, holidaySet: Set<string>): number {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  let workdays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, monthIndex0, day);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (holidaySet.has(iso)) continue;
    workdays++;
  }
  return workdays;
}

async function buildMonthlyRecap(monthStr: string): Promise<{
  month: string;
  workdays: number;
  rows: MonthlyRecapRow[];
}> {
  const [yearStr, mStr] = monthStr.split("-");
  const year = Number(yearStr);
  const monthNum = Number(mStr);
  const startDate = `${yearStr}-${mStr}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const endDate = `${yearStr}-${mStr}-${String(lastDay).padStart(2, "0")}`;

  const holidaysRes = await query<{ holiday_date: Date }>(
    "SELECT holiday_date FROM holidays WHERE holiday_date >= $1 AND holiday_date <= $2",
    [startDate, endDate]
  );
  const holidaySet = new Set(
    holidaysRes.rows.map((r) => new Date(r.holiday_date).toISOString().slice(0, 10))
  );
  const workdays = countWorkdaysInMonth(year, monthNum - 1, holidaySet);

  const res = await query<{
    nik: string;
    full_name: string;
    department: string;
    shift_name: string | null;
    present_days: string;
    late_days: string;
    early_leave_days: string;
    pin_fallback_count: string;
  }>(
    `SELECT e.nik, e.full_name, e.department, COALESCE(s.name, '-') AS shift_name,
            COUNT(DISTINCT CASE WHEN al.attendance_type = 'check_in' THEN al.attendance_date END) AS present_days,
            COUNT(DISTINCT CASE WHEN al.attendance_type = 'check_in' AND al.status = 'late' THEN al.attendance_date END) AS late_days,
            COUNT(DISTINCT CASE WHEN al.attendance_type = 'check_out' AND al.status = 'early_leave' THEN al.attendance_date END) AS early_leave_days,
            COUNT(CASE WHEN al.method = 'pin_fallback' THEN 1 END) AS pin_fallback_count
     FROM employees e
     LEFT JOIN shifts s ON s.id = e.shift_id
     LEFT JOIN attendance_logs al
       ON al.employee_id = e.id
      AND al.attendance_date >= $1
      AND al.attendance_date <= $2
     WHERE e.is_active = TRUE
     GROUP BY e.id, s.name
     ORDER BY e.full_name ASC`,
    [startDate, endDate]
  );

  const rows: MonthlyRecapRow[] = res.rows.map((r) => {
    const presentDays = Number(r.present_days);
    return {
      nik: r.nik,
      fullName: r.full_name,
      department: r.department,
      shiftName: r.shift_name || "-",
      presentDays,
      lateDays: Number(r.late_days),
      earlyLeaveDays: Number(r.early_leave_days),
      pinFallbackCount: Number(r.pin_fallback_count),
      absentDays: Math.max(0, workdays - presentDays),
    };
  });

  return { month: monthStr, workdays, rows };
}

router.get(
  "/monthly",
  requireAuth,
  requireRoles("hr_admin", "it_admin", "supervisor"),
  async (req, res, next) => {
    try {
      const month =
        (req.query.month as string) || new Date().toISOString().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) {
        res.status(400).json({ error: "Format bulan harus YYYY-MM" });
        return;
      }
      const recap = await buildMonthlyRecap(month);
      res.json(recap);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Ekspor rekap bulanan ke Excel (.xlsx) atau CSV (Tujuan PRD: rekap < 10 menit).
 */
router.get(
  "/monthly/export",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const month =
        (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const format = ((req.query.format as string) || "xlsx").toLowerCase();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        res.status(400).json({ error: "Format bulan harus YYYY-MM" });
        return;
      }

      const recap = await buildMonthlyRecap(month);

      if (format === "csv") {
        const csv = generateRecapCsv(recap.rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="rekap-absensi-${month}.csv"`
        );
        res.send(csv);
        return;
      }

      const buffer = await generateRecapExcelBuffer(month, recap.rows);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="rekap-absensi-${month}.xlsx"`
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
