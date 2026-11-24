import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBlueprint } from '../src/utils/projectBlueprint.js';
import { nonWorkingDay } from '../../frontend/src/utils/assignmentCalendar.js';

// Người dùng chốt 24/11/2026: việc MOI đánh số tiếp mục; xếp lịch theo ngày công, giữ ngày kết thúc dự án.
const db = () => ({ projects: [], ganttItems: [], employees: [{ id: 'e1', name: 'Duy_KTS', title: 'KT', team: 'KT' }], delivery: { templates: [] }, operations: {} });
const quoteItems = [
  { code: 'A', title: 'Thiết kế', isGroup: true },
  ...Array.from({ length: 8 }, (_, i) => ({ code: `A.${i + 1}`, title: `Việc A${i + 1}`, department: 'KT', workDays: 2 })),
  { code: 'C', title: 'Hồ sơ đấu thầu', isGroup: true },
  { code: 'C.1', title: 'Chuẩn bị HSMT', department: 'KT', workDays: 1 },
  { code: 'C.3', title: 'Hỗ trợ đánh giá', department: 'KT', workDays: 1 },
  { code: 'MOI', title: 'PHÁT HÀNH BẢN VẼ & PHỐI HỢP', department: '', workDays: 0 },
  { code: 'moi', title: 'Phát hành bản vẽ đợt 1', department: 'KT', workDays: 2 },
  { code: 'MOI', title: 'Giải đáp RFI', department: 'KT', workDays: 1 },
];
const plan = () => projectBlueprint(db(), { name: 'Qua Tết 2027', startDate: '2027-01-25', endDate: '2027-02-26', quoteItems }, { email: 'a@aps.vn' });

test('việc ghi MOI được đánh số tiếp theo mục đang đứng', () => {
  const codes = plan().items.filter(item => !item.isGroup).map(item => item.code);
  assert.deepEqual(codes.slice(-5), ['C.1', 'C.3', 'C.4', 'C.5', 'C.6']);
  assert.ok(!codes.some(code => /MOI/i.test(code)));
});

test('xếp lịch theo ngày công: không việc nào bắt đầu / kết thúc vào Chủ nhật, lễ, Tết; giữ ngày kết thúc dự án', () => {
  const tasks = plan().items.filter(item => !item.isGroup);
  for (const task of tasks) {
    assert.equal(nonWorkingDay(task.startDate), null, `${task.code} bắt đầu ${task.startDate}`);
    assert.equal(nonWorkingDay(task.endDate), null, `${task.code} kết thúc ${task.endDate}`);
    assert.ok(task.startDate >= '2027-01-25' && task.endDate <= '2027-02-26');
  }
  assert.ok(!tasks.some(task => task.startDate >= '2027-02-04' && task.endDate <= '2027-02-10'), 'không việc nào nằm trọn trong Tết');
});
