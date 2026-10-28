import test from 'node:test';
import assert from 'node:assert/strict';
import { regularClockInDateWarning } from '../../frontend/src/utils/shift.js';

const employee = { id: 'e', name: 'Thinh' };
const upcomingTask = {
  id: 'future', title: 'Abc', startDate: '2026-11-01', endDate: '2026-11-03',
  assignees: [{ employeeId: 'e' }]
};
const otherFutureTask = { id: 'later', title: 'Đánh giá chi tiết HSDT', startDate: '2027-05-03', endDate: '2027-05-04', employeeId: 'e' };

test('future day is blocked and lists only the tasks shown for that day', () => {
  const message = regularClockInDateWarning([upcomingTask, otherFutureTask], employee, '2026-10-08', '2026-11-01', [upcomingTask]);
  assert.match(message, /01\/11\/2026/);
  assert.match(message, /• Abc/);
  assert.doesNotMatch(message, /HSDT/, 'tasks of other days must not be named');
});

test('future day without tasks is still blocked without inventing a task name', () => {
  const message = regularClockInDateWarning([otherFutureTask], employee, '2026-10-08', '2026-10-20', []);
  assert.match(message, /Chưa tới ngày 20\/10\/2026/);
  assert.doesNotMatch(message, /HSDT/);
});

test('completed tasks are not listed in the future-day warning', () => {
  const message = regularClockInDateWarning([], employee, '2026-10-08', '2026-11-01', [{ ...upcomingTask, status: 'completed' }]);
  assert.doesNotMatch(message, /Abc/);
});

test('past days are closed', () => {
  assert.match(regularClockInDateWarning([], employee, '2026-10-08', '2026-10-07'), /đã kết thúc/);
});

test('today is open unless the pre-selected task starts later for this employee', () => {
  const todayTask = { id: 'current', title: 'Today', employeeId: 'e', startDate: '2026-10-08', endDate: '2026-10-09' };
  assert.equal(regularClockInDateWarning([todayTask, upcomingTask], employee, '2026-10-08'), '');
  assert.equal(regularClockInDateWarning([upcomingTask], employee, '2026-10-08'), '', 'future assignments do not block attendance today');
  assert.equal(regularClockInDateWarning([], employee, '2026-10-08'), '');
  assert.match(regularClockInDateWarning([todayTask, upcomingTask], { ...employee, activeTaskId: 'future' }, '2026-10-08'), /Abc/);

  const ownDates = { ...upcomingTask, startDate: '2026-10-01', assignees: [{ employeeId: 'e', startDate: '2026-11-02' }] };
  assert.match(regularClockInDateWarning([ownDates], { ...employee, activeTaskId: 'future' }, '2026-10-08'), /02\/11\/2026/);
  assert.equal(regularClockInDateWarning([{ ...ownDates, status: 'completed' }], { ...employee, activeTaskId: 'future' }, '2026-10-08'), '');
});
