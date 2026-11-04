import test from 'node:test';
import assert from 'node:assert/strict';
import { taskWorkProgress } from '../../frontend/src/utils/taskWorkProgress.js';

const task = {
  id: 't1', startDate: '2026-11-03', endDate: '2026-11-04', status: 'in_progress',
  assignees: [{ employeeId: 'a', estimatedHoursPerDay: 8 }, { employeeId: 'b', estimatedHoursPerDay: 4 }],
  actualWorkEntries: [{ employeeId: 'a', hours: 4 }, { employeeId: 'b', hours: 2 }],
};
const employees = [{ id: 'a', standardHours: 8 }, { id: 'b', standardHours: 8 }];

test('tiến độ theo số ngày của task × giờ một ngày của người làm', () => {
  // a: 4h / (2 ngày × 8h) = 25%; b: 2h / (2 ngày × 4h) = 25%; cả task: 6h / 24h = 25%.
  assert.equal(taskWorkProgress(task, { employees, viewerEmployeeId: 'a' }), 25);
  assert.equal(taskWorkProgress(task, { employees, viewerEmployeeId: 'b' }), 25);
  assert.equal(taskWorkProgress(task, { employees }), 25);
  // Đang ở văn phòng và chọn task: phiên đang chạy được cộng vào (a làm thêm 4h → 8/16 = 50%).
  const running = [{ id: 'a', standardHours: 8, activeTaskId: 't1', isOnSite: true, isOnBreak: false, workSessionStartedAt: '2026-11-03T05:00:00.000Z' }];
  assert.equal(taskWorkProgress(task, { employees: running, viewerEmployeeId: 'a', now: new Date('2026-11-03T09:00:00.000Z') }), 50);
  // Tạm nghỉ thì phiên không chạy.
  assert.equal(taskWorkProgress(task, { employees: [{ ...running[0], isOnBreak: true }], viewerEmployeeId: 'a', now: new Date('2026-11-03T09:00:00.000Z') }), 25);
  assert.equal(taskWorkProgress({ ...task, status: 'completed' }, { employees }), 100);
});
