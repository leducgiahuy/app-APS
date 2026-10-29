import { useApp } from '../../context/AppContext';
import MyWorkPage from '../my-work/MyWorkPage';
import HRPage from '../hr/HRPage';
import TasksPage from '../tasks/TasksPage';
import WorkloadPage from '../workload/WorkloadPage';
import './WorkHubPage.css';
import { useVisibleTabs } from '../../context/PageAccessContext';

const SECTIONS = [
  ['my-work', 'Việc của tôi'],
  ['hr', 'Thành Viên'],
  ['tasks', 'Tiến độ'],
  ['workload', 'Quản Lý Nhân Sự']
];

export default function WorkHubPage() {
  const { workHubSection, setWorkHubSection } = useApp();
  // Chỉ hiện mục vai trò được thấy; mục đang mở bị tắt quyền thì chuyển sang mục đầu tiên còn lại.
  const sections = useVisibleTabs(SECTIONS, key => `work-hub.${key}`);
  const section = sections.some(([key]) => key === workHubSection) ? workHubSection : sections[0]?.[0];
  return <div className="work-hub-page">
    <nav className="work-hub-tabs" aria-label="Các mục Công việc">
      {sections.map(([key, label]) => <button type="button" key={key} className={section === key ? 'active' : ''} aria-current={section === key ? 'page' : undefined} onClick={() => setWorkHubSection(key)}>{label}</button>)}
    </nav>
    <div className={`work-hub-content section-${section}`}>
      {section === 'my-work' && <MyWorkPage />}
      {section === 'hr' && <HRPage />}
      {section === 'tasks' && <TasksPage />}
      {section === 'workload' && <WorkloadPage />}
    </div>
  </div>;
}
