import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePageAccess } from '../../context/PageAccessContext';
import { deliveryApi } from '../gantt/deliveryApi';
import { monthFillPercent } from '../../utils/monthCapacity';
import { summarizePortfolioWork, summarizeProjectWork, varianceTone } from '../../utils/deliveryMetrics';
import './DirectorOverviewPage.css';

const number = value => value == null || !Number.isFinite(Number(value))
  ? '—'
  : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
// Cột công (Dự toán / Thực tế / Dự báo / Chênh lệch): 2 chữ số, cùng cách hiện với bảng Gantt.
const work = value => value == null || !Number.isFinite(Number(value))
  ? '—'
  : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const signed = value => value == null || !Number.isFinite(Number(value))
  ? '—'
  : `${Number(value) > 0 ? '+' : ''}${work(value)}`;

function projectWork(project, details, executiveRow) {
  const comparison = summarizeProjectWork(project, details?.taskMetrics);
  return {
    id: project.id,
    name: executiveRow?.name || project.name,
    code: executiveRow?.code || project.code,
    budgeted: comparison.budgetedWork,
    actual: comparison.actualWork,
    forecast: comparison.forecastWork,
    remaining: comparison.remainingWork,
    variance: comparison.varianceWork,
    variancePercent: comparison.variancePercent,
    completion: executiveRow?.completion ?? details?.summary?.completion ?? 0,
    planPercent: executiveRow?.planPercent ?? details?.summary?.planPercent ?? 0,
    red: Number(details?.summary?.warnings || 0),
  };
}

/** % hoàn thành và % kế hoạch của cả công ty, trọng số = công dự toán từng dự án. */
function weightedPercents(rows) {
  const weightOf = row => Math.max(0, Number(row.budgeted) || 0);
  const totalWeight = rows.reduce((sum, row) => sum + weightOf(row), 0);
  const average = key => totalWeight > 0
    ? rows.reduce((sum, row) => sum + (Number(row[key]) || 0) * weightOf(row), 0) / totalWeight
    : rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / Math.max(1, rows.length);
  return { completion: average('completion'), planPercent: average('planPercent') };
}

export default function DirectorOverviewPage() {
  const { projects, tasks, ganttItems, employees, selectedDate, setActiveTab } = useApp();
  const { canSee } = usePageAccess();
  // Tháng báo cáo = tháng của ngày đang hiện trên thanh tiêu đề (trước đây lấy tháng đang xem ở trang Dự án,
  // nên tiêu đề ghi 04/11 mà số liệu lại là của tháng khác — ví dụ Lấp đầy công 0% của tháng 10).
  const month = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
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

  // Ai xem được trang do ma trận Trang & mục quyết định (máy chủ cũng chặn theo cùng ma trận).
  const mayView = Boolean(report) && canSee('director-overview.kpis');
  const rows = useMemo(() => (report?.projects || []).map(row => {
    const project = projects.find(item => item.id === row.id) || row;
    return projectWork(project, details[row.id], row);
  }), [report?.projects, projects, details]);
  const totals = useMemo(() => {
    const comparison = summarizePortfolioWork(rows.map(row => ({
      budgetedWork: row.budgeted,
      actualWork: row.actual,
      forecastWork: row.forecast,
      remainingWork: row.remaining ?? Math.max(0, row.forecast - row.actual),
    })));
    return {
      budgeted: comparison.budgetedWork,
      actual: comparison.actualWork,
      forecast: comparison.forecastWork,
      variance: comparison.varianceWork,
      variancePercent: comparison.variancePercent,
      red: rows.reduce((sum, row) => sum + row.red, 0),
      // % không cộng thẳng được: lấy trung bình theo trọng số công dự toán (dự án lớn ảnh hưởng nhiều hơn);
      // chưa dự án nào có dự toán thì lấy trung bình cộng.
      ...weightedPercents(rows),
    };
  }, [rows]);
  const capacity = useMemo(() => monthFillPercent(tasks, employees, month, ganttItems), [tasks, employees, month, ganttItems]);
  // Vượt công = Chênh vượt ngưỡng xanh (dự báo cao hơn dự toán trên 5%): vàng 5–10%, đỏ > 10%. Cùng quy tắc màu với bảng và bảng Gantt.
  const overBudget = rows.filter(row => ['warning', 'danger'].includes(varianceTone(row.variance, row.variancePercent)));
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
    {report && !mayView && <section className="director-overview-denied"><BarChart3 size={32} /><h2>Tổng quan</h2><p>Vai trò của bạn chưa được cấp quyền xem trang này (Công ty → Cài đặt → Ma trận quyền).</p></section>}
    {report && mayView && <>
      <section className="director-overview-kpis">
        <article className="danger"><span>Dự án vượt công</span><strong>{overBudget.length} dự án</strong><small>{overBudget.length ? `Vượt ${number(overBudget.reduce((sum, row) => sum + row.variance, 0))} công · ${totals.red} việc đỏ` : 'Không có dự án nào dự báo vượt dự toán quá 5%'}</small></article>
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
              <td>{work(row.budgeted)}</td><td>{work(row.actual)}</td><td><b>{work(row.forecast)}</b></td>
              <td><span className={`variance ${varianceTone(row.variance, row.variancePercent)}`}>{signed(row.variance)}{row.variancePercent != null && ` (${signed(row.variancePercent)}%)`}</span></td>
              <td>{number(row.completion)}% / {number(row.planPercent)}%</td>
              <td>{row.red ? <span className="red-count">{row.red}</span> : '—'}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan="7" className="empty">Chưa có dự án thuộc phạm vi xem.</td></tr>}
          </tbody>
          {!!rows.length && <tfoot><tr><th>Tổng công ty</th><th>{work(totals.budgeted)}</th><th>{work(totals.actual)}</th><th>{work(totals.forecast)}</th><th><span className={`variance ${varianceTone(totals.variance, totals.variancePercent)}`}>{signed(totals.variance)}{totals.variancePercent != null ? ` (${signed(totals.variancePercent)}%)` : ''}</span></th><th>{number(totals.completion)}% / {number(totals.planPercent)}%</th><th>{totals.red}</th></tr></tfoot>}
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
