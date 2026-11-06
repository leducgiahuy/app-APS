import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDelivery, summarizeProjectWork, taskForecastWork, varianceTone } from '../../frontend/src/utils/deliveryMetrics.js';

test('dự báo khi xong = công thực tế + công còn lại theo mức trạng thái', () => {
  // Chưa làm: đúng kế hoạch.
  assert.equal(taskForecastWork({ planned: 10, level: 0 }), 10);
  // Đang làm 20%, đã dùng 3 công: 3 + 10 × 80% = 11 → vượt kế hoạch 1 công.
  assert.equal(taskForecastWork({ planned: 10, spent: 3, level: 20 }), 11);
  // Đã gửi 60%, đã dùng 4 công: 4 + 10 × 40% = 8.
  assert.equal(taskForecastWork({ planned: 10, spent: 4, level: 60 }), 8);
  // Đã xong: lấy công thực tế ghi nhận lúc xong (tốn ít hơn hay nhiều hơn kế hoạch đều phản ánh đúng).
  assert.equal(taskForecastWork({ planned: 10, spent: 12, level: 100, completed: true, completedActual: 12 }), 12);
  assert.equal(taskForecastWork({ planned: 10, completed: true, completedActual: 6 }), 6);
  // Đã xong / 100% mà không có giờ nào: coi như đúng kế hoạch, không báo tiết kiệm giả.
  assert.equal(taskForecastWork({ planned: 10, completed: true, completedActual: 0 }), 10);
  assert.equal(taskForecastWork({ planned: 10, level: 100 }), 10);
});

test('màu chênh lệch theo %: xanh ≤ 5%, vàng 5–10%, đỏ > 10%', () => {
  assert.equal(varianceTone(-17.2, -4.4), 'good');
  assert.equal(varianceTone(10, 2.5), 'good');
  assert.equal(varianceTone(20, 5.1), 'warning');
  assert.equal(varianceTone(39, 10), 'warning');
  assert.equal(varianceTone(40, 10.3), 'danger');
  assert.equal(varianceTone(0.01, 0.01), '', 'chênh quá nhỏ để trung tính');
  assert.equal(varianceTone(2, null), 'danger', 'không có dự toán mà vẫn tốn công');
  assert.equal(varianceTone(null, null), '');
});

test('Dự báo theo chuỗi task: Dự toán task dưới × Thực tế task trên ÷ Dự toán task trên (nối liền cả dự án)', () => {
  const now = new Date('2026-11-10T10:00:00+07:00'); // thứ Ba 10:00
  const a = (start, end) => [{ employeeId: 'e', startDate: start, endDate: end, estimatedHoursPerDay: 8, excludeNonWorkingDays: true }];
  // Ghi theo thứ tự lộn xộn để chắc chuỗi đi theo STT, không theo thứ tự lưu.
  const db = {
    projects: [{ id: 'p', startDate: '2026-11-02', endDate: '2026-11-30' }], employees: [{ id: 'e' }], tasks: [],
    ganttItems: [
      { id: 't3', code: 'A2.1', projectId: 'p', startDate: '2026-11-20', endDate: '2026-11-20', contractWork: 4, status: 'not_started', assignees: a('2026-11-20', '2026-11-20') },
      { id: 't1', code: 'A1.1', projectId: 'p', startDate: '2026-11-02', endDate: '2026-11-03', contractWork: 1, status: 'completed', completedAt: '2026-11-02T17:30:00+07:00', assignees: a('2026-11-02', '2026-11-03') },
      { id: 't2', code: 'A1.2', projectId: 'p', startDate: '2026-11-09', endDate: '2026-11-10', contractWork: 3, status: 'in_progress', assignees: a('2026-11-09', '2026-11-10') },
    ],
  };
  const metrics = computeDelivery(db, 'p', { settings: {} }, now).taskMetrics;
  // A1.1 (task đầu): Thực tế 1 công (xong cuối ngày T2), Dự báo 0.
  assert.equal(metrics.t1.actualWork, 1);
  assert.equal(metrics.t1.forecastWork, 0, 'task đầu tiên không áp được công thức');
  assert.equal(metrics.t1.varianceWork, -1, 'Chênh lệch = Dự báo − Dự toán');
  // A1.2: 3 × 1 ÷ 1 = 3. Thực tế của nó (T2 8h + T3 2h = 1,25) không ảnh hưởng Dự báo của chính nó.
  assert.equal(metrics.t2.actualWork, 1.25);
  assert.equal(metrics.t2.forecastWork, 3);
  assert.equal(metrics.t2.remainingWork, 1.75, 'Còn lại = Dự báo − Thực tế');
  // A2.1 (qua mục khác vẫn nối với A1.2): 4 × 1,25 ÷ 3.
  assert.equal(Math.round(metrics.t3.forecastWork * 1000), Math.round(4 * 1.25 / 3 * 1000));
  assert.equal(Math.round(metrics.t3.varianceWork * 1000), Math.round((4 * 1.25 / 3 - 4) * 1000));
});

test('Dự báo chạy theo Thực tế của task trên và đứng yên khi task trên xong', () => {
  const a = (start, end) => [{ employeeId: 'e', startDate: start, endDate: end, estimatedHoursPerDay: 8, excludeNonWorkingDays: true }];
  const above = { id: 'up', code: 'A1.1', projectId: 'p', startDate: '2026-11-09', endDate: '2026-11-10', contractWork: 2, status: 'in_progress', assignees: a('2026-11-09', '2026-11-10') };
  const below = { id: 'down', code: 'A1.2', projectId: 'p', startDate: '2026-11-11', endDate: '2026-11-12', contractWork: 4, status: 'not_started', assignees: a('2026-11-11', '2026-11-12') };
  const db = { projects: [{ id: 'p', startDate: '2026-11-01', endDate: '2026-11-30' }], employees: [{ id: 'e' }], tasks: [], ganttItems: [above, below] };
  const forecast = when => computeDelivery(db, 'p', { settings: {} }, new Date(when)).taskMetrics.down.forecastWork;
  assert.equal(forecast('2026-11-09T10:00:00+07:00'), 0.5, 'task trên chạy 2h = 0,25 công → 4 × 0,25 ÷ 2');
  assert.equal(forecast('2026-11-09T17:30:00+07:00'), 2, 'task trên 1 công → 4 × 1 ÷ 2');
  // Task trên xong lúc 12:00 T3 (1,5 công) → Dự báo task dưới đứng yên 3, xem lại hôm sau vẫn vậy.
  Object.assign(above, { status: 'completed', completedAt: '2026-11-10T12:00:00+07:00' });
  assert.equal(forecast('2026-11-10T15:00:00+07:00'), 3);
  assert.equal(forecast('2026-11-12T17:30:00+07:00'), 3);
});

test('tổng dự án: Thực tế cộng cả task đang làm, vẫn Dự báo = Thực tế + Còn lại', async () => {
  const { summarizeProjectWork } = await import('../../frontend/src/utils/deliveryMetrics.js');
  const total = summarizeProjectWork({ contractWork: 10 }, {
    a: { budgetedWork: 4, actualWork: 3, forecastWork: 3, remainingWork: 0 },
    b: { budgetedWork: 6, actualWork: 2, forecastWork: 5, remainingWork: 3, completedActual: null },
  });
  assert.equal(total.actualWork, 5);
  assert.equal(total.forecastWork, 8);
  assert.equal(total.remainingWork, 3);
  assert.equal(total.varianceWork, -2);
});

test('Thực tế chạy theo giờ công ty × giờ/ngày phân công, không cần vào ca; đứng yên ngoài giờ làm', () => {
  // Như A1.2: 8h/người trải T5 05/11 – T2 09/11 = 3,5 ngày công → 8 / 3,5 ≈ 2,29h/ngày.
  const daily = 8 / 3.5;
  const item = { id: 'g1', projectId: 'p', startDate: '2026-11-05', endDate: '2026-11-09', estimatedHours: 8, status: 'in_progress', assignees: [{ employeeId: 'e', startDate: '2026-11-05', endDate: '2026-11-09', estimatedHoursPerDay: daily, excludeNonWorkingDays: true }] };
  // Nhân sự không vào ca — không ảnh hưởng cột Thực tế.
  const db = { projects: [{ id: 'p', startDate: '2026-11-01', endDate: '2026-11-30' }], employees: [{ id: 'e', isOnSite: false }], tasks: [], ganttItems: [item] };
  const hours = when => computeDelivery(db, 'p', { settings: {} }, new Date(when)).taskMetrics.g1.actualWorkHours;
  const running = when => computeDelivery(db, 'p', { settings: {} }, new Date(when)).taskMetrics.g1.clockRunning;
  const near = (value, expected) => assert.equal(Math.round(value * 1000), Math.round(expected * 1000));
  near(hours('2026-11-05T07:30:00+07:00'), 0); // trước 8:00 chưa chạy
  near(hours('2026-11-05T10:00:00+07:00'), daily * 2 / 8); // 2/8 giờ công ty
  assert.equal(running('2026-11-05T10:00:00+07:00'), true);
  near(hours('2026-11-05T12:45:00+07:00'), daily * 4 / 8); // nghỉ trưa đứng yên ở mức 12:00
  near(hours('2026-11-05T13:30:00+07:00'), daily * 4 / 8);
  assert.equal(running('2026-11-05T12:45:00+07:00'), false);
  near(hours('2026-11-05T19:00:00+07:00'), daily); // sau 17:30 đứng yên = đủ 1 ngày
  assert.equal(running('2026-11-05T19:00:00+07:00'), false);
  near(hours('2026-11-08T10:00:00+07:00'), daily * 2.5); // CN không chạy: T5 + T6 + T7 nửa ngày
  near(hours('2026-11-09T17:30:00+07:00'), 8); // hết lịch = đúng kế hoạch 1 công
  near(hours('2026-11-10T17:30:00+07:00'), 8 + daily); // chưa xong mà quá hạn: vẫn chạy tiếp
  // Xong lúc 12:00 T6 → dừng: T5 đủ + T6 nửa = 1,5 ngày × 2,29h, xem lại hôm sau vẫn vậy.
  Object.assign(item, { status: 'completed', completedAt: '2026-11-06T12:00:00+07:00' });
  near(hours('2026-11-09T17:30:00+07:00'), daily * 1.5);
});

test('Công còn lại theo trạng thái (Từ điển chỉ tiêu G1): chưa làm = Dự toán · đang làm = max(Dự toán, 2×Thực tế) − Thực tế · đã nộp = 10% · xong = 0', async () => {
  const { taskRemainingWork } = await import('../../frontend/src/utils/deliveryMetrics.js');
  const proof = { evidenceId: 'ev', confirmedBy: 'leader@aps.vn' };
  const r = (level, actual, extra = {}) => taskRemainingWork({ budget: 10, actual, record: { level, ...extra } });
  assert.equal(r(0, 0), 10, 'chưa làm → Dự toán');
  assert.equal(r(0, 3), 7, '0% nhưng đã có giờ → tính như đang làm: max(10, 6) − 3');
  assert.equal(r(20, 3), 7, 'đang làm, tốn ít: 10 − 3');
  assert.equal(r(40, 7), 7, 'chờ kiểm tra vẫn là đang làm, tốn nhiều: max(10, 14) − 7');
  assert.equal(r(60, 4, proof), 1, 'đã gửi có bằng chứng + xác nhận → 10% Dự toán');
  assert.equal(r(80, 12, proof), 1, 'đã sửa → 10% Dự toán');
  assert.equal(r(60, 4), 6, 'đã gửi nhưng chưa có bằng chứng / xác nhận → coi như đang làm');
  assert.equal(r(100, 9, proof), 0, 'phê duyệt → 0');
  assert.equal(taskRemainingWork({ budget: 10, actual: 2, record: { level: 20 }, completed: true }), 0, 'task hoàn thành → 0');
});

test('Còn lại trên bảng: task theo trạng thái, nhóm / dự án = tổng các task', () => {
  const now = new Date('2026-11-10T17:30:00+07:00');
  const a = (start, end) => [{ employeeId: 'e', startDate: start, endDate: end, estimatedHoursPerDay: 8, excludeNonWorkingDays: true }];
  const db = { projects: [{ id: 'p', startDate: '2026-11-02', endDate: '2026-11-30', contractWork: 6 }], employees: [{ id: 'e' }], tasks: [], ganttItems: [
    { id: 't1', code: 'A1.1', projectId: 'p', startDate: '2026-11-09', endDate: '2026-11-10', contractWork: 1, status: 'in_progress', assignees: a('2026-11-09', '2026-11-10') },
    { id: 't2', code: 'A1.2', projectId: 'p', startDate: '2026-11-20', endDate: '2026-11-21', contractWork: 5, status: 'not_started', assignees: a('2026-11-20', '2026-11-21') },
  ] };
  const result = computeDelivery(db, 'p', { settings: {}, records: { t1: { level: 20 } } }, now);
  // t1 đang làm, Thực tế 2 công > Dự toán 1 → max(1, 4) − 2 = 2; t2 chưa làm → 5.
  assert.equal(result.taskMetrics.t1.actualWork, 2);
  assert.equal(result.taskMetrics.t1.remainingWork, 2);
  assert.equal(result.taskMetrics.t2.remainingWork, 5);
  assert.equal(summarizeProjectWork(db.projects[0], result.taskMetrics).remainingWork, 7);
});

test('chọn 20% · Đang làm: chỉ cần task đã giao người, không cần giờ chấm công duyệt; về 0% luôn được', async () => {
  const { levelChangeBlockReason } = await import('../../frontend/src/utils/deliveryMetrics.js');
  const assigned = { assignees: [{ employeeId: 'e', employeeName: 'Duy_QL' }] };
  assert.equal(levelChangeBlockReason(assigned, null, 20), '', 'đã giao người → chọn được 20%');
  assert.equal(levelChangeBlockReason({ assignees: [] }, { employeeId: 'e' }, 20), '', 'giao người ở task Công việc (dữ liệu cũ) cũng được');
  assert.match(levelChangeBlockReason({ assignees: [] }, null, 20), /chưa giao người/);
  assert.equal(levelChangeBlockReason({ assignees: [] }, null, 0), '', 'quay về 0% luôn được');
  assert.equal(levelChangeBlockReason({ assignees: [] }, null, 40), '', 'các mức khác do bằng chứng / xác nhận kiểm tra');
});
