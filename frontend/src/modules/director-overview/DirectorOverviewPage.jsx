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
    // Việc đỏ (G1) = số việc có Chênh đỏ (> 10%).
    red: Number(details?.summary?.redTasks || 0),
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
  // Dự án vượt (G1): (Σ Dự báo − Σ Dự toán) ÷ Σ Dự toán > 10%.
  const overBudget = rows.filter(row => Number(row.variancePercent) > 10);
  const urgentDocuments = (report?.projects || []).reduce((sum, row) => sum + (row.urgent?.length || 0), 0);
  const [review, setReview] = useState(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const decide = async status => {
    if (status === 'rejected' && !reviewReason.trim()) { setReviewError('Cần ghi lý do từ chối.'); return; }
    setReviewSaving(true); setReviewError('');
    try {
      // Luồng duyệt dùng revision của dữ liệu vận hành: đọc bản mới nhất rồi gửi quyết định (có nhật ký người duyệt).
      const current = await deliveryApi.operations({ projectId: review.projectId });
      const action = review.operationType === 'budget' ? 'budgetDecision' : review.operationType === 'expense' ? 'expenseDecision' : 'projectDecision';
      await deliveryApi.mutateOperations({ revision: current.data.revision, action, value: { status, reason: reviewReason.trim() }, id: review.recordId, projectId: review.projectId, query: { projectId: review.projectId } });
      setReview(null); setReviewReason('');
      await load(true);
    } catch (failure) { setReviewError(failure.message); }
    finally { setReviewSaving(false); }
  };

  const openProject = projectId => {
    sessionStorage.setItem('aps_report_link', JSON.stringify({ projectId, tab: 'gantt' }));
    setActiveTab('gantt');
  };
  // Loại việc chưa có màn hình xử lý (công nợ, hợp đồng, thanh toán) thì không hiện nút Mở.
  const canOpen = action => !['debt', 'contract', 'payment'].includes(action.kind) && (action.kind !== 'operation' || Boolean(action.recordId));
  const openAction = action => {
    if (action.kind === 'capacity') return setActiveTab('workload');
    // Đề nghị chờ Giám đốc (dự án mới / ngân sách / đề nghị chi): mở khung duyệt ngay trên trang này.
    if (action.kind === 'operation') { setReview(action); setReviewReason(''); setReviewError(''); return undefined; }
    if (!canOpen(action)) return undefined;
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
        <article className="danger"><span>Dự án vượt công</span><strong>{overBudget.length} dự án</strong><small>{overBudget.length ? `Vượt ${number(overBudget.reduce((sum, row) => sum + row.variance, 0))} công · ${overBudget.reduce((sum, row) => sum + row.red, 0)} việc đỏ` : 'Không có dự án nào dự báo vượt dự toán quá 10%'}</small></article>
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
          {!!rows.length && <tfoot><tr><th>Toàn công ty</th><th>{work(totals.budgeted)}</th><th>{work(totals.actual)}</th><th>{work(totals.forecast)}</th><th><span className={`variance ${varianceTone(totals.variance, totals.variancePercent)}`}>{signed(totals.variance)}{totals.variancePercent != null ? ` (${signed(totals.variancePercent)}%)` : ''}</span></th><th>{number(totals.completion)}% / {number(totals.planPercent)}%</th><th>{totals.red}</th></tr></tfoot>}
        </table></div>
        <footer>Thực tế = giờ đã duyệt ÷ 8. Dự báo theo mức: chưa làm = dự toán · đang làm = max(dự toán, 2 × thực tế) · đã nộp = thực tế + 10% dự toán · xong = thực tế. Chênh dưới 1 công không tô màu; vàng &gt; 5%; đỏ &gt; 10%. Bấm tên dự án để mở bảng việc.</footer>
      </section>

      <section className="director-overview-card director-actions">
        <header><h2>Việc cần Giám đốc xử lý</h2><span>tự sinh từ quy tắc · xếp theo mức gấp</span></header>
        <div>{report.executive?.actions?.length ? report.executive.actions.map(action => <article key={action.id}>
          <strong>{action.code || 'Dự án'}</strong><span>{action.title}</span>{canOpen(action) ? <button onClick={() => openAction(action)}>Mở</button> : <i />}
        </article>) : <p className="empty">Không có việc cần xử lý theo dữ liệu hiện tại.</p>}</div>
      </section>
    </>}
    {review && <div className="director-review-backdrop" role="presentation" onClick={() => !reviewSaving && setReview(null)}>
      <div className="director-review" role="dialog" aria-modal="true" aria-label={review.title} onClick={event => event.stopPropagation()}>
        <header><h3>{review.title}</h3><button type="button" aria-label="Đóng" disabled={reviewSaving} onClick={() => setReview(null)}>×</button></header>
        <dl>
          {review.project && <>
            <dt>Dự án</dt><dd>{review.project.name}{review.project.code ? ` · ${review.project.code}` : ''}</dd>
            <dt>Quản lý</dt><dd>{review.project.manager || '—'}</dd>
            <dt>Thời gian</dt><dd>{[review.project.startDate, review.project.endDate].map(value => value ? value.split('-').reverse().join('/') : '—').join(' → ')}</dd>
            <dt>Công dự toán</dt><dd>{review.project.contractWork != null && review.project.contractWork !== '' ? `${work(review.project.contractWork)} công` : '—'}</dd>
          </>}
          {review.amount != null && <><dt>Số tiền</dt><dd>{Number(review.amount).toLocaleString('vi-VN')} đ</dd></>}
          <dt>Bước chờ duyệt</dt><dd>{review.step || 'Giám đốc duyệt'}</dd>
          <dt>Người lập</dt><dd>{review.createdBy || '—'}{review.createdAt ? ` · ${new Date(review.createdAt).toLocaleString('vi-VN')}` : ''}</dd>
        </dl>
        {review.createdBy && review.createdBy === report?.viewer?.email && <p className="director-review-warning">Bạn là người lập đề nghị này nên không tự duyệt được. Cần tài khoản Giám đốc (hoặc một Quản trị khác) duyệt.</p>}
        <label>Lý do / ghi chú (bắt buộc khi từ chối)<textarea rows={3} value={reviewReason} onChange={event => setReviewReason(event.target.value)} disabled={reviewSaving} /></label>
        {reviewError && <p className="director-review-error" role="alert">{reviewError}</p>}
        <footer>
          {review.projectId && <button type="button" disabled={reviewSaving} onClick={() => { setReview(null); openProject(review.projectId); }}>Xem bảng việc</button>}
          <span />
          <button type="button" className="reject" disabled={reviewSaving} onClick={() => decide('rejected')}>Từ chối</button>
          <button type="button" className="approve" disabled={reviewSaving} onClick={() => decide('approved')}>{reviewSaving ? 'Đang lưu…' : 'Duyệt'}</button>
        </footer>
      </div>
    </div>}
  </div>;
}
