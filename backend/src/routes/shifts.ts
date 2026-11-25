import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { requireAuth, requireRoles } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const [shifts, holidays] = await Promise.all([
      query("SELECT * FROM shifts ORDER BY start_time ASC"),
      query("SELECT * FROM holidays ORDER BY holiday_date ASC"),
    ]);
    res.json({ shifts: shifts.rows, holidays: holidays.rows });
  } catch (err) {
    next(err);
  }
});

const shiftSchema = z.object({
  name: z.string().min(2).max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  lateToleranceMinutes: z.number().int().min(0).max(180).default(15),
  earlyLeaveToleranceMinutes: z.number().int().min(0).max(180).default(0),
});

router.post(
  "/",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const parsed = shiftSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Data shift tidak valid" });
        return;
      }
      const d = parsed.data;
      const result = await query(
        `INSERT INTO shifts (name, start_time, end_time, late_tolerance_minutes, early_leave_tolerance_minutes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          d.name,
          d.startTime,
          d.endTime,
          d.lateToleranceMinutes,
          d.earlyLeaveToleranceMinutes,
        ]
      );
      res.status(201).json({ shift: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

const holidaySchema = z.object({
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(2).max(150),
});

router.post(
  "/holidays",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      const parsed = holidaySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Tanggal atau nama hari libur tidak valid" });
        return;
      }
      const result = await query(
        `INSERT INTO holidays (holiday_date, name)
         VALUES ($1, $2)
         ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [parsed.data.holidayDate, parsed.data.name]
      );
      res.status(201).json({ holiday: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/holidays/:id",
  requireAuth,
  requireRoles("hr_admin", "it_admin"),
  async (req, res, next) => {
    try {
      await query("DELETE FROM holidays WHERE id = $1", [req.params.id]);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
