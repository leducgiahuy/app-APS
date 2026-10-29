import { OP_ROLES } from './operationsDefaults.js';

// Ma trận "Trang & mục": vai trò nào thấy trang / mục / mục con nào trên web.
// X: được xem · S: được xem và thao tác · —: ẩn. Admin luôn thấy tất cả.
// Thứ tự giá trị theo OP_ROLES: Nhân viên, Leader, QL cấp trung, Kế toán viên, Kế toán trưởng, Giám đốc.
// Giá trị mặc định khớp với những gì từng vai trò đang thấy trên web.
export const PAGE_ACCESS_CODES = [
  { code: 'X', label: 'Xem' },
  { code: 'S', label: 'Xem & thao tác' },
  { code: '—', label: 'Ẩn' },
];

const item = (key, label, values, children = []) => ({ key, label, defaults: values, children });
const ALL_S = ['S', 'S', 'S', 'S', 'S', 'S'];
const VIEW_ALL = ['X', 'X', 'X', 'X', 'X', 'S'];
// Nhân viên cập nhật trạng thái / bằng chứng / giờ của task mình nên cần S; quy tắc chi tiết (chỉ việc của mình…) vẫn do máy chủ kiểm tra.
const PROJECT_TEAM = ['S', 'S', 'S', 'X', 'X', 'S'];
const MONEY = ['—', '—', 'S', 'S', 'S', 'S'];

export const PAGE_ACCESS_TREE = [
  { key: 'work-hub', label: 'Công việc', children: [
    item('work-hub.my-work', 'Việc của tôi', ALL_S),
    item('work-hub.hr', 'Thành Viên', ALL_S),
    item('work-hub.tasks', 'Tiến độ', ALL_S),
    item('work-hub.workload', 'Quản Lý Nhân Sự', ['X', 'X', 'S', 'X', 'X', 'S'], [
      item('work-hub.workload.day', 'Ngày', VIEW_ALL),
      item('work-hub.workload.month', 'Tháng', VIEW_ALL),
      item('work-hub.workload.year', 'Năm', VIEW_ALL),
      item('work-hub.workload.forecast', '6 tháng tới', ['—', '—', '—', '—', '—', 'S']),
    ]),
  ] },
  { key: 'director-overview', label: 'Tổng quan', children: [
    item('director-overview.kpis', '10 số chính', ['—', '—', '—', '—', '—', 'S']),
  ] },
  { key: 'gantt', label: 'Dự án', children: [
    item('gantt.progress', 'Tiến độ & Công', PROJECT_TEAM, [
      // S ở đây = sửa lịch dự án (thêm / dời / xóa task). Nhân viên chỉ xem; trạng thái task của mình cập nhật nhờ S ở mục cha.
      item('gantt.progress.table', 'Bảng tiến độ & công', ['X', 'S', 'S', 'X', 'X', 'S']),
      item('gantt.progress.assignment', 'Phân công (máy gán)', ['X', 'S', 'S', 'X', 'X', 'S']),
    ]),
    item('gantt.legal', 'Hồ sơ', PROJECT_TEAM, [
      item('gantt.legal.catalog', 'Danh mục, kiểm tra, phát hành', PROJECT_TEAM),
      item('gantt.legal.feedback', 'Góp ý & trả lời', PROJECT_TEAM),
      item('gantt.legal.permits', 'Xin phép', PROJECT_TEAM),
    ]),
    item('gantt.customer', 'Khách hàng', PROJECT_TEAM, [
      item('gantt.customer.rfi', 'Đề nghị CĐT cung cấp thông tin', PROJECT_TEAM),
      item('gantt.customer.meetings', 'Biên bản họp', PROJECT_TEAM),
      item('gantt.customer.changes', 'Yêu cầu thay đổi (CR)', PROJECT_TEAM),
    ]),
    item('gantt.close', 'Chốt sản lượng tháng', MONEY, [
      item('gantt.close.month', 'Tháng', MONEY),
      item('gantt.close.year', 'Năm tài chính', MONEY),
    ]),
    item('gantt.new-project', 'Dự án mới / nhập HĐ', ['X', 'X', 'S', 'X', 'X', 'S']),
  ] },
  { key: 'timesheets', label: 'Con người', children: [
    item('timesheets.mine', 'Khai giờ của tôi', ['S', 'S', 'S', '—', '—', '—']),
    item('timesheets.review', 'Duyệt giờ', ['—', 'S', 'S', '—', '—', 'S']),
    item('timesheets.ot', 'Làm thêm giờ', ALL_S),
    item('timesheets.balance', 'Cân đối công', ['—', 'S', 'S', 'S', 'S', 'S']),
    item('timesheets.control', 'Kiểm tra khai giờ', ['—', '—', 'S', 'S', 'S', 'S']),
  ] },
  { key: 'company', label: 'Công ty', children: [
    item('company.policies', 'Quy định & hướng dẫn', VIEW_ALL, [
      item('company.policies.rules', 'Quy định công ty', VIEW_ALL),
      item('company.policies.guide', 'Hướng dẫn sử dụng', VIEW_ALL),
      item('company.policies.reads', 'Xác nhận đã đọc', ALL_S),
    ]),
    item('company.reports', 'Báo cáo', VIEW_ALL),
    item('company.settings', 'Cài đặt & nhập file', VIEW_ALL, [
      item('company.settings.imports', 'Nhập file', ['X', 'X', 'X', 'S', 'S', 'S']),
      item('company.settings.matrix', 'Ma trận quyền', VIEW_ALL),
      item('company.settings.calendar', 'Lịch & giờ làm việc', VIEW_ALL),
      item('company.settings.params', 'Tham số', ['X', 'X', 'X', 'X', 'S', 'S']),
      item('company.settings.dictionary', 'Từ điển & thuật ngữ', VIEW_ALL),
      item('company.settings.rules', 'Quy tắc chung', VIEW_ALL),
    ]),
  ] },
];

/** Danh sách phẳng mọi mục / mục con kèm khóa của mục cha (trang không có ô quyền riêng). */
export const PAGE_ACCESS_ITEMS = PAGE_ACCESS_TREE.flatMap(page => page.children.flatMap(section => [
  { ...section, page: page.key, parent: '' },
  ...section.children.map(child => ({ ...child, page: page.key, parent: section.key })),
]));

const validCode = code => PAGE_ACCESS_CODES.some(option => option.code === code);

/**
 * Ghép giá trị đã lưu với danh sách hiện tại: mục mới thêm vào web tự có giá trị mặc định,
 * mục đã bỏ khỏi web tự biến mất, giá trị lỗi quay về mặc định.
 */
export function normalizePageAccess(saved = {}) {
  return Object.fromEntries(PAGE_ACCESS_ITEMS.map(entry => {
    const stored = saved?.[entry.key] || {};
    const values = Object.fromEntries(OP_ROLES.map((role, index) => [role, validCode(stored.values?.[role]) ? stored.values[role] : entry.defaults[index]]));
    return [entry.key, { values, note: typeof stored.note === 'string' ? stored.note : '' }];
  }));
}

/** Vai trò có thấy mục / mục con không: mục con chỉ thấy khi mục cha cũng được thấy. */
export function pageAccessAllows(access, key, role, mode = 'read') {
  if (role === 'admin') return true;
  const entry = PAGE_ACCESS_ITEMS.find(row => row.key === key);
  if (!entry) return false;
  const normalized = access?.[key]?.values ? access : normalizePageAccess(access);
  const code = normalized[key].values[role];
  const allowed = mode === 'write' ? code === 'S' : code !== '—';
  return allowed && (!entry.parent || pageAccessAllows(normalized, entry.parent, role, 'read'));
}

/** Trang hiện trên menu khi vai trò thấy ít nhất một mục của trang. */
export function pageVisible(access, pageKey, role) {
  const page = PAGE_ACCESS_TREE.find(row => row.key === pageKey);
  return Boolean(page?.children.some(section => pageAccessAllows(access, section.key, role)));
}
