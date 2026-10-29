import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { PAGE_ACCESS_ITEMS, PAGE_ACCESS_TREE, normalizePageAccess, pageAccessAllows, pageVisible } from '../../frontend/src/utils/pageAccess.js';

// Máy chủ đọc đường dẫn dữ liệu một lần khi nạp: mọi bài trong file dùng chung một file dữ liệu tạm.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-page-access-'));
process.env.APS_DB_PATH = path.join(directory, 'db.json');
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('page access tree: every page has sections, keys are unique and defaults are valid codes', () => {
  assert.deepEqual(PAGE_ACCESS_TREE.map(page => page.label), ['Công việc', 'Tổng quan', 'Dự án', 'Con người', 'Công ty']);
  const keys = PAGE_ACCESS_ITEMS.map(entry => entry.key);
  assert.equal(new Set(keys).size, keys.length, 'không trùng khóa');
  for (const entry of PAGE_ACCESS_ITEMS) {
    assert.equal(entry.defaults.length, 6, entry.key);
    assert.ok(entry.defaults.every(code => ['X', 'S', '—'].includes(code)), entry.key);
  }
  // Mục con "Bảng tiến độ & công" nằm trong "Tiến độ & Công" của trang Dự án.
  assert.deepEqual(PAGE_ACCESS_ITEMS.find(entry => entry.key === 'gantt.progress.table'), { ...PAGE_ACCESS_ITEMS.find(entry => entry.key === 'gantt.progress.table'), page: 'gantt', parent: 'gantt.progress' });
});

test('page access normalizes old / partial / invalid saved data and nests children under parents', () => {
  const access = normalizePageAccess({
    'gantt.legal': { values: { employee: '—' } },
    'gantt.legal.permits': { values: { employee: 'S', leader: 'bậy' }, note: 'Ghi chú' },
    'mục-đã-bỏ': { values: { employee: 'S' } },
  });
  assert.equal(access['mục-đã-bỏ'], undefined, 'mục không còn trên web tự bỏ');
  assert.equal(access['gantt.legal.permits'].values.leader, 'S', 'giá trị lỗi quay về mặc định');
  assert.equal(access['gantt.legal.permits'].note, 'Ghi chú');
  assert.equal(access['work-hub.my-work'].values.employee, 'S', 'mục mới tự có mặc định');
  assert.equal(pageAccessAllows(access, 'gantt.legal.permits', 'employee'), false, 'mục cha ẩn thì mục con cũng ẩn');
  assert.equal(pageAccessAllows(access, 'gantt.legal.permits', 'leader', 'write'), true);
  assert.equal(pageAccessAllows(access, 'work-hub.workload', 'employee'), true);
  assert.equal(pageAccessAllows(access, 'work-hub.workload', 'employee', 'write'), false, 'X chỉ được xem');
  assert.equal(pageAccessAllows(access, 'director-overview.kpis', 'admin', 'write'), true, 'Admin luôn được');
  assert.equal(pageVisible(access, 'director-overview', 'employee'), false, 'trang ẩn khi không thấy mục nào');
  assert.equal(pageVisible(access, 'director-overview', 'director'), true);
});

test('page access matrix is saved by director/admin only and keeps unknown cells out', async () => {
  fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({ projects: [], employees: [{ id: 'e', name: 'Duy' }], tasks: [], overtimes: [], ganttItems: [] }));
  let server;
  try {
    const { default: routes } = await import('../src/routes/api.js');
    const app = express(); app.use(express.json()); app.use('/api', routes);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/delivery`;
    const call = async (endpoint, method = 'GET', body, token) => { const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, ...(await response.json()) }; };
    const admin = (await call('/session', 'POST', { email: 'demo@aps.vn', password: 'APS@2026' })).data.token;
    assert.equal((await call('/users', 'POST', { email: 'nv@aps.vn', role: 'employee', employeeId: 'e', name: 'NV', password: 'password1' }, admin)).status, 200);
    const worker = (await call('/session', 'POST', { email: 'nv@aps.vn', password: 'password1' })).data.token;
    let state = (await call('/operations', 'GET', null, admin)).data;
    assert.equal(state.pageAccess['company.settings.matrix'].values.director, 'S', 'trả về giá trị mặc định khi chưa lưu');
    const save = async (rows, token) => { const result = await call('/operations', 'PATCH', { revision: state.revision, action: 'pageAccess', value: { rows } }, token); if (result.status === 200) state = result.data; return result; };
    assert.notEqual((await save({ 'gantt.legal': { values: { employee: '—' } } }, worker)).status, 200, 'nhân viên không sửa được');
    assert.equal((await save({ 'gantt.legal': { values: { employee: 'Z' } } }, admin)).status, 400, 'chỉ nhận X / S / —');
    assert.equal((await save({ 'trang-lạ': { values: { employee: 'S' } } }, admin)).status, 400, 'không nhận mục lạ');
    const saved = await save({ 'gantt.legal': { values: { employee: '—' }, note: 'Nhân viên không xem hồ sơ' } }, admin);
    assert.equal(saved.status, 200, saved.message);
    assert.equal(state.pageAccess['gantt.legal'].values.employee, '—');
    assert.equal(state.pageAccess['gantt.legal'].values.leader, 'S', 'ô không gửi lên giữ nguyên');
    assert.equal(state.pageAccess['gantt.legal'].note, 'Nhân viên không xem hồ sơ');
    // Ma trận quyền thao tác cũ vẫn còn nguyên và vẫn có hiệu lực.
    assert.ok(state.matrix.some(row => row.key === 'editStatus'));
  } finally {
    server?.close();
  }
});

test('server applies the page access matrix to every request and picks up changes immediately', async () => {
  const { requiredPageAccess } = await import('../src/utils/pageAccessGuard.js');
  assert.deepEqual(requiredPageAccess('GET', '/delivery/executive'), { keys: ['director-overview.kpis'], mode: 'read' });
  assert.deepEqual(requiredPageAccess('PATCH', '/delivery/p', { action: 'change' }), { keys: ['gantt.customer'], mode: 'write' });
  assert.deepEqual(requiredPageAccess('PATCH', '/delivery/operations', { action: 'submitWeek' }), { keys: ['timesheets.mine'], mode: 'write' });
  assert.equal(requiredPageAccess('GET', '/tasks'), null, 'dữ liệu dùng chung nhiều trang không chặn đọc');
  assert.equal(requiredPageAccess('PATCH', '/delivery/operations', { action: 'notificationRead' }), null);

  const task = { id: 'a', code: 'A1', title: 'Thiết kế', projectId: 'p', startDate: '2026-01-01', endDate: '2099-12-31', estimatedHoursPerDay: 8, assignees: [{ employeeId: 'e', employeeName: 'Duy', startDate: '2026-01-01', endDate: '2099-12-31', estimatedHoursPerDay: 8 }] };
  fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({ projects: [{ id: 'p', name: 'Dự án', startDate: '2026-01-01', endDate: '2099-12-31' }], employees: [{ id: 'e', name: 'Duy', team: 'KT' }], tasks: [], overtimes: [], ganttItems: [task] }));
  let server;
  try {
    const { default: routes } = await import('../src/routes/api.js');
    const app = express(); app.use(express.json()); app.use('/api', routes);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (endpoint, method = 'GET', body, token) => { const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, ...(await response.json().catch(() => ({}))) }; };
    const login = async email => (await call('/delivery/session', 'POST', { email, password: email === 'demo@aps.vn' ? 'APS@2026' : 'password1' })).data?.token;
    const admin = await login('demo@aps.vn');
    { const created = await call('/delivery/users', 'POST', { email: 'nv@aps.vn', role: 'employee', employeeId: 'e', name: 'NV', password: 'password1' }, admin); assert.equal(created.status, 200, created.message); }
    let worker = await login('nv@aps.vn');
    let ops = (await call('/delivery/operations', 'GET', null, admin)).data;
    const setAccess = async rows => { const result = await call('/delivery/operations', 'PATCH', { revision: ops.revision, action: 'pageAccess', value: { rows } }, admin); assert.equal(result.status, 200, result.message); ops = result.data; };
    let state = (await call('/delivery/p', 'GET', null, admin)).data;
    const updateTask = async (level, token = worker) => { const result = await call('/delivery/p', 'PATCH', { revision: state.revision, action: 'task', taskId: 'a', value: { level, notes: `mức ${level}` } }, token); if (result.status === 200) state = result.data; return result; };

    // Quyền của chính mình: vai trò + ma trận đã chuẩn hóa.
    const mine = (await call('/delivery/page-access', 'GET', null, worker)).data;
    assert.equal(mine.role, 'employee'); assert.equal(mine.access['director-overview.kpis'].values.employee, '—');
    // Mặc định: nhân viên không thấy Tổng quan, nhưng cập nhật được task của mình.
    assert.equal((await call('/delivery/executive?month=2026-10', 'GET', null, worker)).status, 403);
    assert.equal((await updateTask(0)).status, 200);

    // Đổi Tiến độ & Công của nhân viên thành X (chỉ xem): thao tác bị chặn ngay, vẫn đọc được.
    await setAccess({ 'gantt.progress': { values: { employee: 'X' } } });
    const viewOnly = await updateTask(0);
    assert.equal(viewOnly.status, 403); assert.match(viewOnly.message, /chỉ được xem.*Tiến độ & Công/);
    assert.equal((await call('/delivery/p', 'GET', null, worker)).status, 200);

    // Ẩn cả trang Dự án với nhân viên: không đọc được dữ liệu dự án nữa.
    await setAccess(Object.fromEntries(['gantt.progress', 'gantt.legal', 'gantt.customer', 'gantt.close', 'gantt.new-project'].map(key => [key, { values: { employee: '—' } }])));
    assert.equal((await call('/delivery/p', 'GET', null, worker)).status, 403);
    assert.equal((await call('/delivery/page-access', 'GET', null, worker)).data.access['gantt.legal'].values.employee, '—', 'giao diện đọc được quyền mới để ẩn trang');

    // Mở lại: có hiệu lực ngay, không cần đăng nhập lại.
    await setAccess(Object.fromEntries(['gantt.progress', 'gantt.legal', 'gantt.customer'].map(key => [key, { values: { employee: 'S' } }])));
    assert.equal((await updateTask(0)).status, 200);

    // Đổi vai trò người dùng: lần gọi kế tiếp (đăng nhập lại tự động) theo quyền của vai trò mới.
    assert.equal((await call('/delivery/users', 'POST', { email: 'nv@aps.vn', role: 'director', employeeId: 'e', name: 'NV' }, admin)).status, 200);
    assert.equal((await call('/delivery/executive?month=2026-10', 'GET', null, worker)).status, 401, 'phiên cũ bị thu hồi khi đổi vai trò');
    worker = await login('nv@aps.vn');
    assert.equal((await call('/delivery/page-access', 'GET', null, worker)).data.role, 'director');
    assert.equal((await call('/delivery/executive?month=2026-10', 'GET', null, worker)).status, 200);

    // Admin luôn được, kể cả khi ma trận ẩn hết.
    await setAccess({ 'director-overview.kpis': { values: { director: '—' } } });
    assert.equal((await call('/delivery/executive?month=2026-10', 'GET', null, worker)).status, 403);
    assert.equal((await call('/delivery/executive?month=2026-10', 'GET', null, admin)).status, 200);
  } finally {
    server?.close();
  }
});
