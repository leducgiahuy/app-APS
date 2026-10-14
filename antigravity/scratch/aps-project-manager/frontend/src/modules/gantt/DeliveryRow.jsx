import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, MessageCircle, Paperclip, MoreHorizontal, Pencil, UsersRound, Trash2, Plus } from 'lucide-react';
import { deliveryLabel, defaultDeliveryRecord, formatCompactMoney } from '../../utils/deliveryMetrics';
import { GanttEditableWorkCell } from './GanttWorkColumns';

export const DELIVERY_COLUMNS = [
  { key: 'code', label: 'STT', width: 46 },
  { key: 'title', label: 'Công việc trong dự án', width: 200, alignLeft: true },
  { key: 'people', label: 'Người làm', width: 96, alignLeft: true },
  { key: 'submission', label: 'Hạn nộp hồ sơ', width: 126, alignLeft: true },
  { key: 'status', label: 'Trạng thái (mức %)', width: 180, alignLeft: true },
  { key: 'startDate', label: 'BẮT ĐẦU', width: 95 },
  { key: 'endDate', label: 'KẾT THÚC', width: 95 },
  { key: 'days', label: 'NGÀY', width: 55 },
  { key: 'contractWork', label: 'CÔNG HĐ', width: 90 },
  { key: 'actualWork', label: 'CÔNG TT', width: 80 },
  { key: 'weight', label: 'TỶ TRỌNG', width: 80 },
  { key: 'output', label: 'SẢN LƯỢNG', width: 100, financial: true },
  { key: 'createdAt', label: 'NGÀY TẠO', width: 95 },
  { key: 'note', label: 'GHI CHÚ', width: 180, alignLeft: true },
  { key: 'actions', label: 'THAO TÁC', width: 100 },
];
export const COMPACT_KEYS = ['code', 'title', 'people', 'submission', 'status'];
export const DATE_KEYS = [...COMPACT_KEYS, 'startDate', 'endDate', 'days', 'contractWork', 'actualWork'];
export const shortDateTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const number = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });

export default function DeliveryRow({ item, columns, height, depth = 0, record, metric, aggregate, employees, collapsed, onToggle, onOpen, onEdit, onAssign, onDelete, onSaveWork, onCreateTask, color, readOnly }) {
  const [createMenu, setCreateMenu] = useState(null);
  const createButton = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!createMenu) return;
    const close = () => setCreateMenu(null);
    const outside = event => { if (!menuRef.current?.contains(event.target) && !createButton.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === 'Escape') { close(); createButton.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [createMenu]);
  if (item.deliveryBand) return <div className={`delivery-band-label ${item.deliveryBand}`} style={{ height }}><strong>{item.deliveryBand === 'money' ? 'Tiền lũy kế dự án (tr)' : '◆ Mốc thanh toán hợp đồng'}</strong>{item.deliveryBand === 'money' && <small><i className="received">— Đã thu</i> · <i className="spent">— Chi phí đã bỏ ra</i> · <i className="earned">-- Sản lượng làm ra</i></small>}</div>;
  const group = item.isGroup || item.isProjectHeader || item.hasTaskChildren;
  const people = item.assignees?.length ? item.assignees : item.assignee ? [{ employeeName: item.assignee }] : [];
  record = record || defaultDeliveryRecord(item);
  const label = deliveryLabel(record);
  const alert = metric?.alert || {};
  const rowClass = item.isProjectHeader ? 'project' : item.isGroup ? 'group' : record?.freeRework ? 'rework' : '';
  return <div className={`delivery-row ${rowClass}`} style={{ height, borderLeftColor: color, '--delivery-row-accent': color || 'transparent', ...(item.isGroup && color ? { backgroundColor: `${color}14`, color } : {}) }} role="button" tabIndex={0} aria-label={`Xem chi tiết ${item.title}`} onClick={onOpen} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}>
    {columns.map(column => {
      let content;
      if (column.key === 'code') content = item.isProjectHeader ? '' : item.isGroup ? item.title.match(/^[A-Z]\d*/)?.[0] || item.code : item.code || '';
      if (column.key === 'code' && !item.isProjectHeader && !item.isGroup && !readOnly && onCreateTask) content = <div className={`delivery-task-code ${createMenu ? 'menu-open' : ''}`}><span>{content}</span><button ref={createButton} type="button" aria-label={`Tạo task tại ${item.code}`} aria-haspopup="menu" aria-expanded={Boolean(createMenu)} onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setCreateMenu(current => current ? null : { left: Math.max(8, Math.min(rect.left, window.innerWidth - 176)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 96)) }); }}><Plus size={15} /></button>{createMenu && createPortal(<div ref={menuRef} role="menu" className="delivery-create-menu" style={{ left: createMenu.left, top: createMenu.top }} onClick={event => event.stopPropagation()}>{[[false, 'Tạo task'], [true, 'Tạo task con']].map(([child, label]) => <button type="button" role="menuitem" key={label} onClick={() => { setCreateMenu(null); onCreateTask(child); }}>{label}</button>)}</div>, document.body)}</div>;
      if (column.key === 'title') content = <div className="delivery-row-title" style={{ paddingLeft: Math.min(32, depth * 10) }}>{group && <button type="button" onClick={event => { event.stopPropagation(); onToggle(); }} aria-label={`${collapsed ? 'Mở' : 'Thu'} ${item.title}`}>{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>}<span title={item.title}>{item.title}</span></div>;
      if (column.key === 'people') content = !group && <div className="delivery-people">{people.map((assignment, index) => { const employee = employees.find(person => person.id === assignment.employeeId); const name = employee?.name || assignment.employeeName || 'Chưa gán'; return <span key={index} title={name}><i>{name.slice(0, 1)}</i>{name}</span>; })}{!people.length && !readOnly && <button onClick={event => { event.stopPropagation(); onAssign(); }} disabled={readOnly}>+ Giao cho</button>}</div>;
      if (column.key === 'submission') content = !group && <div className={`delivery-due ${alert.overdue ? 'overdue' : alert.soon ? 'soon' : ''}`}><b>{shortDateTime(record?.dueAt)}</b>{record?.sentAt ? <small className="sent">Đã gửi {shortDateTime(record.sentAt)}</small> : alert.overdue ? <small>Quá hạn {Math.ceil(-alert.hours / 24)} ngày</small> : alert.soon ? <small>Còn {Math.floor(alert.hours / 24)} ngày {Math.max(0, Math.floor(alert.hours % 24))} giờ</small> : null}</div>;
      if (column.key === 'status') content = group ? <strong className="delivery-group-percent">{aggregate == null ? '—' : `${number(aggregate)}%`}</strong> : <div className="delivery-status-cell"><span className={`delivery-status level-${record?.level || 0} ${record?.freeRework ? 'rework' : ''}`} title={`% ghi nhận: ${metric?.recognized ?? '—'}%`}>{record?.freeRework ? `Làm lại · ${record.changeId ? 'CR' : 'miễn phí'}` : `${record?.level ?? '—'}% · ${label}`}</span>{record?.level >= 60 && <Paperclip size={12} className={record.evidenceId ? 'has-proof' : 'missing-proof'} aria-label={record.evidenceId ? 'Có bằng chứng' : 'Thiếu bằng chứng'} />}{record?.level >= 60 && <small className={record.confirmedBy ? 'has-proof' : 'missing-proof'}>{record.confirmedBy ? '✓ XN' : '○ XN'}</small>}<button aria-label={`Thảo luận ${item.title}`} onClick={event => { event.stopPropagation(); onOpen('comments'); }}><MessageCircle size={13} /></button></div>;
      if (['startDate', 'endDate'].includes(column.key)) content = item[column.key]?.split('-').reverse().join('/') || '—';
      if (column.key === 'days') content = item.days ?? '—';
      if (column.key === 'duration') content = number(metric?.planned);
      if (column.key === 'actualWork') content = number(metric?.actual);
      if (column.key === 'weight') content = metric?.weight == null ? '—' : `${number(metric.weight * 100)}%`;
      if (column.key === 'output') content = formatCompactMoney(metric?.output);
      if (column.key === 'createdAt') content = item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : '—';
      if (column.key === 'note') content = item.isProjectHeader ? item.description || '—' : <div className="delivery-inline-note" onClick={event => event.stopPropagation()}>{readOnly ? item.ganttNote || '—' : <GanttEditableWorkCell item={item} field="ganttNote" onSave={onSaveWork} placeholder="Ghi chú..." />}</div>;
      if (column.key === 'contractWork') content = readOnly ? number(item.contractWork) : <div onClick={event => event.stopPropagation()}><GanttEditableWorkCell item={item} field="contractWork" type="number" onSave={onSaveWork} /></div>;
      if (column.key === 'actions' && !readOnly) content = <div className="delivery-row-actions" onClick={event => event.stopPropagation()}><button onClick={onEdit} disabled={readOnly} title="Chỉnh sửa"><Pencil size={13} /></button>{!group && <button onClick={onAssign} disabled={readOnly} title="Phân công"><UsersRound size={13} /></button>}<button onClick={onDelete} disabled={readOnly} title="Xóa"><Trash2 size={13} /></button></div>;
      return <div className={`delivery-cell delivery-column ${column.alignLeft ? 'delivery-column-left' : 'delivery-column-center'} ${column.key}`} key={column.key} style={{ width: column.width, minWidth: column.width }}>{content}{column.key === 'status' && group && <button onClick={event => { event.stopPropagation(); onOpen(); }} aria-label={`Tùy chọn ${item.title}`}><MoreHorizontal size={13} /></button>}</div>;
    })}
  </div>;
}
