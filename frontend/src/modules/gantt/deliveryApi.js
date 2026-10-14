import { getCurrentUser, recordActivity } from '../auth/authSession';

const BASE = 'http://localhost:5000/api/delivery';
let session = null;
let loginPromise = null;
async function authenticate() {
  const user = getCurrentUser();
  if (!user) throw new Error('Cần đăng nhập để xem Tiến độ mới.');
  if (session?.email === user.email && session.expiresAt > Date.now() + 1000) return session.token;
  if (loginPromise) return loginPromise;
  loginPromise = (async () => {
    const response = await fetch(`${BASE}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: user.password }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không kết nối được quyền Tiến độ.');
    session = { ...result.data, email: user.email }; return session.token;
  })();
  try { return await loginPromise; } finally { loginPromise = null; }
}
export const deliveryToken = () => authenticate();
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
  previewProject: value => request('/project-preview','POST',value),
  operations: query => request(`/operations?${new URLSearchParams(query)}`),
  mutateOperations: body => request('/operations', 'PATCH', body),
  executive: month => request(`/executive?month=${encodeURIComponent(month)}`),
  updateExecutive: body => request('/executive', 'PATCH', body),
  reporting: (year, month) => request(`/reporting?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
  updateReporting: body => request('/reporting', 'POST', body),
  get: projectId => request(`/${encodeURIComponent(projectId)}`),
  update: async (projectId, body) => { const result = await request(`/${encodeURIComponent(projectId)}`, 'PATCH', body); recordActivity(`delivery.${body.action}`, `Cập nhật Tiến độ · dự án ${projectId}${body.taskId ? ` · task ${body.taskId}` : ''}.`); return result; },
  users: () => request('/users'),
  saveUser: body => request('/users', 'POST', body),
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
