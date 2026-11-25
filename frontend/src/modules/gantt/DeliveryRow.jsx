import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, GripVertical, MessageCircle, Paperclip, MoreHorizontal, Pencil, UsersRound, Trash2, Plus } from 'lucide-react';
import { deliveryLabel, defaultDeliveryRecord, formatCompactMoney, varianceTone } from '../../utils/deliveryMetrics';
import { GanttEditableWorkCell } from './GanttWorkColumns';
import { itemWbsCode } from '../../utils/wbsStructure';
import { datesInRange, workingDaysInRange } from '../../utils/assignmentCalendar';

export const DELIVERY_COLUMNS = [
  { key: 'code', label: 'STT', width: 64 },
  { key: 'title', label: 'CÔNG VIỆC TRONG DỰ ÁN', width: 200, alignLeft: true },
  { key: 'people', label: 'NGƯỜI LÀM', width: 96, alignLeft: true },
  { key: 'submission', label: 'HẠN NỘP HỒ SƠ', width: 126, alignLeft: true },
  { key: 'status', label: 'TRẠNG THÁI (MỨC %)', width: 180, alignLeft: true },
  { key: 'startDate', label: 'BẮT ĐẦU', width: 95 },
  { key: 'endDate', label: 'KẾT THÚC', width: 95 },
  { key: 'days', label: 'NGÀY', width: 55 },
  { key: 'contractWork', label: 'DỰ TOÁN', width: 90 },
  { key: 'duration', label: 'DỰ BÁO', width: 80 },
  { key: 'weight', label: 'TỶ TRỌNG', width: 80 },
  { key: 'actualWork', label: 'THỰC TẾ', width: 80 },
  { key: 'remainingWork', label: 'CÒN LẠI', width: 82 },
  { key: 'varianceWork', label: 'CHÊNH LỆCH', width: 132 },
  { key: 'output', label: 'SẢN LƯỢNG', width: 100, financial: true },
  { key: 'createdAt', label: 'NGÀY TẠO', width: 95 },
  { key: 'note', label: 'GHI CHÚ', width: 180, alignLeft: true },
  { key: 'actions', label: 'THAO TÁC', width: 100 },
];
export const COMPACT_KEYS = ['code', 'title', 'people', 'submission', 'status'];
/** Bộ cột chuẩn mỗi lần mở trang Dự án (người dùng chọn 05/11/2026). Ngày, Tỷ trọng, Còn lại, Sản lượng, Ngày tạo, Ghi chú, Thao tác ẩn — bật được ở "Hiển thị cột". */
export const DEFAULT_VISIBLE_KEYS = ['code', 'title', 'people', 'submission', 'status', 'startDate', 'endDate', 'contractWork', 'duration', 'actualWork', 'varianceWork'];
export const shortDateTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const number = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
// Các cột công (Dự toán, Dự báo, Thực tế, Còn lại, Chênh lệch) hiện tới 2 chữ số — đúng số dùng để tính, nên nhẩm trên bảng
// (VD Dự báo = Dự toán × Thực tế task trên ÷ Dự toán task trên) ra khớp, và hai cột đổi số cùng lúc khi Thực tế chạy.
// Chữ trạng thái của dòng nhóm / dự án theo % tổng: 0% = đang tiến hành, đã chạy (> 0% và < 100%) = đang làm.
const groupStatusLabel = percent => { const value = Number(percent) || 0; return value <= 0 ? ' · Đang tiến hành' : value < 100 ? ' · Đang làm' : ''; };
const work = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export default function DeliveryRow({ item, columns, height, depth = 0, record, metric, aggregate, employees, collapsed, onToggle, onOpen, onEdit, onAssign, onDelete, onSaveWork, onCreateTask, onVarianceReason, color, readOnly, canAssign = !readOnly, highlighted = false, canDrag = false, dropHint = '', dragging = false, onDragHandleStart, onDragHandleEnd, onRowDragOver, onRowDrop }) {
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
  // Dải Tiền lũy kế: có nút thu gọn / mở rộng (onToggle, collapsed) — chiều cao co giãn ở GanttPage (.delivery-money-band).
  if (item.deliveryBand) return <div className={`delivery-band-label ${item.deliveryBand}${collapsed ? ' is-collapsed' : ''}`} style={{ height: onToggle ? '100%' : height }}>
    {item.deliveryBand === 'money' && onToggle
      ? <button type="button" className="delivery-band-toggle" onClick={onToggle} aria-expanded={!collapsed} title={collapsed ? 'Mở rộng dải tiền lũy kế' : 'Thu gọn dải tiền lũy kế'}><ChevronDown size={14} /><strong>Tiền lũy kế dự án (tr)</strong></button>
      : <strong>{item.deliveryBand === 'money' ? 'Tiền lũy kế dự án (tr)' : '◆ Mốc thanh toán hợp đồng'}</strong>}
    {item.deliveryBand === 'money' && <small><i className="received">— Đã thu</i> · <i className="spent">— Chi phí đã bỏ ra</i> · <i className="earned">-- Sản lượng làm ra</i></small>}
  </div>;
  const group = item.isGroup || item.isProjectHeader || item.hasTaskChildren;
  const people = item.assignees?.length ? item.assignees : item.assignee ? [{ employeeName: item.assignee }] : [];
  record = record || defaultDeliveryRecord(item);
  // Số công lấy thẳng từ computeDelivery (công thức G1); nhóm / dự án = tổng các task (groupMetrics ở GanttPage).
  const remainingWork = metric?.remainingWork;
  const varianceWork = metric?.varianceWork;
  const variancePercent = metric?.variancePercent;
  // Ô Thực tế: đỏ khi quá hạn (chưa xong mà qua ngày kết thúc) hoặc Thực tế > Dự toán; vàng khi đã dùng ≥ 80% Dự toán mà chưa nộp (cảnh báo sớm G1).
  const todayDate = new Date();
  const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
  const taskOverdue = Boolean(metric) && !group && item.status !== 'completed' && ((item.endDate && item.endDate < today) || Boolean(metric.alert?.overBudget));
  const nearBudget = Boolean(metric) && !group && !taskOverdue && Boolean(metric.alert?.nearBudget);
  const label = deliveryLabel(record);
  const alert = metric?.alert || {};
  const rowClass = item.isProjectHeader ? 'project' : item.isGroup ? 'group' : `${record?.freeRework ? 'rework ' : ''}${item.parentTaskId ? 'child-task' : ''}`.trim();
  // Kéo thả task (tay nắm ở ô STT): dropHint = before / after / into vẽ vạch báo chỗ thả (DeliveryPage.css).
  return <div data-gantt-row={item.id} className={`delivery-row ${rowClass}${highlighted ? ' is-link-target' : ''}${dropHint ? ` drop-${dropHint}` : ''}${dragging ? ' is-dragging' : ''}`} onDragOver={onRowDragOver} onDrop={onRowDrop} style={{ height, borderLeftColor: color, '--delivery-row-accent': color || 'transparent', ...(item.isGroup && color ? { backgroundColor: `${color}14`, color } : {}) }} role="button" tabIndex={0} aria-label={`Xem chi tiết ${item.title}`} onClick={onOpen} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}>
    {columns.map(column => {
      let content;
      if (column.key === 'code') content = item.isProjectHeader ? '' : itemWbsCode(item);
      const dragHandle = column.key === 'code' && canDrag ? <span className="delivery-drag-handle" draggable title="Giữ và kéo để đổi vị trí: task sang mục khác / giữa hai task, mục con sang vị trí hay giai đoạn khác" aria-label={`Kéo ${item.code || item.title}`} onClick={event => event.stopPropagation()} onDragStart={onDragHandleStart} onDragEnd={onDragHandleEnd}><GripVertical size={13} /></span> : null;
      if (column.key === 'code' && !item.isProjectHeader && !item.isGroup && !readOnly && onCreateTask) content = <div className={`delivery-task-code ${createMenu ? 'menu-open' : ''}`}><span>{content}</span><button ref={createButton} type="button" aria-label={`Tạo task tại ${item.code}`} aria-haspopup="menu" aria-expanded={Boolean(createMenu)} onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setCreateMenu(current => current ? null : { left: Math.max(8, Math.min(rect.left, window.innerWidth - 176)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 96)) }); }}><Plus size={15} /></button>{createMenu && createPortal(<div ref={menuRef} role="menu" className="delivery-create-menu" style={{ left: createMenu.left, top: createMenu.top }} onClick={event => event.stopPropagation()}>{[[false, 'Tạo task'], [true, 'Tạo task con']].map(([child, label]) => <button type="button" role="menuitem" key={label} onClick={() => { setCreateMenu(null); onCreateTask(child); }}>{label}</button>)}</div>, document.body)}</div>;
      if (column.key === 'title') content = <div className="delivery-row-title" style={{ paddingLeft: Math.min(32, depth * 10) }}>{group && <button type="button" onClick={event => { event.stopPropagation(); onToggle(); }} aria-label={`${collapsed ? 'Mở' : 'Thu'} ${item.title}`}>{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>}<span className={item.parentTaskId ? 'delivery-child-task-title' : undefined} title={item.title}>{item.title}</span></div>;
      if (column.key === 'people') content = !group && <div className="delivery-people">{people.map((assignment, index) => { const employee = employees.find(person => person.id === assignment.employeeId); const name = employee?.name || assignment.employeeName || 'Chưa gán'; return <span key={index} title={name}><i>{name.slice(0, 1).toLocaleUpperCase('vi')}</i><span className="delivery-person-name">{name}</span></span>; })}{!people.length && canAssign && <button onClick={event => { event.stopPropagation(); onAssign(); }} disabled={readOnly}>+ Giao cho</button>}</div>;
      if (column.key === 'submission') content = !group && <div className={`delivery-due ${alert.overdue ? 'overdue' : alert.soon ? 'soon' : ''}`}><b>{shortDateTime(record?.dueAt)}</b>{record?.sentAt ? <small className="sent">Đã gửi {shortDateTime(record.sentAt)}</small> : alert.overdue ? <small>Quá hạn {Math.ceil(-alert.hours / 24)} ngày</small> : alert.soon ? <small>Còn {Math.floor(alert.hours / 24)} ngày {Math.max(0, Math.floor(alert.hours % 24))} giờ</small> : null}</div>;
      if (column.key === 'status') content = group ? <strong className="delivery-group-percent">{aggregate == null ? '—' : `${number(aggregate)}%${groupStatusLabel(aggregate)}`}</strong> : <div className="delivery-status-cell"><span className={`delivery-status level-${record?.level || 0} ${record?.freeRework ? 'rework' : ''}`} title={`% ghi nhận: ${metric?.recognized ?? '—'}%`}>{record?.freeRework ? `Làm lại · ${record.changeId ? 'CR' : 'miễn phí'}` : `${record?.level ?? '—'}% · ${label}`}</span>{record?.level >= 60 && <Paperclip size={12} className={record.evidenceId ? 'has-proof' : 'missing-proof'} aria-label={record.evidenceId ? 'Có bằng chứng' : 'Thiếu bằng chứng'} />}{record?.level >= 60 && <small className={record.confirmedBy ? 'has-proof' : 'missing-proof'}>{record.confirmedBy ? '✓ XN' : '○ XN'}</small>}<button aria-label={`Thảo luận ${item.title}`} onClick={event => { event.stopPropagation(); onOpen('comments'); }}><MessageCircle size={13} /></button></div>;
      if (['startDate', 'endDate'].includes(column.key)) content = item[column.key]?.split('-').reverse().join('/') || '—';
      if (column.key === 'days') { const days = workingDaysInRange(item.startDate, item.endDate, item.workCalendar); content = days == null ? (item.days ?? '—') : <span title={`${days} ngày làm (bỏ Chủ nhật / lễ, thứ 7 = 0,5) · ${datesInRange(item.startDate, item.endDate).length} ngày lịch`}>{number(days)}</span>; }
      // Dự báo khi xong theo mức G1 (máy tự tính); nhóm / dự án = tổng các task. Dự báo = Thực tế + Còn lại.
      if (column.key === 'duration') content = work(metric?.forecastWork);
      if (column.key === 'weight') content = metric?.displayWeightPercent != null ? `${number(metric.displayWeightPercent)}%` : metric?.weight == null ? '—' : `${number(metric.weight * 100)}%`;
      // Thực tế = công đã làm, hiện ở mọi dòng (cả task đang làm): Thực tế + Còn lại = Dự báo.
      if (column.key === 'actualWork') {
        // Thực tế (G1) = Σ giờ phiếu giờ đã duyệt ÷ 8.
        const actual = metric?.actualWork ?? 0;
        const hint = taskOverdue ? (metric?.alert?.overBudget ? 'Cảnh báo: Thực tế đã vượt Dự toán mà việc chưa xong' : 'Quá hạn') : nearBudget ? 'Cảnh báo sớm: đã dùng ≥ 80% Dự toán mà chưa nộp' : 'Σ giờ phiếu giờ đã duyệt ÷ 8';
        content = !metric ? '' : taskOverdue ? <span className="delivery-actual-overdue" title={hint}>{work(actual)}</span> : nearBudget ? <span className="delivery-actual-near" title={hint}>{work(actual)}</span> : <span title={group ? undefined : hint}>{work(actual)}</span>;
      }
      if (column.key === 'remainingWork') content = work(remainingWork);
      if (column.key === 'varianceWork') {
        // Chênh = Dự báo − Dự toán; màu: |chênh| < 1 công không màu, > 10% đỏ, > 5% vàng, còn lại xanh. Đỏ thì Leader phải chọn lý do.
        const tone = varianceTone(varianceWork, variancePercent);
        const reason = String(record?.varianceReason || '').trim();
        const needReason = !group && tone === 'danger';
        content = varianceWork == null ? '—' : <span className="delivery-variance-cell"><span className={`delivery-work-variance ${tone}`} title={`Chênh = Dự báo − Dự toán${reason ? ` · Lý do: ${reason}` : ''}`}>{varianceWork > 0 ? '+' : ''}{work(varianceWork)}{variancePercent != null && Math.abs(varianceWork) >= 0.05 ? ` (${variancePercent > 0 ? '+' : ''}${number(variancePercent)}%)` : ''}</span>{needReason && (reason
          ? <small className="delivery-variance-reason" title={`Lý do chênh đỏ: ${reason}`}>{reason}</small>
          : onVarianceReason ? <button type="button" className="delivery-variance-reason missing" onClick={event => { event.stopPropagation(); onVarianceReason(); }}>Chọn lý do</button> : <small className="delivery-variance-reason missing">Chưa có lý do</small>)}</span>;
      }
      if (column.key === 'output') content = formatCompactMoney(metric?.output);
      if (column.key === 'createdAt') content = item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : '—';
      if (column.key === 'note') content = item.isProjectHeader ? item.description || '—' : <div className="delivery-inline-note" onClick={event => event.stopPropagation()}>{readOnly ? item.ganttNote || '—' : <GanttEditableWorkCell item={item} field="ganttNote" onSave={onSaveWork} placeholder="Ghi chú..." />}</div>;
      // Dự toán: task = công chốt theo hợp đồng (sửa được; chưa nhập thì hiện mờ số đang dùng = theo lịch);
      // nhóm = tổng dự toán các task bên trong (chỉ đọc); dòng dự án = dự toán hợp đồng của dự án (sửa được).
      // Dòng dự án, giai đoạn, mục, task cha: Dự toán = tổng các task (chỉ xem, tự cộng lại khi thêm / sửa task); task lá mới nhập được.
      if (column.key === 'contractWork') content = item.isProjectHeader
        ? <span title={item.contractWork != null && item.contractWork !== '' ? `Tổng Dự toán các task · công hợp đồng gốc ${work(item.contractWork)}` : 'Tổng Dự toán các task'}>{work(metric?.budgetedWork)}</span>
        : item.isGroup || group ? work(metric?.budgetedWork) : readOnly ? work(item.contractWork ?? metric?.budgetedWork) : <div onClick={event => event.stopPropagation()}><GanttEditableWorkCell item={item} field="contractWork" type="number" onSave={onSaveWork} placeholder={!item.isProjectHeader && metric?.budgetedWork != null ? number(metric.budgetedWork) : ''} /></div>;
      if (column.key === 'actions' && !readOnly) content = <div className="delivery-row-actions" onClick={event => event.stopPropagation()}><button onClick={onEdit} disabled={readOnly} title="Chỉnh sửa"><Pencil size={13} /></button>{!group && canAssign && <button onClick={onAssign} disabled={readOnly} title="Phân công"><UsersRound size={13} /></button>}<button onClick={onDelete} disabled={readOnly} title="Xóa"><Trash2 size={13} /></button></div>;
      return <div className={`delivery-cell delivery-column ${column.alignLeft ? 'delivery-column-left' : 'delivery-column-center'} ${column.key}`} key={column.key} style={{ width: column.width, minWidth: column.width }}>{dragHandle}{content}{column.key === 'status' && group && <button onClick={event => { event.stopPropagation(); onOpen(); }} aria-label={`Tùy chọn ${item.title}`}><MoreHorizontal size={13} /></button>}</div>;
    })}
  </div>;
}
