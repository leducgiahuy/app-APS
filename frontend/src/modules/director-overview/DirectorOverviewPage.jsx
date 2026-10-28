import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { deliveryApi } from '../gantt/deliveryApi';
import { capacityWeight } from '../../utils/workforceForecast';
import { summarizePortfolioWork, summarizeProjectWork } from '../../utils/deliveryMetrics';
import './DirectorOverviewPage.css';

const number = value => value == null || !Number.isFinite(Number(value))
  ? '—'
  : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const signed = value => value == null || !Number.isFinite(Number(value))
  ? '—'
  : `${Number(value) > 0 ? '+' : ''}${number(value)}`;

function monthRange(month) {
  const [year, index] = month.split('-').map(Number);
  const first = new Date(year, index - 1, 1);
  const last = new Date(year, index, 0);
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { first: key(first), last: key(last), days: last.getDate() };
}

function assignedHoursInMonth(tasks, month) {
  const range = monthRange(month);
  return tasks.reduce((total, task) => {
    const streams = Array.isArray(task.assignees) && task.assignees.length ? task.assignees : [task];
    return total + streams.reduce((sum, assignment) => {
      const start = assignment.startDate || task.startDate;
      const end = assignment.endDate || task.endDate;
      if (!start || !end || end < range.first || start > range.last) return sum;
      const from = new Date(`${start < range.first ? range.first : start}T12:00:00`);
      const to = new Date(`${end > range.last ? range.last : end}T12:00:00`);
      let weight = 0;
      for (const date = new Date(from); date <= to; date.setDate(date.getDate() + 1)) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        weight += capacityWeight(key);
      }
      const daily = Number(assignment.estimatedHoursPerDay ?? task.estimatedHoursPerDay) || 8;
      return sum + weight * daily;
    }, 0);
  }, 0);
}

function projectWork(project, details, executiveRow) {
  const comparison = summarizeProjectWork(project, details?.taskMetrics);
  return {
    id: project.id,
    name: executiveRow?.name || project.name,
    code: executiveRow?.code || project.code,
    budgeted: comparison.budgetedWork,
    actual: comparison.actualWork,
    forecast: comparison.forecastWork,
    variance: comparison.varianceWork,
    variancePercent: comparison.variancePercent,
    completion: executiveRow?.completion ?? details?.summary?.completion ?? 0,
    planPercent: executiveRow?.planPercent ?? details?.summary?.planPercent ?? 0,
    red: Number(details?.summary?.warnings || 0),
  };
}

export default function DirectorOverviewPage() {
  const { projects, tasks, ganttItems, employees, ganttMonth, setActiveTab } = useApp();
  const month = `${ganttMonth.getFullYear()}-${String(ganttMonth.getMonth() + 1).padStart(2, '0')}`;
  const [report, setReport] = useState(null);
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const sequence = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const response = await deliveryApi.executive(month);
      const projectRows = response.data?.projects || [];
      const detailRows = await Promise.all(projectRows.map(async project => {
        try { return [project.id, (await deliveryApi.get(project.id)).data]; }
        catch { return [project.id, null]; }
      }));
      if (sequence === generation.current) {
        setReport(response.data);
        setDetails(Object.fromEntries(detailRows));
        setError('');
      }
    } catch (failure) {
      if (sequence === generation.current) setError(failure.message);
    } finally {
      if (sequence === generation.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const refresh = () => load(true);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { generation.current += 1; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load, projects, tasks, ganttItems, employees]);

  const role = report?.viewer?.role;
  const mayView = ['director', 'admin'].includes(role) && report?.permissions?.executive;
  const rows = useMemo(() => (report?.projects || []).map(row => {
    const project = projects.find(item => item.id === row.id) || row;
    return projectWork(project, details[row.id], row);
  }), [report?.projects, projects, details]);
  const totals = useMemo(() => {
    const comparison = summarizePortfolioWork(rows.map(row => ({
      budgetedWork: row.budgeted,
      actualWork: row.actual,
      forecastWork: row.forecast,
      remainingWork: Math.max(0, row.forecast - row.actual),
    })));
    return {
      budgeted: comparison.budgetedWork,
      actual: comparison.actualWork,
      forecast: comparison.forecastWork,
      variance: comparison.varianceWork,
      variancePercent: comparison.variancePercent,
      red: rows.reduce((sum, row) => sum + row.red, 0),
    };
  }, [rows]);
  const capacity = useMemo(() => {
    const range = monthRange(month);
    let available = 0;
    for (let day = 1; day <= range.days; day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      available += employees.reduce((sum, employee) => sum + capacityWeight(date) * (Number(employee.standardHours) || 8), 0);
    }
    const assigned = assignedHoursInMonth(tasks, month);
    return available ? assigned / available * 100 : null;
  }, [employees, tasks, month]);
  const overBudget = rows.filter(row => row.variance > 0.05);
  const urgentDocuments = (report?.projects || []).reduce((sum, row) => sum + (row.urgent?.length || 0), 0);

  const openProject = projectId => {
    sessionStorage.setItem('aps_report_link', JSON.stringify({ projectId, tab: 'gantt' }));
    setActiveTab('gantt');
  };
  const openAction = action => {
    if (action.kind === 'capacity') return setActiveTab('workload');
    if (['debt', 'contract', 'payment', 'operation'].includes(action.kind)) {
      return setActiveTab('director-overview');
    }
    sessionStorage.setItem('aps_report_link', JSON.stringify({ projectId: action.projectId, taskId: action.taskId, tab: action.kind === 'document' ? 'legal' : action.kind === 'change' ? 'changes' : 'gantt' }));
    return setActiveTab('gantt');
  };

  return <div className="director-overview">
    <div className="director-overview-toolbar">
      <nav><button className="active">10 số chính</button></nav>
    </div>
    {error && <div className="director-overview-error" role="alert">{error}<button onClick={() => load()}>Thử lại</button></div>}
    {loading && !report && <p className="director-overview-loading">Đang tải số liệu điều hành…</p>}
    {report && !mayView && <section className="director-overview-denied"><BarChart3 size={32} /><h2>Tổng quan</h2><p>Trang này chỉ hiển thị cho vai trò Giám đốc hoặc Quản trị viên.</p></section>}
    {report && mayView && <>
      <section className="director-overview-kpis">
        <article className="danger"><span>Dự án vượt công</span><strong>{overBudget.length} dự án</strong><small>{overBudget.length ? `Vượt ${number(overBudget.reduce((sum, row) => sum + row.variance, 0))} công · ${totals.red} việc đỏ` : 'Không có dự án vượt dự báo'}</small></article>
        <article className="success"><span>Lấp đầy công</span><strong>{capacity == null ? '—' : `${number(capacity)}%`}</strong><small>Tỷ lệ giờ đã phân công trên năng lực tháng</small></article>
        <article className="danger"><span>Hồ sơ & chứng chỉ</span><strong>{urgentDocuments} việc</strong><small>Việc nộp hồ sơ sắp đến hạn hoặc quá hạn</small></article>
      </section>

      <section className="director-overview-card" aria-label="Dự án: công dự toán so với dự báo">
        <div className="director-overview-table-wrap"><table>
          <colgroup>
            <col className="director-project-column" />
            <col className="director-budget-column" />
            <col className="director-actual-column" />
            <col className="director-forecast-column" />
            <col className="director-variance-column" />
            <col className="director-progress-column" />
            <col className="director-alert-column" />
          </colgroup>
          <thead><tr><th>Dự án</th><th>Dự toán (công)</th><th>Thực tế</th><th>Dự báo khi xong</th><th>Chênh</th><th>% hoàn thành / KH</th><th>Việc đỏ</th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.id}>
              <td><button className="project-link" onClick={() => openProject(row.id)}>{row.name}</button></td>
              <td>{number(row.budgeted)}</td><td>{number(row.actual)}</td><td><b>{number(row.forecast)}</b></td>
              <td><span className={`variance ${row.variance > 0.05 ? 'bad' : row.variance < -0.05 ? 'good' : ''}`}>{signed(row.variance)}{row.variancePercent != null && ` (${signed(row.variancePercent)}%)`}</span></td>
              <td>{number(row.completion)}% / {number(row.planPercent)}%</td>
              <td>{row.red ? <span className="red-count">{row.red}</span> : '—'}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan="7" className="empty">Chưa có dự án thuộc phạm vi xem.</td></tr>}
          </tbody>
          {!!rows.length && <tfoot><tr><th>Tổng công ty</th><th>{number(totals.budgeted)}</th><th>{number(totals.actual)}</th><th>{number(totals.forecast)}</th><th><span className={`variance ${totals.variance > 0.05 ? 'bad' : totals.variance < -0.05 ? 'good' : ''}`}>{signed(totals.variance)}{totals.variancePercent != null ? ` (${signed(totals.variancePercent)}%)` : ''}</span></th><th>—</th><th>{totals.red}</th></tr></tfoot>}
        </table></div>
        <footer>Dự báo = công thực tế + công còn lại theo mức hoàn thành đã ghi nhận. Xanh ≤ 5%; vàng 5–10%; đỏ &gt; 10%. Bấm tên dự án để mở bảng việc.</footer>
      </section>

      <section className="director-overview-card director-actions">
        <header><h2>Việc cần Giám đốc xử lý</h2><span>tự sinh từ quy tắc · xếp theo mức gấp</span></header>
        <div>{report.executive?.actions?.length ? report.executive.actions.map(action => <article key={action.id}>
          <strong>{action.code || 'Dự án'}</strong><span>{action.title}</span><button onClick={() => openAction(action)}>Mở</button>
        </article>) : <p className="empty">Không có việc cần xử lý theo dữ liệu hiện tại.</p>}</div>
      </section>
    </>}
  </div>;
}
