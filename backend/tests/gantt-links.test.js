import test from 'node:test';
import assert from 'node:assert/strict';
import { effectivePredecessorIds, effectiveSuccessorIds, implicitPredecessorId, linkChanges } from '../../frontend/src/utils/ganttLinks.js';

// Bảng theo thứ tự hiển thị: nhóm A1 rồi các task.
const rows = () => [
  { id: 'A1', isGroup: true, projectId: 'p' },
  { id: 'a', projectId: 'p', parentTaskId: '' },
  { id: 'b', projectId: 'p' },
  { id: 'c', projectId: 'p', parentTaskId: '' },
  { id: 'c1', projectId: 'p', parentTaskId: 'c' },
  { id: 'd', projectId: 'p', parentTaskId: '' },
];
const at = (list, id) => list.find(row => row.id === id);

test('liên kết đang có: tự nối từ task ngay trước (cùng task cha), đặt tay thì theo đặt tay, đã xóa thì không hiện', () => {
  const list = rows();
  assert.equal(implicitPredecessorId(at(list, 'a'), list), '', 'task đầu không có task trước');
  assert.deepEqual(effectivePredecessorIds(at(list, 'b'), list), ['a'], 'parentTaskId thiếu hay rỗng đều coi như không có task cha');
  assert.deepEqual(effectivePredecessorIds(at(list, 'd'), list), ['c'], 'bỏ qua task con của task khác');
  assert.deepEqual(effectivePredecessorIds(at(list, 'c1'), list), [], 'task con đầu tiên không tự nối ra ngoài');
  at(list, 'd').dependencies = ['a'];
  assert.deepEqual(effectivePredecessorIds(at(list, 'd'), list), ['a']);
  at(list, 'c').suppressedDependencies = ['b'];
  assert.deepEqual(effectivePredecessorIds(at(list, 'c'), list), []);
  assert.deepEqual(effectiveSuccessorIds(at(list, 'a'), list), ['b', 'd']);
});

test('đổi Công việc trước: nối từ task được chọn, xóa liên kết tự nối cũ để không hiện lại', () => {
  const list = rows();
  assert.deepEqual(linkChanges(at(list, 'c'), list, { predecessorId: 'b', successorId: 'd' }), [], 'không đổi gì → không gửi gì');
  assert.deepEqual(linkChanges(at(list, 'c'), list, { predecessorId: 'a', successorId: 'd' }), [
    { id: 'c', patch: { dependencies: ['a'], suppressedDependencies: ['b'] } },
  ]);
  assert.deepEqual(linkChanges(at(list, 'c'), list, { predecessorId: '', successorId: 'd' }), [
    { id: 'c', patch: { dependencies: [], suppressedDependencies: ['b'] } },
  ], 'bỏ liên kết');
});

test('đổi Công việc sau: task sau cũ bỏ liên kết, task sau mới giữ liên kết đang có và thêm task này', () => {
  const list = rows();
  // b đang nối tới c (tự nối); đổi sang nối tới d (d đang tự nối từ c).
  assert.deepEqual(linkChanges(at(list, 'b'), list, { predecessorId: 'a', successorId: 'd' }), [
    { id: 'c', patch: { suppressedDependencies: ['b'] } },
    { id: 'd', patch: { dependencies: ['c', 'b'], suppressedDependencies: [] } },
  ]);
  assert.deepEqual(linkChanges(at(list, 'b'), list, { predecessorId: 'a', successorId: '' }), [
    { id: 'c', patch: { suppressedDependencies: ['b'] } },
  ], 'bỏ task sau');
});
