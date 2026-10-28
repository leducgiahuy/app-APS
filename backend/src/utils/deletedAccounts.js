import { readDb, writeDb } from '../models/db.js';
import { deliveryStore, passwordHash, safeUser } from './deliveryAuth.js';

/**
 * Xóa tài khoản khỏi toàn bộ dữ liệu đang dùng nhưng giữ một bản lưu trữ chỉ Quản trị xem được.
 * Bản lưu gồm hồ sơ tài khoản (không có mật khẩu), tài khoản phân quyền, hồ sơ nhân sự và vai trò theo dự án,
 * đủ để tra cứu hoặc khôi phục; email được giải phóng để tạo tài khoản mới.
 */

const adminOnly = (req, res) => {
  if (req.deliveryCompanyUser?.role === 'admin') return false;
  res.status(403).json({ message: 'Chỉ Quản trị viên được xem, xóa hoặc khôi phục tài khoản đã xóa.' });
  return true;
};
const archiveOf = store => (store.deletedUsers ||= []);
const withoutSecrets = ({ password, hash, salt, ...rest } = {}) => rest;

export function deleteAccount(req, res) {
  if (adminOnly(req, res)) return;
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'Thiếu email tài khoản cần xóa.' });
  if (email === req.deliveryCompanyUser.email) return res.status(400).json({ message: 'Không thể tự xóa tài khoản đang đăng nhập.' });
  const db = readDb(); const store = deliveryStore(db);
  const backendUser = store.users.find(user => user.email === email);
  // Được xóa Quản trị khác, nhưng hệ thống luôn phải còn ít nhất một Quản trị đang hoạt động.
  if (backendUser?.role === 'admin' && !store.users.some(user => user.role === 'admin' && !user.disabled && user.email !== email)) {
    return res.status(400).json({ message: 'Phải còn ít nhất một tài khoản Quản trị đang hoạt động.' });
  }

  const profile = withoutSecrets(req.body?.profile);
  const employeeId = profile.employeeId || backendUser?.employeeId;
  const employees = db.employees || [];
  const employee = employees.find(row => row.id === employeeId) || employees.find(row => String(row.email || '').toLowerCase() === email) || null;
  const deletedAt = new Date().toISOString();
  const members = (db.operations?.members || []).filter(row => row.email === email && !row.deletedAt);

  archiveOf(store).unshift({
    id: `del-${Date.now()}`,
    email,
    name: profile.name || backendUser?.name || employee?.name || email,
    deletedAt,
    deletedBy: req.deliveryCompanyUser.email,
    account: profile,
    backendUser: backendUser ? safeUser(backendUser) : null,
    employee,
    memberIds: members.map(row => row.id),
  });
  store.users = store.users.filter(user => user.email !== email);
  store.sessions = store.sessions.filter(session => session.email !== email);
  if (store.loginAttempts) delete store.loginAttempts[email];
  if (employee) db.employees = employees.filter(row => row.id !== employee.id);
  members.forEach(row => { row.deletedAt = deletedAt; row.deletedReason = 'account-deleted'; });

  if (!writeDb(db)) return res.status(500).json({ message: 'Không xóa được tài khoản. Vui lòng thử lại.' });
  return res.json({ success: true });
}

export function listDeletedAccounts(req, res) {
  if (adminOnly(req, res)) return;
  const store = deliveryStore(readDb());
  return res.json({ success: true, data: archiveOf(store) });
}

/**
 * Xóa vĩnh viễn khỏi kho lưu trữ (một bản ghi theo :id, hoặc tất cả khi không có :id).
 * Gỡ luôn các dòng vai trò dự án đã bị ẩn khi xóa tài khoản; sau bước này không khôi phục được nữa.
 */
export function purgeDeletedAccounts(req, res) {
  if (adminOnly(req, res)) return;
  const db = readDb(); const store = deliveryStore(db);
  const archive = archiveOf(store);
  const purged = req.params.id ? archive.filter(row => row.id === req.params.id) : archive;
  if (req.params.id && !purged.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản đã xóa.' });
  const memberIds = new Set(purged.flatMap(row => row.memberIds || []));
  if (db.operations?.members) db.operations.members = db.operations.members.filter(row => !(memberIds.has(row.id) && row.deletedReason === 'account-deleted'));
  store.deletedUsers = archive.filter(row => !purged.includes(row));
  if (!writeDb(db)) return res.status(500).json({ message: 'Không xóa được dữ liệu lưu trữ. Vui lòng thử lại.' });
  return res.json({ success: true, data: { purged: purged.length } });
}

export function restoreDeletedAccount(req, res) {
  if (adminOnly(req, res)) return;
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 512) return res.status(400).json({ message: 'Mật khẩu mới cần có ít nhất 8 ký tự.' });
  const db = readDb(); const store = deliveryStore(db);
  const archive = archiveOf(store);
  const record = archive.find(row => row.id === req.params.id);
  if (!record) return res.status(404).json({ message: 'Không tìm thấy tài khoản đã xóa.' });
  if (store.users.some(user => user.email === record.email)) return res.status(409).json({ message: `Email ${record.email} đang được dùng cho một tài khoản khác.` });

  db.employees ||= [];
  const employee = record.employee && !db.employees.some(row => row.id === record.employee.id) ? record.employee : null;
  if (employee) db.employees.push({ ...employee, isOnSite: false, isOnBreak: false, checkInAt: null, checkInTime: null, activeTaskId: null, activeTaskTitle: null, workSessionStartedAt: null });
  const role = record.backendUser?.role || record.account?.level || 'employee';
  store.users.push({ ...(record.backendUser || {}), email: record.email, name: record.name, role, employeeId: record.employee?.id || '', disabled: false, ...passwordHash(password) });
  (db.operations?.members || []).forEach(row => {
    if (record.memberIds?.includes(row.id) && row.deletedReason === 'account-deleted') { delete row.deletedAt; delete row.deletedReason; }
  });
  store.deletedUsers = archive.filter(row => row !== record);

  if (!writeDb(db)) return res.status(500).json({ message: 'Không khôi phục được tài khoản. Vui lòng thử lại.' });
  return res.json({ success: true, data: { account: record.account, email: record.email, employeeId: record.employee?.id || '' } });
}
