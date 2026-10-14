import { calculateAssignmentHours, calculatePlannedPersonDays } from './ganttEffort.js';

const normalizeName = value => String(value || '').trim().toLocaleLowerCase('vi');

export function summarizeProjectGantt(project, ganttItems = [], tasks = [], employees = [], overtimes = []) {
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  const byName = new Map(employees.map(employee => [normalizeName(employee.name), employee]));
  const resolveEmployee = assignment => assignment.employeeId
    ? byId.get(assignment.employeeId)
    : byName.get(normalizeName(assignment.employeeName || assignment.assignee));
  const linkedTasks = new Map();
  tasks.forEach(task => {
    if (task.ganttId) {
      const linked = linkedTasks.get(task.ganttId) || [];
      linked.push(task);
      linkedTasks.set(task.ganttId, linked);
    }
  });
  const containers = new Set(ganttItems.map(item => item.parentTaskId).filter(Boolean));
  const rows = [...new Map(ganttItems.filter(item => {
    const task = linkedTasks.get(item.id)?.[0];
    const belongs = item.projectId ? item.projectId === project.id
      : task?.projectId ? task.projectId === project.id : task?.projectName === project.name;
    return belongs && !item.isGroup && !item.isProjectHeader && item.status !== 'holiday' && !containers.has(item.id);
  }).map(item => [item.id, item])).values()];
  const team = new Map();
  const personTaskIds = new Map();
  const ensurePerson = (employee, startDate) => {
    if (!team.has(employee.id)) team.set(employee.id, {
      id: employee.id, name: employee.name, department: String(employee.team || '').trim() || 'Chưa có phòng ban',
      hours: 0, overtime: 0, tracked: true, addedLater: true
    });
    const person = team.get(employee.id);
    if (!startDate || !project.startDate || startDate <= project.startDate) person.addedLater = false;
    return person;
  };
  let personDays = 0;
  const assignTask = (person, taskId) => {
    if (!personTaskIds.has(person.id)) personTaskIds.set(person.id, new Set());
    personTaskIds.get(person.id).add(taskId);
  };
  const seenOvertimes = new Set();

  rows.forEach(item => {
    const linked = linkedTasks.get(item.id) || [];
    const legacyRow = !Array.isArray(item.assignees) && Boolean(item.employeeId || item.employeeName || item.assignee);
    // A saved empty assignment list is authoritative; never revive an old name.
    const assignments = Array.isArray(item.assignees) ? item.assignees
      : item.employeeId || item.employeeName || item.assignee ? [item]
        : Array.isArray(linked[0]?.assignees) ? linked[0].assignees
          : linked[0]?.employeeId || linked[0]?.employeeName ? [linked[0]] : [];
    const currentAssignments = assignments.filter(assignment => resolveEmployee(assignment));
    const rowPersonDays = legacyRow
      ? (currentAssignments.length ? calculatePlannedPersonDays(item) : 0)
      : calculatePlannedPersonDays({ ...item, assignees: currentAssignments, assignee: '', employeeId: '', employeeName: '' });
    personDays += rowPersonDays;
    currentAssignments.forEach(assignment => {
      const employee = resolveEmployee(assignment);
      const person = ensurePerson(employee, assignment.startDate || item.startDate);
      assignTask(person, item.id);
      // Use the same assignment dates and hours/day as the Gantt CÔNG TT cell.
      person.hours += legacyRow ? rowPersonDays * 8 : calculateAssignmentHours(item, assignment);
    });

    const taskIds = new Set(linked.map(task => task.id));
    const approved = overtimes.filter(entry => taskIds.has(entry.taskId) && (!entry.status || entry.status === 'approved'));
    const contributions = approved.length ? approved : item.overtimeContributions || [];
    contributions.forEach(entry => {
      if (approved.length && seenOvertimes.has(entry.id || entry)) return;
      if (approved.length) seenOvertimes.add(entry.id || entry);
      const employee = resolveEmployee(entry);
      if (!employee) return;
      const person = ensurePerson(employee, entry.date || item.startDate);
      assignTask(person, item.id);
      person.overtime += Number(entry.hours) || 0;
    });
  });
  const people = [...team.values()].map(person => ({
    ...person,
    taskIds: [...(personTaskIds.get(person.id) || [])],
    taskCount: personTaskIds.get(person.id)?.size || 0,
    personDays: person.hours / 8
  }));
  const departments = new Map();
  people.forEach(person => {
    if (!departments.has(person.department)) departments.set(person.department, {
      name: person.department, people: [], taskIds: new Set(), personDays: 0
    });
    const department = departments.get(person.department);
    department.people.push(person);
    person.taskIds.forEach(id => department.taskIds.add(id));
    department.personDays += person.personDays;
  });
  return {
    personDays: Math.round(personDays * 100) / 100,
    team: people,
    departments: [...departments.values()].map(({ taskIds, ...department }) => ({
      ...department, taskCount: taskIds.size
    }))
  };
}
