import { readDb, writeDb } from '../models/db.js';

/**
 * Controller Quản Lý Tiến Độ Dự Án & Biểu Đồ Gantt Công Trường
 * Xử lý dữ liệu WBS (Phân rã công việc), mốc thời gian, liên kết phụ thuộc FS,
 * và thuật toán sắp xếp phân tầng WBS tự động (VD: A1.3 tự động nằm sau A1.2).
 * ĐỒNG BỘ 2 CHIỀU VỚI DANH SÁCH NHIỆM VỤ (TASKS) VÀ NHÂN SỰ (HR).
 */

// Thứ tự ưu tiên của các khối giai đoạn lớn theo mẫu tiến độ công trình
const MAJOR_PHASE_ORDER = ['A', 'L', 'B', 'C', 'D', 'E', 'F', 'G'];
const hasStoredAssignmentState = task => Boolean(task && (
  Array.isArray(task.assignees) ||
  Object.hasOwn(task, 'employeeId') ||
  Object.hasOwn(task, 'employeeName')
));

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
    createdAt: new Date().toISOString(),
    status: 'planning',
    progress: 0,
    contractWork: null
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

  const { startDate, endDate, contractWork } = req.body;
  const nextStartDate = startDate || project.startDate;
  const nextEndDate = endDate || project.endDate;
  const normalizedContractWork = contractWork === null || contractWork === '' ? null : Number(contractWork);
  if (contractWork !== undefined && normalizedContractWork !== null &&
    (!Number.isFinite(normalizedContractWork) || normalizedContractWork < 0)) {
    return res.status(400).json({ success: false, message: 'contractWork must be a non-negative number' });
  }
  if (!nextStartDate || !nextEndDate || !Number.isFinite(Date.parse(`${nextStartDate}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${nextEndDate}T00:00:00Z`)) || nextEndDate < nextStartDate) {
    return res.status(400).json({ success: false, message: 'Khoảng ngày bắt đầu và kết thúc của dự án không hợp lệ' });
  }

  project.startDate = nextStartDate;
  project.endDate = nextEndDate;
  if (contractWork !== undefined) project.contractWork = normalizedContractWork;
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
export function normalizeGanttGroupHierarchy(ganttItems, tasks = []) {
  let changed = false;
  const taskFor = item => tasks.find(task => task.ganttId === item.id);
  const projectIdFor = item => item.projectId || taskFor(item)?.projectId || 'proj-1';
  const groups = ganttItems.filter(item => item.isGroup);
  const phaseGroups = groups.filter(group => /^([A-Z])\.\s/i.test(group.title || ''));

  groups.forEach(group => {
    if (group.parentGroupId) return;
    const subgroupCode = String(group.title || '').match(/^([A-Z]\d+)\s*[. ]/i)?.[1]?.toUpperCase();
    if (!subgroupCode) return;
    const phaseLetter = subgroupCode[0];
    const phase = phaseGroups.find(candidate =>
      projectIdFor(candidate) === projectIdFor(group) &&
      String(candidate.title || '').trim().toUpperCase().startsWith(`${phaseLetter}.`)
    );
    if (phase) {
      group.parentGroupId = phase.id;
      changed = true;
    }
  });

  ganttItems.filter(item => !item.isGroup && !item.parentGroupId).forEach(item => {
    const code = String(item.code || '').trim().toUpperCase();
    if (!code) return;
    const matchingGroup = groups
      .filter(group => projectIdFor(group) === projectIdFor(item))
      .map(group => ({ group, prefix: String(group.title || '').match(/^([A-Z]\d+)\s*[. ]/i)?.[1]?.toUpperCase() }))
      .filter(candidate => candidate.prefix && (code === candidate.prefix || code.startsWith(`${candidate.prefix}.`)))
      .sort((left, right) => right.prefix.length - left.prefix.length)[0]?.group;
    if (matchingGroup) {
      item.parentGroupId = matchingGroup.id;
      const linkedTask = taskFor(item);
      if (linkedTask) linkedTask.parentGroupId = matchingGroup.id;
      changed = true;
    }
  });

  return changed;
}

export function getGanttItems(req, res) {
  const db = readDb();
  if (normalizeGanttGroupHierarchy(db.ganttItems || [], db.tasks || [])) writeDb(db);
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
      const taskHasAssignmentState = hasStoredAssignmentState(linkedTask);
      const legacyTaskAssignment = linkedTask && (linkedTask.employeeId || linkedTask.employeeName)
        ? [{
          employeeId: linkedTask.employeeId || '',
          employeeName: linkedTask.employeeName || '',
          startDate: linkedTask.startDate || item.startDate,
          endDate: linkedTask.endDate || item.endDate
        }]
        : [];
      const savedAssignees = taskHasAssignmentState
        ? taskAssignments.length ? taskAssignments : legacyTaskAssignment
        : ganttAssignments;
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
        : !taskHasAssignmentState && item.assignee
          ? [{
            employeeId: '',
            employeeName: item.assignee,
            startDate: item.startDate,
            endDate: item.endDate,
            estimatedHoursPerDay:             Number(linkedTask?.estimatedHoursPerDay) ||
              Number(item.estimatedHoursPerDay) ||
            Number((db.employees || []).find(employee => employee.id === linkedTask?.employeeId)?.standardHours) || 8
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
        contractWork: item.contractWork ?? linkedTask?.contractWork ?? null,
        ganttNote: item.ganttNote ?? linkedTask?.ganttNote ?? '',
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
  normalizeGanttGroupHierarchy(db.ganttItems || [], db.tasks || []);
  const { startDate, endDate, estimatedHoursPerDay, assignees, title, contractWork, ganttNote } = req.body;
  const item = (db.ganttItems || []).find(ganttItem => ganttItem.id === id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hạng mục Gantt' });
  }

  if (title !== undefined && startDate === undefined && endDate === undefined && contractWork === undefined && ganttNote === undefined) {
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!item.isGroup || !normalizedTitle || normalizedTitle.length > 120) {
      return res.status(400).json({ success: false, message: 'Tên mục công việc không hợp lệ' });
    }
    item.title = normalizedTitle;
    if (!writeDb(db)) {
      return res.status(500).json({ success: false, message: 'Không thể lưu tên mục công việc. Vui lòng thử lại.' });
    }
    return res.json({
      success: true,
      message: `Đã cập nhật mục công việc "${item.title}"`,
      data: item
    });
  }

  if (title !== undefined && (typeof title !== 'string' || !item.isGroup || !title.trim() || title.trim().length > 120)) {
    return res.status(400).json({ success: false, message: 'Invalid group title' });
  }

  const nextStartDate = startDate || item.startDate;
  const nextEndDate = endDate || item.endDate;
  const startTimestamp = Date.parse(`${nextStartDate}T00:00:00Z`);
  const endTimestamp = Date.parse(`${nextEndDate}T00:00:00Z`);
  const normalizedContractWork = contractWork === null || contractWork === '' ? null : Number(contractWork);
  if (contractWork !== undefined && normalizedContractWork !== null &&
    (!Number.isFinite(normalizedContractWork) || normalizedContractWork < 0)) {
    return res.status(400).json({ success: false, message: 'contractWork must be a non-negative number' });
  }
  if (ganttNote !== undefined && typeof ganttNote !== 'string') {
    return res.status(400).json({ success: false, message: 'ganttNote must be a string' });
  }
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp < startTimestamp) {
    return res.status(400).json({ success: false, message: 'Khoảng thời gian không hợp lệ' });
  }

  const itemProjectId = item.projectId || (db.tasks || []).find(task => task.ganttId === item.id)?.projectId || 'proj-1';
  const project = (db.projects || []).find(candidate => candidate.id === itemProjectId);
  if (item.isGroup && item.parentGroupId) {
    const parentGroup = (db.ganttItems || []).find(candidate => candidate.id === item.parentGroupId && candidate.isGroup);
    if (parentGroup && ((parentGroup.startDate && nextStartDate < parentGroup.startDate) || (parentGroup.endDate && nextEndDate > parentGroup.endDate))) {
      return res.status(400).json({ success: false, message: 'The group dates must remain inside its parent group range' });
    }
  }
  if (project && ((project.startDate && nextStartDate < project.startDate) || (project.endDate && nextEndDate > project.endDate))) {
    return res.status(400).json({ success: false, message: `Ngày task phải nằm trong thời gian dự án (${project.startDate} → ${project.endDate})` });
  }

  const linkedTask = (db.tasks || []).find(task => task.ganttId === id);
  const primaryEmployee = (db.employees || []).find(employee => employee.name === item.assignee);
  const taskHasAssignmentState = hasStoredAssignmentState(linkedTask);
  const legacyTaskAssignment = linkedTask?.employeeId || linkedTask?.employeeName
    ? [{
      employeeId: linkedTask.employeeId || '',
      employeeName: linkedTask.employeeName || '',
      startDate: item.startDate,
      endDate: item.endDate
    }]
    : [];
  const currentAssignees = taskHasAssignmentState
    ? (Array.isArray(linkedTask.assignees) && linkedTask.assignees.length ? linkedTask.assignees : legacyTaskAssignment)
    : Array.isArray(item.assignees) && item.assignees.length
      ? item.assignees
      : primaryEmployee || item.assignee
      ? [{
        employeeId: linkedTask?.employeeId || primaryEmployee?.id || '',
        employeeName: linkedTask?.employeeName || item.assignee || '',
        startDate: item.startDate,
        endDate: item.endDate
      }]
      : [];
  let nextAssignees = currentAssignees;
  if (assignees !== undefined) {
    if (!Array.isArray(assignees)) {
      return res.status(400).json({ success: false, message: 'Danh sách người đảm nhận không hợp lệ' });
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
  if (item.isGroup) {
    const oldStartTimestamp = Date.parse(`${item.startDate}T00:00:00Z`);
    const oldEndTimestamp = Date.parse(`${item.endDate}T00:00:00Z`);
    if (!Number.isFinite(oldStartTimestamp) || !Number.isFinite(oldEndTimestamp) || oldEndTimestamp < oldStartTimestamp) {
      return res.status(400).json({ success: false, message: 'Invalid current group date range' });
    }
    const oldGroupDays = Math.floor((oldEndTimestamp - oldStartTimestamp) / 86400000) + 1;
    const mapDate = dateValue => {
      const timestamp = Date.parse(`${dateValue}T00:00:00Z`);
      if (!Number.isFinite(timestamp)) return dateValue;
      const oldOffset = Math.max(0, Math.min(oldGroupDays - 1, Math.round((timestamp - oldStartTimestamp) / 86400000)));
      const newOffset = oldGroupDays <= 1 || calculatedDays <= 1
        ? 0
        : Math.round(oldOffset * (calculatedDays - 1) / (oldGroupDays - 1));
      const mapped = new Date(startTimestamp);
      mapped.setUTCDate(mapped.getUTCDate() + newOffset);
      return mapped.toISOString().slice(0, 10);
    };
    const descendantGroupIds = new Set([item.id]);
    let foundChildGroup = true;
    while (foundChildGroup) {
      foundChildGroup = false;
      (db.ganttItems || []).forEach(candidate => {
        if (candidate.isGroup && descendantGroupIds.has(candidate.parentGroupId) && !descendantGroupIds.has(candidate.id)) {
          descendantGroupIds.add(candidate.id);
          foundChildGroup = true;
        }
      });
    }
    const descendants = (db.ganttItems || []).filter(candidate => candidate.id !== item.id && descendantGroupIds.has(candidate.parentGroupId));
    for (const descendant of descendants) {
      const previousChildDays = Number(descendant.days) || Math.max(1, Math.floor((Date.parse(`${descendant.endDate}T00:00:00Z`) - Date.parse(`${descendant.startDate}T00:00:00Z`)) / 86400000) + 1);
      const childStart = mapDate(descendant.startDate);
      const mappedEnd = mapDate(descendant.endDate);
      const childEnd = mappedEnd < childStart ? childStart : mappedEnd;
      if (project && ((project.startDate && childStart < project.startDate) || (project.endDate && childEnd > project.endDate))) {
        return res.status(400).json({ success: false, message: 'The updated group range would move a child outside the project dates' });
      }
      const childDays = Math.floor((Date.parse(`${childEnd}T00:00:00Z`) - Date.parse(`${childStart}T00:00:00Z`)) / 86400000) + 1;
      descendant.startDate = childStart;
      descendant.endDate = childEnd;
      descendant.days = childDays;
      const childHoursPerDay = Number(descendant.estimatedHoursPerDay) || Number(descendant.estimatedHours) / previousChildDays || 8;
      descendant.estimatedHoursPerDay = childHoursPerDay;
      descendant.estimatedHours = Math.round(childHoursPerDay * childDays * 100) / 100;
      if (Array.isArray(descendant.assignees)) {
        descendant.assignees = descendant.assignees.map(assignment => {
          const mappedStart = mapDate(assignment.startDate || childStart);
          const mappedAssignmentEnd = mapDate(assignment.endDate || childEnd);
          const assignmentStart = mappedStart < childStart ? childStart : mappedStart > childEnd ? childEnd : mappedStart;
          const assignmentEnd = mappedAssignmentEnd < assignmentStart ? assignmentStart : mappedAssignmentEnd > childEnd ? childEnd : mappedAssignmentEnd;
          return { ...assignment, startDate: assignmentStart, endDate: assignmentEnd };
        });
      }
      const childTask = (db.tasks || []).find(task => task.ganttId === descendant.id);
      if (childTask) {
        childTask.startDate = childStart;
        childTask.endDate = childEnd;
        childTask.estimatedDays = childDays;
        if (Array.isArray(descendant.assignees)) childTask.assignees = descendant.assignees;
        const standardHours = Number((db.employees || []).find(employee => employee.id === childTask.employeeId)?.standardHours) || 8;
        const hoursPerDay = Number(descendant.estimatedHoursPerDay) || Number(childTask.estimatedHoursPerDay) || standardHours;
        childTask.estimatedHoursPerDay = hoursPerDay;
        childTask.estimatedHours = Math.round(hoursPerDay * childDays * 100) / 100;
      }
    }
    item.startDate = nextStartDate;
    item.endDate = nextEndDate;
    item.days = calculatedDays;
    if (title !== undefined) item.title = title.trim();
    if (contractWork !== undefined) item.contractWork = normalizedContractWork;
    if (!writeDb(db)) {
      return res.status(500).json({ success: false, message: 'Không thể lưu thời gian giai đoạn. Vui lòng thử lại.' });
    }
    return res.json({
      success: true,
      message: 'Đã cập nhật ngày bắt đầu, ngày kết thúc và tổng số ngày của giai đoạn',
      data: item
    });
  }

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
  if (contractWork !== undefined) item.contractWork = normalizedContractWork;
  if (ganttNote !== undefined) item.ganttNote = ganttNote;
  item.assignees = nextAssignees;
  if (assignees !== undefined) item.assignee = nextAssignees[0]?.employeeName || '';
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
  if (linkedTaskForAssignments) {
    linkedTaskForAssignments.assignees = item.assignees;
    if (contractWork !== undefined) linkedTaskForAssignments.contractWork = normalizedContractWork;
    if (ganttNote !== undefined) linkedTaskForAssignments.ganttNote = ganttNote;
    if (assignees !== undefined) {
      linkedTaskForAssignments.employeeId = item.assignees[0]?.employeeId || '';
      linkedTaskForAssignments.employeeName = item.assignees[0]?.employeeName || '';
    }
  }
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
  if (normalizeGanttGroupHierarchy(db.ganttItems || [], db.tasks || [])) writeDb(db);
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
    parentGroupId,
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
  const parentGroup = parentGroupId
    ? (db.ganttItems || []).find(item => item.id === parentGroupId && item.isGroup)
    : null;
  if (parentGroupId && (!parentGroup || parentGroup.projectId !== project.id)) {
    return res.status(400).json({ success: false, message: 'Mục công việc được chọn không hợp lệ hoặc không thuộc dự án này' });
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
  const assigneeName = String(assignee || '').trim().toLocaleLowerCase('vi');
  const assignedEmployee = assigneeName
    ? (db.employees || []).find(employee => employee.name.trim().toLocaleLowerCase('vi') === assigneeName)
    : null;
  if (assigneeName && !assignedEmployee) {
    return res.status(400).json({ success: false, message: 'Người đảm nhận đã chọn không tồn tại' });
  }
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
  const createdAt = new Date().toISOString();

  const belongsToProject = item => {
    const linkedTask = (db.tasks || []).find(task => task.ganttId === item.id);
    return !item.isGroup && (item.projectId || linkedTask?.projectId || 'proj-1') === project.id;
  };
  const belongsToProjectRow = item => {
    const linkedTask = (db.tasks || []).find(task => task.ganttId === item.id);
    return (item.projectId || linkedTask?.projectId || 'proj-1') === project.id;
  };
  const projectItems = db.ganttItems.filter(belongsToProject);
  const projectRows = db.ganttItems.filter(belongsToProjectRow);
  const explicitPredecessorIds = Array.isArray(dependencies)
    ? [...new Set(dependencies.filter(Boolean))]
    : [];
  const validPredecessors = explicitPredecessorIds.filter(id => projectItems.some(item => item.id === id));
  const requestedSuccessorId = successorId && projectItems.some(item => item.id === successorId)
    ? successorId
    : null;
  if (successorId && !requestedSuccessorId) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn một công việc sau thuộc cùng dự án' });
  }
  if (validPredecessors.length !== explicitPredecessorIds.length) {
    return res.status(400).json({ success: false, message: 'Công việc trước phải thuộc cùng dự án' });
  }
  if (requestedSuccessorId && validPredecessors.includes(requestedSuccessorId)) {
    return res.status(400).json({ success: false, message: 'Công việc trước và sau phải là hai công việc khác nhau' });
  }
  const dependsOn = (itemId, targetId, visited = new Set()) => {
    if (itemId === targetId) return true;
    if (visited.has(itemId)) return false;
    visited.add(itemId);
    const item = projectItems.find(candidate => candidate.id === itemId);
    return (Array.isArray(item?.dependencies) ? item.dependencies : [])
      .some(dependencyId => dependsOn(dependencyId, targetId, visited));
  };
  if (requestedSuccessorId && validPredecessors.some(predecessorId => dependsOn(predecessorId, requestedSuccessorId))) {
    return res.status(400).json({ success: false, message: 'Liên kết trước/sau này sẽ tạo vòng lặp trong tiến độ Gantt' });
  }

  // Chọn cả trước và sau để chèn vào giữa; chỉ chọn trước nghĩa là thêm nối tiếp ở cuối dự án.
  let insertIdx = -1;
  const selectedPredecessor = validPredecessors.length
    ? projectItems.find(item => item.id === validPredecessors[0])
    : null;
  const selectedSuccessor = requestedSuccessorId
    ? projectItems.find(item => item.id === requestedSuccessorId)
    : null;
  if (insertAfterId) {
    insertIdx = db.ganttItems.findIndex(item => item.id === insertAfterId);
  } else if (selectedPredecessor && requestedSuccessorId) {
    insertIdx = db.ganttItems.findIndex(item => item.id === selectedPredecessor.id);
  } else if (selectedPredecessor) {
    const lastProjectRow = projectRows.at(-1);
    insertIdx = lastProjectRow ? db.ganttItems.findIndex(item => item.id === lastProjectRow.id) : -1;
  } else if (selectedSuccessor) {
    insertIdx = db.ganttItems.findIndex(item => item.id === selectedSuccessor.id) - 1;
  } else {
    const precedingProjectItem = projectItems
      .filter(item => compareWbs(item.code, formattedCode) <= 0)
      .reduce((latest, item) => !latest || compareWbs(item.code, latest.code) > 0 ? item : latest, null);
    insertIdx = precedingProjectItem
      ? db.ganttItems.findIndex(item => item.id === precedingProjectItem.id)
      : parentGroup ? db.ganttItems.findIndex(item => item.id === parentGroup.id) : -1;
  }

  const previousInProject = !isGroup
    ? db.ganttItems
      .slice(0, insertIdx + 1)
      .filter(belongsToProject)
      .at(-1)
    : null;
  const downstreamProjectItems = db.ganttItems
    .slice(insertIdx + 1)
    .filter(belongsToProject);
  // === 2. TỰ ĐỘNG TẠO ĐƯỜNG MŨI TÊN LIÊN KẾT FS NỐI XUỐNG ===
  const defaultPredecessorIds = validPredecessors.length > 0
    ? validPredecessors
    : (previousInProject ? [previousInProject.id] : []);
  const successorToReconnect = requestedSuccessorId
    ? selectedSuccessor
    : validPredecessors.length > 0
      ? null
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
    createdAt,
    days: calculatedDays,
    estimatedHours: calculatedEstimatedHours,
    estimatedHoursPerDay: calculatedHoursPerDay,
    contractWork: null,
    ganttNote: '',
    assignee: assignedEmployee?.name || '',
    ...(parentGroup ? { parentGroupId: parentGroup.id } : {}),
    assignees: assignedEmployee ? [{
      employeeId: assignedEmployee.id,
      employeeName: assignedEmployee.name,
      startDate,
      endDate
    }] : [],
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

  if (successorToReconnect && !isGroup) {
    const predecessorIdsToReplace = new Set([
      ...defaultPredecessorIds,
      ...(previousInProject ? [previousInProject.id] : [])
    ]);
    const existingReplacedPredecessors = (Array.isArray(successorToReconnect.dependencies) ? successorToReconnect.dependencies : [])
      .filter(dependencyId => predecessorIdsToReplace.has(dependencyId));
    replaceGanttPredecessorLink(successorToReconnect, existingReplacedPredecessors, newItem.id);
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
      createdAt: newItem.createdAt,
      ...(parentGroup ? { parentGroupId: parentGroup.id } : {}),
      employeeId: emp?.id || '',
      employeeName: emp?.name || '',
      assignees: newItem.assignees,
      startDate: newItem.startDate,
      endDate: newItem.endDate,
      estimatedHours: newItem.estimatedHours,
      estimatedHoursPerDay: newItem.estimatedHoursPerDay,
      estimatedDays: newItem.days,
      contractWork: newItem.contractWork,
      ganttNote: newItem.ganttNote,
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
    message: isGroup
      ? `Đã tạo mục công việc "${newItem.title}"`
      : assignedEmployee
      ? `Đã thêm công việc "${newItem.title}" (${newItem.code}) vào tiến độ và đồng bộ sang danh sách nhiệm vụ`
      : `Đã tạo công việc "${newItem.title}" (${newItem.code}) chưa phân công; có thể giao người sau`,
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

  if (removedItem.isGroup) {
    (db.ganttItems || []).forEach(item => {
      if (item.parentGroupId === removedItem.id) delete item.parentGroupId;
    });
    (db.tasks || []).forEach(task => {
      if (task.parentGroupId === removedItem.id) delete task.parentGroupId;
    });
  }

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
