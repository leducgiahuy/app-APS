import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProjectGantt } from '../../frontend/src/utils/projectGanttSummary.js';
import { calculatePlannedPersonDays } from '../../frontend/src/utils/ganttEffort.js';

const project = { id: 'p', name: 'Project', startDate: '2026-11-01' };
const employees = [{ id: 'e1', name: 'Duy' }, { id: 'e2', name: 'Thinh' }];
const row = {
  id: 'g1', projectId: 'p', startDate: '2026-11-01', endDate: '2026-11-06',
  assignees: [
    { employeeId: 'e1', startDate: '2026-11-01', endDate: '2026-11-03', estimatedHoursPerDay: 8 },
    { employeeId: 'e2', startDate: '2026-11-01', endDate: '2026-11-03', estimatedHoursPerDay: 4 },
    { employeeId: 'e1', startDate: '2026-11-05', endDate: '2026-11-06', estimatedHoursPerDay: 4 }
  ]
};

test('includes Gantt-only assignees once while retaining repeated assignment effort', () => {
  const snapshot = structuredClone(row);
  const result = summarizeProjectGantt(project, [row], [{ id: 't', projectId: 'p', employeeId: 'e1' }], employees);
  assert.equal(result.team.length, 2);
  assert.equal(result.personDays, 5.5);
  assert.equal(result.personDays, calculatePlannedPersonDays(row));
  assert.deepEqual(result.team.map(person => [person.id, person.hours]), [['e1', 32], ['e2', 12]]);
  assert.deepEqual(row, snapshot);
});

test('excludes parent summaries, groups, holidays and other projects', () => {
  const rows = [
    { ...row, id: 'parent' }, { ...row, parentTaskId: 'parent' },
    { ...row, id: 'group', isGroup: true }, { ...row, id: 'holiday', status: 'holiday' },
    { ...row, id: 'other', projectId: 'other-project' }, { ...row, id: 'heading', isProjectHeader: true }
  ];
  const result = summarizeProjectGantt(project, rows, [], employees);
  assert.equal(result.personDays, 5.5);
  assert.equal(result.team.length, 2);
});

test('saved empty Gantt assignments override stale task names and deleted IDs never transfer', () => {
  const rows = [
    { ...row, assignees: [] },
    { ...row, id: 'deleted', assignees: [{ employeeId: 'old', employeeName: 'Duy' }] }
  ];
  const tasks = [{ id: 't', ganttId: 'g1', projectId: 'p', employeeId: 'e1', employeeName: 'Duy' }];
  const result = summarizeProjectGantt(project, rows, tasks, employees);
  assert.equal(result.personDays, 0);
  assert.deepEqual(result.team, []);
});

test('legacy Gantt names and missing project IDs retain the existing effort formula', () => {
  const legacy = { id: 'legacy', assignee: ' DUY ', startDate: '2026-11-01', endDate: '2026-11-03', estimatedHours: 24 };
  const tasks = [{ id: 't', ganttId: 'legacy', projectId: 'p' }];
  const result = summarizeProjectGantt(project, [legacy], tasks, employees);
  assert.equal(result.personDays, calculatePlannedPersonDays(legacy));
  assert.equal(result.personDays, 3);
  assert.equal(result.team[0].hours, 24);
});

test('approved OT is shown separately and does not double count Gantt contributions', () => {
  const rows = [{ ...row, overtimeContributions: [{ employeeId: 'e1', hours: 2 }] }];
  const tasks = [{ id: 't', ganttId: 'g1', projectId: 'p' }];
  const ot = [
    { id: 'approved', taskId: 't', employeeId: 'e1', hours: 2, status: 'approved' },
    { id: 'pending', taskId: 't', employeeId: 'e2', hours: 8, status: 'pending' },
    { id: 'other', taskId: 'other-task', employeeId: 'e2', hours: 10, status: 'approved' }
  ];
  const result = summarizeProjectGantt(project, rows, tasks, employees, ot);
  assert.equal(result.personDays, 5.5);
  assert.equal(result.team.find(person => person.id === 'e1').overtime, 2);
  assert.equal(result.team.find(person => person.id === 'e2').overtime, 0);
});

test('new task assignments and employee removal immediately recompute the totals', () => {
  const rows = [{ ...row, assignees: [row.assignees[0]] }];
  assert.equal(summarizeProjectGantt(project, rows, [], employees).team.length, 1);
  rows.push({ ...row, id: 'new', assignees: [row.assignees[1]] });
  const added = summarizeProjectGantt(project, rows, [], employees);
  assert.equal(added.team.length, 2);
  assert.equal(added.personDays, 4.5);
  const removed = summarizeProjectGantt(project, rows, [], employees.filter(employee => employee.id !== 'e1'));
  assert.equal(removed.team.length, 1);
  assert.equal(removed.personDays, 1.5);
});

test('department task counts deduplicate shared tasks and repeated employee assignments', () => {
  const people = employees.map(employee => ({ ...employee, team: 'Ban Thiết Kế' }));
  const result = summarizeProjectGantt(project, [row], [], people);
  const department = result.departments[0];
  assert.equal(department.name, 'Ban Thiết Kế');
  assert.equal(department.taskCount, 1);
  assert.equal(department.people.length, 2);
  assert.equal(department.personDays, 5.5);
  assert.deepEqual(department.people.map(person => [person.taskCount, person.personDays]), [[1, 4], [1, 1.5]]);
});

test('new tasks, department changes and employee removal recompute department totals', () => {
  const people = employees.map(employee => ({ ...employee, team: 'Ban Thiết Kế' }));
  const rows = [row, { ...row, id: 'new-task', assignees: [row.assignees[1]] }];
  const added = summarizeProjectGantt(project, rows, [], people);
  assert.equal(added.departments[0].taskCount, 2);
  assert.equal(added.departments[0].personDays, 7);
  assert.equal(added.team.find(person => person.id === 'e2').taskCount, 2);
  const moved = summarizeProjectGantt(project, rows, [], [people[0], { ...people[1], team: 'Ban Quản Lý' }]);
  assert.equal(moved.departments.length, 2);
  assert.equal(moved.departments.find(department => department.name === 'Ban Quản Lý').personDays, 3);
  const removed = summarizeProjectGantt(project, rows, [], [people[0]]);
  assert.equal(removed.departments.length, 1);
  assert.equal(removed.departments[0].taskCount, 1);
  assert.equal(removed.departments[0].personDays, 4);
});

test('OT-only participants retain task and approved overtime totals in their own department', () => {
  const result = summarizeProjectGantt(project, [{ ...row, assignees: [] }], [{ id: 't', ganttId: row.id, projectId: 'p' }], employees, [
    { id: 'ot', taskId: 't', employeeId: 'e2', hours: 2, status: 'approved' }
  ]);
  assert.equal(result.departments[0].name, 'Chưa có phòng ban');
  assert.equal(result.departments[0].taskCount, 1);
  assert.equal(result.team[0].taskCount, 1);
  assert.equal(result.team[0].overtime, 2);
  assert.equal(result.team[0].personDays, 0);
});
