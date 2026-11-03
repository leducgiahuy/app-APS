import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-account-profile-'));
process.env.APS_DB_PATH = path.join(dir, 'db.json');

const { deliveryAccountCatalog, deliveryProfile } = await import('../src/utils/accountProfile.js');
const { deliveryLogin, deliveryUsers, passwordHash } = await import('../src/utils/deliveryAuth.js');
const { requiredPageAccess } = await import('../src/utils/pageAccessGuard.js');
const { readDb, writeDb } = await import('../src/models/db.js');
const { ACCOUNT_LEVELS } = await import('../../frontend/src/modules/auth/accountOptions.js');
const { OP_ROLES } = await import('../../frontend/src/utils/operationsDefaults.js');
const { roleFromLevel } = await import('../../frontend/src/utils/rolePermissions.js');

fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({
  employees: [{ id: 'e-b', code: 'NV006', name: 'Văn B', email: 'nv6@aps.com', team: 'Kỹ Thuật', phone: '0900' }],
  tasks: [], ganttItems: [], projects: [], overtimes: [],
  delivery: {
    users: [
      { email: 'admin@aps.vn', name: 'Nguyễn Minh Anh', role: 'admin', ...passwordHash('Admin@2026') },
      { email: 'nv6@aps.com', name: 'Văn B', role: 'employee', employeeId: 'e-b', ...passwordHash('Matkhau@1') },
    ],
    sessions: [{ hash: 'nv6-session', email: 'nv6@aps.com', expiresAt: Date.now() + 60000 }],
    projects: {}, templates: [],
  },
}));

const admin = { email: 'admin@aps.vn', role: 'admin' };
const employee = { email: 'nv6@aps.com', role: 'employee' };
function call(handler, user, req = {}) {
  let status = 200; let body;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
  handler({ method: 'GET', params: {}, body: {}, deliveryUser: user, deliveryCompanyUser: user, ...req }, res);
  return { status, body };
}
const backendUser = email => readDb().delivery.users.find(user => user.email === email);

test('hồ sơ tự sửa được lưu ở máy chủ và lần đăng nhập sau trả lại bản mới (không quay về tên cũ)', () => {
  const saved = call(deliveryProfile, admin, { method: 'PATCH', body: { name: 'admin', company: 'APS Việt Nam', phone: '0965341376', avatarData: 'data:image/jpeg;base64,AAAA' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.name, 'admin');
  assert.ok(saved.body.data.profileSavedAt);
  assert.equal(saved.body.data.hash, undefined);

  const login = call(deliveryLogin, null, { method: 'POST', body: { email: 'admin@aps.vn', password: 'Admin@2026' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.name, 'admin');
  assert.equal(login.body.data.user.phone, '0965341376');
  assert.equal(login.body.data.user.avatarData, 'data:image/jpeg;base64,AAAA');
});

test('tự sửa hồ sơ cập nhật luôn nhân sự liên kết; ảnh không hợp lệ bị bỏ qua', () => {
  const saved = call(deliveryProfile, employee, { method: 'PATCH', body: { name: 'Văn B mới', phone: '0911', avatarData: 'javascript:alert(1)' } });
  assert.equal(saved.status, 200);
  const db = readDb();
  assert.equal(db.employees[0].name, 'Văn B mới');
  assert.equal(db.employees[0].phone, '0911');
  assert.equal(backendUser('nv6@aps.com').avatarData, undefined);
  assert.equal(call(deliveryProfile, employee, { method: 'PATCH', body: { name: '  ' } }).status, 400);
});

test('danh mục phòng ban / chuyên môn bắt đầu rỗng và tự thêm giá trị admin nhập khi tạo user', () => {
  assert.deepEqual(call(deliveryAccountCatalog, admin).body.data, { departments: [], specialties: [] });
  const created = call(deliveryUsers, admin, { method: 'POST', body: { email: 'kt@aps.com', name: 'Kế Toán', role: 'chiefAccountant', password: 'Matkhau@1', department: 'Kế Toán & HCNS', specialty: 'Kế toán' } });
  assert.equal(created.status, 200);
  call(deliveryUsers, admin, { method: 'POST', body: { email: 'kt2@aps.com', name: 'KT 2', role: 'accountant', password: 'Matkhau@1', department: 'kế toán & hcns', specialty: '' } });
  const catalog = call(deliveryAccountCatalog, admin).body.data;
  assert.deepEqual(catalog, { departments: ['Kế Toán & HCNS'], specialties: ['Kế toán'] });
  assert.equal(backendUser('kt@aps.com').department, 'Kế Toán & HCNS');

  const removed = call(deliveryAccountCatalog, admin, { method: 'DELETE', body: { kind: 'specialties', value: 'Kế toán' } });
  assert.deepEqual(removed.body.data.specialties, []);
  assert.equal(call(deliveryAccountCatalog, employee).status, 403);
});

test('phòng ban / chuyên môn của user có từ trước (chưa qua danh mục) vẫn hiện; mục đã × không tự hiện lại', () => {
  const db = readDb();
  db.delivery.users.push({ email: 'cu@aps.com', name: 'User cũ', role: 'leader', department: 'Phòng Thiết Kế', specialty: 'Kết cấu', ...passwordHash('Matkhau@1') });
  delete db.accountCatalog;
  writeDb(db);
  const catalog = call(deliveryAccountCatalog, admin).body.data;
  assert.ok(catalog.departments.includes('Phòng Thiết Kế'));
  assert.ok(catalog.specialties.includes('Kết cấu'));
  assert.ok(catalog.specialties.includes('Kế toán'), 'kt@aps.com đang dùng "Kế toán" nên có lại sau khi mất danh mục');

  call(deliveryAccountCatalog, admin, { method: 'DELETE', body: { kind: 'departments', value: 'Phòng Thiết Kế' } });
  assert.ok(!call(deliveryAccountCatalog, admin).body.data.departments.includes('Phòng Thiết Kế'));
  call(deliveryUsers, admin, { method: 'POST', body: { email: 'cu@aps.com', name: 'User cũ', role: 'leader', department: 'Phòng Thiết Kế' } });
  assert.ok(call(deliveryAccountCatalog, admin).body.data.departments.includes('Phòng Thiết Kế'), 'nhập lại thì hiện lại');
});

test('admin sửa hồ sơ không đăng xuất user; đổi cấp bậc thì có', () => {
  call(deliveryUsers, admin, { method: 'POST', body: { email: 'nv6@aps.com', name: 'Văn B mới', role: 'employee', employeeId: 'e-b', company: 'APS', phone: '0922' } });
  assert.ok(readDb().delivery.sessions.some(session => session.email === 'nv6@aps.com'));
  call(deliveryUsers, admin, { method: 'POST', body: { email: 'nv6@aps.com', name: 'Văn B mới', role: 'leader', employeeId: 'e-b' } });
  assert.ok(!readDb().delivery.sessions.some(session => session.email === 'nv6@aps.com'));
  assert.equal(backendUser('nv6@aps.com').phone, '0922', 'trường hồ sơ không gửi thì giữ nguyên');
});

test('cấp bậc tài khoản = đủ 6 cột vai trò của ma trận phân quyền', () => {
  assert.deepEqual(ACCOUNT_LEVELS.map(level => level.value), OP_ROLES);
  assert.deepEqual(ACCOUNT_LEVELS.map(level => level.label), ['Nhân viên', 'Leader', 'QL cấp trung', 'Kế toán viên', 'Kế toán trưởng', 'Giám đốc']);
  for (const role of OP_ROLES) assert.equal(roleFromLevel(role), role);
});

test('hồ sơ / danh mục không bị nhầm thành mã dự án trong guard phân quyền', () => {
  assert.equal(requiredPageAccess('PATCH', '/delivery/profile', {}), null);
  assert.equal(requiredPageAccess('GET', '/delivery/account-catalog', {}), null);
});
