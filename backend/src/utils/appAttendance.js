import { randomUUID } from 'node:crypto';
import { isOvertimeShift, localDateKey, normalizeShiftType } from './shift.js';
import { scheduledWorkMs } from '../../../frontend/src/utils/workSchedule.js';

// Chấm công bằng nút Vào / Rời văn phòng trong app. Mỗi lần rời văn phòng (tự tay hoặc tự kết thúc ca)
// lưu một dòng vào db.appAttendance để đối chiếu phiếu giờ về sau. Dữ liệu nhập từ máy chấm công
// (db.operations.attendance) vẫn được ưu tiên khi có.
const round2 = value => Math.round(value * 100) / 100;

function breakMs(emp, endMs) {
  const active = emp.isOnBreak ? Date.parse(emp.breakStartedAt || '') : NaN;
  return (Number(emp.totalBreakMs) || 0) + (Number.isFinite(active) ? Math.max(0, endMs - active) : 0);
}

/** Giờ có mặt (đã trừ giờ nghỉ) của ca đang mở tính tới endMs. */
export function openShiftHours(emp, endMs = Date.now()) {
  const start = Date.parse(emp?.checkInAt || '');
  if (!emp?.isOnSite || !Number.isFinite(start)) return 0;
  // Ca thường: chỉ giờ trong khung ca (nghỉ trưa luôn không tính); ca tăng ca: thời gian thực trừ giờ tạm nghỉ.
  if (!isOvertimeShift(emp.shiftType)) return round2(scheduledWorkMs(start, endMs) / 3600000);
  return round2(Math.max(0, endMs - start - breakMs(emp, endMs)) / 3600000);
}

/** Gọi ngay trước khi xóa thông tin ca của nhân sự. completedBreakOnly: ca tự kết thúc không tính đoạn nghỉ đang dở. */
export function recordAppAttendance(db, emp, endAt, { completedBreakOnly = false, earlyLeaveMinutes = 0 } = {}) {
  const start = Date.parse(emp?.checkInAt || '');
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const pausedMs = completedBreakOnly ? Number(emp.totalBreakMs) || 0 : breakMs(emp, end);
  const regular = !isOvertimeShift(emp.shiftType);
  const row = {
    id: randomUUID(),
    employeeId: emp.id,
    date: localDateKey(new Date(start)),
    checkInAt: emp.checkInAt,
    checkOutAt: new Date(end).toISOString(),
    breakMinutes: Math.round(pausedMs / 60000),
    // Ca thường: giờ trong khung ca (8:00–12:00, 13:30–17:30; thứ Bảy 8:00–12:00); tăng ca: thời gian thực trừ tạm nghỉ.
    hours: round2((regular ? scheduledWorkMs(start, end) : Math.max(0, end - start - pausedMs)) / 3600000),
    ...(regular ? { lateMinutes: Number(emp.lateMinutes) || 0, earlyLeaveMinutes: Math.max(0, Number(earlyLeaveMinutes) || 0) } : {}),
    shiftType: normalizeShiftType(emp.shiftType),
    source: 'app'
  };
  (db.appAttendance ||= []).push(row);
  return row;
}

/** Tổng giờ có mặt trong ngày theo app (các ca đã rời + ca đang mở). null nếu ngày đó không vào văn phòng. */
export function appAttendanceHours(db, employeeId, date, now = Date.now()) {
  const rows = (db.appAttendance || []).filter(row => row.employeeId === employeeId && row.date === date);
  const employee = (db.employees || []).find(row => row.id === employeeId);
  const open = employee?.isOnSite && employee.checkInAt && localDateKey(new Date(employee.checkInAt)) === date;
  if (!rows.length && !open) return null;
  return round2(rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0) + (open ? openShiftHours(employee, now) : 0));
}
