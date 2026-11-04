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
// Xác nhận hoàn thành, mở lại task và duyệt tăng ca là việc nghiệm thu của cấp quản lý, không phải người thực hiện.
export const reviewingRole = role => ['leader', 'manager', 'director', 'admin'].includes(role);

// Mức trạng thái của task chỉ được cập nhật từ ngày bắt đầu đến khi task hoàn thành; hoàn thành thì khóa
// (muốn sửa phải mở lại task). Dùng chung cho giao diện và máy chủ. todayKey dạng YYYY-MM-DD theo giờ Việt Nam.
export function taskStatusWindow(item, linkedTask, todayKey) {
  const startDate = String(item?.startDate || linkedTask?.startDate || '').slice(0, 10);
  if (item?.status === 'completed' || linkedTask?.status === 'completed') return { open: false, reason: 'completed', startDate };
  if (startDate && todayKey && todayKey < startDate) return { open: false, reason: 'not_started', startDate };
  return { open: true, reason: '', startDate };
}
export const taskStatusWindowMessage = window => window.reason === 'completed'
  ? 'Task đã hoàn thành nên trạng thái đã khóa. Cần mở lại task để chỉnh.'
  : window.reason === 'not_started'
    ? `Chưa tới ngày bắt đầu task (${window.startDate.split('-').reverse().join('/')}) nên chưa cập nhật được trạng thái.`
    : '';
export function forecastWork(budgetedWork, actualWork, level = 0) {
  const budgeted = Math.max(0, Number(budgetedWork) || 0);
  const actual = Math.max(0, Number(actualWork) || 0);
  const progress = Number(level) || 0;
  if (progress >= 100) return actual;
  if (progress >= 60) return actual + budgeted * 0.1;
  if (progress >= 20) return Math.max(budgeted, actual * 2);
  return budgeted;
}
/**
 * Dự báo khi xong của một task = công thực tế + công còn lại theo mức trạng thái (dùng chung cho bảng Gantt, Tổng quan, báo cáo):
 * - đã hoàn thành: công thực tế đã ghi nhận lúc xong (không có giờ nào thì coi như đúng kế hoạch);
 * - chưa hoàn thành: công đã dùng (giờ đã duyệt) + công kế hoạch × (100% − mức trạng thái).
 * Công kế hoạch lấy theo lịch / phân công, nên task có lịch dài hơn dự toán báo vượt ngay từ khi chưa làm.
 */
export function taskForecastWork({ planned = 0, spent = 0, level = 0, completed = false, completedActual = null } = {}) {
  const plan = Math.max(0, Number(planned) || 0);
  const progress = Math.min(100, Math.max(0, Number(level) || 0));
  if (completed || progress >= 100) { const actual = Math.max(0, Number(completed ? completedActual ?? spent : spent) || 0); return actual > 0 ? actual : plan; }
  return Math.max(0, Number(spent) || 0) + plan * (100 - progress) / 100;
}

/** Màu của Chênh lệch theo %: xanh ≤ 5% (kể cả dưới dự toán), vàng 5–10%, đỏ > 10%. Chênh quá nhỏ (|chênh| < 0,05 công) để trung tính. */
export function varianceTone(varianceWork, variancePercent) {
  const variance = Number(varianceWork);
  if (varianceWork == null || !Number.isFinite(variance) || Math.abs(variance) < 0.05) return '';
  const percent = Number(variancePercent);
  if (variancePercent == null || !Number.isFinite(percent)) return variance > 0 ? 'danger' : 'good';
  return percent > 10 ? 'danger' : percent > 5 ? 'warning' : 'good';
}

export function workComparison(budgetedWork, actualWork, level = 0, forecastedWork = null) {
  const budgeted = Math.max(0, Number(budgetedWork) || 0);
  const actual = Math.max(0, Number(actualWork) || 0);
  const forecast = forecastedWork == null
    ? forecastWork(budgeted, actual, level)
    : Math.max(0, Number(forecastedWork) || 0);
  const variance = forecast - budgeted;
  return {
    budgetedWork: budgeted,
    forecastWork: forecast,
    remainingWork: Math.max(0, forecast - actual),
    varianceWork: variance,
    variancePercent: budgeted > 0 ? variance / budgeted * 100 : null,
  };
}

// One canonical project-level comparison for both the project table and the
// director overview. A project contract total is the approved budget; task
// metrics remain the source for forecast and recognized actual work.
export function summarizeProjectWork(project = {}, taskMetrics = {}) {
  const metrics = Object.values(taskMetrics || {});
  const taskBudget = metrics.reduce((sum, metric) => sum + Math.max(0, Number(metric?.budgetedWork) || 0), 0);
  const hasProjectBudget = project.contractWork !== '' && project.contractWork != null && Number.isFinite(Number(project.contractWork));
  const budgeted = hasProjectBudget ? Math.max(0, Number(project.contractWork)) : taskBudget;
  const hasRecognizedActual = metrics.some(metric => Object.prototype.hasOwnProperty.call(metric || {}, 'completedActual'));
  const actual = metrics.reduce((sum, metric) => sum + Math.max(0, Number(
    hasRecognizedActual ? metric?.completedActual : metric?.actual
  ) || 0), 0);
  const forecast = metrics.reduce((sum, metric) => sum + Math.max(0, Number(metric?.forecastWork) || 0), 0);
  const variance = forecast - budgeted;
  return {
    budgetedWork: budgeted,
    actualWork: actual,
    forecastWork: forecast,
    remainingWork: Math.max(0, forecast - actual),
    varianceWork: variance,
    variancePercent: budgeted > 0 ? variance / budgeted * 100 : null,
  };
}

export function summarizePortfolioWork(projectComparisons = []) {
  const rows = Array.isArray(projectComparisons) ? projectComparisons : [];
  const totals = rows.reduce((sum, row) => ({
    budgetedWork: sum.budgetedWork + Math.max(0, Number(row?.budgetedWork) || 0),
    actualWork: sum.actualWork + Math.max(0, Number(row?.actualWork) || 0),
    forecastWork: sum.forecastWork + Math.max(0, Number(row?.forecastWork) || 0),
    remainingWork: sum.remainingWork + Math.max(0, Number(row?.remainingWork) || 0),
  }), { budgetedWork: 0, actualWork: 0, forecastWork: 0, remainingWork: 0 });
  totals.varianceWork = totals.forecastWork - totals.budgetedWork;
  totals.variancePercent = totals.budgetedWork > 0 ? totals.varianceWork / totals.budgetedWork * 100 : null;
  return totals;
}
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
/**
 * Nhãn trạng thái của một task theo thang 0–100% ở trang Dự án (nguồn duy nhất).
 * Task chưa từng được cập nhật ở trang Dự án dùng mức suy ra: đã hoàn thành → 100%, đã có giờ làm → 20%.
 */
export function taskDeliveryStatus(task = {}) {
  const synced = task.deliveryStatusLevel != null && DELIVERY_LEVELS.includes(Number(task.deliveryStatusLevel));
  const level = synced ? Number(task.deliveryStatusLevel) : task.status === 'completed' ? 100 : Number(task.actualWorkHours) > 0 ? 20 : 0;
  const recognized = task.deliveryRecognized != null ? Number(task.deliveryRecognized) : level;
  const kind = DELIVERY_LABELS[task.deliveryKind] ? task.deliveryKind : 'design';
  return { level, recognized, label: deliveryLabel({ kind, level }), awaitingConfirmation: level >= 60 && recognized < level };
}
/** Loại bằng chứng bắt buộc của mức đang chọn: 60% = biên bản giao (pháp lý: biên nhận), 80% = góp ý, 100% = chấp thuận. */
export const EVIDENCE_KIND_NAMES = { handover: 'Email / biên bản giao', receipt: 'Biên nhận / mã hồ sơ', feedback: 'Văn bản góp ý / bổ sung', approval: 'Văn bản / email chấp thuận', other: 'Khác' };
export function requiredEvidenceKind(record = {}) {
  const level = Number(record.level) || 0;
  if (level < 60) return null;
  return level === 60 ? (record.kind === 'legal' ? 'receipt' : 'handover') : level === 80 ? 'feedback' : 'approval';
}
/**
 * Ai được xác nhận mức trạng thái của một task (dùng chung cho máy chủ và giao diện, mọi task / dự án):
 * - chỉ Leader, Quản lý, Giám đốc, Quản trị; không ai xác nhận việc mình được giao làm;
 * - người tự báo cáo mức không tự xác nhận, trừ Giám đốc / Quản trị (họ hay nhập hộ, và luôn phải có người gỡ được);
 * - việc giao cho Leader cần Quản lý trở lên; việc giao cho Quản lý cần Giám đốc / Quản trị.
 * assigneeRoles: vai trò tài khoản của từng người được giao. Trả về '' nếu được xác nhận, ngược lại là lý do.
 */
export function confirmBlockReason({ viewer = {}, item = {}, record = {}, assigneeRoles = [] } = {}) {
  const role = viewer.role;
  if (!reviewingRole(role)) return 'Chỉ Leader, Quản lý, Giám đốc hoặc Quản trị được xác nhận.';
  if (viewer.employeeId && (item.assignees || []).some(assignment => assignment.employeeId === viewer.employeeId)) return 'Không được xác nhận việc do chính mình thực hiện.';
  if (viewer.email && viewer.email === record.submittedBy && !['director', 'admin'].includes(role)) return 'Bạn đã báo cáo mức này nên cần người khác xác nhận.';
  if (assigneeRoles.includes('manager') && !['director', 'admin'].includes(role)) return 'Việc của Quản lý cần Giám đốc hoặc Quản trị xác nhận.';
  if (assigneeRoles.includes('leader') && !managingRole(role)) return 'Việc của Leader cần Quản lý trở lên xác nhận.';
  return '';
}
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
    const hasContractWork = item.contractWork !== '' && item.contractWork != null && Number.isFinite(Number(item.contractWork));
    const budgetedWork = record.freeRework || record.isChangeWork ? 0 : hasContractWork ? Number(item.contractWork) : planned;
    // Work-comparison columns use recognized actual work only. Approved hours
    // remain available in `actual` for timesheet efficiency, but must not
    // silently reduce Remaining while the Actual column is still empty.
    // Dự báo theo taskForecastWork; Còn lại = Dự báo − Thực tế (cột Thực tế chỉ tính task đã xong), nên Dự báo = Thực tế + Còn lại.
    const forecast = taskForecastWork({ planned, spent: actualHours / 8, level: record.level, completed: item.status === 'completed', completedActual });
    const comparison = workComparison(budgetedWork, completedActual ?? 0, record.level, forecast);
    const recognized = recognizedLevel(record);
    const earned = planned * recognized / 100;
    const weight = record.freeRework ? 0 : Number.isFinite(Number(data.lockedWeights?.[item.id])) && data.lockedWeights?.[item.id] != null ? Number(data.lockedWeights[item.id]) : data.settings?.contractLocked ? 0 : totalPlanned ? planned / totalPlanned : 0;
    const output = data.settings?.contractFee == null ? null : Number(data.settings.contractFee) * weight * recognized / 100;
    const laborCost = entries.every(entry => rateForEntry(entry) != null) ? entries.reduce((sum, entry) => sum + entry.hours * rateForEntry(entry), 0) : null;
    return [item.id, { planned, actual: actualHours / 8, actualHours, completedActual, completedActualHours, completedCount: item.status === 'completed' ? 1 : 0, ...comparison, recognized, earned, weight, output, laborCost, alert: submissionAlert(record, now), assignments: (item.assignees || []).map(assignment => ({ ...assignment, plannedHours: calculateAssignmentHours(item, assignment) })) }];
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
