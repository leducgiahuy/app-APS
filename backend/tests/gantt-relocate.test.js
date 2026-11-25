import test from 'node:test';
import assert from 'node:assert/strict';
import { relocateGanttTask } from '../src/utils/ganttRelocate.js';
import { effectivePredecessorIds } from '../../frontend/src/utils/ganttLinks.js';

// Như ảnh: mục B4 (B4.1, B4.2) và mục C (C.1, C.2, C.3); kéo C.2 vào giữa B4.1 và B4.2.
const seed = () => {
  const g = (id, title, startDate, endDate) => ({ id, isGroup: true, title, code: id, projectId: 'p', parentGroupId: '', startDate, endDate });
  const t = (id, code, parentGroupId, startDate, endDate, extra = {}) => ({ id, code, title: id, projectId: 'p', parentGroupId, parentTaskId: '', startDate, endDate, ...extra });
  const ganttItems = [
    g('B4', 'B4. Thẩm tra', '2027-05-27', '2027-05-28'),
    t('b41', 'B4.1', 'B4', '2027-05-27', '2027-05-28'),
    t('b42', 'B4.2', 'B4', '2027-05-28', '2027-05-28', { dependencies: ['b41'] }),
    g('C', 'C. Hồ sơ đấu thầu', '2027-05-28', '2027-06-10'),
    t('c1', 'C.1', 'C', '2027-05-28', '2027-05-29'),
    t('c2', 'C.2', 'C', '2027-05-29', '2027-05-31', { dependencies: ['c1'] }),
    t('c21', 'C.2.1', 'C', '2027-05-29', '2027-05-30', { parentTaskId: 'c2' }),
    t('c3', 'C.3', 'C', '2027-05-31', '2027-06-10', { dependencies: ['c2'] }),
  ];
  return { ganttItems, tasks: ganttItems.filter(item => !item.isGroup).map(item => ({ id: `task-${item.id}`, ganttId: item.id, projectId: 'p', code: item.code, parentGroupId: item.parentGroupId })) };
};
const by = (db, id) => db.ganttItems.find(item => item.id === id);
const orderIn = (db, groupId) => db.ganttItems.filter(item => !item.isGroup && !item.parentTaskId && item.parentGroupId === groupId).map(item => item.code);

test('kéo task vào giữa hai task của mục khác: đổi mục, đánh số lại cả hai mục, giữ ngày', () => {
  const db = seed();
  assert.equal(relocateGanttTask(db, 'c2', { groupId: 'B4', beforeId: 'b42' }), '');
  assert.equal(by(db, 'c2').parentGroupId, 'B4');
  assert.deepEqual(orderIn(db, 'B4'), ['B4.1', 'B4.2', 'B4.3'], 'mục mới liền số');
  assert.equal(by(db, 'c2').code, 'B4.2', 'task kéo vào nhận số theo chỗ thả');
  assert.equal(by(db, 'b42').code, 'B4.3');
  assert.deepEqual(orderIn(db, 'C'), ['C.1', 'C.2'], 'mục cũ dồn số (C.3 → C.2)');
  assert.equal(by(db, 'c3').code, 'C.2');
  assert.equal(by(db, 'c21').code, 'B4.2.1', 'task con đi theo');
  assert.equal(by(db, 'c21').parentGroupId, 'B4');
  assert.equal(db.tasks.find(task => task.ganttId === 'c2').code, 'B4.2', 'task ở trang Công việc cùng STT');
  assert.deepEqual([by(db, 'c2').startDate, by(db, 'c2').endDate], ['2027-05-29', '2027-05-31'], 'giữ ngày');
  assert.equal(by(db, 'B4').endDate, '2027-05-31', 'mục mới nới ngày bao trùm task');
});

test('đường nối FS: chỗ cũ nối thẳng, chỗ mới nối theo thứ tự trước → task kéo vào → sau', () => {
  const db = seed();
  relocateGanttTask(db, 'c2', { groupId: 'B4', beforeId: 'b42' });
  assert.deepEqual(by(db, 'c3').dependencies, ['c1'], 'C.3 cũ nối thẳng từ C.1');
  assert.deepEqual(by(db, 'b42').dependencies, ['c2'], 'B4.3 nối từ task kéo vào');
  // Task kéo vào không còn liên kết đặt tay → tự nối từ task đứng ngay trước trên bảng (B4.1).
  const rows = db.ganttItems;
  assert.deepEqual(effectivePredecessorIds(by(db, 'c2'), rows), ['b41']);
});

test('thả vào dòng mục: task xuống cuối mục; thả về đúng chỗ cũ: không đổi gì', () => {
  const db = seed();
  assert.equal(relocateGanttTask(db, 'c1', { groupId: 'B4' }), '');
  assert.deepEqual(orderIn(db, 'B4'), ['B4.1', 'B4.2', 'B4.3']);
  assert.equal(by(db, 'c1').code, 'B4.3');
  const fresh = seed(), before = JSON.stringify(fresh);
  assert.equal(relocateGanttTask(fresh, 'c2', { groupId: 'C', beforeId: 'c3' }), '');
  assert.equal(JSON.stringify(fresh), before);
});

test('đổi thứ tự trong cùng mục và các trường hợp không hợp lệ', () => {
  const db = seed();
  assert.equal(relocateGanttTask(db, 'c3', { groupId: 'C', beforeId: 'c1' }), '');
  assert.deepEqual(db.ganttItems.filter(item => !item.isGroup && !item.parentTaskId && item.parentGroupId === 'C').map(item => item.id), ['c3', 'c1', 'c2']);
  assert.deepEqual(orderIn(db, 'C'), ['C.1', 'C.2', 'C.3']);
  assert.match(relocateGanttTask(seed(), 'c21', { groupId: 'B4' }), /task cha/);
  assert.match(relocateGanttTask(seed(), 'B4', { groupId: 'C' }), /không kéo mục/);
  assert.match(relocateGanttTask(seed(), 'c2', { groupId: 'b41' }), /mục công việc/);
  assert.match(relocateGanttTask(seed(), 'c2', { groupId: 'B4', beforeId: 'c1' }), /không hợp lệ/);
});
