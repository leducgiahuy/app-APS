import { useState } from 'react';
import { usePageAccess } from '../../context/PageAccessContext';
import { formatCompactMoney } from '../../utils/deliveryMetrics';

const tabs = [
  ['rfi', 'Đề nghị CĐT cung cấp thông tin'],
  ['meetings', 'Biên bản họp'],
  ['changes', 'Yêu cầu thay đổi (CR)']
];
const viDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('vi-VN') : '—';
const viDateTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export default function DeliveryCustomerWorkspace({ contextBar, data, items, disabled, open, decide, currentTime }) {
  const [tabChoice, setTab] = useState('rfi');
  // Tab con theo ma trận Trang & mục (Dự án → Khách hàng).
  const { canSee } = usePageAccess();
  const visibleTabs = tabs.filter(([key]) => canSee(`gantt.customer.${key}`));
  const tab = visibleTabs.some(([key]) => key === tabChoice) ? tabChoice : visibleTabs[0]?.[0];
  const nowKey = currentTime ? new Date(currentTime.getTime() + 7 * 3600000).toISOString().slice(0, 10) : '';
  const requests = data.customerRequests || [];
  const meetings = data.meetingMinutes || [];
  const changes = data.changes || [];
  const financial = data.permissions.financial;
  const waiting = requests.filter(row => !row.receivedAt && !['Đã nhận', 'Đã đóng'].includes(row.status)).length;
  const due = requests.filter(row => !row.receivedAt && row.dueAt && row.dueAt <= nowKey).length;
  const clientDelayDays = requests.reduce((sum, row) => row.receivedAt && row.dueAt && row.receivedAt > row.dueAt ? sum + Math.max(0, Math.round((Date.parse(row.receivedAt) - Date.parse(row.dueAt)) / 86400000)) : sum, 0);
  const approvedChanges = changes.filter(row => row.status !== 'Từ chối');

  return <div className="customer-workspace">
    <div className="customer-view-switch" role="tablist" aria-label="Các mục khách hàng">{visibleTabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
    {contextBar?.()}

    {tab === 'rfi' && <div className="customer-flat-stack">
      <div className="customer-kpis"><section><small>Đang chờ CĐT</small><b>{waiting}</b><span>Phiếu chưa nhận phản hồi</span></section><section className="danger"><small>Quá hạn / đến hạn</small><b>{due}</b><span>Cần nhắc khách hàng</span></section><section><small>Ngày chậm do CĐT (dự án)</small><b>{clientDelayDays} ngày</b><span>Tổng ngày nhận phản hồi trễ</span></section></div>
      <section className="customer-flat-panel"><header><div><b>Đề nghị CĐT cung cấp thông tin</b><small>RFI có hạn để theo dõi ngày chờ và ảnh hưởng công việc</small></div><button className="primary" disabled={disabled} onClick={() => open('customerRequest')}>+ RFI</button></header><div className="customer-table-scroll"><table><thead><tr><th>Phiếu</th><th>Nội dung</th><th>Việc ảnh hưởng</th><th>Gửi</th><th>Hạn</th><th>Nhận</th><th>Ngày chậm</th><th>Tình trạng</th><th></th></tr></thead><tbody>{requests.map(row => { const task = items.find(item => item.id === row.taskId); const late = row.receivedAt && row.dueAt && row.receivedAt > row.dueAt ? Math.max(0, Math.round((Date.parse(row.receivedAt) - Date.parse(row.dueAt)) / 86400000)) : 0; const overdue = !row.receivedAt && row.dueAt && row.dueAt <= nowKey; return <tr key={row.id}><td><b>{row.code}</b></td><td>{row.title}<small>{row.notes}</small></td><td>{task?.code || '—'}</td><td>{viDate(row.sentAt)}</td><td>{viDate(row.dueAt)}</td><td>{viDate(row.receivedAt)}</td><td>{late}</td><td><span className={`delivery-pill ${row.receivedAt || row.status === 'Đã đóng' ? 'success' : overdue ? 'danger' : 'warning'}`}>{row.receivedAt ? 'Đã nhận' : overdue ? 'Đến hạn / quá hạn' : row.status}</span></td><td><button disabled={disabled} onClick={() => open('customerRequest', row, row.id)}>Sửa</button></td></tr>; })}{!requests.length && <tr><td colSpan="9">Chưa có đề nghị CĐT cung cấp thông tin.</td></tr>}</tbody></table></div></section>
    </div>}

    {tab === 'meetings' && <div className="customer-flat-stack">
      <div className="customer-meeting-toolbar"><button className="primary" disabled={disabled} onClick={() => open('meetingMinute')}>+ Biên bản họp</button></div>
      {meetings.map(row => <section className="customer-flat-panel meeting-card" key={row.id}><header><div><b>{row.code} · {row.title}</b><small>{viDateTime(row.at)} · {row.participants || 'Chưa ghi người tham dự'}{row.clientContact ? ` · CĐT: ${row.clientContact}` : ''}</small></div><button disabled={disabled} onClick={() => open('meetingMinute', { ...row, requestsText: (row.requests || []).join('\n') }, row.id)}>Sửa</button></header><div className="customer-table-scroll"><table><thead><tr><th>Yêu cầu của khách</th><th>Phạm vi</th><th>Đã xử lý thành</th></tr></thead><tbody>{(row.requests || []).map((request, index) => <tr key={`${row.id}:${index}`}><td>{request}</td><td><span className={`delivery-pill ${/ngoài/i.test(row.scope) ? 'warning' : 'success'}`}>{row.scope}</span></td><td>{row.resolution || 'Chưa liên kết góp ý / CR'}</td></tr>)}</tbody></table></div>{row.confirmedAt && <p className="customer-footnote">Khách xác nhận: {viDate(row.confirmedAt)}</p>}</section>)}
      {!meetings.length && <section className="customer-flat-panel customer-empty">Chưa có biên bản họp.</section>}
    </div>}

    {tab === 'changes' && <div className="customer-flat-stack">
      <section className="customer-flat-panel"><header><div><b>Công dự toán thay đổi theo yêu cầu thay đổi</b><small>Lịch sử tăng công dự toán, người và thời điểm duyệt</small></div></header><div className="customer-table-scroll"><table><thead><tr><th>CR</th><th>Nội dung</th><th>Cách cộng</th><th>Công</th><th>CĐT xác nhận</th><th>GĐ duyệt</th><th>Thu phí</th><th>Vào dự toán</th></tr></thead><tbody>{approvedChanges.map(row => <tr key={`summary:${row.id}`}><td><b>{row.code}</b></td><td>{row.title}</td><td>{row.reworkTaskId ? `Việc ${items.find(item => item.id === row.reworkTaskId)?.code || 'làm lại'}` : row.appendixTaskId ? `Việc ${items.find(item => item.id === row.appendixTaskId)?.code || 'phụ lục'}` : 'Chưa gắn việc'}</td><td>+{Number(row.budgetWorkAdded ?? (Number(row.approvedEstimatedHours ?? row.estimatedHours ?? 0) / 8)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td><td>{row.notes || '—'}</td><td>{row.status === 'Đề xuất' ? '—' : row.updatedAt ? viDate(row.updatedAt) : 'Đã duyệt'}</td><td>{row.decision === 'paid' ? `Thu phí ${formatCompactMoney(row.amount)}` : row.decision === 'free' ? 'Miễn phí' : 'Chưa quyết'}</td><td><span className={`delivery-pill ${row.reworkTaskId || row.appendixTaskId ? 'success' : 'warning'}`}>{row.reworkTaskId || row.appendixTaskId ? 'Đã cộng' : 'Chưa cộng'}</span></td></tr>)}{!approvedChanges.length && <tr><td colSpan="8">Chưa có thay đổi được ghi nhận vào công dự toán.</td></tr>}</tbody></table></div></section>
      <section className="customer-flat-panel"><header><div><b>Yêu cầu thay đổi của CĐT</b><small>Giữ nguyên luồng CR, quyết định thu phí/miễn phí và liên kết task làm lại</small></div><button className="primary" disabled={disabled} onClick={() => open('change')}>+ Đề xuất CR</button></header><div className="customer-table-scroll"><table className="delivery-changes-table"><thead><tr><th>Mã</th><th>Nội dung thay đổi</th><th>Phạm vi</th><th>Bộ môn</th><th>Giờ ước</th><th>Giờ đã làm</th>{financial && <th>Giá trị</th>}<th>Quyết định</th><th>Trạng thái</th><th></th></tr></thead><tbody>{changes.map(row => { const actual = row.actualHours ?? data.taskMetrics[row.reworkTaskId]?.actualHours ?? 0; const decision = row.decision || (row.status !== 'Đề xuất' ? row.free ? 'free' : 'paid' : 'pending'); return <tr key={row.id}><td><b>{row.code}</b></td><td><b>{row.title}</b><small>{row.notes}</small>{row.reworkTaskId && <small>Việc làm lại: {items.find(item => item.id === row.reworkTaskId)?.code || 'Task đã xóa'}</small>}</td><td className="delivery-scope">{row.scope || 'Ngoài phạm vi'}</td><td>{row.department || '—'}</td><td>{Number(row.estimatedHours || 0).toLocaleString('vi-VN')}</td><td>{Number(actual).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td>{financial && <td>{formatCompactMoney(row.amount)}</td>}<td>{decision === 'pending' ? ['director', 'admin'].includes(data.viewer.role) ? <div className="delivery-decision-buttons"><button disabled={disabled} onClick={() => decide(row, 'paid')}>Thu phí</button><button disabled={disabled} onClick={() => decide(row, 'free')}>Miễn phí</button></div> : 'Chờ GĐ quyết định' : <>{decision === 'paid' ? 'Thu phí' : 'Miễn phí có kiểm soát'}{row.appendix && <small>{row.appendix}</small>}</>}</td><td><span className={`delivery-pill ${row.status === 'Hoàn tất' || row.appendix ? 'success' : decision === 'pending' ? 'danger' : 'warning'}`}>{row.appendix ? 'Đã ký phụ lục' : decision === 'pending' ? 'Chờ GĐ quyết định' : row.status}</span></td><td><button disabled={disabled || !data.permissions.manage && !(row.createdBy === data.viewer.email && row.status === 'Đề xuất')} onClick={() => open('change', row, row.id)}>Sửa</button>{financial && ['director', 'admin'].includes(data.viewer.role) && row.decision === 'paid' && !row.signedAt && <button disabled={disabled} onClick={() => open('changeAppendix', row, row.id)}>Ký phụ lục</button>}</td></tr>; })}{!changes.length && <tr><td colSpan={financial ? 10 : 9}>Chưa có yêu cầu thay đổi.</td></tr>}</tbody></table></div><p className="customer-footnote">Giờ đã làm lấy từ giờ công đã duyệt của task làm lại liên kết. Việc miễn phí không tạo sản lượng; việc gốc giữ nguyên kết quả đã ghi nhận.</p></section>
    </div>}
  </div>;
}
