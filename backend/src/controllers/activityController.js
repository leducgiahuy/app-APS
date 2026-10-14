import { randomUUID } from 'crypto';
import { readDb, writeDb } from '../models/db.js';

/** Trả danh sách nhật ký dùng chung để admin xem hoạt động từ các trình duyệt khác nhau. */
export function getActivityLog(req, res) {
  const db = readDb();
  res.json({ success: true, data: Array.isArray(db.activityLog) ? db.activityLog : [] });
}

/** Ghi một sự kiện đã được frontend loại bỏ dữ liệu nhạy cảm như mật khẩu. */
export function createActivityLogEntry(req, res) {
  const { timestamp, email, name, role, action, details } = req.body || {};
  if (!email || !action) return res.status(400).json({ success: false, message: 'email và action là bắt buộc.' });

  const db = readDb();
  db.activityLog = Array.isArray(db.activityLog) ? db.activityLog : [];
  const event = {
    id: randomUUID(),
    timestamp: timestamp || new Date().toISOString(),
    email: String(email).slice(0, 180),
    name: String(name || email).slice(0, 180),
    role: role === 'admin' ? 'admin' : 'user',
    action: String(action).slice(0, 100),
    details: String(details || '').slice(0, 300),
  };

  db.activityLog.unshift(event);
  db.activityLog = db.activityLog.slice(0, 1000);
  if (!writeDb(db)) return res.status(500).json({ success: false, message: 'Không thể lưu nhật ký hoạt động.' });
  res.status(201).json({ success: true, data: event });
}

/** Xóa nhật ký tập trung; trang quản trị chỉ hiển thị thao tác này cho admin. */
export function clearActivityLogEntries(req, res) {
  const db = readDb();
  db.activityLog = [];
  if (!writeDb(db)) return res.status(500).json({ success: false, message: 'Không thể xóa nhật ký hoạt động.' });
  res.json({ success: true, data: [] });
}
