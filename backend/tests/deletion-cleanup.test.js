import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-deletion-'));
process.env.APS_DB_PATH = path.join(dir, 'db.json');

const { deleteProject } = await import('../src/controllers/projectController.js');
const { deleteEmployee } = await import('../src/controllers/hrController.js');
const { deleteAccount } = await import('../src/utils/deletedAccounts.js');
const { deliveryUsers, passwordHash } = await import('../src/utils/deliveryAuth.js');
const { readDb } = await import('../src/models/db.js');
const { removeOrphanRecords } = await import('../src/utils/deletionCleanup.js');

const admin = { email: 'admin@aps.vn', role: 'admin' };
function call(handler, req = {}) {
  let status = 200; let body;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
  handler({ params: {}, body: {}, method: 'POST', deliveryUser: admin, deliveryCompanyUser: admin, ...req }, res);
  return { status, body };
}

const fresh = () => fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({
  projects: [{ id: 'proj-1', name: 'Dự án 1' }, { id: 'proj-2', name: 'Dự án 2' }],
  employees: [{ id: 'e-1', code: 'NV001', name: 'A', email: 'a@aps.com' }, { id: 'e-2', code: 'NV002', name: 'B' }],
  tasks: [], overtimes: [],
  ganttItems: [{ id: 'g1', projectId: 'proj-1', code: 'A1.1', title: 'Việc' }],
  appAttendance: [{ employeeId: 'e-2', date: '2026-11-03' }],
  operations: {
    budgets: [{ id: 'b1', projectId: 'proj-1' }, { id: 'b2', projectId: 'proj-2' }],
    members: [{ id: 'm1', projectId: 'proj-1', email: 'a@aps.com' }, { id: 'm2', projectId: 'proj-2', employeeId: 'e-2' }],
    audit: [{ id: 'au1', projectId: 'proj-1' }],
  },
  delivery: {
    users: [{ email: 'admin@aps.vn', role: 'admin', ...passwordHash('Admin@2026') }, { email: 'a@aps.com', name: 'A', role: 'employee', employeeId: 'e-1', ...passwordHash('Matkhau@1') }],
    sessions: [], projects: { 'proj-1': { records: {} }, 'proj-2': { records: {} } }, templates: [],
  },
}));

test('xóa dự án gỡ luôn ngân sách, thành viên, hồ sơ tiến độ; giữ audit', () => {
  fresh();
  assert.equal(call(deleteProject, { params: { id: 'proj-1' } }).status, 200);
  const db = readDb();
  assert.deepEqual(db.operations.budgets.map(row => row.id), ['b2']);
  assert.deepEqual(db.operations.members.map(row => row.id), ['m2']);
  assert.equal(db.delivery.projects['proj-1'], undefined);
  assert.equal(db.operations.audit.length, 1);
});

test('xóa nhân sự gỡ chấm công / vai trò; nhân sự còn tài khoản thì phải xóa ở trang Tài khoản', () => {
  fresh();
  assert.equal(call(deleteEmployee, { params: { id: 'e-1' } }).status, 409);
  assert.equal(call(deleteEmployee, { params: { id: 'e-2' } }).status, 200);
  const db = readDb();
  assert.equal(db.appAttendance.length, 0);
  assert.ok(!db.operations.members.some(row => row.employeeId === 'e-2'));
});

test('tài khoản đã xóa không bị trình duyệt cũ đồng bộ tạo lại, admin vẫn tạo mới được', () => {
  fresh();
  assert.equal(call(deleteAccount, { body: { email: 'a@aps.com' } }).status, 200);
  const account = { email: 'a@aps.com', name: 'A', role: 'employee', password: 'Matkhau@1' };
  const synced = call(deliveryUsers, { body: { ...account, sync: true } });
  assert.equal(synced.status, 410);
  assert.ok(!readDb().delivery.users.some(user => user.email === 'a@aps.com'));
  assert.ok(call(deliveryUsers, { method: 'GET' }).body.deletedEmails.includes('a@aps.com'));
  assert.equal(call(deliveryUsers, { body: account }).status, 200);
  assert.ok(!readDb().delivery.deletedEmails.includes('a@aps.com'));
});

test('dữ liệu cũ / bản khôi phục còn dòng của dự án, nhân sự đã xóa tự được gỡ', () => {
  const db = {
    projects: [{ id: 'proj-2' }], employees: [{ id: 'e-2' }],
    appAttendance: [{ employeeId: 'e-9' }, { employeeId: 'e-2' }],
    operations: { budgets: [{ projectId: 'proj-1' }, { projectId: 'proj-2' }], members: [{ id: 'm', employeeId: 'e-9', deletedReason: 'account-deleted' }], audit: [{ projectId: 'proj-1' }] },
    delivery: { projects: { 'proj-1': {}, 'proj-2': {} }, users: [] },
  };
  assert.equal(removeOrphanRecords(db), true);
  assert.deepEqual(db.operations.budgets, [{ projectId: 'proj-2' }]);
  assert.deepEqual(Object.keys(db.delivery.projects), ['proj-2']);
  assert.deepEqual(db.appAttendance, [{ employeeId: 'e-2' }]);
  assert.equal(db.operations.members.length, 1);
  assert.equal(db.operations.audit.length, 1);
  assert.equal(removeOrphanRecords(db), false);
});

test('db.json hỏng thì lấy bản sao lưu mới nhất, không nạp dữ liệu mẫu', () => {
  fresh();
  const backups = path.join(dir, 'backups');
  fs.rmSync(backups, { recursive: true, force: true });
  fs.mkdirSync(backups, { recursive: true });
  fs.writeFileSync(path.join(backups, 'db-2026-01-01.json'), JSON.stringify({ projects: [{ id: 'proj-x', name: 'Bản sao lưu' }], ganttItems: [], employees: [], tasks: [] }));
  fs.writeFileSync(process.env.APS_DB_PATH, '{ hỏng');
  // Tiến trình mới = máy chủ vừa khởi động lại, không có cache RAM.
  const script = "const { readDb } = await import(process.argv[1]); console.log(JSON.stringify(readDb().projects.map(p => p.id)));";
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script, pathToFileURL(path.resolve('src/models/db.js')).href], { env: { ...process.env }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output.trim().split('\n').at(-1)), ['proj-x']);
  assert.ok(fs.readdirSync(dir).some(name => name.startsWith('db.json.corrupt-')));
});
