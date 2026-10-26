import React, { useMemo, useState } from 'react';
import { assignmentWorkingDates } from '../../utils/assignmentCalendar';
import { calendarCapacity, employeePosition, positionKey } from '../../utils/workforceForecast';
import { calculateAssignmentHours } from '../../utils/ganttEffort';
import './AssignmentMachinePage.css';

const assignmentList = (item, linkedTask) => {
  const source = Array.isArray(linkedTask?.assignees) ? linkedTask.assignees : item.assignees;
  if (Array.isArray(source) && source.length) return source;
  const employeeId = linkedTask?.employeeId || item.employeeId;
  const employeeName = linkedTask?.employeeName || item.employeeName || item.assignee;
  return employeeId || employeeName ? [{ employeeId, employeeName, startDate: item.startDate, endDate: item.endDate, estimatedHoursPerDay: item.estimatedHoursPerDay }] : [];
};

const itemHours = item => {
  const stored = Number(item.estimatedHours);
  if (stored > 0) return stored;
  const days = assignmentWorkingDates(item, { startDate: item.startDate, endDate: item.endDate, excludeNonWorkingDays: true }).length;
  return days * (Number(item.estimatedHoursPerDay) || 8);
};

const overlapHours = (item, assignment, target) => {
  const startDate = [item.startDate, assignment.startDate, target.startDate].filter(Boolean).sort().at(-1);
  const endDate = [item.endDate, assignment.endDate, target.endDate].filter(Boolean).sort()[0];
  if (!startDate || !endDate || endDate < startDate) return 0;
  return calculateAssignmentHours({ ...item, startDate, endDate }, { ...assignment, startDate, endDate });
};

const departmentCode = employee => {
  const source = `${employee?.team || ''} ${employee?.title || ''}`.toLocaleLowerCase('vi');
  if (/pháp|phap/.test(source)) return 'PL';
  if (/cơ điện|co dien|mep|pccc/.test(source)) return 'MEP';
  if (/khảo sát|khao sat|địa chất|dia chat/.test(source)) return 'KC';
  return 'KT';
};

export default function AssignmentMachinePage({ projectId, items, tasks, employees, updateGanttItem, readOnly }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkEmployeeId, setBulkEmployeeId] = useState('');
  const [overrides, setOverrides] = useState({});
  const [savingId, setSavingId] = useState('');
  const [leaderChangedIds, setLeaderChangedIds] = useState([]);

  const linkedByGantt = useMemo(() => new Map(tasks.filter(task => task.ganttId).map(task => [task.ganttId, task])), [tasks]);
  const parentIds = useMemo(() => new Set(items.map(item => item.parentTaskId).filter(Boolean)), [items]);
  const projectItems = useMemo(() => items.filter(item =>
    !item.isGroup && !item.isProjectHeader && !parentIds.has(item.id) &&
    (projectId === 'ALL' || item.projectId === projectId || linkedByGantt.get(item.id)?.projectId === projectId) &&
    !['holiday', 'cancelled'].includes(item.status)
  ), [items, linkedByGantt, parentIds, projectId]);

  const rows = useMemo(() => {
    const recommendations = [];
    return projectItems.map(item => {
      const linked = linkedByGantt.get(item.id);
      const current = assignmentList(item, linked);
      const started = Number(linked?.progress ?? item.progress) > 0 || (linked?.status || item.status) === 'completed';
      const currentEmployee = employees.find(employee => employee.id === current[0]?.employeeId) || employees.find(employee => employee.name === current[0]?.employeeName);
      const required = item.requiredPosition || item.position || currentEmployee?.title || '';
      let candidates = employees.filter(employee => employee.status !== 'inactive');
      const exact = candidates.filter(employee => positionKey(employeePosition(employee)) === positionKey(required));
      if (exact.length) candidates = exact;
      const loadInRange = employee => {
        const existing = items.filter(source => !source.isGroup && !source.isProjectHeader).reduce((sum, source) => sum + assignmentList(source, linkedByGantt.get(source.id)).filter(assignment => assignment.employeeId === employee.id).reduce((total, assignment) => total + overlapHours(source, assignment, item), 0), 0);
        const proposed = recommendations.filter(entry => entry.employeeId === employee.id).reduce((sum, entry) => sum + overlapHours(entry.item, entry.assignment, item), 0);
        return existing + proposed;
      };
      candidates.sort((a, b) => loadInRange(a) - loadInRange(b) || a.name.localeCompare(b.name, 'vi'));
      const recommended = currentEmployee || candidates[0];
      const hours = itemHours({ ...linked, ...item });
      const before = recommended ? loadInRange(recommended) : 0;
      const rangeCapacity = recommended ? calendarCapacity(item.startDate, item.endDate, Number(recommended.standardHours) || 8) : 0;
      const beforePercent = rangeCapacity ? Math.round(before / rangeCapacity * 100) : 0;
      const afterPercent = rangeCapacity ? Math.round((before + (currentEmployee ? 0 : hours)) / rangeCapacity * 100) : 0;
      if (recommended && !currentEmployee) recommendations.push({ employeeId: recommended.id, item, assignment: { startDate: item.startDate, endDate: item.endDate, estimatedHoursPerDay: hours / Math.max(1, assignmentWorkingDates(item, { startDate: item.startDate, endDate: item.endDate, excludeNonWorkingDays: true }).length), excludeNonWorkingDays: true } });
      return { item, linked, current, currentEmployee, recommended, hours, started, beforePercent, afterPercent, overloaded: !currentEmployee && (!recommended || afterPercent > 100) };
    });
  }, [employees, items, linkedByGantt, projectItems]);

  const chosenEmployeeId = row => overrides[row.item.id] || row.currentEmployee?.id || row.recommended?.id || '';
  const assign = async (row, employeeId, leaderChange = true) => {
    const employee = employees.find(person => person.id === employeeId);
    if (!employee || row.started || row.currentEmployee || row.linked?.status === 'completed' || row.item.status === 'completed') return;
    setSavingId(row.item.id);
    const dates = assignmentWorkingDates(row.item, { startDate: row.item.startDate, endDate: row.item.endDate, excludeNonWorkingDays: true });
    const success = await updateGanttItem(row.item.id, { assignees: [{ employeeId: employee.id, employeeName: employee.name, startDate: row.item.startDate, endDate: row.item.endDate, estimatedHoursPerDay: row.hours / Math.max(1, dates.length), excludeNonWorkingDays: true, excludedDates: [] }] });
    if (success) {
      setOverrides(current => ({ ...current, [row.item.id]: employee.id }));
      if (leaderChange) setLeaderChangedIds(current => [...new Set([...current, row.item.id])]);
      setSelectedIds(current => current.filter(id => id !== row.item.id));
    }
    setSavingId('');
  };

  const assignBulk = async () => {
    if (!bulkEmployeeId || !selectedIds.length) return;
    for (const row of rows.filter(entry => selectedIds.includes(entry.item.id))) await assign(row, bulkEmployeeId);
  };

  const loadRows = useMemo(() => employees.map(employee => {
    const employeeRows = rows.filter(row => (overrides[row.item.id] || row.currentEmployee?.id || row.recommended?.id) === employee.id);
    const hours = employeeRows.reduce((sum, row) => sum + row.hours, 0);
    const first = employeeRows.map(row => row.item.startDate).filter(Boolean).sort()[0];
    const last = employeeRows.map(row => row.item.endDate).filter(Boolean).sort().at(-1);
    const capacity = first && last ? calendarCapacity(first, last, Number(employee.standardHours) || 8) : 0;
    return { employee, percent: capacity ? Math.round(hours / capacity * 100) : 0 };
  }).filter(row => row.percent > 0).sort((a, b) => b.percent - a.percent), [employees, overrides, rows]);

  const machineCount = rows.filter(row => !row.currentEmployee && row.recommended).length;
  const overloadedCount = rows.filter(row => row.overloaded).length;

  return <section className="machine-assignment">
    <div className="machine-kpis">
      <div><span>Máy gán</span><b>{machineCount}</b><small>Việc chưa bắt đầu và việc mới</small></div>
      <div><span>Leader đã đổi</span><b>{leaderChangedIds.length}</b><small>Điều chỉnh trực tiếp trong bảng</small></div>
      <div className="danger"><span>Quá tải do thiếu người</span><b>{overloadedCount}</b><small>Đồng bộ sang báo cáo năng lực</small></div>
    </div>
    <div className="machine-panel">
      <header><b>Phân công · {projectId === 'ALL' ? 'Tất cả dự án' : 'Dự án đang chọn'}</b><small> Chọn việc rồi gán hàng loạt, hoặc đổi người trực tiếp tại từng dòng</small></header>
      <div className="machine-bulk"><span>Gán các việc đã tích cho</span><select value={bulkEmployeeId} onChange={event => setBulkEmployeeId(event.target.value)} disabled={readOnly}><option value="">Chọn người</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {departmentCode(employee)}</option>)}</select><button onClick={assignBulk} disabled={readOnly || !bulkEmployeeId || !selectedIds.length}>Gán</button></div>
      <div className="machine-table-wrap"><table><thead><tr><th></th><th>Việc</th><th>Bộ môn</th><th>Công DT</th><th>Người làm</th><th>Nguồn</th><th>Lý do · tải trước → sau</th></tr></thead><tbody>{rows.map(row => {
        const employee = employees.find(person => person.id === chosenEmployeeId(row));
        const locked = row.started || Boolean(row.currentEmployee) || row.linked?.status === 'completed' || row.item.status === 'completed';
        return <tr key={row.item.id} className={row.overloaded ? 'overloaded' : ''}>
          <td><input type="checkbox" aria-label={`Chọn ${row.item.title}`} disabled={readOnly || locked} checked={selectedIds.includes(row.item.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, row.item.id] : current.filter(id => id !== row.item.id))} /></td>
          <td><b>{row.item.code}</b> {row.item.title}</td><td><span className={`dept dept-${departmentCode(employee).toLowerCase()}`}>{departmentCode(employee)}</span></td><td>{(row.hours / 8).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td>
          <td>{locked || row.currentEmployee ? <span>{employee?.name || 'Chưa phân công'}</span> : <select aria-label={`Người làm ${row.item.title}`} disabled={readOnly || savingId === row.item.id} value={overrides[row.item.id] || ''} onChange={event => assign(row, event.target.value)}><option value="">Đề xuất: {row.recommended?.name || 'Chưa có người phù hợp'}</option>{employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>}</td>
          <td><span className={`source ${row.currentEmployee ? 'kept' : 'auto'}`}>{row.currentEmployee ? 'Đang làm · giữ nguyên' : 'Máy gán'}</span></td>
          <td>{row.currentEmployee ? (row.started ? 'Việc đã bắt đầu' : 'Phân công hiện có · giữ nguyên') : `${row.beforePercent}% → ${row.afterPercent}%`}{row.overloaded && <span className="overload-label">Quá tải do thiếu người</span>}</td>
        </tr>;
      })}</tbody></table></div>
    </div>
    <div className="machine-panel machine-load"><header><b>Tải sau phân công</b><small> Tải cập nhật theo các việc của dự án đang chọn</small></header><table><thead><tr><th>Người</th><th>Bộ môn</th><th>Tải</th><th></th></tr></thead><tbody>{loadRows.map(({ employee, percent }) => <tr key={employee.id}><td><b>{employee.name}</b></td><td><span className={`dept dept-${departmentCode(employee).toLowerCase()}`}>{departmentCode(employee)}</span></td><td className={percent > 100 ? 'load-high' : percent >= 90 ? 'load-warn' : 'load-ok'}>{percent}%</td><td><div className="load-track"><i style={{ width: `${Math.min(100, percent)}%` }} /></div></td></tr>)}</tbody></table></div>
  </section>;
}
