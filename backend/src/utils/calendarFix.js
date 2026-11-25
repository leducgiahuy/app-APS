import { assignmentHoursPerDay, calculateAssignmentHours } from '../../../frontend/src/utils/ganttEffort.js';
import { datesInRange, nonWorkingDay, normalizeWorkCalendar, workingDayWeight } from '../../../frontend/src/utils/assignmentCalendar.js';
import { renumberNewCodes, spanParentDates } from '../../../frontend/src/utils/wbsStructure.js';
import { addDate } from './operationsReports.js';
import { workUnit, workingDayFrom } from './projectBlueprint.js';

/**
 * Sửa dự án ĐANG CHẠY (người dùng chốt 24/11/2026 và 25/11/2026), không xóa / tạo lại:
 * 1. Mã "MOI" → số tiếp theo mục (C.3 → C.4…). Chỉ đổi mã.
 * 2. Lịch ngày nghỉ của dự án (project.workCalendar) theo lựa chọn:
 *    'all' làm cả ngày lễ và Chủ nhật · 'sunday' không làm ngày lễ, chỉ làm Chủ nhật · 'none' không làm cả hai (mặc định).
 *    Chủ nhật / lễ có làm tính 8 tiếng như ngày thường.
 *    - Việc CHƯA BẮT ĐẦU bắt đầu / kết thúc vào ngày nghỉ (theo lựa chọn): đẩy vào ngày làm gần nhất trong khoảng của việc;
 *      việc nằm trọn trong ngày nghỉ dời sang các ngày làm ngay sau đó (đủ số ngày công đã định).
 *    - Việc ĐÃ BẮT ĐẦU: không dời ngày, chỉ tính lại ngày nào là ngày làm.
 *    - Mọi việc: tổng giờ dự kiến của từng người giữ nguyên, chỉ chia lại giờ/ngày theo lịch mới.
 *    Việc khác giữ nguyên ngày, không kéo theo việc phía sau.
 * planCalendarFix chỉ tính (xem trước); applyCalendarFix ghi vào db (đối tượng truyền vào) và lưu lựa chọn vào dự án,
 * mọi task sau này tự theo (normalizeAssignmentSchedules gắn item.workCalendar theo dự án).
 */
const linkedTaskOf = (db, item) => (db.tasks || []).find(task => task.ganttId === item.id);

export function projectGanttItems(db, projectId) {
  return (db.ganttItems || []).filter(item => item.projectId === projectId || (!item.projectId && linkedTaskOf(db, item)?.projectId === projectId));
}

/** Việc đã bắt đầu: có tiến độ / trạng thái làm, có mức % ghi nhận, hoặc đã có giờ công (trừ giờ bị từ chối). */
function started(db, projectId, item) {
  const task = linkedTaskOf(db, item);
  const record = db.delivery?.projects?.[projectId]?.records?.[item.id];
  const sheets = db.delivery?.projects?.[projectId]?.timesheets || [];
  return ['in_progress', 'completed'].includes(item.status) || ['in_progress', 'completed'].includes(task?.status)
    || Number(item.progress) > 0 || Number(task?.progress) > 0 || Number(record?.level) > 0
    || sheets.some(sheet => sheet.taskId === item.id && Number(sheet.hours) > 0 && sheet.status !== 'rejected');
}

/** Số ngày công người lập lịch đã tính cho khoảng ngày (theo lịch cũ; lễ / Tết coi như ngày làm như trước). */
const plannedUnits = (start, end, oldPolicy) => datesInRange(start, end).reduce((sum, key) => {
  const sunday = new Date(`${key}T12:00:00Z`).getUTCDay() === 0;
  return sum + (sunday && oldPolicy === 'none' ? 0 : workingDayWeight(key));
}, 0);

/** Khoảng ngày mới tránh ngày nghỉ (theo lịch policy), hoặc null nếu không cần đổi. */
function fixedRange(start, end, projectStart, projectEnd, policy, oldPolicy = policy) {
  if (!start || !end) return null;
  if (workUnit(start, policy) > 0 && workUnit(end, policy) > 0) return null;
  const first = workingDayFrom(start, 1, start, end, policy);
  if (first) return { startDate: first, endDate: workingDayFrom(end, -1, first, end, policy) || first };
  // Nằm trọn trong ngày nghỉ: dời sang ngay sau, đủ số ngày công đã định (tối thiểu nửa ngày), không quá ngày kết thúc dự án.
  const lastAllowed = projectEnd && projectEnd > end ? projectEnd : addDate(end, 60);
  const begin = workingDayFrom(addDate(end, 1), 1, addDate(end, 1), lastAllowed, policy) || (projectStart && workingDayFrom(addDate(start, -1), -1, projectStart, start, policy));
  if (!begin) return null;
  const need = Math.max(0.5, plannedUnits(start, end, oldPolicy));
  let day = begin, units = workUnit(day, policy);
  while (units < need && addDate(day, 1) <= lastAllowed) { day = addDate(day, 1); units += workUnit(day, policy); }
  return { startDate: begin, endDate: workUnit(day, policy) > 0 ? day : workingDayFrom(day, -1, begin, day, policy) || begin };
}

/** Khoảng mới cho một người: cùng khoảng việc thì theo việc; khoảng riêng thì cắt / dời theo cùng quy tắc, nằm trong khoảng việc mới. */
function movedRange(item, assignment, next, policy) {
  const start = assignment.startDate || item.startDate, end = assignment.endDate || item.endDate;
  let range = start === item.startDate && end === item.endDate ? next : fixedRange(start, end, undefined, undefined, policy) || { startDate: start, endDate: end };
  if (range.startDate < next.startDate || range.endDate > next.endDate || range.startDate > range.endDate) range = next;
  return range;
}

const perDayLabel = (item, assignees) => assignees.map(row => `${row.employeeName || 'Chưa gán'} ${Math.round(assignmentHoursPerDay(item, row) * 100) / 100}h/ngày`).join(', ');

export function planCalendarFix(db, projectId, requestedPolicy) {
  const project = (db.projects || []).find(row => row.id === projectId);
  const oldPolicy = normalizeWorkCalendar(project?.workCalendar);
  const policy = normalizeWorkCalendar(requestedPolicy ?? oldPolicy);
  const items = projectGanttItems(db, projectId);
  const parentIds = new Set(items.map(item => item.parentTaskId).filter(Boolean));
  const renumbered = renumberNewCodes(items.map(item => ({ id: item.id, code: item.code })));
  const codeChanges = renumbered.filter((row, index) => row.code !== items[index].code)
    .map(row => { const item = items.find(entry => entry.id === row.id); return { id: item.id, title: item.title, from: item.code, to: row.code }; });
  const codeOf = item => renumbered.find(entry => entry.id === item.id)?.code || item.code;
  const dateChanges = [], startedOnHoliday = [], hourChanges = [], updates = [];
  for (const item of items.filter(entry => !entry.isGroup && !parentIds.has(entry.id))) {
    const next = fixedRange(item.startDate, item.endDate, project?.startDate, project?.endDate, policy, oldPolicy);
    const isStarted = started(db, projectId, item);
    const range = next && !isStarted ? next : null;
    const row = { id: item.id, code: codeOf(item), title: item.title, from: { startDate: item.startDate, endDate: item.endDate } };
    if (next) (isStarted ? startedOnHoliday : dateChanges).push({ ...row, to: next });
    // Giữ tổng giờ từng người (tính theo lịch cũ), chia lại giờ/ngày theo lịch mới và khoảng ngày mới.
    const before = { ...item, workCalendar: oldPolicy };
    const after = { ...item, ...(range || {}), workCalendar: policy };
    const assignees = (Array.isArray(item.assignees) ? item.assignees : []).map(assignment => {
      const hours = calculateAssignmentHours(before, assignment);
      const moved = range ? { ...assignment, ...movedRange(item, assignment, range, policy) } : assignment;
      // Số ngày công theo đúng cách cộng giờ (giờ/ngày = 1) — đúng cho cả phân công bỏ / không bỏ ngày nghỉ.
      const units = calculateAssignmentHours(after, { ...moved, estimatedHoursPerDay: 1 });
      // So với giờ/ngày ĐANG DÙNG (phân công để 0 thì lấy theo task) để không báo đổi khi thực ra giữ nguyên.
      const perDay = units > 0 && hours > 0 ? hours / units : null;
      return perDay != null && Math.abs(perDay - assignmentHoursPerDay(before, assignment)) >= 0.01 ? { ...moved, estimatedHoursPerDay: perDay } : moved;
    });
    const hoursChanged = assignees.some((assignment, index) => assignment.estimatedHoursPerDay !== item.assignees[index].estimatedHoursPerDay);
    if (!range && hoursChanged) hourChanges.push({ ...row, before: perDayLabel(item, item.assignees), after: perDayLabel({ ...item, ...after }, assignees) });
    if (range || hoursChanged) updates.push({ id: item.id, range, assignees });
  }
  return { policy, oldPolicy, codeChanges, dateChanges, startedOnHoliday, hourChanges, updates };
}

export function applyCalendarFix(db, projectId, requestedPolicy) {
  const plan = planCalendarFix(db, projectId, requestedPolicy);
  const project = (db.projects || []).find(row => row.id === projectId);
  const byId = new Map((db.ganttItems || []).map(item => [item.id, item]));
  for (const change of plan.codeChanges) {
    const item = byId.get(change.id);
    item.code = change.to;
    if (item.isGroup && String(item.title || '').startsWith(`${change.from}.`)) item.title = `${change.to}.${item.title.slice(change.from.length + 1)}`;
    const task = linkedTaskOf(db, item);
    if (task && task.code !== undefined) task.code = change.to;
  }
  // Lưu lựa chọn vào dự án và gắn vào mọi dòng của dự án (task thêm sau tự nhận qua normalizeAssignmentSchedules).
  if (project) project.workCalendar = plan.policy;
  for (const item of projectGanttItems(db, projectId)) {
    item.workCalendar = plan.policy;
    const task = linkedTaskOf(db, item);
    if (task) task.workCalendar = plan.policy;
  }
  for (const update of plan.updates) {
    const item = byId.get(update.id);
    if (update.range) Object.assign(item, update.range, { days: datesInRange(update.range.startDate, update.range.endDate).length });
    item.assignees = update.assignees;
    const task = linkedTaskOf(db, item);
    if (task) Object.assign(task, update.range || {}, update.range ? { estimatedDays: item.days } : {}, Array.isArray(task.assignees) ? { assignees: update.assignees.map(row => ({ ...row })) } : {});
  }
  // Nhóm / task cha bao trùm lại ngày của dòng con.
  const items = projectGanttItems(db, projectId), parentIds = new Set(items.map(item => item.parentTaskId).filter(Boolean));
  if (plan.dateChanges.length) spanParentDates(items, items.filter(item => item.isGroup || parentIds.has(item.id)));
  return plan;
}

/** Có gì để áp dụng không (đổi mã, dời ngày, chia lại giờ, hoặc đổi lựa chọn lịch). */
export const calendarFixHasChanges = plan => plan.codeChanges.length > 0 || plan.dateChanges.length > 0 || plan.hourChanges.length > 0 || plan.policy !== plan.oldPolicy;

/** Tổng giờ dự kiến của việc (để test kiểm tra không hao hụt khi dời). */
export const plannedItemHours = item => (item.assignees || []).reduce((sum, assignment) => sum + calculateAssignmentHours(item, assignment), 0);

export { nonWorkingDay };
