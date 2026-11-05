import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBlueprint } from '../src/utils/projectBlueprint.js';
import { rescheduleGanttRange } from '../src/utils/ganttReschedule.js';
import { normalizeAssignmentSchedules, taskWorkingDates } from '../../frontend/src/utils/assignmentCalendar.js';
import { calculateAssignmentHours } from '../../frontend/src/utils/ganttEffort.js';

const rows = [
  { code: 'A', title: 'KHẢO SÁT & THIẾT KẾ Ý TƯỞNG', isGroup: true },
  { code: 'A1', title: 'KHẢO SÁT HIỆN TRẠNG', isGroup: true },
  { code: 'A1.1', title: 'Kick-off', department: 'KT', workDays: 1 },
  { code: 'A1.2', title: 'Khảo sát', department: 'KT, KC, HT', workDays: 3 },
  { code: 'A1.3', title: 'Yêu cầu', department: 'KT, KC, HT', workDays: 2 },
  { code: 'A1.4', title: 'Tổng hợp', department: 'KT, KC', workDays: 1 },
  { code: 'A2', title: 'THIẾT KẾ Ý TƯỞNG', isGroup: true },
  { code: 'A2.1', title: 'Phân tích', department: 'KT, HT', workDays: 2 },
  { code: 'A2.2', title: 'Phương án', department: 'KT, KC, HT', workDays: 5 },
  { code: 'A2.3', title: 'Hình khối', department: 'KT', workDays: 4 },
  { code: 'A2.4', title: 'Trình bày', department: 'KT, KC, CĐT', workDays: 3 },
];
const employees = ['KT', 'KC', 'HT'].flatMap((d, i) => [0, 1].map(n => ({ id: `e${i}${n}`, name: `NV${n}_${d}`, title: d, department: d, status: 'active' })));

function setup() {
  const db = { projects: [], ganttItems: [], tasks: [], employees, operations: { params: {} } };
  const plan = projectBlueprint(db, { name: 'P', startDate: '2026-11-04', endDate: '2026-12-04', quoteItems: rows }, { email: 'a@aps.com' });
  db.projects.push(plan.project);
  db.ganttItems.push(...plan.items);
  db.tasks.push(...plan.items.filter(t => !t.isGroup).map(t => ({ ...t, id: `task-${t.id}`, ganttId: t.id })));
  normalizeAssignmentSchedules(db);
  return { db, project: plan.project, byCode: code => db.ganttItems.find(item => item.code === code) };
}
const hoursOf = item => item.assignees.reduce((sum, a) => sum + calculateAssignmentHours(item, a), 0);

function assertKeepsWork(db, byCode) {
  for (const row of rows.filter(r => !r.isGroup)) {
    const item = byCode(row.code);
    assert.equal(item.contractWork, row.workDays, `${row.code}: Dự toán không đổi`);
    assert.equal(Math.round(hoursOf(item) * 100) / 100, row.workDays * 8, `${row.code}: giờ kế hoạch giữ đúng công × 8`);
    assert.equal(item.estimatedHours, row.workDays * 8, `${row.code}: tổng giờ lưu đúng`);
    assert.ok(taskWorkingDates(item).length > 0, `${row.code}: còn ngày làm việc (không nằm trọn CN / lễ)`);
    const task = db.tasks.find(t => t.ganttId === item.id);
    assert.equal(task.startDate, item.startDate, `${row.code}: task ở trang Công việc cùng ngày bắt đầu`);
    assert.equal(task.endDate, item.endDate);
  }
  for (const code of ['A', 'A1', 'A2']) {
    const group = byCode(code);
    const children = db.ganttItems.filter(item => item.parentGroupId === group.id);
    assert.ok(children.every(child => child.startDate >= group.startDate && child.endDate <= group.endDate), `${code} bao trùm mục con`);
  }
}

test('đổi ngày dự án: dời toàn bộ giai đoạn / mục / task bên trong, giữ nguyên công từng mục', () => {
  const { db, project, byCode } = setup();
  const before = new Map(db.ganttItems.map(item => [item.code, item.startDate]));
  // Dời dự án 2 tuần (cùng độ dài) → mọi mục dời đúng 14 ngày (cùng thứ trong tuần, không rơi vào CN mới).
  const error = rescheduleGanttRange(db, { items: db.ganttItems, oldStart: project.startDate, oldEnd: project.endDate, newStart: '2026-11-18', newEnd: '2026-12-18' });
  assert.equal(error, null);
  normalizeAssignmentSchedules(db);
  for (const item of db.ganttItems) {
    assert.equal((Date.parse(item.startDate) - Date.parse(before.get(item.code))) / 86400000, 14, `${item.code} dời 14 ngày`);
  }
  assertKeepsWork(db, byCode);
});

test('đổi ngày dự án lệch thứ trong tuần / co ngắn: task không rơi trọn vào CN, vẫn đủ giờ', () => {
  for (const [newStart, newEnd] of [['2026-11-05', '2026-12-05'], ['2026-11-04', '2026-11-24'], ['2026-11-02', '2026-12-20']]) {
    const { db, project, byCode } = setup();
    const error = rescheduleGanttRange(db, { items: db.ganttItems, oldStart: project.startDate, oldEnd: project.endDate, newStart, newEnd });
    assert.equal(error, null, `${newStart} → ${newEnd}`);
    normalizeAssignmentSchedules(db);
    assertKeepsWork(db, byCode);
    assert.ok(db.ganttItems.every(item => item.startDate >= newStart && item.endDate <= newEnd), 'mọi mục trong khung mới');
  }
});

test('đổi ngày một giai đoạn: mục con dời theo và vẫn giữ nguyên giờ (cùng hàm với đổi ngày dự án)', () => {
  const { db, byCode } = setup();
  const a2 = byCode('A2');
  const children = db.ganttItems.filter(item => item.parentGroupId === a2.id);
  const error = rescheduleGanttRange(db, { items: children, oldStart: a2.startDate, oldEnd: a2.endDate, newStart: '2026-11-16', newEnd: '2026-12-04' });
  assert.equal(error, null);
  normalizeAssignmentSchedules(db);
  assert.ok(children.every(child => child.startDate >= '2026-11-16'));
  assertKeepsWork(db, byCode);
});
