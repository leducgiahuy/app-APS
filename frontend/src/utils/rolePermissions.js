import { DEFAULT_MATRIX, companyAdmin, matrixAllows } from './operationsDefaults.js';

/**
 * Quyền theo cấp bậc, đọc trực tiếp từ ma trận phân quyền (Công ty → Ma trận quyền).
 * Dùng chung cho backend (chặn API) và frontend (ẩn/hiện nút), nên sửa ma trận là đổi quyền ở cả hai nơi.
 *
 * Ký hiệu ô: X xem · L lập · S sửa · XN xác nhận · D duyệt · "(của mình)" chỉ dữ liệu của bản thân · — không truy cập.
 */

/** Cấp bậc tài khoản (trang Tài khoản) trùng mã vai trò trong ma trận. */
export const LEVEL_ROLES = ['employee', 'leader', 'manager', 'director'];
export const roleFromLevel = level => LEVEL_ROLES.includes(level) ? level : 'employee';

function cell(matrix, key, role) {
  return (matrix?.length ? matrix : DEFAULT_MATRIX).find(row => row.key === key)?.values?.[role] || '—';
}

/** Ô chỉ cho phép dữ liệu của bản thân, ví dụ "L (của mình)". */
export function ownOnly(matrix, key, role) {
  return role !== 'admin' && /của mình/i.test(cell(matrix, key, role));
}

/** Có quyền duyệt (D) hoặc xác nhận (XN); "Đề xuất" hay "Kiểm tra" không tính là duyệt. */
export function canApprove(matrix, key, role) {
  if (role === 'admin') return true;
  return String(cell(matrix, key, role)).split(/[/\s()]+/).some(token => token === 'D' || token === 'XN');
}

/** Toàn bộ cờ quyền của một vai trò; vai trò rỗng/lạ được coi như Nhân viên (mức thấp nhất). */
export function permissionsFor(role, matrix) {
  const r = role === 'admin' || LEVEL_ROLES.includes(role) || ['accountant', 'chiefAccountant'].includes(role) ? role : 'employee';
  const read = key => matrixAllows(matrix, key, r, 'read');
  const write = key => matrixAllows(matrix, key, r, 'write');
  return {
    role: r,
    // A. Dự án
    viewMoney: read('hdValue'),
    createProject: write('newProject'),
    editProjectInfo: write('projectInfo'),
    deleteProject: companyAdmin(r),
    // B. Tiến độ & công việc
    editSchedule: write('progress'),
    viewAllTasks: read('assign') && !ownOnly(matrix, 'assign', r),
    assignTasks: write('assign') && !ownOnly(matrix, 'assign', r),
    updateProgress: write('editStatus'),
    updateOwnProgressOnly: ownOnly(matrix, 'editStatus', r),
    confirmWork: canApprove(matrix, 'confirmStatus', r),
    // C. Giờ công
    registerOvertime: write('otRegister'),
    registerOwnOvertimeOnly: !canApprove(matrix, 'otRegister', r) && !/Đề xuất/.test(cell(matrix, 'otRegister', r)),
    approveOvertime: canApprove(matrix, 'otRegister', r),
    viewAllHours: read('hours') && !ownOnly(matrix, 'hours', r),
    superviseAttendance: read('attendance'),
    // D. Nhân lực / ngân sách giờ công
    viewWorkforce: read('budgetLabor'),
    editWorkforce: write('budgetLabor'),
    // I. Báo cáo toàn công ty (trang Tổng quan)
    viewExecutive: read('reports'),
    // K. Quản trị: tài khoản & hồ sơ nhân sự do Quản trị / Giám đốc quản lý
    manageMembers: companyAdmin(r),
  };
}
