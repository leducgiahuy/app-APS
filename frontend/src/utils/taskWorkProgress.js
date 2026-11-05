import { assignmentWorkingDates, assignmentWorkingDayUnits, workingDayWeight } from './assignmentCalendar.js';
import { dayWorkHours, scheduledWorkHours, vnDateKey } from './workSchedule.js';
import { isOvertimeShift } from './shift.js';
import { varianceTone } from './deliveryMetrics.js';

const percentOf = (part, whole) => whole > 0 ? Math.max(0, Math.min(100, Math.floor(part / whole * 100 + 1e-9))) : 0;

/**
 * Tiến độ theo giờ làm của một task (trang Công việc), áp cho mọi task — một nguồn duy nhất:
 * - kế hoạch = ngày công trong phân công (thứ 7 = nửa ngày) × giờ/ngày được phân công (không có thì ca chuẩn);
 * - THANH (progress) = giờ làm thật: giờ các phiên đã chốt (actualWorkEntries) + phiên đang chạy khi người đó
 *   đang trong ca và đang chọn task này (ca thường chỉ đếm giờ trong khung ca, nghỉ trưa không tính).
 *   Đổi task, tạm nghỉ hay hết ca → thanh đứng yên, không bao giờ tự nhảy;
 * - VẠCH KẾ HOẠCH (planPercent) = theo giờ công ty (utils/workSchedule.js): mỗi ngày làm đã qua = đủ giờ/ngày,
 *   hôm nay = phần giờ công ty đã trôi qua × giờ/ngày — cho biết đáng lẽ task phải đến đâu;
 * - chậm / vượt = giờ kế hoạch đến giờ này − giờ làm thật; màu theo varianceTone (cùng quy tắc cột Chênh lệch):
 *   chậm ≤ 5% kế hoạch xanh, 5–10% vàng, > 10% đỏ; làm vượt kế hoạch = xanh;
 * - người xem có trong phân công → chỉ tính phần của họ; ngược lại cộng mọi người được giao;
 * - task đã hoàn thành = 100%, không còn chậm.
 */
export function taskWorkPace(task, { employees = [], viewerEmployeeId = '', now = new Date() } = {}) {
  const empty = { progress: 0, planPercent: 0, plannedHours: 0, workedHours: 0, expectedHours: 0, behindHours: 0, tone: '' };
  if (!task) return empty;
  if (task.status === 'completed') return { ...empty, progress: 100, planPercent: 100 };
  const all = (task.assignees || []).filter(assignment => assignment.employeeId);
  const mine = all.filter(assignment => viewerEmployeeId && assignment.employeeId === viewerEmployeeId);
  const streams = mine.length ? mine : all.length ? all : task.employeeId ? [{ employeeId: task.employeeId }] : [];
  if (!streams.length) return empty;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const today = vnDateKey(nowMs);
  const entries = Array.isArray(task.actualWorkEntries) ? task.actualWorkEntries : [];
  let planned = 0, worked = 0, expected = 0;
  for (const assignment of streams) {
    const employee = employees.find(person => person.id === assignment.employeeId);
    const daily = Number(assignment.estimatedHoursPerDay) || Number(employee?.standardHours) || 8;
    planned += assignmentWorkingDayUnits(task, assignment) * daily;
    // Giờ làm thật: phiên đã chốt + phiên đang chạy.
    worked += entries.filter(entry => entry.employeeId === assignment.employeeId).reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const running = employee?.isOnSite && employee.checkInAt && employee.activeTaskId === task.id && !employee.isOnBreak;
    const sessionStart = running ? Date.parse(employee.workSessionStartedAt || task.workSessionStartedAt || '') : NaN;
    if (Number.isFinite(sessionStart)) {
      worked += isOvertimeShift(employee.shiftType) ? Math.max(0, (nowMs - sessionStart) / 3600000) : scheduledWorkHours(sessionStart, nowMs);
    }
    // Kế hoạch đến giờ này theo giờ công ty.
    for (const key of assignmentWorkingDates(task, assignment)) {
      if (key < today) expected += daily * workingDayWeight(key);
      else if (key === today) {
        const dayHours = dayWorkHours(key);
        if (dayHours > 0) expected += daily * workingDayWeight(key) * Math.min(1, scheduledWorkHours(Date.parse(`${key}T00:00:00+07:00`), nowMs) / dayHours);
      }
    }
  }
  // Dữ liệu cũ chưa tách giờ theo người: dùng tổng giờ đã chốt của task khi đang tính cho cả task.
  if (!entries.length && Number(task.actualWorkHours) > 0 && streams.length === all.length) worked += Number(task.actualWorkHours);
  const behind = expected - worked;
  const tone = planned > 0 ? varianceTone(behind, behind / planned * 100) : '';
  return {
    progress: percentOf(worked, planned),
    planPercent: percentOf(expected, planned),
    plannedHours: planned,
    workedHours: worked,
    expectedHours: expected,
    behindHours: behind,
    tone,
  };
}

/** Thanh tiến độ (%) = giờ làm thật / kế hoạch. */
export function taskWorkProgress(task, options) {
  return taskWorkPace(task, options).progress;
}
