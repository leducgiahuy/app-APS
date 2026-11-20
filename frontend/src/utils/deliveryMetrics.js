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
/**
 * Mức trạng thái theo bảng chỉ tiêu G1 của Giám đốc: 0 chưa làm · 50 đang làm · 90 đã nộp · 100 xong.
 * App giữ 6 mức 0/20/40/60/80/100 trên giao diện và quy đổi khi tính công (người dùng chốt 11/11/2026):
 * - task hoàn thành hoặc 100% có file bằng chứng → 100 (xong);
 * - 60% / 80% có file bằng chứng → 90 (đã nộp);
 * - 20%, 40%, hoặc 60–100% chưa có file bằng chứng → 50 (đang làm);
 * - 0% mà đã có giờ được duyệt → 50 (có giờ đầu tiên thì tự chuyển Đang làm); 0% chưa có giờ → 0.
 * Bảng G1 chỉ đòi file bằng chứng cho mức 90 / 100, không đòi Leader xác nhận (người dùng chốt 12/11/2026).
 * Task làm lại / phát sinh (không có Dự toán riêng) dùng mức đã chọn.
 */
export function specLevel(record = {}, { completed = false, actualWork = 0 } = {}) {
  if (completed) return 100;
  const outside = record.freeRework || record.isChangeWork;
  const chosen = Number(record.level) || 0;
  const level = outside || chosen < 60 || record.evidenceId ? chosen : 40;
  if (level >= 100) return 100;
  if (level >= 60) return 90;
  if (level > 0 || Number(actualWork) > 0) return 50;
  return 0;
}
/**
 * Dự báo khi xong của một task theo mức G1 (máy tự tính, không ai sửa):
 * 0 → dự toán · 50 → max(dự toán, 2 × thực tế) · 90 → thực tế + 10% dự toán · 100 → thực tế.
 */
export function forecastWork(budgetedWork, actualWork, level = 0) {
  const budgeted = Math.max(0, Number(budgetedWork) || 0);
  const actual = Math.max(0, Number(actualWork) || 0);
  const progress = Number(level) || 0;
  if (progress >= 100) return actual;
  if (progress >= 90) return actual + budgeted * 0.1;
  if (progress >= 50) return Math.max(budgeted, actual * 2);
  return budgeted;
}

/**
 * Màu của Chênh (G1): |chênh| < 1 công → không màu; % chênh > 10% đỏ; > 5% vàng; còn lại xanh.
 * neutralBelow: ngưỡng không tô màu theo đơn vị của varianceWork (mặc định 1 công).
 */
export function varianceTone(varianceWork, variancePercent, neutralBelow = 1) {
  const variance = Number(varianceWork);
  if (varianceWork == null || !Number.isFinite(variance) || Math.abs(variance) < neutralBelow) return '';
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
  // Dự toán dự án = tổng Dự toán mọi task (người dùng chọn 06/11/2026): thêm / xóa task hay sửa Dự toán một task thì dòng dự án
  // cộng lại ngay, cùng cách với dòng giai đoạn / mục. project.contractWork (công hợp đồng lúc tạo, + CR đã duyệt) chỉ còn để tham chiếu.
  const budgeted = metrics.length ? taskBudget : Math.max(0, Number(project.contractWork) || 0);
  // Thực tế = công đã làm của mọi task (actualWork, cả task đang làm); dữ liệu cũ chưa có actualWork dùng cách cũ.
  const hasRecognizedActual = metrics.some(metric => Object.prototype.hasOwnProperty.call(metric || {}, 'completedActual'));
  const actual = metrics.reduce((sum, metric) => sum + Math.max(0, Number(
    metric?.actualWork ?? (hasRecognizedActual ? metric?.completedActual : metric?.actual)
  ) || 0), 0);
  const forecast = metrics.reduce((sum, metric) => sum + Math.max(0, Number(metric?.forecastWork) || 0), 0);
  const variance = forecast - budgeted;
  // Còn lại của dự án = tổng Còn lại của các task (taskRemainingWork theo trạng thái); dữ liệu chưa có thì Dự báo − Thực tế.
  const hasRemaining = metrics.length > 0 && metrics.every(metric => Number.isFinite(Number(metric?.remainingWork)));
  const remainingTotal = hasRemaining ? metrics.reduce((sum, metric) => sum + Math.max(0, Number(metric.remainingWork)), 0) : Math.max(0, forecast - actual);
  return {
    budgetedWork: budgeted,
    actualWork: actual,
    forecastWork: forecast,
    remainingWork: remainingTotal,
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
  if (role !== 'admin' && viewer.employeeId && (item.assignees || []).some(assignment => assignment.employeeId === viewer.employeeId)) return 'Không được xác nhận việc do chính mình thực hiện.';
  if (viewer.email && viewer.email === record.submittedBy && !['director', 'admin'].includes(role)) return 'Bạn đã báo cáo mức này nên cần người khác xác nhận.';
  if (assigneeRoles.includes('manager') && !['director', 'admin'].includes(role)) return 'Việc của Quản lý cần Giám đốc hoặc Quản trị xác nhận.';
  if (assigneeRoles.includes('leader') && !managingRole(role)) return 'Việc của Leader cần Quản lý trở lên xác nhận.';
  return '';
}
/**
 * Điều kiện chọn mức trạng thái (dùng chung giao diện + máy chủ, người dùng chọn 06/11/2026):
 * - 20% · Đang làm: task đã giao người (ngày bắt đầu đã được taskStatusWindow kiểm tra); không cần giờ chấm công được duyệt —
 *   kiểm chứng làm thật nằm ở 60%+ (bằng chứng + xác nhận) và Duyệt giờ;
 * - quay về 0%: luôn được (sửa khi chọn nhầm); Còn lại vẫn tính đúng theo Thực tế.
 * Trả về lý do chặn (chuỗi) hoặc '' nếu được chọn.
 */
export function levelChangeBlockReason(item, linkedTask, level) {
  if (Number(level) !== 20) return '';
  const people = [...(item?.assignees || []), ...(linkedTask?.assignees || [])].filter(assignment => assignment?.employeeId || assignment?.employeeName);
  const legacy = item?.employeeId || item?.employeeName || linkedTask?.employeeId || linkedTask?.employeeName;
  return people.length || legacy ? '' : 'Chưa thể chọn 20% · Đang làm vì task chưa giao người. Hãy bấm "Phân công" để giao người làm trước.';
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
/**
 * Công còn lại của một task (G1, máy tự tính) = Dự báo − Thực tế, Dự báo theo mức G1 (specLevel, forecastWork).
 * Task làm lại / phát sinh không có Dự toán riêng: Dự báo = Thực tế nên Còn lại = 0.
 */
export function taskRemainingWork({ budget = 0, actual = 0, record = {}, completed = false } = {}) {
  const spent = Math.max(0, Number(actual) || 0);
  if (record.freeRework || record.isChangeWork) return 0;
  return Math.max(0, forecastWork(budget, spent, specLevel(record, { completed, actualWork: spent })) - spent);
}
const dayNumber = key => Date.parse(`${String(key).slice(0, 10)}T00:00:00Z`) / 86400000;
/** Phần thời gian đã qua của task trên Gantt: clamp((hôm nay − bắt đầu) / (kết thúc − bắt đầu), 0, 1). */
export function elapsedShare(startDate, endDate, todayKey) {
  const start = dayNumber(startDate), end = dayNumber(endDate), today = dayNumber(todayKey);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(today)) return 0;
  if (end <= start) return today >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (today - start) / (end - start)));
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
  const todayKey = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const totalPlanned = items.reduce((sum, item) => sum + (records[item.id].freeRework || records[item.id].isChangeWork ? 0 : plannedDays(item)), 0);
  const taskMetrics = Object.fromEntries(items.map(item => {
    const record = records[item.id];
    const planned = record.freeRework || record.isChangeWork ? 0 : plannedDays(item);
    const entries = timesheets.filter(entry => entry.taskId === item.id && entry.status === 'approved');
    const actualHours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    // Công thực tế (G1) = Σ giờ phiếu giờ ĐÃ DUYỆT ÷ 8 (người dùng chốt 11/11/2026 theo bảng của Giám đốc).
    // Đồng hồ giờ công ty không còn dùng để tính công; giờ chỉ được tính khi Leader / Quản lý duyệt.
    const completed = item.status === 'completed';
    const completedActualHours = completed ? actualHours : null;
    const completedActual = completedActualHours == null ? null : completedActualHours / 8;
    const actualWorkHours = actualHours;
    const actualWork = actualWorkHours / 8;
    // Có giờ đầu tiên (đã duyệt) mà task còn 0% → tự chuyển 20% · Đang làm (mức G1: 50).
    if (record.level === 0 && !completed && actualHours > 0) record.level = 20;
    const outside = record.freeRework || record.isChangeWork;
    const hasContractWork = item.contractWork !== '' && item.contractWork != null && Number.isFinite(Number(item.contractWork));
    const budgetedWork = outside ? 0 : hasContractWork ? Number(item.contractWork) : planned;
    // Dự báo theo mức G1 (0 / 50 / 90 / 100); Còn lại = Dự báo − Thực tế; Chênh = Dự báo − Dự toán.
    // Task làm lại / phát sinh (không có Dự toán riêng): Dự báo = Thực tế.
    const level = specLevel(record, { completed, actualWork });
    const forecast = outside ? actualWork : forecastWork(budgetedWork, actualWork, level);
    const comparison = workComparison(budgetedWork, actualWork, level, forecast);
    const recognized = recognizedLevel(record);
    const earned = planned * recognized / 100;
    const weight = record.freeRework ? 0 : Number.isFinite(Number(data.lockedWeights?.[item.id])) && data.lockedWeights?.[item.id] != null ? Number(data.lockedWeights[item.id]) : data.settings?.contractLocked ? 0 : totalPlanned ? planned / totalPlanned : 0;
    const output = data.settings?.contractFee == null ? null : Number(data.settings.contractFee) * weight * recognized / 100;
    const laborCost = entries.every(entry => rateForEntry(entry) != null) ? entries.reduce((sum, entry) => sum + entry.hours * rateForEntry(entry), 0) : null;
    // Cảnh báo sớm (G1): chưa xong mà Thực tế > Dự toán; hoặc đã dùng ≥ 80% Dự toán mà chưa nộp (mức < 90); hoặc quá hạn nộp.
    const submission = submissionAlert(record, now);
    const overBudget = !outside && budgetedWork > 0 && level < 100 && actualWork > budgetedWork;
    const nearBudget = !outside && budgetedWork > 0 && level < 90 && actualWork >= 0.8 * budgetedWork;
    const early = overBudget || nearBudget || submission.overdue;
    const alert = { ...submission, overBudget, nearBudget, early, warning: submission.warning || early };
    const varianceRed = varianceTone(comparison.varianceWork, comparison.variancePercent) === 'danger';
    return [item.id, { planned, actual: actualHours / 8, actualHours, completedActual, completedActualHours, actualWork, actualWorkHours, completedCount: completed ? 1 : 0, ...comparison, level, levelWork: budgetedWork * level / 100, planWork: budgetedWork * elapsedShare(item.startDate, item.endDate, todayKey), varianceRed, varianceReasonMissing: varianceRed && !String(record.varianceReason || '').trim(), recognized, earned, weight, output, laborCost, alert, assignments: (item.assignees || []).map(assignment => ({ ...assignment, plannedHours: calculateAssignmentHours(item, assignment) })) }];
  }));
  const totalEarned = Object.values(taskMetrics).reduce((sum, item) => sum + item.earned, 0);
  const totalActual = Object.values(taskMetrics).reduce((sum, item) => sum + item.actual, 0);
  const totalCompletedActual = Object.values(taskMetrics).reduce((sum, item) => sum + (item.completedActual ?? 0), 0);
  const totalActualWork = Object.values(taskMetrics).reduce((sum, item) => sum + item.actualWork, 0);
  const usefulActual = items.filter(item => !records[item.id].freeRework).reduce((sum, item) => sum + taskMetrics[item.id].actual, 0);
  const project = (db.projects || []).find(item => item.id === projectId);
  const projectDays = datesInRange(project?.startDate, project?.endDate);
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const workingDays = projectDays.reduce((sum, key) => sum + capacityWeight(key), 0);
  const elapsed = projectDays.filter(key => key <= today).reduce((sum, key) => sum + capacityWeight(key), 0);
  // % hoàn thành (G1) = Σ(Dự toán × mức) ÷ Σ Dự toán; % kế hoạch = Σ(Dự toán × % thời gian đã qua của việc trên Gantt) ÷ Σ Dự toán.
  const metricList = Object.values(taskMetrics);
  const totalBudget = metricList.reduce((sum, item) => sum + item.budgetedWork, 0);
  const completion = totalBudget ? metricList.reduce((sum, item) => sum + item.levelWork, 0) / totalBudget * 100 : 0;
  const planPercent = totalBudget ? metricList.reduce((sum, item) => sum + item.planWork, 0) / totalBudget * 100 : workingDays ? Math.min(100, elapsed / workingDays * 100) : 0;
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
  return { records, taskMetrics, timesheets, milestones, summary: { progressThisMonth, totalPlanned, totalEarned, totalActual, totalCompletedActual, totalActualWork, completion, planPercent, deviation: completion - planPercent, efficiency: totalActual ? totalEarned / totalActual : null, efficiencyWithoutRework: usefulActual ? totalEarned / usefulActual : null, warnings, earlyWarnings: metricList.filter(item => item.alert.early).length, redTasks: metricList.filter(item => item.varianceRed).length, missingVarianceReasons: metricList.filter(item => item.varianceReasonMissing).length, soon: Object.values(taskMetrics).filter(item => item.alert.soon).length, overdue: Object.values(taskMetrics).filter(item => item.alert.overdue).length, stuck: Object.values(taskMetrics).filter(item => item.alert.stuck).length, output, monthlyOutput, laborCost, expenseCost, cost: laborCost == null ? null : laborCost + expenseCost, collected, eligiblePayment } };
}
