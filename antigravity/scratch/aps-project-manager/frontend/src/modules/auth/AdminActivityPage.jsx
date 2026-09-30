import { useEffect, useMemo, useState } from 'react';
import { Activity, Download, LogIn, Search, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';
import { clearActivityLog, clearSharedActivityLog, fetchSharedActivityLog, getActivityLog, getCurrentUser, getUsers, recordActivity } from './authSession';
import './AdminActivityPage.css';

const ACTION_LABELS = {
  'auth.login': 'Đăng nhập',
  'auth.logout': 'Đăng xuất',
  'auth.login.failed': 'Đăng nhập thất bại',
  'profile.update': 'Cập nhật hồ sơ',
  'password.change': 'Đổi mật khẩu',
  'password.reset': 'Cấp lại mật khẩu',
  'user.create': 'Tạo tài khoản',
  'user.profile.update': 'Admin sửa hồ sơ user',
  'activity.clear': 'Xóa nhật ký',
  'module.view': 'Mở phân hệ',
  'employee.attendance': 'Cập nhật điểm danh',
  'employee.create': 'Thêm nhân sự',
  'employee.delete': 'Xóa nhân sự',
  'task.create': 'Tạo công việc',
  'task.update': 'Cập nhật công việc',
  'task.delete': 'Xóa công việc',
  'overtime.create': 'Tạo đăng ký tăng ca',
  'overtime.delete': 'Xóa đăng ký tăng ca',
  'project.create': 'Tạo dự án',
  'project.delete': 'Xóa dự án',
  'gantt.create': 'Thêm hạng mục Gantt',
  'gantt.update': 'Sửa hạng mục Gantt',
  'gantt.reorder': 'Sắp xếp hạng mục Gantt',
  'gantt.delete': 'Xóa hạng mục Gantt',
};

/** Gom loại sự kiện để admin lọc nhanh nhật ký theo nhóm công việc. */
function getCategory(action) {
  if (action.startsWith('auth.')) return 'auth';
  if (action.startsWith('user.') || action.startsWith('profile.') || action.startsWith('password.') || action.startsWith('activity.')) return 'accounts';
  if (action === 'module.view') return 'navigation';
  return 'data';
}

/** Trang theo dõi hoạt động chỉ được render từ App khi phiên hiện tại là admin. */
export default function AdminActivityPage() {
  const [events, setEvents] = useState(getActivityLog);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [userEmail, setUserEmail] = useState('all');
  const currentUser = getCurrentUser();
  const users = getUsers();

  // Cập nhật nhật ký nếu có thao tác phát sinh từ tab trình duyệt khác.
  useEffect(() => {
    const refresh = async () => setEvents((await fetchSharedActivityLog()) || getActivityLog());
    window.addEventListener('storage', refresh);
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.clearInterval(timer);
    };
  }, []);

  const todayEvents = useMemo(() => events.filter((event) => new Date(event.timestamp).toDateString() === new Date().toDateString()), [events]);
  const activeUsers = useMemo(() => new Set(events.map((event) => event.email)).size, [events]);
  const signIns = useMemo(() => events.filter((event) => event.action === 'auth.login').length, [events]);
  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCategory = category === 'all' || getCategory(event.action) === category;
      const matchesUser = userEmail === 'all' || event.email === userEmail;
      const searchText = `${event.name} ${event.email} ${event.details} ${ACTION_LABELS[event.action] || event.action}`.toLowerCase();
      return matchesCategory && matchesUser && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [events, query, category, userEmail]);

  /** Xóa nhật ký sau khi admin xác nhận, rồi giữ lại sự kiện xóa để kiểm toán. */
  async function handleClear() {
    if (!window.confirm('Xóa toàn bộ nhật ký hoạt động dùng chung của APS?')) return;
    if (!clearActivityLog(currentUser.email)) return;
    await clearSharedActivityLog();
    recordActivity('activity.clear', 'Admin đã xóa toàn bộ nhật ký hoạt động.', currentUser.email);
    setEvents(getActivityLog());
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
      <div className="activity-hero">
        <div className="activity-hero-copy"><span className="activity-kicker"><ShieldCheck size={15} /> BẢNG ĐIỀU KHIỂN QUẢN TRỊ</span><h2>Nhật ký hoạt động</h2><p>Theo dõi lịch sử đăng nhập và thay đổi trên hệ thống APS.</p></div>
        <div className="activity-hero-mark"><Activity size={36} /><span>ADMIN ONLY</span></div>
      </div>

      <div className="activity-stats">
        <article><span className="activity-stat-icon amber"><Activity size={19} /></span><div><small>TỔNG SỰ KIỆN</small><b>{events.length}</b></div><i>được lưu gần nhất</i></article>
        <article><span className="activity-stat-icon blue"><UsersRound size={19} /></span><div><small>NGƯỜI DÙNG</small><b>{activeUsers}</b></div><i>đã có hoạt động</i></article>
        <article><span className="activity-stat-icon green"><LogIn size={19} /></span><div><small>ĐĂNG NHẬP HÔM NAY</small><b>{todayEvents.filter((event) => event.action === 'auth.login').length}</b></div><i>lượt đăng nhập</i></article>
        <article><span className="activity-stat-icon violet"><UserRound size={19} /></span><div><small>TỔNG LƯỢT ĐĂNG NHẬP</small><b>{signIns}</b></div><i>trong nhật ký</i></article>
      </div>

      <div className="activity-toolbar">
        <label className="activity-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên, email hoặc nội dung..." /></label>
        <select aria-label="Lọc theo nhóm hoạt động" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Tất cả hoạt động</option><option value="auth">Đăng nhập / đăng xuất</option><option value="accounts">Tài khoản và hồ sơ</option><option value="data">Dữ liệu dự án</option><option value="navigation">Truy cập phân hệ</option></select>
        <select aria-label="Lọc theo user" value={userEmail} onChange={(event) => setUserEmail(event.target.value)}><option value="all">Tất cả user</option>{users.map((user) => <option key={user.email} value={user.email}>{user.name}</option>)}</select>
        <button className="activity-export" type="button" onClick={handleExport} disabled={!filteredEvents.length}><Download size={16} /> Xuất CSV</button>
        <button className="activity-clear" type="button" onClick={handleClear} disabled={!events.length}><Trash2 size={16} /> Xóa nhật ký</button>
      </div>

      <div className="activity-list-header"><div><h3>Lịch sử gần đây</h3><p>Hiển thị {filteredEvents.length} / {events.length} sự kiện</p></div><span><i /> Đang theo dõi</span></div>
      {filteredEvents.length ? <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hoạt động</th><th>Chi tiết</th></tr></thead><tbody>
        {filteredEvents.map((event) => <tr key={event.id}><td className="activity-time">{formatDate(event.timestamp)}</td><td><div className="activity-user"><span>{event.name.slice(0, 1).toUpperCase()}</span><div><b>{event.name}</b><small>{event.email}</small></div></div></td><td><span className={`activity-event-pill ${getCategory(event.action)}`}>{ACTION_LABELS[event.action] || event.action}</span><small className="activity-role">{event.role === 'admin' ? 'Admin' : 'User'}</small></td><td className="activity-detail">{event.details || '—'}</td></tr>)}
      </tbody></table></div> : <div className="activity-empty"><Activity size={28} /><b>Chưa tìm thấy hoạt động</b><span>Thử đổi từ khóa hoặc bộ lọc.</span></div>}
      <p className="activity-storage-note">Khi backend hoạt động, nhật ký được chia sẻ giữa các trình duyệt và giữ tối đa 1.000 sự kiện gần nhất. Nếu backend tắt, ứng dụng tạm dùng nhật ký trên trình duyệt.</p>
    </section>
  );
}

/** Định dạng thời điểm theo giờ địa phương để admin đối chiếu hoạt động dễ hơn. */
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
