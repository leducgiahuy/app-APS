import { useState } from 'react';
import DeliveryResourceEditor from './DeliveryResourceEditor';
import DeliveryLegal from './DeliveryLegal';
import DeliveryReporting from './DeliveryReporting';
import { formatCompactMoney } from '../../utils/deliveryMetrics';
import './DeliveryResources.css';

export default function DeliveryResources({ tab, data, delivery, projectId, employees, items, refreshApp, readOnly, onOpenTask, showIT }) {
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const financial = data?.permissions.financial;
  const disabled = readOnly || delivery.saving;
  const choose = (key, label, rows) => ({ key, label, type: 'select', options: rows });
  const taskOptions = [{ value: '', label: 'Không gắn task' }, ...items.filter(item => !item.isGroup && !item.isProjectHeader).map(item => ({ value: item.id, label: `${item.code || ''} · ${item.title}` }))];
  const employeesOptions = [{ value: '', label: 'Chưa phân công' }, ...employees.map(row => ({ value: row.id, label: row.name }))];
  const files = [{ value: '', label: 'Chưa đính kèm' }, ...(data?.evidence || []).map(row => ({ value: row.id, label: row.name }))];
  const open = (action, value = {}, id) => {
    let title; let fields;
    if (action === 'document') {
      title = 'Hồ sơ pháp lý';
      fields = [{ key: 'title', label: 'Tên hồ sơ / thủ tục', required: true }, choose('taskId', 'Task liên quan', taskOptions), { key: 'authority', label: 'Cơ quan / nơi nhận' }, { key: 'order', label: 'Thứ tự trong chuỗi', type: 'number', min: 1, step: 1 }, choose('status', 'Trạng thái', ['Chuẩn bị', 'Đã nộp', 'Bổ sung', 'Có kết quả']), { key: 'dueAt', label: 'Hạn nộp (giờ Việt Nam)', type: 'datetime-local' }, { key: 'expectedAt', label: 'Dự kiến có kết quả', type: 'date' }, { key: 'processingTime', label: 'Thời hạn xử lý của thủ tục' }, { key: 'reference', label: 'Mã hồ sơ / số văn bản' }, choose('evidenceId', 'Bằng chứng', files), ...(financial ? [{ key: 'fee', label: 'Phí, lệ phí (đ)', type: 'number', min: 0 }] : [])];
      value = { status: 'Chuẩn bị', order: data.documents.length + 1, ...value, dueAt: value.dueAt ? new Date(Date.parse(value.dueAt) + 7 * 3600000).toISOString().slice(0, 16) : '' };
    }
    if (action === 'documentEvent') {
      title = 'Nhật ký làm việc với cơ quan';
      fields = [{ key: 'title', label: 'Nội dung làm việc', type: 'textarea', required: true }, { key: 'at', label: 'Ngày giờ (Việt Nam)', type: 'datetime-local', required: true }, choose('type', 'Loại sự kiện', [{ value: 'work', label: 'Làm việc' }, { value: 'submission', label: 'Nộp hồ sơ' }, { value: 'meeting', label: 'Họp / làm việc với cơ quan' }, { value: 'request', label: 'Yêu cầu bổ sung' }, { value: 'result', label: 'Nhận kết quả' }]), choose('employeeId', 'Người thực hiện', employeesOptions), { key: 'reference', label: 'Số văn bản / biên nhận' }, choose('evidenceId', 'Tệp đã đính kèm trong task', files)];
      value = { type: 'work', ...value, at: new Date(Date.parse(value.at || new Date().toISOString()) + 7 * 3600000).toISOString().slice(0, 16) };
    }
    if (action === 'documentComponent') {
      title = 'Thành phần hồ sơ';
      fields = [{ key: 'title', label: 'Tên thành phần', required: true }, choose('employeeId', 'Người phụ trách', employeesOptions), choose('status', 'Trạng thái', ['Chưa làm', 'Đang làm', 'Xong', 'Chờ CĐT ký']), choose('evidenceId', 'Tệp đính kèm', files)];
      value = { status: 'Chưa làm', ...value };
    }
    if (action === 'change') {
      title = 'Yêu cầu thay đổi của CĐT';
      fields = [{ key: 'title', label: 'Nội dung thay đổi', type: 'textarea', required: true }, choose('taskId', 'Task gốc', taskOptions), choose('scope', 'Phạm vi', ['Ngoài phạm vi', 'Trong phạm vi']), { key: 'department', label: 'Bộ môn (KT, KC, MEP...)' }, { key: 'estimatedHours', label: 'Giờ ước tính', type: 'number', min: 0 }, ...(data.permissions.manage ? [choose('reworkTaskId', 'Task làm lại riêng', taskOptions), choose('status', 'Trạng thái thực hiện', ['Đề xuất', 'Đã duyệt', 'Từ chối', 'Đang làm', 'Hoàn tất'])] : []), ...(financial ? [{ key: 'amount', label: 'Giá trị dự kiến (đ)', type: 'number', min: 0 }, { key: 'appendix', label: 'Số phụ lục hợp đồng' }] : []), ...(['director', 'admin'].includes(data.viewer.role) ? [choose('decision', 'Quyết định của Giám đốc', [{ value: 'pending', label: 'Chờ quyết định' }, { value: 'paid', label: 'Thu phí' }, { value: 'free', label: 'Miễn phí có kiểm soát' }])] : []), { key: 'notes', label: 'Lý do / phương án / ảnh hưởng', type: 'textarea' }];
      value = { status: 'Đề xuất', scope: 'Ngoài phạm vi', estimatedHours: 0, ...value, decision: value.decision || (value.status && value.status !== 'Đề xuất' ? value.free ? 'free' : 'paid' : 'pending') };
    }
    if(action==='changeAppendix'){
      title='Ký phụ lục thu phí & sinh việc bổ sung';fields=[{key:'appendix',label:'Số phụ lục',required:true},{key:'signedDate',label:'Ngày ký',type:'date',required:true},{key:'title',label:'Công việc bổ sung',required:true},{key:'amount',label:'Phí bổ sung (đồng)',type:'number',min:1,step:1,required:true},{key:'estimatedHours',label:'Giờ dự toán bổ sung',type:'number',min:.5,step:.5,required:true},{key:'startDate',label:'Bắt đầu',type:'date',required:true},{key:'endDate',label:'Kết thúc',type:'date',required:true},choose('employeeId','Nhân sự thực hiện',employeesOptions)];value={title:value.title,amount:value.amount,estimatedHours:value.estimatedHours,signedDate:new Date(Date.now()+7*3600000).toISOString().slice(0,10)};
    }
    setEditor({ action, title, fields, value, id });
  };
  const save = async value => {
    if (editor.action === 'document') value = { ...value, dueAt: value.dueAt ? `${value.dueAt}:00+07:00` : '' };
    if (editor.action === 'documentEvent') value = { ...value, at: `${value.at}:00+07:00` };
    if (editor.action === 'change' && value.decision !== 'pending') value = { ...value, free: value.decision === 'free' };
    await delivery.mutate(editor.action, value, undefined, editor.id);
  };
  const run = async action => { try { setError(''); await action(); } catch (error) { setError(error.message); } };
  const decide = (row, decision) => run(() => delivery.mutate('change', { ...row, decision, free: decision === 'free', status: row.status === 'Đề xuất' ? 'Đã duyệt' : row.status }, undefined, row.id));
  if (!data) return <p className="delivery-empty">Chọn một dự án và đợi dữ liệu tải xong.</p>;
  return <div className="delivery-resources delivery-resources-upgraded">{error && <p role="alert" className="delivery-error">{error}</p>}
    {tab === 'legal' && <DeliveryLegal data={data} items={items} employees={employees} projectId={projectId} disabled={disabled} open={open} run={run} onOpenTask={onOpenTask} />}
    {tab === 'changes' && <section><div className="delivery-section-heading"><h2>Yêu cầu thay đổi của CĐT</h2><button disabled={disabled} onClick={() => open('change')}>+ Đề xuất CR</button></div><div className="delivery-overflow"><table className="delivery-changes-table"><thead><tr><th>Mã</th><th>Nội dung thay đổi</th><th>Phạm vi</th><th>Bộ môn</th><th>Giờ ước</th><th>Giờ đã làm</th>{financial && <th>Giá trị</th>}<th>Quyết định</th><th>Trạng thái</th><th /></tr></thead><tbody>{data.changes.map(row => {
      const actual = row.actualHours ?? data.taskMetrics[row.reworkTaskId]?.actualHours ?? 0;
      const decision = row.decision || (row.status !== 'Đề xuất' ? row.free ? 'free' : 'paid' : 'pending');
      return <tr key={row.id}><td><b>{row.code}</b></td><td><b>{row.title}</b><small>{row.notes}</small>{row.reworkTaskId && <small>Việc làm lại: {items.find(item => item.id === row.reworkTaskId)?.code || 'Task đã xóa'}</small>}</td><td className="delivery-scope">{row.scope || 'Ngoài phạm vi'}</td><td>{row.department || '—'}</td><td>{Number(row.estimatedHours || 0).toLocaleString('vi-VN')}</td><td>{Number(actual).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td>{financial && <td>{formatCompactMoney(row.amount)}</td>}<td>{decision === 'pending' ? ['director', 'admin'].includes(data.viewer.role) ? <div className="delivery-decision-buttons"><button disabled={disabled} onClick={() => decide(row, 'paid')}>Thu phí</button><button disabled={disabled} onClick={() => decide(row, 'free')}>Miễn phí</button></div> : 'Chờ GD quyết định' : <>{decision === 'paid' ? 'Thu phí' : 'Miễn phí có kiểm soát'}{row.appendix && <small>{row.appendix}</small>}</>}</td><td><span className={`delivery-pill ${row.status === 'Hoàn tất' || row.appendix ? 'success' : decision === 'pending' ? 'danger' : 'warning'}`}>{row.appendix ? 'Đã ký phụ lục' : decision === 'pending' ? 'Chờ GD quyết định' : row.status}</span></td><td><button disabled={disabled || !data.permissions.manage && !(row.createdBy === data.viewer.email && row.status === 'Đề xuất')} onClick={() => open('change', row, row.id)}>Sửa</button>{financial&&['director','admin'].includes(data.viewer.role)&&row.decision==='paid'&&!row.signedAt&&<button disabled={disabled} onClick={()=>open('changeAppendix',row,row.id)}>Ký phụ lục</button>}</td></tr>;
    })}{!data.changes.length && <tr><td colSpan={financial ? 10 : 9}>Chưa có yêu cầu thay đổi.</td></tr>}</tbody></table></div><p className="delivery-resource-footnote">Giờ đã làm lấy từ giờ công đã duyệt của task làm lại liên kết. Việc miễn phí không tạo sản lượng; việc gốc giữ nguyên kết quả đã ghi nhận.</p></section>}
    {tab === 'close' && financial && <DeliveryReporting data={data} projectId={projectId} readOnly={readOnly} onSaveSettings={value => delivery.mutate('settings', value)} refreshProject={delivery.refresh} refreshApp={refreshApp} />}
    {showIT && <aside className="delivery-resource-it"><b>Ghi chú cho IT</b><p>{tab === 'legal' ? 'Chuỗi thủ tục theo mẫu; cơ quan, thời hạn, nhật ký và thành phần lưu riêng cho từng hồ sơ.' : tab === 'changes' ? 'Giờ thực tế lấy từ phiếu đã duyệt; quyết định thu phí / miễn phí được kiểm tra quyền ở máy chủ.' : 'Năm tài chính T10–T9. Chỉ kỳ đã khóa được cộng vào lũy kế đã chốt; số nháp được hiển thị riêng.'}</p></aside>}
    {editor && <DeliveryResourceEditor key={`${editor.action}:${editor.id || ''}`} {...editor} onSave={save} onClose={() => setEditor(null)} saving={delivery.saving} />}
  </div>;
}
