import { readDb } from '../models/db.js';
import { normalizePageAccess, pageAccessAllows, PAGE_ACCESS_ITEMS } from '../../../frontend/src/utils/pageAccess.js';

// Áp ma trận "Trang & mục" ở máy chủ: mỗi yêu cầu được đối chiếu với mục mà nó phục vụ.
// Đọc dữ liệu: cần thấy (X hoặc S) ít nhất một mục trong danh sách; ghi dữ liệu: cần S.
// Yêu cầu không gắn với mục nào (đăng nhập, danh sách nhân sự / task dùng chung…) chỉ theo quy tắc riêng của nó.
// Quyền đọc lại từ cơ sở dữ liệu ở mỗi yêu cầu nên đổi ma trận hay đổi vai trò là có hiệu lực ngay.

const GANTT_SECTIONS = PAGE_ACCESS_ITEMS.filter(entry => entry.page === 'gantt' && !entry.parent).map(entry => entry.key);
const PROGRESS = ['gantt.progress'];

const DELIVERY_ACTIONS = {
  task: PROGRESS, confirm: PROGRESS, reopenTask: PROGRESS, revokeConfirmation: PROGRESS, revokeEvidence: PROGRESS,
  comment: PROGRESS, timesheet: PROGRESS, approveTimesheet: PROGRESS, lockWeights: PROGRESS, applyTemplate: PROGRESS,
  document: ['gantt.legal'], documentComponent: ['gantt.legal'], documentEvent: ['gantt.legal'],
  customerRequest: ['gantt.customer'], meetingMinute: ['gantt.customer'], change: ['gantt.customer'], changeAppendix: ['gantt.customer'],
  closeMonth: ['gantt.close'], reopenMonth: ['gantt.close'], settings: ['gantt.close'],
  receipt: ['gantt.close', 'director-overview.kpis'], expense: ['gantt.close', 'director-overview.kpis'], milestone: ['gantt.close', 'director-overview.kpis'],
};

const OPERATIONS_ACTIONS = {
  saveWeek: ['timesheets.mine'], submitWeek: ['timesheets.mine'], copyWeek: ['timesheets.mine'],
  reviewHours: ['timesheets.review', 'timesheets.control'], unlockRequest: ['timesheets.review', 'timesheets.control'], unlockDecision: ['timesheets.review', 'timesheets.control'],
  check: ['timesheets.control'],
  otRequest: ['timesheets.ot'], otDecision: ['timesheets.ot'],
  attendanceImport: ['company.settings.imports'], companyImport: ['company.settings.imports'], accountingImport: ['company.settings.imports'],
  policyRead: ['company.policies.reads'],
  params: ['company.settings.params'],
  pageAccess: ['company.settings.matrix'],
  projectCreate: ['gantt.new-project'], projectDecision: ['gantt.new-project'], template: ['gantt.new-project'],
};

const read = keys => ({ keys, mode: 'read' });
const write = keys => ({ keys, mode: 'write' });

/** Mục (và mức quyền) mà một yêu cầu cần. null: yêu cầu không gắn với mục nào trong ma trận. */
export function requiredPageAccess(method, path, body = {}) {
  const verb = method.toUpperCase();
  const reading = verb === 'GET';
  if (path === '/delivery/page-access' || path === '/delivery/session') return null;
  // Ghi dữ liệu điều hành (kế hoạch tiền, công nợ…) theo quy tắc vai trò riêng của nó.
  if (path === '/delivery/executive') return reading ? read(['director-overview.kpis']) : null;
  if (path === '/delivery/reporting') return reading ? read(['gantt.close']) : write(['gantt.close']);
  if (path === '/delivery/project-preview') return write(['gantt.new-project']);
  if (path === '/delivery/operations') return reading ? null : OPERATIONS_ACTIONS[body?.action] ? write(OPERATIONS_ACTIONS[body.action]) : null;
  if (/^\/delivery\/(notifications|users|templates)$/.test(path)) return null;
  if (/^\/delivery\/[^/]+\/evidence\/[^/]+$/.test(path)) return read(GANTT_SECTIONS);
  if (/^\/delivery\/[^/]+\/evidence$/.test(path)) return write(['gantt.progress', 'gantt.legal']);
  if (/^\/delivery\/[^/]+$/.test(path)) return reading ? read([...GANTT_SECTIONS, 'director-overview.kpis']) : write(DELIVERY_ACTIONS[body?.action] || GANTT_SECTIONS);
  // Kế hoạch nhân lực = mục Quản Lý Nhân Sự → 6 tháng tới; sửa còn theo quy tắc QL lập / Giám đốc duyệt.
  if (path === '/workforce-plan') return reading ? read(['work-hub.workload.forecast']) : write(['work-hub.workload.forecast']);
  if (reading) return null;
  if (/^\/employees\/[^/]+\/(toggle-onsite|toggle-break|active-task)$/.test(path)) return write(['work-hub.hr', 'work-hub.my-work']);
  if (/^\/employees(\/[^/]+)?$/.test(path)) return write(['work-hub.hr']);
  if (/^\/tasks(\/[^/]+)?$/.test(path)) return write(['work-hub.tasks', 'work-hub.hr']);
  if (/^\/overtimes(\/[^/]+)?$/.test(path)) return write(['work-hub.tasks', 'work-hub.hr', 'timesheets.ot']);
  if (verb === 'POST' && path === '/projects') return write(['gantt.new-project', 'gantt.progress']);
  if (/^\/(projects|gantt)(\/[^/]+)?(\/move)?$/.test(path)) return write(['gantt.progress']);
  return null;
}

const label = key => PAGE_ACCESS_ITEMS.find(entry => entry.key === key)?.label || key;

/** Gọi sau khi đã xác thực người dùng (req.deliveryCompanyUser). */
export function enforcePageAccess(req, res, next, db = readDb()) {
  const role = req.deliveryCompanyUser?.role;
  if (!role || role === 'admin') return next();
  const rule = requiredPageAccess(req.method, req.path, req.body);
  if (!rule) return next();
  const access = normalizePageAccess(db.operations?.pageAccess);
  if (rule.keys.some(key => pageAccessAllows(access, key, role, rule.mode))) return next();
  const names = rule.keys.map(label).join(' / ');
  return res.status(403).json({
    message: rule.mode === 'write'
      ? `Vai trò của bạn chỉ được xem, không được thao tác ở mục ${names}.`
      : `Vai trò của bạn không được truy cập mục ${names}.`,
    pageAccess: { keys: rule.keys, mode: rule.mode },
  });
}

/** GET /delivery/page-access: vai trò hiện tại và ma trận đã chuẩn hóa để giao diện ẩn / hiện ngay. */
export function getPageAccess(req, res) {
  const db = readDb();
  return res.json({ success: true, data: { role: req.deliveryCompanyUser?.role || '', access: normalizePageAccess(db.operations?.pageAccess) } });
}
