import { vietnamCalendarDay } from './vietnamCalendar.js';

export function datesInRange(start, end) {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
  return Array.from({ length: Math.floor((last - first) / 86400000) + 1 }, (_, i) => new Date(first + i * 86400000).toISOString().slice(0, 10));
}

/**
 * Lịch ngày nghỉ của dự án (project.workCalendar, chọn ở "Sửa MOI & ngày nghỉ"; người dùng chốt 25/11/2026).
 * Mỗi task mang bản sao item.workCalendar (normalizeAssignmentSchedules gắn theo dự án mỗi lần đọc / ghi).
 * Chủ nhật / ngày lễ có làm thì tính như ngày thường (8 tiếng); lễ rơi vào thứ 7 vẫn nửa ngày.
 */
export const WORK_CALENDARS = {
  all: 'Làm ngày lễ và ngày Chủ nhật',
  sunday: 'Không làm ngày lễ, chỉ làm Chủ nhật',
  none: 'Không làm ngày lễ và ngày Chủ nhật',
};
export const DEFAULT_WORK_CALENDAR = 'none';
export const normalizeWorkCalendar = value => Object.prototype.hasOwnProperty.call(WORK_CALENDARS, value) ? value : DEFAULT_WORK_CALENDAR;

/** Ngày nghỉ theo lịch của dự án: trả về thông tin ngày (lễ / Chủ nhật) nếu nghỉ, null nếu là ngày làm. */
export function nonWorkingDay(key, policy = DEFAULT_WORK_CALENDAR) {
  const day = vietnamCalendarDay(new Date(`${key}T12:00:00`));
  const calendar = normalizeWorkCalendar(policy);
  if (day.kind === 'holiday') return calendar === 'all' ? null : day;
  if (day.kind === 'sunday') return calendar === 'none' ? day : null;
  return null;
}

export function assignmentWorksOnDate(assignment, item, key) {
  const start = assignment.startDate || item.startDate;
  const end = assignment.endDate || item.endDate;
  return (!start || start <= key) && (!end || end >= key) && !(assignment.excludeNonWorkingDays === true && nonWorkingDay(key, item?.workCalendar));
}

export function assignmentWorkingDates(item, assignment) {
  return datesInRange(assignment.startDate || item.startDate, assignment.endDate || item.endDate)
    .filter(key => assignmentWorksOnDate(assignment, item, key));
}

// Thứ 7 làm 8:00–12:00 = nửa ngày (workSchedule.js), các ngày làm việc khác = 1 ngày.
export const workingDayWeight = key => new Date(`${key}T12:00:00Z`).getUTCDay() === 6 ? 0.5 : 1;

// Số "ngày công" của một phân công (thứ 7 = 0,5). Chia giờ ra giờ/ngày phải dùng số này,
// cùng cách calculateAssignmentHours cộng lại giờ, để tổng giờ không bị hụt ở tuần có thứ 7.
export function assignmentWorkingDayUnits(item, assignment) {
  return assignmentWorkingDates(item, assignment).reduce((sum, key) => sum + workingDayWeight(key), 0);
}

/**
 * Số ngày làm thực tế của khoảng ngày (hiển thị cột "Ngày"): bỏ Chủ nhật / ngày lễ theo lịch dự án
 * (trừ khi dự án chọn có làm các ngày đó), thứ 7 = 0,5. Trả về null nếu thiếu ngày.
 */
export function workingDaysInRange(start, end, policy = DEFAULT_WORK_CALENDAR) {
  if (!start || !end) return null;
  return datesInRange(start, end).reduce((sum, key) => sum + (nonWorkingDay(key, policy) ? 0 : workingDayWeight(key)), 0);
}

export function taskWorkingDates(item) {
  if (!item.assignees?.some(a => a.excludeNonWorkingDays === true)) return datesInRange(item.startDate, item.endDate);
  return [...new Set(item.assignees.flatMap(a => assignmentWorkingDates(item, a)))].sort();
}

/**
 * Ngày vẽ thanh Gantt: bỏ ngày nghỉ theo lịch dự án (item.workCalendar — Chủ nhật / lễ trừ khi dự án bật làm)
 * và ngày người làm đã bỏ. split = thanh phải đứt khúc (có ngày bị bỏ). Việc nằm trọn trong ngày nghỉ vẫn vẽ liền.
 * Chỉ để hiển thị, không đổi cách tính giờ.
 */
export function ganttBarDates(item) {
  const all = datesInRange(item.startDate, item.endDate);
  const dates = taskWorkingDates(item).filter(key => !nonWorkingDay(key, item.workCalendar));
  return dates.length && dates.length !== all.length ? { dates, split: true } : { dates: all, split: false };
}

export function assignmentCalendarConflicts(rows, policy = DEFAULT_WORK_CALENDAR) {
  return [...new Set(rows.flatMap(row => datesInRange(row.startDate, row.endDate)))].sort()
    .map(key => nonWorkingDay(key, policy)).filter(Boolean);
}

export function workingDateSegments(keys) {
  const segments = [];
  for (const key of keys) {
    const last = segments.at(-1);
    if (last && Date.parse(`${key}T00:00:00Z`) - Date.parse(`${last.endDate}T00:00:00Z`) === 86400000) {
      last.endDate = key;
      last.days++;
    } else segments.push({ startDate: key, endDate: key, days: 1 });
  }
  return segments;
}

// Called on every database read/write so later date changes obey the saved choice.
export function normalizeAssignmentSchedules(db) {
  let changed = false;
  // Gắn lịch ngày nghỉ của dự án vào từng dòng (task mới thêm sau này cũng tự nhận) — trước khi tính giờ bên dưới.
  const calendars = new Map((db.projects || []).map(project => [project.id, normalizeWorkCalendar(project.workCalendar)]));
  const taskProject = new Map((db.tasks || []).filter(task => task.ganttId).map(task => [task.ganttId, task.projectId]));
  for (const item of [...(db.ganttItems || []), ...(db.tasks || [])]) {
    const projectId = item.projectId || taskProject.get(item.id);
    if (!calendars.has(projectId)) continue;
    const calendar = calendars.get(projectId);
    if ((item.workCalendar || DEFAULT_WORK_CALENDAR) !== calendar) { item.workCalendar = calendar; changed = true; }
  }
  for (const item of [...(db.ganttItems || []), ...(db.tasks || [])]) {
    if (item.isGroup || item.isProjectHeader) continue;
    const excluded = item.assignees?.some(a => a.excludeNonWorkingDays === true) || false;
    if (!excluded && !item.calendarAdjusted) continue;
    const days = taskWorkingDates(item).length;
    const hours = excluded ? item.assignees.reduce((sum, a) => sum + assignmentWorkingDates(item, a).reduce((assigned, key) => assigned + workingDayWeight(key) *(Number(a.estimatedHoursPerDay) || Number(item.estimatedHoursPerDay) || 8), 0), 0)
      : days * (Number(item.estimatedHoursPerDay) || 8);
    const fields = { calendarAdjusted: excluded, estimatedHours: Math.round(hours * 100) / 100 };
    if ((db.ganttItems || []).includes(item)) fields.days = days;
    else fields.estimatedDays = days;
    for (const [key, value] of Object.entries(fields)) {
      if (item[key] !== value) { item[key] = value; changed = true; }
    }
  }
  return changed;
}
