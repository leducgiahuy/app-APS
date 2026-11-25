import test from 'node:test';
import assert from 'node:assert/strict';
import { workingDaysInRange } from '../../frontend/src/utils/assignmentCalendar.js';

test('số ngày làm: bỏ Chủ nhật / lễ theo lịch dự án, thứ 7 = 0,5', () => {
  // 26/11/2026 (T5) → 30/11/2026 (T2): T5 1 + T6 1 + T7 0,5 + CN 0 + T2 1.
  assert.equal(workingDaysInRange('2026-11-26', '2026-11-30'), 3.5);
  assert.equal(workingDaysInRange('2026-11-27', '2026-11-30'), 2.5);
  assert.equal(workingDaysInRange('2026-11-26', '2026-11-30', 'sunday'), 4.5, 'dự án làm Chủ nhật thì tính Chủ nhật');
  assert.equal(workingDaysInRange('2026-11-29', '2026-11-29'), 0);
  assert.equal(workingDaysInRange('', '2026-11-29'), null);
});

test('thanh Gantt đứt khúc ở Chủ nhật theo lịch dự án, dù người làm không chọn bỏ ngày nghỉ', async () => {
  const { ganttBarDates } = await import('../../frontend/src/utils/assignmentCalendar.js');
  const item = { startDate: '2026-11-27', endDate: '2026-11-30', workCalendar: 'none', assignees: [{ startDate: '2026-11-27', endDate: '2026-11-30', excludeNonWorkingDays: false }] };
  assert.deepEqual(ganttBarDates(item), { dates: ['2026-11-27', '2026-11-28', '2026-11-30'], split: true });
  assert.equal(ganttBarDates({ ...item, workCalendar: 'sunday' }).split, false, 'dự án bật làm Chủ nhật thì vẽ liền');
  assert.equal(ganttBarDates({ ...item, startDate: '2026-11-29', endDate: '2026-11-29', assignees: [] }).split, false, 'việc nằm trọn ngày nghỉ vẫn vẽ');
});
