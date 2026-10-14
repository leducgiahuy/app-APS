import { useState } from 'react';
import { DEFAULT_PROCEDURES } from '../../utils/deliveryResources';
import { deliveryLabel, formatCompactMoney } from '../../utils/deliveryMetrics';
import { shortDateTime } from './DeliveryRow';
import { deliveryApi } from './deliveryApi';

const date = value => value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa có ngày dự kiến';
export default function DeliveryLegal({ data, items, employees, projectId, disabled, open, onOpenTask, run }) {
  const [selectedKey, setSelectedKey] = useState('environment');
  const [template, setTemplate] = useState(true);
  const documents = [...data.documents].sort((a, b) => (a.order || 0) - (b.order || 0));
  const matched = new Set();
  const steps = (template ? data.procedures||DEFAULT_PROCEDURES : []).map((step, index) => {
    const document = documents.find(row => row.procedureKey === step.procedureKey);
    if (document) matched.add(document.id);
    const task = items.find(item => item.id === document?.taskId) || items.find(item => (step.taskCodes||[]).includes(item.code));
    return { ...step, ...document, key: step.procedureKey, document, task, order: document?.order || index + 1 };
  });
  steps.push(...documents.filter(row => !matched.has(row.id)).map((document, index) => ({ ...document, key: document.id, document, task: items.find(item => item.id === document.taskId), order: document.order || steps.length + index + 1 })));
  const selected = steps.find(step => step.key === selectedKey) || steps[0];
  const canEdit = !disabled && ['leader', 'manager', 'director', 'admin'].includes(data.viewer.role);
  const due = documents.filter(row => row.dueAt && row.status !== 'Có kết quả').sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  const permit = steps.find(step => step.procedureKey === 'permit');
  const hours = due ? (Date.parse(due.dueAt) - Date.now()) / 3600000 : null;
  const edit = step => open('document', step.document || { title: step.title, authority: step.authority,processingTime:step.processingTime||'',fee:step.fee??null, procedureKey: step.procedureKey, taskId: step.task?.id || '', order: step.order }, step.document?.id);
  const record = selected?.task && data.records[selected.task.id];
  const events = [...(selected?.events || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const components = selected?.components || [];
  const download = id => { const file = data.evidence.find(row => row.id === id); if (file) run(() => deliveryApi.download(projectId, file)); };
  return <>
    <div className="delivery-resource-kpis">
      <section><small>Hạn nộp gần nhất</small><strong className={hours != null && hours < 72 ? 'delivery-danger' : ''}>{due ? shortDateTime(due.dueAt) : 'Chưa có hạn nộp'}</strong><small>{due?.title || 'Thêm hồ sơ và đặt hạn nộp để theo dõi.'}{hours != null && ` · ${hours < 0 ? `Quá hạn ${Math.ceil(-hours / 24)} ngày` : `Còn ${Math.floor(hours / 24)} ngày ${Math.floor(hours % 24)} giờ`}`}</small></section>
      <section><small>Dự kiến có GPXD</small><strong>{date(permit?.expectedAt || permit?.task?.endDate)}</strong><small>Chuỗi thủ tục: môi trường → thẩm định → giấy phép xây dựng</small></section>
    </div>
    <section className="delivery-procedure-section"><div className="delivery-section-heading"><div><h2>Chuỗi thủ tục của dự án</h2><small>Chọn bước để xem nhật ký và thành phần hồ sơ.</small></div><div className="delivery-resource-actions"><label className="delivery-checkbox"><input type="checkbox" checked={template} onChange={event => setTemplate(event.target.checked)} />Mẫu nhà máy trong KCN</label><button disabled={!canEdit} onClick={() => open('document')}>+ Hồ sơ</button></div></div>
      <div className="delivery-procedure-chain">{steps.map((step, index) => {
        const progress = step.task && data.records[step.task.id];
        const level = progress?.kind === 'legal' ? progress.level : { 'Chuẩn bị': 20, 'Đã nộp': 60, 'Bổ sung': 80, 'Có kết quả': 100 }[step.status] || 0;
        return <button type="button" key={step.key} className={`delivery-procedure-card ${selected?.key === step.key ? 'selected' : ''}`} onClick={() => setSelectedKey(step.key)}><small>Bước {index + 1}{step.task?.code ? ` · ${step.task.code}` : ''}</small><b>{step.title}</b><span className="delivery-authority">→ {step.authority || 'Chưa chọn cơ quan'}</span><span className="delivery-resource-progress"><i style={{ width: `${level}%` }} /></span><span className={`delivery-resource-status level-${level}`}>{level}% · {progress?.kind === 'legal' ? deliveryLabel(progress) : step.status || 'Chưa bắt đầu'}</span><small>{step.dueAt ? `Hạn nộp ${shortDateTime(step.dueAt)}` : step.expectedAt ? `Dự kiến ${date(step.expectedAt)}` : 'Chưa đặt hạn nộp'}</small></button>;
      })}{!steps.length && <p className="delivery-empty">Chưa có hồ sơ pháp lý. Thêm hồ sơ để tạo chuỗi thủ tục.</p>}</div>
    </section>
    {selected && <><div className="delivery-resource-subheading"><b>Bước {steps.indexOf(selected) + 1}: {selected.title}</b><span className="delivery-authority">→ {selected.authority}</span><div className="delivery-resource-actions">{selected.task && <button onClick={() => onOpenTask?.(selected.task)}>Xem task {selected.task.code}</button>}<button disabled={!canEdit} onClick={() => edit(selected)}>{selected.document ? 'Sửa hồ sơ / cơ quan' : 'Thiết lập hồ sơ'}</button></div></div>
      <div className="delivery-legal-details">
        <section><div className="delivery-section-heading"><h2>Nhật ký làm việc với cơ quan</h2><button disabled={!canEdit || !selected.document} onClick={() => open('documentEvent', { documentId: selected.id })}>+ Nhật ký</button></div><ol className="delivery-legal-log">{events.map(event => <li key={event.id}><time>{shortDateTime(event.at)}</time><i className={event.type === 'request' ? 'request' : ''} /><div>{event.title}{event.employeeId && ` · ${employees.find(row => row.id === event.employeeId)?.name || 'Nhân sự đã xóa'}`}{event.reference && <small>Văn bản / biên nhận: {event.reference}</small>}{event.evidenceId && <button className="delivery-evidence-link" onClick={() => download(event.evidenceId)}>✓ {data.evidence.find(file => file.id === event.evidenceId)?.name || 'Bằng chứng'}</button>}<button disabled={!canEdit} onClick={() => open('documentEvent', { ...event, documentId: selected.id }, event.id)}>Sửa</button></div></li>)}
          {record?.sentAt && <li><time>{shortDateTime(record.sentAt)}</time><i /><div>Đã nộp hồ sơ / gửi hồ sơ theo task {selected.task.code}{record.evidenceId && <button onClick={() => download(record.evidenceId)}>Xem bằng chứng</button>}</div></li>}
          {selected.dueAt && <li className="delivery-log-deadline"><time>{shortDateTime(selected.dueAt)}</time><i className="request" /><div>Hạn nộp hồ sơ{selected.status === 'Bổ sung' ? ' bổ sung' : ''}</div></li>}
          {selected.expectedAt && <li><time>{date(selected.expectedAt)}</time><i /><div>Dự kiến có kết quả</div></li>}
          {!events.length && !record?.sentAt && <li className="delivery-empty">Chưa có nhật ký. Các lần làm việc, nộp hồ sơ và nhận văn bản sẽ được lưu tại đây.</li>}
        </ol></section>
        <section><div className="delivery-section-heading"><h2>Thành phần hồ sơ{selected.status === 'Bổ sung' ? ' bổ sung' : ''}</h2><button disabled={!canEdit || !selected.document} onClick={() => open('documentComponent', { documentId: selected.id })}>+ Thành phần</button></div><div className="delivery-overflow"><table><tbody>{components.map(component => <tr key={component.id}><td>{component.title}</td><td><span className="delivery-person-chip"><i>{employees.find(row => row.id === component.employeeId)?.name?.slice(0, 1) || '—'}</i>{employees.find(row => row.id === component.employeeId)?.name || 'Chưa giao'}</span></td><td><span className={`delivery-pill ${component.status === 'Xong' ? 'success' : component.status === 'Chờ CĐT ký' ? 'danger' : 'warning'}`}>{component.status}</span></td><td><button disabled={!canEdit} onClick={() => open('documentComponent', { ...component, documentId: selected.id }, component.id)}>Sửa</button></td></tr>)}{!components.length && <tr><td>Chưa có thành phần hồ sơ.</td></tr>}</tbody></table></div>
          <small className="delivery-muted">{components.filter(row => row.status === 'Xong').length}/{components.length} thành phần đã hoàn thành.</small><dl className="delivery-resource-description"><dt>Cơ quan tiếp nhận</dt><dd>{selected.authority || 'Chưa chọn'}</dd><dt>Thời hạn xử lý</dt><dd>{selected.processingTime || 'Chưa cấu hình cho thủ tục này'}</dd><dt>Mã hồ sơ</dt><dd>{selected.reference || 'Chưa có'}</dd>{data.permissions.financial && <><dt>Phí, lệ phí</dt><dd>{formatCompactMoney(selected.fee)}</dd></>}</dl>
        </section>
      </div>
    </>}
  </>;
}
