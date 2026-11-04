import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizedLevel, requiredEvidenceKind } from '../../frontend/src/utils/deliveryMetrics.js';

test('mỗi mức trạng thái cần đúng loại bằng chứng', () => {
  assert.equal(requiredEvidenceKind({ level: 40 }), null);
  assert.equal(requiredEvidenceKind({ level: 60 }), 'handover');
  assert.equal(requiredEvidenceKind({ level: 60, kind: 'legal' }), 'receipt');
  assert.equal(requiredEvidenceKind({ level: 80 }), 'feedback');
  assert.equal(requiredEvidenceKind({ level: 100 }), 'approval');
  // Chưa xác nhận thì chỉ ghi nhận 40% dù đã chọn 100% và có tệp.
  assert.equal(recognizedLevel({ level: 100, evidenceId: 'f1' }), 40);
  assert.equal(recognizedLevel({ level: 100, evidenceId: 'f1', confirmedBy: 'ql@aps.vn' }), 100);
});

import { confirmBlockReason } from '../../frontend/src/utils/deliveryMetrics.js';

test('quy tắc xác nhận áp cho mọi task: không tự xác nhận, luôn có cấp trên gỡ được', () => {
  const item = { assignees: [{ employeeId: 'e-ql' }] };
  const record = { level: 100, submittedBy: 'admin@aps.vn' };
  // Quản trị nhập hộ mức của việc Quản lý: vẫn xác nhận được (trước đây bị kẹt).
  assert.equal(confirmBlockReason({ viewer: { role: 'admin', email: 'admin@aps.vn' }, item, record, assigneeRoles: ['manager'] }), '');
  assert.equal(confirmBlockReason({ viewer: { role: 'director', email: 'gd@aps.vn' }, item, record, assigneeRoles: ['manager'] }), '');
  // Quản lý là người làm thì không tự xác nhận; Leader không xác nhận việc của Quản lý.
  assert.match(confirmBlockReason({ viewer: { role: 'manager', email: 'ql@aps.vn', employeeId: 'e-ql' }, item, record, assigneeRoles: ['manager'] }), /chính mình/);
  assert.match(confirmBlockReason({ viewer: { role: 'leader', email: 'ld@aps.vn', employeeId: 'e-ld' }, item, record, assigneeRoles: ['manager'] }), /Giám đốc/);
  // Việc của Leader cần Quản lý trở lên; Leader tự báo cáo mức thì không tự xác nhận.
  assert.match(confirmBlockReason({ viewer: { role: 'leader', email: 'ld2@aps.vn', employeeId: 'e-2' }, item: { assignees: [{ employeeId: 'e-ld' }] }, record, assigneeRoles: ['leader'] }), /Quản lý/);
  assert.equal(confirmBlockReason({ viewer: { role: 'manager', email: 'ql@aps.vn', employeeId: 'e-ql' }, item: { assignees: [{ employeeId: 'e-ld' }] }, record, assigneeRoles: ['leader'] }), '');
  assert.match(confirmBlockReason({ viewer: { role: 'leader', email: 'ld@aps.vn', employeeId: 'e-ld' }, item: { assignees: [{ employeeId: 'e-nv' }] }, record: { submittedBy: 'ld@aps.vn' }, assigneeRoles: ['employee'] }), /báo cáo/);
  assert.match(confirmBlockReason({ viewer: { role: 'employee' }, item, record }), /Chỉ Leader/);
});
