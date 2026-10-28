import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-role-permissions-'));
process.env.APS_DB_PATH = path.join(dir, 'db.json');

const guard = await import('../src/utils/routeGuards.js');
const { permissionsFor } = await import('../../frontend/src/utils/rolePermissions.js');
const { DEFAULT_MATRIX } = await import('../../frontend/src/utils/operationsDefaults.js');

const assign = employeeId => ({ employeeId, employeeName: employeeId, startDate: '2026-01-05', endDate: '2026-01-09' });
fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({
  projects: [{ id: 'p', name: 'Dự án', startDate: '2026-01-01', endDate: '2026-12-31' }],
  employees: [{ id: 'e-an', name: 'An' }, { id: 'e-binh', name: 'Bình' }, { id: 'e-lead', name: 'Leader' }],
  tasks: [
    { id: 't-an', projectId: 'p', title: 'Việc của An', employeeId: 'e-an', assignees: [assign('e-an')], status: 'in_progress' },
    { id: 't-binh', projectId: 'p', title: 'Việc của Bình', employeeId: 'e-binh', assignees: [assign('e-binh')], status: 'in_progress' },
    { id: 't-lead', projectId: 'p', title: 'Việc của Leader', employeeId: 'e-lead', assignees: [assign('e-lead')], status: 'in_progress' },
  ],
  ganttItems: [{ id: 'g1', projectId: 'p', title: 'Hạng mục', assignees: [assign('e-an')] }],
  overtimes: [
    { id: 'ot-an', employeeId: 'e-an', hours: 2, status: 'pending' },
    { id: 'ot-lead', employeeId: 'e-lead', hours: 2, status: 'pending' },
  ],
}));

const users = {
  employee: { email: 'an@aps.vn', role: 'employee', employeeId: 'e-an' },
  leader: { email: 'lead@aps.vn', role: 'leader', employeeId: 'e-lead' },
  manager: { email: 'ql@aps.vn', role: 'manager', employeeId: 'e-ql' },
  director: { email: 'gd@aps.vn', role: 'director', employeeId: 'e-gd' },
};

/** Chạy một middleware: trả 'next' nếu cho qua, ngược lại mã HTTP bị từ chối. */
function run(middleware, user, { params = {}, body = {} } = {}) {
  let outcome = 'next';
  const res = { status(code) { outcome = code; return this; }, json() { return this; } };
  middleware({ params, body, deliveryUser: user, deliveryCompanyUser: user }, res, () => {});
  return outcome;
}
const allowed = (middleware, role, req) => run(middleware, users[role], req) === 'next';

test('quyền đọc đúng từng ô của ma trận mặc định', () => {
  const p = role => permissionsFor(role, DEFAULT_MATRIX);
  assert.equal(p('employee').viewAllTasks, false, 'Nhân viên: Phân công task = X (của mình)');
  assert.equal(p('employee').updateOwnProgressOnly, true, 'Nhân viên: Cập nhật % = L (của mình)');
  assert.equal(p('employee').viewMoney, false, 'Nhân viên không xem giá trị hợp đồng');
  assert.equal(p('leader').assignTasks, true);
  assert.equal(p('manager').assignTasks, false, 'QL cấp trung chỉ xem phân công (X)');
  assert.equal(p('leader').approveOvertime, false, 'Leader chỉ đề xuất làm thêm giờ');
  assert.equal(p('manager').approveOvertime, true);
  assert.equal(p('director').approveOvertime, true, 'Giám đốc: D (vượt hạn mức)');
  assert.equal(p('manager').viewMoney, true);
  assert.equal(p('director').editSchedule, false, 'Giám đốc chỉ xem tiến độ tổng thể (X)');
  assert.equal(p('manager').createProject, true);
  assert.equal(p('leader').createProject, false);
  assert.equal(p('director').viewExecutive, true);
  assert.equal(p('manager').viewExecutive, false);
  assert.equal(p('admin').assignTasks, true, 'Quản trị có toàn quyền');
});

test('sửa ma trận thì quyền đổi theo', () => {
  const matrix = DEFAULT_MATRIX.map(row => row.key === 'assign' ? { ...row, values: { ...row.values, manager: 'L/S' } } : row);
  assert.equal(permissionsFor('manager', matrix).assignTasks, true);
});

test('chỉ Leader được tạo, xóa task và đổi kế hoạch task', () => {
  const create = { body: { projectId: 'p', title: 'Mới' } };
  assert.equal(allowed(guard.guardCreateTask, 'leader', create), true);
  for (const role of ['employee', 'manager', 'director']) assert.equal(allowed(guard.guardCreateTask, role, create), false, role);
  assert.equal(allowed(guard.guardDeleteTask, 'leader', { params: { id: 't-an' } }), true);
  assert.equal(allowed(guard.guardDeleteTask, 'manager', { params: { id: 't-an' } }), false);
  assert.equal(allowed(guard.guardUpdateTask, 'employee', { params: { id: 't-an' }, body: { endDate: '2026-02-01' } }), false, 'nhân viên không tự dời hạn');
});

test('nhân viên chỉ cập nhật task của mình; QL/GĐ chỉ xem %', () => {
  const note = id => ({ params: { id }, body: { actualWorkloadNotes: 'đã làm 50%' } });
  assert.equal(allowed(guard.guardUpdateTask, 'employee', note('t-an')), true);
  assert.equal(allowed(guard.guardUpdateTask, 'employee', note('t-binh')), false);
  assert.equal(allowed(guard.guardUpdateTask, 'leader', note('t-binh')), true);
  assert.equal(allowed(guard.guardUpdateTask, 'manager', note('t-binh')), false);
});

test('xác nhận hoàn thành: không phải nhân viên, không tự xác nhận việc của mình', () => {
  const done = id => ({ params: { id }, body: { status: 'completed', progress: 100 } });
  assert.equal(allowed(guard.guardUpdateTask, 'employee', done('t-an')), false);
  assert.equal(allowed(guard.guardUpdateTask, 'leader', done('t-an')), true);
  assert.equal(allowed(guard.guardUpdateTask, 'leader', done('t-lead')), false, 'Leader không tự xác nhận');
  assert.equal(allowed(guard.guardUpdateTask, 'manager', done('t-lead')), true);
});

test('nhân viên chỉ thấy task và phiếu tăng ca của mình', () => {
  let payload;
  const res = { json(data) { payload = data; return this; } };
  const req = { params: {}, deliveryUser: users.employee, deliveryCompanyUser: users.employee };
  guard.scopeTaskList(req, res, () => res.json({ data: { tasks: [{ id: 't-an', assignees: [assign('e-an')] }, { id: 't-binh', employeeId: 'e-binh' }], overtimes: [{ id: 'a', employeeId: 'e-an' }, { id: 'b', employeeId: 'e-binh' }] } }));
  assert.deepEqual(payload.data.tasks.map(task => task.id), ['t-an']);
  assert.deepEqual(payload.data.overtimes.map(row => row.id), ['a']);
});

test('làm thêm giờ: nhân viên đăng ký cho mình, QL/GĐ duyệt, không tự duyệt', () => {
  assert.equal(allowed(guard.guardCreateOvertime, 'employee', { body: { employeeId: 'e-an' } }), true);
  assert.equal(allowed(guard.guardCreateOvertime, 'employee', { body: { employeeId: 'e-binh' } }), false);
  assert.equal(allowed(guard.guardCreateOvertime, 'leader', { body: { employeeId: 'e-an' } }), true, 'Leader đề xuất cho nhân viên');
  assert.equal(allowed(guard.guardReviewOvertime, 'leader', { params: { id: 'ot-an' } }), false);
  assert.equal(allowed(guard.guardReviewOvertime, 'manager', { params: { id: 'ot-an' } }), true);
  assert.equal(allowed(guard.guardDeleteOvertime, 'employee', { params: { id: 'ot-an' } }), true, 'hủy phiếu chờ duyệt của mình');
  assert.equal(allowed(guard.guardDeleteOvertime, 'employee', { params: { id: 'ot-lead' } }), false);
});

test('Gantt: Leader/QL sửa lịch, chỉ Leader phân công, GĐ chỉ xem', () => {
  const schedule = { params: { id: 'g1' }, body: { startDate: '2026-01-06' } };
  const assignment = { params: { id: 'g1' }, body: { assignees: [assign('e-binh')] } };
  assert.equal(allowed(guard.guardUpdateGantt, 'leader', schedule), true);
  assert.equal(allowed(guard.guardUpdateGantt, 'manager', schedule), true);
  assert.equal(allowed(guard.guardUpdateGantt, 'director', schedule), false);
  assert.equal(allowed(guard.guardUpdateGantt, 'employee', schedule), false);
  assert.equal(allowed(guard.guardUpdateGantt, 'leader', assignment), true);
  assert.equal(allowed(guard.guardUpdateGantt, 'manager', assignment), false);
});

test('dự án, nhân sự, chấm công', () => {
  assert.equal(allowed(guard.guardCreateProject, 'manager'), true);
  assert.equal(allowed(guard.guardCreateProject, 'leader'), false);
  assert.equal(allowed(guard.guardUpdateProject, 'leader', { params: { id: 'p' } }), false);
  assert.equal(allowed(guard.guardDeleteProject, 'manager'), false);
  assert.equal(allowed(guard.guardDeleteProject, 'director'), true);
  assert.equal(allowed(guard.guardManageMembers, 'manager'), false);
  assert.equal(allowed(guard.guardAttendance, 'employee', { params: { id: 'e-an' } }), true);
  assert.equal(allowed(guard.guardAttendance, 'employee', { params: { id: 'e-binh' } }), false);
  assert.equal(allowed(guard.guardAttendance, 'manager', { params: { id: 'e-binh' } }), true);
  assert.equal(allowed(guard.guardEditWorkforce, 'leader'), false);
  assert.equal(allowed(guard.guardViewWorkforce, 'leader'), true);
  assert.equal(allowed(guard.guardViewWorkforce, 'employee'), false);
});
