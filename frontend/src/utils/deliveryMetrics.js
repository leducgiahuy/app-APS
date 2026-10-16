import { calculateAssignmentHours, calculatePlannedPersonDays, calculateUnassignedPlannedPersonDays } from './ganttEffort.js';
import { datesInRange } from './assignmentCalendar.js';
import { capacityWeight } from './workforceForecast.js';

export const DELIVERY_LEVELS = [0, 20, 40, 60, 80, 100];
export const DELIVERY_LABELS = {
  design: ['Chưa bắt đầu', 'Đang làm', 'Chờ kiểm tra', 'Đã gửi', 'Đã sửa', 'Phê duyệt'],
  legal: ['Chưa bắt đầu', 'Đang chuẩn bị hồ sơ', 'Chờ CĐT ký', 'Đã nộp, có biên nhận', 'Đã bổ sung theo ý kiến', 'Có kết quả'],
};
export const DELIVERY_ROLES = { employee: 'Nhân viên', leader: 'Leader', manager: 'Quản lý cấp trung', accountant: 'Kế toán viên / HCNS', chiefAccountant: 'Kế toán trưởng', director: 'Giám đốc', admin: 'Quản trị' };
export const moneyAccess = role => ['manager', 'accountant', 'chiefAccountant', 'director', 'admin'].includes(role);
export const managingRole = role => ['manager', 'director', 'admin'].includes(role);
export const plannedDays = item => {
  const assignments = Array.isArray(item.assignees)
    ? item.assignees.filter(assignment => assignment.employeeId || assignment.employeeName)
    : [];
  return assignments.length || item.assignee || item.employeeId || item.employeeName
    ? calculatePlannedPersonDays(item)
    : calculateUnassignedPlannedPersonDays(item);
};
export const formatMoney = value => value == null ? 'Chưa nhập' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} đ`;
export const formatCompactMoney = value => value == null ? '—' : Math.abs(value) >= 1e9 ? `${(value / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ` : `${(value / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
export const deliveryLabel = record => DELIVERY_LABELS[record.kind || 'design'][DELIVERY_LEVELS.indexOf(record.level || 0)] || 'Chưa bắt đầu';
export function recognizedLevel(record = {}) {
  if (record.freeRework || record.isChangeWork) return 0;
  if (record.approvalOnly) return record.level === 100 && record.evidenceId && record.confirmedBy ? 100 : 0;
  return record.level >= 60 && (!record.evidenceId || !record.confirmedBy) ? 40 : Number(record.level) || 0;
}
export function submissionAlert(record, now = new Date()) {
  const hours = record.dueAt ? (Date.parse(record.dueAt) - now.getTime()) / 3600000 : null;
  const sent = Boolean(record.sentAt);
  const missingProof = record.level >= 60 && (!record.evidenceId || !record.confirmedBy);
  const stuck = record.level === 80 && record.levelChangedAt && now.getTime() - Date.parse(record.levelChangedAt) > 30 * 86400000;
  return { hours, overdue: hours != null && hours < 0 && !sent, soon: hours != null && hours >= 0 && hours < 72 && !sent, missingProof, stuck, warning: (!sent && hours != null && hours < 72) || missingProof || Boolean(stuck) };
}
export function projectDeliveryItems(db, projectId) {
  const project = (db.projects || []).find(item => item.id === projectId);
  const linked = new Map((db.tasks || []).filter(item => item.ganttId).map(item => [item.ganttId, item]));
  const parents = new Set((db.ganttItems || []).map(item => item.parentTaskId).filter(Boolean));
  return (db.ganttItems || []).filter(item => !item.isGroup && !item.isProjectHeader && item.status !== 'holiday' && item.status !== 'cancelled' && !parents.has(item.id) && (item.projectId === projectId || (!item.projectId && (linked.get(item.id)?.projectId === projectId || linked.get(item.id)?.projectName === project?.name))))
    .map(item => ({ ...linked.get(item.id), ...item, id: item.id }));
}
export function defaultDeliveryRecord(item) {
  return { kind: 'design', level: item.status === 'completed' ? 100 : 0, department: '', dueAt: '', recipient: '', submissionContent: '', sentAt: '', evidenceId: '', confirmedBy: '', confirmedAt: '', freeRework: false, approvalOnly: false, notes: item.ganttNote || item.notes || '', levelChangedAt: '' };
}
export function sessionCandidates(db, items) {
  return items.flatMap(item => {
    const linked = (db.tasks || []).find(task => task.ganttId === item.id);
    const sessions = item.actualWorkEntries?.length ? item.actualWorkEntries : linked?.actualWorkEntries?.length ? linked.actualWorkEntries : linked?.workSessions || item.workSessions || [];
    return sessions.map((entry, index) => ({ id: `session:${item.id}:${entry.id || entry.startAt || index}`, taskId: item.id, employeeId: entry.employeeId, employeeName: entry.employeeName || (db.employees || []).find(employee => employee.id === entry.employeeId)?.name || 'Nhân sự đã xóa', date: entry.date || (entry.startAt ? new Date(Date.parse(entry.startAt) + 7 * 3600000).toISOString().slice(0, 10) : ''), hours: Number(entry.hours) || 0, shiftType: entry.shiftType || 'regular', source: 'session', status: 'pending' }));
  });
}
export function computeDelivery(db, projectId, data = {}, now = new Date()) {
  const items = projectDeliveryItems(db, projectId);
  const overrides = new Map((data.timesheets || []).map(entry => [entry.id, entry]));
  const savedTimesheets = data.timesheets || [];
  const naturalKey = entry => [entry.taskId, entry.employeeId, entry.date, entry.shiftType || 'regular'].join('|');
  const enteredKeys = new Set(savedTimesheets.filter(entry => entry.source !== 'session').map(naturalKey));
  const sessions = sessionCandidates(db, items).filter(entry => !enteredKeys.has(naturalKey(entry)));
  const sessionIds = new Set(sessions.map(entry => entry.id));
  const timesheets = [...sessions.map(entry => ({ ...entry, ...overrides.get(entry.id) })), ...savedTimesheets.filter(entry => !sessionIds.has(entry.id))];
  const changeWorkIds = new Set((data.changes || []).filter(change => change.status !== 'Từ chối').map(change => change.reworkTaskId).filter(Boolean));
  const records = Object.fromEntries(items.map(item => [item.id, { ...defaultDeliveryRecord(item), ...data.records?.[item.id], isChangeWork: Boolean(data.records?.[item.id]?.isChangeWork || changeWorkIds.has(item.id)), notes: item.ganttNote ?? data.records?.[item.id]?.notes ?? item.notes ?? '' }]));
  const rateForEntry = entry => {
    const explicit = data.settings?.rates?.[entry.employeeId] ?? data.settings?.hourlyRate;
    if (explicit != null) return Number(explicit);
    const grade = (db.employees || []).find(person => person.id === entry.employeeId)?.grade;
    const rate = (db.operations?.params?.rateCard || []).filter(row => row.status === 'approved' && row.grade === grade && (!row.effectiveFrom || row.effectiveFrom <= entry.date)).toSorted((a,b) => (a.effectiveFrom || '').localeCompare(b.effectiveFrom || '')).at(-1);
    return rate?.amount ?? null;
  };
  const totalPlanned = items.reduce((sum, item) => sum + (records[item.id].freeRework || records[item.id].isChangeWork ? 0 : plannedDays(item)), 0);
  const taskMetrics = Object.fromEntries(items.map(item => {
    const record = records[item.id];
    const planned = record.freeRework || record.isChangeWork ? 0 : plannedDays(item);
    const entries = timesheets.filter(entry => entry.taskId === item.id && entry.status === 'approved');
    const actualHours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    const trackedCompletionHours = Math.max(0, Number(item.actualWorkHours) || 0);
    const completedActualHours = item.status === 'completed'
      ? (trackedCompletionHours > 0 ? trackedCompletionHours : actualHours)
      : null;
    const completedActual = completedActualHours == null ? null : completedActualHours / 8;
    if (!data.records?.[item.id] && record.level === 0 && actualHours > 0) record.level = 20;
    const recognized = recognizedLevel(record);
    const earned = planned * recognized / 100;
    const weight = record.freeRework ? 0 : Number.isFinite(Number(data.lockedWeights?.[item.id])) && data.lockedWeights?.[item.id] != null ? Number(data.lockedWeights[item.id]) : data.settings?.contractLocked ? 0 : totalPlanned ? planned / totalPlanned : 0;
    const output = data.settings?.contractFee == null ? null : Number(data.settings.contractFee) * weight * recognized / 100;
    const laborCost = entries.every(entry => rateForEntry(entry) != null) ? entries.reduce((sum, entry) => sum + entry.hours * rateForEntry(entry), 0) : null;
    return [item.id, { planned, actual: actualHours / 8, actualHours, completedActual, completedActualHours, completedCount: item.status === 'completed' ? 1 : 0, recognized, earned, weight, output, laborCost, alert: submissionAlert(record, now), assignments: (item.assignees || []).map(assignment => ({ ...assignment, plannedHours: calculateAssignmentHours(item, assignment) })) }];
  }));
  const totalEarned = Object.values(taskMetrics).reduce((sum, item) => sum + item.earned, 0);
  const totalActual = Object.values(taskMetrics).reduce((sum, item) => sum + item.actual, 0);
  const totalCompletedActual = Object.values(taskMetrics).reduce((sum, item) => sum + (item.completedActual ?? 0), 0);
  const usefulActual = items.filter(item => !records[item.id].freeRework).reduce((sum, item) => sum + taskMetrics[item.id].actual, 0);
  const project = (db.projects || []).find(item => item.id === projectId);
  const projectDays = datesInRange(project?.startDate, project?.endDate);
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const workingDays = projectDays.reduce((sum, key) => sum + capacityWeight(key), 0);
  const elapsed = projectDays.filter(key => key <= today).reduce((sum, key) => sum + capacityWeight(key), 0);
  const effortCompletion = totalPlanned ? totalEarned / totalPlanned * 100 : 0;
  const completion = data.settings?.contractLocked ? Object.values(taskMetrics).reduce((sum, item) => sum + item.weight * item.recognized, 0) : effortCompletion;
  const planPercent = workingDays ? Math.min(100, elapsed / workingDays * 100) : 0;
  const fee = data.settings?.contractFee;
  const output = fee == null ? null : Object.values(taskMetrics).reduce((sum, item) => sum + item.output, 0);
  const month = today.slice(0, 7);
  const previousOutput = (data.history || []).filter(entry => new Date(Date.parse(entry.at) + 7 * 3600000).toISOString().slice(0, 7) < month && entry.output != null).at(-1)?.output || 0;
  const monthlyOutput = output == null || !(data.history || []).length ? null : output - previousOutput;
  const previousProgress = (data.history || []).filter(entry => Number.isFinite(Date.parse(entry.at)) && new Date(Date.parse(entry.at) + 7 * 3600000).toISOString().slice(0, 7) < month).toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)?.completion;
  const progressThisMonth = previousProgress == null ? null : completion - Number(previousProgress);
  const approved = timesheets.filter(entry => entry.status === 'approved');
  const allRatesKnown = approved.every(entry => rateForEntry(entry) != null);
  const laborCost = allRatesKnown ? approved.reduce((sum, entry) => sum + entry.hours * rateForEntry(entry), 0) : null;
  const expenses = data.expenses || [];
  const expenseCost = expenses.filter(entry => entry.status === 'approved').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const receipts = data.receipts || [];
  const collected = receipts.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const milestones = (data.milestones || []).map(entry => {
    const met = entry.conditions?.length ? entry.conditions.every(condition => condition.op === '=' ? taskMetrics[condition.taskId]?.recognized === Number(condition.level) : taskMetrics[condition.taskId]?.recognized >= Number(condition.level)) : entry.taskIds?.length ? entry.taskIds.every(id => taskMetrics[id]?.recognized === 100) : completion >= Number(entry.completionRequired ?? 100);
    const metOn = met ? entry.metOn || now.toISOString().slice(0, 10) : '';
    const workingLate = metOn ? datesInRange(metOn, today).filter(key => key !== metOn && capacityWeight(key) > 0).length : 0;
    return { ...entry, met, metOn, reminder: met && !entry.requestedAt && workingLate >= 5 };
  });
  const eligiblePayment = milestones.filter(entry => entry.met && !entry.requestedAt).reduce((sum, entry) => sum + Number(entry.amount), 0);
  const warnings = Object.values(taskMetrics).filter(item => item.alert.warning).length;
  return { records, taskMetrics, timesheets, milestones, summary: { progressThisMonth, totalPlanned, totalEarned, totalActual, totalCompletedActual, completion, planPercent, deviation: completion - planPercent, efficiency: totalActual ? totalEarned / totalActual : null, efficiencyWithoutRework: usefulActual ? totalEarned / usefulActual : null, warnings, soon: Object.values(taskMetrics).filter(item => item.alert.soon).length, overdue: Object.values(taskMetrics).filter(item => item.alert.overdue).length, stuck: Object.values(taskMetrics).filter(item => item.alert.stuck).length, output, monthlyOutput, laborCost, expenseCost, cost: laborCost == null ? null : laborCost + expenseCost, collected, eligiblePayment } };
}
