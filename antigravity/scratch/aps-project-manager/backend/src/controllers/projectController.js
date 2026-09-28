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

  const newProject = {
    id: `proj-${Date.now()}`,
    code: code || `APS-${new Date().getFullYear()}-${db.projects.length + 1}`,
    name,
    description: description || '',
    location: location || 'Hà Nội',
    manager: manager || 'Trần Quốc Hưng',
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || '2027-12-31',
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

// Xóa dự án và toàn bộ dữ liệu liên quan.
export function deleteProject(req, res) {
  const db = readDb();
  const { id } = req.params;
  const projectIndex = (db.projects || []).findIndex(project => project.id === id);

  if (projectIndex === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy dự án' });
  }

  const matchesProject = item => item.projectId === id || (!item.projectId && id === 'proj-1');
  const projectGanttIds = new Set((db.ganttItems || []).filter(matchesProject).map(item => item.id));
  const deletedTaskIds = new Set();

  db.ganttItems = (db.ganttItems || []).filter(item => !matchesProject(item));
  db.tasks = (db.tasks || []).filter(task => {
    const belongsToProject = matchesProject(task) || projectGanttIds.has(task.ganttId);
    if (belongsToProject) deletedTaskIds.add(task.id);
    return !belongsToProject;
  });
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
    data: removedProject
  });
}

// Lấy danh sách hạng mục cho biểu đồ Gantt
export function getGanttItems(req, res) {
  const db = readDb();
  return res.json({
    success: true,
    data: db.ganttItems || []
  });
}

// Cập nhật thời gian Gantt và đồng bộ sang task được giao.
export function updateGanttItem(req, res) {
  const db = readDb();
  const { id } = req.params;
  const { startDate, endDate, days } = req.body;
  const item = (db.ganttItems || []).find(ganttItem => ganttItem.id === id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy hạng mục Gantt' });
  }

  const nextStartDate = startDate || item.startDate;
  const nextEndDate = endDate || item.endDate;
  const start = new Date(nextStartDate);
  const end = new Date(nextEndDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return res.status(400).json({ success: false, message: 'Khoảng thời gian không hợp lệ' });
  }

  const calculatedDays = days ? Number(days) : Math.max(1, Math.round((end - start) / 86400000) + 1);
  item.startDate = nextStartDate;
  item.endDate = nextEndDate;
  item.days = calculatedDays;

  (db.tasks || []).forEach(task => {
    const linkedById = task.ganttId === id;
    const linkedLegacyTask = !task.ganttId && task.title === item.title &&
      (!item.projectId || !task.projectId || task.projectId === item.projectId);
    if (linkedById || linkedLegacyTask) {
      task.startDate = nextStartDate;
      task.endDate = nextEndDate;
      task.estimatedDays = calculatedDays;
      task.estimatedHours = calculatedDays * 8;
    }
  });

  writeDb(db);
  return res.json({
    success: true,
    message: 'Đã cập nhật thời gian và đồng bộ task được giao',
    data: item
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
    days,
    assignee,
    notes,
    color,
    dependencies,
    speed,
    insertAfterId // Tùy chọn: người dùng chỉ định chèn cụ thể sau công việc nào
  } = req.body;

  if (!title || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tên công việc, ngày bắt đầu và ngày kết thúc' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const calculatedDays = days ? Number(days) : Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

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

  // === 2. TỰ ĐỘNG TẠO ĐƯỜNG MŨI TÊN LIÊN KẾT FS NỐI XUỐNG ===
  let autoDependencies = Array.isArray(dependencies) ? [...dependencies] : [];
  if (autoDependencies.length === 0 && !isGroup) {
    // Tự động liên kết tới công việc đứng ngay trước đó để vẽ đường nối xuống
    if (insertIdx >= 0 && db.ganttItems[insertIdx]) {
      autoDependencies.push(db.ganttItems[insertIdx].id);
    }
  }

  const newItem = {
    id: newGanttId,
    projectId: projectId || 'proj-1',
    code: formattedCode,
    title,
    isGroup: Boolean(isGroup),
    color: color || '#0284c7',
    unit: unit || 'TK',
    startDate,
    endDate,
    days: calculatedDays,
    assignee: assignee || 'Trần Quốc Hưng',
    notes: notes || '',
    status: 'in_progress',
    speed: speed || 'on_time',
    progress: 0,
    dependencies: autoDependencies
  };

  // Chèn vào mảng ganttItems
  if (insertIdx === -1) {
    db.ganttItems.unshift(newItem);
  } else {
    db.ganttItems.splice(insertIdx + 1, 0, newItem);
  }

  // === 3. ĐỒNG BỘ SANG MỤC 1 (PHÂN CÔNG CÔNG VIỆC) & TRANG NHÂN SỰ ===
  if (!isGroup) {
    // Tìm nhân sự tương ứng
    const empNameNorm = (newItem.assignee || '').trim().toLowerCase();
    const emp = db.employees.find(e => e.name.trim().toLowerCase() === empNameNorm) || db.employees[0];

    // Xác định tên giai đoạn (Phase)
    let phaseName = 'A. THIẾT KẾ XÂY DỰNG';
    const upperCode = newItem.code.toUpperCase();
    if (upperCode.startsWith('B')) phaseName = 'B. XIN PHÉP / PHÁP LÝ';
    else if (upperCode.startsWith('C')) phaseName = 'C. MỜI THẦU THI CÔNG';
    else if (upperCode.startsWith('L')) phaseName = 'L. NGHỈ LỄ VIỆT NAM';

    const project = db.projects.find(p => p.id === newItem.projectId);
    const matchedTask = {
      id: `task-${Date.now()}`,
      ganttId: newItem.id,
      projectId: newItem.projectId,
      projectName: project?.name || 'DỰ ÁN XÂY DỰNG TRUNG TÂM CÔNG NGHỆ APS VIỆT NAM',
      phase: phaseName,
      title: newItem.title,
      code: newItem.code,
      employeeId: emp ? emp.id : 'emp-1',
      employeeName: emp ? emp.name : newItem.assignee,
      startDate: newItem.startDate,
      endDate: newItem.endDate,
      estimatedHours: newItem.days * 8,
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

  // Loại liên kết phụ thuộc tới hạng mục vừa bị xóa.
  db.ganttItems.forEach(item => {
    if (Array.isArray(item.dependencies)) {
      item.dependencies = item.dependencies.filter(dependencyId => dependencyId !== id);
    }
  });

  writeDb(db);

  return res.json({
    success: true,
    message: `Đã xóa công việc "${removedItem.title}" khỏi tiến độ và đồng bộ nhiệm vụ`,
    data: removedItem,
    deletedTaskIds: [...linkedTaskIds]
  });
}
