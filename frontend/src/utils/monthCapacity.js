import { capacityWeight } from './workforceForecast.js';

const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function monthRange(month) {
  const [year, index] = month.split('-').map(Number);
  const first = new Date(year, index - 1, 1);
  const last = new Date(year, index, 0);
  return { first: key(first), last: key(last), days: last.getDate() };
}

// Chỉ giờ thật sự đã giao người: bỏ task chưa giao ai, task cha (giờ đã nằm ở task con) và task hủy / ngày nghỉ.
// Mỗi người được giao tính theo khoảng ngày của riêng họ; Thứ Bảy nửa ngày, Chủ nhật / ngày lễ không tính.
export function assignedHoursInMonth(tasks, month, ganttItems = []) {
  const range = monthRange(month);
  const parentIds = new Set(ganttItems.map(item => item.parentTaskId).filter(Boolean));
  return tasks.reduce((total, task) => {
    if (['cancelled', 'holiday'].includes(task.status) || task.isGroup || parentIds.has(task.ganttId) || parentIds.has(task.id)) return total;
    const named = (task.assignees || []).filter(assignment => assignment.employeeId || assignment.employeeName);
    const streams = named.length ? named : task.employeeId || task.employeeName ? [task] : [];
    return total + streams.reduce((sum, assignment) => {
      const start = assignment.startDate || task.startDate;
      const end = assignment.endDate || task.endDate;
      if (!start || !end || end < range.first || start > range.last) return sum;
      let weight = 0;
      for (const date = new Date(`${start < range.first ? range.first : start}T12:00:00`), to = new Date(`${end > range.last ? range.last : end}T12:00:00`); date <= to; date.setDate(date.getDate() + 1)) {
        weight += capacityWeight(key(date));
      }
      const daily = Number(assignment.estimatedHoursPerDay) || Number(task.estimatedHoursPerDay)
        || Number(task.estimatedHours) / (Number(task.days) || 1) || 8;
      return sum + weight * daily;
    }, 0);
  }, 0);
}

/** % lấp đầy = giờ đã giao người ÷ năng lực tháng của toàn bộ nhân sự. null khi chưa có nhân sự. */
export function monthFillPercent(tasks, employees, month, ganttItems = []) {
  const range = monthRange(month);
  let available = 0;
  for (let day = 1; day <= range.days; day += 1) {
    const weight = capacityWeight(`${month}-${String(day).padStart(2, '0')}`);
    available += employees.reduce((sum, employee) => sum + weight * (Number(employee.standardHours) || 8), 0);
  }
  return available ? assignedHoursInMonth(tasks, month, ganttItems) / available * 100 : null;
}
