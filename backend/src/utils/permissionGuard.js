import { readDb } from '../models/db.js';
import { projectActor } from './operationsStore.js';
import { permissionsFor } from '../../../frontend/src/utils/rolePermissions.js';

/**
 * Chặn API cũ (nhân sự, task, Gantt, dự án, tăng ca) theo ma trận phân quyền.
 * Vai trò được tính trên dự án của dữ liệu đang thao tác (Vai trò theo dự án), nếu không có thì theo tài khoản.
 */

export function deny(res, message) {
  return res.status(403).json({ success: false, message });
}

/** Người thao tác + cờ quyền trên dự án; null khi tài khoản không có vai trò trên dự án đó. */
export function accessFor(req, projectId, db = readDb()) {
  const companyUser = req.deliveryCompanyUser || req.deliveryUser;
  if (!companyUser) return null;
  const actor = projectId ? projectActor(db, companyUser, projectId) : req.deliveryUser;
  if (!actor) return null;
  return { actor, perms: permissionsFor(actor.role, db.operations?.matrix) };
}

/** Middleware cho thao tác không gắn dự án cụ thể. */
export function requirePermission(flag, message) {
  return (req, res, next) => accessFor(req)?.perms[flag] ? next() : deny(res, message);
}

/** Task/Gantt có được giao cho nhân sự gắn với tài khoản này không. */
export function assignedToActor(item, actor) {
  const employeeId = actor?.employeeId;
  if (!employeeId || !item) return false;
  if (Array.isArray(item.assignees) && item.assignees.some(row => row?.employeeId === employeeId)) return true;
  return item.employeeId === employeeId;
}

/** Hồ sơ nhân sự là của chính người đang đăng nhập. */
export function isOwnEmployee(req, employeeId) {
  const own = (req.deliveryCompanyUser || req.deliveryUser)?.employeeId;
  return Boolean(own) && own === employeeId;
}
