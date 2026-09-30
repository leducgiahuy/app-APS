import { readDb, writeDb } from '../models/db.js';

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

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isAssignedToEmployee(item, emp) {
  return item.employeeId === emp.id ||
    (item.employeeName || item.assignee || '').trim().toLowerCase() === (emp.name || '').trim().toLowerCase();
}

function activeOnDate(item, dateKey) {
  return (!item.startDate || item.startDate <= dateKey) && (!item.endDate || item.endDate >= dateKey);
}

function updateEmployeeTaskSessions(db, emp, startAt, endAt = null) {
  const dateKey = localDateKey(new Date(startAt));
  const timestamp = Date.parse(startAt);
  const elapsedHours = endAt ? Math.max(0, (Date.parse(endAt) - timestamp) / 3600000) : 0;
  const updateItem = item => {
    if (!isAssignedToEmployee(item, emp) || item.isGroup || item.status === 'completed' || !activeOnDate(item, dateKey)) return;
    item.attendanceTracked = true;
    item.actualWorkStartedAt ||= startAt;
    if (endAt) {
      item.actualWorkHours = Math.round(((Number(item.actualWorkHours) || 0) + elapsedHours) * 100) / 100;
      item.workSessionStartedAt = null;
    } else {
      item.workSessionStartedAt = startAt;
    }
  };

  (db.tasks || []).forEach(updateItem);
  (db.ganttItems || []).forEach(updateItem);
}

function approvedOvertimeHours(db, emp, dateKey) {
  return (db.overtimes || []).reduce((total, overtime) => {
    const belongsToEmployee = overtime.employeeId === emp.id ||
      (overtime.employeeName || '').trim().toLowerCase() === (emp.name || '').trim().toLowerCase();
    if (!belongsToEmployee || overtime.date !== dateKey || (overtime.status && overtime.status !== 'approved')) return total;
    return total + (Number(overtime.hours) || 0);
  }, 0);
}

function needsTaskSessionSync(db, emp) {
  if (!emp.checkInAt || emp.isOnBreak) return false;
  const dateKey = localDateKey(new Date(emp.checkInAt));
  const expectedSessionStart = emp.workSessionStartedAt || emp.checkInAt;
  return [...(db.tasks || []), ...(db.ganttItems || [])].some(item =>
    !item.isGroup && item.status !== 'completed' && isAssignedToEmployee(item, emp) && activeOnDate(item, dateKey) &&
    (!item.attendanceTracked || item.workSessionStartedAt !== expectedSessionStart)
  );
}

function closeExpiredShifts(db, now = new Date()) {
  const autoCheckedOutIds = [];
  const taskSessionsSyncedIds = [];
  let changed = false;

  (db.employees || []).forEach(emp => {
    if (migrateLegacyCheckIn(emp, now)) changed = true;
    if (!emp.isOnSite || !emp.checkInAt) return;

    // Đồng bộ cả những ca đã vào trước khi tính năng theo dõi giờ công được cập nhật.
    if (needsTaskSessionSync(db, emp)) {
      updateEmployeeTaskSessions(db, emp, emp.checkInAt);
      emp.workSessionStartedAt ||= emp.checkInAt;
      taskSessionsSyncedIds.push(emp.id);
      changed = true;
    }

    const checkInTimestamp = Date.parse(emp.checkInAt);
    if (!Number.isFinite(checkInTimestamp)) return;
    const checkInDate = new Date(checkInTimestamp);
    const standardHours = Number(emp.standardHours) > 0 ? Number(emp.standardHours) : 8;
    const overtimeHours = approvedOvertimeHours(db, emp, localDateKey(checkInDate));
    const requiredWorkMs = (standardHours + overtimeHours) * 60 * 60 * 1000;
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
    emp.lastShiftCheckInAt = emp.checkInAt;
    emp.lastShiftCheckOutAt = shiftEnd.toISOString();
    emp.lastShiftCheckOutTime = shiftEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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
  emp.isOnSite = !emp.isOnSite;
  if (emp.isOnSite) {
    emp.checkInAt = now.toISOString();
    emp.checkInTime = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    emp.isOnBreak = false;
    emp.breakStartedAt = null;
    emp.totalBreakMs = 0;
    emp.workSessionStartedAt = emp.checkInAt;
    updateEmployeeTaskSessions(db, emp, emp.checkInAt);
  } else {
    emp.lastShiftCheckInAt = emp.checkInAt || null;
    emp.lastShiftCheckOutAt = now.toISOString();
    emp.lastShiftCheckOutTime = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (emp.workSessionStartedAt) updateEmployeeTaskSessions(db, emp, emp.workSessionStartedAt, now.toISOString());
    emp.checkInAt = null;
    emp.checkInTime = null;
    emp.isOnBreak = false;
    emp.breakStartedAt = null;
    emp.totalBreakMs = 0;
    emp.workSessionStartedAt = null;
  }

  writeDb(db);

  return res.json({
    success: true,
    message: `Đã cập nhật trạng thái của ${emp.name}: ${emp.isOnSite ? 'Có mặt tại công trường' : 'Đã rời công trường'}`,
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
    if (Number.isFinite(breakStart)) {
      emp.totalBreakMs = (Number(emp.totalBreakMs) || 0) + Math.max(0, now.getTime() - breakStart);
    }
    emp.isOnBreak = false;
    emp.breakStartedAt = null;
    emp.workSessionStartedAt = nowIso;
    updateEmployeeTaskSessions(db, emp, nowIso);
  } else {
    const sessionStart = emp.workSessionStartedAt || emp.checkInAt;
    updateEmployeeTaskSessions(db, emp, sessionStart, nowIso);
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
