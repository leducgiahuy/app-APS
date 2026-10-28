import { matrixAllows } from '../../../frontend/src/utils/operationsDefaults.js';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { projectActor } from './operationsStore.js';
import { readDb, writeDb } from '../models/db.js';
import { DELIVERY_ROLES, managingRole, moneyAccess } from '../../../frontend/src/utils/deliveryMetrics.js';
import { canEditProgressTask, maskDeliveryFinance } from '../../../frontend/src/utils/deliveryView.js';
import { permissionsFor } from '../../../frontend/src/utils/rolePermissions.js';

/** Cờ thao tác trang Dự án theo ma trận phân quyền, tính trên vai trò của người xem ở dự án này. */
function matrixFlags(role, matrix) {
  const perms = permissionsFor(role, matrix);
  return { schedule: perms.editSchedule, assign: perms.assignTasks, editProject: perms.editProjectInfo, deleteProject: perms.deleteProject, createProject: perms.createProject };
}

export function passwordHash(password, salt = randomBytes(16).toString('hex')) { return { salt, hash: scryptSync(password, salt, 32).toString('hex') }; }
const tokenHash = token => createHash('sha256').update(token).digest('hex');
export function deliveryStore(db) {
  db.delivery ||= { users: [], sessions: [], projects: {}, templates: [] };
  db.delivery.version ||= 1;
  db.delivery.users ||= []; db.delivery.sessions ||= []; db.delivery.projects ||= {}; db.delivery.templates ||= [];
  return db.delivery;
}
export function deliveryLogin(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 512) return res.status(400).json({ message: 'Thông tin đăng nhập không hợp lệ.' });
  const db = readDb(); const store = deliveryStore(db);
  if (!store.users.length && email.toLowerCase() === 'demo@aps.vn' && password === 'APS@2026') store.users.push({ email: 'demo@aps.vn', name: 'Nguyễn Minh Anh', role: 'admin', employeeId: '', ...passwordHash(password) });
  const user = store.users.find(item => item.email === email.trim().toLowerCase() && !item.disabled);
  store.loginAttempts ||= {};
  const loginKey=email.trim().toLowerCase(),attempt=store.loginAttempts[loginKey];
  if(attempt?.lockedUntil>Date.now())return res.status(429).json({message:'Tài khoản tạm khóa sau 5 lần đăng nhập sai. Thử lại sau 15 phút.'});
  if (!user || !timingSafeEqual(Buffer.from(user.hash, 'hex'), Buffer.from(passwordHash(password, user.salt).hash, 'hex'))) {
    const count=(attempt?.lockedUntil&&attempt.lockedUntil<=Date.now()?0:attempt?.count||0)+1;
    store.loginAttempts[loginKey]={count,lockedUntil:count>=5?Date.now()+15*60000:0};writeDb(db);
    return res.status(401).json({ message: 'Tài khoản chưa được cấp quyền hoặc mật khẩu không khớp.' });
  }
  delete store.loginAttempts[loginKey];
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (Number(db.operations?.params?.sessionHours)||8) * 3600000;
  store.sessions = store.sessions.filter(session => session.expiresAt > Date.now());
  store.sessions.push({ hash: tokenHash(token), email: user.email, expiresAt });
  if (!writeDb(db)) return res.status(500).json({ message: 'Không lưu được phiên đăng nhập.' });
  return res.json({ success: true, data: { token, expiresAt, user: safeUser(user), matrix: db.operations?.matrix || null } });
}
/** Người dùng tự đổi mật khẩu đăng nhập backend; cần đúng mật khẩu hiện tại. */
export function deliveryChangePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 512) return res.status(400).json({ message: 'Mật khẩu mới cần có ít nhất 8 ký tự.' });
  const db = readDb(); const store = deliveryStore(db);
  const user = store.users.find(item => item.email === req.deliveryCompanyUser.email);
  if (!user || typeof currentPassword !== 'string' || !timingSafeEqual(Buffer.from(user.hash, 'hex'), Buffer.from(passwordHash(currentPassword, user.salt).hash, 'hex'))) return res.status(400).json({ message: 'Mật khẩu hiện tại chưa chính xác.' });
  Object.assign(user, passwordHash(newPassword));
  store.sessions = store.sessions.filter(session => session.email !== user.email || session.hash === req.deliverySessionHash);
  if (!writeDb(db)) return res.status(500).json({ message: 'Không lưu được mật khẩu mới.' });
  return res.json({ success: true });
}
export function requireDeliveryUser(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return res.status(401).json({ message: 'Cần đăng nhập để truy cập dữ liệu Tiến độ.' });
  const db = readDb(); const store = deliveryStore(db);
  const session = store.sessions.find(item => item.hash === tokenHash(token) && item.expiresAt > Date.now());
  const user = session && store.users.find(item => item.email === session.email && !item.disabled);
  if (!user) return res.status(401).json({ message: 'Phiên Tiến độ đã hết hạn hoặc quyền đã bị thu hồi.' });
  const effective = projectActor(db, user, req.params.projectId);
  if (!effective) return res.status(403).json({ message: 'Bạn không có vai trò trên dự án này.' });
  req.deliveryUser = effective; req.deliveryCompanyUser = user; req.deliverySessionHash = session.hash; next();
}
export const safeUser = ({ hash, salt, ...user }) => user;
export function deliveryUsers(req, res) {
  if (!['admin', 'director'].includes(req.deliveryUser.role)) return res.status(403).json({ message: 'Chỉ quản trị/giám đốc được cấp quyền.' });
  const db = readDb(); const store = deliveryStore(db);
  if (req.method === 'GET') return res.json({ success: true, data: store.users.map(safeUser) });
  const { email, name, role, employeeId, password, disabled } = req.body || {};
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || !DELIVERY_ROLES[role]) return res.status(400).json({ message: 'Email hoặc vai trò không hợp lệ.' });
  if (req.deliveryUser.role !== 'admin' && role === 'admin') return res.status(403).json({ message: 'Chỉ quản trị được tạo quản trị viên.' });
  const existing = store.users.find(item => item.email === email.trim().toLowerCase());
  if (existing?.role === 'admin' && req.deliveryUser.role !== 'admin') return res.status(403).json({ message: 'Không được sửa quyền quản trị.' });
  if (existing?.email === req.deliveryUser.email && (disabled || role !== existing.role)) return res.status(400).json({ message: 'Không thể tự thu hồi quyền của phiên đang dùng.' });
  if (employeeId && !(db.employees || []).some(employee => employee.id === employeeId)) return res.status(400).json({ message: 'Nhân sự liên kết không tồn tại.' });
  if ((!existing || password) && (typeof password !== 'string' || password.length < 8 || password.length > 512)) return res.status(400).json({ message: 'Mật khẩu cấp quyền cần ít nhất 8 ký tự.' });
  const user = { ...(existing || {}), email: email.trim().toLowerCase(), name: String(name || email).trim(), role, employeeId: employeeId || '', disabled: Boolean(disabled), ...(password ? passwordHash(password) : {}) };
  if (existing) store.users[store.users.indexOf(existing)] = user; else store.users.push(user);
  store.sessions = store.sessions.filter(session => session.email !== user.email || session.hash === req.deliverySessionHash && user.email === req.deliveryUser.email);
  if (!writeDb(db)) return res.status(500).json({ message: 'Không lưu được quyền.' });
  return res.json({ success: true, data: store.users.map(safeUser) });
}
export function canEditDeliveryTask(user, item, db) {
  return canEditProgressTask(user, item, db.employees || []);
}
export function publicDelivery(data, metrics, user,matrix) {
  const financial = moneyAccess(user.role) && matrixAllows(matrix,'hdValue',user.role);
  const cleanMetrics = structuredClone(metrics);
  if (!financial) {
    ['output', 'monthlyOutput', 'laborCost', 'expenseCost', 'cost', 'collected', 'eligiblePayment', 'deviation'].forEach(key => delete cleanMetrics.summary[key]);
    Object.values(cleanMetrics.taskMetrics).forEach(item => { delete item.output; delete item.laborCost; });
    cleanMetrics.milestones = (metrics.milestones || []).map(({ amount, ...milestone }) => milestone);
  }
  const settings = financial ? data.settings : { contractLocked: data.settings?.contractLocked };
  const result = { ...cleanMetrics, settings: settings || {}, documents: (data.documents || []).map(row => financial ? row : Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'fee'))), customerRequests: data.customerRequests || [], meetingMinutes: data.meetingMinutes || [], changes: (data.changes || []).map(row => { const change = { ...row, actualHours: metrics.taskMetrics[row.reworkTaskId]?.actualHours || 0 }; if (!financial) { delete change.amount; delete change.appendixAmount; } return change; }), closes: financial ? data.closes || [] : [], receipts: financial ? data.receipts || [] : [], expenses: financial ? data.expenses || [] : [], evidence: (data.evidence || []).filter(file=>!file.deletedAt).map(({ path, ...entry }) => entry), comments: data.comments || [], audit: (data.audit || []).map(({ actor, action, at }) => ({ actor, action, at })), viewer: safeUser(user), permissions: { financial, manage: managingRole(user.role), users: ['admin', 'director'].includes(user.role), ...matrixFlags(user.role, matrix) } };
  return financial ? result : maskDeliveryFinance(result);
}
