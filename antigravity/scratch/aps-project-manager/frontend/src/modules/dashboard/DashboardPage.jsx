import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, CalendarDays, Clock3, Search, Send, Users } from 'lucide-react';
import { taskDelayHours } from '../../utils/date';
import './DashboardPage.css';

const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
  : 'Chưa đặt';
const formatHours = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });

export default function DashboardPage() {
  const { projects, tasks, employees, overtimes, ganttItems, currentTime } = useApp();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectListSearch, setProjectListSearch] = useState('');
  const [copiedReport, setCopiedReport] = useState(false);
  const today = localDateKey(currentTime);

  // Project completion is based on its tasks; a project with no tasks is only
  // considered complete when its saved project status explicitly says so.
  const projectReports = useMemo(() => projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id || (!task.projectId && task.projectName === project.name));
    const completeCount = projectTasks.filter((task) => task.status === 'completed').length;
    const progress = projectTasks.length
      ? Math.round(projectTasks.reduce((sum, task) => sum + (task.status === 'completed' ? 100 : Math.min(100, Math.max(0, Number(task.progress) || 0))), 0) / projectTasks.length)
      : Number(project.progress) || 0;
    const complete = project.status === 'completed' || (projectTasks.length > 0 && completeCount === projectTasks.length);
    const remainingDays = project.endDate
      ? Math.ceil((new Date(`${project.endDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
      : null;
    const overdue = !complete && remainingDays !== null && remainingDays < 0;
    const dueSoon = !complete && !overdue && remainingDays !== null && remainingDays <= 7;
    const delayedTasks = projectTasks.filter((task) => task.status !== 'completed' &&
      (task.speedStatus === 'delayed' || taskDelayHours(task, currentTime) > 0)).length;
    const needsReport = !complete && !overdue && delayedTasks > 0;
    const team = new Map();
    const resolveCurrentEmployee = (employeeId, employeeName) => {
      if (employeeId) return employees.find((employee) => employee.id === employeeId) || null;
      const normalizedName = String(employeeName || '').trim().toLocaleLowerCase('vi');
      return normalizedName
        ? employees.find((employee) => String(employee.name || '').trim().toLocaleLowerCase('vi') === normalizedName) || null
        : null;
    };

    projectTasks.forEach((task) => {
      const assignments = Array.isArray(task.assignees) && task.assignees.length
        ? task.assignees
        : [{ employeeId: task.employeeId, employeeName: task.employeeName, startDate: task.startDate }];
      assignments.forEach((assignment) => {
        const employee = resolveCurrentEmployee(assignment.employeeId, assignment.employeeName);
        if (!employee) return;
        const id = employee.id;
        if (!team.has(id)) team.set(id, {
          id,
          name: employee.name || 'Chưa rõ nhân sự',
          hours: 0,
          overtime: 0,
          tracked: false,
          addedLater: Boolean(assignment.startDate && project.startDate && assignment.startDate > project.startDate),
        });
      });

      // Old task totals are attributable only when there is one assignee.
      if (!(task.actualWorkEntries || []).length && assignments.length === 1 && Number(task.actualWorkHours) > 0) {
        const employee = resolveCurrentEmployee(assignments[0].employeeId, assignments[0].employeeName);
        const person = employee ? team.get(employee.id) : null;
        if (person) { person.hours += Number(task.actualWorkHours); person.tracked = true; }
      }
      (task.actualWorkEntries || []).forEach((entry) => {
        const employee = resolveCurrentEmployee(entry.employeeId, entry.employeeName);
        if (!employee) return;
        const id = employee.id;
        const person = team.get(id) || { id, name: employee.name, hours: 0, overtime: 0, tracked: false, addedLater: false };
        person.hours += Number(entry.hours) || 0;
        person.tracked = true;
        team.set(id, person);
      });

      // Display the currently running work session without waiting for checkout.
      const activeEmployee = employees.find((employee) => employee.activeTaskId === task.id && employee.workSessionStartedAt);
      if (activeEmployee) {
        const person = team.get(activeEmployee.id) || { id: activeEmployee.id, name: activeEmployee.name, hours: 0, overtime: 0, tracked: true, addedLater: false };
        person.hours += Math.max(0, (currentTime.getTime() - Date.parse(activeEmployee.workSessionStartedAt)) / 3600000);
        person.tracked = true;
        team.set(person.id, person);
      }
    });

    const projectTaskIds = new Set(projectTasks.map((task) => task.id));
    overtimes.filter((entry) => projectTaskIds.has(entry.taskId) && (!entry.status || entry.status === 'approved')).forEach((entry) => {
      const employee = resolveCurrentEmployee(entry.employeeId, entry.employeeName);
      if (!employee) return;
      const id = employee.id;
      const person = team.get(id) || { id, name: employee.name, hours: 0, overtime: 0, tracked: false, addedLater: false };
      person.overtime += Number(entry.hours) || 0;
      team.set(id, person);
    });

    const projectTaskGanttIds = new Set(projectTasks.map((task) => task.ganttId).filter(Boolean));
    const projectTaskTitles = new Set(projectTasks.map((task) => task.title?.trim().toLowerCase()).filter(Boolean));
    const ganttOnlyProjectItems = ganttItems.filter((item) =>
      (item.projectId === project.id || projectTasks.some((task) => task.ganttId === item.id && task.projectId === project.id)) &&
      !item.isGroup && item.status !== 'holiday' &&
      !projectTaskGanttIds.has(item.id) && !projectTaskTitles.has(item.title?.trim().toLowerCase())
    );
    const plannedHours = [
      ...projectTasks.map((task) => Number(task.estimatedHours) ||
        (Number(task.estimatedHoursPerDay) || 8) * (Number(task.estimatedDays) || 1)),
      ...ganttOnlyProjectItems.map((item) => Number(item.estimatedHours) ||
        (Number(item.estimatedHoursPerDay) || 8) * (Number(item.days) || 1)),
    ].reduce((sum, hours) => sum + hours, 0);

    return {
      ...project,
      tasks: projectTasks,
      completeCount,
      progress,
      complete,
      remainingDays,
      overdue,
      dueSoon,
      delayedTasks,
      needsReport,
      plannedHours,
      team: [...team.values()],
      // Project actual effort comes from task totals; attribution by employee is
      // shown only when individual attendance entries exist.
      actualHours: projectTasks.reduce((sum, task) => sum + (Number(task.actualWorkHours) || 0), 0) +
        employees.filter((employee) => projectTasks.some((task) => task.id === employee.activeTaskId) && employee.workSessionStartedAt)
          .reduce((sum, employee) => sum + Math.max(0, (currentTime.getTime() - Date.parse(employee.workSessionStartedAt)) / 3600000), 0),
    };
  }), [projects, tasks, employees, overtimes, ganttItems, currentTime, today]);

  const selected = projectReports.find((project) => project.id === selectedProjectId) || projectReports[0];
  const visibleProjects = projectReports.filter((project) =>
    [project.name, project.code, project.manager].some((value) => String(value || '').toLocaleLowerCase('vi').includes(projectListSearch.trim().toLocaleLowerCase('vi'))),
  );
  const reportText = (project) => {
    if (!project) return '';
    const status = project.complete ? 'Hoàn thành' : project.overdue ? 'Trễ hạn' : project.needsReport ? 'Trễ tiến độ · Cần báo cáo' : project.dueSoon ? 'Sắp đến hạn' : 'Đang thực hiện';
    const missingHours = project.team.filter((person) => !person.tracked).length;
    return [
      `BÁO CÁO TÌNH HÌNH DỰ ÁN · ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(currentTime)}`,
      `Dự án: ${project.name} (${project.code || 'Chưa có mã'}) · Quản lý: ${project.manager || 'Chưa cập nhật'}`,
      `Trạng thái: ${status} · Tiến độ: ${project.progress}% · Hoàn thành ${project.completeCount}/${project.tasks.length} công việc`,
      `Hạn dự án: ${formatDate(project.endDate)} · Công dự kiến: ${formatHours(project.plannedHours / 8)} công (${formatHours(project.plannedHours)} giờ)`,
      `Nhân sự tham gia: ${project.team.length} · Bổ sung sau khởi công: ${project.team.filter((person) => person.addedLater).length}`,
      `Công thực tế đã dùng: ${formatHours(project.actualHours / 8)} công · OT đã duyệt: ${formatHours(project.team.reduce((sum, person) => sum + person.overtime, 0))} giờ`,
      missingHours ? `Lưu ý: ${missingHours} nhân sự chưa có nhật ký giờ cá nhân.` : '',
    ].filter(Boolean).join('\n');
  };

  const handleCopyReport = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(reportText(selected));
      setCopiedReport(true);
      window.setTimeout(() => setCopiedReport(false), 2000);
    } catch {
      window.alert(reportText(selected));
    }
  };

  return (
    <div className="aps-dashboard">
      <header className="dashboard-heading">
        <div><p className="dashboard-eyebrow">APS VIỆT NAM · BÁO CÁO DỰ ÁN</p><h1>Thống kê & Báo cáo</h1><p className="dashboard-subtitle">Tình trạng, tiến độ và nhân sự tham gia các dự án.</p></div>
        <div className="dashboard-date"><Clock3 size={15} />{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(currentTime)}</div>
      </header>

      <section className="dashboard-card project-overview-layout" aria-label="Tổng quan dự án và chi tiết dự án được chọn">
        <div className="project-overview-left">
          <div className="company-overview-heading"><div><h2>{selected?.name || 'Tổng quan dự án'}</h2><p>Tiến độ và khối lượng dự kiến của dự án</p></div></div>
          <div className="project-overview-chart-area">
            <div className="company-progress-chart" style={{ background: `conic-gradient(var(--dash-accent) 0 ${selected?.progress || 0}%, var(--chart-track) ${selected?.progress || 0}% 100%)` }} role="img" aria-label={`Tiến độ dự án ${selected?.name || ''}: ${selected?.progress || 0}%`}>
              <div><strong>{selected?.progress || 0}%</strong><span>Tiến độ dự án</span></div>
            </div>
            <div className="company-metrics">
              <div className="overview-number"><span>Công dự kiến</span><strong>{formatHours((selected?.plannedHours || 0) / 8)} <small>công</small></strong><em>{formatHours(selected?.plannedHours || 0)} giờ · 8 giờ = 1 công</em></div>
              <div className="overview-number"><span>Công việc hoàn thành</span><strong>{selected?.completeCount || 0}<small>/{selected?.tasks.length || 0}</small></strong><em>{selected?.tasks.length ? `${selected.progress}% tiến độ` : 'Chưa có công việc'}</em></div>
              <div className="overview-number"><span>Tình trạng hạn</span><strong className={selected?.overdue ? 'overview-red' : selected?.dueSoon ? 'overview-gold' : ''}>{selected?.complete ? 'Xong' : selected?.overdue ? 'Quá hạn' : selected?.dueSoon ? 'Sắp hạn' : 'Còn hạn'}</strong><em>{selected?.endDate ? `Hạn ${formatDate(selected.endDate)}` : 'Chưa đặt hạn'}</em></div>
            </div>
          </div>
        </div>

        <div className="project-overview-right">
          {selected ? <>
            <div className="selected-project-heading">
              <div><p className="dashboard-eyebrow">CHI TIẾT DỰ ÁN</p><h2>{selected.name}</h2><p>{selected.code || 'Chưa có mã'} · {selected.manager || 'Chưa cập nhật quản lý'}</p></div>
              <div className="selected-project-actions">
                <button type="button" className="report-share-button" onClick={handleCopyReport}><Send size={14} />{copiedReport ? 'Đã sao chép' : 'Báo cáo'}</button>
              </div>
            </div>
            {(selected.overdue || selected.needsReport || selected.dueSoon) && <div className={`project-alert ${selected.overdue ? 'overdue' : selected.needsReport ? 'delayed' : ''}`}><AlertTriangle size={15} /><span><strong>{selected.overdue ? 'Trễ hạn.' : selected.needsReport ? 'Trễ tiến độ · Cần báo cáo.' : 'Sắp đến hạn.'}</strong> {selected.overdue ? `Quá ${Math.abs(selected.remainingDays)} ngày` : selected.needsReport ? `${selected.delayedTasks} công việc đang chậm` : `Còn ${selected.remainingDays} ngày`} · Hoàn thành {selected.completeCount}/{selected.tasks.length} việc.</span></div>}
            <div className="project-metrics">
              <div><span>Công dự kiến</span><strong>{formatHours(selected.plannedHours / 8)} <small>công</small></strong><em>{formatHours(selected.plannedHours)} giờ · 8h/công</em></div>
              <div><span>Nhân sự tham gia</span><strong>{selected.team.length} <small>người</small></strong><em>{selected.team.filter((person) => person.addedLater).length} bổ sung</em></div>
              <div><span>Tiến độ</span><strong>{selected.progress}<small>%</small></strong><em>{selected.complete ? 'Hoàn thành' : selected.overdue ? 'Trễ hạn' : selected.needsReport ? 'Trễ tiến độ · Cần báo cáo' : 'Đang thực hiện'}</em></div>
              <div><span>Công thực tế</span><strong>{formatHours(selected.actualHours / 8)} <small>công</small></strong><em>{formatHours(selected.actualHours)} giờ đã ghi</em></div>
            </div>
            <div className="team-summary-heading"><div><h3>Nhân sự & giờ công</h3><p>Giờ làm và OT đã duyệt</p></div><div className="hours-legend"><span><i className="regular-key" />Giờ làm</span><span><i className="overtime-key" />OT</span></div></div>
            <div className="employee-report-list compact-team-list">{selected.team.length ? selected.team.map((person) => <div className="employee-report-row" key={person.id}>
              <span className="employee-initial">{person.name.charAt(0)}</span><span className="employee-report-name">{person.name}{person.addedLater && <small>Bổ sung</small>}</span>
              <span className="employee-hour regular-hour">{person.tracked ? `${formatHours(person.hours)}h` : '—'}</span><span className="employee-hour overtime-hour">{formatHours(person.overtime)}h</span>
            </div>) : <div className="dashboard-empty">Chưa có nhân sự được phân công.</div>}</div>
            {selected.team.some((person) => !person.tracked) && <p className="report-data-note">Một số người chưa có nhật ký giờ cá nhân; số giờ chưa được ước đoán.</p>}
            <div className="project-period"><CalendarDays size={14} />{formatDate(selected.startDate)} – {formatDate(selected.endDate)}<span>·</span>{selected.tasks.length - selected.completeCount} việc còn lại</div>
          </> : <div className="dashboard-empty">Chưa có dự án để hiển thị.</div>}
        </div>
      </section>

      {/* Company-wide project directory; selecting a row updates the detail panel above. */}
      <section className="dashboard-card all-projects-card" aria-label="Tất cả dự án của công ty">
        <div className="all-projects-heading">
          <div><h2>Tất cả dự án của công ty</h2><p>{projectReports.length} dự án trong danh mục</p></div>
          <label className="all-projects-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Tìm trong tất cả dự án" placeholder="Tìm theo tên, mã hoặc quản lý..." value={projectListSearch} onChange={(event) => setProjectListSearch(event.target.value)} /></label>
        </div>
        <div className="all-projects-list">
          {visibleProjects.length ? visibleProjects.map((project) => {
            const status = project.complete ? 'completed' : project.overdue ? 'overdue' : project.needsReport ? 'delayed' : project.dueSoon ? 'due-soon' : 'in-progress';
            const statusLabel = project.complete ? 'Hoàn thành' : project.overdue ? 'Quá hạn' : project.needsReport ? 'Cần báo cáo' : project.dueSoon ? 'Sắp đến hạn' : 'Đang thực hiện';
            return <button type="button" className={`all-project-row ${selected?.id === project.id ? 'selected' : ''}`} key={project.id} onClick={() => setSelectedProjectId(project.id)} aria-pressed={selected?.id === project.id}>
              <span className="all-project-name"><strong>{project.name}</strong><small>{project.code || project.manager || 'Chưa cập nhật thông tin'}</small></span>
              <span className="all-project-progress"><span><i style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }} /></span><strong>{project.progress}%</strong></span>
              <span className={`all-project-status ${status}`}>{statusLabel}</span>
              <span className="all-project-deadline">Hạn {formatDate(project.endDate)}</span>
              <span className="all-project-tasks">{project.completeCount}/{project.tasks.length} việc</span>
            </button>;
          }) : <div className="dashboard-empty">{projectReports.length ? 'Không tìm thấy dự án phù hợp.' : 'Chưa có dự án nào trong danh mục.'}</div>}
        </div>
      </section>
    </div>
  );
}
