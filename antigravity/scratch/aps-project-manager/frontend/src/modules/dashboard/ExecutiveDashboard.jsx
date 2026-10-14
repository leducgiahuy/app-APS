import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Info, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { deliveryApi } from '../gantt/deliveryApi';
import DeliveryResourceEditor from '../gantt/DeliveryResourceEditor';
import { DELIVERY_ROLES, formatCompactMoney as money } from '../../utils/deliveryMetrics';
import './ExecutiveDashboard.css';
import '../gantt/DeliveryPage.css';

const number = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const efficiency = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => value ? new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const monthLabel = value => `T${Number(value.slice(5))}/${value.slice(0, 4)}`;
const deadline = item => item.overdue ? `quá hạn ${Math.max(1, Math.ceil(-item.hours / 24))} ngày` : `còn ${Math.floor(item.hours / 24)} ngày ${Math.floor(item.hours % 24)} giờ`;
function Kpi({ label, value, detail, tone = '', hint, badge }) {
  return <article className={`executive-kpi ${tone}`}><div>{label}{badge && <small className="exec-badge">{badge}</small>}<span title={hint} tabIndex="0" aria-label={hint}><Info size={13} /></span></div><strong>{value}</strong><p>{detail}</p></article>;
}
export default function ExecutiveDashboard() {
  const { projects, tasks, ganttItems, employees, ganttMonth, setGanttMonth, setActiveTab } = useApp();
  const month = `${ganttMonth.getFullYear()}-${String(ganttMonth.getMonth() + 1).padStart(2, '0')}`;
  const [report, setReport] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('executive'), [preview, setPreview] = useState(''), [showIT, setShowIT] = useState(false), [showGuide, setShowGuide] = useState(false);
  const [search, setSearch] = useState(''), [editor, setEditor] = useState(null), [message, setMessage] = useState('');
  const generation = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const sequence = ++generation.current;
    if (!quiet) setLoading(true);
    try { const response = await deliveryApi.executive(month); if (sequence === generation.current) { setReport(response.data); setError(''); } }
    catch (failure) { if (sequence === generation.current) setError(failure.message); }
    finally { if (sequence === generation.current) setLoading(false); }
  }, [month]);
  useEffect(() => {
    load(); const refresh = () => load(true); const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load, projects, tasks, ganttItems, employees]);
  const actualRole = report?.viewer.role, role = preview || actualRole;
  const executive = ['director', 'admin'].includes(role) && report?.permissions.executive;
  const readOnly = Boolean(preview && preview !== actualRole);
  const finance = ['director', 'admin', 'accountant', 'chiefAccountant', 'manager'].includes(role);
  const rows = (report?.projects || []).filter(row => [row.name, row.code, row.manager].some(value => String(value || '').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))));
  const canSeeMoney = row => finance && row.financial && (role !== 'manager' || !readOnly || [report?.viewer.email, report?.viewer.name].includes(row.manager));
  const selectedTab = executive && tab === 'executive' ? 'executive' : 'projects', kpis = report?.executive;
  const openSource = (projectId, taskId, sourceTab = 'gantt') => {
    sessionStorage.setItem('aps_report_link', JSON.stringify({ projectId, taskId, tab: sourceTab })); setActiveTab('gantt');
  };
  const openAction = async action => {
    if (action.kind === 'task') return openSource(action.projectId, action.taskId);
    if (action.kind === 'document') return openSource(action.projectId, null, 'legal');
    if (action.kind === 'capacity') return setActiveTab('workload');
    if (['debt','contract','payment','operation'].includes(action.kind)) { sessionStorage.setItem('aps_finance_link',JSON.stringify({projectId:action.projectId,tab:action.kind==='debt'?'receivables':action.kind==='payment'?'milestones':'expenses'}));return setActiveTab('finance'); }
    return openSource(action.projectId, null, action.kind === 'change' ? 'changes' : 'gantt');
  };
  const copyReport = async () => {
    const text = [`BÁO CÁO DỰ ÁN · ${monthLabel(month)}`, ...rows.map(row => `${row.name} · Hoàn thành ${number(row.completion)}% · Chênh kế hoạch ${number(row.deviation)} điểm · Hiệu suất ${efficiency(row.efficiency)} · Hạn ${date(row.endDate)}${canSeeMoney(row) ? ` · Lãi gộp dự kiến ${number(row.grossMargin)}% · Nợ quá hạn ${money(row.overdueAmount)}` : ''}`)].join('\n');
    try { await navigator.clipboard.writeText(text); setMessage('Đã sao chép báo cáo.'); } catch { setEditor({ title: 'Báo cáo dự án', value: { text }, fields: [{ key: 'text', label: 'Nội dung báo cáo', type: 'textarea' }], save: async () => {} }); }
  };
  return <div className="executive-dashboard">
    <div className="executive-toolbar"><nav aria-label="Báo cáo">{executive && <button className={selectedTab === 'executive' ? 'active' : ''} onClick={() => setTab('executive')}>Dashboard điều hành {showIT && <small className="exec-badge">MỚI</small>}</button>}<button className={selectedTab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}>Báo cáo dự án</button></nav><div className="executive-options"><label>Xem thử vai trò <select aria-label="Xem thử vai trò" value={preview} onChange={event => setPreview(event.target.value)}><option value="">{DELIVERY_ROLES[actualRole] || 'Vai trò đang đăng nhập'}</option>{Object.entries(DELIVERY_ROLES).filter(([key]) => report?.permissions.executive && key !== actualRole).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label><input type="checkbox" checked={showGuide} onChange={event => setShowGuide(event.target.checked)} /> Hiện cách tính</label><label><input type="checkbox" checked={showIT} onChange={event => setShowIT(event.target.checked)} /> Nhãn Mới/Đổi & ghi chú IT</label></div></div>
    <div className="executive-mobile-month"><label>Tháng báo cáo <input type="month" value={month} onChange={event => { const [year, nextMonth] = event.target.value.split('-').map(Number); if (year && nextMonth) setGanttMonth(new Date(year, nextMonth - 1, 1)); }} /></label></div>
    {error && <div className="executive-error" role="alert">{error} <button onClick={() => load()}>Thử lại</button></div>}
    {loading && !report && <p role="status">Đang tải báo cáo…</p>}
    {report && report.month === month && <>
      <div className="executive-caption"><span>Tháng {Number(month.slice(5))}/{month.slice(0, 4)} · {selectedTab === 'executive' ? `${kpis?.monthlyStatus === 'closed' ? 'Đã khóa sản lượng' : 'Bản nháp chưa chốt'} · 6 chỉ số Giám đốc cần xem mỗi tuần` : 'Một dòng mỗi dự án, các chỉ số cần hành động'}</span><div>{readOnly && <span>Đang xem thử · chỉ đọc</span>}<button aria-label="Tải lại báo cáo" disabled={loading} onClick={() => load()}><RefreshCw size={14} /></button></div></div>
      {showGuide && <aside className="executive-guide"><strong>Cách tính báo cáo</strong><p>Hoàn thành = công đạt / công dự toán; công đạt chỉ dùng % được ghi nhận, có kiểm tra bằng chứng và xác nhận Leader. Kế hoạch tính theo lịch làm việc của dự án. Chênh âm là chậm tiến độ. Hiệu suất = công đạt / công thực tế đã duyệt.</p><p>Sản lượng tháng dùng số đã khóa hoặc bản nháp từ Tiến độ; lũy kế năm chỉ cộng tháng đã khóa (T10–T9). Năng suất = sản lượng tháng / công thực tế đã duyệt trong tháng. Nộp đúng hạn = số việc nộp trước hạn / số việc đến hạn hoặc đã nộp trong tháng.</p><p>Lãi gộp dự kiến = phí hợp đồng − (ngân sách nhân công / hiệu suất + ngân sách các nhóm khác), dùng ngân sách đã duyệt. Số dư cuối tháng = số dư đầu kỳ + thu thực tế + kế hoạch thu còn lại − chi thực tế − kế hoạch chi còn lại. Vàng là chi lớn hơn thu. Công nợ không tự cộng vào thu tiền; kế hoạch còn lại cần giảm khi đã thu/chi thực tế.</p><p>Tiến độ theo tháng đã chọn; hạn gấp, công nợ, chi phí và việc cần xử lý phản ánh hiện tại. Mục tiêu và nguồn số liệu được quản lý trong Tài chính.</p></aside>}
      {selectedTab === 'executive' && kpis && <>
        <div className="executive-kpis">
          <Kpi label="Sản lượng tháng" value={money(kpis.monthlyOutput)} tone="amber" badge={showIT && 'ĐỔI'} hint="Sản lượng tháng đã khóa hoặc bản nháp, đồng bộ với Chốt sản lượng tháng." detail={`Lũy kế năm ${money(kpis.annualOutput)} / ${money(kpis.annualPlan)}${kpis.annualPlan ? ` (${number(kpis.annualOutput / kpis.annualPlan * 100)}%)` : ''} · ${kpis.annualToDatePlan ? `đạt ${number(kpis.annualOutput / kpis.annualToDatePlan * 100)}% kế hoạch đến tháng này` : 'chưa có kế hoạch năm'}${!kpis.productionComplete ? ' · thiếu phí / lịch sử sản lượng' : ''}`} />
          <Kpi label="Năng suất" value={kpis.productivity == null ? '—' : `${money(kpis.productivity)}/công`} tone="red" hint="Sản lượng tháng / công thực tế đã duyệt trong tháng. Cần đủ số liệu sản lượng các dự án." detail={`Mục tiêu ≥ ${money(kpis.productivityTarget)}/công`} />
          <Kpi label="Nộp hồ sơ đúng hạn" value={`${number(kpis.onTime)}${kpis.onTime == null ? '' : '%'}`} tone="amber" hint="Đếm việc có hạn nộp trong tháng, loại hạn tương lai chưa nộp." detail={`${kpis.onTimeCount}/${kpis.submissionCount} lần nộp · mục tiêu ≥ ${number(kpis.onTimeTarget)}%`} />
          <Kpi label={`Thu tiền tháng ${Number(month.slice(5))}`} value={money(kpis.collected)} tone="red" badge={showIT && 'MỚI'} hint="Tổng tiền đã thu có ngày trong tháng từ dữ liệu Tiến độ." detail={`Kế hoạch ${money(kpis.collectionTarget)}${kpis.collectionTarget ? ` (${number(kpis.collected / kpis.collectionTarget * 100)}%)` : ''}`} />
          <Kpi label="Công nợ quá hạn" value={money(kpis.overdueAmount)} tone="red" badge={showIT && 'MỚI'} hint="Giá trị phải thu trừ đã thu của khoản có hạn trước hôm nay." detail={report.projects.filter(row => row.overdueAmount > 0).map(row => `${row.name} · ${row.overdueDays} ngày`).join('; ') || 'Không có khoản nợ quá hạn đã ghi nhận'} />
          <Kpi label="Số dư tiền thấp nhất 6 tháng" value={money(kpis.minBalance)} tone={kpis.minBalance < 0 ? 'red' : 'green'} badge={showIT && 'MỚI'} hint="Thấp nhất của số dư cuối tháng trong 6 tháng, gồm tháng đang xem." detail={kpis.minBalance == null ? 'Cần số dư đầu kỳ, đơn giá công và kế hoạch thu / chi' : `${monthLabel(kpis.cash.find(row => row.balance === kpis.minBalance).month)} · ${kpis.minBalance < 0 ? 'dự kiến âm' : 'không âm'} · theo dữ liệu đã nhập`} />
        </div>
        <div className="executive-panels"><section className="executive-card"><header><h2>Việc cần Giám đốc xử lý</h2><span>Tự sinh từ quy tắc, xếp theo mức gấp</span></header><div className="executive-actions">{kpis.actions.length ? kpis.actions.map(action => <div key={action.id}><strong className={action.priority < 2 ? 'exec-negative' : ''}>{action.code || 'Dự án'}</strong><span>{action.title}{action.amount != null && ` · ${money(action.amount)}`}{action.dueAt && ` · ${date(action.dueAt)}`}</span><button disabled={readOnly} onClick={() => openAction(action)}>{action.kind === 'contract' ? 'Ký' : 'Mở'}</button></div>) : <p className="executive-empty">Không có việc cần xử lý theo dữ liệu hiện tại.</p>}</div></section><section className="executive-card"><header><h2>Số dư tiền cuối tháng, 6 tháng tới</h2><span>Triệu đồng · vàng = tháng chi lớn hơn thu</span></header><div className="executive-cash">{kpis.cash.map(row => <div key={row.month}><span>{monthLabel(row.month)}</span><div className="executive-bar-track"><i className={row.balance < 0 ? 'negative' : row.spendingMore ? 'spending' : ''} style={{ width: row.balance == null ? '0%' : `${Math.max(2, Math.abs(row.balance) / Math.max(1, ...kpis.cash.map(cell => Math.abs(cell.balance || 0))) * 100)}%` }} /></div><strong>{row.balance == null ? '—' : number(row.balance / 1e6)}</strong></div>)}<p>Dự báo dựa trên các khoản đã nhập; chưa gồm khoản thu / chi chưa có kế hoạch.</p></div></section></div>
      </>}
      {selectedTab === 'projects' && <section className="executive-card executive-projects"><header><h2>Tất cả dự án của công ty</h2><span>Một dòng mỗi dự án, chỉ các chỉ số cần hành động</span><div className="executive-search"><label><Search size={14} /><input type="search" aria-label="Tìm dự án" placeholder="Tìm theo tên, mã hoặc quản lý..." value={search} onChange={event => setSearch(event.target.value)} /></label><button onClick={copyReport}>Báo cáo</button></div></header><div className="executive-table-scroll"><table><thead><tr><th>Dự án</th><th>% hoàn thành {showIT && <small className="exec-badge">ĐỔI</small>}</th><th>Chênh so với kế hoạch</th><th>Hiệu suất giờ</th><th>Hạn nộp gấp / quá hạn</th>{finance && <><th>Lãi gộp dự kiến</th><th>Công nợ quá hạn</th></>}<th>Hạn</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><button className="executive-project-name" onClick={() => openSource(row.id)}>{row.name}</button></td><td><div className="executive-progress"><span><i style={{ width: `${Math.min(100, Math.max(0, row.completion))}%` }} /></span><strong>{number(row.completion)}%</strong></div></td><td className={row.deviation < 0 ? 'exec-negative' : 'exec-positive'}>{row.deviation > 0 ? '+' : ''}{number(row.deviation)} điểm</td><td className={row.efficiency == null ? '' : row.efficiency >= 1 ? 'exec-positive' : row.efficiency >= .85 ? 'exec-warning' : 'exec-negative'}>{efficiency(row.efficiency)}</td><td>{row.urgent.length ? row.urgent.map(item => <button key={item.taskId} className={item.overdue ? 'exec-negative' : 'exec-warning'} onClick={() => openSource(row.id, item.documentId ? null : item.taskId, item.documentId ? 'legal' : 'gantt')}>{item.code}: {deadline(item)}</button>) : 'Không'}</td>{finance && <><td>{canSeeMoney(row) ? `${number(row.grossMargin)}${row.grossMargin == null ? '' : '%'}` : '—'}</td><td className={row.overdueAmount > 0 ? 'exec-negative' : ''}>{canSeeMoney(row) && row.overdueAmount > 0 ? `${money(row.overdueAmount)} · ${row.overdueDays} ngày` : '—'}</td></>}<td>{date(row.endDate)}</td></tr>)}</tbody></table>{!rows.length && <p className="executive-empty">Không tìm thấy dự án phù hợp.</p>}</div><footer>Kế hoạch tính theo số ngày làm việc đã qua / tổng ngày làm việc dự án. Chênh âm = chậm tiến độ. Cột tài chính hiển thị theo quyền tài khoản.</footer></section>}
      {message && <p role="status">{message}</p>}
      {showIT && <aside className="executive-it"><strong>Ghi chú cho IT · so với Version00</strong><div><p><b>GIỮ NGUYÊN</b><br />Danh sách tất cả dự án, ô tìm kiếm, nút Báo cáo.</p><p><b>ĐỔI</b><br />Mỗi dự án một dòng; hoàn thành theo % ghi nhận có kiểm tra bằng chứng và Leader xác nhận. Thẻ sản lượng kèm lũy kế và kế hoạch năm.</p><p><b>MỚI</b><br />Dashboard điều hành cho Giám đốc: 6 chỉ số, việc cần xử lý tự sinh, số dư 6 tháng. Báo cáo thêm chênh kế hoạch, hiệu suất, hạn nộp gấp, lãi gộp và công nợ theo quyền.</p></div></aside>}
    </>}
    {editor && <DeliveryResourceEditor key={editor.title + (editor.value.id || '')} title={editor.title} fields={editor.fields} value={editor.value} onSave={editor.save} onClose={() => setEditor(null)} saving={false} />}
  </div>;
}
