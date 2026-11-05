import test from 'node:test';
import assert from 'node:assert/strict';
import { taskWorkPace, taskWorkProgress } from '../../frontend/src/utils/taskWorkProgress.js';

// Task thứ Ba 03/11 – thứ Tư 04/11/2026; a làm 8h/ngày, b làm 4h/ngày; đã chốt a 4h, b 2h.
const task = {
  id: 't1', startDate: '2026-11-03', endDate: '2026-11-04', status: 'in_progress',
  assignees: [{ employeeId: 'a', estimatedHoursPerDay: 8 }, { employeeId: 'b', estimatedHoursPerDay: 4 }],
  actualWorkEntries: [{ employeeId: 'a', hours: 4 }, { employeeId: 'b', hours: 2 }],
};
const absent = [{ id: 'a', standardHours: 8 }, { id: 'b', standardHours: 8 }];
const at = time => new Date(`2026-11-04T${time}:00+07:00`);

test('vạch kế hoạch chạy theo giờ công ty (8:00–17:30, không tính nghỉ trưa)', () => {
  // 10:00 thứ Tư: ngày 03/11 đủ + 2/8 giờ công ty của hôm nay. a: (8 + 2) / 16 = 62%; b: (4 + 1) / 8 = 62%.
  assert.equal(taskWorkPace(task, { employees: absent, viewerEmployeeId: 'a', now: at('10:00') }).planPercent, 62);
  assert.equal(taskWorkPace(task, { employees: absent, viewerEmployeeId: 'b', now: at('10:00') }).planPercent, 62);
  assert.equal(taskWorkPace(task, { employees: absent, now: at('10:00') }).planPercent, 62);
  // Giờ nghỉ trưa không chạy: 12:00 và 13:30 cùng một mức (8 + 4) / 16 = 75%.
  assert.equal(taskWorkPace(task, { employees: absent, viewerEmployeeId: 'a', now: at('12:00') }).planPercent, 75);
  assert.equal(taskWorkPace(task, { employees: absent, viewerEmployeeId: 'a', now: at('13:30') }).planPercent, 75);
  // Trước giờ làm của ngày đầu: 0%; hết giờ ngày cuối: 100%.
  assert.equal(taskWorkPace(task, { employees: absent, viewerEmployeeId: 'a', now: new Date('2026-11-03T07:00:00+07:00') }).planPercent, 0);
  assert.equal(taskWorkPace(task, { employees: absent, viewerEmployeeId: 'a', now: at('17:30') }).planPercent, 100);
});

test('thanh = giờ làm thật: không vào ca / hết ca thì đứng yên, không tự nhảy theo giờ công ty', () => {
  // a đã chốt 4h / 16h = 25% dù giờ công ty đã tới 62% → chậm 6h (37,5% kế hoạch) = đỏ.
  const pace = taskWorkPace(task, { employees: absent, viewerEmployeeId: 'a', now: at('10:00') });
  assert.equal(pace.progress, 25);
  assert.equal(pace.behindHours, 6);
  assert.equal(pace.tone, 'danger');
  assert.equal(taskWorkProgress(task, { employees: absent, viewerEmployeeId: 'a', now: at('17:30') }), 25, 'hết ngày vẫn 25%');
});

test('đang trong ca: thanh cộng phiên đang chạy từ lúc chọn task, nghỉ trưa không tính', () => {
  const onShift = extra => [{ id: 'a', standardHours: 8, isOnSite: true, checkInAt: at('08:00').toISOString(), shiftType: 'regular', activeTaskId: 't1', isOnBreak: false, workSessionStartedAt: at('08:00').toISOString(), ...extra }];
  // Đã làm 4h các ngày trước + phiên 8:00–10:00 = 6 / 16 = 37%.
  assert.equal(taskWorkProgress(task, { employees: onShift(), viewerEmployeeId: 'a', now: at('10:00') }), 37);
  // Phiên 11:00–14:00 chỉ tính 11:00–12:00 và 13:30–14:00 = 1,5h → (4 + 1,5) / 16 = 34%.
  assert.equal(taskWorkProgress(task, { employees: onShift({ workSessionStartedAt: at('11:00').toISOString() }), viewerEmployeeId: 'a', now: at('14:00') }), 34);
  // Đang tạm nghỉ hoặc đã chuyển sang task khác: thanh đứng ở phần đã chốt.
  assert.equal(taskWorkProgress(task, { employees: onShift({ isOnBreak: true }), viewerEmployeeId: 'a', now: at('10:00') }), 25);
  assert.equal(taskWorkProgress(task, { employees: onShift({ activeTaskId: 'other' }), viewerEmployeeId: 'a', now: at('10:00') }), 25);
  assert.equal(taskWorkProgress({ ...task, status: 'completed' }, { employees: absent }), 100);
});

test('màu chậm theo % kế hoạch: ≤ 5% xanh, 5–10% vàng, > 10% đỏ; làm vượt = xanh', () => {
  // Kế hoạch 16h; 10:00 thứ Tư kế hoạch đến giờ này 10h.
  const one = hours => ({ ...task, assignees: [task.assignees[0]], actualWorkEntries: [{ employeeId: 'a', hours }] });
  const tone = hours => taskWorkPace(one(hours), { employees: absent, now: at('10:00') }).tone;
  assert.equal(tone(9.5), 'good', 'chậm 0,5h = 3%');
  assert.equal(tone(9), 'warning', 'chậm 1h = 6%');
  assert.equal(tone(8), 'danger', 'chậm 2h = 12,5%');
  assert.equal(tone(12), 'good', 'vượt 2h');
  assert.equal(taskWorkPace(one(12), { employees: absent, now: at('10:00') }).behindHours, -2);
});

test('giờ/ngày lẻ (2,29h) và thứ 7 nửa ngày: vạch kế hoạch tính đúng phần giờ được phân công', () => {
  // Như A1.2: 8 giờ/người trải 05/11 (T5) – 09/11 (T2) = 3,5 ngày công → 8 / 3,5 ≈ 2,29 giờ/ngày, thứ 7 ≈ 1,14 giờ.
  const a12 = { id: 'a12', startDate: '2026-11-05', endDate: '2026-11-09', status: 'in_progress', assignees: [{ employeeId: 'a', estimatedHoursPerDay: 8 / 3.5, excludeNonWorkingDays: true }] };
  const people = [{ id: 'a', standardHours: 8 }];
  const plan = now => taskWorkPace(a12, { employees: people, viewerEmployeeId: 'a', now }).planPercent;
  const when = key => new Date(`${key}T17:30:00+07:00`);
  // Hết ngày T5: 2,29 / 8 = 28%; hết T6: 57%; hết T7 (nửa ngày): 2,5 / 3,5 = 71%; hết T2: 100%.
  assert.equal(plan(when('2026-11-05')), 28);
  assert.equal(plan(when('2026-11-06')), 57);
  assert.equal(plan(new Date('2026-11-07T12:00:00+07:00')), 71);
  assert.equal(plan(when('2026-11-09')), 100);
  // Làm đủ 8h thật → thanh 100%, không còn chậm.
  const done = taskWorkPace({ ...a12, actualWorkEntries: [{ employeeId: 'a', hours: 8 }] }, { employees: people, viewerEmployeeId: 'a', now: when('2026-11-09') });
  assert.equal(done.progress, 100);
  assert.equal(done.tone, '');
});
