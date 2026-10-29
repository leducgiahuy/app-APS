import { useMemo, useState } from 'react';
import { usePageAccess } from '../../context/PageAccessContext';
import { DEFAULT_PROCEDURES } from '../../utils/deliveryResources';
import { formatCompactMoney } from '../../utils/deliveryMetrics';
import { shortDateTime } from './DeliveryRow';

const views = [
  ['catalog', 'Danh mục, kiểm tra, phát hành'],
  ['feedback', 'Góp ý & trả lời'],
  ['permits', 'Xin phép']
];

const viDate = value => value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const documentStatusClass = status => status === 'Có kết quả' ? 'success' : status === 'Bổ sung' ? 'danger' : status === 'Đã nộp' ? 'warning' : '';

export default function DeliveryLegalWorkspace({ contextBar, data, items, employees, disabled, open, onOpenTask, currentTime }) {
  const [viewChoice, setView] = useState('catalog');
  // Tab con theo ma trận Trang & mục (Dự án → Hồ sơ).
  const { canSee } = usePageAccess();
  const visibleViews = views.filter(([key]) => canSee(`gantt.legal.${key}`));
  const view = visibleViews.some(([key]) => key === viewChoice) ? viewChoice : visibleViews[0]?.[0];
  const [selectedId, setSelectedId] = useState('');
  const stored = useMemo(() => [...(data.documents || [])].sort((a, b) => (a.order || 0) - (b.order || 0)), [data.documents]);
  const rows = useMemo(() => {
    const matched = new Set();
    const templateRows = DEFAULT_PROCEDURES.map((procedure, index) => {
      const document = stored.find(row => row.procedureKey === procedure.procedureKey);
      if (document) matched.add(document.id);
      const task = items.find(item => item.id === document?.taskId) || items.find(item => (procedure.taskCodes || []).includes(item.code));
      return { ...procedure, ...document, document, task, rowKey: document?.id || `procedure:${procedure.procedureKey}`, order: document?.order || index + 1 };
    });
    return [...templateRows, ...stored.filter(row => !matched.has(row.id)).map((document, index) => ({ ...document, document, task: items.find(item => item.id === document.taskId), rowKey: document.id, order: document.order || templateRows.length + index + 1 }))];
  }, [items, stored]);
  const selected = rows.find(row => row.rowKey === selectedId) || rows.find(row => row.document) || rows[0];
  const canEdit = !disabled && ['leader', 'manager', 'director', 'admin'].includes(data.viewer.role);
  const employeeName = id => employees.find(employee => employee.id === id)?.name || 'Chưa giao';
  const editDocument = row => open('document', row.document || { title: row.title, authority: row.authority, processingTime: row.processingTime || '', fee: row.fee ?? null, procedureKey: row.procedureKey, taskId: row.task?.id || '', order: row.order }, row.document?.id);
  const feedback = rows.flatMap(row => (row.events || []).filter(event => ['request', 'feedback', 'reply'].includes(event.type)).map(event => ({ ...event, document: row })));
  const now = currentTime?.getTime() || 0;
  const overdueFeedback = feedback.filter(event => event.dueAt && Date.parse(event.dueAt) < now && !event.completedAt).length;
  const pendingFeedback = feedback.filter(event => !event.completedAt && !event.evidenceId).length;
  const processingDays = feedback.filter(event => event.completedAt && event.at).map(event => Math.max(0, (Date.parse(event.completedAt) - Date.parse(event.at)) / 86400000));
  const averageDays = processingDays.length ? Math.round(processingDays.reduce((sum, value) => sum + value, 0) / processingDays.length) : 0;
  const permitRows = rows.filter(row => /permit|environment|fire|pccc|gpxd|phép|môi trường/i.test(`${row.procedureKey || ''} ${row.title || ''} ${row.authority || ''}`));
  const visiblePermits = permitRows.length ? permitRows : rows;

  return <div className="legal-workspace">
    <div className="legal-view-switch" role="tablist" aria-label="Các mục hồ sơ">
      {visibleViews.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {contextBar?.()}

    {view === 'catalog' && <div className="legal-flat-stack">
      <section className="legal-flat-panel">
        <header><div><b>Danh mục hồ sơ giao nộp</b><small>Lập từ dữ liệu hồ sơ và công việc của dự án đang chọn</small></div><button disabled={!canEdit} onClick={() => open('document')}>+ Hồ sơ</button></header>
        <div className="legal-table-scroll"><table><thead><tr><th>Mã</th><th>Hồ sơ</th><th>Nộp cho</th><th>Bộ môn · chủ trì</th><th>Việc</th><th>Lần phát hành</th><th>Kiểm tra</th><th>Nộp</th><th>Góp ý</th><th>Nghiệm thu / kết quả</th>{data.permissions.financial && <th>Phí / lệ phí</th>}<th>Trạng thái</th></tr></thead><tbody>
          {rows.map((row, index) => { const events = row.events || []; const requests = events.filter(event => event.type === 'request'); const submissions = events.filter(event => event.type === 'submission'); const results = events.filter(event => event.type === 'result'); const done = (row.components || []).filter(component => component.status === 'Xong').length; return <tr key={row.rowKey} className={selected?.rowKey === row.rowKey ? 'selected' : ''} onClick={() => setSelectedId(row.rowKey)}>
            <td><b>{row.code || `HS-${String(index + 1).padStart(2, '0')}`}</b></td><td><button className="legal-row-link" onClick={event => { event.stopPropagation(); editDocument(row); }}>{row.title}</button></td><td>{row.authority || 'Chưa xác định'}</td><td>{row.department || employeeName(row.components?.[0]?.employeeId)}</td><td>{row.task ? <button className="legal-row-link" onClick={event => { event.stopPropagation(); onOpenTask?.(row.task); }}>{row.task.code}</button> : '—'}</td><td>{row.release || (submissions.length ? submissions.length : '—')}</td><td>{row.components?.length ? `${done}/${row.components.length} ✓` : '—'}</td><td>{submissions[0] ? `${viDate(submissions[0].at)}${submissions[0].reference ? ` · ${submissions[0].reference}` : ''}` : row.dueAt ? `Hạn ${shortDateTime(row.dueAt)}` : '—'}</td><td>{requests.length ? `${requests.length} ý` : '—'}</td><td>{results[0]?.title || (row.expectedAt ? `Dự kiến ${viDate(row.expectedAt)}` : '—')}</td>{data.permissions.financial && <td>{row.fee ? formatCompactMoney(row.fee) : '—'}</td>}<td><span className={`delivery-pill ${documentStatusClass(row.status)}`}>{row.status || 'Chưa đến'}</span></td>
          </tr>; })}
        </tbody></table></div>
      </section>

      {selected && <section className="legal-flat-panel">
        <header><div><b>Phiếu kiểm tra · {selected.code || selected.title}</b><small>Mỗi thành phần hồ sơ là một dòng kiểm tra</small></div><button disabled={!canEdit || !selected.document} onClick={() => open('documentComponent', { documentId: selected.id })}>+ Nội dung kiểm tra</button></header>
        <div className="legal-table-scroll"><table><thead><tr><th>#</th><th>Nội dung</th><th>Người sửa</th><th>Tình trạng</th><th></th></tr></thead><tbody>{(selected.components || []).map((component, index) => <tr key={component.id}><td>{index + 1}</td><td>{component.title}</td><td>{employeeName(component.employeeId)}</td><td><span className={`delivery-pill ${component.status === 'Xong' ? 'success' : component.status === 'Chờ CĐT ký' ? 'danger' : 'warning'}`}>{component.status}</span></td><td><button disabled={!canEdit} onClick={() => open('documentComponent', { ...component, documentId: selected.id }, component.id)}>Sửa</button></td></tr>)}{!(selected.components || []).length && <tr><td colSpan="5">Chưa có nội dung kiểm tra.</td></tr>}</tbody></table></div>
      </section>}

      <section className="legal-flat-panel">
        <header><div><b>Phiếu giao nhận</b><small>Mỗi lần phát hành hoặc nộp hồ sơ là một dòng</small></div>{selected && <button disabled={!canEdit || !selected.document} onClick={() => open('documentEvent', { documentId: selected.id, type: 'submission' })}>+ Phiếu giao nhận</button>}</header>
        <div className="legal-table-scroll"><table><thead><tr><th>Phiếu</th><th>Hồ sơ</th><th>Ngày</th><th>Hình thức / nội dung</th><th>Người nhận</th><th>Xác nhận</th></tr></thead><tbody>{rows.flatMap(row => (row.events || []).filter(event => ['submission', 'result'].includes(event.type)).map((event, index) => <tr key={`${row.rowKey}:${event.id}`}><td><b>{event.reference || `GN-${String(index + 1).padStart(3, '0')}`}</b></td><td>{row.code || row.title}</td><td>{viDate(event.at)}</td><td>{event.title}</td><td>{employeeName(event.employeeId)}</td><td>{event.evidenceId ? '✓ Có bằng chứng' : 'Chưa đính kèm'}</td></tr>))}{!rows.some(row => (row.events || []).some(event => ['submission', 'result'].includes(event.type))) && <tr><td colSpan="6">Chưa có phiếu giao nhận.</td></tr>}</tbody></table></div>
      </section>
    </div>}

    {view === 'feedback' && <div className="legal-flat-stack">
      <div className="legal-feedback-kpis"><section><small>Góp ý hồ sơ</small><b>{feedback.length} ý</b><span>{pendingFeedback} ý chưa đóng</span></section><section className="danger"><small>Quá hạn</small><b>{overdueFeedback}</b><span>Cần xử lý ngay</span></section><section className="warning"><small>Chờ khách xác nhận đóng</small><b>{pendingFeedback}</b><span>Đang chờ bằng chứng hoặc phản hồi</span></section><section><small>Xử lý bình quân</small><b>{averageDays} ngày</b><span>Tính từ nhật ký đã hoàn thành</span></section></div>
      <section className="legal-flat-panel"><header><div><b>Góp ý và trả lời · {selected?.title || 'Hồ sơ'}</b><small>Mỗi ý một dòng, lưu nguồn, người xử lý, hạn và bằng chứng</small></div><button className="primary" disabled={!canEdit || !selected?.document} onClick={() => open('documentEvent', { documentId: selected.id, type: 'request' })}>+ Góp ý</button></header><div className="legal-table-scroll"><table><thead><tr><th>#</th><th>Ý kiến</th><th>Hồ sơ</th><th>Nguồn</th><th>Người xử lý</th><th>Hạn</th><th>Xong</th><th>Trạng thái</th><th></th></tr></thead><tbody>{feedback.map((event, index) => <tr key={event.id}><td>{index + 1}</td><td>{event.title}</td><td>{event.document.code || event.document.title}</td><td>{event.reference || 'Nhật ký hồ sơ'}</td><td>{employeeName(event.employeeId)}</td><td>{event.dueAt ? viDate(event.dueAt) : '—'}</td><td>{event.completedAt ? viDate(event.completedAt) : '—'}</td><td><span className={`delivery-pill ${event.completedAt ? 'success' : event.dueAt && Date.parse(event.dueAt) < now ? 'danger' : 'warning'}`}>{event.completedAt ? 'Đã xử lý' : 'Đang xử lý'}</span></td><td><button disabled={!canEdit} onClick={() => open('documentEvent', { ...event, documentId: event.document.id }, event.id)}>Sửa</button></td></tr>)}{!feedback.length && <tr><td colSpan="9">Chưa có góp ý. Chọn hồ sơ ở mục Danh mục rồi thêm góp ý.</td></tr>}</tbody></table></div></section>
    </div>}

    {view === 'permits' && <div className="legal-flat-stack">
      <section className="legal-flat-panel"><header><div><b>Hồ sơ xin phép đang chạy</b><small>Theo dõi nơi nộp, thời hạn, giấy tờ và kết quả</small></div><button disabled={!canEdit} onClick={() => open('document')}>+ Hồ sơ xin phép</button></header><div className="legal-table-scroll"><table><thead><tr><th>Hồ sơ</th><th>Cơ quan</th><th>Nộp</th><th>Đã giữ / thời hạn</th><th>Lần bị trả</th><th>Giấy tờ CĐT</th>{data.permissions.financial && <th>Chi hộ lệ phí</th>}<th>Tình trạng</th></tr></thead><tbody>{visiblePermits.map((row, index) => { const submissions = (row.events || []).filter(event => event.type === 'submission'); const requests = (row.events || []).filter(event => event.type === 'request'); const done = (row.components || []).filter(component => component.status === 'Xong').length; return <tr key={row.rowKey} onClick={() => setSelectedId(row.rowKey)}><td><button className="legal-row-link" onClick={event => { event.stopPropagation(); editDocument(row); }}><b>{row.code || `HS-${String(index + 1).padStart(2, '0')}`}</b> {row.title}</button></td><td>{row.authority || 'Chưa xác định'}</td><td>{submissions[0] ? viDate(submissions[0].at) : '—'}</td><td>{row.processingTime || (row.expectedAt ? `Đến ${viDate(row.expectedAt)}` : '—')}</td><td>{requests.length || 0}</td><td>{row.components?.length ? `${done}/${row.components.length}` : '—'}</td>{data.permissions.financial && <td>{row.fee ? formatCompactMoney(row.fee) : '—'}</td>}<td><span className={`delivery-pill ${documentStatusClass(row.status)}`}>{row.status || 'Chưa đến'}</span></td></tr>; })}</tbody></table></div></section>
      {selected && <section className="legal-flat-panel"><header><div><b>Nhật ký nộp và phản hồi · {selected.code || selected.title}</b><small>Mỗi lần nộp, nhận phản hồi hoặc bổ sung là một dòng</small></div><button disabled={!canEdit || !selected.document} onClick={() => open('documentEvent', { documentId: selected.id })}>+ Nhật ký</button></header><div className="legal-table-scroll"><table><thead><tr><th>Ngày</th><th>Việc</th><th>Người</th><th>Kết quả / ghi chú</th><th></th></tr></thead><tbody>{(selected.events || []).map(event => <tr key={event.id}><td>{viDate(event.at)}</td><td>{event.title}</td><td>{employeeName(event.employeeId)}</td><td>{event.reference || (event.evidenceId ? 'Có bằng chứng đính kèm' : '—')}</td><td><button disabled={!canEdit} onClick={() => open('documentEvent', { ...event, documentId: selected.id }, event.id)}>Sửa</button></td></tr>)}{!(selected.events || []).length && <tr><td colSpan="5">Chưa có nhật ký nộp và phản hồi.</td></tr>}</tbody></table></div></section>}
      <section className="legal-flat-panel"><header><div><b>Danh mục thủ tục tham chiếu</b><small>Cập nhật hồ sơ thực tế khi quy định hoặc cơ quan thay đổi</small></div></header><div className="legal-table-scroll"><table><thead><tr><th>Thủ tục</th><th>Cơ quan</th><th>Thời hạn</th><th>Giấy tờ / ghi chú</th></tr></thead><tbody>{DEFAULT_PROCEDURES.map(procedure => <tr key={procedure.procedureKey}><td><b>{procedure.title}</b></td><td>{procedure.authority || '—'}</td><td>{procedure.processingTime || '—'}</td><td>{procedure.notes || 'Theo hồ sơ và yêu cầu của cơ quan tiếp nhận'}</td></tr>)}</tbody></table></div></section>
    </div>}
  </div>;
}
