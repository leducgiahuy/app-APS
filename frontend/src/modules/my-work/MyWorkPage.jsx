import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, CalendarClock, Eye, Inbox, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getCurrentUser } from '../auth/authSession';
import { deliveryApi } from '../gantt/deliveryApi';
import { isTaskAssignedTo, resolveEmployee } from '../auth/personalWork';
import { formatDateVi } from '../../utils/date';
import { localDateKey, matchesEmployee } from '../../utils/shift';
import { buildMyWorkItems, myWorkSummary } from './myWork';
import './MyWorkPage.css';

// Ngày bắt đầu của chính người dùng: ưu tiên khoảng phân công riêng, sau đó mới tới ngày của task.
function assignmentStartFor(task, employee) {
  const assignment = (task.assignees || []).find(entry => matchesEmployee(entry, employee));
  return String(assignment?.startDate || task.startDate || '').slice(0, 10);
}

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'urgent', label: 'Quá hạn / hôm nay' },
  { value: 'upcoming', label: 'Sắp đến hạn' },
  { value: 'following', label: 'Theo dõi' },
];

export default function MyWorkPage() {
  const { tasks, employees, projects, currentTime, setActiveTab, selectDate, goToToday, refreshAllData, loading, setActiveTask, showToast } = useApp();
  const [filter, setFilter] = useState('all');
  const [user] = useState(() => getCurrentUser());
  const myEmployee = useMemo(() => resolveEmployee(user, employees), [user, employees]);
  const todayKey = localDateKey(currentTime);
  const [workflow, setWorkflow] = useState({ revision: 0, notifications: [] });
  const taskItems = useMemo(
    () => buildMyWorkItems({ tasks, employees, projects, now: currentTime, user }),
    [tasks, employees, projects, currentTime, user]
  );
  useEffect(() => {
    let active = true;
    const load = () => deliveryApi.notifications()
      .then(response => { if (active) setWorkflow(response.data || { revision: 0, notifications: [] }); })
      .catch(() => {});
    load();
    const timer = window.setInterval(load, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const items = useMemo(() => {
    const workflowItems = (workflow.notifications || []).map(notification => {
      const title = String(notification.title || 'Việc cần xử lý');
      const normalized = title.toLocaleLowerCase('vi');
      const bucket = /quá hạn|chờ duyệt quá|bất thường/.test(normalized)
        ? 'urgent'
        : /dưới 24|dưới 72|sắp|trước \d/.test(normalized) ? 'upcoming' : 'following';
      return {
        id: `workflow:${notification.id}`,
        recordId: notification.id,
        type: 'workflow',
        title,
        projectId: notification.projectId || '',
        projectName: projects.find(project => project.id === notification.projectId)?.name || 'Toàn công ty',
        dueAt: String(notification.at || '').slice(0, 10),
        bucket,
        dueLabel: bucket === 'urgent' ? 'Cần xử lý ngay' : bucket === 'upcoming' ? 'Sắp đến hạn' : 'Theo dõi',
        page: notification.page === 'finance' ? 'director-overview' : notification.page || 'director-overview',
        readAt: notification.readAt,
      };
    });
    return [...workflowItems, ...taskItems].sort((left, right) => {
      const rank = { urgent: 0, upcoming: 1, following: 2 };
      return rank[left.bucket] - rank[right.bucket]
        || (left.dueAt || '9999-12-31').localeCompare(right.dueAt || '9999-12-31');
    });
  }, [workflow.notifications, taskItems, projects]);
  const summary = useMemo(() => myWorkSummary(items), [items]);
  const visibleItems = filter === 'all' ? items : items.filter(item => item.bucket === filter);

  const openItem = async (item) => {
    if (item.type === 'workflow') {
      try {
        await deliveryApi.mutateOperations({ action: 'notificationRead', id: item.recordId, revision: workflow.revision });
        const response = await deliveryApi.notifications();
        setWorkflow(response.data || { revision: workflow.revision, notifications: [] });
      } catch {
        // Điều hướng vẫn tiếp tục; lần đồng bộ kế tiếp sẽ cập nhật trạng thái đã đọc.
      }
      if (item.page === 'gantt') sessionStorage.setItem('aps_report_link', JSON.stringify({ projectId: item.projectId, tab: 'gantt' }));
      setActiveTab(item.page);
      return;
    }
    const openTaskDetail = () => {
      sessionStorage.setItem('aps-focus-task-id', item.recordId);
      const selectedKey = todayKey >= item.startDate && (!item.dueAt || todayKey <= item.dueAt)
        ? todayKey
        : item.startDate || item.dueAt;
      if (selectedKey) {
        const [year, month, day] = selectedKey.split('-').map(Number);
        selectDate(new Date(year, month - 1, day));
      }
      setActiveTab('tasks');
    };

    const task = tasks.find(record => record.id === item.recordId);
    // Quản trị viên theo dõi việc của người khác: chỉ mở chi tiết, không bắt đầu thay họ.
    if (!task || !myEmployee || !isTaskAssignedTo(task, myEmployee)) {
      openTaskDetail();
      return;
    }

    const startKey = assignmentStartFor(task, myEmployee);
    if (startKey && todayKey < startKey) {
      showToast(`Task “${task.title}” bắt đầu từ ${formatDateVi(startKey)}. Chưa đến ngày thực hiện.`, 'info');
      return;
    }

    if (myEmployee.activeTaskId === task.id && myEmployee.isOnSite && !myEmployee.isOnBreak) {
      openTaskDetail();
      return;
    }

    if (!myEmployee.isOnSite || myEmployee.isOnBreak) {
      // Chọn sẵn task rồi chuyển sang Thành viên để người dùng vào ca/tiếp tục; đồng hồ chỉ chạy sau bước đó.
      if (myEmployee.activeTaskId !== task.id && !(await setActiveTask(myEmployee.id, task.id, myEmployee.shiftType || 'regular'))) return;
      sessionStorage.setItem('aps-focus-employee-id', myEmployee.id);
      goToToday();
      setActiveTab('hr');
      showToast(myEmployee.isOnBreak
        ? 'Đã chọn task. Bạn đang tạm nghỉ — nhấn “Tiếp tục” để bắt đầu tính giờ.'
        : 'Đã chọn task. Nhấn “Vào văn phòng” để bắt đầu tính giờ.', 'info');
      return;
    }

    if (myEmployee.activeTaskId && myEmployee.activeTaskId !== task.id) {
      const currentTitle = myEmployee.activeTaskTitle || tasks.find(record => record.id === myEmployee.activeTaskId)?.title || 'task hiện tại';
      if (!window.confirm(`Bạn đang làm “${currentTitle}”. Tạm dừng task này và chuyển sang “${task.title}”?`)) return;
    }
    if (await setActiveTask(myEmployee.id, task.id, myEmployee.shiftType || 'regular')) openTaskDetail();
  };

  return (
    <div className="my-work-page">
      <section className="my-work-summary" aria-label="Tổng hợp việc của tôi">
        <button type="button" className={filter === 'urgent' ? 'is-selected urgent' : 'urgent'} onClick={() => setFilter('urgent')}>
          <span>Quá hạn / hôm nay</span><strong>{summary.urgent}</strong>
        </button>
        <button type="button" className={filter === 'upcoming' ? 'is-selected upcoming' : 'upcoming'} onClick={() => setFilter('upcoming')}>
          <span>Sắp đến hạn</span><strong>{summary.upcoming}</strong>
        </button>
        <button type="button" className={filter === 'following' ? 'is-selected following' : 'following'} onClick={() => setFilter('following')}>
          <span>Theo dõi</span><strong>{summary.following}</strong>
        </button>
      </section>

      <section className="my-work-card">
        <div className="my-work-table" role="table" aria-label="Danh sách việc cần xử lý">
          <div className="my-work-row my-work-head" role="row">
            <span role="columnheader">Hạn</span>
            <span role="columnheader">Việc</span>
            <span role="columnheader">Dự án</span>
            <span role="columnheader" className="my-work-header-actions">
              <button type="button" className="my-work-reload" onClick={refreshAllData} disabled={loading} title="Đồng bộ dữ liệu mới nhất">
                <RefreshCw className={loading ? 'is-spinning' : ''} size={16} />
                Tải lại
              </button>
              <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Lọc việc theo hạn">
                {FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </span>
          </div>
          {visibleItems.map(item => {
            const isCurrent = item.type === 'task' && myEmployee?.activeTaskId === item.recordId && myEmployee.isOnSite && !myEmployee.isOnBreak;
            return (
              <div className="my-work-row" role="row" key={item.id}>
                <span role="cell"><span className={`my-work-due ${item.bucket}`}>{item.dueLabel}</span></span>
                <span role="cell" className={`my-work-title ${item.readAt ? 'is-read' : ''}`}>
                  <BriefcaseBusiness size={15} />{item.title}
                  {item.delivery && (
                    <span className={`my-work-status level-${item.delivery.level}`} title="Trạng thái theo trang Dự án">
                      {item.delivery.level}% · {item.delivery.label}{item.delivery.awaitingConfirmation ? ' · chờ xác nhận' : ''}
                    </span>
                  )}
                  {isCurrent && <span className="my-work-status is-current">Đang tính giờ</span>}
                </span>
                <span role="cell" className="my-work-project">{item.projectName}</span>
                <span role="cell"><button type="button" className="my-work-action" onClick={() => openItem(item)}>{isCurrent ? 'Mở' : 'Làm'} <ArrowRight size={14} /></button></span>
              </div>
            );
          })}
          {!visibleItems.length && (
            <div className="my-work-empty">
              <Inbox size={30} />
              <strong>Chưa có việc trong nhóm này</strong>
              <span>Dữ liệu sẽ tự cập nhật khi có công việc mới hoặc ngày hạn thay đổi.</span>
            </div>
          )}
        </div>

        <footer>
          <span><CalendarClock size={15} /> Quá hạn được ưu tiên trước; quá 2 ngày cần báo cấp trên.</span>
          <span><Eye size={15} /> Dùng cùng dữ liệu công việc hiện tại.</span>
        </footer>
      </section>
    </div>
  );
}
