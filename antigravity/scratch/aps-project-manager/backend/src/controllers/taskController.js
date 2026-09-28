import { readDb, writeDb } from '../models/db.js';
import { compareWbs } from './projectController.js';

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
      tasks: db.tasks || [],
      overtimes: db.overtimes || []
    }
  });
}

// Tạo nhiệm vụ mới (Task Assignment) - ĐỒNG BỘ SANG GANTT CHART
export function createTask(req, res) {
  const db = readDb();
  const {
    projectId,
    projectName,
    phase,
    code,
    title,
    employeeId,
    startDate,
    endDate,
    estimatedDays,
    priority,
    notes
  } = req.body;

  if (!title || !employeeId) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên công việc và chọn người đảm nhận' });
  }

  // Tìm tên nhân sự
  const emp = db.employees.find(e => e.id === employeeId);
  const employeeName = emp ? emp.name : 'Chưa phân công';

  // Tìm tên dự án nếu có
  let projName = projectName;
  if (!projName && projectId) {
    const proj = db.projects.find(p => p.id === projectId);
    if (proj) projName = proj.name;
  }

  const days = Number(estimatedDays) || 1;
  const hours = days * 8; // 8 tiếng / ngày chuẩn

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
    ganttId: newGanttId,
    projectId: projectId || 'proj-1',
    projectName: projName || 'DỰ ÁN XÂY DỰNG TRUNG TÂM CÔNG NGHỆ APS VIỆT NAM',
    phase: phase || 'A. THIẾT KẾ XÂY DỰNG',
    code: wbsCode,
    title,
    employeeId,
    employeeName,
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || new Date().toISOString().split('T')[0],
    estimatedHours: hours,
    estimatedDays: days,
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
    if (db.ganttItems[i].code.startsWith(wbsCode.charAt(0))) {
      lastItemInPhase = db.ganttItems[i];
      break;
    }
  }

  const newGanttItem = {
    id: newGanttId,
    code: wbsCode,
    title,
    isGroup: false,
    color,
    unit,
    startDate: newTask.startDate,
    endDate: newTask.endDate,
    days: newTask.estimatedDays,
    assignee: employeeName,
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
    message: `Phân công nhiệm vụ thành công và đã đồng bộ sang biểu đồ Gantt (${wbsCode})`,
    data: newTask
  });
}

// Cập nhật trạng thái nhiệm vụ (đồng bộ sang Gantt)
export function updateTask(req, res) {
  const db = readDb();
  const { id } = req.params;
  const { status, progress, speedStatus, notes, startDate, endDate, estimatedDays } = req.body;

  const task = db.tasks.find(t => t.id === id);
  if (!task) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ' });
  }

  if (status !== undefined) task.status = status;
  if (progress !== undefined) task.progress = Number(progress);
  if (speedStatus !== undefined) task.speedStatus = speedStatus;
  if (notes !== undefined) task.notes = notes;
  if (startDate !== undefined) task.startDate = startDate;
  if (endDate !== undefined) task.endDate = endDate;
  if (estimatedDays !== undefined) {
    task.estimatedDays = Number(estimatedDays);
    task.estimatedHours = task.estimatedDays * 8;
  }

  if (task.progress === 100) {
    task.status = 'completed';
  }

  // Đồng bộ sang ganttItems tương ứng
  const gantt = (db.ganttItems || []).find(g => g.id === task.ganttId || g.title === task.title);
  if (gantt) {
    if (task.status !== undefined) gantt.status = task.status;
    if (task.progress !== undefined) gantt.progress = task.progress;
    if (task.speedStatus !== undefined) gantt.speed = task.speedStatus;
    if (startDate !== undefined) gantt.startDate = task.startDate;
    if (endDate !== undefined) gantt.endDate = task.endDate;
    if (estimatedDays !== undefined) gantt.days = task.estimatedDays;
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

  const removed = db.tasks.splice(index, 1);
  const removedTask = removed[0];

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
