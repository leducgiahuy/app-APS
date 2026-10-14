import { useEffect, useMemo, useState } from 'react';
import { Activity, Download, Search, Trash2 } from 'lucide-react';
import { clearActivityLog, clearSharedActivityLog, fetchSharedActivityLog, getActivityLog, getCurrentUser, getUsers, recordActivity } from './authSession';
import './AdminActivityPage.css';

const ACTION_LABELS = {
  'employee.create': 'Thêm nhân sự',
  'employee.delete': 'Xóa nhân sự',
  'task.create': 'Tạo công việc',
  'task.update': 'Cập nhật công việc',
  'task.delete': 'Xóa công việc',
  'overtime.create': 'Tạo đăng ký tăng ca',
  'overtime.delete': 'Xóa đăng ký tăng ca',
  'project.create': 'Tạo dự án',
  'project.update': 'Cập nhật dự án',
  'project.delete': 'Xóa dự án',
  'gantt.create': 'Thêm hạng mục Gantt',
  'gantt.update': 'Sửa hạng mục Gantt',
  'gantt.delete': 'Xóa hạng mục Gantt',
};

const CATEGORY_LABELS = {
  employee: 'Nhân sự',
  task: 'Công việc',
  overtime: 'Tăng ca',
  project: 'Dự án',
  gantt: 'Tiến độ dự án',
};

function getCategory(action) {
  const prefix = action.split('.')[0];
  return Object.hasOwn(CATEGORY_LABELS, prefix) && Object.hasOwn(ACTION_LABELS, action) ? prefix : null;
}

/** Trang theo dõi hoạt động chỉ được render từ App khi phiên hiện tại là admin. */
export default function AdminActivityPage() {
  const pageSize = 50;
  const [events, setEvents] = useState(getActivityLog);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [userEmail, setUserEmail] = useState('all');
  const [page, setPage] = useState(1);
  const currentUser = getCurrentUser();
  const users = getUsers();

  // Cập nhật nhật ký nếu có thao tác phát sinh từ tab trình duyệt khác.
  useEffect(() => {
    const refresh = async () => {
      const sharedEvents = await fetchSharedActivityLog();
      if (!sharedEvents) return;
      setEvents(current => current.length === sharedEvents.length &&
        current.every((event, index) => event.id === sharedEvents[index]?.id)
        ? current
        : sharedEvents);
    };
    window.addEventListener('storage', refresh);
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.clearInterval(timer);
    };
  }, []);

  const importantEvents = useMemo(() => events.filter((event) => getCategory(event.action)), [events]);
  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return importantEvents.filter((event) => {
      const matchesCategory = category === 'all' || getCategory(event.action) === category;
      const matchesUser = userEmail === 'all' || event.email === userEmail;
      const searchText = `${event.name} ${event.email} ${event.details} ${ACTION_LABELS[event.action] || event.action}`.toLowerCase();
      return matchesCategory && matchesUser && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [importantEvents, query, category, userEmail]);
  const pageCount = Math.ceil(filteredEvents.length / pageSize);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const pageEvents = filteredEvents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** Xóa nhật ký sau khi admin xác nhận, rồi giữ lại sự kiện xóa để kiểm toán. */
  async function handleClear() {
    if (!window.confirm('Xóa toàn bộ nhật ký hoạt động dùng chung của APS?')) return;
    if (!clearActivityLog(currentUser.email)) return;
    await clearSharedActivityLog();
    recordActivity('activity.clear', 'Admin đã xóa toàn bộ nhật ký hoạt động.', currentUser.email);
    setEvents(getActivityLog());
    setPage(1);
  }

  /** Tải các sự kiện đang lọc thành CSV để admin lưu hoặc tổng hợp báo cáo. */
  function handleExport() {
    const columns = ['Thời gian', 'Người dùng', 'Email', 'Vai trò', 'Hoạt động', 'Chi tiết'];
    const rows = filteredEvents.map((event) => [
      formatDate(event.timestamp), event.name, event.email, event.role,
      ACTION_LABELS[event.action] || event.action, event.details,
    ]);
    const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const content = `\uFEFF${[columns, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aps-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="activity-page">
      <div className="activity-overview">
        <div className="activity-toolbar">
          <label className="activity-search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm theo tên, email hoặc nội dung..." /></label>
          <select aria-label="Lọc theo loại dữ liệu" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">Tất cả dữ liệu</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="Lọc theo user" value={userEmail} onChange={(event) => { setUserEmail(event.target.value); setPage(1); }}><option value="all">Tất cả user</option>{users.map((user) => <option key={user.email} value={user.email}>{user.name}</option>)}</select>
          <button className="activity-export" type="button" onClick={handleExport} disabled={!filteredEvents.length}><Download size={16} /> Xuất CSV</button>
          <button className="activity-clear" type="button" onClick={handleClear} disabled={!events.length}><Trash2 size={16} /> Xóa nhật ký</button>
        </div>
      </div>

      <div className="activity-list-header"><div><h3>Lịch sử cập nhật dữ liệu</h3><p>Hiển thị {filteredEvents.length} / {importantEvents.length} cập nhật quan trọng</p></div><span><i /> Đang theo dõi</span></div>
      {filteredEvents.length ? <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hoạt động</th><th>Chi tiết</th></tr></thead><tbody>
        {pageEvents.map((event) => <tr key={event.id}><td className="activity-time">{formatDate(event.timestamp)}</td><td><div className="activity-user"><span>{event.name.slice(0, 1).toUpperCase()}</span><div><b>{event.name}</b><small>{event.email}</small></div></div></td><td><span className="activity-event-pill data">{ACTION_LABELS[event.action]}</span><small className="activity-role">{event.role === 'admin' ? 'Admin' : 'User'}</small></td><td className="activity-detail">{event.details || '—'}</td></tr>)}
      </tbody></table></div> : <div className="activity-empty"><Activity size={28} /><b>Chưa có cập nhật dữ liệu</b><span>Các thay đổi quan trọng như thêm nhân sự, tạo công việc hoặc dự án sẽ hiển thị tại đây.</span></div>}
      {filteredEvents.length > 0 && <nav className="activity-pagination" aria-label="Phân trang nhật ký">
        <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>Trước</button>
        <span>Trang {currentPage}/{pageCount}</span>
        <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount}>Sau</button>
      </nav>}
    </section>
  );
}

/** Định dạng thời điểm theo giờ địa phương để admin đối chiếu hoạt động dễ hơn. */
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
