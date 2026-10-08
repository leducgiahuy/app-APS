import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as backendShift from '../src/utils/shift.js';
import * as frontendShift from '../../frontend/src/utils/shift.js';

test('frontend and backend enforce Vietnam overtime boundaries', () => {
  const cases = [
    ['2026-10-09T17:59:59+07:00', false],
    ['2026-10-09T18:00:00+07:00', true],
    ['2026-10-10T13:29:59+07:00', false],
    ['2026-10-10T13:30:00+07:00', true],
    ['2026-10-11T18:00:00+07:00', false],
    ['2026-10-12T00:30:00+07:00', false]
  ];
  for (const [timestamp, allowed] of cases) {
    for (const rules of [frontendShift, backendShift]) {
      assert.equal(rules.isOvertimeClockInAllowed(new Date(timestamp)).ok, allowed, timestamp);
      assert.equal(rules.localDateKey(new Date(timestamp)), timestamp.slice(0, 10));
    }
  }
});

test('OT filters isolate employee, date, approval and deduplicate tasks', () => {
  const emp = { id: 'e', name: 'Hiếu' };
  const entries = [
    { id: '1', employeeId: 'e', date: '2026-10-09', taskId: 't', hours: 1, status: 'approved' },
    { id: '2', employeeName: ' HIẾU ', date: '2026-10-09', taskId: 't', hours: 2 },
    { id: '3', employeeId: 'other', employeeName: 'Hiếu', date: '2026-10-09', hours: 9 },
    { id: '4', employeeId: 'e', date: '2026-10-08', hours: 9 },
    { id: '5', employeeId: 'e', date: '2026-10-09', hours: 9, status: 'pending' }
  ];
  for (const rules of [frontendShift, backendShift]) {
    assert.equal(rules.overtimeHoursForDate(entries, emp, '2026-10-09'), 3);
  }
  const tasks = frontendShift.overtimeTasksFromEntries(frontendShift.employeeOtEntries(entries, emp, '2026-10-09'), [{ id: 't', title: 'Task' }]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].overtimeHours, 3);
});

async function harness() {
  let now = Date.parse('2026-10-09T18:00:00+07:00');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const db = {
    employees: [{ id: 'e', name: 'Hiếu', standardHours: 8, isOnSite: false }],
    tasks: [{ id: 't', ganttId: 'g', title: 'Task', employeeId: 'other', startDate: '2026-10-01', endDate: '2026-10-02', status: 'in_progress' }],
    ganttItems: [{ id: 'g', title: 'Task', employeeId: 'other', startDate: '2026-10-01', endDate: '2026-10-02', status: 'in_progress' }],
    overtimes: [{ id: 'o', taskId: 't', employeeId: 'e', date: '2026-10-09', hours: 2, status: 'approved' }]
  };
  const context = vm.createContext({ Date: Clock, Intl });
  const dbModule = new vm.SyntheticModule(['readDb', 'writeDb'], function () {
    this.setExport('readDb', () => db);
    this.setExport('writeDb', () => true);
  }, { context });
  const rules = new vm.SourceTextModule(await readFile(new URL('../src/utils/shift.js', import.meta.url), 'utf8'), { context });
  const controller = new vm.SourceTextModule(await readFile(new URL('../src/controllers/hrController.js', import.meta.url), 'utf8'), { context });
  await controller.link(specifier => specifier.includes('models/db') ? dbModule : rules);
  await controller.evaluate();
  function call(name, body = {}) {
    let status = 200;
    let result;
    const res = { status(code) { status = code; return this; }, json(value) { result = value; return this; } };
    controller.namespace[name]({ params: { id: 'e' }, body }, res);
    return { status, ...result };
  }
  return { db, call, setTime: value => { now = Date.parse(value); } };
}

test('OT sessions synchronize task and Gantt, excluding breaks and preserving resume time during polling', async () => {
  const { db, call, setTime } = await harness();
  assert.equal(call('setActiveTask', { taskId: 't', shiftType: 'overtime' }).status, 200);
  assert.equal(call('toggleOnSite', { shiftType: 'overtime' }).status, 200);
  assert.equal(db.tasks[0].workSessionStartedAt, '2026-10-09T11:00:00.000Z');
  setTime('2026-10-09T18:30:00+07:00');
  call('toggleBreak');
  assert.equal(db.tasks[0].actualWorkHours, 0.5);
  assert.equal(db.tasks[0].workSessionStartedAt, null);
  setTime('2026-10-09T19:00:00+07:00');
  call('toggleBreak');
  call('getEmployees');
  assert.equal(db.tasks[0].workSessionStartedAt, '2026-10-09T12:00:00.000Z');
  setTime('2026-10-09T19:30:00+07:00');
  call('toggleOnSite', { shiftType: 'overtime' });
  for (const item of [db.tasks[0], db.ganttItems[0]]) {
    assert.equal(item.actualWorkHours, 1);
    assert.equal(item.actualWorkEntries.length, 2);
    assert.ok(item.actualWorkEntries.every(entry => entry.shiftType === 'overtime'));
  }
  assert.equal(db.employees[0].isOnSite, false);
  assert.equal(db.employees[0].lastShiftType, 'overtime');
});

test('API rejects early OT and changing shift type mid-session without changing employee', async () => {
  const { db, call, setTime } = await harness();
  call('setActiveTask', { taskId: 't', shiftType: 'overtime' });
  setTime('2026-10-09T17:59:00+07:00');
  assert.equal(call('toggleOnSite', { shiftType: 'overtime' }).status, 400);
  assert.equal(db.employees[0].isOnSite, false);
  setTime('2026-10-09T18:00:00+07:00');
  call('toggleOnSite', { shiftType: 'overtime' });
  assert.equal(call('setActiveTask', { taskId: 't', shiftType: 'regular' }).status, 400);
  assert.equal(db.employees[0].shiftType, 'overtime');
});

test('regular assignments respect each employee date range', async () => {
  const { db, call } = await harness();
  db.tasks[0].startDate = '2026-10-01';
  db.tasks[0].endDate = '2026-10-30';
  db.tasks[0].assignees = [{ employeeId: 'e', startDate: '2026-10-10', endDate: '2026-10-12' }];
  assert.equal(call('setActiveTask', { taskId: 't', shiftType: 'regular' }).status, 400);
  db.tasks[0].assignees[0].startDate = '2026-10-09';
  assert.equal(call('setActiveTask', { taskId: 't', shiftType: 'regular' }).status, 200);
});

test('automatic OT checkout closes exactly the approved hours', async () => {
  const { db, call, setTime } = await harness();
  call('setActiveTask', { taskId: 't', shiftType: 'overtime' });
  call('toggleOnSite', { shiftType: 'overtime' });
  setTime('2026-10-09T20:30:00+07:00');
  const response = call('getEmployees');
  assert.equal(response.meta.autoCheckedOutIds[0], 'e');
  assert.equal(db.tasks[0].actualWorkHours, 2);
  assert.equal(db.employees[0].lastShiftCheckOutAt, '2026-10-09T13:00:00.000Z');
});

test('OT without linked task supports break, resume and checkout', async () => {
  const { db, call } = await harness();
  db.overtimes[0].taskId = 'general';
  assert.equal(call('setActiveTask', { taskId: 'ot:o', shiftType: 'overtime' }).status, 200);
  assert.equal(call('toggleOnSite', { shiftType: 'overtime' }).status, 200);
  call('toggleBreak');
  call('toggleBreak');
  assert.equal(db.employees[0].isOnBreak, false);
  call('toggleOnSite', { shiftType: 'overtime' });
  assert.equal(db.employees[0].isOnSite, false);
});

test('removing OT approval stops the active task and keeps already worked hours', async () => {
  const { db, call, setTime } = await harness();
  call('setActiveTask', { taskId: 't', shiftType: 'overtime' });
  call('toggleOnSite', { shiftType: 'overtime' });
  setTime('2026-10-09T18:30:00+07:00');
  db.overtimes = [];
  call('getEmployees');
  assert.equal(db.employees[0].activeTaskId, null);
  assert.equal(db.tasks[0].actualWorkHours, 0.5);
  assert.equal(db.tasks[0].workSessionStartedAt, null);
});

test('reselecting the active task does not restart or lose its timer', async () => {
  const { db, call, setTime } = await harness();
  call('setActiveTask', { taskId: 't', shiftType: 'overtime' });
  call('toggleOnSite', { shiftType: 'overtime' });
  setTime('2026-10-09T18:30:00+07:00');
  call('setActiveTask', { taskId: 't', shiftType: 'overtime' });
  assert.equal(db.employees[0].workSessionStartedAt, '2026-10-09T11:00:00.000Z');
  call('toggleOnSite', { shiftType: 'overtime' });
  assert.equal(db.tasks[0].actualWorkHours, 0.5);
});

test('checkout polling after midnight still caps the original OT shift', async () => {
  const { db, call, setTime } = await harness();
  call('setActiveTask', { taskId: 't', shiftType: 'overtime' });
  call('toggleOnSite', { shiftType: 'overtime' });
  setTime('2026-10-10T00:30:00+07:00');
  call('getEmployees');
  assert.equal(db.tasks[0].actualWorkHours, 2);
  assert.equal(db.employees[0].isOnSite, false);
});
