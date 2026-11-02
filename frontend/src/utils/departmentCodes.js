/**
 * Mã bộ môn dùng chung cho Mẫu báo giá, tự gán khi tạo dự án và trang Máy gán:
 * KT kiến trúc · KC kết cấu · MEP · HT hạ tầng · PCCC · CĐT chủ đầu tư · PL pháp lý.
 * Dùng chung ở frontend và backend (backend import trực tiếp file này).
 */
export const DEPARTMENT_CODES = ['KT', 'KC', 'MEP', 'HT', 'PCCC', 'CĐT', 'PL'];

/** Bộ môn không có nhân sự nội bộ (việc của chủ đầu tư): không tự gán người. */
export const EXTERNAL_DEPARTMENTS = ['CĐT'];

const plain = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Đổi 1 chữ sang mã bộ môn: chấp nhận mã (KT, CDT...) hoặc tên (Kiến trúc, Hạ tầng...). Không nhận ra thì trả ''. */
export function departmentCodeOf(value) {
  const text = plain(value).trim();
  if (!text) return '';
  const code = DEPARTMENT_CODES.find(item => plain(item) === text);
  if (code) return code;
  if (/kien truc|^kts$/.test(text)) return 'KT';
  if (/ket cau/.test(text)) return 'KC';
  if (/ha tang/.test(text)) return 'HT';
  if (/chu dau tu/.test(text)) return 'CĐT';
  return '';
}

/**
 * Bộ môn của một việc, đọc từ requiredPosition: "KC, HT" → ['KC', 'HT'].
 * Chỉ nhận khi mọi phần đều là bộ môn; vị trí kiểu cũ ("Kiến trúc sư", "Thiết Kế") trả [] để dùng cách khớp vị trí cũ.
 */
export function taskDepartments(item) {
  const parts = String(item?.requiredPosition || item?.position || '').split(/[,;/+]/).map(part => part.trim()).filter(Boolean);
  const codes = parts.map(departmentCodeOf);
  return parts.length && codes.every(Boolean) ? [...new Set(codes)] : [];
}

/**
 * Bộ môn của một nhân sự, suy ra từ nhóm, chức danh và hậu tố tên (VD "LONG _ KC", "Chị YẾN _ HT").
 * Một người có thể thuộc nhiều bộ môn (VD "Cơ Điện M&E & PCCC" → MEP, PCCC).
 */
export function employeeDepartments(employee) {
  const text = plain(`${employee?.team || ''} ${employee?.title || ''}`);
  const codes = [];
  const suffix = plain(employee?.name).match(/[_\s-](kts|kt|kc|mep|ht|pccc)\s*$/)?.[1];
  if (suffix) codes.push(suffix === 'kts' ? 'KT' : suffix.toUpperCase());
  if (/kien truc|\bkts\b/.test(text)) codes.push('KT');
  if (/ket cau|khao sat|dia chat/.test(text)) codes.push('KC');
  if (/\bmep\b|co dien|dien nuoc|m&e/.test(text)) codes.push('MEP');
  if (/ha tang/.test(text)) codes.push('HT');
  if (/pccc/.test(text)) codes.push('PCCC');
  if (/phap/.test(text)) codes.push('PL');
  return [...new Set(codes)];
}

/** Bộ môn chính của nhân sự để hiển thị (hậu tố tên được ưu tiên); không xác định thì ''. */
export const employeeDepartment = employee => employeeDepartments(employee)[0] || '';
