// Mô phỏng dữ liệu "sau này": nhiều dự án mới, đồng hồ được tua tới trước / đúng / sau ngày làm,
// đi qua các API thật mà giao diện dùng. Chạy trên cơ sở dữ liệu tạm, không đụng dữ liệu thật.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { taskStatusWindow } from '../../frontend/src/utils/deliveryMetrics.js';
import { isTaskOverdue } from '../../frontend/src/utils/date.js';

// Giờ Việt Nam = UTC+7. Thứ Hai 01/03/2027 10:00 → task bắt đầu Thứ Tư 03/03.
const at = (day, time = '10:00') => Date.parse(`${day}T${time}:00+07:00`);
const HOUR = 3600000;

test('future data: several new projects follow start-date lock, attendance, completion, reopen, CR and reporting', async () => {
  mock.timers.enable({ apis: ['Date'], now: at('2027-03-01') });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-future-'));
  const previous = process.env.APS_DB_PATH;
  process.env.APS_DB_PATH = path.join(directory, 'db.json');
  fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify({ projects: [], employees: [], tasks: [], overtimes: [], ganttItems: [] }));
  const readCopy = () => JSON.parse(fs.readFileSync(process.env.APS_DB_PATH, 'utf8'));
  let server;
  try {
    const { default: routes } = await import('../src/routes/api.js');
    const app = express(); app.use(express.json({ limit: '15mb' })); app.use('/api', routes);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const api = async (method, url, body, token) => {
      // Mã nhân sự / dự án / task sinh theo mili giây: cho đồng hồ chạy như thật giữa các thao tác.
      mock.timers.tick(7);
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, ...(await response.json().catch(() => ({}))) };
    };
    const login = async (email, password) => (await api('POST', '/delivery/session', { email, password })).data?.token;
    let admin = await login('demo@aps.vn', 'APS@2026');
    assert.ok(admin, 'admin đăng nhập được');

    // Nhân sự + tài khoản mới.
    const duy = (await api('POST', '/employees', { name: 'Duy Mô Phỏng', title: 'Kỹ sư', team: 'KT', standardHours: 8 }, admin)).data;
    const yen = (await api('POST', '/employees', { name: 'Yến Mô Phỏng', title: 'Trưởng nhóm', team: 'KT', standardHours: 8 }, admin)).data;
    assert.ok(duy?.id && yen?.id, 'tạo được nhân sự mới');
    for (const [email, role, employeeId] of [['sim-worker@aps.vn', 'employee', duy.id], ['sim-leader@aps.vn', 'leader', yen.id]]) {
      assert.equal((await api('POST', '/delivery/users', { email, role, employeeId, name: email, password: 'password1' }, admin)).status, 200);
    }
    let worker = await login('sim-worker@aps.vn', 'password1');
    let leader = await login('sim-leader@aps.vn', 'password1');

    // Ba dự án mới, mỗi dự án có task riêng.
    const projects = [];
    for (const name of ['Mô phỏng A', 'Mô phỏng B', 'Mô phỏng C']) {
      const created = await api('POST', '/projects', { name, code: name.slice(-1), startDate: '2027-02-15', endDate: '2027-06-30' }, admin);
      assert.ok(created.data?.id, `tạo dự án ${name}`);
      projects.push(created.data);
    }
    const addTask = async (project, title, startDate, endDate, assignee) => {
      const response = await api('POST', '/gantt', { projectId: project.id, title, startDate, endDate, ...(assignee ? { assignee } : {}), estimatedHoursPerDay: 8 }, admin);
      assert.ok([200, 201].includes(response.status), `${title}: ${response.message || response.status}`);
      const db = readCopy();
      const gantt = db.ganttItems.find(item => item.title === title && item.projectId === project.id);
      return { gantt, task: db.tasks.find(item => item.ganttId === gantt.id) };
    };
    const a = await addTask(projects[0], 'Thiết kế A', '2027-03-03', '2027-03-05', duy.name);
    const b = await addTask(projects[1], 'Hồ sơ B', '2027-03-04', '2027-03-08', duy.name);
    const c = await addTask(projects[2], 'Khảo sát C', '2027-03-10', '2027-03-12');
    for (const row of [a, b, c]) assert.equal(row.task.status, 'not_started', `${row.gantt.title} mới tạo = Chưa bắt đầu`);

    const delivery = {};
    const mutate = async (project, action, value, taskId, token, id) => {
      const state = delivery[project.id] || (delivery[project.id] = (await api('GET', `/delivery/${project.id}`, null, admin)).data);
      const result = await api('PATCH', `/delivery/${project.id}`, { revision: state.revision, action, value, taskId, id }, token);
      if (result.status === 200) delivery[project.id] = result.data;
      return result;
    };
    const refresh = async project => { delivery[project.id] = (await api('GET', `/delivery/${project.id}`, null, admin)).data; return delivery[project.id]; };

    // ── Hôm nay 01/03: chưa tới ngày bắt đầu ──
    assert.equal(taskStatusWindow(a.gantt, a.task, '2027-03-01').reason, 'not_started');
    let result = await mutate(projects[0], 'task', { level: 20 }, a.gantt.id, worker);
    assert.equal(result.status, 400); assert.match(result.message, /Chưa tới ngày bắt đầu task \(03\/03\/2027\)/);
    assert.equal((await api('PATCH', `/employees/${duy.id}/active-task`, { taskId: a.task.id, shiftType: 'regular' }, worker)).status, 400, 'không chọn được task chưa tới ngày');

    // Dự toán nhập riêng cho task: Chênh lệch = Dự báo − Dự toán, cộng dồn lên dự án.
    assert.equal((await api('PATCH', `/gantt/${a.gantt.id}`, { contractWork: 2 }, admin)).status, 200);
    let state = await refresh(projects[0]);
    const metricA = state.taskMetrics[a.gantt.id];
    assert.equal(metricA.planned, 3, '3 ngày × 8h = 3 công dự báo');
    assert.equal(metricA.budgetedWork, 2);
    assert.equal(metricA.varianceWork, 1, 'vượt 1 công so với dự toán');

    // ── Tua tới 03/03 08:30: đúng ngày bắt đầu task A ──
    mock.timers.setTime(at('2027-03-03', '08:30'));
    admin = await login('demo@aps.vn', 'APS@2026'); worker = await login('sim-worker@aps.vn', 'password1'); leader = await login('sim-leader@aps.vn', 'password1');
    assert.equal(taskStatusWindow(a.gantt, a.task, '2027-03-03').open, true);
    assert.equal((await api('PATCH', `/employees/${duy.id}/active-task`, { taskId: b.task.id, shiftType: 'regular' }, worker)).status, 400, 'task B (04/03) vẫn chưa tới ngày');
    assert.equal((await api('PATCH', `/employees/${duy.id}/active-task`, { taskId: a.task.id, shiftType: 'regular' }, worker)).status, 200);
    assert.equal((await api('PATCH', `/employees/${duy.id}/toggle-onsite`, { shiftType: 'regular' }, worker)).status, 200, 'vào văn phòng');
    assert.equal(readCopy().tasks.find(item => item.id === a.task.id).status, 'in_progress', 'vào ca → task Đang thực hiện');

    // 2h làm → nghỉ 30 phút → 1,5h làm → rời văn phòng: giờ công = 3,5h, không tính giờ nghỉ.
    mock.timers.setTime(at('2027-03-03', '10:30'));
    assert.equal((await api('PATCH', `/employees/${duy.id}/toggle-break`, {}, worker)).status, 200, 'tạm nghỉ');
    mock.timers.setTime(at('2027-03-03', '11:00'));
    assert.equal((await api('PATCH', `/employees/${duy.id}/toggle-break`, {}, worker)).status, 200, 'hết nghỉ');
    mock.timers.setTime(at('2027-03-03', '12:30'));
    assert.equal((await api('PATCH', `/employees/${duy.id}/toggle-onsite`, { shiftType: 'regular' }, worker)).status, 200, 'rời văn phòng');
    let db = readCopy();
    assert.equal(db.employees.find(item => item.id === duy.id).isOnSite, false);
    assert.ok(Math.abs(Number(db.tasks.find(item => item.id === a.task.id).actualWorkHours) - 3.5) < 0.02, `giờ công ${db.tasks.find(item => item.id === a.task.id).actualWorkHours} ≠ 3,5h`);

    // Phiếu giờ được duyệt → 20% → 40% → 100% có bằng chứng → người khác xác nhận → tự hoàn thành.
    // Rời văn phòng lưu lại giờ có mặt của ngày (đã trừ 30 phút nghỉ) để đối chiếu phiếu giờ về sau.
    const presence = db.appAttendance.filter(row => row.employeeId === duy.id && row.date === '2027-03-03');
    assert.deepEqual(presence.map(row => [row.hours, row.breakMinutes, row.source]), [[3.5, 30, 'app']], 'lưu chấm công trong app: 3,5h, nghỉ 30 phút');
    // Ca làm tự sinh phiếu giờ: mỗi đoạn làm (trước / sau giờ nghỉ) một phiếu, duyệt được ngay không cần lý do.
    await refresh(projects[0]);
    const sheets = delivery[projects[0].id].timesheets.filter(entry => entry.taskId === a.gantt.id && entry.source === 'session');
    assert.deepEqual(sheets.map(entry => Math.round(entry.hours * 100) / 100), [2, 1.5]);
    for (const sheet of sheets) assert.equal((result = await mutate(projects[0], 'approveTimesheet', { status: 'approved' }, null, admin, sheet.id)).status, 200, result.message);
    // Khai thêm giờ vượt giờ có mặt thì bị chặn.
    assert.equal((await mutate(projects[0], 'timesheet', { taskId: a.gantt.id, employeeId: duy.id, date: '2027-03-03', hours: 2, shiftType: 'regular' }, null, worker)).status, 200);
    const padded = delivery[projects[0].id].timesheets.find(entry => entry.taskId === a.gantt.id && entry.source === 'manual');
    assert.match((await mutate(projects[0], 'approveTimesheet', { status: 'approved' }, null, admin, padded.id)).message, /Khai vượt giờ có mặt/);
    assert.equal((await mutate(projects[0], 'approveTimesheet', { status: 'rejected', reason: 'Khai trùng' }, null, admin, padded.id)).status, 200);
    assert.ok(Math.abs(delivery[projects[0].id].taskMetrics[a.gantt.id].actualHours - 3.5) < 0.02, 'giờ đã duyệt = 3,5h');
    for (const level of [20, 40]) assert.equal((result = await mutate(projects[0], 'task', { level }, a.gantt.id, worker)).status, 200, `mức ${level}%: ${result.message || ''}`);
    const evidence = await api('POST', `/delivery/${projects[0].id}/evidence`, { taskId: a.gantt.id, name: 'chap-thuan.txt', kind: 'approval', base64: Buffer.from('Đồng ý').toString('base64') }, worker);
    assert.ok(evidence.evidenceId, 'tải bằng chứng chấp thuận');
    await refresh(projects[0]);
    assert.equal((result = await mutate(projects[0], 'task', { level: 100, evidenceId: evidence.evidenceId }, a.gantt.id, worker)).status, 200, result.message);
    assert.notEqual(readCopy().tasks.find(item => item.id === a.task.id).status, 'completed', '100% chưa xác nhận → chưa hoàn thành');
    assert.equal((await mutate(projects[0], 'confirm', {}, a.gantt.id, worker)).status, 400, 'người làm không tự xác nhận');
    assert.equal((result = await mutate(projects[0], 'confirm', {}, a.gantt.id, admin)).status, 200, result.message);
    db = readCopy();
    const doneA = db.tasks.find(item => item.id === a.task.id);
    assert.equal(doneA.status, 'completed'); assert.equal(db.ganttItems.find(item => item.id === a.gantt.id).status, 'completed');
    assert.equal(doneA.speedStatus, 'early', 'xong ngày 03/03, hạn 05/03 → Làm sớm');

    // Hoàn thành → khóa; chỉ ghi chú; Admin mở lại có lý do → xác nhận lại.
    assert.match((await mutate(projects[0], 'task', { level: 80 }, a.gantt.id, worker)).message, /đã hoàn thành.*khóa/i);
    assert.equal((await mutate(projects[0], 'task', { notes: 'Đã gửi CĐT' }, a.gantt.id, worker)).status, 200);
    assert.equal((await mutate(projects[0], 'reopenTask', { reason: 'Tự mở' }, a.gantt.id, worker)).status, 400);
    assert.equal((result = await mutate(projects[0], 'reopenTask', { reason: 'CĐT yêu cầu chỉnh' }, a.gantt.id, admin)).status, 200, result.message);
    db = readCopy();
    assert.equal(db.tasks.find(item => item.id === a.task.id).status, 'in_progress');
    assert.equal(db.tasks.find(item => item.id === a.task.id).actualWorkHours, doneA.actualWorkHours, 'mở lại giữ giờ công');
    assert.equal((await mutate(projects[0], 'confirm', {}, a.gantt.id, admin)).status, 200, 'xác nhận lại sau khi mở');
    assert.equal(readCopy().tasks.find(item => item.id === a.task.id).status, 'completed');

    // ── CR dự án B: đề xuất → Giám đốc thu phí + duyệt → ký phụ lục sinh task bổ sung ──
    assert.equal((await mutate(projects[1], 'settings', { contractFee: 500000000, hourlyRate: 300000 }, null, admin)).status, 200);
    const plannedBefore = (await refresh(projects[1])).summary.totalPlanned;
    assert.equal((result = await mutate(projects[1], 'change', { title: 'Bổ sung mặt đứng', taskId: b.gantt.id, scope: 'Ngoài phạm vi', estimatedHours: 16 }, null, leader)).status, 200, result.message);
    const cr = delivery[projects[1].id].changes.at(-1);
    assert.equal(cr.status, 'Đề xuất'); assert.equal(cr.decision, 'pending');
    assert.equal((await mutate(projects[1], 'change', { ...cr, status: 'Đã duyệt' }, null, admin, cr.id)).status, 400, 'chưa quyết định thu phí thì không duyệt được');
    assert.equal((result = await mutate(projects[1], 'change', { ...cr, decision: 'paid', status: 'Đã duyệt', amount: 20000000 }, null, admin, cr.id)).status, 200, result.message);
    result = await mutate(projects[1], 'changeAppendix', { appendix: 'PL-01', signedDate: '2027-03-03', title: 'Bổ sung mặt đứng', amount: 20000000, estimatedHours: 16, startDate: '2027-03-15', endDate: '2027-03-16', employeeId: duy.id }, null, admin, cr.id);
    assert.equal(result.status, 200, result.message);
    db = readCopy();
    const extra = db.ganttItems.find(item => item.projectId === projects[1].id && item.changeId === cr.id);
    assert.ok(extra, 'ký phụ lục sinh task bổ sung trên Gantt');
    assert.ok(db.tasks.some(item => item.ganttId === extra.id), 'task bổ sung có ở Tiến độ / Việc của tôi');
    assert.equal((await refresh(projects[1])).summary.totalPlanned, plannedBefore + 2, '16h bổ sung = +2 công dự báo');

    // ── Báo cáo Tổng quan: đủ 3 dự án mới, % hoàn thành khớp từng dự án ──
    const executive = await api('GET', '/delivery/executive?month=2027-03', null, admin);
    assert.equal(executive.status, 200, executive.message);
    const ids = executive.data.projects.map(row => row.id);
    for (const project of projects) assert.ok(ids.includes(project.id), `báo cáo có ${project.name}`);
    for (const project of projects) {
      const row = executive.data.projects.find(item => item.id === project.id);
      assert.ok(Math.abs(row.completion - (await refresh(project)).summary.completion) < 1e-9, `% hoàn thành ${project.name} khớp trang Dự án`);
    }
    assert.ok(executive.data.projects.find(item => item.id === projects[0].id).completion > 0, 'dự án A có % hoàn thành sau khi task được duyệt');

    // ── Tua tới 01/04: task B quá hạn chưa xong ──
    mock.timers.setTime(at('2027-04-01'));
    // Phiên đăng nhập cũ đã hết hạn sau một tháng: đăng nhập lại như người dùng thật.
    assert.equal((await api('GET', '/delivery/executive?month=2027-04', null, admin)).status, 401, 'phiên cũ hết hạn');
    admin = await login('demo@aps.vn', 'APS@2026'); worker = await login('sim-worker@aps.vn', 'password1');
    db = readCopy();
    const lateB = db.tasks.find(item => item.id === b.task.id);
    assert.equal(isTaskOverdue(lateB), true, 'task B quá hạn');
    assert.equal(taskStatusWindow(db.ganttItems.find(item => item.id === b.gantt.id), lateB, '2027-04-01').open, true, 'quá hạn vẫn cập nhật được trạng thái');
    assert.equal((result = await mutate(projects[1], 'task', { level: 40 }, b.gantt.id, worker)).status, 200, result.message);
    const april = (await api('GET', '/delivery/executive?month=2027-04', null, admin)).data;
    for (const project of projects) assert.ok(april.projects.some(row => row.id === project.id), `tháng 4 vẫn có ${project.name}`);
  } finally {
    server?.close();
    mock.timers.reset();
    if (previous === undefined) delete process.env.APS_DB_PATH; else process.env.APS_DB_PATH = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('month fill rate counts only hours assigned to people, never unassigned or parent tasks', async () => {
  const { assignedHoursInMonth, monthFillPercent } = await import('../../frontend/src/utils/monthCapacity.js');
  // Giống dữ liệu thật: task cha A1.1 (16h/ngày) có 2 task con, task chưa giao người, task giao 1 và 2 người.
  const ganttItems = [{ id: 'g-parent' }, { id: 'g-child-1', parentTaskId: 'g-parent' }, { id: 'g-child-2', parentTaskId: 'g-parent' }];
  const week = { startDate: '2026-11-02', endDate: '2026-11-06' }; // Thứ Hai → Thứ Sáu: 5 ngày đủ
  const tasks = [
    { id: 't-parent', ganttId: 'g-parent', ...week, estimatedHoursPerDay: 16, assignees: [] },
    { id: 't-child-1', ganttId: 'g-child-1', ...week, estimatedHoursPerDay: 8, assignees: [{ employeeId: 'e1', employeeName: 'Duy' }] },
    { id: 't-child-2', ganttId: 'g-child-2', ...week, estimatedHoursPerDay: 8, assignees: [] },
    { id: 't-free', ...week, estimatedHoursPerDay: 8, assignees: [] },
    { id: 't-pair', ...week, estimatedHoursPerDay: 4, assignees: [{ employeeId: 'e1', startDate: '2026-11-02', endDate: '2026-11-03' }, { employeeId: 'e2', estimatedHoursPerDay: 2 }] },
    { id: 't-legacy', ...week, estimatedHoursPerDay: 8, employeeId: 'e2', assignees: [] },
    { id: 't-cancelled', ...week, status: 'cancelled', assignees: [{ employeeId: 'e1' }] },
  ];
  // child-1 40h + pair (2 ngày × 4h + 5 ngày × 2h = 18h) + legacy 40h = 98h.
  assert.equal(assignedHoursInMonth(tasks, '2026-11', ganttItems), 98);
  // Thứ Bảy nửa ngày, Chủ nhật không tính: Thứ Sáu 06/11 → Chủ nhật 08/11 = 1 + 0,5 + 0 ngày.
  assert.equal(assignedHoursInMonth([{ id: 'x', startDate: '2026-11-06', endDate: '2026-11-08', estimatedHoursPerDay: 8, employeeId: 'e1' }], '2026-11'), 12);
  // Tháng chưa có phân công → 0%; chưa có nhân sự → không chia.
  assert.equal(monthFillPercent(tasks, [{ id: 'e1' }], '2026-10', ganttItems), 0);
  assert.equal(monthFillPercent(tasks, [], '2026-11', ganttItems), null);
});

test('app attendance keeps each closed shift, deducts breaks and covers the shift still open', async () => {
  const { appAttendanceHours, recordAppAttendance } = await import('../src/utils/appAttendance.js');
  const { attendanceHours } = await import('../src/utils/operationsReports.js');
  const at = time => `2027-03-03T${time}:00+07:00`;
  const db = { employees: [{ id: 'e', isOnSite: true, checkInAt: new Date(at('08:00')).toISOString(), isOnBreak: true, breakStartedAt: new Date(at('11:30')).toISOString(), totalBreakMs: 15 * 60000 }] };
  // Đang ở văn phòng lúc 12:00: 4h có mặt − 15 phút nghỉ xong − 30 phút đang nghỉ = 3,25h.
  assert.equal(appAttendanceHours(db, 'e', '2027-03-03', Date.parse(at('12:00'))), 3.25);
  // Rời văn phòng 12:00 khi đang nghỉ: lưu 3,25h, nghỉ 45 phút.
  const row = recordAppAttendance(db, db.employees[0], new Date(at('12:00')).toISOString());
  assert.deepEqual([row.date, row.hours, row.breakMinutes], ['2027-03-03', 3.25, 45]);
  // Ca tăng ca buổi tối cùng ngày cộng dồn.
  Object.assign(db.employees[0], { checkInAt: new Date(at('18:00')).toISOString(), isOnBreak: false, breakStartedAt: null, totalBreakMs: 0 });
  recordAppAttendance(db, db.employees[0], new Date(at('20:00')).toISOString());
  db.employees[0].isOnSite = false;
  assert.equal(appAttendanceHours(db, 'e', '2027-03-03'), 5.25);
  assert.equal(appAttendanceHours(db, 'e', '2027-03-04'), null, 'ngày không vào văn phòng');
  // Dữ liệu máy chấm công được ưu tiên khi có.
  assert.equal(attendanceHours(db, 'e', '2027-03-03'), 5.25);
  db.operations = { attendance: [{ employeeId: 'e', date: '2027-03-03', hours: 6 }] };
  assert.equal(attendanceHours(db, 'e', '2027-03-03'), 6);
});
