import test from 'node:test';
import assert from 'node:assert/strict';
import { regularClockInDateWarning } from '../../frontend/src/utils/shift.js';

const employee = { id: 'e', name: 'Thinh' };
const upcomingTask = {
  id: 'future', title: 'Abc', startDate: '2026-11-01', endDate: '2026-11-03',
  assignees: [{ employeeId: 'e' }]
};

test('warns before task date, including when viewing a future day', () => {
  for (const viewedDate of ['2026-10-08', '2026-11-01']) {
    const message = regularClockInDateWarning([upcomingTask], employee, '2026-10-08', viewedDate);
    assert.match(message, /Abc/);
    assert.match(message, /01\/11\/2026/);
  }
  assert.equal(regularClockInDateWarning([upcomingTask], employee, '2026-11-01'), '');
});

test('uses employee assignment dates and ignores other employees or completed tasks', () => {
  const task = { ...upcomingTask, startDate: '2026-10-01', assignees: [{ employeeId: 'e', startDate: '2026-11-02' }] };
  assert.match(regularClockInDateWarning([task], employee, '2026-10-08'), /02\/11\/2026/);
  assert.equal(regularClockInDateWarning([{ ...task, status: 'completed' }], employee, '2026-10-08'), '');
  assert.equal(regularClockInDateWarning([task], { id: 'other', name: 'Thinh' }, '2026-10-08'), '');
});

test('future assignments do not block another task available today', () => {
  const todayTask = { id: 'current', title: 'Today', employeeId: 'e', startDate: '2026-10-08', endDate: '2026-10-09' };
  assert.equal(regularClockInDateWarning([todayTask, upcomingTask], employee, '2026-10-08'), '');
  assert.match(regularClockInDateWarning([todayTask, upcomingTask], { ...employee, activeTaskId: 'future' }, '2026-10-08'), /Abc/);
  assert.equal(regularClockInDateWarning([], employee, '2026-10-08'), '');
});
