import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDelivery, elapsedShare, forecastWork, specLevel, summarizeProjectWork, taskRemainingWork, varianceTone } from '../../frontend/src/utils/deliveryMetrics.js';

// Bảng chỉ tiêu G1 của Giám đốc (người dùng chốt 11/11/2026).
const proof = { evidenceId: 'ev', confirmedBy: 'leader@aps.vn' };
const sheet = (taskId, hours, status = 'approved', date = '2026-11-05') => ({ id: `${taskId}-${hours}-${status}`, taskId, employeeId: 'e', date, hours, shiftType: 'regular', source: 'weekly', status });
const assign = (start, end) => [{ employeeId: 'e', startDate: start, endDate: end, estimatedHoursPerDay: 8, excludeNonWorkingDays: true }];

test('dự báo theo mức G1: 0 → dt · 50 → max(dt, 2×tt) · 90 → tt + 10% dt · 100 → tt', () => {
  assert.equal(forecastWork(10, 0, 0), 10);
  assert.equal(forecastWork(5, 3.2, 50), 6.4, 'A3.2b: đang làm, đã dùng 3,2 / 5 công → 6,4');
  assert.equal(forecastWork(10, 3, 50), 10, 'đang làm, tốn ít → giữ dự toán');
  assert.equal(forecastWork(10, 4, 90), 5, 'đã nộp → tt + 10% dt');
  assert.equal(forecastWork(10, 12, 100), 12, 'xong → tt');
  assert.equal(forecastWork(10, 0.88, 100), 0.88, 'xong sớm thì dự báo đúng bằng công đã dùng, không kéo task khác');
});

test('quy đổi 6 mức của app sang 4 mức G1', () => {
  assert.equal(specLevel({ level: 0 }), 0);
  assert.equal(specLevel({ level: 0 }, { actualWork: 0.5 }), 50, 'có giờ đầu tiên → đang làm');
  assert.equal(specLevel({ level: 20 }), 50);
  assert.equal(specLevel({ level: 40 }), 50);
  assert.equal(specLevel({ level: 60, ...proof }), 90, '60% có bằng chứng → đã nộp');
  assert.equal(specLevel({ level: 60, evidenceId: 'ev' }), 90, 'G1 chỉ cần file bằng chứng, không cần xác nhận');
  assert.equal(specLevel({ level: 100, evidenceId: 'ev' }), 100);
  assert.equal(specLevel({ level: 80, ...proof }), 90);
  assert.equal(specLevel({ level: 60 }), 50, 'chưa có file bằng chứng → vẫn là đang làm');
  assert.equal(specLevel({ level: 100 }), 50);
  assert.equal(specLevel({ level: 100, ...proof }), 100);
  assert.equal(specLevel({ level: 20 }, { completed: true }), 100, 'task hoàn thành → xong');
});

test('còn lại = dự báo − thực tế', () => {
  const r = (level, actual, extra = {}) => taskRemainingWork({ budget: 5, actual, record: { level, ...extra } });
  assert.equal(r(0, 0), 5, 'chưa làm → dự toán');
  assert.equal(Math.round(r(20, 3.2) * 10) / 10, 3.2, 'A3.2b: 6,4 − 3,2');
  assert.equal(r(60, 4, proof), 0.5, 'đã nộp → 10% dự toán');
  assert.equal(r(100, 4, proof), 0, 'xong → 0');
  assert.equal(taskRemainingWork({ budget: 5, actual: 2, record: { level: 20 }, completed: true }), 0);
});

test('màu chênh: |chênh| < 1 công không màu; > 10% đỏ; > 5% vàng; còn lại xanh', () => {
  assert.equal(varianceTone(1.4, 28), 'danger', 'A3.2b: +1,4 công (+28%) → đỏ');
  assert.equal(varianceTone(0.9, 45), '', 'chênh dưới 1 công không tô màu dù % lớn');
  assert.equal(varianceTone(-0.5, -25), '');
  assert.equal(varianceTone(20, 5.1), 'warning');
  assert.equal(varianceTone(40, 10), 'warning');
  assert.equal(varianceTone(41, 10.3), 'danger');
  assert.equal(varianceTone(-17.2, -4.4), 'good');
  assert.equal(varianceTone(2, null), 'danger', 'không có dự toán mà vẫn tốn công');
  assert.equal(varianceTone(null, null), '');
});

test('thực tế = Σ giờ phiếu giờ ĐÃ DUYỆT ÷ 8; giờ chưa duyệt không tính', () => {
  const now = new Date('2026-11-10T10:00:00+07:00');
  const db = { projects: [{ id: 'p', startDate: '2026-11-02', endDate: '2026-11-30' }], employees: [{ id: 'e' }], tasks: [], ganttItems: [
    { id: 'a31', code: 'A3.1', projectId: 'p', startDate: '2026-11-02', endDate: '2026-11-12', contractWork: 10, status: 'in_progress', assignees: assign('2026-11-02', '2026-11-12') },
  ] };
  const data = { settings: {}, records: { a31: { level: 20 } }, timesheets: [sheet('a31', 70.4), sheet('a31', 16, 'pending', '2026-11-06')] };
  const metric = computeDelivery(db, 'p', data, now).taskMetrics.a31;
  assert.equal(metric.actualWork, 8.8, 'A3.1: 70,4 giờ ÷ 8 = 8,8 công');
  assert.equal(metric.forecastWork, 17.6, 'đang làm: max(10, 2 × 8,8)');
  assert.equal(Math.round(metric.remainingWork * 10) / 10, 8.8);
});

test('task xong sớm không kéo dự báo các task khác (mỗi task tự tính theo trạng thái của nó)', () => {
  const now = new Date('2026-11-10T10:00:00+07:00');
  const db = { projects: [{ id: 'p', startDate: '2026-11-02', endDate: '2026-11-30' }], employees: [{ id: 'e' }], tasks: [], ganttItems: [
    { id: 't1', code: 'A1.1', projectId: 'p', startDate: '2026-11-02', endDate: '2026-11-03', contractWork: 2, status: 'completed', completedAt: '2026-11-02T17:30:00+07:00', assignees: assign('2026-11-02', '2026-11-03') },
    { id: 't2', code: 'A1.2', projectId: 'p', startDate: '2026-11-09', endDate: '2026-11-10', contractWork: 3, status: 'in_progress', assignees: assign('2026-11-09', '2026-11-10') },
    { id: 't3', code: 'A2.1', projectId: 'p', startDate: '2026-11-20', endDate: '2026-11-20', contractWork: 4, status: 'not_started', assignees: assign('2026-11-20', '2026-11-20') },
  ] };
  const data = { settings: {}, timesheets: [sheet('t1', 8), sheet('t2', 4, 'approved', '2026-11-09')] };
  const metrics = computeDelivery(db, 'p', data, now).taskMetrics;
  assert.equal(metrics.t1.forecastWork, 1, 'xong: dự báo = thực tế 1 công');
  assert.equal(metrics.t1.varianceWork, -1);
  assert.equal(metrics.t2.forecastWork, 3, 'có giờ đầu tiên → đang làm: max(3, 2 × 0,5)');
  assert.equal(metrics.t3.forecastWork, 4, 'chưa làm → dự toán');
  const summary = summarizeProjectWork(db.projects[0], metrics);
  assert.ok(summary.forecastWork >= summary.actualWork, 'dự báo dự án không bao giờ nhỏ hơn thực tế');
});

test('% hoàn thành = Σ(dt × mức) ÷ Σ dt; % kế hoạch = Σ(dt × % thời gian đã qua của việc) ÷ Σ dt', () => {
  const now = new Date('2026-11-10T10:00:00+07:00');
  const db = { projects: [{ id: 'p', startDate: '2026-11-01', endDate: '2026-11-30' }], employees: [{ id: 'e' }], tasks: [], ganttItems: [
    { id: 'x', projectId: 'p', startDate: '2026-11-01', endDate: '2026-11-05', contractWork: 4, status: 'in_progress', assignees: assign('2026-11-01', '2026-11-05') },
    { id: 'y', projectId: 'p', startDate: '2026-11-06', endDate: '2026-11-14', contractWork: 6, status: 'in_progress', assignees: assign('2026-11-06', '2026-11-14') },
  ] };
  const result = computeDelivery(db, 'p', { settings: {}, records: { x: { level: 60, ...proof }, y: { level: 20 } } }, now);
  // x đã nộp (90), y đang làm (50): (4 × 90 + 6 × 50) ÷ 10 = 66%.
  assert.equal(Math.round(result.summary.completion * 1e6) / 1e6, 66);
  // x đã qua hết (1), y: (10 − 6) ÷ (14 − 6) = 0,5 → (4 × 1 + 6 × 0,5) ÷ 10 = 70%.
  assert.equal(Math.round(result.summary.planPercent * 1e6) / 1e6, 70);
  assert.equal(elapsedShare('2026-11-06', '2026-11-14', '2026-11-01'), 0);
  assert.equal(elapsedShare('2026-11-06', '2026-11-14', '2026-12-01'), 1);
});

test('cảnh báo sớm: tt > dt chưa xong; tt ≥ 80% dt mà chưa nộp; quá hạn nộp', () => {
  const now = new Date('2026-11-10T10:00:00+07:00');
  const item = (id, contractWork) => ({ id, projectId: 'p', startDate: '2026-11-02', endDate: '2026-11-20', contractWork, status: 'in_progress', assignees: assign('2026-11-02', '2026-11-20') });
  const db = { projects: [{ id: 'p', startDate: '2026-11-01', endDate: '2026-11-30' }], employees: [{ id: 'e' }], tasks: [], ganttItems: [item('over', 4), item('near', 5), item('ok', 10), item('late', 10)] };
  const data = { settings: {}, records: { over: { level: 20 }, near: { level: 40 }, ok: { level: 20 }, late: { level: 20, dueAt: '2026-11-08T17:00:00+07:00' } },
    timesheets: [sheet('over', 40), sheet('near', 33), sheet('ok', 16)] };
  const metrics = computeDelivery(db, 'p', data, now).taskMetrics;
  assert.equal(metrics.over.alert.overBudget, true, '5 công > dự toán 4');
  assert.equal(metrics.near.alert.nearBudget, true, '4,125 công ≥ 80% của 5, mức < 90');
  assert.equal(metrics.near.alert.overBudget, false);
  assert.equal(metrics.ok.alert.early, false);
  assert.equal(metrics.late.alert.overdue, true);
  assert.equal(metrics.late.alert.early, true);
  // Chênh đỏ thì cần lý do: "over" dự báo max(4, 10) = 10 → +6 (+150%).
  assert.equal(metrics.over.varianceRed, true);
  assert.equal(metrics.over.varianceReasonMissing, true);
  data.records.over.varianceReason = 'Định mức thấp';
  assert.equal(computeDelivery(db, 'p', data, now).taskMetrics.over.varianceReasonMissing, false);
});

test('tổng dự án: dự toán, thực tế, dự báo, còn lại = tổng các task', () => {
  const total = summarizeProjectWork({ contractWork: 10 }, {
    a: { budgetedWork: 4, actualWork: 3, forecastWork: 3, remainingWork: 0 },
    b: { budgetedWork: 6, actualWork: 2, forecastWork: 6, remainingWork: 4 },
  });
  assert.equal(total.budgetedWork, 10);
  assert.equal(total.actualWork, 5);
  assert.equal(total.forecastWork, 9);
  assert.equal(total.remainingWork, 4);
  assert.equal(total.varianceWork, -1);
});

test('chọn 20% · Đang làm: chỉ cần task đã giao người; về 0% luôn được', async () => {
  const { levelChangeBlockReason } = await import('../../frontend/src/utils/deliveryMetrics.js');
  const assigned = { assignees: [{ employeeId: 'e', employeeName: 'Duy_QL' }] };
  assert.equal(levelChangeBlockReason(assigned, null, 20), '');
  assert.equal(levelChangeBlockReason({ assignees: [] }, { employeeId: 'e' }, 20), '');
  assert.match(levelChangeBlockReason({ assignees: [] }, null, 20), /chưa giao người/);
  assert.equal(levelChangeBlockReason({ assignees: [] }, null, 0), '');
  assert.equal(levelChangeBlockReason({ assignees: [] }, null, 40), '');
});
