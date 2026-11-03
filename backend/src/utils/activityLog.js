import { randomUUID } from 'node:crypto';
import { deliveryLabel } from '../../../frontend/src/utils/deliveryMetrics.js';

// Nhật ký "Lịch sử cập nhật dữ liệu" ghi ngay ở máy chủ cho các thay đổi quan trọng ở trang Dự án / Tiến độ
// và trang Công ty (giờ công, tài chính, phân quyền…): không phụ thuộc trình duyệt nào đang mở, và ghi rõ
// tên dự án / công việc thay vì mã. Mỗi bản ghi mang sẵn `label` + `category` để trang Nhật ký hiển thị.

export const ACTIVITY_LIMIT = 1000;

/** Thao tác ở trang Dự án (PATCH /delivery/:projectId) → [nhãn, nhóm]. Bình luận / ghi giờ nháp không tính là thay đổi quan trọng. */
const DELIVERY_ACTIVITY = {
  task: ['Cập nhật trạng thái công việc', 'delivery'],
  confirm: ['Xác nhận hoàn thành', 'delivery'],
  reopenTask: ['Mở lại công việc', 'delivery'],
  revokeConfirmation: ['Thu hồi xác nhận', 'delivery'],
  revokeEvidence: ['Thu hồi bằng chứng', 'delivery'],
  applyTemplate: ['Áp dụng mẫu tiến độ', 'delivery'],
  lockWeights: ['Khóa tỷ trọng', 'delivery'],
  approveTimesheet: ['Duyệt giờ công', 'hours'],
  document: ['Cập nhật hồ sơ pháp lý', 'delivery'],
  documentEvent: ['Cập nhật hồ sơ pháp lý', 'delivery'],
  documentComponent: ['Cập nhật hồ sơ pháp lý', 'delivery'],
  customerRequest: ['Yêu cầu khách hàng', 'delivery'],
  meetingMinute: ['Biên bản họp', 'delivery'],
  change: ['Thay đổi phạm vi', 'delivery'],
  changeAppendix: ['Phụ lục thay đổi', 'finance'],
  settings: ['Cài đặt hợp đồng dự án', 'finance'],
  receipt: ['Ghi nhận thu tiền', 'finance'],
  expense: ['Chi phí dự án', 'finance'],
  milestone: ['Mốc thanh toán', 'finance'],
  closeMonth: ['Chốt tháng', 'finance'],
  reopenMonth: ['Mở lại kỳ chốt', 'finance'],
};

/** Thao tác ở trang Công ty / Giờ công (PATCH /delivery/operations). Lưu nháp tuần, đánh dấu đã đọc… không ghi. */
const OPERATIONS_ACTIVITY = {
  submitWeek: ['Nộp bảng giờ tuần', 'hours'],
  reviewHours: ['Duyệt giờ công', 'hours'],
  unlockRequest: ['Xin mở khóa giờ công', 'hours'],
  unlockDecision: ['Duyệt mở khóa giờ công', 'hours'],
  check: ['Kiểm tra giờ công', 'hours'],
  otRequest: ['Đăng ký tăng ca', 'overtime'],
  otDecision: ['Duyệt tăng ca', 'overtime'],
  attendanceImport: ['Nhập dữ liệu chấm công', 'system'],
  companyImport: ['Nhập dữ liệu công ty', 'system'],
  accountingImport: ['Nhập dữ liệu kế toán', 'finance'],
  params: ['Đổi tham số hệ thống', 'system'],
  pageAccess: ['Sửa ma trận phân quyền', 'system'],
  member: ['Phân vai trò theo dự án', 'system'],
  procedures: ['Cập nhật danh mục thủ tục', 'system'],
  projectCreate: ['Tạo dự án mới', 'project'],
  projectDecision: ['Duyệt dự án mới', 'project'],
  template: ['Cập nhật mẫu dự án', 'project'],
  recruitmentCancel: ['Hủy đợt tuyển dụng', 'employee'],
  budget: ['Lập ngân sách dự án', 'finance'],
  budgetDecision: ['Duyệt ngân sách', 'finance'],
  paymentRequest: ['Đề nghị thanh toán', 'finance'],
  paymentDecision: ['Duyệt thanh toán', 'finance'],
  expenseRequest: ['Đề nghị chi phí', 'finance'],
  expenseDecision: ['Duyệt chi phí', 'finance'],
  settlement: ['Quyết toán', 'finance'],
  milestone: ['Mốc thanh toán', 'finance'],
  cashForecast: ['Lập dự báo dòng tiền', 'finance'],
  cashDecision: ['Duyệt dự báo dòng tiền', 'finance'],
};

const DECISIONS = { approved: 'Đồng ý', rejected: 'Từ chối', returned: 'Trả lại' };
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Thêm một sự kiện vào nhật ký dùng chung (mới nhất trước, giữ tối đa ACTIVITY_LIMIT). Gọi trước writeDb. */
export function appendActivity(db, entry) {
  db.activityLog = Array.isArray(db.activityLog) ? db.activityLog : [];
  const event = {
    id: randomUUID(),
    timestamp: entry.timestamp || new Date().toISOString(),
    email: clip(entry.email, 180),
    name: clip(entry.name || entry.email, 180),
    role: entry.role === 'admin' ? 'admin' : 'user',
    action: clip(entry.action, 100),
    details: clip(entry.details, 300),
    ...(entry.label ? { label: clip(entry.label, 80) } : {}),
    ...(entry.category ? { category: clip(entry.category, 40) } : {}),
  };
  db.activityLog.unshift(event);
  db.activityLog = db.activityLog.slice(0, ACTIVITY_LIMIT);
  return event;
}

const projectName = (db, projectId) => (db.projects || []).find(project => project.id === projectId)?.name || '';
const actorFields = actor => ({ email: actor?.email, name: actor?.name || actor?.email, role: actor?.role });
const decisionText = value => [DECISIONS[value?.status], value?.reason && `Lý do: ${value.reason}`].filter(Boolean).join(' · ');

/** Ghi thay đổi ở trang Dự án; `before` là bản ghi task trước khi sửa (để nêu mức % cũ → mới). */
export function logDeliveryActivity(db, actor, projectId, body = {}, data = {}, before = null) {
  const config = DELIVERY_ACTIVITY[body.action];
  if (!config) return null;
  const item = body.taskId && (db.ganttItems || []).find(row => row.id === body.taskId);
  const parts = [projectName(db, projectId) && `Dự án ${projectName(db, projectId)}`, item?.title && `Việc "${item.title}"`];
  if (body.action === 'task') {
    const after = data.records?.[body.taskId];
    if (after && (before?.level ?? 0) !== after.level) parts.push(`${before?.level ?? 0}% → ${after.level}% (${deliveryLabel(after)})`);
    else parts.push('sửa thông tin hồ sơ / ghi chú');
  }
  const decision = decisionText(body.value);
  if (decision) parts.push(decision);
  return appendActivity(db, { ...actorFields(actor), action: `delivery.${body.action}`, label: config[0], category: config[1], details: parts.filter(Boolean).join(' · ') });
}

/** Ghi thay đổi ở trang Công ty / Giờ công. */
export function logOperationsActivity(db, actor, body = {}) {
  const config = OPERATIONS_ACTIVITY[body.action];
  if (!config) return null;
  const value = body.value || {};
  const name = projectName(db, body.projectId) || (body.action === 'projectCreate' ? value.name : '');
  const parts = [name && `Dự án ${name}`, body.action === 'params' && 'Cập nhật tham số ở Công ty → Cài đặt', body.action === 'pageAccess' && 'Đổi quyền xem trang / mục theo vai trò', body.action === 'member' && value.email && `${value.email} → ${value.role || ''}`, decisionText(value)];
  return appendActivity(db, { ...actorFields(actor), action: `operations.${body.action}`, label: config[0], category: config[1], details: parts.filter(Boolean).join(' · ') || config[0] });
}
