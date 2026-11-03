import test from 'node:test';
import assert from 'node:assert/strict';

const { appendActivity, logDeliveryActivity, logOperationsActivity, ACTIVITY_LIMIT } = await import('../src/utils/activityLog.js');

const actor = { email: 'ql@aps.vn', name: 'Trần Quản Lý', role: 'manager' };
const db = () => ({
  projects: [{ id: 'p1', name: 'Nhà máy Betramex' }],
  ganttItems: [{ id: 't1', title: 'Thiết kế kết cấu' }],
  activityLog: [],
});

test('đổi mức trạng thái ở trang Dự án được ghi kèm tên dự án, tên việc và mức cũ → mới', () => {
  const data = db();
  const event = logDeliveryActivity(data, actor, 'p1', { action: 'task', taskId: 't1' }, { records: { t1: { level: 40, kind: 'design' } } }, { level: 20 });
  assert.equal(event.label, 'Cập nhật trạng thái công việc');
  assert.equal(event.category, 'delivery');
  assert.match(event.details, /Dự án Nhà máy Betramex/);
  assert.match(event.details, /Việc "Thiết kế kết cấu"/);
  assert.match(event.details, /20% → 40%/);
  assert.equal(event.name, 'Trần Quản Lý');
  assert.equal(data.activityLog[0], event);
});

test('thao tác không quan trọng (bình luận, lưu nháp tuần, đánh dấu đã đọc) không ghi', () => {
  const data = db();
  assert.equal(logDeliveryActivity(data, actor, 'p1', { action: 'comment', taskId: 't1' }), null);
  assert.equal(logOperationsActivity(data, actor, { action: 'saveWeek' }), null);
  assert.equal(logOperationsActivity(data, actor, { action: 'notificationRead' }), null);
  assert.equal(data.activityLog.length, 0);
});

test('đổi ma trận phân quyền và duyệt chi phí ở trang Công ty được ghi', () => {
  const data = db();
  assert.equal(logOperationsActivity(data, actor, { action: 'pageAccess' }).category, 'system');
  const decision = logOperationsActivity(data, actor, { action: 'expenseDecision', projectId: 'p1', value: { status: 'rejected', reason: 'Thiếu hóa đơn' } });
  assert.equal(decision.category, 'finance');
  assert.match(decision.details, /Từ chối · Lý do: Thiếu hóa đơn/);
  assert.equal(data.activityLog.length, 2);
});

test('nhật ký giữ tối đa ACTIVITY_LIMIT bản ghi, mới nhất trước', () => {
  const data = { activityLog: Array.from({ length: ACTIVITY_LIMIT }, (_, index) => ({ id: String(index) })) };
  const event = appendActivity(data, { email: 'a@aps.vn', action: 'x' });
  assert.equal(data.activityLog.length, ACTIVITY_LIMIT);
  assert.equal(data.activityLog[0], event);
});
