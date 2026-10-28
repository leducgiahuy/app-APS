/**
 * Danh mục dùng cho hồ sơ tài khoản: cấp bậc, phòng ban, chuyên môn.
 *
 * - `role` (admin/user) trong authSession là QUYỀN HỆ THỐNG: ai được vào trang quản trị.
 * - `level` ở đây là CẤP BẬC TỔ CHỨC: nhân viên → leader → quản lý → giám đốc.
 *   Mã cấp bậc trùng với mã vai trò trong `DELIVERY_ROLES` (utils/deliveryMetrics.js)
 *   để sau này có thể dùng trực tiếp khi phân quyền xem dữ liệu dự án/tài chính.
 */

/** Cấp bậc theo thứ tự từ thấp đến cao; `rank` dùng để so sánh cấp (số lớn hơn = cấp cao hơn). */
export const ACCOUNT_LEVELS = [
  { value: 'employee', label: 'Nhân viên', rank: 1 },
  { value: 'leader', label: 'Leader', rank: 2 },
  { value: 'manager', label: 'Quản lý', rank: 3 },
  { value: 'director', label: 'Giám đốc', rank: 4 },
];

/** Cấp bậc gán cho tài khoản cũ chưa có thông tin cấp bậc. */
export const DEFAULT_LEVEL = 'employee';

/** Phòng ban gợi ý, khớp với trường `team` của nhân sự trong module HR. Admin vẫn có thể nhập phòng ban khác. */
export const DEPARTMENTS = [
  'Ban Giám Đốc',
  'Ban Chỉ Huy',
  'Tư Vấn Thiết Kế',
  'Kỹ Thuật Hiện Trường',
  'Cơ Điện & PCCC',
  'Khảo Sát Địa Chất',
  'Đấu Thầu & Hợp Đồng',
  'Ban Pháp Lý',
  'Kế Toán & HCNS',
];

/** Chuyên môn gợi ý theo bộ môn đang dùng trong báo cáo công ty. Admin vẫn có thể nhập chuyên môn khác. */
export const SPECIALTIES = [
  'Kiến trúc',
  'Kết cấu',
  'MEP · Điện nước',
  'PCCC',
  'Pháp lý',
  'QS · Dự toán',
  'Giám sát thi công',
  'Khảo sát địa chất',
  'Quản lý dự án',
  'Kế toán',
  'Hành chính nhân sự',
];

/** Chuẩn hóa mã cấp bậc; giá trị lạ hoặc rỗng quay về cấp mặc định. */
export function normalizeLevel(level) {
  return ACCOUNT_LEVELS.some((item) => item.value === level) ? level : DEFAULT_LEVEL;
}

/** Trả nhãn tiếng Việt của cấp bậc để hiển thị. */
export function getLevelLabel(level) {
  return ACCOUNT_LEVELS.find((item) => item.value === normalizeLevel(level)).label;
}
