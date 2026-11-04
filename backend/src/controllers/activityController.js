import { readDb, writeDb } from '../models/db.js';
import { appendActivity } from '../utils/activityLog.js';

/** Xem / xóa nhật ký chỉ dành cho Quản trị (trang Nhật ký hoạt động chỉ hiện với Quản trị). */
const adminOnly = (req, res) => {
  if (req.deliveryCompanyUser?.role === 'admin') return false;
  res.status(403).json({ success: false, message: 'Chỉ Quản trị viên được xem hoặc xóa nhật ký hoạt động.' });
  return true;
};

/** Trả danh sách nhật ký dùng chung để admin xem hoạt động từ các trình duyệt khác nhau. */
export function getActivityLog(req, res) {
  if (adminOnly(req, res)) return;
  const db = readDb();
  res.json({ success: true, data: Array.isArray(db.activityLog) ? db.activityLog : [] });
}

/** Ghi một sự kiện đã được frontend loại bỏ dữ liệu nhạy cảm như mật khẩu. */
export function createActivityLogEntry(req, res) {
  // Người ghi luôn là tài khoản đang đăng nhập, không lấy theo dữ liệu gửi lên (tránh ghi giả tên người khác).
  const user = req.deliveryCompanyUser || {};
  const { timestamp, action, details } = req.body || {};
  const email = user.email || req.body?.email, name = user.name || req.body?.name, role = user.role || req.body?.role;
  if (!email || !action) return res.status(400).json({ success: false, message: 'email và action là bắt buộc.' });

  const db = readDb();
  const event = appendActivity(db, { timestamp, email, name, role, action, details });
  if (!writeDb(db)) return res.status(500).json({ success: false, message: 'Không thể lưu nhật ký hoạt động.' });
  res.status(201).json({ success: true, data: event });
}

/** Xóa nhật ký tập trung; trang quản trị chỉ hiển thị thao tác này cho admin. */
export function clearActivityLogEntries(req, res) {
  if (adminOnly(req, res)) return;
  const db = readDb();
  db.activityLog = [];
  if (!writeDb(db)) return res.status(500).json({ success: false, message: 'Không thể xóa nhật ký hoạt động.' });
  res.json({ success: true, data: [] });
}
