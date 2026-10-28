import { useState } from 'react';
import { Card } from './OperationsCommon';
import { positionLookup, quoteItemsToTemplateItems, readQuoteInfo } from '../gantt/quoteFileReader';
import './TemplateEditor.css';

const newId = () => `tpl-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

/**
 * Đổi việc của template (dạng lưu trên máy chủ) sang dòng trên form.
 * Ngày hiển thị là "ngày thứ N" tính từ ngày bắt đầu dự án (offset 0 = ngày 1) cho dễ hiểu.
 * "Làm sau" hiển thị bằng mã việc, cách nhau dấu phẩy.
 */
function toRows(items = []) {
  const codeOf = new Map(items.map(item => [item.id, item.code || item.title]));
  return items.map(item => {
    const after = (item.dependencies || []).map(id => codeOf.get(id)).filter(Boolean).join(', ');
    return {
      key: item.id, source: item, code: item.code || '', title: item.title || '',
      requiredPosition: item.requiredPosition || '', assignmentPosition: item.assignmentPosition || '',
      startDay: (Number(item.startOffset) || 0) + 1, endDay: (Number(item.endOffset) || 0) + 1,
      workDays: item.estimatedHours ? Number(item.estimatedHours) / 8 : '', after, initialAfter: after,
    };
  });
}

/**
 * Đổi dòng trên form về việc của template. Giữ nguyên các thuộc tính nâng cao của việc cũ (nhóm, phạm vi, màu...).
 * "Làm sau" chỉ được đọc lại khi người dùng có sửa ô đó, để không làm mất phụ thuộc của việc không có mã.
 */
function toItems(rows) {
  const idOf = new Map(rows.flatMap(row => [[row.code.trim().toLocaleLowerCase('vi'), row.key], [row.title.trim().toLocaleLowerCase('vi'), row.key]]).filter(([name]) => name));
  return rows.map(row => {
    const dependencies = row.after === row.initialAfter ? row.source?.dependencies || [] : row.after.split(',').map(code => code.trim()).filter(Boolean).map(code => {
      const id = idOf.get(code.toLocaleLowerCase('vi'));
      if (!id || id === row.key) throw new Error(`Việc "${row.title}": không tìm thấy việc "${code}" ở cột Làm sau.`);
      return id;
    });
    if (!row.title.trim()) throw new Error('Mỗi việc cần có tên.');
    if (Number(row.endDay) < Number(row.startDay)) throw new Error(`Việc "${row.title}": ngày kết thúc đang trước ngày bắt đầu.`);
    return {
      ...(row.source || {}), id: row.key, code: row.code.trim(), title: row.title.trim(),
      requiredPosition: row.requiredPosition.trim(), assignmentPosition: row.assignmentPosition.trim(),
      startOffset: Math.max(0, Number(row.startDay) - 1), endOffset: Math.max(0, Number(row.endDay) - 1),
      estimatedHours: Number(row.workDays) > 0 ? Number(row.workDays) * 8 : 0, dependencies,
    };
  });
}

/**
 * Form thêm/sửa template dự án (thay cho ô JSON cũ). Chỉ Giám đốc/Quản trị được lưu (máy chủ kiểm tra lại).
 * - Thông tin mẫu: tên, diện tích chuẩn (số công tự co giãn theo diện tích dự án; 0 = không co giãn).
 * - Bảng việc: mã, tên, bộ môn, vị trí gán người, ngày thứ bắt đầu/kết thúc, công, làm sau việc nào; thêm/xóa/đổi thứ tự.
 * - "Nhập từ file báo giá": lấy bảng hạng mục trong file Excel theo mẫu, xếp nối tiếp theo số công.
 * - Ngân sách %, mốc thanh toán, phạm vi của mẫu cũ được giữ nguyên khi lưu.
 */
export default function TemplateEditor({ api, template, onClose }) {
  const [name, setName] = useState(template?.name || '');
  const [baseArea, setBaseArea] = useState(template?.baseArea || 0);
  const [rows, setRows] = useState(() => toRows(template?.items));
  const [message, setMessage] = useState('');

  const update = (key, field, value) => setRows(current => current.map(row => row.key === key ? { ...row, [field]: value } : row));
  const move = (index, step) => setRows(current => { const next = [...current]; [next[index], next[index + step]] = [next[index + step], next[index]]; return next; });
  const addRow = () => setRows(current => {
    const last = current.at(-1), start = last ? Number(last.endDay) + 1 : 1;
    return [...current, { key: newId(), source: null, code: '', title: '', requiredPosition: '', assignmentPosition: '', startDay: start, endDay: start, workDays: '', after: last?.code || '', initialAfter: null }];
  });
  // Xóa việc mà mốc thanh toán đang dùng làm điều kiện sẽ làm hỏng mẫu → chặn và báo rõ.
  const removeRow = row => {
    const usedBy = (template?.milestones || []).find(milestone => (milestone.conditions || []).some(condition => condition.taskId === row.key));
    if (usedBy) { setMessage(`Không xóa được "${row.title}" vì mốc "${usedBy.title}" đang dùng việc này làm điều kiện.`); return; }
    setRows(current => current.filter(item => item.key !== row.key));
  };

  const importFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const { items, warnings } = await readQuoteInfo(file, { templates: api.data?.templates || [] });
      if (!items.length) { setMessage('File chưa có bảng hạng mục nào có số công.'); return; }
      if (rows.length && !window.confirm(`Thay ${rows.length} việc hiện có bằng ${items.length} hạng mục trong file?`)) return;
      setRows(toRows(quoteItemsToTemplateItems(items, positionLookup(api.data?.templates))));
      setMessage(`Đã nhập ${items.length} hạng mục từ file${warnings.length ? `. Lưu ý: ${warnings.join('; ')}` : ''}.`);
    } catch (exception) { setMessage(exception.message || 'Không đọc được file.'); }
  };

  const save = async () => {
    try {
      if (!name.trim()) throw new Error('Cần đặt tên template.');
      if (!rows.length) throw new Error('Template cần ít nhất một việc.');
      const items = toItems(rows);
      await api.mutate('template', { ...(template || {}), name: name.trim(), baseArea: Number(baseArea) || 0, items, budgetPercents: template?.budgetPercents || Array(9).fill(0), milestones: template?.milestones || [], scopeOptions: template?.scopeOptions || [] }, template?.id);
      onClose();
    } catch (exception) { setMessage(exception.message || 'Không lưu được template.'); }
  };

  const totalDays = rows.reduce((sum, row) => sum + (Number(row.workDays) || 0), 0);
  return <Card title={template ? `Sửa template · ${template.name}` : 'Thêm template mới'} subtitle={`${rows.length} việc · ${totalDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} công · ngày tính từ ngày bắt đầu dự án`}
    actions={<><label className="template-editor-file">Nhập từ file báo giá<input type="file" accept=".xlsx,.csv" onChange={importFile} /></label><button onClick={onClose}>Hủy</button><button className="primary" disabled={api.disabled} onClick={save}>Lưu template</button></>}>
    {message && <p className="template-editor-message" role="status">{message}</p>}
    <div className="template-editor-meta">
      <label>Tên template<input value={name} onChange={event => setName(event.target.value)} placeholder="VD: Nhà xưởng 1 tầng" /></label>
      <label>Diện tích chuẩn (m²)<input type="number" min="0" value={baseArea} onChange={event => setBaseArea(event.target.value)} /><small>Số công tự co giãn theo diện tích dự án. Để 0 nếu không co giãn.</small></label>
    </div>
    <div className="template-editor-table"><table>
      <thead><tr><th>#</th><th>Mã</th><th>Tên việc</th><th>Bộ môn</th><th>Vị trí gán người</th><th>Ngày bắt đầu</th><th>Ngày kết thúc</th><th>Công</th><th>Làm sau (mã)</th><th></th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.key}>
        <td>{index + 1}</td>
        <td><input className="short" value={row.code} onChange={event => update(row.key, 'code', event.target.value)} /></td>
        <td><input className="wide" value={row.title} onChange={event => update(row.key, 'title', event.target.value)} /></td>
        <td><input className="short" value={row.requiredPosition} onChange={event => update(row.key, 'requiredPosition', event.target.value)} /></td>
        <td><input value={row.assignmentPosition} placeholder={row.requiredPosition} onChange={event => update(row.key, 'assignmentPosition', event.target.value)} /></td>
        <td><input className="number" type="number" min="1" value={row.startDay} onChange={event => update(row.key, 'startDay', event.target.value)} /></td>
        <td><input className="number" type="number" min="1" value={row.endDay} onChange={event => update(row.key, 'endDay', event.target.value)} /></td>
        <td><input className="number" type="number" min="0" step="any" value={row.workDays} placeholder="theo lịch" onChange={event => update(row.key, 'workDays', event.target.value)} /></td>
        <td><input className="short" value={row.after} onChange={event => update(row.key, 'after', event.target.value)} /></td>
        <td className="template-editor-row-actions"><button aria-label="Lên" disabled={!index} onClick={() => move(index, -1)}>↑</button><button aria-label="Xuống" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button><button aria-label={`Xóa ${row.title}`} onClick={() => removeRow(row)}>✕</button></td>
      </tr>)}{!rows.length && <tr><td colSpan="10" className="template-editor-empty">Chưa có việc. Bấm "+ Thêm việc" hoặc "Nhập từ file báo giá".</td></tr>}</tbody>
    </table></div>
    <div className="template-editor-footer"><button onClick={addRow}>+ Thêm việc</button><small>Công để trống = tính theo số ngày làm việc của việc. Vị trí gán người phải trùng chức danh nhân sự (VD: Thiết Kế) để máy tự gán.</small></div>
  </Card>;
}
