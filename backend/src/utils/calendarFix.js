import { calculateAssignmentHours } from '../../../frontend/src/utils/ganttEffort.js';
import { assignmentWorkingDayUnits, datesInRange, workingDayWeight } from '../../../frontend/src/utils/assignmentCalendar.js';
import { renumberNewCodes, spanParentDates } from '../../../frontend/src/utils/wbsStructure.js';
import { addDate } from './operationsReports.js';
import { workUnit, workingDayFrom } from './projectBlueprint.js';

/**
 * Sửa dự án ĐANG CHẠY (người dùng chốt 24/11/2026), không xóa / tạo lại:
 * 1. Mã "MOI" → số tiếp theo mục (C.3 → C.4…). Chỉ đổi mã.
 * 2. Việc CHƯA BẮT ĐẦU bắt đầu / kết thúc vào Chủ nhật, lễ, Tết: đẩy vào ngày làm gần nhất trong khoảng của việc;
 *    việc nằm trọn trong ngày nghỉ dời sang các ngày làm ngay sau đó (đủ số ngày công đã định). Việc khác giữ nguyên ngày,
 *    không kéo theo việc phía sau. Giờ dự kiến của từng người giữ nguyên, chỉ chia lại giờ/ngày.
 * planCalendarFix chỉ tính (xem trước); applyCalendarFix ghi vào db (đối tượng truyền vào).
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

/** Số ngày công đã định của khoảng ngày (coi lễ / Tết như ngày làm: đó là số công người lập lịch đã tính). */
const plannedUnits = (start, end) => datesInRange(start, end).reduce((sum, key) => sum + (new Date(`${key}T12:00:00Z`).getUTCDay() === 0 ? 0 : workingDayWeight(key)), 0);

/** Khoảng ngày mới tránh ngày nghỉ, hoặc null nếu không cần đổi. */
function fixedRange(start, end, projectStart, projectEnd) {
  if (!start || !end) return null;
  if (workUnit(start) > 0 && workUnit(end) > 0) return null;
  const first = workingDayFrom(start, 1, start, end);
  if (first) return { startDate: first, endDate: workingDayFrom(end, -1, first, end) || first };
  // Nằm trọn trong ngày nghỉ: dời sang ngay sau, đủ số ngày công đã định (tối thiểu nửa ngày), không quá ngày kết thúc dự án.
  const lastAllowed = projectEnd && projectEnd > end ? projectEnd : addDate(end, 60);
  const begin = workingDayFrom(addDate(end, 1), 1, addDate(end, 1), lastAllowed) || (projectStart && workingDayFrom(addDate(start, -1), -1, projectStart, start));
  if (!begin) return null;
  const need = Math.max(0.5, plannedUnits(start, end));
  let day = begin, units = workUnit(day);
  while (units < need && addDate(day, 1) <= lastAllowed) { day = addDate(day, 1); units += workUnit(day); }
  return { startDate: begin, endDate: workUnit(day) > 0 ? day : workingDayFrom(day, -1, begin, day) || begin };
}

export function planCalendarFix(db, projectId) {
  const project = (db.projects || []).find(row => row.id === projectId);
  const items = projectGanttItems(db, projectId);
  const parentIds = new Set(items.map(item => item.parentTaskId).filter(Boolean));
  const renumbered = renumberNewCodes(items.map(item => ({ id: item.id, code: item.code })));
  const codeChanges = renumbered.filter((row, index) => row.code !== items[index].code)
    .map(row => { const item = items.find(entry => entry.id === row.id); return { id: item.id, title: item.title, from: item.code, to: row.code }; });
  const dateChanges = [], startedOnHoliday = [];
  for (const item of items.filter(entry => !entry.isGroup && !parentIds.has(entry.id))) {
    const next = fixedRange(item.startDate, item.endDate, project?.startDate, project?.endDate);
    if (!next) continue;
    const row = { id: item.id, code: renumbered.find(entry => entry.id === item.id)?.code || item.code, title: item.title, from: { startDate: item.startDate, endDate: item.endDate }, to: next };
    if (started(db, projectId, item)) startedOnHoliday.push(row); else dateChanges.push(row);
  }
  return { codeChanges, dateChanges, startedOnHoliday };
}

/** Khoảng mới cho một người: cùng khoảng việc thì theo việc; khoảng riêng thì cắt / dời theo cùng quy tắc, nằm trong khoảng việc mới. */
function movedAssignment(item, assignment, next) {
  const start = assignment.startDate || item.startDate, end = assignment.endDate || item.endDate;
  let range = start === item.startDate && end === item.endDate ? next : fixedRange(start, end) || { startDate: start, endDate: end };
  if (range.startDate < next.startDate || range.endDate > next.endDate || range.startDate > range.endDate) range = next;
  const before = assignmentWorkingDayUnits(item, assignment) || 1;
  const hours = Number(assignment.estimatedHoursPerDay) * before;
  const moved = { ...assignment, ...range };
  const after = assignmentWorkingDayUnits({ ...item, ...next }, moved) || 1;
  return { ...moved, estimatedHoursPerDay: Math.round(hours / after * 100) / 100 };
}

export function applyCalendarFix(db, projectId) {
  const plan = planCalendarFix(db, projectId);
  const byId = new Map((db.ganttItems || []).map(item => [item.id, item]));
  for (const change of plan.codeChanges) {
    const item = byId.get(change.id);
    item.code = change.to;
    if (item.isGroup && String(item.title || '').startsWith(`${change.from}.`)) item.title = `${change.to}.${item.title.slice(change.from.length + 1)}`;
    const task = linkedTaskOf(db, item);
    if (task && task.code !== undefined) task.code = change.to;
  }
  for (const change of plan.dateChanges) {
    const item = byId.get(change.id);
    const assignees = (Array.isArray(item.assignees) ? item.assignees : []).map(assignment => movedAssignment(item, assignment, change.to));
    Object.assign(item, change.to, { assignees, days: datesInRange(change.to.startDate, change.to.endDate).length });
    const task = linkedTaskOf(db, item);
    if (task) Object.assign(task, change.to, { estimatedDays: item.days, ...(Array.isArray(task.assignees) ? { assignees } : {}) });
  }
  // Nhóm / task cha bao trùm lại ngày của dòng con.
  const items = projectGanttItems(db, projectId), parentIds = new Set(items.map(item => item.parentTaskId).filter(Boolean));
  if (plan.dateChanges.length) spanParentDates(items, items.filter(item => item.isGroup || parentIds.has(item.id)));
  return plan;
}

/** Tổng giờ dự kiến của việc (để test kiểm tra không hao hụt khi dời). */
export const plannedItemHours = item => (item.assignees || []).reduce((sum, assignment) => sum + calculateAssignmentHours(item, assignment), 0);
