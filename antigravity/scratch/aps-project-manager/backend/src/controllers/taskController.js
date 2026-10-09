import { readDb, writeDb } from '../models/db.js';
import { compareWbs, reconnectGanttDependencies } from './projectController.js';
import { normalizeAssignmentSchedules } from '../../../frontend/src/utils/assignmentCalendar.js';

const hasStoredAssignmentState = task => Boolean(task && (
  Array.isArray(task.assignees) ||
  Object.hasOwn(task, 'employeeId') ||
  Object.hasOwn(task, 'employeeName')
));

/**
 * Controller Quản Lý Phân Công & Tăng Ca
 * Xử lý giao việc cho nhân sự, kiểm soát giờ làm việc chuẩn (8h/ngày),
 * và đăng ký ca làm thêm giờ (Overtime / OT) cho các công việc gấp.
 * ĐỒNG BỘ 2 CHIỀU HOÀN TOÀN VỚI BIỂU ĐỒ GANTT TIẾN ĐỘ DỰ ÁN.
 */

// Lấy danh sách nhiệm vụ và tăng ca
export function getTasks(req, res) {
  const db = readDb();
  return res.json({
    success: true,
    data: {
      tasks: (db.tasks || []).map(task => {
        const ganttItem = (db.ganttItems || []).find(item => item.id === task.ganttId);
        const taskAssignments = Array.isArray(task.assignees) ? task.assignees : [];
        const ganttAssignments = Array.isArray(ganttItem?.assignees) ? ganttItem.assignees : [];
        const taskHasAssignmentState = hasStoredAssignmentState(task);
        const assignments = taskHasAssignmentState ? taskAssignments : ganttAssignments;
        if (!assignments.length) return task;
        return {
          ...task,
          assignees: assignments.map((assignment, assignmentIndex) => {
            const occurrence = assignments
              .slice(0, assignmentIndex + 1)
              .filter(candidate => candidate.employeeId === assignment.employeeId).length - 1;
            const ganttAssignment = ganttAssignments
              .filter(candidate => candidate.employeeId === assignment.employeeId)[occurrence];
            const employee = (db.employees || []).find(candidate => candidate.id === assignment.employeeId);
            const estimatedHoursPerDay = Number(ganttAssignment?.estimatedHoursPerDay) ||
              Number(assignment.estimatedHoursPerDay) ||
              Number(task.estimatedHoursPerDay) ||
              Number(employee?.standardHours) || 8;
            return {
              ...ganttAssignment,
              ...assignment,
              employeeName: assignment.employeeName || ganttAssignment?.employeeName || employee?.name || task.employeeName,
              estimatedHoursPerDay
            };
          })
        };
      }),
      overtimes: db.overtimes || []
    }
  });
}

// Tạo nhiệm vụ mới (Task Assignment) - ĐỒNG BỘ SANG GANTT CHART
export function createTask(req, res) {
  const db = readDb();
  const {
    projectId,
    phase,
    code,
    title,
    employeeId,
    startDate,
    endDate,
    estimatedHours,
    estimatedHoursPerDay,
    priority,
    notes
  } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên công việc' });
  }

  // Tìm tên nhân sự
  const emp = (db.employees || []).find(e => e.id === employeeId);
  if (employeeId && !emp) {
    return res.status(400).json({ success: false, message: 'Người đảm nhận đã chọn không tồn tại' });
  }
  const employeeName = emp?.name || '';

  // Treat the project ID as the source of truth so stale client state cannot
  // attach a new task to a deleted project or retain its old display name.
  const project = (db.projects || []).find(p => p.id === projectId);
  if (!project) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn một dự án đang tồn tại' });
  }

  const taskStartDate = startDate || new Date().toISOString().slice(0, 10);
  const taskEndDate = endDate || taskStartDate;
  const startTimestamp = Date.parse(`${taskStartDate}T00:00:00Z`);
  const endTimestamp = Date.parse(`${taskEndDate}T00:00:00Z`);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp < startTimestamp) {
    return res.status(400).json({ success: false, message: 'Khoảng thời gian công việc không hợp lệ' });
  }
  if ((project.startDate && taskStartDate < project.startDate) || (project.endDate && taskEndDate > project.endDate)) {
    return res.status(400).json({ success: false, message: `Ngày task phải nằm trong thời gian dự án (${project.startDate} → ${project.endDate})` });
  }
  const days = Math.floor((endTimestamp - startTimestamp) / 86400000) + 1;
  const standardHours = Number(emp?.standardHours) || 8;
  const dailyHoursInput = estimatedHoursPerDay ?? estimatedHours;
  const requestedHours = Number(dailyHoursInput);
  if (dailyHoursInput !== undefined && (!Number.isFinite(requestedHours) || requestedHours <= 0)) {
    return res.status(400).json({ success: false, message: 'Giờ làm dự kiến phải lớn hơn 0' });
  }
  const hoursPerDay = Number.isFinite(requestedHours) && requestedHours > 0 ? requestedHours : standardHours;
  const hours = Math.round(hoursPerDay * days * 100) / 100;

  // Sinh mã WBS tự động nếu chưa có
  let wbsCode = code ? String(code).trim() : '';
  if (!wbsCode) {
    let prefix = 'A';
    if (phase && phase.includes('B.')) prefix = 'B';
    else if (phase && phase.includes('C.')) prefix = 'C';
    else if (phase && phase.includes('L.')) prefix = 'L';
    
    // Đếm số công việc hiện có trong nhóm prefix
    const phaseItems = (db.ganttItems || []).filter(g => g.code.startsWith(prefix));
    wbsCode = `${prefix}1.${phaseItems.length + 1}`;
  }

  const newGanttId = `G-${Date.now()}`;

  const newTask = {
    id: `task-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ganttId: newGanttId,
    projectId: project.id,
    projectName: project.name,
    phase: phase || 'A. THIẾT KẾ XÂY DỰNG',
    code: wbsCode,
    title,
    employeeId: emp?.id || '',
    employeeName,
    startDate: taskStartDate,
    endDate: taskEndDate,
    estimatedHours: hours,
    estimatedHoursPerDay: hoursPerDay,
    estimatedDays: days,
    assignees: emp ? [{
      employeeId,
      employeeName,
      startDate: taskStartDate,
      endDate: taskEndDate
    }] : [],
    status: 'in_progress',
    speedStatus: 'on_time', // 'early', 'on_time', 'delayed'
    priority: priority || 'normal', // 'normal', 'high', 'urgent'
    progress: 0,
    notes: notes || ''
  };

  if (!db.tasks) db.tasks = [];
  db.tasks.push(newTask);

  // === ĐỒNG BỘ SANG TIẾN ĐỘ DỰ ÁN & BIỂU ĐỒ GANTT ===
  let color = '#0284c7';
  let unit = 'TK';
  if (phase && phase.includes('B.')) {
    color = '#ef4444';
    unit = 'PL';
  } else if (phase && phase.includes('C.')) {
    color = '#22c55e';
    unit = 'CDT';
  } else if (phase && phase.includes('L.')) {
    color = '#eab308';
    unit = 'VN';
  }

  // Tự động tìm công việc đứng trước để nối đường mũi tên FS
  let lastItemInPhase = null;
  for (let i = db.ganttItems.length - 1; i >= 0; i--) {
    const gantt = db.ganttItems[i];
    const linkedTask = (db.tasks || []).find(task => task.ganttId === gantt.id);
    const ganttProjectId = gantt.projectId || linkedTask?.projectId || 'proj-1';
    if (ganttProjectId === project.id && gantt.code.startsWith(wbsCode.charAt(0))) {
      lastItemInPhase = db.ganttItems[i];
      break;
    }
  }

  const newGanttItem = {
    id: newGanttId,
    createdAt: newTask.createdAt,
    projectId: project.id,
    code: wbsCode,
    title,
    isGroup: false,
    color,
    unit,
    startDate: newTask.startDate,
    endDate: newTask.endDate,
    days: newTask.estimatedDays,
    estimatedHours: newTask.estimatedHours,
    estimatedHoursPerDay: newTask.estimatedHoursPerDay,
    assignee: employeeName,
    assignees: newTask.assignees,
    notes: notes || '',
    status: 'in_progress',
    speed: 'on_time',
    progress: 0,
    dependencies: lastItemInPhase ? [lastItemInPhase.id] : []
  };

  // Chèn vào Gantt theo thuật toán WBS (đúng vị trí cây phân cấp)
  let insertIdx = -1;
  for (let i = 0; i < db.ganttItems.length; i++) {
    if (compareWbs(db.ganttItems[i].code, newGanttItem.code) < 0) {
      insertIdx = i;
    }
  }
  if (insertIdx === -1) {
    db.ganttItems.unshift(newGanttItem);
  } else {
    db.ganttItems.splice(insertIdx + 1, 0, newGanttItem);
  }

  writeDb(db);

  return res.status(201).json({
    success: true,
    message: emp
      ? `Phân công nhiệm vụ thành công và đã đồng bộ sang biểu đồ Gantt (${wbsCode})`
      : `Đã tạo nhiệm vụ chưa phân công và đồng bộ sang biểu đồ Gantt (${wbsCode})`,
    data: newTask
  });
}

// Cập nhật trạng thái nhiệm vụ (đồng bộ sang Gantt)
export function updateTask(req, res) {
  const db = readDb();
  const { id } = req.params;
  const { status, progress, actualWorkloadNotes, speedStatus, notes, startDate, endDate, estimatedDays, estimatedHours, estimatedHoursPerDay } = req.body;

  const task = db.tasks.find(t => t.id === id);
  if (!task) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ' });
  }

  const previousStartDate = task.startDate;
  const previousEndDate = task.endDate;
  if (status !== undefined) task.status = status;
  if (progress !== undefined) task.progress = Number(progress);
  if (actualWorkloadNotes !== undefined) task.actualWorkloadNotes = String(actualWorkloadNotes).slice(0, 5000);
  if (speedStatus !== undefined) task.speedStatus = speedStatus;
  if (notes !== undefined) task.notes = notes;
  if (estimatedHours !== undefined) {
    const hours = Number(estimatedHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ success: false, message: 'Giờ làm dự kiến phải lớn hơn 0' });
    }
    task.estimatedHours = Math.round(hours * 100) / 100;
    if (estimatedHoursPerDay === undefined) delete task.estimatedHoursPerDay;
  }
  if (estimatedHoursPerDay !== undefined) {
    const hoursPerDay = Number(estimatedHoursPerDay);
    if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) {
      return res.status(400).json({ success: false, message: 'Giờ làm dự kiến mỗi ngày phải lớn hơn 0' });
    }
    task.estimatedHoursPerDay = Math.round(hoursPerDay * 100) / 100;
  }
  if (startDate !== undefined) task.startDate = startDate;
  if (endDate !== undefined) task.endDate = endDate;
  if (startDate !== undefined || endDate !== undefined) {
    const startTimestamp = Date.parse(`${task.startDate}T00:00:00Z`);
    const endTimestamp = Date.parse(`${task.endDate}T00:00:00Z`);
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp < startTimestamp) {
      return res.status(400).json({ success: false, message: 'Khoảng thời gian công việc không hợp lệ' });
    }
    task.estimatedDays = Math.floor((endTimestamp - startTimestamp) / 86400000) + 1;
  } else if (estimatedDays !== undefined) {
    task.estimatedDays = Number(estimatedDays);
    const standardHours = Number(db.employees.find(employee => employee.id === task.employeeId)?.standardHours) || 8;
    if (estimatedHoursPerDay !== undefined) task.estimatedHours = task.estimatedHoursPerDay * task.estimatedDays;
    else if (estimatedHours === undefined) task.estimatedHours = task.estimatedDays * standardHours;
  }
  if (estimatedHoursPerDay !== undefined && estimatedDays === undefined) {
    task.estimatedHours = Math.round(task.estimatedHoursPerDay * (Number(task.estimatedDays) || 1) * 100) / 100;
  }
  if ((startDate !== undefined || endDate !== undefined) && estimatedHoursPerDay !== undefined) {
    task.estimatedHours = Math.round(task.estimatedHoursPerDay * task.estimatedDays * 100) / 100;
  } else if ((startDate !== undefined || endDate !== undefined) && Number(task.estimatedHoursPerDay) > 0 && estimatedHours === undefined) {
    task.estimatedHours = Math.round(task.estimatedHoursPerDay * task.estimatedDays * 100) / 100;
  }

  if (Array.isArray(task.assignees) && task.assignees.length) {
    const datesChanged = task.startDate !== previousStartDate || task.endDate !== previousEndDate;
    if (datesChanged) {
      const previousDatesWereWholeTask = task.assignees.every(assignment =>
        assignment.startDate === previousStartDate && assignment.endDate === previousEndDate
      );
      task.assignees = task.assignees.map(assignment => {
        let assignmentStart = previousDatesWereWholeTask
          ? task.startDate
          : assignment.startDate < task.startDate ? task.startDate : assignment.startDate;
        let assignmentEnd = previousDatesWereWholeTask
          ? task.endDate
          : assignment.endDate > task.endDate ? task.endDate : assignment.endDate;
        if (assignmentStart > assignmentEnd) {
          assignmentStart = assignment.startDate < task.startDate ? task.startDate : task.endDate;
          assignmentEnd = assignmentStart;
        }
        return { ...assignment, startDate: assignmentStart, endDate: assignmentEnd };
      });
    }
  } else {
    task.assignees = [{
      employeeId: task.employeeId || '',
      employeeName: task.employeeName || '',
      startDate: task.startDate,
      endDate: task.endDate
    }];
  }

  normalizeAssignmentSchedules({ tasks: [task] });
  if (task.progress === 100) {
    task.status = 'completed';
  }

  const completingTask = task.status === 'completed' && !task.completedAt;
  const completedAt = completingTask ? new Date() : (task.completedAt ? new Date(task.completedAt) : null);
  let completedSessionStartAt = null;
  if (task.status === 'completed' && task.workSessionStartedAt) {
    completedSessionStartAt = task.workSessionStartedAt;
    const elapsed = Math.max(0, (Date.now() - Date.parse(completedSessionStartAt)) / 3600000);
    task.actualWorkHours = Math.round(((Number(task.actualWorkHours) || 0) + elapsed) * 100) / 100;
    // Keep the final active segment attributed to the employee before clearing it.
    if (elapsed > 0) {
      task.actualWorkEntries ||= [];
      const sessionEmployee = (db.employees || []).find(employee => employee.activeTaskId === task.id);
      task.actualWorkEntries.push({
        employeeId: sessionEmployee?.id || task.employeeId,
        employeeName: sessionEmployee?.name || task.employeeName,
        startAt: completedSessionStartAt,
        endAt: new Date().toISOString(),
        hours: Math.round(elapsed * 100) / 100,
        shiftType: sessionEmployee?.shiftType === 'overtime' ? 'overtime' : 'regular'
      });
    }
    task.workSessionStartedAt = null;
    const activeEmployee = (db.employees || []).find(employee => employee.activeTaskId === task.id);
    if (activeEmployee) {
      activeEmployee.activeTaskId = null;
      activeEmployee.activeTaskTitle = null;
      activeEmployee.workSessionStartedAt = null;
    }
  }

  if (task.status === 'completed' && completedAt) {
    task.completedAt = completedAt.toISOString();
    const standardHours = Number(db.employees.find(employee => employee.id === task.employeeId)?.standardHours) || 8;
    const plannedHours = Number(task.estimatedHours) > 0
      ? Number(task.estimatedHours)
      : (Number(task.estimatedDays) || 1) * (Number(task.estimatedHoursPerDay) || standardHours);
    const effortDelay = Math.max(0, (Number(task.actualWorkHours) || 0) - plannedHours);
    const endDateMatch = String(task.endDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const deadline = endDateMatch
      ? new Date(Number(endDateMatch[1]), Number(endDateMatch[2]) - 1, Number(endDateMatch[3]) + 1).getTime()
      : NaN;
    const calendarDelay = Number.isFinite(deadline)
      ? Math.max(0, completedAt.getTime() - deadline) / 3600000
      : 0;
    task.delayHours = Math.round(Math.max(effortDelay, calendarDelay) * 100) / 100;
    const trackedWorkHours = Number(task.actualWorkHours) || 0;
    task.earlyHours = task.delayHours > 0 || trackedWorkHours <= 0
      ? 0
      : Math.round(Math.max(0, plannedHours - trackedWorkHours) * 100) / 100;

    if (completingTask || speedStatus !== undefined) {
      const completionDate = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}-${String(completedAt.getDate()).padStart(2, '0')}`;
      task.speedStatus = task.delayHours > 0
        ? 'delayed'
        : task.earlyHours > 0 || completionDate < task.endDate ? 'early' : completionDate > task.endDate ? 'delayed' : (speedStatus || 'on_time');
    }
  }

  // Đồng bộ sang ganttItems tương ứng
  const gantt = (db.ganttItems || []).find(g => g.id === task.ganttId || g.title === task.title);
  if (gantt) {
    if (task.status !== undefined) gantt.status = task.status;
    if (task.progress !== undefined) gantt.progress = task.progress;
    if (task.speedStatus !== undefined) gantt.speed = task.speedStatus;
    if (task.completedAt) gantt.completedAt = task.completedAt;
    if (task.delayHours !== undefined) gantt.delayHours = task.delayHours;
    if (task.earlyHours !== undefined) gantt.earlyHours = task.earlyHours;
    if (task.actualWorkHours !== undefined) gantt.actualWorkHours = task.actualWorkHours;
    if (startDate !== undefined) gantt.startDate = task.startDate;
    if (endDate !== undefined) gantt.endDate = task.endDate;
    if (estimatedDays !== undefined) gantt.days = task.estimatedDays;
    if (estimatedHours !== undefined) gantt.estimatedHours = task.estimatedHours;
    if (estimatedHours !== undefined || estimatedHoursPerDay !== undefined || startDate !== undefined || endDate !== undefined) {
      gantt.estimatedHoursPerDay = Math.round((Number(task.estimatedHoursPerDay) || Number(task.estimatedHours) / (Number(task.estimatedDays) || 1)) * 100) / 100;
    }
    if (startDate !== undefined || endDate !== undefined) gantt.days = task.estimatedDays;
    gantt.assignees = task.assignees;
    if (completedSessionStartAt) {
      const elapsed = Math.max(0, (Date.now() - Date.parse(completedSessionStartAt)) / 3600000);
      gantt.actualWorkHours = Math.round(((Number(gantt.actualWorkHours) || 0) + elapsed) * 100) / 100;
      gantt.workSessionStartedAt = null;
    }
  }

  writeDb(db);

  return res.json({
    success: true,
    message: 'Cập nhật nhiệm vụ thành công và đã đồng bộ',
    data: task
  });
}

// Xóa nhiệm vụ (đồng bộ xóa trong Gantt)
export function deleteTask(req, res) {
  const db = readDb();
  const { id } = req.params;

  const index = db.tasks.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ' });
  }

  const removedTask = db.tasks[index];
  const ganttIdsToRemove = (db.ganttItems || []).filter(g => {
    const matchesGanttId = removedTask.ganttId && g.id === removedTask.ganttId;
    const matchesLegacyTask = !removedTask.ganttId &&
      g.title === removedTask.title &&
      (!removedTask.projectId || !g.projectId || g.projectId === removedTask.projectId);
    return matchesGanttId || matchesLegacyTask;
  }).map(item => item.id);
  ganttIdsToRemove.forEach(ganttId => reconnectGanttDependencies(db, ganttId));
  db.tasks.splice(index, 1);

  // Đồng bộ xóa trong ganttItems
  if (db.ganttItems) {
    db.ganttItems = db.ganttItems.filter(g => {
      const matchesGanttId = removedTask.ganttId && g.id === removedTask.ganttId;
      const matchesLegacyTask = !removedTask.ganttId &&
        g.title === removedTask.title &&
        (!removedTask.projectId || !g.projectId || g.projectId === removedTask.projectId);
      return !matchesGanttId && !matchesLegacyTask;
    });
  }

  if (db.overtimes) {
    db.overtimes = db.overtimes.filter(overtime => overtime.taskId !== id);
  }

  writeDb(db);

  return res.json({
    success: true,
    message: 'Đã xóa nhiệm vụ và đồng bộ gỡ khỏi biểu đồ Gantt',
    data: removedTask
  });
}

// Đăng ký ca làm việc tăng ca (Overtime / OT)
export function createOvertime(req, res) {
  const db = readDb();
  const { taskId, employeeId, hours, date, reason } = req.body;

  if (!employeeId || !hours) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn nhân viên và số giờ tăng ca' });
  }

  const emp = db.employees.find(e => e.id === employeeId);
  const task = taskId ? db.tasks.find(t => t.id === taskId) : null;

  const newOt = {
    id: `ot-${Date.now()}`,
    taskId: taskId || 'general',
    taskTitle: task ? task.title : 'Tăng ca đột xuất tại công trường',
    employeeId,
    employeeName: emp ? emp.name : 'Chưa xác định',
    hours: Number(hours),
    date: date || new Date().toISOString().split('T')[0],
    reason: reason || 'Hoàn thành công việc khẩn cấp',
    approvedBy: 'Trần Quốc Hưng (Chỉ huy trưởng)',
    status: 'approved'
  };

  db.overtimes.push(newOt);

  // Đồng bộ sang Gantt item tương ứng để hiện tag [+x h OT]
  if (taskId || task) {
    const gantt = (db.ganttItems || []).find(g => g.id === task?.ganttId || g.title === (task ? task.title : ''));
    if (gantt) {
      gantt.overtimeHours = (gantt.overtimeHours || 0) + Number(hours);
    }
  }

  writeDb(db);

  return res.status(201).json({
    success: true,
    message: `Đã đăng ký ${hours}h tăng ca cho ${newOt.employeeName}`,
    data: newOt
  });
}

// Xóa phiếu tăng ca và hoàn lại số giờ OT trên task/Gantt liên quan.
export function deleteOvertime(req, res) {
  const db = readDb();
  const { id } = req.params;
  const index = (db.overtimes || []).findIndex(overtime => overtime.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu tăng ca' });
  }

  const [removedOvertime] = db.overtimes.splice(index, 1);
  const task = (db.tasks || []).find(item => item.id === removedOvertime.taskId);
  const gantt = task
    ? (db.ganttItems || []).find(item => item.id === task.ganttId || item.title === task.title)
    : null;

  if (gantt) {
    gantt.overtimeHours = Math.max(0, (Number(gantt.overtimeHours) || 0) - (Number(removedOvertime.hours) || 0));
    if (gantt.overtimeHours === 0) delete gantt.overtimeHours;
  }

  writeDb(db);
  return res.json({
    success: true,
    message: `Đã xóa phiếu tăng ca của ${removedOvertime.employeeName}`,
    data: removedOvertime
  });
}
