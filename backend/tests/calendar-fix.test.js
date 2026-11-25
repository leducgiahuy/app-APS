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

// Lịch ngày nghỉ của dự án (người dùng chốt 25/11/2026): 1. làm lễ + CN · 2. không làm lễ, chỉ làm CN · 3. không làm lễ và CN.
test('ba lựa chọn lịch ngày nghỉ: ngày làm đúng theo lựa chọn, Chủ nhật / lễ có làm tính 8 tiếng', async () => {
  const { WORK_CALENDARS } = await import('../../frontend/src/utils/assignmentCalendar.js');
  const { dayWorkHours } = await import('../../frontend/src/utils/workSchedule.js');
  assert.deepEqual(Object.keys(WORK_CALENDARS).sort(), ['all', 'none', 'sunday']);
  const sunday = '2026-11-29', holiday = '2027-02-08'; // CN thường · Tết Đinh Mùi (thứ 2)
  assert.ok(nonWorkingDay(sunday, 'none')); assert.ok(nonWorkingDay(holiday, 'none'));
  assert.equal(nonWorkingDay(sunday, 'sunday'), null); assert.ok(nonWorkingDay(holiday, 'sunday'));
  assert.equal(nonWorkingDay(sunday, 'all'), null); assert.equal(nonWorkingDay(holiday, 'all'), null);
  assert.equal(dayWorkHours(sunday, 'sunday'), 8); assert.equal(dayWorkHours(holiday, 'all'), 8); assert.equal(dayWorkHours(sunday), 0);
});

test('chọn "làm lễ + Chủ nhật": không dời việc nào, mọi việc giữ tổng giờ, lưu lựa chọn cho dự án và task sau này', async () => {
  const { normalizeAssignmentSchedules } = await import('../../frontend/src/utils/assignmentCalendar.js');
  const db = fixture();
  const hoursBefore = Object.fromEntries(db.ganttItems.filter(item => !item.isGroup).map(item => [item.id, plannedItemHours(item)]));
  const plan = applyCalendarFix(db, 'p', 'all');
  assert.equal(plan.dateChanges.length, 0, 'không còn ngày nghỉ nào để tránh');
  assert.equal(plan.policy, 'all'); assert.equal(plan.oldPolicy, 'none');
  assert.equal(db.projects[0].workCalendar, 'all');
  // Việc nằm trọn trong Tết trước đây có 0 giờ (toàn ngày nghỉ); nay Tết là ngày làm → có giờ theo giờ/ngày đã phân công.
  assert.equal(plannedItemHours(db.ganttItems.find(item => item.id === 'a2')), 16);
  for (const item of db.ganttItems.filter(entry => !entry.isGroup)) {
    assert.equal(item.workCalendar, 'all');
    const before = hoursBefore[item.id];
    if (before > 0) assert.equal(Math.round(plannedItemHours(item) * 100) / 100, Math.round(before * 100) / 100, `${item.code}: giữ tổng giờ`);
  }
  // Task thêm sau này tự nhận lịch của dự án.
  db.ganttItems.push({ id: 'new', projectId: 'p', code: 'C.20', title: 'Việc mới', startDate: '2027-02-06', endDate: '2027-02-07', assignees: assign('2027-02-06', '2027-02-07') });
  normalizeAssignmentSchedules(db);
  assert.equal(db.ganttItems.at(-1).workCalendar, 'all');
});

test('chọn "không làm lễ, chỉ làm Chủ nhật": việc chỉ dính Chủ nhật không bị dời, việc dính lễ vẫn được dời', () => {
  const db = fixture();
  db.ganttItems.push({ id: 'sun', projectId: 'p', parentGroupId: 'gC', code: 'C.30', title: 'Dính Chủ nhật', startDate: '2026-11-29', endDate: '2026-11-30', assignees: assign('2026-11-29', '2026-11-30') });
  const none = planCalendarFix(db, 'p', 'none');
  assert.ok(none.dateChanges.some(row => row.id === 'sun'), 'lịch mặc định: dời khỏi Chủ nhật');
  const sunday = planCalendarFix(db, 'p', 'sunday');
  assert.ok(!sunday.dateChanges.some(row => row.id === 'sun'), 'làm Chủ nhật: giữ ngày');
  assert.ok(sunday.dateChanges.some(row => row.id === 'a2'), 'vẫn dời việc nằm trong Tết');
  assert.ok(sunday.hourChanges.some(row => row.id === 'sun'), 'chia lại giờ/ngày vì Chủ nhật thành ngày làm');
});

test('việc đã bắt đầu: không dời ngày, chỉ tính lại ngày làm theo lịch mới', () => {
  const db = fixture();
  // s1 đã bắt đầu, phân công 2 ngày; kéo từ thứ 3 02/02 để có tổng giờ cần giữ.
  const s1 = db.ganttItems.find(item => item.id === 's1');
  Object.assign(s1, { startDate: '2027-02-02', endDate: '2027-02-08' });
  s1.assignees = assign('2027-02-02', '2027-02-08');
  const before = plannedItemHours(s1);
  assert.ok(before > 0);
  const plan = applyCalendarFix(db, 'p', 'all');
  assert.ok(plan.startedOnHoliday.length === 0 && !plan.dateChanges.some(row => row.id === 's1'), 'không dời');
  assert.deepEqual([s1.startDate, s1.endDate], ['2027-02-02', '2027-02-08'], 'giữ ngày');
  assert.equal(Math.round(plannedItemHours(s1) * 100) / 100, Math.round(before * 100) / 100, 'giữ tổng giờ, chia đều ra cả ngày lễ / Chủ nhật');
  assert.ok(plan.hourChanges.some(row => row.id === 's1'));
});
