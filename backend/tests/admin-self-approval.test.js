import test from 'node:test';
import assert from 'node:assert/strict';
import { canReviewSheet } from '../src/utils/operationsReports.js';
import { confirmBlockReason } from '../../frontend/src/utils/deliveryMetrics.js';

// Người dùng chốt 20/11/2026: Quản trị là quyền cao nhất, không bị chặn tự duyệt / tự xác nhận; vai trò khác vẫn bị chặn.
const db = { operations: { members: [] }, delivery: { users: [] } };
const ownSheet = { projectId: 'p', employeeId: 'e1', createdBy: 'boss@aps.vn' };

test('Quản trị duyệt được giờ của chính mình; Giám đốc / Quản lý thì không', () => {
  assert.equal(canReviewSheet(db, { role: 'admin', email: 'boss@aps.vn', employeeId: 'e1' }, ownSheet), true);
  assert.equal(canReviewSheet(db, { role: 'director', email: 'boss@aps.vn', employeeId: 'e1' }, ownSheet), false);
  assert.equal(canReviewSheet(db, { role: 'manager', email: 'boss@aps.vn', employeeId: 'e1' }, ownSheet), false);
});

test('Quản trị xác nhận được việc do chính mình làm; Leader thì không', () => {
  const item = { assignees: [{ employeeId: 'e1' }] };
  assert.equal(confirmBlockReason({ viewer: { role: 'admin', employeeId: 'e1' }, item }), '');
  assert.match(confirmBlockReason({ viewer: { role: 'leader', employeeId: 'e1' }, item }), /chính mình/);
});
