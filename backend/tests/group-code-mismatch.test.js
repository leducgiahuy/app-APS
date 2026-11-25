import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWbsCodeChange } from '../src/utils/ganttCode.js';

test('mục tên "A2." nhưng mã lưu A3: lưu STT A2 thì task A3.x đổi thành A2.x', () => {
  const db = {
    tasks: [{ id: 't1', ganttId: 'g31', code: 'A3.1' }],
    ganttItems: [
      { id: 'A', projectId: 'p', isGroup: true, code: 'A', title: 'A. THIẾT KẾ', parentGroupId: '' },
      { id: 'A1', projectId: 'p', isGroup: true, code: 'A1', title: 'A1. KHẢO SÁT', parentGroupId: 'A' },
      { id: 'g11', projectId: 'p', code: 'A1.1', title: 'x', parentGroupId: 'A1' },
      { id: 'A3', projectId: 'p', isGroup: true, code: 'A3', title: 'A2. Ý TƯỞNG', parentGroupId: 'A' },
      { id: 'g31', projectId: 'p', code: 'A3.1', title: 'y', parentGroupId: 'A3' },
      { id: 'g32', projectId: 'p', code: 'A3.2', title: 'z', parentGroupId: 'A3' },
      { id: 'g32a', projectId: 'p', code: 'A3.2.1', title: 'con', parentGroupId: 'A3', parentTaskId: 'g32' },
    ],
  };
  assert.equal(applyWbsCodeChange(db, db.ganttItems[3], 'A2'), '');
  const code = id => db.ganttItems.find(item => item.id === id).code;
  assert.deepEqual(['A3', 'g31', 'g32', 'g32a', 'g11'].map(code), ['A2', 'A2.1', 'A2.2', 'A2.2.1', 'A1.1']);
  assert.equal(db.ganttItems.find(item => item.id === 'A3').title, 'A2. Ý TƯỞNG');
  assert.equal(db.tasks[0].code, 'A2.1', 'trang Công việc nhận mã mới');
});

test('mục có mã tạm GR3 không bị coi là lệch', () => {
  const db = { tasks: [], ganttItems: [{ id: 'g', projectId: 'p', isGroup: true, code: 'GR3', title: 'A6. MỚI', parentGroupId: '' }] };
  assert.equal(applyWbsCodeChange(db, db.ganttItems[0], 'A6'), '');
  assert.equal(db.ganttItems[0].code, 'GR3');
});

test('mục A2 còn task A3.x (sau khi kéo mục): lưu lại STT A2 thì task về A2.x, task MOI giữ nguyên', () => {
  const db = { tasks: [], ganttItems: [
    { id: 'A', projectId: 'p', isGroup: true, code: 'A', title: 'A. X', parentGroupId: '' },
    { id: 's2', projectId: 'p', isGroup: true, code: 'A2', title: 'A2. Ý TƯỞNG', parentGroupId: 'A' },
    { id: 'x1', projectId: 'p', code: 'A3.1', parentGroupId: 's2' },
    { id: 'x2', projectId: 'p', code: 'A3.2', parentGroupId: 's2' },
    { id: 'x3', projectId: 'p', code: 'MOI', parentGroupId: 's2' },
    { id: 's3', projectId: 'p', isGroup: true, code: 'A3', title: 'A3. KHẢ THI', parentGroupId: 'A' },
    { id: 'y1', projectId: 'p', code: 'A3.1', parentGroupId: 's3' },
  ] };
  assert.equal(applyWbsCodeChange(db, db.ganttItems[1], 'A2'), '');
  const code = id => db.ganttItems.find(item => item.id === id).code;
  assert.deepEqual(['x1', 'x2', 'x3', 'y1'].map(code), ['A2.1', 'A2.2', 'MOI', 'A3.1']);
});
