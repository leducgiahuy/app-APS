import { ROLE_RULES, companyAdmin, roleAllows } from './operationsDefaults.js';
import { pageAccessAllows } from './pageAccess.js';

/**
 * Quy tắc nghiệp vụ cố định theo vai trò (ROLE_RULES): ai lập, ai duyệt, ai xác nhận, chỉ dữ liệu của mình…
 * Dùng chung cho backend (chặn API) và frontend (ẩn/hiện nút). Ẩn / hiện trang và mục do ma trận "Trang & mục" quyết định.
 *
 * Ký hiệu ô: X xem · L lập · S sửa · XN xác nhận · D duyệt · "(của mình)" chỉ dữ liệu của bản thân · — không truy cập.
 */

/** Cấp bậc tài khoản (trang Tài khoản) trùng mã vai trò trong ma trận. */
export const LEVEL_ROLES = ['employee', 'leader', 'manager', 'director'];
export const roleFromLevel = level => LEVEL_ROLES.includes(level) ? level : 'employee';

function cell(key, role) {
  return ROLE_RULES.find(row => row.key === key)?.values?.[role] || '—';
}

/** Ô chỉ cho phép dữ liệu của bản thân, ví dụ "L (của mình)". */
export function ownOnly(key, role) {
  return role !== 'admin' && /của mình/i.test(cell(key, role));
}

/** Có quyền duyệt (D) hoặc xác nhận (XN); "Đề xuất" hay "Kiểm tra" không tính là duyệt. */
export function canApprove(key, role) {
  if (role === 'admin') return true;
  return String(cell(key, role)).split(/[/\s()]+/).some(token => token === 'D' || token === 'XN');
}

/**
 * Toàn bộ cờ quyền của một vai trò; vai trò rỗng/lạ được coi như Nhân viên (mức thấp nhất).
 * pageAccess (ma trận Trang & mục) quyết định: sửa lịch = S ở "Bảng tiến độ & công", phân công = S ở
 * "Phân công (máy gán)", xem mọi task = thấy mục "Tiến độ". Chưa có ma trận thì theo quy tắc cố định.
 */
export function permissionsFor(role, pageAccess = null) {
  const r = role === 'admin' || LEVEL_ROLES.includes(role) || ['accountant', 'chiefAccountant'].includes(role) ? role : 'employee';
  const read = key => roleAllows( key, r, 'read');
  const write = key => roleAllows( key, r, 'write');
  return {
    role: r,
    // A. Dự án
    viewMoney: read('hdValue'),
    createProject: write('newProject'),
    editProjectInfo: write('projectInfo'),
    deleteProject: companyAdmin(r),
    // B. Tiến độ & công việc
    editSchedule: pageAccess ? pageAccessAllows(pageAccess, 'gantt.progress.table', r, 'write') : write('progress'),
    viewAllTasks: pageAccess ? pageAccessAllows(pageAccess, 'work-hub.tasks', r) : read('assign') && !ownOnly('assign', r),
    assignTasks: pageAccess ? pageAccessAllows(pageAccess, 'gantt.progress.assignment', r, 'write') : write('assign') && !ownOnly('assign', r),
    updateProgress: write('editStatus'),
    updateOwnProgressOnly: ownOnly('editStatus', r),
    confirmWork: canApprove('confirmStatus', r),
    // C. Giờ công
    registerOvertime: write('otRegister'),
    registerOwnOvertimeOnly: !canApprove('otRegister', r) && !/Đề xuất/.test(cell('otRegister', r)),
    approveOvertime: canApprove('otRegister', r),
    viewAllHours: read('hours') && !ownOnly('hours', r),
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
