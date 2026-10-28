import { readDb } from '../models/db.js';
import { accessFor, assignedToActor, deny, isOwnEmployee } from './permissionGuard.js';

/**
 * Middleware chặn từng route cũ theo ma trận phân quyền (xem utils/rolePermissions.js).
 * Mọi lời từ chối trả 403 kèm lý do để giao diện hiện toast.
 */

const NO_PROJECT_ROLE = 'Bạn không có vai trò trên dự án này.';
const has = (body, keys) => keys.some(key => Object.hasOwn(body || {}, key));

// === DỰ ÁN ===
export function guardCreateProject(req, res, next) {
  return accessFor(req)?.perms.createProject ? next() : deny(res, 'Chỉ QL cấp trung lập và Giám đốc duyệt dự án mới.');
}
export function guardUpdateProject(req, res, next) {
  const access = accessFor(req, req.params.id);
  if (!access) return deny(res, NO_PROJECT_ROLE);
  return access.perms.editProjectInfo ? next() : deny(res, 'Chỉ QL cấp trung và Giám đốc được sửa thông tin dự án.');
}
export function guardDeleteProject(req, res, next) {
  return accessFor(req)?.perms.deleteProject ? next() : deny(res, 'Chỉ Giám đốc hoặc Quản trị được xóa dự án.');
}

// === GANTT: cấu trúc tiến độ (progress) và phân công (assign) ===
const ASSIGNMENT_KEYS = ['assignees', 'assignee', 'employeeId', 'employeeName'];
function ganttAccess(req, res, next, projectId, body) {
  const access = accessFor(req, projectId);
  if (!access) return deny(res, NO_PROJECT_ROLE);
  const touchesAssignment = has(body, ASSIGNMENT_KEYS);
  const touchesSchedule = Object.keys(body || {}).some(key => !ASSIGNMENT_KEYS.includes(key));
  if (touchesAssignment && !access.perms.assignTasks) return deny(res, 'Chỉ Leader được phân công task cho nhân viên.');
  if (touchesSchedule && !access.perms.editSchedule) return deny(res, 'Bạn chỉ được xem tiến độ; Leader lập/sửa, QL cấp trung duyệt.');
  return next();
}
export function guardCreateGantt(req, res, next) {
  return ganttAccess(req, res, next, req.body?.projectId, { ...req.body, title: true });
}
export function guardUpdateGantt(req, res, next) {
  const item = (readDb().ganttItems || []).find(row => row.id === req.params.id);
  if (!item) return next();
  return ganttAccess(req, res, next, item.projectId, req.body);
}
export function guardScheduleGantt(req, res, next) {
  const item = (readDb().ganttItems || []).find(row => row.id === req.params.id);
  if (!item) return next();
  return ganttAccess(req, res, next, item.projectId, { schedule: true });
}

// === TASK ===
const PLAN_KEYS = ['startDate', 'endDate', 'estimatedDays', 'estimatedHours', 'estimatedHoursPerDay'];
export function guardCreateTask(req, res, next) {
  const access = accessFor(req, req.body?.projectId);
  if (!access) return deny(res, NO_PROJECT_ROLE);
  return access.perms.assignTasks ? next() : deny(res, 'Chỉ Leader được tạo và phân công task.');
}
export function guardDeleteTask(req, res, next) {
  const task = (readDb().tasks || []).find(row => row.id === req.params.id);
  if (!task) return next();
  const access = accessFor(req, task.projectId);
  if (!access) return deny(res, NO_PROJECT_ROLE);
  return access.perms.assignTasks ? next() : deny(res, 'Chỉ Leader được xóa task đã phân công.');
}
export function guardUpdateTask(req, res, next) {
  const task = (readDb().tasks || []).find(row => row.id === req.params.id);
  if (!task) return next();
  const access = accessFor(req, task.projectId);
  if (!access) return deny(res, NO_PROJECT_ROLE);
  const { perms, actor } = access;
  const body = req.body || {};
  const own = assignedToActor(task, actor);
  const wasCompleted = task.status === 'completed';
  const completing = !wasCompleted && (body.status === 'completed' || Number(body.progress) === 100);
  const reopening = wasCompleted && body.status !== undefined && body.status !== 'completed';
  if (completing || reopening) {
    if (!perms.confirmWork) return deny(res, 'Chỉ Leader, QL cấp trung hoặc Giám đốc được xác nhận / mở lại task.');
    if (own) return deny(res, 'Không tự xác nhận việc của mình; hãy nhờ cấp trên xác nhận.');
  }
  if (has(body, PLAN_KEYS) && !perms.assignTasks) return deny(res, 'Chỉ Leader được đổi kế hoạch (ngày, giờ dự kiến) của task.');
  if (has(body, ['status', 'progress', 'actualWorkloadNotes', 'speedStatus', 'notes']) && !(completing || reopening)) {
    if (!perms.updateProgress) return deny(res, 'Vai trò của bạn chỉ được xem % hoàn thành task.');
    if (perms.updateOwnProgressOnly && !own) return deny(res, 'Bạn chỉ được cập nhật task được giao cho mình.');
  }
  return next();
}

/** Nhân viên chỉ thấy task và phiếu tăng ca của chính mình. */
export function scopeTaskList(req, res, next) {
  const access = accessFor(req);
  if (!access || access.perms.viewAllTasks) return next();
  const json = res.json.bind(res);
  res.json = payload => {
    if (payload?.data?.tasks) {
      const employeeId = access.actor.employeeId;
      payload.data.tasks = payload.data.tasks.filter(task => assignedToActor(task, access.actor));
      payload.data.overtimes = (payload.data.overtimes || []).filter(row => employeeId && row.employeeId === employeeId);
    }
    return json(payload);
  };
  return next();
}

// === TĂNG CA ===
export function guardCreateOvertime(req, res, next) {
  const access = accessFor(req);
  if (!access?.perms.registerOvertime) return deny(res, 'Vai trò của bạn không đăng ký làm thêm giờ.');
  if (access.perms.registerOwnOvertimeOnly && !isOwnEmployee(req, req.body?.employeeId)) {
    return deny(res, 'Bạn chỉ được đăng ký làm thêm giờ cho chính mình.');
  }
  return next();
}
export function guardReviewOvertime(req, res, next) {
  const overtime = (readDb().overtimes || []).find(row => row.id === req.params.id);
  if (!overtime) return next();
  if (!accessFor(req)?.perms.approveOvertime) return deny(res, 'Chỉ QL cấp trung hoặc Giám đốc được duyệt làm thêm giờ.');
  if (isOwnEmployee(req, overtime.employeeId)) return deny(res, 'Không tự duyệt phiếu làm thêm giờ của mình.');
  return next();
}
export function guardDeleteOvertime(req, res, next) {
  const overtime = (readDb().overtimes || []).find(row => row.id === req.params.id);
  if (!overtime) return next();
  if (accessFor(req)?.perms.approveOvertime) return next();
  if (overtime.status === 'pending' && isOwnEmployee(req, overtime.employeeId)) return next();
  return deny(res, 'Chỉ được hủy phiếu của mình khi còn chờ duyệt.');
}

// === NHÂN SỰ ===
export function guardManageMembers(req, res, next) {
  return accessFor(req)?.perms.manageMembers ? next() : deny(res, 'Hồ sơ nhân sự được quản lý từ trang Tài khoản (Quản trị / Giám đốc).');
}
export function guardEditEmployee(req, res, next) {
  if (isOwnEmployee(req, req.params.id) || accessFor(req)?.perms.manageMembers) return next();
  return deny(res, 'Bạn chỉ được sửa hồ sơ của chính mình.');
}
export function guardAttendance(req, res, next) {
  if (isOwnEmployee(req, req.params.id) || accessFor(req)?.perms.superviseAttendance) return next();
  return deny(res, 'Bạn chỉ được vào/ra ca và chọn task cho chính mình.');
}

// === KẾ HOẠCH NHÂN LỰC ===
export function guardViewWorkforce(req, res, next) {
  return accessFor(req)?.perms.viewWorkforce ? next() : deny(res, 'Vai trò của bạn không xem kế hoạch nhân lực.');
}
export function guardEditWorkforce(req, res, next) {
  return accessFor(req)?.perms.editWorkforce ? next() : deny(res, 'Chỉ QL cấp trung lập và Giám đốc duyệt kế hoạch nhân lực.');
}
