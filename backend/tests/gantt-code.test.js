import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWbsCodeChange, itemWbsCode } from '../src/utils/ganttCode.js';

const seed = () => {
  const g = (id, title, parentGroupId = '') => ({ id, isGroup: true, title, code: id, projectId: 'p', parentGroupId });
  const t = (id, code, parentGroupId, parentTaskId = '') => ({ id, code, title: id, projectId: 'p', parentGroupId, parentTaskId });
  const ganttItems = [
    g('A', 'A. KHẢO SÁT'), g('A1', 'A1. 1. HIỆN TRẠNG', 'A'),
    t('t11', 'A1.1', 'A1'), t('t12', 'A1.2', 'A1'), t('t121', 'A1.2.1', 'A1', 't12'), t('t13', 'A1.3', 'A1'),
    g('A2', 'A2. 2. Ý TƯỞNG', 'A'), t('t21', 'A2.1', 'A2'), t('t22', 'A2.2', 'A2'),
    { id: 'other', code: 'A1.9', title: 'dự án khác', projectId: 'q', parentGroupId: '' },
  ];
  return { ganttItems, tasks: ganttItems.filter(item => !item.isGroup).map(item => ({ id: `task-${item.id}`, ganttId: item.id, code: item.code, projectId: item.projectId })) };
};
const order = db => db.ganttItems.filter(item => item.projectId === 'p').map(itemWbsCode);
const byId = (db, id) => db.ganttItems.find(item => item.id === id);

test('đổi STT task: cập nhật task Công việc, xếp lại vị trí, dòng con đổi theo', () => {
  const db = seed();
  // A1.2 → a1.5: chuyển xuống cuối mục rồi cả mục đánh số lại liền (người dùng chốt 25/11/2026).
  assert.equal(applyWbsCodeChange(db, byId(db, 't12'), 'a1.5'), '');
  assert.deepEqual(['t11', 't13', 't12', 't121'].map(id => byId(db, id).code), ['A1.1', 'A1.2', 'A1.3', 'A1.3.1'], 'đánh số lại liền, task con đổi theo');
  assert.equal(db.tasks.find(task => task.ganttId === 't12').code, 'A1.3', 'task ở trang Công việc cùng STT');
  assert.deepEqual(order(db).filter(code => /^A1\.\d$/.test(code)), ['A1.1', 'A1.2', 'A1.3'], 'xếp lại theo STT mới');
});

test('đổi STT sang mục khác đang có: chuyển task (và task con) sang mục đó', () => {
  const db = seed();
  assert.equal(applyWbsCodeChange(db, byId(db, 't12'), 'A2.3'), '');
  assert.equal(byId(db, 't12').parentGroupId, 'A2');
  assert.equal(byId(db, 't121').parentGroupId, 'A2', 'task con theo task cha');
  assert.equal(byId(db, 't121').code, 'A2.3.1');
  // Task con đổi STT thành task lá của mục khác → rời task cha.
  assert.equal(applyWbsCodeChange(db, byId(db, 't121'), 'A1.4'), '');
  assert.equal(byId(db, 't121').parentTaskId, '');
  assert.equal(byId(db, 't121').parentGroupId, 'A1');
});

test('đổi STT mục: tên mục đổi tiền tố, mọi dòng con đổi theo', () => {
  const db = seed();
  assert.equal(applyWbsCodeChange(db, byId(db, 'A1'), 'A3'), '');
  assert.equal(byId(db, 'A1').title, 'A3. 1. HIỆN TRẠNG');
  assert.deepEqual(['t11', 't12', 't121', 't13'].map(id => byId(db, id).code), ['A3.1', 'A3.2', 'A3.2.1', 'A3.3']);
  assert.deepEqual(order(db).filter(code => /^A\d$/.test(code)), ['A2', 'A3'], 'mục A3 xếp sau A2');
  // Đổi giai đoạn A → B: mục và task bên trong đổi chữ cái.
  assert.equal(applyWbsCodeChange(db, byId(db, 'A'), 'B'), '');
  assert.equal(byId(db, 'A').title, 'B. KHẢO SÁT');
  assert.equal(byId(db, 'A2').title, 'B2. 2. Ý TƯỞNG');
  assert.equal(byId(db, 't22').code, 'B2.2');
});

test('task đổi sang STT đang có trong mục: chèn vào vị trí đó, các task sau lùi số (C.5 → C.1)', () => {
  const db = seed();
  assert.equal(applyWbsCodeChange(db, byId(db, 't13'), 'A1.1'), '');
  assert.deepEqual(['t13', 't11', 't12', 't121'].map(id => byId(db, id).code), ['A1.1', 'A1.2', 'A1.3', 'A1.3.1']);
  assert.deepEqual(order(db).filter(code => /^A1\.\d$/.test(code)), ['A1.1', 'A1.2', 'A1.3']);
});

test('STT sai dạng / mục trùng bị từ chối, không sửa dữ liệu', () => {
  const db = seed();
  assert.match(applyWbsCodeChange(db, byId(db, 't11'), 'A1#3'), /chỉ gồm/);
  assert.match(applyWbsCodeChange(db, byId(db, 't11'), ''), /nhập STT/);
  assert.equal(applyWbsCodeChange(db, byId(db, 't11'), 'A1.9'), '', 'trùng STT ở dự án khác thì không sao');
  // Mục A1 → A2: dòng con A1.1 thành A2.1 trùng → từ chối, giữ nguyên.
  const fresh = seed();
  assert.match(applyWbsCodeChange(fresh, byId(fresh, 'A1'), 'A2'), /đã có trong dự án/);
  assert.equal(byId(fresh, 't11').code, 'A1.1');
});
