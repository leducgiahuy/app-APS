import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import * as backendShift from '../src/utils/shift.js';
import * as frontendShift from '../../frontend/src/utils/shift.js';
import * as assignmentCalendar from '../../frontend/src/utils/assignmentCalendar.js';
import * as workSchedule from '../../frontend/src/utils/workSchedule.js';

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
  const codes = new vm.SourceTextModule(await readFile(new URL('../src/utils/employeeCodes.js', import.meta.url), 'utf8'), { context });
  const calendar = new vm.SyntheticModule(Object.keys(assignmentCalendar), function () {
    for (const [key, value] of Object.entries(assignmentCalendar)) this.setExport(key, value);
  }, { context });
  const schedule = new vm.SyntheticModule(Object.keys(workSchedule), function () {
    for (const [key, value] of Object.entries(workSchedule)) this.setExport(key, value);
  }, { context });
  const cryptoModule = new vm.SyntheticModule(['randomUUID'], function () {
    this.setExport('randomUUID', randomUUID);
  }, { context });
  const attendance = new vm.SourceTextModule(await readFile(new URL('../src/utils/appAttendance.js', import.meta.url), 'utf8'), { context });
  const cleanup = new vm.SourceTextModule(await readFile(new URL('../src/utils/deletionCleanup.js', import.meta.url), 'utf8'), { context });
  const controller = new vm.SourceTextModule(await readFile(new URL('../src/controllers/hrController.js', import.meta.url), 'utf8'), { context });
  await controller.link(specifier => specifier.includes('models/db') ? dbModule : specifier.includes('employeeCodes') ? codes : specifier.includes('assignmentCalendar') ? calendar : specifier.includes('workSchedule') ? schedule : specifier.includes('appAttendance') ? attendance : specifier.includes('deletionCleanup') ? cleanup : specifier === 'node:crypto' ? cryptoModule : rules);
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

test('regular task selection respects the saved holiday exclusion policy', async () => {
  const { db, call, setTime } = await harness();
  setTime('2026-11-24T09:00:00+07:00');
  db.tasks[0].startDate = '2026-11-23';
  db.tasks[0].endDate = '2026-11-25';
  db.tasks[0].assignees = [{ employeeId: 'e', startDate: '2026-11-23', endDate: '2026-11-25', excludeNonWorkingDays: true }];
  assert.equal(call('setActiveTask', { taskId: 't', shiftType: 'regular' }).status, 400);
  db.tasks[0].assignees[0].excludeNonWorkingDays = false;
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
  // Ca tự kết thúc vẫn lưu giờ có mặt để đối chiếu phiếu giờ về sau.
  assert.equal(JSON.stringify(db.appAttendance.map(row => [row.date, row.hours, row.checkOutAt, row.shiftType])), JSON.stringify([['2026-10-09', 2, '2026-10-09T13:00:00.000Z', 'overtime']]));
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

test('ca thường theo giờ công ty: vào từ 7:45, sau 8:00 báo đi trễ, Chủ nhật không có ca thường', async () => {
  const { db, call, setTime } = await harness();
  setTime('2026-11-04T07:30:00+07:00');
  const early = call('toggleOnSite', { shiftType: 'regular' });
  assert.equal(early.status, 400);
  assert.match(early.message, /Chưa tới giờ vào ca.*từ 7:45/);
  assert.equal(db.employees[0].isOnSite, false);
  setTime('2026-11-04T08:25:00+07:00');
  const late = call('toggleOnSite', { shiftType: 'regular' });
  assert.equal(late.status, 200);
  assert.match(late.message, /Đi trễ 25 phút/);
  assert.equal(db.employees[0].lateMinutes, 25);
  setTime('2026-11-08T09:00:00+07:00');
  db.employees[0].isOnSite = false;
  assert.match(call('toggleOnSite', { shiftType: 'regular' }).message, /Chủ nhật \/ ngày lễ/);
});

test('ca thường: tạm nghỉ chỉ trong 12:00–13:30, tự làm lại lúc 13:30, tự rời lúc 17:30 và chỉ tính giờ trong khung ca', async () => {
  const { db, call, setTime } = await harness();
  setTime('2026-11-04T07:50:00+07:00');
  assert.equal(call('toggleOnSite', { shiftType: 'regular' }).status, 200);
  setTime('2026-11-04T11:00:00+07:00');
  assert.match(call('toggleBreak').message, /Chỉ được tạm nghỉ trong giờ nghỉ trưa 12:00–13:30/);
  setTime('2026-11-04T12:05:00+07:00');
  assert.equal(call('toggleBreak').status, 200);
  assert.equal(db.employees[0].isOnBreak, true);
  setTime('2026-11-04T13:40:00+07:00');
  call('getEmployees');
  assert.equal(db.employees[0].isOnBreak, false, 'hết giờ trưa tự quay lại làm');
  setTime('2026-11-04T17:45:00+07:00');
  call('getEmployees');
  assert.equal(db.employees[0].isOnSite, false, 'tới 17:30 tự rời văn phòng');
  assert.equal(new Date(db.employees[0].lastShiftCheckOutAt).toISOString(), new Date('2026-11-04T17:30:00+07:00').toISOString());
  assert.equal(db.appAttendance.at(-1).hours, 8, '8:00–12:00 + 13:30–17:30 = 8h, không tính 7:50–8:00 và giờ trưa');
});

test('ca thường thứ Bảy 8:00–12:00 tự rời lúc 12:00; rời sớm ngày thường báo số giờ còn lại', async () => {
  const { db, call, setTime } = await harness();
  setTime('2026-11-07T08:00:00+07:00');
  assert.equal(call('toggleOnSite', { shiftType: 'regular' }).status, 200);
  setTime('2026-11-07T12:20:00+07:00');
  call('getEmployees');
  assert.equal(db.employees[0].isOnSite, false);
  assert.equal(db.appAttendance.at(-1).hours, 4);
  setTime('2026-11-09T09:00:00+07:00');
  assert.equal(call('toggleOnSite', { shiftType: 'regular' }).status, 200);
  setTime('2026-11-09T15:00:00+07:00');
  const leave = call('toggleOnSite', { shiftType: 'regular' });
  assert.match(leave.message, /sớm, còn 2 giờ 30 phút mới hết ca \(17:30\)/);
  assert.deepEqual([db.appAttendance.at(-1).hours, db.appAttendance.at(-1).earlyLeaveMinutes], [4.5, 150]);
});
