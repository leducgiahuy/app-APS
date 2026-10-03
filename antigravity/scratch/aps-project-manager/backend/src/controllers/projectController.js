import { readDb, writeDb } from '../models/db.js';

/**
 * Controller Quản Lý Tiến Độ Dự Án & Biểu Đồ Gantt Công Trường
 * Xử lý dữ liệu WBS (Phân rã công việc), mốc thời gian, liên kết phụ thuộc FS,
 * và thuật toán sắp xếp phân tầng WBS tự động (VD: A1.3 tự động nằm sau A1.2).
 * ĐỒNG BỘ 2 CHIỀU VỚI DANH SÁCH NHIỆM VỤ (TASKS) VÀ NHÂN SỰ (HR).
 */

// Thứ tự ưu tiên của các khối giai đoạn lớn theo mẫu tiến độ công trình
const MAJOR_PHASE_ORDER = ['A', 'L', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Phân tích mã WBS (VD: 'A1.3' -> { majorIdx: 0, segments: [1, 3] })
 */
export function parseWbsCode(code) {
  if (!code) return { majorIdx: 999, segments: [] };
  const cleaned = String(code).trim();
  const match = cleaned.match(/^([A-Za-z]+)(.*)$/);
  if (!match) return { majorIdx: 999, segments: [cleaned] };

  const letter = match[1].toUpperCase();
  const rest = match[2];

  let majorIdx = MAJOR_PHASE_ORDER.indexOf(letter);
  if (majorIdx === -1) majorIdx = 100 + letter.charCodeAt(0);

  const segments = rest
    ? rest
        .split('.')
        .map(s => {
          const num = parseInt(s, 10);
          return isNaN(num) ? s : num;
        })
    : [];

  return { majorIdx, segments };
}

/**
 * So sánh 2 mã WBS để sắp xếp đúng thứ tự cây phân tầng
 * Ví dụ: A1 < A1.1 < A1.2 < A1.3 < A2 < A2.1 < L < B
 */
export function compareWbs(codeA, codeB) {
  const pa = parseWbsCode(codeA);
  const pb = parseWbsCode(codeB);

  // So sánh nhóm giai đoạn lớn trước (A trước L, L trước B, B trước C)
  if (pa.majorIdx !== pb.majorIdx) {
    return pa.majorIdx - pb.majorIdx;
  }

  // So sánh từng cấp số con bên trong
  const maxLen = Math.max(pa.segments.length, pb.segments.length);
  for (let i = 0; i < maxLen; i++) {
    const sa = pa.segments[i];
    const sb = pb.segments[i];

    if (sa === undefined) return -1; // Cấp cha ngắn hơn đứng trước (A1 đứng trước A1.1)
    if (sb === undefined) return 1;

    if (typeof sa === 'number' && typeof sb === 'number') {
      if (sa !== sb) return sa - sb;
    } else {
      const cmp = String(sa).localeCompare(String(sb));
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}

// Lấy danh sách dự án
export function getProjects(req, res) {
  const db = readDb();
  return res.json({
    success: true,
    data: db.projects || []
  });
}

// Tạo dự án mới
export function createProject(req, res) {
  const db = readDb();
  const { name, code, description, location, manager, startDate, endDate } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên dự án' });
  }
  if (!startDate || !endDate || !Number.isFinite(Date.parse(`${startDate}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${endDate}T00:00:00Z`)) || endDate < startDate) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn khoảng ngày bắt đầu và kết thúc hợp lệ cho dự án' });
  }

  const newProject = {
    id: `proj-${Date.now()}`,
    code: code || `APS-${new Date().getFullYear()}-${db.projects.length + 1}`,
    name,
    description: description || '',
    location: location || 'Hà Nội',
    manager: manager || 'Trần Quốc Hưng',
    startDate,
    endDate,
    status: 'planning',
    progress: 0
  };

  db.projects.push(newProject);

  writeDb(db);

  return res.status(201).json({
    success: true,
    message: `Đã tạo dự án "${newProject.name}" thành công. Dự án hiện chưa có công việc`,
    data: newProject
  });
}

export function updateProject(req, res) {
  const db = readDb();
  const project = (db.projects || []).find(item => item.id === req.params.id);
  if (!project) return res.status(404).json({ success: false, message: 'Không tìm thấy dự án' });

  const { startDate, endDate } = req.body;
  const nextStartDate = startDate || project.startDate;
  const nextEndDate = endDate || project.endDate;
  if (!nextStartDate || !nextEndDate || !Number.isFinite(Date.parse(`${nextStartDate}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${nextEndDate}T00:00:00Z`)) || nextEndDate < nextStartDate) {
    return res.status(400).json({ success: false, message: 'Khoảng ngày bắt đầu và kết thúc của dự án không hợp lệ' });
  }

  project.startDate = nextStartDate;
  project.endDate = nextEndDate;
  writeDb(db);
  return res.json({ success: true, data: project, message: 'Đã cập nhật thời gian dự án' });
}

// Xóa dự án và toàn bộ dữ liệu liên quan.
export function deleteProject(req, res) {
  const db = readDb();
  const { id } = req.params;
  const projectIndex = (db.projects || []).findIndex(project => project.id === id);

  if (projectIndex === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy dự án' });
  }

  const projectName = db.projects[projectIndex].name;
  const allTasks = db.tasks || [];
  const allGanttItems = db.ganttItems || [];
  const taskByGanttId = new Map(allTasks.filter(task => task.ganttId).map(task => [task.ganttId, task]));
  const taskBelongsToProject = task => task.projectId === id ||
    (!task.projectId && task.projectName === projectName);
  const ganttBelongsToProject = item => {
    const linkedTask = taskByGanttId.get(item.id);
    return item.projectId === id ||
      linkedTask?.projectId === id ||
      (!item.projectId && linkedTask?.projectName === projectName) ||
      (!item.projectId && !linkedTask && id === 'proj-1');
  };
  const projectGanttIds = new Set(allGanttItems.filter(ganttBelongsToProject).map(item => item.id));
  const deletedTaskIds = new Set(allTasks
    .filter(task => taskBelongsToProject(task) || projectGanttIds.has(task.ganttId))
    .map(task => task.id));

  db.ganttItems = allGanttItems.filter(item => !projectGanttIds.has(item.id));
  db.tasks = allTasks.filter(task => !deletedTaskIds.has(task.id));
  db.overtimes = (db.overtimes || []).filter(overtime => !deletedTaskIds.has(overtime.taskId));
  db.ganttItems.forEach(item => {
    if (Array.isArray(item.dependencies)) {
      item.dependencies = item.dependencies.filter(dependencyId => !projectGanttIds.has(dependencyId));
    }
  });

  const [removedProject] = db.projects.splice(projectIndex, 1);
  writeDb(db);

  return res.json({
    success: true,
    message: `Đã xóa dự án "${removedProject.name}" và toàn bộ dữ liệu liên quan`,
    data: removedProject,
    deletedGanttIds: [...projectGanttIds],
    deletedTaskIds: [...deletedTaskIds]
  });
}

// Lấy danh sách hạng mục cho biểu đồ Gantt
export function getGanttItems(req, res) {
  const db = readDb();
  const tasksByGanttId = new Map((db.tasks || []).filter(task => task.ganttId).map(task => [task.ganttId, task]));
  const approvedOvertimes = (db.overtimes || []).filter(overtime => !overtime.status || overtime.status === 'approved');
  const data = (db.ganttItems || []).map(item => {
      const linkedTasks = (db.tasks || []).filter(task => task.ganttId === item.id);
      const matchingTasks = (db.tasks || []).filter(task =>
        task.title?.trim().toLowerCase() === item.title?.trim().toLowerCase() &&
        (!task.projectId || !item.projectId || task.projectId === item.projectId)
      );
      const taskIds = new Set([...linkedTasks, ...matchingTasks].map(task => task.id));
      const linkedTask = linkedTasks[0] || matchingTasks[0];
      const itemOvertimes = approvedOvertimes.filter(overtime =>
        taskIds.has(overtime.taskId) ||
        (taskIds.size === 0 && overtime.taskTitle?.trim().toLowerCase() === item.title?.trim().toLowerCase())
      );
      const overtimeContributions = Object.values(itemOvertimes.reduce((contributions, overtime) => {
          const key = overtime.employeeId || overtime.employeeName || 'unknown';
          if (!contributions[key]) {
            contributions[key] = {
              employeeId: overtime.employeeId,
              employeeName: overtime.employeeName,
              hours: 0
            };
          }
          contributions[key].hours += Number(overtime.hours) || 0;
          return contributions;
        }, {})).map(contribution => ({
          ...contribution,
          hours: Math.round(contribution.hours * 10) / 10
        }));
      const taskAssignments = Array.isArray(linkedTask?.assignees) ? linkedTask.assignees : [];
      const ganttAssignments = Array.isArray(item.assignees) ? item.assignees : [];
      const savedAssignees = taskAssignments.length ? taskAssignments : ganttAssignments;
      const assignees = savedAssignees.length
        ? savedAssignees.map(assignment => {
          const ganttAssignment = ganttAssignments.find(candidate => candidate.employeeId === assignment.employeeId);
          const employee = (db.employees || []).find(candidate => candidate.id === assignment.employeeId);
          return {
            ...assignment,
            ...ganttAssignment,
            employeeName: assignment.employeeName ||
              ganttAssignment?.employeeName ||
              employee?.name ||
              (assignment.employeeId === linkedTask?.employeeId ? linkedTask.employeeName : '') ||
              item.assignee,
            estimatedHoursPerDay: Number(ganttAssignment?.estimatedHoursPerDay) ||
              Number(assignment.estimatedHoursPerDay) ||
              Number(linkedTask?.estimatedHoursPerDay) ||
              Number(item.estimatedHoursPerDay) ||
              Number(employee?.standardHours) || 8
          };
        })
        : linkedTask
          ? [{
            employeeId: linkedTask.employeeId || '',
            employeeName: linkedTask.employeeName || item.assignee || '',
            startDate: item.startDate,
            endDate: item.endDate,
            estimatedHoursPerDay: Number(linkedTask.estimatedHoursPerDay) ||
              Number(item.estimatedHoursPerDay) ||
              Number((db.employees || []).find(employee => employee.id === linkedTask.employeeId)?.standardHours) || 8
          }]
          : [];
      return {
        ...item,
        projectId: item.projectId || linkedTask?.projectId,
        startDate: linkedTask?.startDate || item.startDate,
        endDate: linkedTask?.endDate || item.endDate,
        days: Number(linkedTask?.estimatedDays) || item.days,
        assignees,
        estimatedHoursPerDay: Number(linkedTask?.estimatedHoursPerDay) ||
          Number(linkedTask?.estimatedHours) / (Number(linkedTask?.estimatedDays) || 1) ||
          Number(item.estimatedHoursPerDay) || 8,
        estimatedHours: Number(linkedTask?.estimatedHours ?? item.estimatedHours) || (Number(item.days) || 1) * 8,
        overtimeContributions,
        // Keep older saved OT totals visible when their request records are unavailable.
        overtimeHours: overtimeContributions.length
          ? overtimeContributions.reduce((sum, contribution) => sum + contribution.hours, 0)
          : Number(item.overtimeHours) || 0
      };
    });
  normalizeGanttDependencies(data, db.tasks || []);
  return res.json({
    success: true,
    data
  });
}

export function normalizeGanttDependencies(ganttItems, tasks = []) {
  const taskFor = ganttId => tasks.find(task => task.ganttId === ganttId);
  const projectIdFor = item => item.projectId || taskFor(item.id)?.projectId || 'proj-1';
  const itemsById = new Map(ganttItems.map(item => [item.id, item]));
  const reaches = (fromId, targetId, projectId, visited = new Set()) => {
    if (fromId === targetId) return true;
    if (visited.has(fromId)) return false;
    visited.add(fromId);
    const from = itemsById.get(fromId);
    if (!from || projectIdFor(from) !== projectId) return false;
    return (Array.isArray(from.dependencies) ? from.dependencies : []).some(dependencyId =>
      dependencyId === targetId || reaches(dependencyId, targetId, projectId, visited)
    );
  };

  ganttItems.forEach(item => {
    if (!Array.isArray(item.dependencies) || item.dependencies.length < 2) return;
    const projectId = projectIdFor(item);
    const dependencies = [...new Set(item.dependencies)];
    item.dependencies = dependencies.filter(dependencyId =>
      !dependencies.some(alternativeId =>
        alternativeId !== dependencyId && reaches(alternativeId, dependencyId, projectId)
      )
    );
  });
}

export function reconnectGanttDependencies(db, removedId) {
  const ganttItems = db.ganttItems || [];
  const removedItem = ganttItems.find(item => item.id === removedId);
  if (!removedItem) return;

  const taskFor = ganttId => (db.tasks || []).find(task => task.ganttId === ganttId);
  const projectIdFor = item => item.projectId || taskFor(item.id)?.projectId || 'proj-1';
  const projectId = projectIdFor(removedItem);
  const projectItems = ganttItems.filter(item => !item.isGroup && projectIdFor(item) === projectId);
  const removedIndex = projectItems.findIndex(item => item.id === removedId);
  const predecessorIds = (Array.isArray(removedItem.dependencies) ? removedItem.dependencies : [])
    .filter(dependencyId => {
      const predecessor = ganttItems.find(item => item.id === dependencyId);
      return predecessor && projectIdFor(predecessor) === projectId;
    });
  if (predecessorIds.length === 0 && removedIndex > 0) {
    predecessorIds.push(projectItems[removedIndex - 1].id);
  }
  const nextProjectItem = projectItems[removedIndex + 1];

  ganttItems.forEach(item => {
    if (item.id === removedId || projectIdFor(item) !== projectId) return;
    const isImmediateSuccessor = item.id === nextProjectItem?.id;
    const dependencies = Array.isArray(item.dependencies) ? item.dependencies : [];
    if (!isImmediateSuccessor && !dependencies.includes(removedId)) return;
    const remainingDependencies = dependencies.filter(dependencyId => dependencyId !== removedId);
    const connectedPredecessors = predecessorIds.filter(dependencyId => !remainingDependencies.includes(dependencyId));
    item.dependencies = [...remainingDependencies, ...connectedPredecessors];
  });
  normalizeGanttDependencies(ganttItems, db.tasks || []);
}

export function replaceGanttPredecessorLink(successor, predecessorIds, insertedId) {
  const dependencies = Array.isArray(successor.dependencies) ? successor.dependencies : [];
  const replacedIds = new Set(predecessorIds);
  successor.dependencies = [
    ...dependencies.filter(dependencyId => dependencyId !== insertedId && !replacedIds.has(dependencyId)),
    insertedId
  ];
}

// Cập nhật thời gian Gantt và đồng bộ sang task được giao.
export function updateGanttItem(req, res) {
  const db = readDb();
  const { id } = req.params;
  const { startDate, endDate, estimatedHoursPerDay, assignees } = req.body;
  const item = (db.ganttItems || []).find(ganttItem => ganttItem.id === id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hạng mục Gantt' });
  }

  const nextStartDate = startDate || item.startDate;
  const nextEndDate = endDate || item.endDate;
  const startTimestamp = Date.parse(`${nextStartDate}T00:00:00Z`);
  const endTimestamp = Date.parse(`${nextEndDate}T00:00:00Z`);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp < startTimestamp) {
    return res.status(400).json({ success: false, message: 'Khoảng thời gian không hợp lệ' });
  }

  const itemProjectId = item.projectId || (db.tasks || []).find(task => task.ganttId === item.id)?.projectId || 'proj-1';
  const project = (db.projects || []).find(candidate => candidate.id === itemProjectId);
  if (project && ((project.startDate && nextStartDate < project.startDate) || (project.endDate && nextEndDate > project.endDate))) {
    return res.status(400).json({ success: false, message: `Ngày task phải nằm trong thời gian dự án (${project.startDate} → ${project.endDate})` });
  }

  const linkedTask = (db.tasks || []).find(task => task.ganttId === id);
  const primaryEmployee = (db.employees || []).find(employee => employee.name === item.assignee);
  const currentAssignees = Array.isArray(item.assignees) && item.assignees.length
    ? item.assignees
    : [{
      employeeId: linkedTask?.employeeId || primaryEmployee?.id || '',
      employeeName: linkedTask?.employeeName || item.assignee || '',
      startDate: item.startDate,
      endDate: item.endDate
    }];
  let nextAssignees = currentAssignees;
  if (assignees !== undefined) {
    if (!Array.isArray(assignees) || assignees.length === 0) {
      return res.status(400).json({ success: false, message: 'Công việc cần có ít nhất một người đảm nhận' });
    }
    const seenEmployeeIds = new Set();
    nextAssignees = [];
    for (const assignment of assignees) {
      const employee = (db.employees || []).find(candidate => candidate.id === assignment?.employeeId);
      const isValidDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      };
      const validDates = isValidDate(assignment?.startDate) && isValidDate(assignment?.endDate);
      if (!employee || !validDates || assignment.startDate > assignment.endDate ||
        assignment.startDate < nextStartDate || assignment.endDate > nextEndDate ||
        seenEmployeeIds.has(assignment.employeeId)) {
        return res.status(400).json({ success: false, message: 'Vui lòng kiểm tra người đảm nhận và khoảng thời gian đã chọn' });
      }
      const assignmentHoursPerDay = Number(assignment.estimatedHoursPerDay);
      if (!Number.isFinite(assignmentHoursPerDay) || assignmentHoursPerDay <= 0) {
        return res.status(400).json({ success: false, message: 'Giờ làm dự kiến mỗi ngày phải lớn hơn 0 cho từng người đảm nhận' });
      }
      seenEmployeeIds.add(assignment.employeeId);
      nextAssignees.push({
        employeeId: employee.id,
        employeeName: employee.name,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        estimatedHoursPerDay: Math.round(assignmentHoursPerDay * 100) / 100
      });
    }
  }

  const calculatedDays = Math.floor((endTimestamp - startTimestamp) / 86400000) + 1;
  const requestedHoursPerDay = Number(estimatedHoursPerDay);
  if (estimatedHoursPerDay !== undefined && (!Number.isFinite(requestedHoursPerDay) || requestedHoursPerDay <= 0)) {
    return res.status(400).json({ success: false, message: 'Giờ làm dự kiến mỗi ngày phải lớn hơn 0' });
  }
  const previousEndDate = item.endDate;
  const previousStartDate = item.startDate;
  const previousEndTimestamp = Date.parse(`${previousEndDate}T00:00:00Z`);
  const nextEndTimestamp = Date.parse(`${nextEndDate}T00:00:00Z`);
  const shiftDays = Math.round((nextEndTimestamp - previousEndTimestamp) / 86400000);
  const startShiftDays = Math.round((Date.parse(`${nextStartDate}T00:00:00Z`) - Date.parse(`${previousStartDate}T00:00:00Z`)) / 86400000);
  const isPureDateShift = startShiftDays === shiftDays;
  const shiftDate = (dateValue, daysToShift) => {
    const shifted = new Date(`${dateValue}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + daysToShift);
    return shifted.toISOString().slice(0, 10);
  };
  if (assignees === undefined) {
    nextAssignees = currentAssignees.map(assignment => {
      if (assignment.startDate === previousStartDate && assignment.endDate === previousEndDate) {
        return { ...assignment, startDate: nextStartDate, endDate: nextEndDate };
      }
      let assignmentStart = isPureDateShift ? shiftDate(assignment.startDate || previousStartDate, startShiftDays) : assignment.startDate || previousStartDate;
      let assignmentEnd = isPureDateShift ? shiftDate(assignment.endDate || previousEndDate, startShiftDays) : assignment.endDate || previousEndDate;
      if (assignmentStart < nextStartDate) assignmentStart = nextStartDate;
      if (assignmentEnd > nextEndDate) assignmentEnd = nextEndDate;
      if (assignmentStart > assignmentEnd) {
        assignmentStart = (assignment.startDate || previousStartDate) < nextStartDate ? nextStartDate : nextEndDate;
        assignmentEnd = assignmentStart;
      }
      return { ...assignment, startDate: assignmentStart, endDate: assignmentEnd };
    });
  }
  item.startDate = nextStartDate;
  item.endDate = nextEndDate;
  item.days = calculatedDays;
  item.assignees = nextAssignees;
  if (estimatedHoursPerDay !== undefined) item.estimatedHoursPerDay = Math.round(requestedHoursPerDay * 100) / 100;
  if (Number(item.estimatedHoursPerDay) > 0) {
    item.estimatedHours = Math.round(Number(item.estimatedHoursPerDay) * calculatedDays * 100) / 100;
  }

  const linkedTaskFor = ganttId => (db.tasks || []).find(task => task.ganttId === ganttId);
  const projectIdOf = ganttItem => ganttItem.projectId || linkedTaskFor(ganttItem.id)?.projectId || 'proj-1';
  const sameProjectItems = (db.ganttItems || []).filter(ganttItem => projectIdOf(ganttItem) === projectIdOf(item));
  const successorIds = new Map();
  sameProjectItems.forEach((ganttItem, index) => {
    const dependencies = Array.isArray(ganttItem.dependencies) && ganttItem.dependencies.length
      ? ganttItem.dependencies
      : (!ganttItem.isGroup && index > 0 ? [sameProjectItems[index - 1].id] : []);
    dependencies.forEach(dependencyId => {
      if (!successorIds.has(dependencyId)) successorIds.set(dependencyId, []);
      successorIds.get(dependencyId).push(ganttItem.id);
    });
  });

  const shiftedIds = new Set();
  if (shiftDays !== 0) {
    const sourceIndex = sameProjectItems.findIndex(ganttItem => ganttItem.id === id);
    // Move every later row in the same project so the planned spacing between
    // consecutive tasks stays intact, including rows with an explicit FS link.
    sameProjectItems.slice(sourceIndex + 1).forEach(ganttItem => shiftedIds.add(ganttItem.id));
    const pending = [...(successorIds.get(id) || [])];
    while (pending.length) {
      const successorId = pending.shift();
      if (successorId === id || shiftedIds.has(successorId)) continue;
      shiftedIds.add(successorId);
      pending.push(...(successorIds.get(successorId) || []));
    }
    shiftedIds.forEach(successorId => {
      const successor = sameProjectItems.find(ganttItem => ganttItem.id === successorId);
      if (!successor) return;
      const successorPreviousStartDate = successor.startDate;
      const successorPreviousEndDate = successor.endDate;
      successor.startDate = shiftDate(successor.startDate, shiftDays);
      successor.endDate = shiftDate(successor.endDate, shiftDays);
      if (Array.isArray(successor.assignees)) {
        successor.assignees = successor.assignees.map(assignment => ({
          ...assignment,
          startDate: shiftDate(assignment.startDate || successorPreviousStartDate, shiftDays),
          endDate: shiftDate(assignment.endDate || successorPreviousEndDate, shiftDays)
        }));
      }
    });
  }

  (db.tasks || []).forEach(task => {
    const linkedById = task.ganttId === id;
    const linkedLegacyTask = !task.ganttId && task.title === item.title &&
      (!item.projectId || !task.projectId || task.projectId === item.projectId);
    const shiftedWithGantt = task.ganttId && shiftedIds.has(task.ganttId);
    if (linkedById || linkedLegacyTask || shiftedWithGantt) {
      task.startDate = linkedById || linkedLegacyTask ? nextStartDate : (db.ganttItems.find(ganttItem => ganttItem.id === task.ganttId)?.startDate || task.startDate);
      task.endDate = linkedById || linkedLegacyTask ? nextEndDate : (db.ganttItems.find(ganttItem => ganttItem.id === task.ganttId)?.endDate || task.endDate);
      if (shiftedWithGantt) {
        const shiftedItem = db.ganttItems.find(ganttItem => ganttItem.id === task.ganttId);
        if (Array.isArray(shiftedItem?.assignees)) task.assignees = shiftedItem.assignees;
      }
      const previousEstimatedDays = Number(task.estimatedDays) || 1;
      task.estimatedDays = linkedById || linkedLegacyTask ? calculatedDays : Math.floor((Date.parse(`${task.endDate}T00:00:00Z`) - Date.parse(`${task.startDate}T00:00:00Z`)) / 86400000) + 1;
      const standardHours = Number(db.employees.find(employee => employee.id === task.employeeId)?.standardHours) || 8;
      const defaultEstimatedHours = previousEstimatedDays * standardHours;
      if (Number(item.estimatedHoursPerDay) > 0) {
        task.estimatedHoursPerDay = item.estimatedHoursPerDay;
        task.estimatedHours = Math.round(Number(task.estimatedHoursPerDay) * task.estimatedDays * 100) / 100;
      } else if (!Number(task.estimatedHours) || Math.abs(Number(task.estimatedHours) - defaultEstimatedHours) < 0.01) {
        task.estimatedHours = task.estimatedDays * standardHours;
      }
      if (task.status === 'completed' && task.completedAt) {
        const completedAt = Date.parse(task.completedAt);
        const plannedHours = Number(task.estimatedHours) || task.estimatedDays * (Number(task.estimatedHoursPerDay) || standardHours);
        const effortDelay = Math.max(0, (Number(task.actualWorkHours) || 0) - plannedHours);
        const trackedWorkHours = Number(task.actualWorkHours) || 0;
        const [, year, month, day] = String(task.endDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
        const deadline = year ? new Date(Number(year), Number(month) - 1, Number(day) + 1).getTime() : NaN;
        const calendarDelay = Number.isFinite(completedAt) && Number.isFinite(deadline)
          ? Math.max(0, completedAt - deadline) / 3600000
          : 0;
        task.delayHours = Math.round(Math.max(effortDelay, calendarDelay) * 100) / 100;
        task.earlyHours = task.delayHours > 0 || trackedWorkHours <= 0
          ? 0
          : Math.round(Math.max(0, plannedHours - trackedWorkHours) * 100) / 100;
        task.speedStatus = task.delayHours > 0
          ? 'delayed'
          : task.earlyHours > 0 || String(task.completedAt).slice(0, 10) < task.endDate ? 'early' : 'on_time';
        const linkedItem = (db.ganttItems || []).find(ganttItem => ganttItem.id === task.ganttId);
        if (linkedItem) {
          linkedItem.delayHours = task.delayHours;
          linkedItem.earlyHours = task.earlyHours;
          linkedItem.speed = task.speedStatus;
          linkedItem.completedAt = task.completedAt;
          linkedItem.actualWorkHours = task.actualWorkHours;
        }
      }
    }
  });

  const linkedTaskForAssignments = (db.tasks || []).find(task => task.ganttId === id) ||
    (db.tasks || []).find(task => !task.ganttId && task.title === item.title &&
      (!item.projectId || !task.projectId || task.projectId === item.projectId));
  if (linkedTaskForAssignments) linkedTaskForAssignments.assignees = item.assignees;
  if (!writeDb(db)) {
    return res.status(500).json({ success: false, message: 'Không thể lưu thời gian task. Vui lòng thử lại.' });
  }
  return res.json({
    success: true,
    message: assignees === undefined
      ? 'Đã cập nhật thời gian và đồng bộ task được giao'
      : 'Đã cập nhật người đảm nhận và thời gian phân công',
    data: { item, task: linkedTaskForAssignments || null }
  });
}

// Thêm mới công việc vào biểu đồ Gantt dự án
// TỰ ĐỘNG CHÈN ĐÚNG VỊ TRÍ PHÂN TẦNG WBS (VD: A1.3 NẰM SAU A1.2) VÀ ĐỒNG BỘ SANG TASKS
export function createGanttItem(req, res) {
  const db = readDb();
  const {
    code,
    projectId,
    title,
    isGroup,
    unit,
    startDate,
    endDate,
    assignee,
    estimatedHours,
    estimatedHoursPerDay,
    notes,
    color,
    dependencies,
    speed,
    insertAfterId, // Tùy chọn: người dùng chỉ định chèn cụ thể sau công việc nào
    successorId
  } = req.body;

  if (!title || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tên công việc, ngày bắt đầu và ngày kết thúc' });
  }

  const project = (db.projects || []).find(item => item.id === projectId);
  if (!project) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn một dự án đang tồn tại' });
  }

  if ((project.startDate && startDate < project.startDate) || (project.endDate && endDate > project.endDate)) {
    return res.status(400).json({ success: false, message: `Ngày task phải nằm trong thời gian dự án (${project.startDate} → ${project.endDate})` });
  }

  const startTimestamp = Date.parse(`${startDate}T00:00:00Z`);
  const endTimestamp = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp < startTimestamp) {
    return res.status(400).json({ success: false, message: 'Khoảng thời gian không hợp lệ' });
  }
  const calculatedDays = Math.floor((endTimestamp - startTimestamp) / 86400000) + 1;
  const assigneeName = (assignee || 'Trần Quốc Hưng').trim().toLowerCase();
  const assignedEmployee = (db.employees || []).find(employee => employee.name.trim().toLowerCase() === assigneeName) || db.employees[0];
  const dailyHoursInput = estimatedHoursPerDay ?? estimatedHours;
  const requestedEstimatedHours = Number(dailyHoursInput);
  if (dailyHoursInput !== undefined && (!Number.isFinite(requestedEstimatedHours) || requestedEstimatedHours <= 0)) {
    return res.status(400).json({ success: false, message: 'Giờ làm dự kiến phải lớn hơn 0' });
  }
  const calculatedHoursPerDay = Number.isFinite(requestedEstimatedHours) && requestedEstimatedHours > 0
    ? requestedEstimatedHours
    : Number(assignedEmployee?.standardHours) || 8;
  const calculatedEstimatedHours = Math.round(calculatedHoursPerDay * calculatedDays * 100) / 100;

  const formattedCode = code ? String(code).trim() : `T${db.ganttItems.length + 1}`;
  const newGanttId = `G-${Date.now()}`;

  // === 1. TÍNH TOÁN VỊ TRÍ CHÈN WBS ===
  let insertIdx = -1;
  if (insertAfterId) {
    insertIdx = db.ganttItems.findIndex(g => g.id === insertAfterId);
  } else {
    for (let i = 0; i < db.ganttItems.length; i++) {
      if (compareWbs(db.ganttItems[i].code, formattedCode) < 0) {
        insertIdx = i;
      }
    }
  }

  const belongsToProject = item => {
    const linkedTask = (db.tasks || []).find(task => task.ganttId === item.id);
    return !item.isGroup && (item.projectId || linkedTask?.projectId || 'proj-1') === project.id;
  };
  const projectItems = db.ganttItems.filter(belongsToProject);
  const previousInProject = !isGroup
    ? db.ganttItems
      .slice(0, insertIdx + 1)
      .filter(belongsToProject)
      .at(-1)
    : null;
  const downstreamProjectItems = db.ganttItems
    .slice(insertIdx + 1)
    .filter(belongsToProject);
  const linkedSuccessor = successorId
    ? projectItems.find(item => item.id === successorId)
    : downstreamProjectItems[0];
  if (successorId && !linkedSuccessor) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn một công việc sau thuộc cùng dự án' });
  }

  // === 2. TỰ ĐỘNG TẠO ĐƯỜNG MŨI TÊN LIÊN KẾT FS NỐI XUỐNG ===
  const explicitPredecessorIds = Array.isArray(dependencies)
    ? [...new Set(dependencies.filter(Boolean))]
    : [];
  const defaultPredecessorIds = explicitPredecessorIds.length > 0
    ? explicitPredecessorIds
    : (previousInProject ? [previousInProject.id] : []);
  const requestedSuccessorId = successorId && projectItems.some(item => item.id === successorId)
    ? successorId
    : null;
  const selectedSuccessor = requestedSuccessorId
    ? projectItems.find(item => item.id === requestedSuccessorId)
    : downstreamProjectItems[0] || null;

  const newItem = {
    id: newGanttId,
    projectId: project.id,
    code: formattedCode,
    title,
    isGroup: Boolean(isGroup),
    color: color || '#0284c7',
    unit: unit || 'TK',
    startDate,
    endDate,
    days: calculatedDays,
    estimatedHours: calculatedEstimatedHours,
    estimatedHoursPerDay: calculatedHoursPerDay,
    assignee: assignee || 'Trần Quốc Hưng',
    assignees: [{
      employeeId: assignedEmployee?.id || '',
      employeeName: assignedEmployee?.name || assignee || 'Trần Quốc Hưng',
      startDate,
      endDate
    }],
    notes: notes || '',
    status: 'in_progress',
    speed: speed || 'on_time',
    progress: 0,
    dependencies: defaultPredecessorIds
  };

  // Chèn vào mảng ganttItems
  if (insertIdx === -1) {
    db.ganttItems.unshift(newItem);
  } else {
    db.ganttItems.splice(insertIdx + 1, 0, newItem);
  }

  if (selectedSuccessor && !isGroup) {
    const predecessorIdsToReplace = new Set([
      ...defaultPredecessorIds,
      ...(previousInProject ? [previousInProject.id] : [])
    ]);
    const existingReplacedPredecessors = (Array.isArray(selectedSuccessor.dependencies) ? selectedSuccessor.dependencies : [])
      .filter(dependencyId => predecessorIdsToReplace.has(dependencyId));
    replaceGanttPredecessorLink(selectedSuccessor, existingReplacedPredecessors, newItem.id);
  }

  // === 3. ĐỒNG BỘ SANG MỤC 1 (PHÂN CÔNG CÔNG VIỆC) & TRANG NHÂN SỰ ===
  if (!isGroup) {
    // Tìm nhân sự tương ứng
    const emp = assignedEmployee;

    // Xác định tên giai đoạn (Phase)
    let phaseName = 'A. THIẾT KẾ XÂY DỰNG';
    const upperCode = newItem.code.toUpperCase();
    if (upperCode.startsWith('B')) phaseName = 'B. XIN PHÉP / PHÁP LÝ';
    else if (upperCode.startsWith('C')) phaseName = 'C. MỜI THẦU THI CÔNG';
    else if (upperCode.startsWith('L')) phaseName = 'L. NGHỈ LỄ VIỆT NAM';

    const matchedTask = {
      id: `task-${Date.now()}`,
      ganttId: newItem.id,
      projectId: newItem.projectId,
      projectName: project.name,
      phase: phaseName,
      title: newItem.title,
      code: newItem.code,
      employeeId: emp ? emp.id : 'emp-1',
      employeeName: emp ? emp.name : newItem.assignee,
      assignees: newItem.assignees,
      startDate: newItem.startDate,
      endDate: newItem.endDate,
      estimatedHours: newItem.estimatedHours,
      estimatedHoursPerDay: newItem.estimatedHoursPerDay,
      estimatedDays: newItem.days,
      status: 'in_progress',
      speedStatus: newItem.speed || 'on_time',
      priority: 'high',
      progress: 0,
      notes: newItem.notes || ''
    };

    // Đẩy vào db.tasks
    if (!db.tasks) db.tasks = [];
    db.tasks.push(matchedTask);
  }

  normalizeGanttDependencies(db.ganttItems, db.tasks || []);
  writeDb(db);

  return res.status(201).json({
    success: true,
    message: `Đã thêm công việc "${newItem.title}" (${newItem.code}) vào đúng vị trí tiến độ và đồng bộ sang danh sách nhiệm vụ`,
    data: newItem
  });
}

// Di chuyển công việc lên / xuống (Reorder)
export function moveGanttItem(req, res) {
  const db = readDb();
  const { id } = req.params;
  const { direction } = req.body; // 'up' hoặc 'down'

  const index = db.ganttItems.findIndex(g => g.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= db.ganttItems.length) {
    return res.status(400).json({ success: false, message: 'Không thể di chuyển vượt quá biên' });
  }

  // Hoán đổi vị trí
  const temp = db.ganttItems[index];
  db.ganttItems[index] = db.ganttItems[targetIndex];
  db.ganttItems[targetIndex] = temp;

  writeDb(db);

  return res.json({
    success: true,
    message: `Đã di chuyển công việc ${direction === 'up' ? 'lên trên' : 'xuống dưới'}`,
    data: db.ganttItems
  });
}

// Xóa công việc khỏi biểu đồ Gantt (đồng bộ xóa trong db.tasks)
export function deleteGanttItem(req, res) {
  const db = readDb();
  const { id } = req.params;

  const index = db.ganttItems.findIndex(g => g.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });
  }

  reconnectGanttDependencies(db, id);
  const removed = db.ganttItems.splice(index, 1);
  const removedItem = removed[0];

  // Đồng bộ xóa task được giao, kể cả task dữ liệu cũ chưa có ganttId.
  const linkedTaskIds = new Set();
  if (db.tasks) {
    db.tasks = db.tasks.filter(task => {
      const matchesGanttId = task.ganttId === id;
      const matchesLegacyTask = !task.ganttId &&
        task.title === removedItem.title &&
        (!removedItem.projectId || !task.projectId || task.projectId === removedItem.projectId);

      if (matchesGanttId || matchesLegacyTask) {
        linkedTaskIds.add(task.id);
        return false;
      }
      return true;
    });
  }

  // Không để bản ghi tăng ca mồ côi tiếp tục xuất hiện trong thống kê nhân sự.
  if (db.overtimes) {
    db.overtimes = db.overtimes.filter(overtime => !linkedTaskIds.has(overtime.taskId));
  }

  normalizeGanttDependencies(db.ganttItems, db.tasks || []);
  writeDb(db);

  return res.json({
    success: true,
    message: `Đã xóa công việc "${removedItem.title}" khỏi tiến độ và đồng bộ nhiệm vụ`,
    data: removedItem,
    deletedTaskIds: [...linkedTaskIds]
  });
}
