import { useState } from 'react';
import DeliveryResourceEditor from './DeliveryResourceEditor';
import DeliveryLegalWorkspace from './DeliveryLegalWorkspace';
import DeliveryCustomerWorkspace from './DeliveryCustomerWorkspace';
import DeliveryReporting from './DeliveryReporting';
import './DeliveryResources.css';

export default function DeliveryResources({ tab, contextBar, data, delivery, projectId, employees, items, refreshApp, readOnly, onOpenTask, showIT, currentTime }) {
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
    if (action === 'customerRequest') {
      title = 'Đề nghị CĐT cung cấp thông tin';
      fields = [{ key: 'title', label: 'Nội dung đề nghị', type: 'textarea', required: true }, choose('taskId', 'Việc bị ảnh hưởng', taskOptions), { key: 'sentAt', label: 'Ngày gửi', type: 'date', required: true }, { key: 'dueAt', label: 'Hạn phản hồi', type: 'date', required: true }, { key: 'receivedAt', label: 'Ngày nhận phản hồi', type: 'date' }, choose('status', 'Tình trạng', ['Đang chờ CĐT', 'Đã nhận', 'Đến hạn', 'Quá hạn', 'Đã đóng']), { key: 'notes', label: 'Ghi chú / ảnh hưởng', type: 'textarea' }];
      value = { status: 'Đang chờ CĐT', sentAt: new Date().toISOString().slice(0, 10), ...value };
    }
    if (action === 'meetingMinute') {
      title = 'Biên bản họp với khách hàng';
      fields = [{ key: 'title', label: 'Tên cuộc họp / dự án', required: true }, { key: 'at', label: 'Ngày giờ họp', type: 'datetime-local', required: true }, { key: 'participants', label: 'Người tham dự', required: true }, { key: 'clientContact', label: 'Đại diện CĐT' }, { key: 'requestsText', label: 'Yêu cầu của khách (mỗi dòng một nội dung)', type: 'textarea', required: true }, choose('scope', 'Phạm vi mặc định', ['Trong hợp đồng', 'NGOÀI hợp đồng']), { key: 'resolution', label: 'Đã xử lý thành / liên kết góp ý, CR', type: 'textarea' }, { key: 'confirmedAt', label: 'Ngày khách xác nhận', type: 'date' }];
      value = { scope: 'Trong hợp đồng', ...value, at: value.at ? new Date(Date.parse(value.at) + 7 * 3600000).toISOString().slice(0, 16) : new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16) };
    }
    setEditor({ action, title, fields, value, id });
  };
  const save = async value => {
    if (editor.action === 'document') value = { ...value, dueAt: value.dueAt ? `${value.dueAt}:00+07:00` : '' };
    if (editor.action === 'documentEvent') value = { ...value, at: `${value.at}:00+07:00` };
    if (editor.action === 'change' && value.decision !== 'pending') value = { ...value, free: value.decision === 'free' };
    if (editor.action === 'meetingMinute') value = { ...value, at: `${value.at}:00+07:00` };
    await delivery.mutate(editor.action, value, undefined, editor.id);
    if (editor.action === 'changeAppendix') await refreshApp();
  };
  const run = async action => { try { setError(''); await action(); } catch (error) { setError(error.message); } };
  const decide = (row, decision) => run(() => delivery.mutate('change', { ...row, decision, free: decision === 'free', status: row.status === 'Đề xuất' ? 'Đã duyệt' : row.status }, undefined, row.id));
  if (!data) return <p className="delivery-empty">Chọn một dự án và đợi dữ liệu tải xong.</p>;
  return <div className="delivery-resources delivery-resources-upgraded">{error && <p role="alert" className="delivery-error">{error}</p>}
    {tab === 'legal' && <DeliveryLegalWorkspace contextBar={contextBar} data={data} items={items} employees={employees} projectId={projectId} disabled={disabled} open={open} run={run} onOpenTask={onOpenTask} currentTime={currentTime} />}
    {tab === 'changes' && <DeliveryCustomerWorkspace contextBar={contextBar} data={data} items={items} disabled={disabled} open={open} decide={decide} currentTime={currentTime} />}
    {tab === 'close' && financial && <DeliveryReporting contextBar={contextBar} data={data} projectId={projectId} readOnly={readOnly} onSaveSettings={value => delivery.mutate('settings', value)} refreshProject={delivery.refresh} refreshApp={refreshApp} />}
    {showIT && <aside className="delivery-resource-it"><b>Ghi chú cho IT</b><p>{tab === 'legal' ? 'Chuỗi thủ tục theo mẫu; cơ quan, thời hạn, nhật ký và thành phần lưu riêng cho từng hồ sơ.' : tab === 'changes' ? 'Giờ thực tế lấy từ phiếu đã duyệt; quyết định thu phí / miễn phí được kiểm tra quyền ở máy chủ.' : 'Năm tài chính T10–T9. Chỉ kỳ đã khóa được cộng vào lũy kế đã chốt; số nháp được hiển thị riêng.'}</p></aside>}
    {editor && <DeliveryResourceEditor key={`${editor.action}:${editor.id || ''}`} {...editor} onSave={save} onClose={() => setEditor(null)} saving={delivery.saving} />}
  </div>;
}
