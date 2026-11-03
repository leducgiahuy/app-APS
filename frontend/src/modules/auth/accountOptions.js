import { OP_ROLES, OP_ROLE_NAMES } from '../../utils/operationsDefaults.js';

/**
 * Cấp bậc dùng cho hồ sơ tài khoản.
 *
 * - `role` (admin/user) trong authSession là QUYỀN HỆ THỐNG: ai được vào trang quản trị.
 * - `level` ở đây là CẤP BẬC TỔ CHỨC, đúng bằng các cột vai trò của ma trận "Trang & mục"
 *   (OP_ROLES): tài khoản thấy trang / mục nào là do cột cấp bậc của nó trong ma trận quyết định.
 *
 * Phòng ban / chuyên môn không còn danh sách cố định: danh mục lưu ở máy chủ, tự thêm khi admin nhập giá trị mới.
 */

/** Cấp bậc theo thứ tự cột của ma trận phân quyền; nhãn trùng tiêu đề cột. */
export const ACCOUNT_LEVELS = OP_ROLES.map((value) => ({ value, label: value === 'accountant' ? 'Kế toán viên' : OP_ROLE_NAMES[value] }));

/** Cấp bậc gán cho tài khoản cũ chưa có thông tin cấp bậc. */
export const DEFAULT_LEVEL = 'employee';

/** Chuẩn hóa mã cấp bậc; giá trị lạ hoặc rỗng quay về cấp mặc định. */
export function normalizeLevel(level) {
  return ACCOUNT_LEVELS.some((item) => item.value === level) ? level : DEFAULT_LEVEL;
}

/** Trả nhãn tiếng Việt của cấp bậc để hiển thị. */
export function getLevelLabel(level) {
  return ACCOUNT_LEVELS.find((item) => item.value === normalizeLevel(level)).label;
}
