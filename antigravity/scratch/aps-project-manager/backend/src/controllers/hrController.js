import { readDb, writeDb } from '../models/db.js';
import {
  employeeOtEntries,
  isOvertimeClockInAllowed,
  isOvertimeShift,
  isSyntheticOvertimeTaskId,
  localDateKey,
  matchesEmployee,
  normalizeShiftType,
  overtimeHoursForDate
} from '../utils/shift.js';

/**
 * Controller Quản Lý Nhân Sự (HR)
 * Quản lý danh sách nhân sự, trạng thái có mặt tại công trường (On-site),
 * và số lượng task được giao cho từng người (đồng bộ 2 chiều với Gantt & Task).
 */

function migrateLegacyCheckIn(emp, now) {
  if (!emp.isOnSite || emp.checkInAt) return false;
  const match = String(emp.checkInTime || '').match(/(\d{1,2}):(\d{2})/);
  const checkedIn = new Date(now);
  if (match) checkedIn.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (checkedIn > now) checkedIn.setDate(checkedIn.getDate() - 1);
  emp.checkInAt = checkedIn.toISOString();
  return true;
}

function isAssignedToEmployee(item, emp) {
  const normalizedEmployeeName = (emp.name || '').trim().toLowerCase();
  return item.employeeId === emp.id ||
    (item.employeeName || item.assignee || '').trim().toLowerCase() === normalizedEmployeeName ||
    (Array.isArray(item.assignees) && item.assignees.some(assignment =>
      assignment.employeeId === emp.id || (assignment.employeeName || '').trim().toLowerCase() === normalizedEmployeeName
    ));
}

function activeOnDate(item, dateKey) {
  return (!item.startDate || item.startDate <= dateKey) && (!item.endDate || item.endDate >= dateKey);
}

function assignedOnDate(item, emp, dateKey) {
  if (Array.isArray(item.assignees) && item.assignees.length) {
    return item.assignees.some(assignment => matchesEmployee(assignment, emp) && activeOnDate({
      startDate: assignment.startDate || item.startDate,
      endDate: assignment.endDate || item.endDate
    }, dateKey));
  }
  return isAssignedToEmployee(item, emp) && activeOnDate(item, dateKey);
}

function updateEmployeeTaskSessions(db, emp, startAt, endAt = null) {
  const task = (db.tasks || []).find(item => item.id === emp.activeTaskId || item.ganttId === emp.activeTaskId);
  const gantt = task
    ? (db.ganttItems || []).find(item => item.id === task.ganttId)
    : (db.ganttItems || []).find(item => item.id === emp.activeTaskId);
  const selectedItems = [task, gantt].filter(Boolean);
  if (selectedItems.length === 0) return false;
  const dateKey = localDateKey(new Date(startAt));
  const timestamp = Date.parse(startAt);
  const elapsedHours = endAt ? Math.max(0, (Date.parse(endAt) - timestamp) / 3600000) : 0;
  selectedItems.forEach(item => {
    if (item.isGroup) return;
    // A closed segment remains valid even after an assignment or OT slip changes.
    if (!endAt) {
      const valid = isOvertimeShift(emp.shiftType)
        ? employeeOtEntries(db.overtimes, emp, dateKey).some(ot => ot.taskId === task?.id)
        : assignedOnDate(item, emp, dateKey);
      if (!valid || item.status === 'completed') return;
    }
    item.attendanceTracked = true;
    item.actualWorkStartedAt ||= startAt;
    if (endAt) {
      item.actualWorkHours = Math.round(((Number(item.actualWorkHours) || 0) + elapsedHours) * 100) / 100;
      // Preserve each closed attendance segment by employee so project reports
      // can split normal hours by person; legacy actualWorkHours stays supported.
      if (elapsedHours > 0) {
        item.actualWorkEntries ||= [];
        item.actualWorkEntries.push({
          employeeId: emp.id,
          employeeName: emp.name,
          startAt,
          endAt,
          hours: Math.round(elapsedHours * 100) / 100,
          shiftType: normalizeShiftType(emp.shiftType)
        });
      }
      item.workSessionStartedAt = null;
    } else {
      item.workSessionStartedAt = startAt;
    }
  });
  return true;
}

function approvedOvertimeHours(db, emp, dateKey) {
  return overtimeHoursForDate(db.overtimes || [], emp, dateKey);
}

function isValidShiftTask(db, emp, taskId, shiftType, dateKey) {
  if (!taskId) return { ok: true, task: null, synthetic: false };
  if (isOvertimeShift(shiftType) && isSyntheticOvertimeTaskId(taskId)) {
    const otId = String(taskId).slice(3);
    const ot = employeeOtEntries(db.overtimes || [], emp, dateKey).find(item => item.id === otId);
    if (!ot) return { ok: false, message: 'Phiếu tăng ca không hợp lệ cho ngày hôm nay' };
    return { ok: true, task: null, synthetic: true, title: ot.taskTitle || 'Tăng ca đột xuất tại công trường' };
  }
  const task = (db.tasks || []).find(item => item.id === taskId);
  if (!task) return { ok: false, message: 'Không tìm thấy công việc' };
  if (task.status === 'completed') return { ok: false, message: 'Công việc này đã hoàn thành' };
  if (isOvertimeShift(shiftType)) {
    const linked = employeeOtEntries(db.overtimes || [], emp, dateKey).some(item => item.taskId === task.id);
    if (!linked) return { ok: false, message: 'Task này không nằm trong danh sách tăng ca hôm nay' };
    return { ok: true, task, synthetic: false };
  }
  if (!assignedOnDate(task, emp, dateKey)) {
    return { ok: false, message: 'Chỉ có thể chọn task chưa hoàn thành đang được giao hôm nay' };
  }
  return { ok: true, task, synthetic: false };
}

function needsTaskSessionSync(db, emp) {
  if (!emp.checkInAt || emp.isOnBreak || !emp.activeTaskId || isSyntheticOvertimeTaskId(emp.activeTaskId)) return false;
  const dateKey = localDateKey(new Date(emp.checkInAt));
  const expectedSessionStart = emp.workSessionStartedAt || emp.checkInAt;
  return [...(db.tasks || []), ...(db.ganttItems || [])].some(item =>
    (item.id === emp.activeTaskId || item.ganttId === emp.activeTaskId) &&
    !item.isGroup && item.status !== 'completed' &&
    (isOvertimeShift(emp.shiftType)
      ? isValidShiftTask(db, emp, emp.activeTaskId, emp.shiftType, dateKey).ok
      : assignedOnDate(item, emp, dateKey)) &&
    (!item.attendanceTracked || item.workSessionStartedAt !== expectedSessionStart)
  );
}

function normalizeActiveTaskSession(db, emp, now) {
  if (!emp.isOnSite || !emp.checkInAt) return false;
  const nowKey = localDateKey(new Date(emp.checkInAt));
  if (isOvertimeShift(emp.shiftType) && isSyntheticOvertimeTaskId(emp.activeTaskId)) {
    const valid = isValidShiftTask(db, emp, emp.activeTaskId, emp.shiftType, nowKey);
    if (valid.ok) return false;
    emp.activeTaskId = null;
    emp.activeTaskTitle = null;
    emp.workSessionStartedAt = null;
    return true;
  }
  const activeTask = (db.tasks || []).find(task => task.id === emp.activeTaskId);
  const taskValid = activeTask && isValidShiftTask(db, emp, emp.activeTaskId, emp.shiftType, nowKey).ok;
  const keepTask = taskValid
    ? activeTask
    : !emp.activeTaskId && !isOvertimeShift(emp.shiftType)
      ? (db.tasks || []).find(task => assignedOnDate(task, emp, nowKey) && task.status !== 'completed' && task.workSessionStartedAt)
      : null;
  let changed = false;
  if (emp.activeTaskId && !keepTask && emp.workSessionStartedAt) {
    updateEmployeeTaskSessions(db, emp, emp.workSessionStartedAt, now.toISOString());
  }
  if (keepTask && emp.activeTaskId !== keepTask.id) {
    emp.activeTaskId = keepTask.id;
    emp.activeTaskTitle = keepTask.title;
    emp.workSessionStartedAt = keepTask.workSessionStartedAt || emp.workSessionStartedAt || emp.checkInAt;
    changed = true;
  }

  const keepGanttId = keepTask?.ganttId;
  [...(db.tasks || []), ...(db.ganttItems || [])].forEach(item => {
    const isCurrent = keepTask && (item.id === keepTask.id || item.id === keepGanttId);
    if (!isCurrent && item.workSessionStartedAt && isAssignedToEmployee(item, emp)) {
      item.workSessionStartedAt = null;
      changed = true;
    }
  });

  if (emp.activeTaskId && !keepTask) {
    emp.activeTaskId = null;
    emp.activeTaskTitle = null;
    emp.workSessionStartedAt = null;
    changed = true;
  }
  return changed;
}

function closeExpiredShifts(db, now = new Date()) {
  const autoCheckedOutIds = [];
  const taskSessionsSyncedIds = [];
  let changed = false;

  (db.employees || []).forEach(emp => {
    if (migrateLegacyCheckIn(emp, now)) changed = true;
    if (!emp.isOnSite || !emp.checkInAt) return;

    if (normalizeActiveTaskSession(db, emp, now)) {
      changed = true;
      taskSessionsSyncedIds.push(emp.id);
    }

    // Đồng bộ cả những ca đã vào trước khi tính năng theo dõi giờ công được cập nhật.
    if (needsTaskSessionSync(db, emp)) {
      updateEmployeeTaskSessions(db, emp, emp.workSessionStartedAt || emp.checkInAt);
      emp.workSessionStartedAt ||= emp.checkInAt;
      taskSessionsSyncedIds.push(emp.id);
      changed = true;
    }

    const checkInTimestamp = Date.parse(emp.checkInAt);
    if (!Number.isFinite(checkInTimestamp)) return;
    const checkInDate = new Date(checkInTimestamp);
    const dateKey = localDateKey(checkInDate);
    const standardHours = Number(emp.standardHours) > 0 ? Number(emp.standardHours) : 8;
    const overtimeHours = approvedOvertimeHours(db, emp, dateKey);
    const requiredHours = isOvertimeShift(emp.shiftType) ? overtimeHours : standardHours;
    if (requiredHours <= 0) return;
    const requiredWorkMs = requiredHours * 60 * 60 * 1000;
    const breakStartedTimestamp = emp.isOnBreak ? Date.parse(emp.breakStartedAt || '') : NaN;
    const activeBreakMs = Number.isFinite(breakStartedTimestamp) ? Math.max(0, now.getTime() - breakStartedTimestamp) : 0;
    const completedBreakMs = Number(emp.totalBreakMs) || 0;
    const workedMs = Math.max(0, now.getTime() - checkInTimestamp - completedBreakMs - activeBreakMs);
    if (workedMs < requiredWorkMs) return;

    const shiftEnd = new Date(checkInTimestamp + requiredWorkMs + completedBreakMs);
    if (emp.workSessionStartedAt) updateEmployeeTaskSessions(db, emp, emp.workSessionStartedAt, shiftEnd.toISOString());
    emp.isOnSite = false;
    emp.isOnBreak = false;
    emp.breakStartedAt = null;
    emp.totalBreakMs = 0;
    emp.workSessionStartedAt = null;
    emp.activeTaskId = null;
    emp.activeTaskTitle = null;
    emp.lastShiftCheckInAt = emp.checkInAt;
    emp.activeTaskShiftType = null;
    emp.lastShiftCheckOutAt = shiftEnd.toISOString();
    emp.lastShiftCheckOutTime = shiftEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    emp.lastShiftType = normalizeShiftType(emp.shiftType);
    emp.shiftType = null;
    emp.checkInAt = null;
    emp.checkInTime = null;
    autoCheckedOutIds.push(emp.id);
    changed = true;
  });

  if (changed) writeDb(db);
  return { autoCheckedOutIds, taskSessionsSyncedIds };
}

// Lấy danh sách toàn bộ nhân sự kèm số task đang phụ trách
export function getEmployees(req, res) {
  const db = readDb();
  const { autoCheckedOutIds, taskSessionsSyncedIds } = closeExpiredShifts(db);
  const tasks = db.tasks || [];
  const ganttItems = db.ganttItems || [];
  const overtimes = db.overtimes || [];

  // Tính số lượng task và giờ OT cho từng nhân viên
  const employeesWithStats = db.employees.map(emp => {
    const empNameNorm = (emp.name || '').trim().toLowerCase();

    // 1. Lấy từ danh sách db.tasks
    const assignedTasks = tasks.filter(t =>
      t.employeeId === emp.id ||
      (t.employeeName && t.employeeName.trim().toLowerCase() === empNameNorm)
    );

    // 2. Đồng bộ thêm từ ganttItems nếu có task giao theo tên người đảm nhận
    ganttItems.forEach(g => {
      if (g.assignee && g.assignee.trim().toLowerCase() === empNameNorm && !g.isGroup) {
        if (!assignedTasks.some(t => t.title === g.title || t.ganttId === g.id || t.id === g.id)) {
          assignedTasks.push({
            id: g.id,
            title: g.title,
          startDate: g.startDate,
          endDate: g.endDate,
            status: g.status || 'in_progress',
            speedStatus: g.speed || 'on_time'
          });
        }
      }
    });

    const empOvertimes = overtimes.filter(o =>
      o.employeeId === emp.id ||
      (o.employeeName && o.employeeName.trim().toLowerCase() === empNameNorm)
    );
    const totalOtHours = empOvertimes.reduce((sum, o) => sum + (Number(o.hours) || 0), 0);

    return {
      ...emp,
      taskCount: assignedTasks.length,
      tasks: assignedTasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        startDate: t.startDate,
        endDate: t.endDate
      })),
      totalOtHours: Math.round(totalOtHours * 10) / 10
    };
  });

  return res.json({
    success: true,
    data: employeesWithStats,
    meta: {
      total: employeesWithStats.length,
      onSiteCount: employeesWithStats.filter(e => e.isOnSite).length,
      standardHoursPerPerson: 8,
      autoCheckedOutIds,
      taskSessionsSyncedIds
    }
  });
}

// Thêm nhân sự mới
export function createEmployee(req, res) {
  const db = readDb();
  const { name, title, team, phone, email, standardHours } = req.body;

  if (!name || !title) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên và chức danh' });
  }

  const newEmployee = {
    id: `emp-${Date.now()}`,
    code: `NV-${String(db.employees.length + 1).padStart(3, '0')}`,
    name,
    title,
    team: team || 'Ban Quản Lý',
    phone: phone || 'Đang cập nhật',
    email: email || '',
    standardHours: Number(standardHours) || 8,
    isOnSite: false,
    isOnBreak: false,
    checkInAt: null,
    checkInTime: null,
    breakStartedAt: null,
    totalBreakMs: 0,
    workSessionStartedAt: null,
    activeTaskId: null,
    activeTaskTitle: null,
    activeTaskShiftType: null,
    shiftType: null,
    avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80`
  };

  db.employees.push(newEmployee);
  writeDb(db);

  return res.status(201).json({
    success: true,
    message: 'Tạo nhân sự mới thành công',
    data: newEmployee
  });
}

// Chuyển đổi trạng thái có mặt tại công trường (Vào / Ra ca)
export function toggleOnSite(req, res) {
  const db = readDb();
  const { id } = req.params;

  const emp = db.employees.find(e => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự' });
  }

  const now = new Date();
  const goingOnSite = !emp.isOnSite;
  const shiftType = normalizeShiftType(req.body?.shiftType || emp.shiftType);

  if (goingOnSite) {
    if (isOvertimeShift(shiftType)) {
      const gate = isOvertimeClockInAllowed(now);
      if (!gate.ok) return res.status(400).json({ success: false, message: gate.message });
      if (approvedOvertimeHours(db, emp, localDateKey(now)) <= 0) {
        return res.status(400).json({ success: false, message: 'Chưa có đăng ký tăng ca được duyệt cho hôm nay' });
      }
    }
    const dateKey = localDateKey(now);
    const validTask = isValidShiftTask(db, emp, emp.activeTaskId, shiftType, dateKey);
    if (emp.activeTaskId && (!validTask.ok || normalizeShiftType(emp.activeTaskShiftType) !== shiftType)) {
      return res.status(400).json({ success: false, message: validTask.message || 'Hãy chọn task của ca muốn bắt đầu' });
    }
    emp.isOnSite = true;
    emp.shiftType = shiftType;
    emp.checkInAt = now.toISOString();
    emp.checkInTime = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    emp.isOnBreak = false;
    emp.breakStartedAt = null;
    emp.totalBreakMs = 0;
    if (!validTask.ok || !emp.activeTaskId) {
      emp.activeTaskId = null;
      emp.activeTaskTitle = null;
    } else if (validTask.synthetic) {
      emp.activeTaskTitle = validTask.title;
    }
    emp.workSessionStartedAt = emp.activeTaskId ? emp.checkInAt : null;
    if (emp.activeTaskId && !isSyntheticOvertimeTaskId(emp.activeTaskId)) updateEmployeeTaskSessions(db, emp, emp.checkInAt);
  } else {
    emp.lastShiftCheckInAt = emp.checkInAt || null;
    emp.lastShiftCheckOutAt = now.toISOString();
    emp.lastShiftCheckOutTime = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    emp.lastShiftType = normalizeShiftType(emp.shiftType);
    if (emp.workSessionStartedAt && !isSyntheticOvertimeTaskId(emp.activeTaskId)) {
      updateEmployeeTaskSessions(db, emp, emp.workSessionStartedAt, now.toISOString());
    }
    emp.activeTaskId = null;
    emp.checkInAt = null;
    emp.checkInTime = null;
    emp.isOnBreak = false;
    emp.breakStartedAt = null;
    emp.totalBreakMs = 0;
    emp.workSessionStartedAt = null;
    emp.activeTaskTitle = null;
    emp.activeTaskShiftType = null;
    emp.shiftType = null;
    emp.isOnSite = false;
  }

  writeDb(db);

  const onSiteMessage = isOvertimeShift(shiftType)
    ? `Đã bắt đầu tăng ca cho ${emp.name}`
    : `Đã cập nhật trạng thái của ${emp.name}: Có mặt tại công trường`;
  const offSiteMessage = isOvertimeShift(emp.lastShiftType)
    ? `${emp.name} đã rời văn phòng`
    : `Đã cập nhật trạng thái của ${emp.name}: Đã rời công trường`;

  return res.json({
    success: true,
    message: emp.isOnSite ? onSiteMessage : offSiteMessage,
    data: emp
  });
}

export function toggleBreak(req, res) {
  const db = readDb();
  const emp = db.employees.find(employee => employee.id === req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự' });
  if (!emp.isOnSite || !emp.checkInAt) {
    return res.status(400).json({ success: false, message: 'Nhân sự cần vào công trường trước khi tạm nghỉ' });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  if (emp.isOnBreak) {
    const breakStart = Date.parse(emp.breakStartedAt || '');
    const dateKey = localDateKey(now);
    const validTask = isValidShiftTask(db, emp, emp.activeTaskId, emp.shiftType, dateKey);
    if (emp.activeTaskId && !validTask.ok) {
      return res.status(400).json({ success: false, message: 'Chọn một task hợp lệ của ca hiện tại trước khi tiếp tục làm việc' });
    }
    if (Number.isFinite(breakStart)) {
      emp.totalBreakMs = (Number(emp.totalBreakMs) || 0) + Math.max(0, now.getTime() - breakStart);
    }
    emp.isOnBreak = false;
    emp.breakStartedAt = null;
    emp.workSessionStartedAt = emp.activeTaskId ? nowIso : null;
    if (emp.activeTaskId && !isSyntheticOvertimeTaskId(emp.activeTaskId)) updateEmployeeTaskSessions(db, emp, nowIso);
  } else {
    if (emp.activeTaskId && !isSyntheticOvertimeTaskId(emp.activeTaskId)) {
      const sessionStart = emp.workSessionStartedAt;
      if (sessionStart) updateEmployeeTaskSessions(db, emp, sessionStart, nowIso);
    }
    emp.workSessionStartedAt = null;
    emp.isOnBreak = true;
    emp.breakStartedAt = nowIso;
  }

  writeDb(db);
  return res.json({
    success: true,
    message: emp.isOnBreak ? `${emp.name} đang tạm nghỉ` : `${emp.name} đã tiếp tục làm việc`,
    data: emp
  });
}

export function setActiveTask(req, res) {
  const db = readDb();
  const emp = db.employees.find(employee => employee.id === req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự' });
  const { taskId } = req.body;
  const now = new Date();
  const dateKey = localDateKey(now);
  const shiftType = normalizeShiftType(req.body?.shiftType || emp.shiftType);
  if (emp.isOnSite && shiftType !== normalizeShiftType(emp.shiftType)) {
    return res.status(400).json({ success: false, message: 'Hãy kết thúc ca hiện tại trước khi chọn task của ca khác' });
  }
  const validTask = isValidShiftTask(db, emp, taskId, shiftType, dateKey);
  if (!validTask.ok) {
    return res.status(400).json({ success: false, message: validTask.message || 'Task không hợp lệ cho ca đang chọn' });
  }

  if (emp.isOnSite && emp.activeTaskId === taskId) {
    return res.json({ success: true, message: 'Task này đang được chọn', data: emp });
  }

  if (emp.activeTaskId !== taskId && emp.workSessionStartedAt && !isSyntheticOvertimeTaskId(emp.activeTaskId)) {
    updateEmployeeTaskSessions(db, emp, emp.workSessionStartedAt, now.toISOString());
  }
  emp.activeTaskId = taskId || null;
  emp.activeTaskTitle = validTask.synthetic ? validTask.title : (validTask.task?.title || null);
  emp.activeTaskShiftType = taskId ? shiftType : null;
  if (emp.isOnSite && !emp.isOnBreak) {
    emp.workSessionStartedAt = taskId ? now.toISOString() : null;
    if (taskId && !validTask.synthetic) updateEmployeeTaskSessions(db, emp, emp.workSessionStartedAt);
  } else {
    emp.workSessionStartedAt = null;
  }
  writeDb(db);
  return res.json({ success: true, message: taskId ? `Đã chọn công việc: ${emp.activeTaskTitle}` : 'Đã dừng tính giờ task đang chọn', data: emp });
}

// Xóa nhân sự
export function deleteEmployee(req, res) {
  const db = readDb();
  const { id } = req.params;

  const index = db.employees.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy nhân sự' });
  }

  const removed = db.employees.splice(index, 1);
  writeDb(db);

  return res.json({
    success: true,
    message: `Đã xóa nhân sự ${removed[0].name}`,
    data: removed[0]
  });
}
