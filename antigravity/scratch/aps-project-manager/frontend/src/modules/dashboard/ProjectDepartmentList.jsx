import { useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Users } from 'lucide-react';
import './ProjectDepartmentList.css';

const formatNumber = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export default function ProjectDepartmentList({ departments }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const toggle = name => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  if (!departments.length) return <div className="dashboard-empty">Chưa có nhân sự được phân công.</div>;

  return <div className="project-department-list">
    <div className="department-table-header department-table-row">
      <span>Phòng ban / Nhân sự</span><span>Task</span><span>OT</span><span>Công TT</span>
    </div>
    {departments.map(department => {
      const isCollapsed = collapsed.has(department.name);
      return <section className="department-card" key={department.name} aria-label={department.name}>
        <div className="department-table-row department-summary-row">
          <button type="button" className="department-toggle" aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? 'Mở' : 'Đóng'} nhân sự ${department.name}`}
            onClick={() => toggle(department.name)}>
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            <span className="department-icon"><Building2 size={18} aria-hidden="true" /></span>
            <span className="department-heading-text"><span>{department.name}</span>
              <small><Users size={11} aria-hidden="true" />{department.people.length} nhân sự</small>
            </span>
          </button>
          <span><span className="department-task-badge">{department.taskCount}</span></span><span aria-hidden="true" />
          <strong><span className="department-effort-badge">{formatNumber(department.personDays)} công</span></strong>
        </div>
        {!isCollapsed && department.people.map(person => <div className="department-table-row department-person-row" key={person.id}>
          <span className="department-person-name">
            <span className="employee-initial">{person.name.charAt(0)}</span>
            <span className="employee-report-name">{person.name}{person.addedLater && <small>Bổ sung</small>}</span>
          </span>
          <span><span className="person-task-badge">{person.taskCount}</span></span>
          <span className="overtime-hour"><span className={`person-ot-badge ${person.overtime ? 'has-overtime' : ''}`}>{formatNumber(person.overtime)}h</span></span>
          <strong className="regular-hour">{formatNumber(person.personDays)} công</strong>
        </div>)}
      </section>;
    })}
  </div>;
}
