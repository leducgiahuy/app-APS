import { getCurrentUser } from '../auth/authSession';
import { isTaskAssignedTo, resolveEmployee } from '../auth/personalWork';

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function localDay(value) {
  const key = dateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dueBucket(dueAt, today) {
  const due = localDay(dueAt);
  if (!due) return 'following';
  const days = Math.round((due - today) / DAY_MS);
  if (days <= 0) return 'urgent';
  if (days <= 7) return 'upcoming';
  return 'following';
}

export function formatMyWorkDue(dueAt, now = new Date()) {
  const due = localDay(dueAt);
  if (!due) return 'Chưa có hạn';
  const today = startOfDay(now);
  const days = Math.round((due - today) / DAY_MS);
  if (days < -1) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === -1) return 'Quá hạn 1 ngày';
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Ngày mai';
  if (days <= 7) return due.toLocaleDateString('vi-VN', { weekday: 'long' });
  return due.toLocaleDateString('vi-VN');
}

/**
 * Tạo một hộp việc duy nhất từ dữ liệu phân công hiện có.
 * Quản trị viên theo dõi toàn bộ; tài khoản thường chỉ nhận việc của nhân sự đã liên kết.
 */
export function buildMyWorkItems({ tasks = [], employees = [], projects = [], now = new Date(), user = getCurrentUser() }) {
  const employee = resolveEmployee(user, employees);
  const canSeeAll = user?.role === 'admin';
  const today = startOfDay(now);

  return tasks
    .filter(task => !['completed', 'cancelled'].includes(task.status))
    .filter(task => canSeeAll || isTaskAssignedTo(task, employee))
    .map(task => {
      const project = projects.find(item => item.id === task.projectId);
      const dueAt = dateKey(task.endDate || task.dueAt);
      const bucket = dueBucket(dueAt, today);
      return {
        id: `task:${task.id}`,
        recordId: task.id,
        type: 'task',
        title: [task.code, task.title].filter(Boolean).join(' · '),
        projectId: task.projectId || '',
        projectName: task.projectName || project?.name || '—',
        dueAt,
        startDate: dateKey(task.startDate),
        bucket,
        dueLabel: formatMyWorkDue(dueAt, now),
        priority: task.priority || 'normal',
        assignee: task.employeeName || task.assignees?.map(item => item.employeeName).filter(Boolean).join(', ') || '',
      };
    })
    .sort((left, right) => {
      const leftDue = left.dueAt || '9999-12-31';
      const rightDue = right.dueAt || '9999-12-31';
      return leftDue.localeCompare(rightDue) || left.title.localeCompare(right.title, 'vi');
    });
}

export function myWorkSummary(items = []) {
  return items.reduce((summary, item) => {
    summary[item.bucket] += 1;
    return summary;
  }, { urgent: 0, upcoming: 0, following: 0 });
}
