import test from 'node:test';
import assert from 'node:assert/strict';
import { personalTaskChain } from '../../frontend/src/utils/personalTaskChain.js';

const task = (id, start, end, assignees, extra = {}) => ({ id, startDate: start, endDate: end, assignees, ...extra });

test('đường riêng "Chỉ việc của tôi" nối việc của đúng người theo ngày làm của họ', () => {
  const items = [
    { id: 'grp', isGroup: true },
    task('a', '2026-11-06', '2026-11-07', [{ employeeId: 'hieu', startDate: '2026-11-06', endDate: '2026-11-07' }, { employeeId: 'nv1' }]),
    // Dòng xếp trước nhưng phân công của Hiếu bắt đầu muộn hơn → đứng sau trong chuỗi.
    task('b', '2026-11-01', '2026-11-30', [{ employeeId: 'hieu', startDate: '2026-11-23', endDate: '2026-11-24' }]),
    task('c', '2026-11-11', '2026-11-12', [{ employeeId: 'hieu' }]),
    task('d', '2026-11-08', '2026-11-08', [{ employeeId: 'thinh' }]),
    task('parent', '2026-11-09', '2026-11-09', [{ employeeId: 'hieu' }], { hasTaskChildren: true }),
    task('holiday', '2026-11-10', '2026-11-10', [{ employeeId: 'hieu' }], { status: 'holiday' }),
  ];
  assert.deepEqual(personalTaskChain(items, 'hieu'), [['a', 'c'], ['c', 'b']]);
  assert.deepEqual(personalTaskChain(items, 'thinh'), []);
  assert.deepEqual(personalTaskChain(items, ''), []);
  // Không đụng tới phụ thuộc của dự án.
  assert.ok(items.every(item => item.dependencies === undefined));
});
