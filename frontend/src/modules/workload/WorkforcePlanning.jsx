import { deliveryApi } from '../gantt/deliveryApi';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import ModalOverlay from '../../components/layout/ModalOverlay';
import { buildWorkforceForecast, dateDifference, dateKey, employeePosition, positionKey, RECRUITMENT_STAGES } from '../../utils/workforceForecast';
import './WorkforcePlanning.css';

const number = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const displayDate = value => value ? value.split('-').reverse().join('/') : '—';
const tone = percent => percent > 105 ? 'over' : percent >= 90 ? 'tight' : percent >= 70 ? 'balanced' : 'low';
const blankPlan = { demands: [], settings: [], recruitments: [], taskRoles: [] };

function RecruitmentTimeline({ rows, now, months }) {
  if (!rows.length) return null;
  const today = dateKey(now);
  const start = [today, ...rows.map(row => row.deadline), ...rows.map(row => row.openedAt || row.deadline)].sort()[0];
  const end = [months.at(-1).end, ...rows.map(row => row.expectedStart), ...rows.map(row => row.needDate)].sort().at(-1);
  const duration = Math.max(1, dateDifference(end, start));
  const x = key => 160 + Math.max(0, dateDifference(key, start)) / duration * 880;
  const height = 60 + rows.length * 58;
  const monthLines = [];
  for (let date = new Date(`${start.slice(0, 7)}-01T12:00:00`); dateKey(date) <= end; date.setMonth(date.getMonth() + 1)) {
    const key = dateKey(date);
    if (key >= start) monthLines.push({ key, label: `T${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}` });
  }
  return <div className="recruitment-timeline"><h3>Tiến độ tuyển so với ngày cần người</h3><div className="forecast-scroll"><svg viewBox={`0 0 1100 ${height}`} role="img" aria-label="Tiến độ tuyển so với ngày cần người">
    {monthLines.map(month => <g key={month.key}><line x1={x(month.key)} x2={x(month.key)} y1="28" y2={height - 22} stroke="currentColor" opacity=".12" /><text x={x(month.key) + 4} y="17">{month.label}</text></g>)}
    <line x1={x(today)} x2={x(today)} y1="25" y2={height - 15} stroke="#c34d53" /><text x={x(today) + 4} y={height - 3}>Hôm nay {displayDate(today)}</text>
    {rows.map((row, index) => {
      const y = 48 + index * 58;
      const posted = RECRUITMENT_STAGES.indexOf(row.status) >= 2;
      const barStart = posted ? row.openedAt : (today > row.deadline ? today : row.deadline);
      return <g key={row.key}><title>{row.position}: cần {displayDate(row.needDate)}, dự kiến {displayDate(row.expectedStart)}, {row.lateDays > 0 ? `trễ ${row.lateDays} ngày` : 'kịp tiến độ'}</title>
        <text x="4" y={y + 12}>{row.position}</text>
        <rect x={x(row.deadline)} y={y} width={Math.max(2, x(row.needDate) - x(row.deadline))} height="18" fill="none" stroke="currentColor" strokeDasharray="4 3" opacity=".4" />
        <rect x={x(barStart)} y={y + 3} width={Math.max(3, x(row.expectedStart) - x(barStart))} height="12" rx="2" fill={row.lateDays > 0 ? '#c34d53' : '#bd8418'} opacity={posted ? 1 : 0.45} />
        <path d={`M ${x(row.needDate)} ${y - 3} l 5 12 l -5 12 l -5 -12 Z`} fill="white" stroke="#c34d53" strokeWidth="2" />
        <text x={Math.min(950, x(row.expectedStart) + 6)} y={y + 35} fill={row.lateDays > 0 ? '#c34d53' : '#a17316'}>{row.lateDays > 0 ? `Trễ ${row.lateDays} ngày` : 'Kịp nhận việc'}</text>
      </g>;
    })}
  </svg></div><p>Nét đứt: hạn mở tuyển → cần có mặt · Thanh màu: đăng tuyển → dự kiến nhận việc (mờ: chưa đăng tuyển) · ◇ Ngày cần có mặt</p></div>;
}

function PlanEditor({ editor, onClose, onSave, saving, error, positions, projects, tasks }) {
  const [data, setData] = useState(editor.data);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector('input, select, button')?.focus();
    return () => previous?.focus();
  }, []);
  const field = (key, value) => setData(previous => ({ ...previous, [key]: value }));
  const title = { demands: 'Nhu cầu nhân lực bổ sung / dự án sắp ký', settings: 'Thời gian tuyển theo vị trí', recruitments: 'Cập nhật kế hoạch tuyển dụng', taskRoles: 'Gắn vị trí cho task chưa xác định' }[editor.kind];
  return <ModalOverlay><div className="forecast-modal-backdrop" /><form ref={dialogRef} className="forecast-modal" role="dialog" aria-modal="true" aria-labelledby="forecast-editor-title" onSubmit={event => { event.preventDefault(); onSave(editor.kind, data, editor.id); }} onKeyDown={event => {
    if (event.key === 'Escape' && !saving) onClose();
    if (event.key === 'Tab') {
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }
  }}><h2 id="forecast-editor-title">{title}</h2>
    <label>Vị trí<input required maxLength="200" list="workforce-positions" value={data.position || ''} onChange={event => field('position', event.target.value)} readOnly={editor.kind === 'recruitments'} /></label>
    <datalist id="workforce-positions">{positions.map(position => <option key={position} value={position} />)}</datalist>
    {editor.kind === 'demands' && <>
      <p>Chỉ nhập nhu cầu chưa có trong Gantt, để tránh cộng trùng. Dự án đang thực hiện có thể bổ sung phần việc chưa phân công; dự án sắp ký được nhân với xác suất.</p>
      <label>Dự án<select value={data.projectId || ''} onChange={event => { field('projectId', event.target.value); field('projectName', projects.find(project => project.id === event.target.value)?.name || ''); }}><option value="">Dự án sắp ký / nhu cầu khác</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {!data.projectId && <label>Tên dự án / nội dung<input required value={data.projectName || ''} onChange={event => field('projectName', event.target.value)} /></label>}
      <div className="forecast-form-grid"><label>Từ ngày<input required type="date" value={data.startDate || ''} onChange={event => field('startDate', event.target.value)} /></label><label>Đến ngày<input required type="date" min={data.startDate} value={data.endDate || ''} onChange={event => field('endDate', event.target.value)} /></label><label>Tổng giờ cần trong khoảng ngày<input required type="number" min="0.1" step="0.1" value={data.hours || ''} onChange={event => field('hours', event.target.value)} /></label><label>Xác suất (%)<input required type="number" min="0" max="100" step="1" value={data.probability ?? 100} onChange={event => field('probability', event.target.value)} /></label></div>
    </>}
    {editor.kind === 'settings' && <label>Thời gian tuyển chuẩn (ngày lịch)<input required type="number" min="1" max="730" value={data.leadDays} onChange={event => field('leadDays', event.target.value)} /></label>}
    {editor.kind === 'taskRoles' && <label>Task<select required value={data.taskKey || ''} onChange={event => field('taskKey', event.target.value)}><option value="">Chọn task</option>{tasks.map(task => <option key={task.forecastKey} value={task.forecastKey}>{task.code} · {task.title}</option>)}</select></label>}
    {editor.kind === 'recruitments' && <>
      <label>Trạng thái<select value={data.status} onChange={event => { field('status', event.target.value); if (RECRUITMENT_STAGES.indexOf(event.target.value) >= 2 && !data.openedAt) field('openedAt', dateKey(new Date())); }}>{RECRUITMENT_STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label>
      <div className="forecast-form-grid"><label>Ngày đăng tuyển<input type="date" required={RECRUITMENT_STAGES.indexOf(data.status) >= 2} value={data.openedAt || ''} onChange={event => field('openedAt', event.target.value)} /></label><label>Dự kiến nhận việc (để trống: tự tính)<input type="date" required={data.status === 'Nhận việc'} min={data.openedAt} value={data.expectedStart || ''} onChange={event => field('expectedStart', event.target.value)} /></label></div>
      <label>Phương án tạm<textarea rows="3" value={data.temporary || ''} onChange={event => field('temporary', event.target.value)} placeholder="Thuê ngoài, tăng giờ, điều chuyển..." /></label>
      <label>Ghi chú tuyển dụng<textarea rows="2" value={data.notes || ''} onChange={event => field('notes', event.target.value)} /></label>
    </>}
    {error && <p className="forecast-error" role="alert">{error}</p>}
    <div className="forecast-modal-actions"><button type="button" onClick={onClose} disabled={saving}>Hủy</button><button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
  </form></ModalOverlay>;
}

export default function WorkforcePlanning({ search, view = 'position' }) {
  const { employees, tasks, ganttItems, projects, currentTime, permissions } = useApp();
  const [plan, setPlan] = useState(blankPlan);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const today = dateKey(currentTime);
  useEffect(() => {
    let active = true;
    const refresh = () => api.getWorkforcePlan().then(response => { if (active) { setPlan(response.data); setError(''); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    refresh();
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const forecast = useMemo(() => buildWorkforceForecast({ employees, tasks, ganttItems, projects, plan, now: new Date(`${today}T12:00:00`) }), [employees, tasks, ganttItems, projects, plan, today]);
  const matches = row => positionKey(`${row.name} ${row.employees?.map(employee => `${employee.name} ${employee.code} ${employee.team}`).join(' ')}`).includes(positionKey(search));
  const filteredRows = forecast.rows.filter(matches);
  const recruitment = forecast.recruitment.filter(matches);
  const positions = [...new Set([...employees.map(employeePosition), ...forecast.rows.map(row => row.name)])];
  // Ma trận "Ngân sách giờ công": Leader chỉ xem, QL cấp trung lập/sửa, Giám đốc duyệt.
  const open = (kind, data, id) => {
    if (!permissions.editWorkforce) { setError('Vai trò của bạn chỉ được xem kế hoạch nhân lực; QL cấp trung lập và Giám đốc duyệt.'); return; }
    setError(''); setEditor({ kind, data, id });
  };
  const save = async (kind, data, id, remove = false) => {
    if(kind==='recruitments'){const row=forecast.recruitment.find(r=>positionKey(r.position)===positionKey(data.position)&&r.needMonth===data.needMonth);const expected=data.expectedStart||row?.expectedStart;if(row&&expected>row.needDate&&!String(data.temporary||'').trim()){setError('Đợt tuyển dự kiến trễ: cần phương án tạm (thuê ngoài, làm thêm giờ hoặc lùi việc).');return;}}
    setSaving(true);
    try { const response = await api.updateWorkforcePlan({ kind, data, id, remove }); setPlan(response.data); setEditor(null); setError(''); }
    catch (error) { setError(error.message); }
    finally { setSaving(false); }
  };
  return <div className="workforce-planning">
    {error && !editor && <div role="alert" className="forecast-error">Không đồng bộ được kế hoạch: {error}. Kiểm tra máy chủ; nếu vừa cập nhật code, khởi động lại backend.</div>}
    {loading ? <p role="status">Đang tải kế hoạch nhân lực...</p> : <>
      <div className="forecast-kpis"><article><span>Cần tuyển</span><strong>{forecast.needed} người</strong><small>{forecast.recruitment.map(row => `${row.quantity} ${row.position}`).join(' · ') || 'Chưa có vị trí thiếu từ 0,8 người'}</small></article><article><span>Tuyển kịp hạn</span><strong>{forecast.onTime} / {forecast.recruitment.length} vị trí</strong><small>{forecast.recruitment.filter(row => row.lateDays > 0).map(row => `${row.position} trễ ${row.lateDays} ngày`).join(' · ') || 'Theo ngày nhận việc dự kiến'}</small></article><article><span>Còn trống nhận việc</span><strong>{number(forecast.spareDays)} công</strong><small>Trong 3 tháng tới · 8 giờ/công</small></article></div>
      <section className="forecast-card"><div className="forecast-card-heading"><h2>Tải nhân lực 6 tháng tới theo {view === 'position' ? 'vị trí' : 'nhân viên'}</h2><span>Giờ việc còn lại + nhu cầu bổ sung × xác suất / năng lực tháng</span></div>
        <div className="forecast-scroll"><table className="forecast-heatmap"><thead><tr><th>{view === 'position' ? 'Vị trí' : 'Nhân viên / vị trí'}</th>{forecast.months.map(month => <th key={month.key}>{month.label}</th>)}<th>Thiếu (+) / thừa (−) người</th></tr></thead><tbody>
          {filteredRows.flatMap(row => {
            const displayRows = view === 'position' ? [{ key: row.key, name: row.name, count: row.employees.length, cells: row.cells, peakGap: row.peakGap }] : row.employees.filter(employee => positionKey(`${employee.name} ${employee.code} ${employee.team || ''} ${employee.title || ''}`).includes(positionKey(search))).map(employee => ({ key: employee.id, name: employee.name, subtitle: `${employee.code} · ${row.name}`, cells: forecast.employeeRows?.find(item => item.id === employee.id)?.cells || row.cells, peakGap: null }));
            return displayRows.map(item => <tr key={item.key}><th>{item.name} {item.count !== undefined && <small>({item.count} người)</small>}{item.subtitle && <small className="forecast-person-subtitle">{item.subtitle}</small>}</th>{item.cells.map((cell, index) => <td key={forecast.months[index].key}><div className={`forecast-load ${tone(cell.percent)}`} title={`${number(cell.demand)}h dự kiến / ${number(cell.capacity)}h năng lực\n${cell.sources.join('\n')}`}>{Number.isFinite(cell.percent) ? `${Math.round(cell.percent)}%` : 'Thiếu người'}</div></td>)}<td className={item.peakGap >= 0.8 ? 'forecast-danger' : 'forecast-gap'}>{item.peakGap == null ? '—' : `${item.peakGap > 0 ? '+' : ''}${number(item.peakGap)}`}</td></tr>);
          })}
          {!filteredRows.length && <tr><td colSpan="8">Chưa có dữ liệu phù hợp.</td></tr>}
        </tbody></table></div><div className="forecast-legend"><span className="low">&lt;70% thiếu việc</span><span className="balanced">70–90% hợp lý</span><span className="tight">90–105% căng</span><span className="over">&gt;105% quá tải</span><small>Thiếu ≥ 0,8 người: đề xuất tuyển; 0–0,8: cân nhắc thêm giờ / thuê ngoài. Cột thiếu/thừa lấy tháng thiếu cao nhất.</small></div>
      </section>
      {forecast.cancellationSuggestions.length>0&&<section className="forecast-card"><div className="forecast-card-heading"><h2>Đề nghị hủy tuyển · Thiếu đã giảm dưới 0,5 người</h2></div>{forecast.cancellationSuggestions.map(row=><div className="forecast-card-heading" key={`${row.position}:${row.needMonth}`}><span>{row.position} · {row.needMonth} · {row.status}</span><button disabled={saving} onClick={async()=>{const reason=window.prompt('Giám đốc xác nhận lý do hủy tuyển');if(!reason)return;setSaving(true);try{const current=await deliveryApi.operations({});await deliveryApi.mutateOperations({action:'recruitmentCancel',revision:current.data.revision,value:{position:row.position,needMonth:row.needMonth,reason}});setPlan((await api.getWorkforcePlan()).data);}catch(e){setError(e.message);}finally{setSaving(false);}}}>Giám đốc xác nhận hủy</button></div>)}</section>}
      <section className="forecast-card"><div className="forecast-card-heading"><h2>Kế hoạch tuyển dụng</h2><span>Tự đề xuất khi thiếu ≥ 0,8 người · mục tiêu có mặt trước ngày cần</span><button onClick={() => open('settings', { position: '', leadDays: 45 })}>Thời gian tuyển theo vị trí</button></div><div className="forecast-scroll"><table className="recruitment-table"><thead><tr>{['Vị trí', 'Lý do', 'Cần có mặt từ', 'Thời gian tuyển', 'Hạn mở tuyển', 'Trạng thái tuyển', 'Dự kiến nhận việc', 'Kịp / trễ', 'Phương án tạm'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{recruitment.map(row => <tr key={row.key}>
        <th>{row.quantity} {row.position}</th><td>{row.reason}</td><td><b>{displayDate(row.needDate)}</b></td><td><button className="forecast-text-button" onClick={() => open('settings', { position: row.position, leadDays: row.leadDays })}>{row.leadDays} ngày ✎</button></td><td>{displayDate(row.deadline)}<small>{row.openedAt ? `Đăng tuyển ${displayDate(row.openedAt)}` : row.deadline < today ? `Quá hạn ${dateDifference(today, row.deadline)} ngày` : `Còn ${dateDifference(row.deadline, today)} ngày`}</small></td><td><button className="recruitment-stages" onClick={() => open('recruitments', { position: row.position, needMonth: row.needMonth, status: row.status, openedAt: row.openedAt, expectedStart: (plan.recruitments || []).find(saved => positionKey(saved.position) === row.key && saved.needMonth === row.needMonth)?.expectedStart || '', temporary: row.temporary || '', notes: row.notes || '' })} aria-label={`Cập nhật tuyển ${row.position}`}>{RECRUITMENT_STAGES.map((stage, index) => <span key={stage} className={index <= RECRUITMENT_STAGES.indexOf(row.status) ? 'reached' : ''}>{stage}</span>)}</button><small>{row.notes || 'Nhấn để cập nhật trạng thái'}</small></td><td>{displayDate(row.expectedStart)}</td><td><span className={`recruitment-timing ${row.lateDays > 0 ? 'late' : 'on-time'}`}>{row.lateDays > 0 ? `Trễ ${row.lateDays} ngày` : 'Kịp hạn'}</span></td><td>{row.temporary || '—'}</td>
      </tr>)}{!recruitment.length && <tr><td colSpan="9">Chưa có vị trí cần tuyển theo tải công việc hiện tại.</td></tr>}</tbody></table></div>
        <RecruitmentTimeline rows={recruitment} now={currentTime} months={forecast.months} />
        <p className="forecast-formula">Cần có mặt: ngày làm việc đầu tiên của tháng đầu quá tải &gt;105%. Hạn mở tuyển = cần có mặt − thời gian tuyển. Chưa đăng tuyển: dự kiến nhận việc = ngày muộn hơn giữa hôm nay và hạn mở tuyển + thời gian tuyển. Kịp/trễ = dự kiến nhận việc − cần có mặt. “Nhận việc” không tự tạo hồ sơ nhân sự; hãy thêm nhân sự thực tế để tải và nhu cầu tuyển cập nhật.</p>
      </section>
      <section className="forecast-card"><div className="forecast-card-heading"><h2>Nhu cầu bổ sung & dự án sắp ký</h2><button disabled={saving} onClick={() => open('demands', { position: '', projectName: '', startDate: forecast.months[0].start, endDate: forecast.months[0].end, hours: '', probability: 100 })}>+ Thêm nhu cầu</button></div>
        <div className="forecast-scroll"><table className="forecast-demand-table"><thead><tr><th>Dự án / nội dung</th><th>Vị trí</th><th>Khoảng ngày</th><th>Tổng giờ</th><th>Xác suất</th><th>Thao tác</th></tr></thead><tbody>{plan.demands.map(demand => <tr key={demand.id}><td>{projects.find(project => project.id === demand.projectId)?.name || demand.projectName}</td><td>{demand.position}</td><td>{displayDate(demand.startDate)} – {displayDate(demand.endDate)}</td><td>{number(demand.hours)}h</td><td>{demand.probability}%</td><td><button disabled={saving} onClick={() => open('demands', demand, demand.id)}>Sửa</button> <button disabled={saving} onClick={() => { if (window.confirm('Xóa nhu cầu bổ sung này?')) save('demands', {}, demand.id, true); }}>Xóa</button></td></tr>)}{!plan.demands.length && <tr><td colSpan="6">Chưa nhập nhu cầu bổ sung. Tải hiện tại lấy từ task/Gantt, không giả định có dự án sắp ký.</td></tr>}</tbody></table></div>
        {forecast.unresolved.length > 0 && <div className="forecast-unresolved"><span>{forecast.unresolved.length} task chưa xác định vị trí; tải vẫn hiện ở nhóm riêng và chưa tự đề xuất tuyển.</span><button onClick={() => open('taskRoles', { position: '', taskKey: '' })}>Gắn vị trí cho task</button></div>}
        <p className="forecast-formula">Năng lực theo ca chuẩn từng nhân sự: Thứ 2–6 đủ ngày, Thứ 7 nửa ngày, Chủ nhật/ngày lễ nghỉ. Giờ task tuân theo lựa chọn làm/nghỉ ngày lễ đã lưu; chỉ tính phần việc còn lại và không cộng trùng task với Gantt. Nhu cầu bổ sung phân bổ theo ngày làm việc, nhân xác suất. Khi đưa nhu cầu này vào Gantt, xóa dòng bổ sung tương ứng.</p>
      </section>
    </>}
    {editor && <PlanEditor key={`${editor.kind}:${editor.id || editor.data.position || ''}`} editor={editor} onClose={() => { if (!saving) { setEditor(null); setError(''); } }} onSave={save} saving={saving} error={error} positions={positions} projects={projects} tasks={forecast.unresolved} />}
  </div>;
}
