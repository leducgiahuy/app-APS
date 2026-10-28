import { getLevelLabel, normalizeLevel } from './accountOptions';

const USERS_KEY = 'aps-users';
const SESSION_KEY = 'aps-authenticated';
const ACTIVITY_KEY = 'aps-activity-log';
const AUTH_ATTEMPTS_KEY = 'aps-auth-attempts';
const AUTH_SESSION_MS = 8 * 60 * 60 * 1000;
const ACTIVITY_API = 'http://localhost:5000/api/activity';
const DEMO_USER = {
  name: 'Nguyễn Minh Anh',
  email: 'demo@aps.vn',
  company: 'APS Việt Nam',
  phone: '',
  password: 'APS@2026',
  role: 'admin',
  level: 'director',
  department: 'Ban Giám Đốc',
  specialty: 'Quản lý dự án',
};

/** Đọc cấp bậc/phòng ban/chuyên môn từ form; cắt khoảng trắng và chuẩn hóa mã cấp bậc. */
function pickOrgProfile(profile) {
  return {
    level: normalizeLevel(profile.level),
    department: String(profile.department || '').trim(),
    specialty: String(profile.specialty || '').trim(),
  };
}

/** Đọc danh sách tài khoản từ localStorage và tự thêm tài khoản demo nếu chưa có. */
export function getUsers() {
  try {
    const savedUsers = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const users = Array.isArray(savedUsers) ? savedUsers : [];
    const demoIndex = users.findIndex((user) => user.email === DEMO_USER.email);
    if (demoIndex < 0) {
      users.unshift(DEMO_USER);
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } else if (users[demoIndex].role !== 'admin') {
      users[demoIndex] = { ...users[demoIndex], role: 'admin' };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    // Tài khoản tạo trước khi có cấp bậc vẫn đọc được: thiếu cấp bậc → Nhân viên, thiếu phòng ban/chuyên môn → rỗng.
    return users.map((user) => ({
      ...user,
      role: user.role === 'admin' ? 'admin' : 'user',
      level: normalizeLevel(user.level),
      department: user.department || '',
      specialty: user.specialty || '',
    }));
  } catch {
    localStorage.setItem(USERS_KEY, JSON.stringify([DEMO_USER]));
    return [DEMO_USER];
  }
}

/** Tìm tài khoản theo địa chỉ email đã chuẩn hóa. */
export function findUser(email) {
  const normalizedEmail = email.trim().toLowerCase();
  return getUsers().find((user) => user.email === normalizedEmail) || null;
}

/** Kiểm tra thông tin đăng nhập và trả về tài khoản khi email/mật khẩu khớp. */
export function authenticateUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  let attempts = {};
  try { attempts = JSON.parse(localStorage.getItem(AUTH_ATTEMPTS_KEY) || '{}'); } catch { localStorage.removeItem(AUTH_ATTEMPTS_KEY); }
  const current = attempts[normalizedEmail];
  if (current?.lockedUntil > Date.now()) return null;
  const user = findUser(normalizedEmail);
  if (user && user.password === password) {
    delete attempts[normalizedEmail];
    localStorage.setItem(AUTH_ATTEMPTS_KEY, JSON.stringify(attempts));
    return user;
  }
  const count = (current?.lockedUntil && current.lockedUntil <= Date.now() ? 0 : current?.count || 0) + 1;
  attempts[normalizedEmail] = { count, lockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 };
  localStorage.setItem(AUTH_ATTEMPTS_KEY, JSON.stringify(attempts));
  return null;
}

/** Lưu nhật ký thao tác, luôn bỏ qua mật khẩu và giới hạn dung lượng ở 1.000 sự kiện. */
export function recordActivity(action, details = '', actorEmail = '') {
  try {
    const user = actorEmail ? findUser(actorEmail) : getCurrentUser();
    const events = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    const entry = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      email: user?.email || actorEmail || 'unknown',
      name: user?.name || actorEmail || 'Không xác định',
      role: user?.role || 'user',
      action,
      details: String(details).slice(0, 300),
    };
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify([entry, ...(Array.isArray(events) ? events : [])].slice(0, 1000)));
    fetch(ACTIVITY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {});
    return entry;
  } catch (error) {
    console.warn('Không thể ghi nhật ký hoạt động:', error.message);
    return null;
  }
}

/** Trả danh sách sự kiện mới nhất trước để trang admin hiển thị dạng lịch sử. */
export function getActivityLog() {
  try {
    const events = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

/** Tải nhật ký dùng chung từ backend; trả null nếu backend chưa chạy để dùng bản cục bộ. */
export async function fetchSharedActivityLog() {
  try {
    const response = await fetch(ACTIVITY_API);
    if (!response.ok) return null;
    const result = await response.json();
    return Array.isArray(result.data) ? result.data : null;
  } catch {
    return null;
  }
}

/** Xóa nhật ký tập trung trên backend khi admin yêu cầu dọn lịch sử. */
export async function clearSharedActivityLog() {
  try {
    const response = await fetch(ACTIVITY_API, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}

/** Chỉ admin mới được xóa toàn bộ nhật ký hoạt động trên trình duyệt hiện tại. */
export function clearActivityLog(actorEmail) {
  if (findUser(actorEmail)?.role !== 'admin') return false;
  localStorage.removeItem(ACTIVITY_KEY);
  return true;
}

/**
 * Tạo tài khoản mới kèm cấp bậc, phòng ban, chuyên môn.
 * - Chỉ admin được tạo; tài khoản mới luôn có quyền hệ thống `user`.
 * - Bắt buộc có phòng ban; chuyên môn có thể để trống (VD: Giám đốc).
 * - Email trùng sẽ trả về lỗi để giao diện thông báo.
 */
export function createUser(fields, actorEmail) {
  const prepared = validateNewUser(fields, actorEmail);
  if (prepared.error) return prepared;
  const { user } = prepared;
  localStorage.setItem(USERS_KEY, JSON.stringify([...getUsers(), user]));
  recordActivity('user.create', `Tạo tài khoản user ${user.email} (${getLevelLabel(user.level)} · ${user.department}${user.specialty ? ` · ${user.specialty}` : ''}).`, actorEmail);
  return { user };
}

/** Kiểm tra quyền, email trùng, phòng ban và dựng bản ghi tài khoản mới (chưa lưu). */
export function validateNewUser({ name, email, company, phone = '', password, employeeId = '', ...orgFields }, actorEmail) {
  if (findUser(actorEmail)?.role !== 'admin') return { error: 'Chỉ quản trị viên mới được tạo tài khoản.' };
  const normalizedEmail = email.trim().toLowerCase();
  if (getUsers().some((user) => user.email === normalizedEmail)) {
    return { error: 'Email này đã được đăng ký.' };
  }
  const org = pickOrgProfile(orgFields);
  if (!org.department) return { error: 'Vui lòng chọn hoặc nhập phòng ban.' };
  return { user: { name: name.trim(), email: normalizedEmail, company: company.trim(), phone: phone.trim(), password, role: 'user', employeeId, ...org } };
}

/** Admin xóa tài khoản user (không xóa được tài khoản admin); phiên đang mở của user đó sẽ tự hết hiệu lực. */
export function deleteUser(targetEmail, actorEmail) {
  if (findUser(actorEmail)?.role !== 'admin') return { error: 'Chỉ quản trị viên mới được xóa tài khoản.' };
  const users = getUsers();
  const target = users.find((user) => user.email === targetEmail && user.role === 'user');
  if (!target) return { error: 'Không tìm thấy tài khoản user cần xóa.' };
  localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((user) => user !== target)));
  recordActivity('user.delete', `Admin xóa tài khoản ${targetEmail}.`, actorEmail);
  return { user: target };
}

/** Gắn tài khoản với hồ sơ nhân sự HR (trường employeeId). */
export function linkUserEmployee(email, employeeId) {
  const users = getUsers();
  const user = users.find((entry) => entry.email === email);
  if (!user) return false;
  user.employeeId = employeeId;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return true;
}

/** Lưu thay đổi tên, công ty và số điện thoại của tài khoản hiện tại. */
export function updateUserProfile(email, profile, actorEmail = email) {
  if (email !== actorEmail) return false;
  const users = getUsers();
  const index = users.findIndex((user) => user.email === email);
  if (index < 0) return false;
  users[index] = {
    ...users[index],
    name: profile.name.trim(),
    company: profile.company.trim(),
    phone: profile.phone.trim(),
    avatarData: profile.avatarData || '',
  };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  recordActivity('profile.update', `Cập nhật hồ sơ cá nhân (${email}).`, actorEmail);
  return true;
}

/**
 * Cho phép admin chỉnh hồ sơ, ảnh đại diện và cấp bậc/phòng ban/chuyên môn của user.
 * Không cho sửa quyền hệ thống (admin/user) và không cho để trống phòng ban.
 */
export function adminUpdateUserProfile(actorEmail, targetEmail, profile) {
  const actor = findUser(actorEmail);
  if (actor?.role !== 'admin') return false;
  const users = getUsers();
  const index = users.findIndex((user) => user.email === targetEmail && user.role === 'user');
  if (index < 0) return false;
  const org = pickOrgProfile(profile);
  if (!org.department) return false;
  users[index] = {
    ...users[index],
    name: profile.name.trim(),
    company: profile.company.trim(),
    phone: profile.phone.trim(),
    avatarData: profile.avatarData || '',
    ...org,
  };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  recordActivity('user.profile.update', `Admin cập nhật hồ sơ/ảnh của ${targetEmail}.`, actorEmail);
  return true;
}

/** Thu nhỏ ảnh đại diện thành hình vuông 256px để tiết kiệm dung lượng trình duyệt. */
export async function processAvatarFile(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Vui lòng chọn một tệp hình ảnh.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh cần nhỏ hơn 5 MB.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const cropSize = Math.min(bitmap.width, bitmap.height);
  const cropX = (bitmap.width - cropSize) / 2;
  const cropY = (bitmap.height - cropSize) / 2;
  context.drawImage(bitmap, cropX, cropY, cropSize, cropSize, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/** Đổi mật khẩu sau khi xác nhận mật khẩu hiện tại của người dùng. */
export function updateUserPassword(email, currentPassword, newPassword, actorEmail = email) {
  if (email !== actorEmail) return false;
  const users = getUsers();
  const user = users.find((entry) => entry.email === email);
  if (!user || user.password !== currentPassword) return false;
  user.password = newPassword;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  recordActivity('password.change', 'Người dùng tự đổi mật khẩu.', actorEmail);
  return true;
}

/** Đặt mật khẩu mới cho tài khoản user; chỉ tài khoản admin được phép thực hiện. */
export function resetUserPassword(targetEmail, newPassword, actorEmail) {
  const actor = findUser(actorEmail);
  if (actor?.role !== 'admin') return { error: 'Chỉ quản trị viên mới được cấp lại mật khẩu.' };
  const users = getUsers();
  const target = users.find((user) => user.email === targetEmail && user.role === 'user');
  if (!target) return { error: 'Không tìm thấy tài khoản user cần cấp lại mật khẩu.' };
  target.password = newPassword;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  recordActivity('password.reset', `Admin cấp lại mật khẩu cho ${targetEmail}.`, actorEmail);
  return { success: true };
}

/** Bắt đầu phiên đăng nhập; ghi nhớ vào localStorage hoặc chỉ lưu trong phiên tab. */
export function startAuthSession(remember, email) {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify({ email: email.trim().toLowerCase(), expiresAt: Date.now() + AUTH_SESSION_MS }));
  recordActivity('auth.login', 'Đăng nhập thành công.', email);
}

/** Trả về email đang đăng nhập, hỗ trợ phiên cũ trước khi có quản lý tài khoản. */
export function getCurrentUser() {
  const storage = sessionStorage.getItem(SESSION_KEY) ? sessionStorage : localStorage;
  const saved = storage.getItem(SESSION_KEY);
  if (!saved) return null;
  let email, expiresAt;
  try { ({ email, expiresAt } = JSON.parse(saved)); }
  catch { email = saved === 'true' ? DEMO_USER.email : saved; expiresAt = Date.now() + AUTH_SESSION_MS; storage.setItem(SESSION_KEY, JSON.stringify({ email, expiresAt })); }
  if (!email || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) { storage.removeItem(SESSION_KEY); return null; }
  return findUser(email);
}

/** Kiểm tra xem trình duyệt hiện tại có phiên gắn với một tài khoản hợp lệ không. */
export function hasAuthSession() {
  return Boolean(getCurrentUser());
}

/** Kết thúc phiên ở cả hai nơi lưu để nút đăng xuất luôn đóng phiên hoàn toàn. */
export function endAuthSession() {
  recordActivity('auth.logout', 'Đăng xuất khỏi hệ thống.');
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
