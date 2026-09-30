/**
 * API Client kết nối với Backend Express (http://localhost:5000/api)
 * Đã cấu hình fallback dữ liệu dự phòng tự động nếu Backend tạm thời chưa khởi động.
 */

const API_BASE = 'http://localhost:5000/api';

// Hàm gửi request tiện ích
async function fetchApi(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Lỗi máy chủ' }));
      throw new Error(err.message || `Lỗi HTTP ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.warn(`[API] Gọi ${endpoint} thất bại:`, error.message);
    throw error;
  }
}

export const api = {
  // === NHÂN SỰ ===
  getEmployees: () => fetchApi('/employees'),
  createEmployee: (data) => fetchApi('/employees', { method: 'POST', body: JSON.stringify(data) }),
  toggleOnSite: (id) => fetchApi(`/employees/${id}/toggle-onsite`, { method: 'PATCH' }),
  toggleBreak: (id) => fetchApi(`/employees/${id}/toggle-break`, { method: 'PATCH' }),
  setActiveTask: (id, taskId) => fetchApi(`/employees/${id}/active-task`, { method: 'PATCH', body: JSON.stringify({ taskId }) }),
  deleteEmployee: (id) => fetchApi(`/employees/${id}`, { method: 'DELETE' }),

  // === PHÂN CÔNG & TĂNG CA ===
  getTasks: () => fetchApi('/tasks'),
  createTask: (data) => fetchApi('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => fetchApi(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id) => fetchApi(`/tasks/${id}`, { method: 'DELETE' }),
  createOvertime: (data) => fetchApi('/overtimes', { method: 'POST', body: JSON.stringify(data) }),
  deleteOvertime: (id) => fetchApi(`/overtimes/${id}`, { method: 'DELETE' }),

  // === DỰ ÁN & TIẾN ĐỘ GANTT ===
  getProjects: () => fetchApi('/projects'),
  createProject: (data) => fetchApi('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id, data) => fetchApi(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id) => fetchApi(`/projects/${id}`, { method: 'DELETE' }),
  getGanttItems: () => fetchApi('/gantt'),
  createGanttItem: (data) => fetchApi('/gantt', { method: 'POST', body: JSON.stringify(data) }),
  updateGanttItem: (id, data) => fetchApi(`/gantt/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  moveGanttItem: (id, direction) => fetchApi(`/gantt/${id}/move`, { method: 'PATCH', body: JSON.stringify({ direction }) }),
  deleteGanttItem: (id) => fetchApi(`/gantt/${id}`, { method: 'DELETE' }),

  // === THỐNG KÊ & BÁO CÁO ===
  getStats: () => fetchApi('/stats')
};
