import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCalendarFix, planCalendarFix, plannedItemHours } from '../src/utils/calendarFix.js';
import { nonWorkingDay } from '../../frontend/src/utils/assignmentCalendar.js';

// Dự án đang chạy (người dùng chốt 24/11/2026): sửa mã MOI + dời việc chưa bắt đầu khỏi ngày nghỉ, không xóa / tạo lại.
const assign = (start, end, hpd = 8) => [{ employeeId: 'e', employeeName: 'Duy', startDate: start, endDate: end, estimatedHoursPerDay: hpd, excludeNonWorkingDays: true }];
const fixture = () => ({
  projects: [{ id: 'p', name: 'Vinatech', startDate: '2026-11-01', endDate: '2027-10-31' }],
  tasks: [{ id: 't-a2', ganttId: 'a2', projectId: 'p', startDate: '2027-02-04', endDate: '2027-02-05', status: 'not_started', assignees: assign('2027-02-04', '2027-02-05') }],
  ganttItems: [
    { id: 'gC', projectId: 'p', isGroup: true, code: 'C', title: 'C. Hồ sơ đấu thầu', startDate: '2027-01-25', endDate: '2027-02-12' },
    { id: 'c3', projectId: 'p', parentGroupId: 'gC', code: 'C.3', title: 'Hỗ trợ đánh giá', startDate: '2027-01-25', endDate: '2027-01-26', assignees: assign('2027-01-25', '2027-01-26') },
    { id: 'm1', projectId: 'p', parentGroupId: 'gC', code: 'MOI', title: 'Phát hành bản vẽ', startDate: '2027-02-01', endDate: '2027-02-02', assignees: assign('2027-02-01', '2027-02-02') },
    { id: 'a1', projectId: 'p', parentGroupId: 'gC', code: 'MOI', title: 'Dính đầu Tết', startDate: '2027-02-03', endDate: '2027-02-04', assignees: assign('2027-02-03', '2027-02-04') },
    { id: 'a2', projectId: 'p', parentGroupId: 'gC', code: 'C.9', title: 'Nằm trọn trong Tết', startDate: '2027-02-04', endDate: '2027-02-05', assignees: assign('2027-02-04', '2027-02-05') },
    { id: 's1', projectId: 'p', parentGroupId: 'gC', code: 'C.10', title: 'Đã bắt đầu', status: 'in_progress', startDate: '2027-02-07', endDate: '2027-02-08', assignees: assign('2027-02-07', '2027-02-08') },
  ],
  delivery: { projects: { p: { records: {}, timesheets: [] } } },
});

test('xem trước không sửa dữ liệu; liệt kê mã MOI và việc dính ngày nghỉ, bỏ qua việc đã bắt đầu', () => {
  const db = fixture(), before = structuredClone(db);
  const plan = planCalendarFix(db, 'p');
  assert.deepEqual(db, before);
  assert.deepEqual(plan.codeChanges.map(row => [row.from, row.to]), [['MOI', 'C.11'], ['MOI', 'C.12']]);
  assert.deepEqual(plan.dateChanges.map(row => row.id), ['a1', 'a2']);
  assert.deepEqual(plan.startedOnHoliday.map(row => row.id), ['s1']);
});

test('áp dụng: đổi mã, dời việc khỏi ngày nghỉ, giữ giờ dự kiến, đồng bộ task liên kết, việc khác giữ nguyên', () => {
  const db = fixture();
  const hoursBefore = Object.fromEntries(db.ganttItems.map(item => [item.id, plannedItemHours(item)]));
  applyCalendarFix(db, 'p');
  const by = id => db.ganttItems.find(item => item.id === id);
  assert.equal(by('m1').code, 'C.11');
  assert.deepEqual([by('a1').startDate, by('a1').endDate], ['2027-02-03', '2027-02-03'], 'cắt phần dính Tết');
  assert.equal(nonWorkingDay(by('a2').startDate), null);
  assert.ok(by('a2').startDate >= '2027-02-11', 'việc nằm trọn trong Tết dời sang sau Tết');
  assert.deepEqual([db.tasks[0].startDate, db.tasks[0].endDate], [by('a2').startDate, by('a2').endDate]);
  assert.equal(Math.round(plannedItemHours(by('a1'))), Math.round(hoursBefore.a1), 'giờ dự kiến không hao hụt');
  assert.deepEqual([by('c3').startDate, by('m1').startDate, by('s1').startDate], ['2027-01-25', '2027-02-01', '2027-02-07'], 'việc không dính ngày nghỉ / đã bắt đầu giữ nguyên');
  assert.ok(by('gC').endDate >= by('a2').endDate, 'nhóm bao trùm lại việc con');
});
