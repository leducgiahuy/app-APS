import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getCurrentUser } from '../auth/authSession';
import { isTaskAssignedTo, resolveEmployee } from '../auth/personalWork';
import { getGanttTaskCode } from '../../utils/taskCode';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Search, Users } from 'lucide-react';
import './WorkloadPage.css';

const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const monthKey = todayKey.slice(0, 7);
const hoursPerTaskDay = (task) => {
  const daily = Number(task.estimatedHoursPerDay);
  if (daily > 0) return daily;
  const total = Number(task.estimatedHours) || 0;
  const duration = Number(task.estimatedDays) || 1;
  return total / duration;
};
const dayKey = (year, monthIndex, day) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const formatHours = (value) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function tasksAssignedTo(tasks, employeeId, start, end) {
  return tasks.flatMap(task => {
    const assignments = Array.isArray(task.assignees) && task.assignees.length
      ? task.assignees
      : [{
        employeeId: task.employeeId,
        employeeName: task.employeeName,
        startDate: task.startDate,
        endDate: task.endDate
      }];
    return assignments
      .filter(assignment =>
        assignment.employeeId === employeeId &&
        (assignment.startDate || task.startDate) <= end &&
        (assignment.endDate || task.endDate) >= start
      )
      .map(assignment => ({
        ...task,
        employeeId: assignment.employeeId,
        employeeName: assignment.employeeName || task.employeeName,
        startDate: assignment.startDate || task.startDate,
        endDate: assignment.endDate || task.endDate,
        estimatedHoursPerDay: Number(assignment.estimatedHoursPerDay) || Number(task.estimatedHoursPerDay)
      }));
  });
}

function workdayWeight(key) {
  const day = new Date(`${key}T12:00:00`).getDay();
  if (day === 0) return 0;
  if (day === 6) return 0.5;
  return 1;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function taskOccursOn(task, key) {
  return task.startDate <= key && task.endDate >= key;
}

function hoursForPeriod(tasks, employeeId, start, end) {
  return tasksAssignedTo(tasks, employeeId, start, end)
    .filter(task => task.status !== 'cancelled')
    .reduce((sum, task) => {
      const overlapStart = task.startDate > start ? task.startDate : start;
      const overlapEnd = task.endDate < end ? task.endDate : end;
      let activeDays = 0;
      for (let cursor = new Date(`${overlapStart}T12:00:00`), last = new Date(`${overlapEnd}T12:00:00`); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        activeDays += workdayWeight(key);
      }
      return sum + hoursPerTaskDay(task) * activeDays;
    }, 0);
}

function periodCapacity(employee, start, end) {
  const dailyCapacity = Number(employee.standardHours) || 8;
  let count = 0;
  for (let cursor = new Date(`${start}T12:00:00`), last = new Date(`${end}T12:00:00`); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    count += workdayWeight(key);
  }
  return dailyCapacity * count;
}

function taskActivityForDay(task, employee, dateKey, now) {
  const sessions = (task.workSessions || []).filter(session => session.employeeId === employee.id && session.date === dateKey);
  let actualHours = sessions.reduce((sum, session) => sum + (Number(session.hours) || 0), 0);
  const activeStart = Date.parse(task.workSessionStartedAt || '');
  const activeDate = Number.isFinite(activeStart)
    ? `${new Date(activeStart).getFullYear()}-${String(new Date(activeStart).getMonth() + 1).padStart(2, '0')}-${String(new Date(activeStart).getDate()).padStart(2, '0')}`
    : '';
  const isRunning = employee.activeTaskId === task.id && employee.isOnSite && !employee.isOnBreak && activeDate === dateKey;
  if (isRunning) actualHours += Math.max(0, (now.getTime() - activeStart) / 3600000);
  return {
    actualHours: Math.round(actualHours * 100) / 100,
    hasActualLog: sessions.length > 0 || isRunning,
    isRunning,
    sessions
  };
}

function sessionTimeLabel(session) {
  const start = new Date(session.startAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const end = new Date(session.endAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${start}–${end}`;
}

function formatDayHeading(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  const weekday = date.toLocaleDateString('vi-VN', { weekday: 'long' });
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${weekday}, ${day}/${month}/${date.getFullYear()}`;
}

function allocationTone(allocated, capacity) {
  if (!capacity || allocated === 0) return 'empty';
  if (allocated > capacity) return 'over';
  if (allocated >= capacity * 0.85) return 'full';
  return 'available';
}

function actualHoursForPeriod(tasks, employee, start, end, now) {
  if (!employee) return 0;
  return tasks.filter(task => isTaskAssignedTo(task, employee)).reduce((sum, task) => {
    const sessions = (task.workSessions || []).filter(session => session.employeeId === employee.id && session.date >= start && session.date <= end);
    const logged = sessions.reduce((total, session) => total + (Number(session.hours) || 0), 0);
    const startedAt = Date.parse(task.workSessionStartedAt || '');
    const startedDate = Number.isFinite(startedAt) ? dayKey(new Date(startedAt).getFullYear(), new Date(startedAt).getMonth(), new Date(startedAt).getDate()) : '';
    const running = employee.activeTaskId === task.id && employee.isOnSite && !employee.isOnBreak && startedDate >= start && startedDate <= end
      ? Math.max(0, (now.getTime() - startedAt) / 3600000)
      : 0;
    return sum + logged + running;
  }, 0);
}

export default function WorkloadPage() {
  const { employees, tasks, ganttItems, currentTime, setActiveTab, selectDate } = useApp();
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const personalEmployee = isAdmin ? null : resolveEmployee(currentUser, employees);
  const [period, setPeriod] = useState('day');
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [selectedMonth, setSelectedMonth] = useState(monthKey);
  const [selectedYear, setSelectedYear] = useState(String(today.getFullYear()));
  const [search, setSearch] = useState('');
  const datePickerRef = useRef(null);
  const tableScrollRef = useRef(null);

  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return undefined;
    const scrollHorizontally = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxScroll = container.scrollWidth - container.clientWidth;
      const nextScroll = Math.max(0, Math.min(maxScroll, container.scrollLeft + event.deltaY));
      if (nextScroll === container.scrollLeft) return;
      event.preventDefault();
      container.scrollLeft = nextScroll;
    };
    container.addEventListener('wheel', scrollHorizontally, { passive: false });
    return () => container.removeEventListener('wheel', scrollHorizontally);
  }, [period]);

  const normalizedEmployees = useMemo(() => isAdmin
    ? employees.filter(employee => `${employee.name} ${employee.code} ${employee.team || ''}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    : personalEmployee ? [personalEmployee] : [], [employees, search, isAdmin, personalEmployee]);
  const scopedTasks = useMemo(() => isAdmin ? tasks : tasks.filter(task => isTaskAssignedTo(task, personalEmployee)), [tasks, isAdmin, personalEmployee]);

  const columns = useMemo(() => {
    if (period === 'day') return [{ key: selectedDay, label: new Date(`${selectedDay}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }), start: selectedDay, end: selectedDay }];
    if (period === 'month') {
      const count = daysInMonth(selectedMonth);
      const [year, month] = selectedMonth.split('-').map(Number);
      return Array.from({ length: count }, (_, index) => {
        const key = dayKey(year, month - 1, index + 1);
        return { key, label: String(index + 1), start: key, end: key, weekday: new Date(`${key}T12:00:00`).getDay() };
      });
    }
    const year = Number(selectedYear) || today.getFullYear();
    return monthNames.map((label, index) => {
      const month = `${year}-${String(index + 1).padStart(2, '0')}`;
      return { key: month, label: label.replace('Tháng ', 'T'), start: `${month}-01`, end: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
    });
  }, [period, selectedDay, selectedMonth, selectedYear]);

  const rows = useMemo(() => normalizedEmployees.map(employee => ({
    employee,
    cells: columns.map(column => {
      if (period !== 'day') {
        const capacity = periodCapacity(employee, column.start, column.end);
        const allocated = hoursForPeriod(scopedTasks, employee.id, column.start, column.end);
        return { capacity, allocated, remaining: Math.max(0, capacity - allocated), overflow: Math.max(0, allocated - capacity), tasks: tasksAssignedTo(scopedTasks, employee.id, column.start, column.end).filter(task => task.status !== 'cancelled') };
      }
      const capacity = (Number(employee.standardHours) || 8) * workdayWeight(column.key);
      const matchingTasks = tasksAssignedTo(scopedTasks, employee.id, column.key, column.key)
        .filter(task => task.status !== 'cancelled' && taskOccursOn(task, column.key));
      const allocated = matchingTasks.reduce((sum, task) => sum + hoursPerTaskDay(task), 0);
      return { capacity, allocated, remaining: Math.max(0, capacity - allocated), overflow: Math.max(0, allocated - capacity), tasks: matchingTasks };
    })
  })), [normalizedEmployees, columns, period, scopedTasks]);

  const summary = useMemo(() => rows.reduce((result, row) => {
    row.cells.forEach(cell => {
      result.capacity += cell.capacity;
      result.allocated += cell.allocated;
      result.remaining += cell.remaining;
      if (cell.remaining > 0) result.peopleWithAvailability.add(row.employee.id);
      if (cell.overflow > 0) result.overloaded += 1;
    });
    return result;
  }, { capacity: 0, allocated: 0, remaining: 0, overloaded: 0, peopleWithAvailability: new Set() }), [rows]);

  const shiftPeriod = (direction) => {
    if (period === 'day') {
      const date = new Date(`${selectedDay}T12:00:00`);
      date.setDate(date.getDate() + direction);
      setSelectedDay(dayKey(date.getFullYear(), date.getMonth(), date.getDate()));
    } else if (period === 'month') {
      const date = new Date(`${selectedMonth}-15T12:00:00`);
      date.setMonth(date.getMonth() + direction);
      setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    } else {
      setSelectedYear(String((Number(selectedYear) || today.getFullYear()) + direction));
    }
  };

  const periods = isAdmin
    ? [['day', 'Ngày'], ['month', 'Tháng'], ['year', 'Năm']]
    : [['day', 'Ngày của tôi'], ['month', 'Tháng của tôi'], ['year', 'Năm của tôi']];
  const effectiveYear = String(Number(selectedYear) || today.getFullYear());
  const effectiveMonth = /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : monthKey;
  const selectedStart = period === 'day' ? selectedDay : period === 'month' ? `${effectiveMonth}-01` : `${effectiveYear}-01-01`;
  const selectedEnd = period === 'day' ? selectedDay : period === 'month' ? `${effectiveMonth}-${String(daysInMonth(effectiveMonth)).padStart(2, '0')}` : `${effectiveYear}-12-31`;
  const personalActualHours = actualHoursForPeriod(scopedTasks, personalEmployee, selectedStart, selectedEnd, currentTime);
  const personalProjects = personalEmployee ? [...new Map(scopedTasks.filter(task => task.status !== 'cancelled' && task.startDate <= selectedEnd && task.endDate >= selectedStart).map(task => [task.projectId || task.projectName || 'unassigned', task])).entries()].map(([projectKey, projectTask]) => {
    const projectTasks = scopedTasks.filter(task => (task.projectId || task.projectName || 'unassigned') === projectKey && task.status !== 'cancelled' && task.startDate <= selectedEnd && task.endDate >= selectedStart);
    const completed = projectTasks.filter(task => task.status === 'completed').length;
    const progress = projectTasks.length ? Math.round(projectTasks.reduce((total, task) => total + (task.status === 'completed' ? 100 : Number(task.progress) || 0), 0) / projectTasks.length) : 0;
    return { key: projectKey, name: projectTask.projectName || 'Chưa gắn công trình', tasks: projectTasks.length, completed, progress, planned: hoursForPeriod(projectTasks, personalEmployee.id, selectedStart, selectedEnd), actual: actualHoursForPeriod(projectTasks, personalEmployee, selectedStart, selectedEnd, currentTime) };
  }) : [];

  return (
    <section className="workload-page">
      {!isAdmin && !personalEmployee && <div className="workload-personal-empty">Tài khoản chưa được liên kết với hồ sơ nhân sự. Hãy nhờ quản trị viên chọn đúng hồ sơ tại mục <b>Tài khoản → Quản lý user → Nhân sự liên kết</b> để xem công việc cá nhân.</div>}

      <div className="workload-sticky-controls">
      <div className="workload-toolbar">
        <div className="workload-period-switch" role="tablist" aria-label="Khoảng thời gian">
          {periods.map(([value, label]) => <button type="button" key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}
        </div>
        <div className="workload-period-picker">
          <button type="button" className="workload-icon-button" onClick={() => shiftPeriod(-1)} aria-label="Khoảng thời gian trước"><ChevronLeft size={18} /></button>
          {period === 'day' && <>
            <button type="button" className="workload-date-button" onClick={() => datePickerRef.current?.showPicker ? datePickerRef.current.showPicker() : datePickerRef.current?.click()}>
              <CalendarDays size={16} /><span>{formatDayHeading(selectedDay)}</span>
            </button>
            <input ref={datePickerRef} className="workload-date-picker-input" aria-label="Chọn ngày" type="date" value={selectedDay} onChange={event => setSelectedDay(event.target.value)} />
          </>}
          {period === 'month' && <input aria-label="Chọn tháng" type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} />}
          {period === 'year' && <input aria-label="Chọn năm" type="number" min="2000" max="2100" value={selectedYear} onChange={event => setSelectedYear(event.target.value)} />}
          <button type="button" className="workload-icon-button" onClick={() => shiftPeriod(1)} aria-label="Khoảng thời gian tiếp"><ChevronRight size={18} /></button>
        </div>
        <div className="workload-toolbar-actions">
          {isAdmin && <label className="workload-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm nhân viên, mã, đội..." /></label>}
          {isAdmin && <button type="button" className="workload-assign-button" onClick={() => setActiveTab('tasks')}>Phân công công việc <ArrowRight size={17} /></button>}
        </div>
      </div>

      <div className="workload-summary-grid">
        {!isAdmin && <>
          <article className="workload-summary-card"><span><Clock3 size={17} /> Giờ làm đã ghi nhận</span><strong>{formatHours(personalActualHours)}<small> giờ</small></strong><em>Tổng giờ thực tế trong kỳ đã chọn</em></article>
          <article className="workload-summary-card"><span><CalendarDays size={17} /> Giờ công việc dự kiến</span><strong>{formatHours(summary.allocated)}<small> giờ</small></strong><em>Định mức cá nhân {formatHours(summary.capacity)} giờ trong kỳ</em></article>
          <article className="workload-summary-card"><span><Users size={17} /> Khả năng nhận thêm</span><strong>{formatHours(summary.remaining)}<small> giờ trống</small></strong><em>{personalProjects.length} công trình trong kỳ</em></article>
        </>}
        {isAdmin && <>
          <article className="workload-summary-card"><span><Users size={17} /> Nhân viên còn giờ trống</span><strong>{summary.peopleWithAvailability.size}<small> / {rows.length}</small></strong><em>{formatHours(summary.remaining)} giờ công suất chưa phân bổ</em></article>
          <article className="workload-summary-card"><span><Clock3 size={17} /> Giờ đã lên lịch</span><strong>{formatHours(summary.allocated)}<small> giờ</small></strong><em>Tổng định mức {formatHours(summary.capacity)} giờ trong kỳ</em></article>
          <article className={`workload-summary-card ${summary.overloaded ? 'has-overload' : ''}`}><span><CalendarDays size={17} /> Tình trạng phân bổ</span><strong>{summary.overloaded}<small> nhân viên/kỳ quá định mức</small></strong><em>{summary.overloaded ? 'Cần xem lại lịch phân công' : 'Chưa phát hiện phân bổ vượt định mức'}</em></article>
        </>}
      </div>
      </div>

      <div className="workload-table-card">
        <div className="workload-table-heading"><div><h2>Bảng phân bổ giờ</h2><p>{period === 'day' ? 'Chi tiết công việc trong ngày đã chọn' : period === 'month' ? 'Mỗi cột là một ngày trong tháng' : 'Tổng giờ phân bổ theo từng tháng'}</p></div><span className="workload-unit-note">Thứ 2–6 đủ ngày · sáng Thứ 7</span></div>
        <div className="workload-table-scroll" ref={tableScrollRef}>
          <table className={`workload-table ${period}`}>
            <thead><tr><th className="workload-employee-column">{isAdmin ? 'Nhân viên' : 'Thông tin của tôi'}</th>{columns.map(column => <th key={column.key} className={period === 'month' && (column.weekday === 0 || column.weekday === 6) ? 'weekend' : ''}>{period === 'day' ? 'Phân bổ trong ngày' : column.label}</th>)}{period === 'day' && <th className="workload-detail-column">Công việc trong ngày</th>}</tr></thead>
            <tbody>
              {rows.map(({ employee, cells }) => {
                return <tr key={employee.id}>
                  <th className="workload-employee-column"><div className="workload-employee-cell"><span className="workload-avatar">{employee.name?.slice(0, 1) || '?'}</span><span className="workload-employee-info"><strong>{isAdmin ? employee.name : 'Của tôi · ' + employee.name}</strong><small>{isAdmin ? `${employee.code} · ${employee.team || employee.title || 'Nhân viên'}` : `${employee.code} · ${employee.title || employee.team || 'Nhân sự APS'}`}</small></span></div></th>
                  {cells.map((cell, index) => {
                    const tone = allocationTone(cell.allocated, cell.capacity);
                    const percent = cell.capacity ? Math.min(100, cell.allocated / cell.capacity * 100) : 0;
                    return <td key={columns[index].key} className={`${tone} ${period === 'month' && (columns[index].weekday === 0 || columns[index].weekday === 6) ? 'weekend' : ''}`} title={cell.tasks.map(task => `${task.title} · ${formatHours(hoursPerTaskDay(task))}h/ngày`).join('\n') || 'Chưa có công việc được lên lịch'}>
                      <div className="workload-cell-hours"><strong>{formatHours(cell.allocated)}</strong><span>/{formatHours(cell.capacity)}h</span></div>
                      <div className="workload-meter"><span style={{ width: `${percent}%` }} /></div>
                      {period === 'day' && <small className={`workload-free-label ${cell.overflow ? 'over' : ''}`}>{cell.overflow ? `Vượt ${formatHours(cell.overflow)}h` : cell.remaining ? `Có thể phân công thêm ${formatHours(cell.remaining)}h` : 'Đủ định mức'}</small>}
                      {period !== 'day' && <small className="workload-free-label">{cell.tasks.length} công việc · trống {formatHours(cell.remaining)}h</small>}
                    </td>;
                  })}
                  {period === 'day' && <td className="workload-detail-column">
                    {cells[0].tasks.length ? <div className="workload-day-task-list">{cells[0].tasks.map(task => {
                      const activity = taskActivityForDay(task, employee, selectedDay, currentTime);
                      const planned = hoursPerTaskDay(task);
                      const taskCode = getGanttTaskCode(task, ganttItems);
                      return <article className="workload-day-task" key={task.id}>
                        <div className="workload-day-task-top"><strong>{taskCode && <span className="workload-task-code">{taskCode}</span>}{task.title}</strong><span>{activity.hasActualLog ? `${formatHours(activity.actualHours)}h thực tế` : `${formatHours(planned)}h dự kiến`}</span></div>
                        <small>{task.projectName || 'Chưa gắn dự án'} · {task.phase || 'Công việc được giao'}</small>
                        {activity.sessions.map(session => <small className="workload-session-time" key={session.id}>{sessionTimeLabel(session)} · {formatHours(Number(session.hours) || 0)}h đã làm</small>)}
                        {activity.isRunning && <small className="workload-session-time running">Đang làm · {formatHours(activity.actualHours)}h tính đến hiện tại</small>}
                        {!activity.hasActualLog && <small className="workload-no-log">Chưa có nhật ký giờ thực tế cho ngày này</small>}
                      </article>;
                    })}</div> : <div className="workload-no-tasks"><strong>Chưa có task được giao trong ngày này</strong><span>Còn {formatHours(cells[0].remaining)} giờ định mức có thể phân công.</span></div>}
                    {cells[0].remaining > 0 && <button type="button" className="workload-propose-button" onClick={() => { selectDate(new Date(`${selectedDay}T12:00:00`)); setActiveTab('tasks'); }}>{isAdmin ? 'Đề xuất giao thêm' : 'Xem công việc của tôi'} · còn {formatHours(cells[0].remaining)}h trống</button>}
                  </td>}
                </tr>;
              })}
              {rows.length === 0 && <tr><td className="workload-empty" colSpan={columns.length + (period === 'day' ? 2 : 1)}>Không tìm thấy nhân viên phù hợp.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {!isAdmin && period !== 'day' && personalEmployee && <section className="workload-personal-projects">
        <div className="workload-personal-projects-heading"><div><h2>Công trình trong {period === 'month' ? 'tháng' : 'năm'} của tôi</h2><p>Tổng hợp giờ dự kiến, giờ đã ghi nhận và task được giao trong kỳ.</p></div><span>{personalProjects.length} công trình</span></div>
        {personalProjects.length ? <div className="workload-project-list">{personalProjects.map(project => <article key={project.key} className="workload-project-card">
          <div className="workload-project-title"><strong>{project.name}</strong><span>{project.completed}/{project.tasks} task hoàn thành</span></div>
          <div className="workload-project-progress"><span style={{ width: `${project.progress}%` }} /></div>
          <div className="workload-project-metrics"><span><b>{formatHours(project.actual)}h</b> đã làm</span><span><b>{formatHours(project.planned)}h</b> dự kiến</span><span><b>{project.progress}%</b> tiến độ task</span></div>
        </article>)}</div> : <div className="workload-personal-empty">Bạn chưa được giao công việc nào trong kỳ này.</div>}
      </section>}
    </section>
  );
}
