import { assignmentWorkingDates } from './assignmentCalendar.js';

/**
 * Tiến độ theo giờ làm của một task (thanh "Tiến độ" ở Công việc), áp cho mọi task:
 * - kế hoạch = số ngày làm việc trong phân công × số giờ một ngày của người đó (giờ/ngày phân công, không có thì ca chuẩn);
 * - thực tế = giờ đã chấm của người đó (actualWorkEntries) + phiên đang chạy khi người đó đang ở văn phòng và chọn task này;
 * - người xem có trong phân công → chỉ tính phần của họ; ngược lại cộng mọi người được giao;
 * - task đã hoàn thành = 100%.
 */
export function taskWorkProgress(task, { employees = [], viewerEmployeeId = '', now = new Date() } = {}) {
  if (!task) return 0;
  if (task.status === 'completed') return 100;
  const all = (task.assignees || []).filter(assignment => assignment.employeeId);
  const mine = all.filter(assignment => viewerEmployeeId && assignment.employeeId === viewerEmployeeId);
  const streams = mine.length ? mine : all.length ? all : task.employeeId ? [{ employeeId: task.employeeId }] : [];
  if (!streams.length) return 0;
  const entries = Array.isArray(task.actualWorkEntries) ? task.actualWorkEntries : [];
  let planned = 0, worked = 0;
  for (const assignment of streams) {
    const employee = employees.find(person => person.id === assignment.employeeId);
    const daily = Number(assignment.estimatedHoursPerDay) || Number(employee?.standardHours) || 8;
    planned += assignmentWorkingDates(task, assignment).length * daily;
    worked += entries.filter(entry => entry.employeeId === assignment.employeeId).reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const running = employee && employee.activeTaskId === task.id && employee.isOnSite && !employee.isOnBreak;
    const sessionStart = running ? Date.parse(employee.workSessionStartedAt || task.workSessionStartedAt || '') : NaN;
    if (Number.isFinite(sessionStart)) worked += Math.max(0, (now.getTime() - sessionStart) / 3600000);
  }
  // Dữ liệu cũ chưa tách giờ theo người: dùng tổng giờ của task khi đang tính cho cả task.
  if (!entries.length && Number(task.actualWorkHours) > 0 && streams.length === all.length) worked += Number(task.actualWorkHours);
  return planned > 0 ? Math.max(0, Math.min(100, Math.floor(worked / planned * 100))) : 0;
}
