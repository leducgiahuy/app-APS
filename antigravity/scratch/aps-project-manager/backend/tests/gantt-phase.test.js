import test from 'node:test';
import assert from 'node:assert/strict';
import { createGanttPhaseResolver } from '../../frontend/src/utils/ganttPhase.js';

const groups = [
  { id: 'phase', projectId: 'p', isGroup: true, title: 'A. Thiết kế', color: '#a8c4f7' },
  { id: 'group', projectId: 'p', isGroup: true, parentGroupId: 'phase', title: 'A1. Khảo sát' },
  { id: 'g', projectId: 'p', parentGroupId: 'group', code: 'A1.1' }
];
const task = { id: 't', ganttId: 'g', projectId: 'p', phase: 'Tên giai đoạn cũ' };

test('chart phase uses the current root Gantt group through stable IDs', () => {
  assert.deepEqual(createGanttPhaseResolver(groups)(task), { name: 'A. Thiết kế', color: '#a8c4f7' });
  const renamed = groups.map(group => group.id === 'phase' ? { ...group, title: 'Thiết kế và tư vấn mới' } : group);
  assert.equal(createGanttPhaseResolver(renamed)(task).name, 'Thiết kế và tư vấn mới');
});

test('new phases and child tasks resolve through the live Gantt hierarchy', () => {
  const added = [...groups,
    { id: 'new-phase', projectId: 'p', isGroup: true, title: 'D. Vận hành' },
    { id: 'parent', projectId: 'p', parentGroupId: 'new-phase' },
    { id: 'child', projectId: 'p', parentTaskId: 'parent' }
  ];
  assert.equal(createGanttPhaseResolver(added)({ id: 'new-task', ganttId: 'child', projectId: 'p' }).name, 'D. Vận hành');
});

test('legacy WBS and missing classification work without leaking across projects', () => {
  const legacy = groups.map(({ parentGroupId, ...group }) => group);
  assert.equal(createGanttPhaseResolver(legacy)(task).name, 'A. Thiết kế');
  assert.equal(createGanttPhaseResolver(groups)({ id: 'other', code: 'A1.1', projectId: 'other' }).name, 'Chưa phân loại');
  assert.equal(createGanttPhaseResolver([])({ id: 'no-gantt', phase: 'Legacy phase' }).name, 'Legacy phase');
});
