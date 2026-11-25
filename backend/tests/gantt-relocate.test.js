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

// Kéo MỤC CON (người dùng chốt 25/11/2026): như ảnh — giai đoạn B chứa B2, B3, B4; giai đoạn C chứa task C.1.
const seedSections = () => {
  const g = (id, title, parentGroupId, startDate, endDate) => ({ id, isGroup: true, title, code: id, projectId: 'p', parentGroupId, startDate, endDate });
  const t = (id, code, parentGroupId, startDate, endDate, extra = {}) => ({ id, code, title: id, projectId: 'p', parentGroupId, parentTaskId: '', startDate, endDate, ...extra });
  const ganttItems = [
    g('B', 'B. HỒ SƠ ĐẤU NỐI', '', '2027-05-18', '2027-05-28'),
    g('B2', 'B2. Đấu nối hạ tầng', 'B', '2027-05-18', '2027-05-19'),
    t('b21', 'B2.1', 'B2', '2027-05-18', '2027-05-19'),
    g('B3', 'B3. Thẩm định', 'B', '2027-05-19', '2027-05-27'),
    t('b31', 'B3.1', 'B3', '2027-05-19', '2027-05-20', { dependencies: ['b21'] }),
    t('b32', 'B3.2', 'B3', '2027-05-21', '2027-05-27', { dependencies: ['b31'] }),
    g('B4', 'B4. Thẩm tra', 'B', '2027-05-27', '2027-05-28'),
    t('b41', 'B4.1', 'B4', '2027-05-27', '2027-05-28', { dependencies: ['b32'] }),
    t('b411', 'B4.1.1', 'B4', '2027-05-27', '2027-05-27', { parentTaskId: 'b41' }),
    g('C', 'C. Hồ sơ đấu thầu', '', '2027-05-28', '2027-06-10'),
    t('c1', 'C.1', 'C', '2027-05-28', '2027-05-29'),
  ];
  return { ganttItems, tasks: ganttItems.filter(item => !item.isGroup).map(item => ({ id: `task-${item.id}`, ganttId: item.id, projectId: 'p', code: item.code })) };
};
const sectionsIn = (db, phaseId) => db.ganttItems.filter(item => item.isGroup && item.parentGroupId === phaseId).map(item => item.title);

test('kéo mục con lên trước mục khác: đổi thứ tự, đánh số lại liền từ 1, task bên trong đổi theo', async () => {
  const { relocateGanttRow } = await import('../src/utils/ganttRelocate.js');
  const db = seedSections();
  assert.equal(relocateGanttRow(db, 'B4', { groupId: 'B', beforeId: 'B2' }), '');
  assert.deepEqual(sectionsIn(db, 'B'), ['B1. Thẩm tra', 'B2. Đấu nối hạ tầng', 'B3. Thẩm định']);
  assert.deepEqual(['b41', 'b411', 'b21', 'b31', 'b32'].map(id => by(db, id).code), ['B1.1', 'B1.1.1', 'B2.1', 'B3.1', 'B3.2']);
  assert.equal(db.tasks.find(task => task.ganttId === 'b41').code, 'B1.1', 'task ở trang Công việc cùng STT');
  // FS: chỗ cũ — không còn ai nối từ khối (b41 đã đi); khối không nối ra ngoài nữa; mục đứng sau (B2) nối từ task cuối của khối.
  assert.deepEqual(by(db, 'b41').dependencies, []);
  assert.deepEqual(by(db, 'b21').dependencies || [], [], 'b21 vốn không có liên kết đặt tay');
  assert.deepEqual([by(db, 'b41').startDate, by(db, 'b41').endDate], ['2027-05-27', '2027-05-28'], 'giữ ngày');
});

test('kéo mục con sang giai đoạn khác: thành mục của giai đoạn đó, cả hai giai đoạn đánh số lại', async () => {
  const { relocateGanttRow } = await import('../src/utils/ganttRelocate.js');
  const db = seedSections();
  assert.equal(relocateGanttRow(db, 'B3', { groupId: 'C' }), '');
  assert.equal(by(db, 'B3').parentGroupId, 'C');
  assert.deepEqual(sectionsIn(db, 'C'), ['C1. Thẩm định']);
  assert.deepEqual(sectionsIn(db, 'B'), ['B1. Đấu nối hạ tầng', 'B2. Thẩm tra']);
  assert.deepEqual(['b31', 'b32', 'b41', 'c1'].map(id => by(db, id).code), ['C1.1', 'C1.2', 'B2.1', 'C.1']);
  assert.deepEqual(by(db, 'b41').dependencies, ['b21'], 'chỗ cũ nối thẳng: B2.1 (cũ B4.1) nối từ task trước khối');
  assert.deepEqual(by(db, 'b32').dependencies, ['b31'], 'liên kết bên trong khối giữ nguyên');
  assert.equal(by(db, 'C').startDate, '2027-05-19', 'giai đoạn C nới ngày bao trùm mục mới');
});

test('giai đoạn lớn không kéo được; thả sai chỗ bị chặn', async () => {
  const { relocateGanttRow } = await import('../src/utils/ganttRelocate.js');
  assert.match(relocateGanttRow(seedSections(), 'B', { groupId: 'C' }), /Giai đoạn lớn/);
  assert.match(relocateGanttRow(seedSections(), 'B3', { groupId: 'B2' }), /giai đoạn/);
  assert.match(relocateGanttRow(seedSections(), 'B3', { groupId: 'B', beforeId: 'b21' }), /không hợp lệ/);
  const db = seedSections(), before = JSON.stringify(db);
  assert.equal(relocateGanttRow(db, 'B3', { groupId: 'B', beforeId: 'B4' }), '', 'thả về đúng chỗ cũ');
  assert.equal(JSON.stringify(db), before);
});
