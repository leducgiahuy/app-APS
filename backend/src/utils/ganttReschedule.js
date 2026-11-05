import { calculateAssignmentHours } from '../../../frontend/src/utils/ganttEffort.js';

/**
 * Dời / co giãn lịch của một nhóm mục Gantt khi đổi ngày của khung chứa chúng
 * (dòng dự án → mọi mục của dự án; dòng giai đoạn / mục → các mục con). Một nguồn duy nhất cho cả hai.
 *
 * - Ngày của từng mục được ánh xạ theo tỷ lệ vị trí trong khung cũ → khung mới
 *   (cùng độ dài = dời nguyên khối, giữ đúng khoảng cách giữa các task).
 * - GIỮ NGUYÊN số giờ của từng người được phân công (= công đã chia từ hợp đồng): chỉ tính lại giờ/ngày
 *   theo lịch mới bằng chính calculateAssignmentHours (thứ 7 nửa ngày, bỏ CN / lễ nếu phân công bỏ ngày nghỉ).
 * - Task không bao giờ nằm trọn trong ngày nghỉ: nếu rơi vào CN / lễ thì nới ngày kết thúc tới ngày làm kế tiếp
 *   (trong khung mới), không được thì lùi ngày bắt đầu.
 * - Không đổi Dự toán (contractWork), trạng thái hay giờ đã làm.
 * - Nhóm được nới cho bao trùm các mục con sau khi dời.
 * Trả về thông báo lỗi (chuỗi) nếu không xếp được, ngược lại null. Hàm chỉ sửa db khi thành công.
 */
const DAY = 86400000;
const toMs = key => Date.parse(`${key}T00:00:00Z`);
const toKey = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (key, days) => toKey(toMs(key) + days * DAY);
const inclusiveDays = (start, end) => Math.floor((toMs(end) - toMs(start)) / DAY) + 1;

export function rescheduleGanttRange(db, { items, oldStart, oldEnd, newStart, newEnd }) {
  if (![oldStart, oldEnd, newStart, newEnd].every(key => Number.isFinite(toMs(key || ''))) || oldEnd < oldStart || newEnd < newStart) {
    return 'Khoảng ngày không hợp lệ';
  }
  if (oldStart === newStart && oldEnd === newEnd) return null;
  const oldDays = inclusiveDays(oldStart, oldEnd), newDays = inclusiveDays(newStart, newEnd);
  const mapDate = key => {
    if (!Number.isFinite(toMs(key || ''))) return key;
    const offset = Math.max(0, Math.min(oldDays - 1, Math.round((toMs(key) - toMs(oldStart)) / DAY)));
    const mapped = oldDays === newDays ? offset : oldDays <= 1 || newDays <= 1 ? 0 : Math.round(offset * (newDays - 1) / (oldDays - 1));
    return addDays(newStart, Math.min(newDays - 1, mapped));
  };
  const clamp = (key, start, end) => key < start ? start : key > end ? end : key;
  // Giờ/ngày = 1 → calculateAssignmentHours trả về "số ngày công" của phân công theo lịch.
  const unitsOf = (item, assignment) => calculateAssignmentHours(item, { ...assignment, estimatedHoursPerDay: 1 });

  const plans = [];
  for (const item of items) {
    const start = mapDate(item.startDate), end = mapDate(item.endDate) < start ? start : mapDate(item.endDate);
    if (item.isGroup) { plans.push({ item, start, end }); continue; }
    const assignees = (item.assignees || []).map(assignment => ({ assignment, hours: calculateAssignmentHours(item, assignment) }));
    let taskStart = start, taskEnd = end;
    const place = (s, e) => assignees.map(({ assignment, hours }) => {
      const aStart = clamp(mapDate(assignment.startDate || item.startDate), s, e);
      const aEnd = clamp(mapDate(assignment.endDate || item.endDate), aStart, e);
      return { assignment, hours, startDate: aStart, endDate: aEnd };
    });
    const working = (s, e, rows) => rows.every(row => row.hours <= 0 || unitsOf({ ...item, startDate: s, endDate: e }, { ...row.assignment, startDate: row.startDate, endDate: row.endDate }) > 0);
    let rows = place(taskStart, taskEnd);
    // Rơi trọn vào ngày nghỉ → nới ngày kết thúc tới ngày làm kế tiếp, không được thì lùi ngày bắt đầu.
    for (let step = 0; !working(taskStart, taskEnd, rows) && step < 14; step++) {
      if (taskEnd < newEnd) taskEnd = addDays(taskEnd, 1);
      else if (taskStart > newStart) taskStart = addDays(taskStart, -1);
      else break;
      rows = place(taskStart, taskEnd).map(row => ({ ...row, startDate: row.startDate > taskStart && !working(taskStart, taskEnd, [row]) ? taskStart : row.startDate, endDate: taskEnd }));
    }
    if (!working(taskStart, taskEnd, rows)) return `Không xếp được "${item.title}" vào ngày làm việc trong khoảng ${newStart} → ${newEnd}`;
    plans.push({ item, start: taskStart, end: taskEnd, rows });
  }

  for (const { item, start, end, rows } of plans) {
    item.startDate = start;
    item.endDate = end;
    item.days = inclusiveDays(start, end);
    if (rows?.length) {
      item.assignees = rows.map(({ assignment, hours, startDate, endDate }) => {
        const next = { ...assignment, startDate, endDate };
        const units = unitsOf({ ...item, startDate: start, endDate: end }, next);
        return units > 0 && hours > 0 ? { ...next, estimatedHoursPerDay: hours / units } : next;
      });
      item.estimatedHours = Math.round(rows.reduce((sum, row) => sum + row.hours, 0) * 100) / 100;
    }
    for (const task of (db.tasks || []).filter(task => task.ganttId === item.id)) {
      task.startDate = start;
      task.endDate = end;
      task.estimatedDays = item.days;
      if (rows?.length) { task.assignees = item.assignees.map(assignment => ({ ...assignment })); task.estimatedHours = item.estimatedHours; }
    }
  }

  // Nhóm bao trùm các mục con (task bị nới khỏi ngày nghỉ có thể vượt mép nhóm).
  const groups = plans.filter(plan => plan.item.isGroup).map(plan => plan.item);
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const group of groups) {
      const children = plans.map(plan => plan.item).filter(child => child !== group && child.parentGroupId === group.id);
      if (!children.length) continue;
      const start = children.reduce((min, child) => child.startDate < min ? child.startDate : min, group.startDate);
      const end = children.reduce((max, child) => child.endDate > max ? child.endDate : max, group.endDate);
      if (start !== group.startDate || end !== group.endDate) { group.startDate = start; group.endDate = end; group.days = inclusiveDays(start, end); changed = true; }
    }
    if (!changed) break;
  }
  return null;
}
