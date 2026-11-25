import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAttendanceEvent, ShiftRule } from "../services/attendanceEngine";

const shift: ShiftRule = {
  startTime: "08:00:00",
  endTime: "17:00:00",
  lateToleranceMinutes: 15,
  earlyLeaveToleranceMinutes: 0,
};

test("F-03: First attendance of the day is check_in (on_time within tolerance)", () => {
  const res = evaluateAttendanceEvent({
    now: new Date(2026, 10, 25, 8, 10, 0),
    todayLogs: [],
    shift,
    duplicateWindowMinutes: 5,
    checkoutMinHours: 4,
  });
  assert.equal(res.action, "record");
  if (res.action === "record") {
    assert.equal(res.attendanceType, "check_in");
    assert.equal(res.status, "on_time");
  }
});

test("F-03: Check-in after tolerance is marked late", () => {
  const res = evaluateAttendanceEvent({
    now: new Date(2026, 10, 25, 8, 25, 0),
    todayLogs: [],
    shift,
    duplicateWindowMinutes: 5,
    checkoutMinHours: 4,
  });
  assert.equal(res.action, "record");
  if (res.action === "record") {
    assert.equal(res.attendanceType, "check_in");
    assert.equal(res.status, "late");
  }
});

test("F-04: Duplicate attendance within 5 minutes is ignored", () => {
  const res = evaluateAttendanceEvent({
    now: new Date(2026, 10, 25, 8, 13, 0),
    todayLogs: [
      { attendanceType: "check_in", recordedAt: new Date(2026, 10, 25, 8, 10, 0) },
    ],
    shift,
    duplicateWindowMinutes: 5,
    checkoutMinHours: 4,
  });
  assert.equal(res.action, "ignore_duplicate");
});

test("F-03: Attendance >= 4 hours after check_in is check_out", () => {
  const res = evaluateAttendanceEvent({
    now: new Date(2026, 10, 25, 17, 5, 0),
    todayLogs: [
      { attendanceType: "check_in", recordedAt: new Date(2026, 10, 25, 8, 10, 0) },
    ],
    shift,
    duplicateWindowMinutes: 5,
    checkoutMinHours: 4,
  });
  assert.equal(res.action, "record");
  if (res.action === "record") {
    assert.equal(res.attendanceType, "check_out");
    assert.equal(res.status, "on_time");
  }
});
