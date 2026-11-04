import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDelivery, taskForecastWork, varianceTone } from '../../frontend/src/utils/deliveryMetrics.js';

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

test('task mới và task đã xong trong dự án đều theo cùng cách tính (áp dụng cho mọi dự án về sau)', () => {
  const now = new Date('2026-11-10T03:00:00Z');
  const db = {
    projects: [{ id: 'p', startDate: '2026-11-02', endDate: '2026-11-30' }], employees: [{ id: 'e' }], tasks: [],
    ganttItems: [
      { id: 'done', projectId: 'p', startDate: '2026-11-02', endDate: '2026-11-03', estimatedHours: 16, status: 'completed', actualWorkHours: 24 },
      { id: 'doing', projectId: 'p', startDate: '2026-11-09', endDate: '2026-11-10', estimatedHours: 16, status: 'in_progress' },
      { id: 'later', projectId: 'p', startDate: '2026-11-20', endDate: '2026-11-20', estimatedHours: 8, status: 'not_started' },
    ],
  };
  const data = { settings: {}, records: { doing: { level: 60 } }, timesheets: [{ id: 't', taskId: 'doing', employeeId: 'e', date: '2026-11-09', hours: 8, shiftType: 'regular', source: 'weekly', status: 'approved' }] };
  const metrics = computeDelivery(db, 'p', data, now).taskMetrics;
  assert.equal(metrics.done.forecastWork, 3, 'xong: 24h thực tế = 3 công');
  assert.equal(metrics.done.varianceWork, 1, 'tốn hơn kế hoạch 1 công');
  assert.equal(metrics.doing.forecastWork, 1.8, '1 công đã dùng + 2 × 40%');
  assert.equal(metrics.later.forecastWork, 1, 'chưa làm: đúng kế hoạch');
  for (const metric of Object.values(metrics)) assert.equal(Math.round((metric.completedActual ?? 0) * 100 + metric.remainingWork * 100), Math.round(metric.forecastWork * 100), 'Dự báo = Thực tế + Còn lại');
});
