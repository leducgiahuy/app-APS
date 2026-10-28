import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-work-flow-'));
process.env.APS_DB_PATH = path.join(dir, 'db.json');

const { localDateKey } = await import('../src/utils/shift.js');
const { toggleOnSite, setActiveTask, deleteEmployee } = await import('../src/controllers/hrController.js');
const { createOvertime, updateOvertime, updateTask, syncTaskCompletionFromDelivery } = await import('../src/controllers/taskController.js');
const employee = { role: 'employee', name: 'An' };
const leader = { role: 'leader', name: 'Leader Bình' };
const { readDb, writeDb } = await import('../src/models/db.js');

const today = localDateKey(new Date());
const assignment = { employeeId: 'e1', employeeName: 'An', startDate: today, endDate: today, estimatedHoursPerDay: 8 };
fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({
  projects: [{ id: 'p', name: 'Dự án', startDate: today, endDate: today }],
  employees: [{ id: 'e1', code: 'NV001', name: 'An', standardHours: 8, isOnSite: false }],
  tasks: [{ id: 't1', ganttId: 'g1', projectId: 'p', title: 'Bản vẽ', employeeId: 'e1', employeeName: 'An', assignees: [assignment], startDate: today, endDate: today, status: 'not_started' }],
  ganttItems: [{ id: 'g1', projectId: 'p', title: 'Bản vẽ', isGroup: false, assignees: [assignment], startDate: today, endDate: today, status: 'not_started' }],
  overtimes: []
}));

function call(handler, req) {
  let status = 200;
  let body;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
  handler({ params: {}, body: {}, ...req }, res);
  return { status, body };
}

test('choosing a task only starts it once the assignee is on shift', () => {
  assert.equal(call(setActiveTask, { params: { id: 'e1' }, body: { taskId: 't1' } }).status, 200);
  assert.equal(readDb().tasks[0].status, 'not_started', 'pre-selecting while absent must not start the task');

  assert.equal(call(toggleOnSite, { params: { id: 'e1' } }).status, 200);
  const db = readDb();
  assert.equal(db.tasks[0].status, 'in_progress');
  assert.equal(db.ganttItems[0].status, 'in_progress');
  assert.ok(db.tasks[0].startedAt);
});

test('an employee on shift or with open tasks cannot be deleted', () => {
  assert.equal(call(deleteEmployee, { params: { id: 'e1' } }).status, 409);
  call(toggleOnSite, { params: { id: 'e1' } });
  const blocked = call(deleteEmployee, { params: { id: 'e1' } });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /1 task/);
  assert.equal(readDb().employees.length, 1);
});

test('overtime adds Gantt hours only after approval', () => {
  const created = call(createOvertime, { body: { employeeId: 'e1', taskId: 't1', hours: 2, date: today, reason: 'Gấp' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'pending');
  assert.equal(readDb().ganttItems[0].overtimeHours, undefined);

  const id = created.body.data.id;
  assert.equal(call(updateOvertime, { params: { id }, body: { status: 'approved' }, deliveryUser: employee }).status, 403, 'employees cannot approve overtime');
  const approved = call(updateOvertime, { params: { id }, body: { status: 'approved' }, deliveryUser: leader });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.approvedBy, 'Leader Bình');
  assert.equal(readDb().ganttItems[0].overtimeHours, 2);
  assert.equal(call(updateOvertime, { params: { id }, body: { status: 'rejected' }, deliveryUser: leader }).status, 400, 'a reviewed slip cannot be reviewed again');
});

test('project tasks cannot be completed or reopened by hand, even by a reviewer', () => {
  const blocked = call(updateTask, { params: { id: 't1' }, body: { status: 'completed', progress: 100 }, deliveryUser: leader });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /trang Dự án/);
  assert.equal(readDb().tasks[0].status, 'in_progress');
});

test('an approved 100% delivery status completes the task; withdrawing it reopens and keeps hours', () => {
  let db = readDb();
  assert.equal(syncTaskCompletionFromDelivery(db, 'g1', 60, 'Leader Bình'), '', 'below 100% nothing changes');
  assert.equal(syncTaskCompletionFromDelivery(db, 'g1', 100, 'Leader Bình'), 'completed');
  writeDb(db);
  db = readDb();
  assert.equal(db.tasks[0].status, 'completed');
  assert.ok(db.tasks[0].completedAt);
  assert.equal(db.ganttItems[0].status, 'completed');
  assert.equal(db.employees[0].activeTaskId, null, 'the running session is closed on completion');
  const hours = db.tasks[0].actualWorkHours;

  assert.equal(syncTaskCompletionFromDelivery(db, 'g1', 100, 'Leader Bình'), '', 'idempotent');
  assert.equal(syncTaskCompletionFromDelivery(db, 'g1', 40, 'Leader Bình'), 'reopened');
  writeDb(db);
  db = readDb();
  const [task] = db.tasks;
  assert.equal(task.status, 'in_progress');
  assert.equal(task.completedAt, undefined);
  assert.equal(db.ganttItems[0].status, 'in_progress');
  assert.equal(db.ganttItems[0].completedAt, undefined);
  assert.equal(task.actualWorkHours, hours, 'recorded work hours survive a reopen');
  assert.equal(task.reopenHistory.at(-1).by, 'Leader Bình');
});

test('tasks completed before this rule are never reopened automatically', () => {
  const db = { tasks: [{ id: 'old', ganttId: 'gold', status: 'completed', completedAt: '2026-01-01T00:00:00Z' }], ganttItems: [{ id: 'gold', status: 'completed' }], employees: [] };
  assert.equal(syncTaskCompletionFromDelivery(db, 'gold', 0, 'x'), '');
  assert.equal(db.tasks[0].status, 'completed');
});
