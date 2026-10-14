import { vietnamCalendarDay } from './vietnamCalendar.js';
import { assignmentWorkingDates } from './assignmentCalendar.js';

export const RECRUITMENT_STAGES = ['Đề xuất', 'GD duyệt', 'Đăng tuyển', 'Phỏng vấn', 'Đã offer', 'Nhận việc'];
export const positionKey = value => String(value || '').trim().normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ');
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (key, count) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + count); return dateKey(date); };
export const dateDifference = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
export const employeePosition = employee => String(employee.title || '').trim() || 'Chưa xác định vị trí';
export function capacityWeight(key) {
  const calendar = vietnamCalendarDay(new Date(`${key}T12:00:00`));
  if (calendar.kind === 'holiday' || calendar.kind === 'sunday') return 0;
  return new Date(`${key}T12:00:00`).getDay() === 6 ? 0.5 : 1;
}
export function calendarCapacity(start, end, daily = 8) {
  let total = 0;
  for (let key = start; key <= end; key = addDays(key, 1)) total += capacityWeight(key) * daily;
  return total;
}
export function forecastMonths(now, count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index + 1, 1, 12);
    const key = dateKey(date).slice(0, 7);
    return { key, label: `T${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`, start: `${key}-01`, end: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)) };
  });
}

// Gantt is authoritative; linked tasks provide actual progress, never another copy of demand.
export function workforceTasks(tasks = [], ganttItems = []) {
  const linked = new Map(tasks.filter(task => task.ganttId).map(task => [task.ganttId, task]));
  const ganttIds = new Set(ganttItems.map(item => item.id));
  const parents = new Set([...tasks, ...ganttItems].map(item => item.parentTaskId).filter(Boolean));
  const valid = item => !item.isGroup && !item.isProjectHeader && !parents.has(item.id) && !['holiday', 'cancelled'].includes(item.status) && (item.deliveryRecognized != null ? Number(item.deliveryRecognized) < 100 : item.status !== 'completed');
  return [
    ...ganttItems.map(item => ({ ...linked.get(item.id), ...item, id: item.id, forecastKey: `gantt:${item.id}` })).filter(valid),
    ...tasks.filter(task => !ganttIds.has(task.ganttId) && !ganttIds.has(task.id)).map(task => ({ ...task, forecastKey: `task:${task.id}` })).filter(valid),
  ];
}

export function buildWorkforceForecast({ employees = [], tasks = [], ganttItems = [], projects = [], plan = {}, now = new Date() }) {
  const months = forecastMonths(now);
  const today = dateKey(now);
  const roles = new Map();
  const role = name => {
    const key = positionKey(name) || positionKey('Chưa xác định vị trí');
    if (!roles.has(key)) roles.set(key, { key, name: String(name || 'Chưa xác định vị trí').trim(), employees: [], demand: months.map(() => 0), sources: months.map(() => new Set()) });
    return roles.get(key);
  };
  employees.forEach(employee => role(employeePosition(employee)).employees.push(employee));
  const projectById = new Map(projects.map(project => [project.id, project]));
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));
  const employeeDemand = new Map(employees.map(employee => [employee.id, months.map(() => 0)]));
  const unresolved = [];
  const addDemand = (name, entries, source, employeeId) => {
    const row = role(name);
    entries.forEach(([key, hours]) => {
      const index = months.findIndex(month => month.start <= key && month.end >= key);
      if (index >= 0 && hours > 0) { row.demand[index] += hours; row.sources[index].add(source); if (employeeDemand.has(employeeId)) employeeDemand.get(employeeId)[index] += hours; }
    });
  };
  workforceTasks(tasks, ganttItems).forEach(task => {
    const project = projectById.get(task.projectId);
    if (['cancelled', 'completed'].includes(project?.status)) return;
    const source = project?.name || task.projectName || task.title || 'Task';
    const assignments = Array.isArray(task.assignees) ? task.assignees : (task.employeeId || task.employeeName || task.assignee ? [task] : []);
    const streams = assignments.length ? assignments : [task];
    const streamsWithDates = streams.map(assignment => {
      const employee = assignment.employeeId ? employeeById.get(assignment.employeeId) : employees.find(person => positionKey(person.name) === positionKey(assignment.employeeName || assignment.assignee));
      const mapping = (plan.taskRoles || []).find(item => item.taskKey === task.forecastKey);
      const name = employee ? employeePosition(employee) : mapping?.position || task.requiredPosition || task.position || 'Chưa xác định vị trí';
      const dates = assignmentWorkingDates(task, assignment);
      const daily = Number(assignment.estimatedHoursPerDay) || Number(task.estimatedHoursPerDay) || Number(task.estimatedHours) / (Number(task.estimatedDays || task.days) || dates.length || 1) || 8;
      return { name, dates, daily, employeeId: employee?.id };
    });
    const total = streamsWithDates.reduce((sum, stream) => sum + stream.dates.length * stream.daily, 0);
    const actual = Number(task.actualWorkHours ?? task.actualHours) || 0;
    const remaining = Math.max(0, total - Math.max(actual, total * Math.min(100, Math.max(0, Number(task.deliveryRecognized ?? task.progress) || 0)) / 100));
    const futureTotal = streamsWithDates.reduce((sum, stream) => sum + stream.dates.filter(key => key >= today).length * stream.daily, 0);
    const factor = futureTotal ? Math.min(1, remaining / futureTotal) : 0;
    streamsWithDates.forEach(stream => addDemand(stream.name, stream.dates.filter(key => key >= today).map(key => [key, stream.daily * factor]), source, stream.employeeId));
    if (streamsWithDates.some(stream => stream.name === 'Chưa xác định vị trí') && task.endDate >= months[0].start && task.startDate <= months.at(-1).end) unresolved.push(task);
  });
  // Pipeline entries are additional, explicitly entered demand; probability is 0–100%.
  (plan.demands || []).forEach(demand => {
    if (['cancelled', 'completed'].includes(projectById.get(demand.projectId)?.status)) return;
    const dates = [];
    for (let key = demand.startDate; key <= demand.endDate; key = addDays(key, 1)) if (capacityWeight(key)) dates.push(key);
    const weight = dates.reduce((sum, key) => sum + capacityWeight(key), 0);
    const hours = Number(demand.hours) * Number(demand.probability) / 100;
    addDemand(demand.position, dates.map(key => [key, weight ? hours * capacityWeight(key) / weight : 0]), demand.projectName || projectById.get(demand.projectId)?.name || 'Nhu cầu bổ sung');
  });
  const rows = [...roles.values()].map(row => {
    const cells = months.map((month, index) => {
      const unitCapacity = calendarCapacity(month.start, month.end);
      const capacity = row.employees.reduce((sum, employee) => sum + calendarCapacity(month.start, month.end, Number(employee.standardHours) || 8), 0);
      const demand = row.demand[index];
      return { demand, capacity, unitCapacity, percent: capacity ? demand / capacity * 100 : demand ? Infinity : 0, gap: unitCapacity ? Math.round((demand - capacity) / unitCapacity * 1e6) / 1e6 : 0, sources: [...row.sources[index]] };
    });
    return { ...row, cells, peakGap: Math.max(...cells.map(cell => cell.gap)), spareDays: cells.slice(0, 3).reduce((sum, cell) => sum + Math.max(0, cell.capacity - cell.demand) / 8, 0) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const recruitment = rows.filter(row => row.peakGap >= 0.8 && row.name !== 'Chưa xác định vị trí').map(row => {
    const firstIndex = row.cells.findIndex(cell => cell.percent > 105);
    const needMonth = months[Math.max(0, firstIndex)];
    let needDate = needMonth.start;
    while (!capacityWeight(needDate)) needDate = addDays(needDate, 1);
    const saved = (plan.recruitments || []).find(item => positionKey(item.position) === row.key && item.needMonth === needMonth.key && !item.canceledAt) || {};
    const setting = (plan.settings || []).find(item => positionKey(item.position) === row.key);
    const leadDays = Number(setting?.leadDays) || Number(plan.defaultLeadDays) || 45;
    const deadline = addDays(needDate, -leadDays);
    const status = saved.status || RECRUITMENT_STAGES[0];
    const openedAt = saved.openedAt || '';
    const posted = RECRUITMENT_STAGES.indexOf(status) >= 2;
    const expectedStart = saved.expectedStart || addDays(posted && openedAt ? openedAt : (today > deadline ? today : deadline), leadDays);
    const percent = row.cells[Math.max(0, firstIndex)].percent;
    return { ...row, ...saved, position: row.name, needMonth: needMonth.key, quantity: Math.ceil(row.peakGap), needDate, deadline, leadDays, status, openedAt, expectedStart, lateDays: dateDifference(expectedStart, needDate), reason: `${Number.isFinite(percent) ? `Tải ${Math.round(percent)}%` : 'Có nhu cầu, chưa có nhân sự'} từ ${needMonth.label} · ${row.cells[Math.max(0, firstIndex)].sources.join(', ')}` };
  });
  const employeeRows = employees.map(employee => ({ id: employee.id, cells: months.map((month, index) => {
    const capacity = calendarCapacity(month.start, month.end, Number(employee.standardHours) || 8);
    const demand = employeeDemand.get(employee.id)[index];
    return { capacity, demand, percent: capacity ? demand / capacity * 100 : demand ? Infinity : 0, sources: ['Chỉ gồm việc đã giao cho nhân viên, chưa phân bổ nhu cầu bổ sung'] };
  }) }));
  const cancellationSuggestions=(plan.recruitments||[]).filter(saved=>!saved.canceledAt&&['Đề xuất','GD duyệt'].includes(saved.status)&&(rows.find(row=>row.key===positionKey(saved.position))?.peakGap??0)<.5);
  return { months, rows, employeeRows, recruitment, cancellationSuggestions, unresolved, needed: recruitment.reduce((sum, row) => sum + row.quantity, 0), onTime: recruitment.filter(row => row.lateDays <= 0).length, spareDays: rows.reduce((sum, row) => sum + row.spareDays, 0) };
}
