import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-activity-access-'));
process.env.APS_DB_PATH = path.join(dir, 'db.json');
const seed = pageAccess => fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({ projects: [], employees: [], tasks: [], overtimes: [], ganttItems: [], activityLog: [{ id: 'x', action: 'project.delete', email: 'a@aps.vn' }], operations: { pageAccess } }));
seed({});

const { getActivityLog, createActivityLogEntry, clearActivityLogEntries } = await import('../src/controllers/activityController.js');
const { enforcePageAccess } = await import('../src/utils/pageAccessGuard.js');
const { readDb } = await import('../src/models/db.js');

/** Chạy giống router thật: bộ lọc ma trận Trang & mục rồi mới tới controller. */
const call = (method, handler, user, body = {}) => {
  let status = 200, result;
  const req = { method, path: '/activity', body, deliveryCompanyUser: user };
  const res = { status(code) { status = code; return this; }, json(data) { result = data; return this; } };
  enforcePageAccess(req, res, () => handler(req, res), readDb());
  return { status, body: result };
};
const user = role => ({ email: `${role}@aps.vn`, name: role, role });

test('nhật ký hoạt động theo ma trận: mặc định Giám đốc xem (X), vai trò khác ẩn, Quản trị luôn được', () => {
  seed({});
  assert.equal(call('GET', getActivityLog, user('employee')).status, 403);
  assert.equal(call('GET', getActivityLog, user('director')).status, 200, 'Giám đốc mặc định X: xem được');
  assert.equal(call('DELETE', clearActivityLogEntries, user('director')).status, 403, 'X không được xóa');
  assert.equal(readDb().activityLog.length, 1);
  // Người ghi luôn là tài khoản đang đăng nhập, mọi vai trò đều ghi được.
  const created = call('POST', createActivityLogEntry, user('employee'), { action: 'gantt.create', email: 'giamdoc@aps.vn', name: 'Giám đốc', role: 'director' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.email, 'employee@aps.vn');
  assert.equal(call('GET', getActivityLog, user('admin')).body.data.length, 2);
  assert.equal(call('DELETE', clearActivityLogEntries, user('admin')).status, 200);
});

test('đổi ô ma trận là quyền đổi theo ngay: S được xóa, X chỉ xem, — bị chặn', () => {
  seed({ 'activity.log': { values: { leader: 'S', director: '—', accountant: 'X' } } });
  assert.equal(call('GET', getActivityLog, user('leader')).status, 200);
  assert.equal(call('DELETE', clearActivityLogEntries, user('leader')).status, 200, 'S: xóa được');
  assert.equal(call('GET', getActivityLog, user('accountant')).status, 200);
  assert.equal(call('DELETE', clearActivityLogEntries, user('accountant')).status, 403);
  assert.equal(call('GET', getActivityLog, user('director')).status, 403, '— : không vào được');
});
