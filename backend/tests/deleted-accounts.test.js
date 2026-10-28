import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-deleted-accounts-'));
process.env.APS_DB_PATH = path.join(dir, 'db.json');

const { deleteAccount, listDeletedAccounts, restoreDeletedAccount } = await import('../src/utils/deletedAccounts.js');
const { passwordHash } = await import('../src/utils/deliveryAuth.js');
const { readDb } = await import('../src/models/db.js');

fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({
  employees: [{ id: 'e-b', code: 'NV006', name: 'Văn B', email: 'nv6@aps.com', team: 'Kỹ Thuật' }],
  tasks: [], ganttItems: [], projects: [], overtimes: [],
  operations: { members: [{ id: 'm1', projectId: 'p', email: 'nv6@aps.com', role: 'leader' }] },
  delivery: {
    users: [
      { email: 'admin@aps.vn', role: 'admin', ...passwordHash('Admin@2026') },
      { email: 'nv6@aps.com', name: 'Văn B', role: 'employee', employeeId: 'e-b', ...passwordHash('Matkhau@1') },
      { email: 'nv1@aps.com', name: 'nguyễn văn b', role: 'admin', disabled: true, ...passwordHash('Matkhau@1') },
    ],
    sessions: [{ hash: 'x', email: 'nv6@aps.com', expiresAt: Date.now() + 60000 }],
    projects: {}, templates: [],
  },
}));

const admin = { email: 'admin@aps.vn', role: 'admin' };
const director = { email: 'gd@aps.vn', role: 'director' };
function call(handler, user, req = {}) {
  let status = 200; let body;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
  handler({ params: {}, body: {}, deliveryUser: user, deliveryCompanyUser: user, ...req }, res);
  return { status, body };
}

test('chỉ Quản trị được xóa / xem kho tài khoản đã xóa', () => {
  assert.equal(call(deleteAccount, director, { body: { email: 'nv6@aps.com' } }).status, 403);
  assert.equal(call(listDeletedAccounts, director).status, 403);
});

test('xóa gỡ hết dữ liệu đang dùng nhưng giữ bản lưu không có mật khẩu', () => {
  const profile = { name: 'Văn B', email: 'nv6@aps.com', level: 'employee', department: 'Kỹ Thuật', password: 'lo-mat-khau', employeeId: 'e-b' };
  assert.equal(call(deleteAccount, admin, { body: { email: 'nv6@aps.com', profile } }).status, 200);
  const db = readDb();
  assert.equal(db.delivery.users.some(user => user.email === 'nv6@aps.com'), false, 'không còn tài khoản phân quyền');
  assert.equal(db.delivery.sessions.some(session => session.email === 'nv6@aps.com'), false, 'phiên đăng nhập bị đóng');
  assert.equal(db.employees.some(employee => employee.id === 'e-b'), false, 'không còn trên trang Thành viên');
  assert.ok(db.operations.members[0].deletedAt, 'vai trò theo dự án bị gỡ');
  const [record] = call(listDeletedAccounts, admin).body.data;
  assert.equal(record.email, 'nv6@aps.com');
  assert.equal(record.employee.id, 'e-b', 'bản lưu giữ hồ sơ nhân sự');
  assert.equal(JSON.stringify(record).includes('lo-mat-khau'), false, 'bản lưu không chứa mật khẩu');
  assert.equal('hash' in (record.backendUser || {}), false);
});

test('xóa được Quản trị khác, không tự xóa mình', () => {
  assert.equal(call(deleteAccount, admin, { body: { email: 'admin@aps.vn' } }).status, 400);
  assert.equal(call(deleteAccount, admin, { body: { email: 'nv1@aps.com' } }).status, 200);
  assert.equal(readDb().delivery.users.some(user => user.email === 'nv1@aps.com'), false, 'email được giải phóng');
});

test('khôi phục dựng lại tài khoản, nhân sự, vai trò dự án với mật khẩu mới', () => {
  const record = call(listDeletedAccounts, admin).body.data.find(row => row.email === 'nv6@aps.com');
  assert.equal(call(restoreDeletedAccount, admin, { params: { id: record.id }, body: { password: 'ngan' } }).status, 400);
  const restored = call(restoreDeletedAccount, admin, { params: { id: record.id }, body: { password: 'MatKhauMoi@1' } });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.employeeId, 'e-b');
  const db = readDb();
  assert.equal(db.delivery.users.find(user => user.email === 'nv6@aps.com').role, 'employee');
  assert.ok(db.employees.some(employee => employee.id === 'e-b'));
  assert.equal(db.operations.members[0].deletedAt, undefined);
  assert.equal(call(listDeletedAccounts, admin).body.data.some(row => row.email === 'nv6@aps.com'), false, 'đã rời kho lưu trữ');
});

test('xóa vĩnh viễn: chỉ Quản trị, theo từng bản hoặc tất cả', async () => {
  const { purgeDeletedAccounts } = await import('../src/utils/deletedAccounts.js');
  call(deleteAccount, admin, { body: { email: 'nv6@aps.com', profile: { name: 'Văn B', employeeId: 'e-b' } } });
  const record = call(listDeletedAccounts, admin).body.data.find(row => row.email === 'nv6@aps.com');
  assert.equal(call(purgeDeletedAccounts, director, { params: { id: record.id } }).status, 403);
  assert.equal(call(purgeDeletedAccounts, admin, { params: { id: 'khong-co' } }).status, 404);
  assert.equal(call(purgeDeletedAccounts, admin, { params: { id: record.id } }).status, 200);
  assert.equal(call(listDeletedAccounts, admin).body.data.some(row => row.id === record.id), false);
  assert.equal((readDb().operations.members || []).some(row => row.id === 'm1'), false, 'vai trò dự án đã ẩn cũng bị gỡ hẳn');
  assert.equal(call(purgeDeletedAccounts, admin).body.data.purged >= 0, true);
  assert.equal(call(listDeletedAccounts, admin).body.data.length, 0, 'xóa tất cả làm trống kho');
});
