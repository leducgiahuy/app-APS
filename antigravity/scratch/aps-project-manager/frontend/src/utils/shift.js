export const SHIFT_TYPE = {
  REGULAR: 'regular',
  OVERTIME: 'overtime'
};

export function normalizeShiftType(value) {
  return value === SHIFT_TYPE.OVERTIME ? SHIFT_TYPE.OVERTIME : SHIFT_TYPE.REGULAR;
}

export function isOvertimeShift(value) {
  return normalizeShiftType(value) === SHIFT_TYPE.OVERTIME;
}

export function localDateKey(date = new Date()) {
  const parts = workTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function workTimeParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
}

export function matchesEmployee(record, emp) {
  if (!record || !emp) return false;
  if (record.employeeId) return record.employeeId === emp.id;
  const name = (record.employeeName || '').trim().toLowerCase();
  return Boolean(name) && name === (emp.name || '').trim().toLowerCase();
}

/** T2–T6 từ 18:00, T7 từ 13:30. Chủ nhật không mở tăng ca. */
export function getOvertimeWindow(date = new Date()) {
  const day = new Date(`${localDateKey(date)}T00:00:00Z`).getUTCDay();
  if (day === 0) {
    return {
      allowedDay: false,
      startHour: null,
      startMinute: null,
      label: 'Chủ nhật không mở tăng ca'
    };
  }
  if (day === 6) {
    return { allowedDay: true, startHour: 13, startMinute: 30, label: '13:30 thứ Bảy' };
  }
  return { allowedDay: true, startHour: 18, startMinute: 0, label: '18:00 (thứ Hai đến thứ Sáu)' };
}

export function isOvertimeClockInAllowed(date = new Date()) {
  const window = getOvertimeWindow(date);
  if (!window.allowedDay) {
    return {
      ok: false,
      message: 'Chưa tới giờ tăng ca. Chủ nhật không mở tăng ca; tăng ca chỉ từ thứ Hai đến thứ Sáu (18:00) và thứ Bảy (13:30).'
    };
  }
  const parts = workTimeParts(date);
  const nowMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const startMinutes = window.startHour * 60 + window.startMinute;
  if (nowMinutes < startMinutes) {
    return {
      ok: false,
      message: `Chưa tới giờ tăng ca. Tăng ca chỉ được bắt đầu từ ${window.label}.`
    };
  }
  return { ok: true, message: '' };
}

export function employeeOtEntries(overtimes, emp, dateKey) {
  return (overtimes || []).filter(ot =>
    matchesEmployee(ot, emp) &&
    String(ot.date || '').slice(0, 10) === dateKey &&
    (!ot.status || ot.status === 'approved')
  );
}

export function overtimeHoursForDate(overtimes, emp, dateKey) {
  return employeeOtEntries(overtimes, emp, dateKey).reduce((sum, ot) => sum + (Number(ot.hours) || 0), 0);
}

export function overtimeTasksFromEntries(entries, allTasks) {
  const byId = new Map();
  (entries || []).forEach(ot => {
    const linkedTask = (allTasks || []).find(task => task.id === ot.taskId);
    const id = linkedTask ? linkedTask.id : `ot:${ot.id}`;
    const existing = byId.get(id);
    const hours = Number(ot.hours) || 0;
    if (existing) {
      existing.overtimeHours += hours;
      return;
    }
    byId.set(id, linkedTask
      ? { ...linkedTask, overtimeHours: hours }
      : {
          id,
          code: 'OT',
          title: ot.taskTitle || 'Tăng ca đột xuất tại công trường',
          status: 'in_progress',
          overtimeHours: hours
        });
  });
  return [...byId.values()];
}

export function isSyntheticOvertimeTaskId(taskId) {
  return String(taskId || '').startsWith('ot:');
}
