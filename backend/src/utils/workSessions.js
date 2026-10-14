export function recordWorkSession(item, employee, startAt, endAt) {
  const start = Date.parse(startAt || '');
  const end = Date.parse(endAt || '');
  if (!item || !employee?.id || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  if (!Array.isArray(item.workSessions)) item.workSessions = [];
  let cursor = start;
  let totalHours = 0;

  while (cursor < end) {
    const startDate = new Date(cursor);
    const nextMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1).getTime();
    const segmentEnd = Math.min(end, nextMidnight);
    const hours = Math.round(((segmentEnd - cursor) / 3600000) * 100) / 100;
    const date = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

    item.workSessions.push({
      id: `${item.id}-${employee.id}-${cursor}`,
      employeeId: employee.id,
      employeeName: employee.name || item.employeeName || '',
      date,
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(segmentEnd).toISOString(),
      hours
    });
    totalHours += hours;
    cursor = segmentEnd;
  }

  return Math.round(totalHours * 100) / 100;
}
