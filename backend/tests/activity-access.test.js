import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-activity-access-'));
process.env.APS_DB_PATH = path.join(dir, 'db.json');
fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({ projects: [], employees: [], tasks: [], overtimes: [], ganttItems: [], activityLog: [{ id: 'x', action: 'project.delete', email: 'a@aps.vn' }] }));

const { getActivityLog, createActivityLogEntry, clearActivityLogEntries } = await import('../src/controllers/activityController.js');
const { readDb } = await import('../src/models/db.js');
const call = (handler, user, body = {}) => {
  let status = 200, result;
  handler({ body, deliveryCompanyUser: user }, { status(code) { status = code; return this; }, json(data) { result = data; return this; } });
  return { status, body: result };
};
const employee = { email: 'nv@aps.vn', name: 'Nhân viên', role: 'employee' };
const admin = { email: 'admin@aps.vn', name: 'Quản trị', role: 'admin' };

test('chỉ Quản trị xem / xóa được nhật ký; người ghi luôn là tài khoản đang đăng nhập', () => {
  assert.equal(call(getActivityLog, employee).status, 403);
  assert.equal(call(clearActivityLogEntries, employee).status, 403);
  assert.equal(readDb().activityLog.length, 1);
  const created = call(createActivityLogEntry, employee, { action: 'gantt.create', email: 'giamdoc@aps.vn', name: 'Giám đốc', role: 'director' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.email, 'nv@aps.vn');
  assert.equal(created.body.data.role, 'user');
  assert.equal(call(getActivityLog, admin).body.data.length, 2);
  assert.equal(call(clearActivityLogEntries, admin).status, 200);
});
