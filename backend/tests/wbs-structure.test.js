import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBlueprint } from '../src/utils/projectBlueprint.js';
import { phasePresetFor, structureFlatWbs, wbsLevel } from '../../frontend/src/utils/wbsStructure.js';

const byCode = items => new Map(items.map(item => [item.code, item]));

test('mã STT được phân cấp theo quy tắc A / A1 / A1.1 / A1.1.1', () => {
  assert.equal(wbsLevel('A'), 'phase');
  assert.equal(wbsLevel('B12'), 'section');
  assert.equal(wbsLevel('A1.1'), 'task');
  assert.equal(wbsLevel('C.1'), 'task');
  assert.equal(wbsLevel('A1.1.1'), 'subtask');
  assert.equal(wbsLevel('GR1'), '');
  assert.equal(phasePresetFor({ isGroup: true, code: 'A', title: 'A. PHẦN THIẾT KẾ XÂY DỰNG' })?.color, '#2563eb');
  assert.equal(phasePresetFor({ isGroup: true, code: 'GR3', title: 'L. NGHỈ LỄ' })?.color, '#eab308');
  assert.equal(phasePresetFor({ isGroup: true, code: 'A1', title: 'A1. Khảo sát', parentGroupId: 'x' }), null);
});

test('nhập file báo giá sinh giai đoạn, mục, task và task con', () => {
  const quoteItems = [
    { code: 'A', title: 'PHẦN THIẾT KẾ', isGroup: true },
    { code: 'A1', title: 'Khảo sát', isGroup: true },
    { code: 'A1.1', title: 'Kick-off', department: 'KT', workDays: 0 },
    { code: 'A1.1.1', title: 'Họp', department: 'KT', workDays: 1 },
    { code: 'A1.1.2', title: 'Biên bản', department: 'KT', workDays: 2 },
    { code: 'A1.2', title: 'Đo đạc', department: 'KT', workDays: 1 },
    { code: 'C', title: 'Hồ sơ đấu thầu', isGroup: true },
    { code: 'C.1', title: 'Lập hồ sơ', department: 'KT', workDays: 1 }
  ];
  const db = { projects: [], ganttItems: [], employees: [], operations: { params: {} } };
  const plan = projectBlueprint(db, { name: 'P', startDate: '2026-11-03', endDate: '2026-11-30', quoteItems }, { email: 'a@aps.com' });
  const items = byCode(plan.items), id = code => items.get(code).id;
  assert.equal(items.get('A').isGroup, true);
  assert.equal(items.get('A').title, 'A. PHẦN THIẾT KẾ');
  assert.equal(items.get('A').color, '#2563eb');
  assert.equal(items.get('C').color, '#16a34a');
  assert.equal(items.get('A1').parentGroupId, id('A'));
  assert.equal(items.get('A1.1').parentGroupId, id('A1'));
  assert.equal(items.get('A1.1.1').parentTaskId, id('A1.1'));
  assert.equal(items.get('A1.1.2').parentGroupId, id('A1'));
  assert.equal(items.get('C.1').parentGroupId, id('C'));
  // Task cha không có công riêng, bao trùm ngày task con và không được tự gán người.
  assert.equal(items.get('A1.1').estimatedHours, 24);
  assert.equal(items.get('A1.1').startDate, items.get('A1.1.1').startDate);
  assert.equal(items.get('A1.1').endDate, items.get('A1.1.2').endDate);
  assert.ok(!plan.allocations.some(row => row.taskId === id('A1.1')));
  assert.equal(plan.totalHours, 40);
});

test('dự án nhập phẳng bằng code cũ tự được dựng lại cấp, chạy lại không đổi gì', () => {
  const row = (id, code, extra = {}) => ({ id, code, title: `Việc ${code}`, projectId: 'p1', startDate: '2026-11-03', endDate: '2026-11-03', estimatedHours: 8, ...extra });
  const db = {
    ganttItems: [
      row('a', 'A'), row('a1', 'A1'), row('a11', 'A1.1', { endDate: '2026-11-05' }), row('a111', 'A1.1.1', { startDate: '2026-11-04' }),
      row('c', 'C'), row('c1', 'C.1', { startDate: '2026-11-10', endDate: '2026-11-12' }),
      row('x', 'B', { projectId: 'p2' })
    ],
    tasks: [{ id: 't-a', ganttId: 'a', status: 'not_started' }, { id: 't-a11', ganttId: 'a11', status: 'not_started' }, { id: 't-x', ganttId: 'x', status: 'in_progress', actualWorkHours: 3 }]
  };
  assert.equal(structureFlatWbs(db), true);
  const items = byCode(db.ganttItems);
  assert.equal(items.get('A').isGroup, true);
  assert.equal(items.get('A').estimatedHours, 0);
  assert.equal(items.get('A1').parentGroupId, 'a');
  assert.equal(items.get('A1.1').parentGroupId, 'a1');
  assert.equal(items.get('A1.1.1').parentTaskId, 'a11');
  assert.equal(items.get('C.1').parentGroupId, 'c');
  assert.equal(items.get('C').endDate, '2026-11-12');
  // Dòng đã có người chấm công thì giữ nguyên là việc.
  assert.equal(items.get('B').isGroup, undefined);
  assert.deepEqual(db.tasks.map(task => task.id), ['t-x']);
  assert.equal(structureFlatWbs(db), false);
});
