import { OP_ROLES, ROLE_RULES, companyAdmin, roleAllows } from './operationsDefaults.js';
import { pageAccessAllows } from './pageAccess.js';

/**
 * Quy tắc nghiệp vụ cố định theo vai trò (ROLE_RULES): ai lập, ai duyệt, ai xác nhận, chỉ dữ liệu của mình…
 * Dùng chung cho backend (chặn API) và frontend (ẩn/hiện nút). Ẩn / hiện trang và mục do ma trận "Trang & mục" quyết định.
 *
 * Ký hiệu ô: X xem · L lập · S sửa · XN xác nhận · D duyệt · "(của mình)" chỉ dữ liệu của bản thân · — không truy cập.
 */

/** Cấp bậc tài khoản (trang Tài khoản) trùng mã vai trò trong ma trận: đủ 6 cột, gồm Kế toán viên / Kế toán trưởng. */
export const LEVEL_ROLES = OP_ROLES;
export const roleFromLevel = level => LEVEL_ROLES.includes(level) ? level : 'employee';

/**
 * Quy tắc nào do ô nào của ma trận "Trang & mục" quyết định. Có ma trận thì ô ma trận là nơi quyết định duy nhất:
 * S = được thao tác, X = chỉ xem, — = ẩn (sửa ma trận là có hiệu lực ngay cho mọi vai trò, kể cả Giám đốc).
 * Phần quy trình ma trận không thể hiện vẫn giữ ở chỗ khác: không tự duyệt / tự xác nhận việc của mình,
 * nhân viên chỉ sửa việc của mình, Leader duyệt giờ nhóm mình, ai duyệt làm thêm giờ, các bước duyệt chi tiền.
 */
export const RULE_PAGE_ITEMS = {
  progress: 'gantt.progress.table',
  projectInfo: 'gantt.new-project',
  scope: 'gantt.progress.table',
  confirmStatus: 'gantt.progress.table',
  assign: 'gantt.progress.assignment',
  editStatus: 'gantt.progress',
  newProject: 'gantt.new-project',
  milestones: 'gantt.close',
  payment: 'gantt.close',
  tsSubmit: 'timesheets.mine',
  tsApproveStaff: 'timesheets.review',
  tsApproveLeader: 'timesheets.review',
  tsApproveManager: 'timesheets.review',
  unlock: 'timesheets.review',
  otRegister: 'timesheets.ot',
};

/** Quy tắc vai trò có cho phép không: theo ma trận nếu quy tắc gắn với một mục và đã có ma trận, ngược lại theo quy tắc cố định. */
export function ruleAllows(key, role, pageAccess = null, mode = 'write') {
  if (role === 'admin') return true;
  const item = RULE_PAGE_ITEMS[key];
  if (item && pageAccess) return pageAccessAllows(pageAccess, item, role, mode);
  return roleAllows(key, role, mode);
}

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
  const write = key => ruleAllows(key, r, pageAccess, 'write');
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
    confirmWork: pageAccess ? ruleAllows('confirmStatus', r, pageAccess) : canApprove('confirmStatus', r),
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
