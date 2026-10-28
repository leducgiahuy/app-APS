import { canEditProgressTask, deliveryView, ownsDeliveryTask } from '../../utils/deliveryView';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DELIVERY_LEVELS, DELIVERY_LABELS, deliveryLabel, formatMoney, formatCompactMoney } from '../../utils/deliveryMetrics';
import { isTaskOverdue } from '../../utils/date';
import { shortDateTime } from './DeliveryRow';
import { deliveryApi } from './deliveryApi';
import { useApp } from '../../context/AppContext';

const number = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const inputTime = value => value ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16) : '';
const isoTime = value => value ? `${value}:00+07:00` : '';
// Ô chọn gốc không căn cột được bằng CSS: đệm khoảng trắng rộng bằng một chữ số (U+2007) để "0%", "20%", "100%" thẳng hàng.
const levelOptionPrefix = level => `${String(level).padStart(3, ' ')}%`;
const evidenceNames = { handover: 'Email / biên bản giao', receipt: 'Biên nhận / mã hồ sơ', feedback: 'Văn bản góp ý / bổ sung', approval: 'Văn bản / email chấp thuận', other: 'Khác' };

export default function DeliveryDrawer({ item, data, projectId, delivery, employees, onClose, onEdit, onAssign, onDelete, onAddSibling, onAddChild, onAddGroup, onSaveNote, readOnly, initialSection, scrollbarWidth = 0 }) {
  const { showToast } = useApp();
  const record = data?.records?.[item.id];
  const metric = data?.taskMetrics?.[item.id];
  const [draft, setDraft] = useState(record || {});
  const draftLoaded = useRef(Boolean(record));
  useEffect(() => { if (!draftLoaded.current && record) { setDraft(record); draftLoaded.current = true; } }, [record]);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [groupNote, setGroupNote] = useState(item.ganttNote || '');
  const [evidenceKind, setEvidenceKind] = useState('handover');
  const [sheet, setSheet] = useState({ employeeId: data?.viewer.employeeId || '', date: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10), hours: '', shiftType: 'regular' });
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const group = item.isGroup || item.isProjectHeader || item.hasTaskChildren;
  const financial = data?.permissions.financial;
  const disabled = readOnly || delivery.saving;
  const roleView = deliveryView(data?.viewer.role);
  const canEdit = !readOnly && canEditProgressTask(data?.viewer, item, employees);
  const canManage = Boolean(data?.permissions.manage);
  const canConfirm = roleView.confirm && canEdit && !ownsDeliveryTask(data?.viewer, item) && data?.viewer.email !== record?.submittedBy;
  const completedTask = item.status === 'completed' || metric?.completedCount > 0;
  const overdueTask = !completedTask && isTaskOverdue(item);
  const changeLevel = event => {
    const level = Number(event.target.value);
    const label = DELIVERY_LABELS[draft.kind || 'design'][DELIVERY_LEVELS.indexOf(level)];
    const approvedHours = Number(metric?.actualHours) || 0;
    if (completedTask && level < 40) {
      window.alert('Task đã hoàn thành nên chỉ có thể chọn mức trạng thái từ 40% trở lên. Không thể chọn 0% hoặc 20%.');
      return;
    }
    if (!overdueTask && level === 20 && approvedHours <= 0) {
      window.alert('Chưa thể chọn 20% · Đang làm vì task chưa có giờ công được duyệt. Nguyên nhân thường là task chưa giao người, chưa tới ngày làm hoặc phiếu giờ chưa được duyệt.');
      return;
    }
    if (!overdueTask && level === 0 && approvedHours > 0) {
      window.alert(`Chưa thể chọn 0% · ${label} vì task đã có ${approvedHours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ công được duyệt.`);
      return;
    }
    setDraft(previous => ({ ...previous, level }));
  };
  const saveTaskInformation = async () => {
    const level = Number(draft.level ?? 0);
    const label = DELIVERY_LABELS[draft.kind || 'design'][DELIVERY_LEVELS.indexOf(level)];
    await delivery.mutate('task', draft, item.id);
    showToast(`Đã cập nhật thông tin task · ${level}% · ${label}`);
  };
  const run = async action => { try { setError(''); await action(); } catch (error) { setError(error.message); } };
  useEffect(() => { const previousFocus = document.activeElement; closeRef.current?.focus(); const escape = event => { if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) onCloseRef.current(); }; document.addEventListener('keydown', escape); if (initialSection === 'comments') panelRef.current?.querySelector('#delivery-comments')?.scrollIntoView({ block: 'center' }); return () => { document.removeEventListener('keydown', escape); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); }; }, [initialSection]);
  return createPortal(<aside ref={panelRef} className="delivery-drawer" style={{ right: scrollbarWidth }} role="complementary" aria-label={`Chi tiết ${item.title}`}><header><div><small>{item.code || 'Dự án'} · {draft.kind === 'legal' ? 'Pháp lý' : 'Thiết kế'}</small><h2>{item.title}</h2></div><button ref={closeRef} onClick={onClose} aria-label="Đóng chi tiết"><X size={17} /></button></header>
    <div className="delivery-drawer-body">
      <section><h3>Thông tin việc</h3><dl><dt>Thời gian</dt><dd>{item.startDate?.split('-').reverse().join('/')} → {item.endDate?.split('-').reverse().join('/')} · {item.days || '—'} ngày</dd><dt>Công DT / Công TT</dt><dd>{number(metric?.planned)} / {number(metric?.actual)} công{metric?.weight != null && ` · tỷ trọng ${number(metric.weight * 100)}%`}</dd>{!group && <><dt>Trạng thái · bậc</dt><dd>{record ? `${record.level}% · ${deliveryLabel(record)}` : 'Chưa có dữ liệu'}</dd><dt>% ghi nhận</dt><dd><b>{metric?.recognized ?? '—'}%</b>{metric?.recognized < record?.level && <small className="delivery-danger"> Chưa đủ bằng chứng / xác nhận</small>}</dd><dt>Bằng chứng</dt><dd>{data?.evidence.find(file => file.id === record?.evidenceId)?.name || 'Chưa đính kèm'}</dd><dt>Leader xác nhận</dt><dd>{record?.confirmedBy ? `${record.confirmedBy} · ${shortDateTime(record.confirmedAt)}` : 'Chưa xác nhận'}</dd></>}{financial && <><dt>Sản lượng</dt><dd>{formatCompactMoney(metric?.output)}</dd></>}<dt>Ngày tạo</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : 'Dữ liệu cũ chưa có ngày'}</dd></dl>
        {canManage && <div className="delivery-action-strip"><button onClick={onEdit} disabled={disabled}>Sửa thời gian / tên</button>{!group && <button onClick={onAssign} disabled={disabled}>Phân công</button>}<button onClick={onAddSibling} disabled={disabled}>+ Task</button>{!item.isProjectHeader && <button onClick={onAddChild} disabled={disabled}>+ Task con</button>}{item.isGroup && <button onClick={onAddGroup} disabled={disabled}>+ Mục con</button>}<button onClick={onDelete} disabled={disabled}>Xóa</button></div>}
      </section>
      {group && !item.isProjectHeader && <section><h3>Ghi chú</h3><textarea rows="4" value={groupNote} onChange={event => setGroupNote(event.target.value)} disabled={readOnly || !canManage} />{canManage && <button disabled={disabled} onClick={() => run(() => onSaveNote(groupNote))}>Lưu ghi chú</button>}</section>}
      {item.isProjectHeader && item.description && <section><h3>Mô tả dự án</h3><p style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p></section>}
      {!group && record && <form onSubmit={event => { event.preventDefault(); run(saveTaskInformation); }}><section><h3>Cập nhật trạng thái & giao hồ sơ</h3>
        <label>Loại việc<select disabled={!canEdit || !canManage} value={draft.kind || 'design'} onChange={event => setDraft({ ...draft, kind: event.target.value })}><option value="design">Thiết kế</option><option value="legal">Pháp lý</option></select></label>
        <label>Mức trạng thái<select className="delivery-level-select" disabled={!canEdit} value={draft.level ?? 0} onChange={changeLevel}>{DELIVERY_LEVELS.filter(level => completedTask || overdueTask || !draft.approvalOnly || level === 0 || level === 100).map(level => <option key={level} value={level}>{levelOptionPrefix(level)} · {DELIVERY_LABELS[draft.kind || 'design'][DELIVERY_LEVELS.indexOf(level)]}</option>)}</select>{completedTask && <small className="delivery-muted">Task đã hoàn thành: chỉ chọn từ 40% trở lên.</small>}{overdueTask && <small className="delivery-muted">Task quá hạn chưa hoàn thành: có thể chọn tất cả mức trạng thái.</small>}</label>
        {data.permissions.manage && <><label>Bộ môn<input disabled={readOnly} value={draft.department || ''} onChange={event => setDraft({ ...draft, department: event.target.value })} placeholder="Kiến trúc, kết cấu, MEP, pháp lý..." /></label><label className="delivery-checkbox"><input type="checkbox" disabled={readOnly} checked={Boolean(draft.approvalOnly)} onChange={event => setDraft({ ...draft, approvalOnly: event.target.checked, level: event.target.checked && draft.level !== 100 ? 0 : draft.level })} />Việc CĐT phê duyệt (chỉ 0% / 100%)</label></>}
        <label>Hạn nộp (giờ Việt Nam)<input type="datetime-local" disabled={!canEdit || !canManage} value={inputTime(draft.dueAt)} onChange={event => setDraft({ ...draft, dueAt: isoTime(event.target.value) })} /></label><label>Nơi nhận (CĐT / cơ quan)<input disabled={!canEdit || !canManage} value={draft.recipient || ''} onChange={event => setDraft({ ...draft, recipient: event.target.value })} /></label><label>Nội dung nộp<textarea disabled={!canEdit} rows="2" value={draft.submissionContent || ''} onChange={event => { const submissionContent = event.target.value; setDraft(previous => ({ ...previous, submissionContent })); }} /></label><label>Thực tế đã nộp<input type="datetime-local" disabled={!canEdit} value={inputTime(draft.sentAt)} onChange={event => setDraft({ ...draft, sentAt: isoTime(event.target.value) })} /></label>
        <label>Bằng chứng cho mức này<select disabled={!canEdit} value={draft.evidenceId || ''} onChange={event => setDraft({ ...draft, evidenceId: event.target.value })}><option value="">Chưa có bằng chứng</option>{data.evidence.filter(file => file.taskId === item.id).map(file => <option key={file.id} value={file.id}>{evidenceNames[file.kind]} · {file.name}</option>)}</select></label>
        <label>Ghi chú<textarea rows="3" disabled={!canEdit} value={draft.notes || ''} onChange={event => { const notes = event.target.value; setDraft(previous => ({ ...previous, notes })); }} /></label>
        <div className="delivery-action-strip"><button type="submit" disabled={!canEdit || disabled}>Lưu thông tin</button>{canConfirm && <button type="button" disabled={disabled || record.level < 60} onClick={() => run(() => delivery.mutate('confirm', {}, item.id))}>✓ Xác nhận mức đã lưu</button>}</div>
        {canConfirm&&record.confirmedBy&&<button type="button" disabled={disabled} onClick={()=>{const reason=window.prompt('Lý do hủy xác nhận');if(reason)run(()=>delivery.mutate('revokeConfirmation',{reason},item.id));}}>Hủy xác nhận</button>}<p className="delivery-muted">Từ 60%: đính kèm bằng chứng đúng loại rồi nhờ người có quyền xác nhận. Không được tự xác nhận. Đổi mức/bằng chứng/thời điểm nộp sẽ yêu cầu xác nhận lại.</p>
      </section></form>}
      {!group && <section><h3>Bằng chứng & tệp đính kèm</h3><label>Loại bằng chứng<select value={evidenceKind} onChange={event => setEvidenceKind(event.target.value)}>{Object.entries(evidenceNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="delivery-upload">Tải tệp (tối đa 10 MB)<input type="file" disabled={!canEdit || disabled} onChange={event => { const file = event.target.files[0]; if (file) run(async () => { const id = await delivery.upload(item.id, file, evidenceKind); setDraft(previous => ({ ...previous, evidenceId: id })); }); event.target.value = ''; }} /></label>{data?.evidence.filter(file => file.taskId === item.id).map(file => <div key={file.id}><button className="delivery-file" onClick={() => run(() => deliveryApi.download(projectId, file))}>📎 {file.name} · {evidenceNames[file.kind]}</button>{canEdit&&<button disabled={disabled} onClick={()=>{const reason=window.prompt('Lý do thu hồi bằng chứng');if(reason)run(async()=>{await delivery.mutate('revokeEvidence',{reason},item.id,file.id);if(draft.evidenceId===file.id)setDraft(previous=>({...previous,evidenceId:'',confirmedBy:'',confirmedAt:''}));});}}>Thu hồi</button>}</div>)}</section>}
      {!group && <section><h3>Phân công & giờ công</h3><table><thead><tr><th>Người</th><th>Vai trò</th><th>Giờ KH</th></tr></thead><tbody>{metric?.assignments?.map((assignment, index) => <tr key={index}><td>{employees.find(employee => employee.id === assignment.employeeId)?.name || assignment.employeeName}</td><td>{data?.permissions.manage && !disabled ? <select value={draft.assignmentRoles?.[assignment.employeeId] || 'Thực hiện'} onChange={event => setDraft(previous => ({ ...previous, assignmentRoles: { ...previous.assignmentRoles, [assignment.employeeId]: event.target.value } }))}>{['Thực hiện', 'Kiểm tra chéo (KCS)', 'Duyệt gửi (QL)'].map(role => <option key={role}>{role}</option>)}</select> : record?.assignmentRoles?.[assignment.employeeId] || 'Thực hiện'}</td><td>{number(assignment.plannedHours)}h</td></tr>)}</tbody></table><p>Tổng = Công DT × 8: <b>{number((metric?.planned || 0) * 8)}h</b></p>
        <table><thead><tr><th>Ngày / Người</th><th>Giờ TT</th><th>Duyệt</th></tr></thead><tbody>{data?.timesheets.filter(entry => entry.taskId === item.id).map(entry => <tr key={entry.id}><td>{entry.date?.split('-').reverse().join('/')}<small>{entry.employeeName}</small></td><td>{number(entry.hours)}h{entry.shiftType === 'overtime' ? ' OT' : ''}</td><td>{entry.status === 'approved' ? '✓ Đã duyệt' : entry.status === 'rejected' ? 'Từ chối' : <><span>Chờ duyệt</span>{!disabled && roleView.confirm && canEdit && <div><button onClick={() => run(() => delivery.mutate('approveTimesheet', { status: 'approved' }, null, entry.id))}>Duyệt</button><button onClick={() => run(() => delivery.mutate('approveTimesheet', { status: 'rejected' }, null, entry.id))}>Từ chối</button></div>}</>}</td></tr>)}</tbody></table><p>Tổng đã duyệt: <b>{number(metric?.actualHours)}h = {number(metric?.actual)} công</b></p>
        {financial ? <p className="delivery-cost-note">Chi phí nhân công: {formatMoney(metric?.laborCost)}. Đơn giá từng người được áp dụng trong tổng chi phí dự án.</p> : <p className="delivery-role-notice">Chỉ hiển thị giờ công; chi phí nhân công bằng tiền được ẩn với vai trò này.</p>}
        {canEdit && <details><summary>+ Bổ sung phiếu giờ công</summary><form onSubmit={event => { event.preventDefault(); run(async () => { await delivery.mutate('timesheet', { ...sheet, taskId: item.id }); setSheet(previous => ({ ...previous, hours: '' })); }); }}><label>Nhân sự<select required value={sheet.employeeId} onChange={event => setSheet({ ...sheet, employeeId: event.target.value })}><option value="">Chọn nhân sự</option>{employees.filter(employee => data?.permissions.manage || employee.id === data?.viewer.employeeId).map(employee => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label><div className="delivery-form-grid"><label>Ngày<input required type="date" value={sheet.date} onChange={event => setSheet({ ...sheet, date: event.target.value })} /></label><label>Số giờ<input required type="number" min="0.1" max="24" step="0.1" value={sheet.hours} onChange={event => setSheet({ ...sheet, hours: event.target.value })} /></label></div><label>Loại giờ<select value={sheet.shiftType} onChange={event => setSheet({ ...sheet, shiftType: event.target.value })}><option value="regular">Giờ thường</option><option value="overtime">OT có phiếu</option></select></label><p className="delivery-muted">Chỉ bổ sung giờ chưa có trong nhật ký để tránh nhập trùng. Phiếu mới luôn chờ duyệt.</p><button disabled={disabled}>Gửi phiếu</button></form></details>}
      </section>}
      {!group && <section id="delivery-comments"><h3>Thảo luận</h3>{data?.comments.filter(entry => entry.taskId === item.id).map(entry => <article className="delivery-comment" key={entry.id}><small>{entry.actor} · {shortDateTime(entry.at)}</small><p>{entry.content}</p></article>)}<form onSubmit={event => { event.preventDefault(); run(async () => { await delivery.mutate('comment', { content: comment }, item.id); setComment(previous => previous === comment ? '' : previous); }); }}><textarea required value={comment} onChange={event => setComment(event.target.value)} rows="3" placeholder="Nhập nội dung thảo luận..." disabled={readOnly} /><button disabled={disabled}>Gửi nhận xét</button></form></section>}
      {error && <p role="alert" className="delivery-error">{error}</p>}
    </div>
  </aside>, document.body);
}
