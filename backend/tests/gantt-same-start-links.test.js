import test from 'node:test';
import assert from 'node:assert/strict';
import { sameStartLinkSource } from '../../frontend/src/utils/ganttLinks.js';

const task = (id, startDate, extra = {}) => ({ id, projectId: 'p', parentGroupId: 'A1', startDate, ...extra });

test('task bắt đầu cùng ngày: không nối với nhau, task cuối cụm nối sang task ngày khác', () => {
  const rows = [
    { id: 'A1', isGroup: true, projectId: 'p' },
    task('a1', '2026-11-26'), task('a2', '2026-11-26'), task('a3', '2026-11-26'), task('a4', '2026-11-26'),
    task('a5', '2026-11-30'), task('a6', '2026-12-01'),
  ];
  const source = sameStartLinkSource(rows);
  assert.equal(source('a1', 'a2'), null);
  assert.equal(source('a3', 'a4'), null);
  assert.equal(source('a4', 'a5'), 'a4');
  assert.equal(source('a2', 'a5'), 'a4', 'nối từ giữa cụm → vẽ từ task cuối cụm');
  assert.equal(source('a5', 'a6'), 'a5', 'task không thuộc cụm giữ nguyên');
  assert.equal(source('a5', 'a2'), 'a5', 'đường đi vào cụm giữ nguyên');
});

test('cụm bị cắt bởi nhóm khác, task cha khác, hoặc ngày khác', () => {
  const rows = [
    task('x1', '2026-11-26'), task('x2', '2026-11-27'), task('x3', '2026-11-26'),
    { id: 'A2', isGroup: true, projectId: 'p' },
    task('y1', '2026-11-26', { parentGroupId: 'A2' }),
  ];
  const source = sameStartLinkSource(rows);
  assert.equal(source('x1', 'x2'), 'x1');
  assert.equal(source('x2', 'x3'), 'x2');
  assert.equal(source('x3', 'y1'), 'x3');
});

test('trả về danh sách cụm và task đầu cụm để vẽ đường dọc chung', () => {
  const rows = [task('a1', '2026-11-26'), task('a2', '2026-11-26'), task('a3', '2026-11-26'), task('b', '2026-11-30')];
  const source = sameStartLinkSource(rows);
  assert.deepEqual(source.blocks, [['a1', 'a2', 'a3']]);
  assert.equal(source.blockHead('a3'), 'a1');
  assert.equal(source.blockHead('b'), null);
});
