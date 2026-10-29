import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { usePageAccess } from '../../context/PageAccessContext';
import { deliveryApi } from './deliveryApi';
import DeliveryResourceEditor from './DeliveryResourceEditor';
import { fiscalMonths, fiscalStart, vietnamMonth } from '../../utils/deliveryResources';
import { formatCompactMoney } from '../../utils/deliveryMetrics';

const number = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const million = value => value == null ? '—' : number(value / 1e6);
const percent = value => value == null ? '—' : `${number(value)}%`;
const titleMonth = month => `${Number(month.slice(5))}/${month.slice(0, 4)}`;
const sum = rows => rows.reduce((total, row) => total + (Number(row) || 0), 0);
function YearCharts({ months, totals, lockedTotals, budget }) {
  const max = Math.max(1, ...totals, budget / 12);
  const cumulative = totals.map((_, index) => sum(lockedTotals.slice(0, index + 1)));
  const maxYear = Math.max(1, budget, ...cumulative);
  const x = index => 45 + index * 36;
  const y = value => 174 - value / maxYear * 138;
  const active = months.map((month, index) => ({ month, index })).filter(row => row.month <= vietnamMonth());
  return <section className="delivery-year-charts"><div className="delivery-section-heading"><h2>Sản lượng theo tháng và lũy kế năm</h2><small>Đơn vị: tỷ đồng</small></div><div className="delivery-chart-pair">
    <figure><figcaption>Sản lượng từng tháng</figcaption><svg viewBox="0 0 500 218" role="img" aria-label="Biểu đồ sản lượng từng tháng">{[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="42" x2="478" y1={174 - tick * 34.5} y2={174 - tick * 34.5} stroke="var(--delivery-resource-line)" /><text x="36" y={178 - tick * 34.5} textAnchor="end">{number(max / 1e9 * tick / 4)}</text></g>)}{budget > 0 && <><line x1="42" x2="478" y1={174 - budget / 12 / max * 138} y2={174 - budget / 12 / max * 138} stroke="#96918b" strokeDasharray="5 4" /><text x="477" y={168 - budget / 12 / max * 138} textAnchor="end">KH {number(budget / 12 / 1e9)}/tháng</text></>}{months.map((month, index) => <g key={month}>{totals[index] > 0 && <><rect x={x(index) - 11} y={174 - totals[index] / max * 138} width="22" height={totals[index] / max * 138} fill={lockedTotals[index] === totals[index] ? '#861b36' : '#c8879c'} /><text x={x(index)} y={168 - totals[index] / max * 138} textAnchor="middle">{number(totals[index] / 1e9)}</text></>}<text x={x(index)} y="193" textAnchor="middle">T{Number(month.slice(5))}</text></g>)}</svg><div className="delivery-chart-legend"><span><i />Tháng đã khóa</span><span><i className="draft" />Nháp / chưa khóa</span><span>-- Kế hoạch mỗi tháng</span></div></figure>
    <figure><figcaption>Lũy kế năm đã khóa</figcaption><svg viewBox="0 0 500 218" role="img" aria-label="Biểu đồ lũy kế năm tài chính">{[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="42" x2="478" y1={174 - tick * 34.5} y2={174 - tick * 34.5} stroke="var(--delivery-resource-line)" /><text x="36" y={178 - tick * 34.5} textAnchor="end">{number(maxYear / 1e9 * tick / 4)}</text></g>)}{budget > 0 && <path d={`M42 174 L${x(11)} ${y(budget)}`} stroke="#96918b" strokeDasharray="5 4" fill="none" />}<path d={`M42 174 ${active.map(({ index }) => `L${x(index)} ${y(cumulative[index])}`).join(' ')}`} stroke="#861b36" strokeWidth="2" fill="none" />{active.length > 0 && <g><circle cx={x(active.at(-1).index)} cy={y(cumulative[active.at(-1).index])} r="3" fill="#861b36" /><text x={Math.min(420, x(active.at(-1).index) + 8)} y={y(cumulative[active.at(-1).index]) - 8}>{number(cumulative[active.at(-1).index] / 1e9)} tỷ</text></g>}{months.map((month, index) => <text key={month} x={x(index)} y="193" textAnchor="middle">T{Number(month.slice(5))}</text>)}</svg><div className="delivery-chart-legend"><span><i />Lũy kế đã khóa</span><span>-- Kế hoạch năm chia đều theo tháng</span></div></figure>
  </div></section>;
}
const REPORT_VIEWS = [['month', 'Tháng'], ['year', 'Năm tài chính']];
export default function DeliveryReporting({ contextBar, data, projectId, readOnly, onSaveSettings, refreshProject }) {
  const [viewChoice, setView] = useState('month');
  // Tháng / Năm tài chính theo ma trận Trang & mục (Dự án → Chốt sản lượng tháng).
  const { canSee } = usePageAccess();
  const views = REPORT_VIEWS.filter(([key]) => canSee(`gantt.close.${key}`));
  const view = views.some(([key]) => key === viewChoice) ? viewChoice : views[0]?.[0];
  // Tháng báo cáo = tháng trên ô tiêu đề; Năm tài chính chọn cũng ở ô tiêu đề (chế độ 'fiscal-year').
  const { ganttMonth, setGanttHeaderMode, fiscalYear, setFiscalYear } = useApp();
  const month = `${ganttMonth.getFullYear()}-${String(ganttMonth.getMonth() + 1).padStart(2, '0')}`;
  const year = view === 'year' ? fiscalYear : fiscalStart(month);
  useEffect(() => {
    setGanttHeaderMode(view === 'year' ? 'fiscal-year' : 'month');
    return () => setGanttHeaderMode('month');
  }, [view, setGanttHeaderMode]);
  const chooseView = key => { if (key === 'year') setFiscalYear(fiscalStart(month)); setView(key); };
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const load = useCallback(async () => {
    const response = await deliveryApi.reporting(year, month);
    if (!response.data?.projects) throw new Error('Không tải được báo cáo sản lượng.');
    return response.data;
  }, [year, month]);
  useEffect(() => {
    let active = true; setReport(null); setError('');
    load().then(value => { if (active) setReport(value); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [load, data.viewer.email, data.revision]);
  const execute = async (action, value = {}) => {
    setBusy(true); setError('');
    try {
      const response = await deliveryApi.updateReporting({ action, value, year, month, revisions: Object.fromEntries((report?.projects || []).map(row => [row.id, row.revision])) });
      setReport(response.data); await refreshProject();
    } catch (error) { setError(error.message); if (error.status === 409) setReport(await load()); throw error; }
    finally { setBusy(false); }
  };
  const run = async action => { try { await action(); } catch { /* Keep the API message visible. */ } };
  const disabled = readOnly || busy;
  const months = fiscalMonths(year);
  const rows = report?.projects || [];
  const yearRows = report?.pipeline ? [...rows, report.pipeline] : rows;
  const totals = months.map((_, index) => sum(rows.map(row => row.months[index].output)));
  const lockedTotals = months.map((_, index) => sum(rows.filter(row => row.months[index].status === 'closed').map(row => row.months[index].output)));
  const locked = sum(lockedTotals);
  const draft = sum(totals) - locked;
  const budget = sum(yearRows.map(row => row.annualPlan));
  const elapsed = months.filter(key => key <= vietnamMonth()).length;
  const currentBudget = budget / 12 * elapsed;
  const openPlan = () => setEditor({ title: report.permissions.approve ? 'Duyệt kế hoạch năm' : 'Lập kế hoạch năm', action: report.permissions.approve ? 'approvePlan' : 'savePlan', value: Object.fromEntries(yearRows.map(row => [row.id, row.annualPlan ?? ''])), fields: yearRows.map(row => ({ key: row.id, label: `${row.name} · kế hoạch năm (đ)`, type: 'number', min: 0 })) });
  return <>
    {contextBar?.(<div className="delivery-report-controls"><div className="delivery-report-switch">{views.map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => chooseView(key)}>{label}</button>)}</div><button disabled={busy} onClick={() => run(async () => { setReport(await load()); setError(''); })}>Tải lại</button></div>, 'is-report')}
    {error && <p role="alert" className="delivery-error">{error}</p>}
    {!report && !error && <p className="delivery-empty">Đang tải báo cáo. Chưa chốt số liệu mới.</p>}
    {report && view === 'month' && <section><div className="delivery-section-heading"><div><h2>Chốt sản lượng tháng {titleMonth(month)}</h2><small>Triệu đồng · Ngày 1–3: rà soát · Ngày 5: Giám đốc duyệt và khóa</small></div><button className="delivery-primary-action" disabled={disabled || !report.permissions.approve || !rows.length || rows.every(row => row.month.status === 'closed' || row.month.fee == null)} onClick={() => run(() => execute('approveMonth'))}>Duyệt & khóa tháng</button></div><div className="delivery-overflow"><table className="delivery-month-table"><thead><tr><th>Dự án</th><th>Phí HĐ</th><th>% đầu kỳ (đã khóa)</th><th>% cuối kỳ</th><th>Sản lượng tháng</th><th>Hiệu suất giờ</th><th>Trạng thái</th><th /></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><b>{row.name}</b></td><td>{row.id === projectId && data.permissions.manage ? <button disabled={disabled} onClick={() => setEditor({ title: 'Phí hợp đồng dự án', action: 'projectSettings', value: { contractFee: data.settings.contractFee ?? '' }, fields: [{ key: 'contractFee', label: 'Phí hợp đồng (đ)', type: 'number', min: 0, required: true }] })}>{million(row.month.fee)} ✎</button> : million(row.month.fee)}</td><td>{percent(row.month.startCompletion)}</td><td>{percent(row.month.completion)}</td><td><b>{million(row.month.output)}</b></td><td className={row.month.efficiency >= 1 ? 'delivery-efficiency-good' : 'delivery-scope'}>{number(row.month.efficiency)}</td><td><span className={`delivery-pill ${row.month.status === 'closed' ? 'success' : 'warning'}`}>{row.month.fee == null ? 'Chưa nhập phí HĐ' : row.month.status === 'closed' ? 'Đã khóa' : row.month.status === 'reviewed' ? 'Chờ GD duyệt' : 'Chưa chốt · chờ rà soát'}</span></td><td>{row.month.status === 'closed' ? report.permissions.approve && <button disabled={disabled} onClick={() => setEditor({ title: 'Mở lại tháng đã khóa', action: 'reopenMonth', value: { projectId: row.id }, fields: [{ key: 'reason', label: 'Lý do mở lại (lưu nhật ký)', required: true, type: 'textarea' }] })}>Mở lại</button> : <button disabled={disabled || !report.permissions.review || row.month.fee == null || row.month.output == null} onClick={() => run(() => execute('reviewMonth', { projectId: row.id }))}>Rà soát</button>}</td></tr>)}<tr className="delivery-total-row"><td>Cộng</td><td>{million(sum(rows.map(row => row.month.fee)))}</td><td /><td /><td>{million(sum(rows.map(row => row.month.output)))}</td><td colSpan="3" /></tr></tbody></table></div><p className="delivery-resource-footnote">Sản lượng tháng = sản lượng lũy kế cuối kỳ − lũy kế kỳ trước. Số đã khóa được lưu cố định; Giám đốc mở lại phải ghi lý do.</p></section>}
    {report && view === 'year' && <>
      <div className="delivery-resource-kpis three"><section><small>Lũy kế năm đã khóa</small><strong>{formatCompactMoney(locked)}</strong><small>Nháp / chưa khóa: {formatCompactMoney(draft)}</small></section><section><small>So với kế hoạch đến nay</small><strong>{currentBudget > 0 ? percent(locked / currentBudget * 100) : 'Chưa có kế hoạch'}</strong><small>Kế hoạch {elapsed} tháng: {formatCompactMoney(currentBudget)}</small></section><section><small>Đạt kế hoạch năm</small><strong>{budget > 0 ? percent(locked / budget * 100) : 'Chưa có kế hoạch'}</strong><small>{formatCompactMoney(locked)} / {formatCompactMoney(budget)} · {report.plan.status === 'approved' ? 'Kế hoạch đã duyệt' : 'Kế hoạch chưa duyệt'}</small></section></div>
      <YearCharts months={months} totals={totals} lockedTotals={lockedTotals} budget={budget} />
      <section><div className="delivery-section-heading"><div><h2>Theo dự án</h2><small>Số nháp / chưa khóa có dấu * · Đơn vị: tỷ đồng</small></div>{report.permissions.plan && <button className="delivery-primary-action" disabled={disabled} onClick={openPlan}>{report.permissions.approve ? 'Duyệt kế hoạch năm' : 'Lập kế hoạch năm'}</button>}</div><div className="delivery-overflow"><table className="delivery-fiscal-table"><thead><tr><th>Dự án</th>{months.map(key => <th key={key}>T{Number(key.slice(5))}</th>)}<th>Lũy kế</th><th>KH năm</th><th>% đạt</th></tr></thead><tbody>{yearRows.map(row => { const value = sum(row.months.filter(entry => entry.status === 'closed').map(entry => entry.output)); return <tr key={row.id}><td><b>{row.name}</b></td>{row.months.map(entry => <td key={entry.month} className={entry.status === 'closed' ? '' : 'delivery-draft-value'}>{entry.output == null || entry.month > vietnamMonth() ? '—' : `${number(entry.output / 1e9)}${entry.status === 'closed' ? '' : '*'}`}</td>)}<td><b>{number(value / 1e9)}</b></td><td>{row.annualPlan == null ? '—' : number(row.annualPlan / 1e9)}</td><td>{row.annualPlan > 0 ? percent(value / row.annualPlan * 100) : '—'}</td></tr>; })}<tr className="delivery-total-row"><td>Cộng {data.viewer.role === 'manager' ? 'dự án phụ trách' : 'toàn công ty'}</td>{totals.map((value, index) => <td key={months[index]}>{months[index] > vietnamMonth() ? '—' : `${number(value / 1e9)}${value !== lockedTotals[index] ? '*' : ''}`}</td>)}<td>{number(locked / 1e9)}</td><td>{number(budget / 1e9)}</td><td>{budget > 0 ? percent(locked / budget * 100) : '—'}</td></tr></tbody></table></div></section>
    </>}
    {editor && <DeliveryResourceEditor {...editor} saving={busy} onClose={() => setEditor(null)} onSave={async value => { if (editor.action === 'projectSettings') { setBusy(true); try { await onSaveSettings(value); setReport(await load()); } finally { setBusy(false); } return; } return execute(editor.action, editor.action.includes('Plan') ? { projects: value, revision: report.plan.revision } : value); }} />}
  </>;
}
