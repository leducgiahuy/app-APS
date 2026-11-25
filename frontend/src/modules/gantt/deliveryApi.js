import { SELF_PROFILE_FIELDS, applyServerProfile, endAuthSession, getAuthToken, getCurrentUser } from '../auth/authSession';

// Đường dẫn tương đối: chạy được cả khi deploy (cùng tên miền) lẫn khi dev (Vite proxy /api).
const BASE = '/api/delivery';
let session = null;
let loginPromise = null;
async function authenticate() {
  const user = getCurrentUser();
  if (!user) throw new Error('Cần đăng nhập để xem Tiến độ mới.');
  const token = getAuthToken();
  if (session?.email === user.email && session.token === token && session.expiresAt > Date.now() + 1000) return session.token;
  if (loginPromise) return loginPromise;
  loginPromise = (async () => {
    // Dùng mã phiên đã lưu lúc đăng nhập (trình duyệt không giữ mật khẩu); mã hết hạn thì về trang đăng nhập.
    const response = await fetch(`${BASE}/session`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) { expireSession(); throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'); }
    if (!response.ok) throw new Error(result.message || 'Không kết nối được quyền Tiến độ.');
    session = { ...result.data, token, email: user.email };
    // Mỗi lần mở web: hồ sơ trong trình duyệt lấy theo máy chủ; hồ sơ cũ chỉ có ở trình duyệt thì đẩy lên một lần.
    const cached = applyServerProfile(result.data?.user);
    if (cached?.needsUpload) queueMicrotask(() => uploadLocalProfile(cached));
    return session.token;
  })();
  try { return await loginPromise; } finally { loginPromise = null; }
}
/** Mã phiên không còn hợp lệ (hết hạn, bị thu hồi, server đổi dữ liệu): đóng phiên và về trang đăng nhập. */
function expireSession() {
  session = null;
  endAuthSession();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) window.location.assign('/login');
}
/** Đẩy hồ sơ đang lưu trong trình duyệt lên máy chủ (tài khoản tạo trước khi máy chủ lưu hồ sơ). */
function uploadLocalProfile(user) {
  const body = { name: user.name, ...Object.fromEntries(SELF_PROFILE_FIELDS.map(key => [key, user[key] || ''])) };
  request('/profile', 'PATCH', body).then(result => applyServerProfile(result.data)).catch(() => {});
}
export const deliveryToken = () => authenticate();
/** API ngoài /delivery (nhân sự, dự án…) báo 401: mã phiên không còn hợp lệ → về trang đăng nhập. */
export const deliverySessionExpired = () => expireSession();
/** Tài khoản Tiến độ của phiên hiện tại (gồm vai trò); máy chủ vẫn kiểm tra quyền ở mỗi thao tác. */
export const deliveryViewer = async () => { await authenticate(); return session?.user || null; };
/** Ma trận phân quyền đang áp dụng (null = dùng ma trận mặc định). */
async function request(endpoint, method = 'GET', body, retried = false) {
  const token = await authenticate();
  const response = await fetch(`${BASE}${endpoint}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 401 && !retried) { session = null; return request(endpoint, method, body, true); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.message || `Lỗi Tiến độ HTTP ${response.status}`); error.status = response.status; throw error; }
  return result;
}
export const deliveryApi = {
  notifications: () => request('/notifications'),
  pageAccess: () => request('/page-access'),
  previewProject: value => request('/project-preview','POST',value),
  operations: query => request(`/operations?${new URLSearchParams(query)}`),
  mutateOperations: body => request('/operations', 'PATCH', body),
  executive: month => request(`/executive?month=${encodeURIComponent(month)}`),
  updateExecutive: body => request('/executive', 'PATCH', body),
  reporting: (year, month) => request(`/reporting?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
  updateReporting: body => request('/reporting', 'POST', body),
  get: projectId => request(`/${encodeURIComponent(projectId)}`),
  // Nhật ký thay đổi do máy chủ ghi (kèm tên dự án / công việc), không ghi thêm ở đây để khỏi trùng.
  update: (projectId, body) => request(`/${encodeURIComponent(projectId)}`, 'PATCH', body),
  users: () => request('/users'),
  saveUser: body => request('/users', 'POST', body),
  changePassword: body => request('/password', 'POST', body),
  /** Sửa mã MOI + lịch ngày nghỉ của dự án (workCalendar: all | sunday | none); apply=false chỉ xem trước. */
  calendarFix: (projectId, apply, workCalendar) => request(`/${encodeURIComponent(projectId)}/calendar-fix`, 'POST', { apply, ...(workCalendar ? { workCalendar } : {}) }),
  profile: () => request('/profile'),
  updateProfile: body => request('/profile', 'PATCH', body),
  accountCatalog: () => request('/account-catalog'),
  removeCatalogEntry: (kind, value) => request('/account-catalog', 'DELETE', { kind, value }),
  deleteUser: body => request('/users', 'DELETE', body),
  deletedUsers: () => request('/users/deleted'),
  purgeDeletedUser: id => request(id ? `/users/deleted/${encodeURIComponent(id)}` : '/users/deleted', 'DELETE'),
  restoreUser: (id, password) => request(`/users/deleted/${encodeURIComponent(id)}/restore`, 'POST', { password }),
  templates: () => request('/templates'),
  saveTemplate: body => request('/templates', 'POST', body),
  upload: async (projectId, taskId, file, kind) => {
    if (file.size > 10 * 1024 * 1024) throw new Error('Tệp không được vượt quá 10 MB.');
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    return request(`/${encodeURIComponent(projectId)}/evidence`, 'POST', { taskId, name: file.name, kind, base64 });
  },
  download: async (projectId, file) => {
    const token = await authenticate();
    const response = await fetch(`${BASE}/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(file.id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error((await response.json()).message || 'Không tải được tệp.');
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
