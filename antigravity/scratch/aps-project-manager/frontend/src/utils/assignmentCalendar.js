import { vietnamCalendarDay } from './vietnamCalendar.js';

export function datesInRange(start, end) {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
  return Array.from({ length: Math.floor((last - first) / 86400000) + 1 }, (_, i) => new Date(first + i * 86400000).toISOString().slice(0, 10));
}

export function nonWorkingDay(key) {
  const day = vietnamCalendarDay(new Date(`${key}T12:00:00`));
  return day.kind === 'holiday' || day.kind === 'sunday' ? day : null;
}

export function assignmentWorksOnDate(assignment, item, key) {
  const start = assignment.startDate || item.startDate;
  const end = assignment.endDate || item.endDate;
  return (!start || start <= key) && (!end || end >= key) && !(assignment.excludeNonWorkingDays === true && nonWorkingDay(key));
}

export function assignmentWorkingDates(item, assignment) {
  return datesInRange(assignment.startDate || item.startDate, assignment.endDate || item.endDate)
    .filter(key => assignmentWorksOnDate(assignment, item, key));
}

export function taskWorkingDates(item) {
  if (!item.assignees?.some(a => a.excludeNonWorkingDays === true)) return datesInRange(item.startDate, item.endDate);
  return [...new Set(item.assignees.flatMap(a => assignmentWorkingDates(item, a)))].sort();
}

export function assignmentCalendarConflicts(rows) {
  return [...new Set(rows.flatMap(row => datesInRange(row.startDate, row.endDate)))].sort()
    .map(nonWorkingDay).filter(Boolean);
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
  for (const item of [...(db.ganttItems || []), ...(db.tasks || [])]) {
    if (item.isGroup || item.isProjectHeader) continue;
    const excluded = item.assignees?.some(a => a.excludeNonWorkingDays === true) || false;
    if (!excluded && !item.calendarAdjusted) continue;
    const days = taskWorkingDates(item).length;
    const hours = excluded ? item.assignees.reduce((sum, a) => sum + assignmentWorkingDates(item, a).length * (Number(a.estimatedHoursPerDay) || Number(item.estimatedHoursPerDay) || 8), 0)
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
