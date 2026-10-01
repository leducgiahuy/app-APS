export function formatDateVi(isoDate) {
  if (!isoDate) return '';
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

export function todayIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateVi(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function inclusiveDays(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.floor((end - start) / 86400000) + 1;
}

export function shiftIsoDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function scheduledProgress(task, hoursPerDay = 8, now = new Date(), activeCheckInAt = null) {
  if (task?.status === 'completed') return 100;
  const days = inclusiveDays(task?.startDate, task?.endDate);
  const dailyHours = Number(hoursPerDay) || 8;
  const plannedHours = Number(task?.estimatedHours) > 0 ? Number(task.estimatedHours) : days * dailyHours;
  const isAssignedTask = Boolean(task?.attendanceTracked || task?.employeeId || task?.employeeName || task?.assignee);
  if (isAssignedTask) {
    const completedHours = Number(task.actualWorkHours) || 0;
    const sessionStartValue = activeCheckInAt || task.workSessionStartedAt || '';
    const activeSessionStart = Date.parse(sessionStartValue);
    const sessionStartDate = Number.isFinite(activeSessionStart) ? new Date(activeSessionStart) : null;
    const sessionDateKey = sessionStartDate
      ? `${sessionStartDate.getFullYear()}-${String(sessionStartDate.getMonth() + 1).padStart(2, '0')}-${String(sessionStartDate.getDate()).padStart(2, '0')}`
      : '';
    const sessionIsWithinTaskDates = Boolean(sessionDateKey) &&
      (!task?.startDate || sessionDateKey >= task.startDate) &&
      (!task?.endDate || sessionDateKey <= task.endDate);
    const activeSessionHours = sessionIsWithinTaskDates && Number.isFinite(activeSessionStart)
      ? Math.max(0, (now.getTime() - activeSessionStart) / 3600000)
      : 0;
    return Math.max(0, Math.min(100, Math.floor(((completedHours + activeSessionHours) / plannedHours) * 100)));
  }
  const [, startYear, startMonth, startDay] = String(task?.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  const start = startYear ? new Date(Number(startYear), Number(startMonth) - 1, Number(startDay)).getTime() : NaN;
  if (!Number.isFinite(start)) return Math.max(0, Math.min(100, Number(task?.progress) || 0));

  const elapsedDays = Math.max(0, Math.min(days, (now.getTime() - start) / 86400000));
  const elapsedPlannedHours = elapsedDays * dailyHours;
  return Math.max(0, Math.min(100, Math.floor((elapsedPlannedHours / plannedHours) * 100)));
}

export function isTaskOverdue(task, now = new Date()) {
  if (!task?.endDate || task.status === 'completed') return false;
  const [, year, month, day] = String(task.endDate).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!year) return false;
  const endExclusive = new Date(Number(year), Number(month) - 1, Number(day) + 1).getTime();
  return Number.isFinite(endExclusive) && now.getTime() >= endExclusive;
}

export function taskDelayHours(task, now = new Date()) {
  if (!task) return 0;
  if (task.status === 'completed' && Number(task.delayHours) > 0) {
    return Number(task.delayHours);
  }

  const days = Number(task.estimatedDays) || inclusiveDays(task.startDate, task.endDate);
  const perDay = Number(task.estimatedHoursPerDay) || 0;
  const plannedHours = Number(task.estimatedHours) > 0
    ? Number(task.estimatedHours)
    : days * (perDay || 8);
  const activeStart = Date.parse(task.workSessionStartedAt || '');
  const trackedHours = (Number(task.actualWorkHours) || 0) + (Number.isFinite(activeStart)
    ? Math.max(0, now.getTime() - activeStart) / 3600000
    : 0);
  const effortDelay = Math.max(0, trackedHours - plannedHours);

  let calendarDelay = 0;
  if (task.endDate && (task.status === 'completed' ? task.completedAt : isTaskOverdue(task, now))) {
    const [, year, month, day] = String(task.endDate).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    const deadline = year ? new Date(Number(year), Number(month) - 1, Number(day) + 1).getTime() : NaN;
    const completion = task.status === 'completed' ? Date.parse(task.completedAt) : now.getTime();
    if (Number.isFinite(deadline) && Number.isFinite(completion)) calendarDelay = Math.max(0, completion - deadline) / 3600000;
  }
  return Math.round(Math.max(effortDelay, calendarDelay) * 10) / 10;
}

export function formatDelayHours(hours) {
  const totalMinutes = Math.max(0, Math.round((Number(hours) || 0) * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours && minutes) return `${wholeHours}h${minutes}`;
  if (wholeHours) return `${wholeHours}h`;
  return `${minutes}p`;
}

export function isTaskActiveOnDate(task, date) {
  if (!task?.startDate || !task?.endDate || !date) return false;
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return task.startDate <= dateKey && task.endDate >= dateKey;
}
