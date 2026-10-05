import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import ModalOverlay from '../../components/layout/ModalOverlay';
import DateInput from '../../components/DateInput';
import EmployeeCombobox from '../../components/EmployeeCombobox';
import { formatDateVi, inclusiveDays, scheduledProgress, isTaskOverdue, taskDelayHours, formatDelayHours, todayIsoDate } from '../../utils/date';
import {
  CalendarRange,
  Plus,
  Trash2,
  Building,
  Clock,
  Flame,
  Layers,
  Maximize2,
  Calendar,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  UsersRound,
  UserPlus,
  X
} from 'lucide-react';

// Danh sách 64 đơn vị cấp tỉnh theo yêu cầu (giai đoạn 2004–2008).
const VIETNAM_PROVINCES_AND_CITIES = [
  'An Giang', 'Bà Rịa - Vũng Tàu', 'Bạc Liêu', 'Bắc Giang', 'Bắc Kạn', 'Bắc Ninh',
  'Bến Tre', 'Bình Định', 'Bình Dương', 'Bình Phước', 'Bình Thuận', 'Cà Mau',
  'Thành phố Cần Thơ', 'Cao Bằng', 'Thành phố Đà Nẵng', 'Đắk Lắk', 'Đắk Nông',
  'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam',
  'Thành phố Hà Nội', 'Hà Tây', 'Hà Tĩnh', 'Hải Dương', 'Thành phố Hải Phòng',
  'Hậu Giang', 'Hòa Bình', 'Hưng Yên', 'Khánh Hòa', 'Kiên Giang', 'Kon Tum',
  'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định',
  'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên', 'Quảng Bình',
  'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng', 'Sơn La',
  'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên - Huế',
  'Tiền Giang', 'Trà Vinh', 'Tuyên Quang', 'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái',
  'Thành phố Hồ Chí Minh'
];

const normalizeLocationSearch = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLocaleLowerCase('vi');

const formatAssignmentDateRange = (startDate, endDate) => {
  const [, startYear, startMonth, startDay] = String(startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  const [, endYear, endMonth, endDay] = String(endDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!startYear || !endYear) return '';
  if (startYear === endYear && startMonth === endMonth) {
    return startDay === endDay
      ? `${Number(startDay)}/${Number(startMonth)}`
      : `${Number(startDay)}–${Number(endDay)}/${Number(startMonth)}`;
  }
  return `${Number(startDay)}/${Number(startMonth)}–${Number(endDay)}/${Number(endMonth)}`;
};

const hasStoredAssignmentState = task => Boolean(task && (
  Array.isArray(task.assignees) ||
  Object.hasOwn(task, 'employeeId') ||
  Object.hasOwn(task, 'employeeName')
));

const flattenWorkGroups = (items, collapsedGroupIds) => {
  const groupIds = new Set(items.filter(item => item.isGroup).map(item => item.id));
  const childrenByGroup = new Map();
  items.forEach(item => {
    if (!groupIds.has(item.parentGroupId)) return;
    const children = childrenByGroup.get(item.parentGroupId) || [];
    children.push(item);
    childrenByGroup.set(item.parentGroupId, children);
  });

  return items
    .filter(item => !groupIds.has(item.parentGroupId))
    .flatMap(item => {
      if (!item.isGroup) return [item];
      const children = childrenByGroup.get(item.id) || [];
      return [item, ...(collapsedGroupIds.has(item.id) ? [] : children)];
    });
};

export default function GanttPage() {
  const today = todayIsoDate();
  const {
    ganttItems,
    tasks,
    projects,
    employees,
    currentTime,
    ganttMonth,
    sidebarCollapsed,
    addGanttItem,
    deleteGanttItem,
    addProject,
    updateProject,
    deleteProject,
    updateGanttItem
  } = useApp();

  // Chọn dự án đang xem
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj-1');
  const [collapsedProjectIds, setCollapsedProjectIds] = useState(() => new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(() => new Set());
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef(null);
  const groupMenuRef = useRef(null);

  const toggleProjectCollapsed = (projectId) => {
    setCollapsedProjectIds(current => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const toggleGroupCollapsed = groupId => {
    setCollapsedGroupIds(current => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Chế độ thu phóng (Zoom: 'day' | 'week' | 'month')
  const [zoomLevel, setZoomLevel] = useState('week'); // 1 day = 18px (day), 1 day = 6px (week), 1 day = 3px (month)

  // Trạng thái modal
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupEditTitle, setGroupEditTitle] = useState('');
  const [groupMenuOpenId, setGroupMenuOpenId] = useState(null);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [assignmentEditorItem, setAssignmentEditorItem] = useState(null);
  const [assignmentRows, setAssignmentRows] = useState([]);
  const [hoveredDependencyKey, setHoveredDependencyKey] = useState(null);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', days: 1, estimatedHours: 8, estimatedHoursEdited: true });
  const timelineScrollRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(() => typeof window === 'undefined' ? 768 : window.innerHeight);

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  // Form thêm công việc cho dự án
  const [taskForm, setTaskForm] = useState({
    code: '',
    projectId: projects[0]?.id || 'proj-1',
    title: '',
    isGroup: false,
    unit: 'TK',
    startDate: today,
    endDate: today,
    days: 1,
    estimatedHours: 8,
    estimatedHoursEdited: false,
    assigneeId: '',
    notes: '',
    color: '#861b36',
    dependencies: [],
    successorId: '',
    speed: 'on_time',
    parentGroupId: ''
  });
  const [groupForm, setGroupForm] = useState({ title: '', projectId: projects[0]?.id || '' });

  const updateDateRange = (setter, field, value) => {
    setter(current => {
      const next = { ...current, [field]: value };
      if (next.startDate && next.endDate && next.endDate < next.startDate) {
        if (field === 'startDate') next.endDate = value;
        else next.startDate = value;
      }
      next.days = inclusiveDays(next.startDate, next.endDate);
      if (!current.estimatedHoursEdited) next.estimatedHours = 8;
      return next;
    });
  };

  const projectIdForItem = (item) => item.projectId || tasks.find(task => task.ganttId === item.id)?.projectId;

  useEffect(() => {
    if (!createMenuOpen) return undefined;
    const closeOnOutsideClick = event => {
      if (!createMenuRef.current?.contains(event.target)) setCreateMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setCreateMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [createMenuOpen]);

  useEffect(() => {
    if (!groupMenuOpenId) return undefined;
    const closeOnOutsideClick = event => {
      if (!groupMenuRef.current?.contains(event.target)) setGroupMenuOpenId(null);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setGroupMenuOpenId(null);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [groupMenuOpenId]);

  useEffect(() => {
    if (projects.length === 0) return;
    setSelectedProjectId(current => current === 'ALL' || projects.some(project => project.id === current)
      ? current
      : projects[0].id);
    setTaskForm(current => projects.some(project => project.id === current.projectId)
      ? current
      : { ...current, projectId: projects[0].id });
  }, [projects]);

  // Form tạo dự án
  const [projectForm, setProjectForm] = useState({
    name: '',
    code: '',
    description: '',
    location: 'Hà Nội',
    manager: 'Trần Quốc Hưng',
    startDate: today,
    endDate: today
  });
  const [editProjectForm, setEditProjectForm] = useState({ startDate: '', endDate: '' });
  const matchingLocations = VIETNAM_PROVINCES_AND_CITIES.filter(location =>
    normalizeLocationSearch(location).includes(normalizeLocationSearch(locationSearch.trim()))
  );

  // Lọc theo dự án trước khi tính timeline và vẽ các thanh Gantt.
  const filteredGanttItems = useMemo(() => {
    const projectItems = selectedProjectId === 'ALL'
      ? ganttItems
      : ganttItems.filter(g => projectIdForItem(g) === selectedProjectId);

    if (selectedProjectId !== 'ALL') {
      const project = projects.find(item => item.id === selectedProjectId);
      if (!project) return projectItems;
      return [
        { id: `project-heading-${project.id}`, projectId: project.id, title: project.name, isProjectHeader: true },
        ...(collapsedProjectIds.has(project.id) ? [] : flattenWorkGroups(projectItems, collapsedGroupIds))
      ];
    }

    return projects.flatMap(project => {
      const items = projectItems.filter(item => projectIdForItem(item) === project.id);
      if (items.length === 0) return [];
      return [
        { id: `project-heading-${project.id}`, projectId: project.id, title: project.name, isProjectHeader: true },
        ...(collapsedProjectIds.has(project.id) ? [] : flattenWorkGroups(items, collapsedGroupIds))
      ];
    });
  }, [ganttItems, tasks, projects, selectedProjectId, collapsedProjectIds, collapsedGroupIds]);

  // Tính toán thời gian bắt đầu và kết thúc tổng thể của Gantt
  // Khung thời gian linh hoạt: bao phủ từ tháng sớm nhất đến tháng muộn nhất của dự án
  const timelineStart = useMemo(() => {
    return new Date(ganttMonth.getFullYear(), ganttMonth.getMonth(), 1);
  }, [ganttMonth]);

  const timelineEnd = useMemo(() => {
    return new Date(timelineStart.getFullYear(), timelineStart.getMonth() + 12, 0);
  }, [timelineStart]);

  useEffect(() => {
    if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft = 0;
  }, [ganttMonth]);

  // Tính tỷ lệ pixel theo ngày dựa trên zoom level
  const pxPerDay = useMemo(() => {
    if (zoomLevel === 'week') return 7.5;
    return 20;
  }, [zoomLevel]);

  // Tổng số ngày trong timeline
  const totalTimelineDays = useMemo(() => {
    const startUtc = Date.UTC(timelineStart.getFullYear(), timelineStart.getMonth(), timelineStart.getDate());
    const endUtc = Date.UTC(timelineEnd.getFullYear(), timelineEnd.getMonth(), timelineEnd.getDate());
    return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
  }, [timelineStart, timelineEnd]);

  // Danh sách các cột tháng (T11/26, T12/26, T1/27, T2/27, T3/27, T4/27, T5/27, T6/27, T7/27)
  const monthColumns = useMemo(() => {
    const months = [];
    const curr = new Date(timelineStart);
    while (curr <= timelineEnd) {
      const year = curr.getFullYear();
      const month = curr.getMonth();
      const monthStartUtc = Date.UTC(year, month, 1);
      const timelineStartUtc = Date.UTC(timelineStart.getFullYear(), timelineStart.getMonth(), timelineStart.getDate());
      const timelineEndUtc = Date.UTC(timelineEnd.getFullYear(), timelineEnd.getMonth(), timelineEnd.getDate());
      const daysFromStart = Math.round((monthStartUtc - timelineStartUtc) / (1000 * 60 * 60 * 24));
      const calendarDays = new Date(year, month + 1, 0).getDate();
      const daysThroughEnd = Math.floor((timelineEndUtc - monthStartUtc) / (1000 * 60 * 60 * 24)) + 1;
      const monthDays = Math.max(0, Math.min(calendarDays, daysThroughEnd));

      months.push({
        label: `T${month + 1}/${String(year).slice(2)}`,
        days: Math.floor(monthDays),
        left: daysFromStart * pxPerDay,
        width: monthDays * pxPerDay
      });

      curr.setMonth(curr.getMonth() + 1);
    }
    return months;
  }, [timelineStart, timelineEnd, pxPerDay]);

  // Dùng đúng tổng bề rộng các cột tháng làm bề rộng timeline để tiêu đề,
  // lưới ngày/tuần và vùng vẽ task luôn kết thúc tại cùng một vị trí.
  const ganttWidth = Math.max(1200, monthColumns.reduce((total, month) => total + month.width, 0));

  // Chiều cao mỗi dòng trong bảng & biểu đồ (khóa cứng pixel để không bao giờ bị lệch)
  const ROW_HEIGHT = 44;
  const HEADER_HEIGHT = zoomLevel === 'month' ? 72 : 52;
  const BAR_HEIGHT = 24;
  const LEFT_PANEL_WIDTH = 788;
  const rowHeights = filteredGanttItems.map(item => {
    if (item.isProjectHeader) return 36;
    const linkedTask = tasks.find(task => task.ganttId === item.id);
    const savedAssignees = Array.isArray(linkedTask?.assignees) && linkedTask.assignees.length
      ? linkedTask.assignees
      : item.assignees;
    const assigneeCount = Array.isArray(savedAssignees) && savedAssignees.length ? savedAssignees.length : 1;
    const hasAssignee = contribution => (savedAssignees || []).some(assignment =>
      (contribution.employeeId && assignment.employeeId === contribution.employeeId) ||
      (contribution.employeeName || '').trim().toLocaleLowerCase('vi') ===
        (assignment.employeeName || '').trim().toLocaleLowerCase('vi')
    );
    const additionalOvertimeRows = (item.overtimeContributions || []).filter(contribution => !hasAssignee(contribution)).length;
    return Math.max(ROW_HEIGHT, 8 + assigneeCount * 22) + additionalOvertimeRows * 18;
  });
  const rowOffsets = rowHeights.reduce((offsets, height, index) => {
    offsets.push((offsets[index] || 0) + height);
    return offsets;
  }, [0]);
  const rowsHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  const chartBodyHeight = Math.max(sidebarCollapsed ? 360 : 200, rowsHeight + 20, viewportHeight - 170);

  // Tính tọa độ vị trí (x, width, y) của từng thanh Gantt bên trong SVG (bắt đầu từ y = 0)
  const taskCoordinates = useMemo(() => {
    const coords = {};
    filteredGanttItems.forEach((item, index) => {
      if (item.isProjectHeader) return;
      const sDate = new Date(`${item.startDate}T00:00:00`);
      const eDate = new Date(`${item.endDate}T00:00:00`);
      if (!Number.isFinite(sDate.getTime()) || !Number.isFinite(eDate.getTime())) return;

      const startOffset = (sDate - timelineStart) / (1000 * 60 * 60 * 24);
      const endOffset = (eDate - timelineStart) / (1000 * 60 * 60 * 24) + 1;
      const visibleStart = Math.max(0, startOffset);
      const visibleEnd = Math.min(totalTimelineDays, endOffset);
      if (visibleEnd <= visibleStart) return;

      const x = visibleStart * pxPerDay;
      const width = Math.max(1, (visibleEnd - visibleStart) * pxPerDay);
      // Tọa độ Y căn giữa tuyệt đối theo từng dòng 44px bên trong SVG
      const rowTop = rowOffsets[index];
      const rowHeight = rowHeights[index];
      const y = rowTop + (rowHeight - BAR_HEIGHT) / 2;
      const centerY = rowTop + rowHeight / 2;

      coords[item.id] = {
        x,
        y,
        width,
        height: BAR_HEIGHT,
        endX: x + width,
        centerY,
        rowTop,
        rowHeight,
        item
      };
    });
    return coords;
  }, [filteredGanttItems, timelineStart, totalTimelineDays, pxPerDay, rowHeights, rowOffsets]);

  // Tạo đường cong mũi tên phụ thuộc Finish-to-Start (FS) - TỰ ĐỘNG NỐI TỪ TASK TRƯỚC XUỐNG
  const dependencyLines = useMemo(() => {
    const edges = new Map();
    filteredGanttItems.forEach((item, toIndex) => {
      if (item.isProjectHeader) return;
      let deps = Array.isArray(item.dependencies) ? [...item.dependencies] : [];

      // Nếu là công việc con và chưa có liên kết, tự động nối từ công việc đứng ngay trước đó
      if (deps.length === 0 && !item.isGroup && toIndex > 0) {
        for (let p = toIndex - 1; p >= 0; p--) {
          const candidate = filteredGanttItems[p];
          if (candidate && !candidate.isProjectHeader && !candidate.isGroup && candidate.projectId === item.projectId) {
            deps = [candidate.id];
            break;
          }
        }
      }

      [...new Set(deps)].filter(depId => depId !== item.id).forEach((depId) => {
        const from = taskCoordinates[depId];
        const to = taskCoordinates[item.id];
        if (!from || !to) return;
        const key = `${depId}->${item.id}`;
        edges.set(key, { key, from, to, sourceId: depId, targetId: item.id });
      });
    });

    return [...edges.values()].map(({ key, from, to, sourceId, targetId }) => {
      const startX = from.x + 6;
      const startY = from.centerY;
      const endX = Math.max(to.x - 10, 0);
      const endY = to.centerY;
      const laneX = Math.min(startX, endX) - 32;
      const bendY = startY + (endY - startY) * 0.45;
      const path = `M ${startX} ${startY}
        C ${startX - 18} ${startY}, ${laneX} ${startY}, ${laneX} ${bendY}
        S ${laneX} ${endY}, ${endX} ${endY}`;

      return {
        key,
        path,
        type: 'dependency',
        sourceId,
        targetId
      };
    });
  }, [filteredGanttItems, taskCoordinates]);

  const hoveredDependency = dependencyLines.find(line => line.key === hoveredDependencyKey) || null;

  // Xử lý gửi Form thêm Task
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.title) return;
    const project = projects.find(item => item.id === taskForm.projectId);
    if (project && ((project.startDate && taskForm.startDate < project.startDate) || (project.endDate && taskForm.endDate > project.endDate))) {
      window.alert(`Ngày task phải nằm trong thời gian dự án (${formatDateVi(project.startDate)} → ${formatDateVi(project.endDate)}).`);
      return;
    }
    const assignee = employees.find(employee => employee.id === taskForm.assigneeId);
    const success = await addGanttItem({
      ...taskForm,
      assignee: assignee?.name || '',
      estimatedHoursPerDay: taskForm.estimatedHours
    });
    if (success) {
      setTaskForm({
        code: '',
        projectId: selectedProjectId === 'ALL' ? projects[0]?.id || 'proj-1' : selectedProjectId,
        title: '',
        isGroup: false,
        unit: 'TK',
        startDate: todayIsoDate(),
        endDate: todayIsoDate(),
        days: 1,
        estimatedHours: 8,
        estimatedHoursEdited: false,
        assigneeId: '',
        notes: '',
        color: '#861b36',
        dependencies: [],
        successorId: '',
        speed: 'on_time',
        parentGroupId: ''
      });
      setShowAddTaskModal(false);
    }
  };

  const handleGroupSubmit = async event => {
    event.preventDefault();
    const project = projects.find(item => item.id === groupForm.projectId);
    const title = groupForm.title.trim();
    if (!project || !title) return;

    let codeIndex = 1;
    while (ganttItems.some(item => item.code === `GR${codeIndex}`)) codeIndex += 1;
    const projectItems = ganttItems.filter(item => projectIdForItem(item) === project.id);
    const lastProjectItem = projectItems.at(-1);
    const startDate = project.startDate || todayIsoDate();
    const endDate = project.endDate || startDate;
    const success = await addGanttItem({
      code: `GR${codeIndex}`,
      projectId: project.id,
      title,
      isGroup: true,
      unit: 'GR',
      startDate,
      endDate,
      estimatedHoursPerDay: 8,
      assignee: '',
      notes: '',
      color: '#861b36',
      dependencies: [],
      insertAfterId: lastProjectItem?.id || ''
    });
    if (success) {
      setGroupForm({ title: '', projectId: project.id });
      setShowAddGroupModal(false);
    }
  };

  const openGroupEdit = item => {
    setGroupEditTitle(item.title);
    setEditingGroup(item);
    setGroupMenuOpenId(null);
  };

  const handleGroupEditSubmit = async event => {
    event.preventDefault();
    const title = groupEditTitle.trim();
    if (!editingGroup || !title) return;
    if (await updateGanttItem(editingGroup.id, { title })) setEditingGroup(null);
  };

  const openTaskCreation = () => {
    const projectId = selectedProjectId === 'ALL' ? projects[0]?.id : selectedProjectId;
    const currentDate = todayIsoDate();
    setTaskForm(current => ({
      ...current,
      projectId: projectId || '',
      parentGroupId: '',
      startDate: currentDate,
      endDate: currentDate,
      days: 1,
      estimatedHours: 8,
      estimatedHoursEdited: false,
      dependencies: []
    }));
    setCreateMenuOpen(false);
    setShowAddTaskModal(true);
  };

  const openGroupCreation = () => {
    const projectId = selectedProjectId === 'ALL' ? projects[0]?.id : selectedProjectId;
    setGroupForm({ title: '', projectId: projectId || '' });
    setCreateMenuOpen(false);
    setShowAddGroupModal(true);
  };

  // Xử lý gửi Form thêm Project
  const handleProjectSubmit = async (e) => {
    e.preventDefault();
    if (!projectForm.name) return;
    const createdProject = await addProject(projectForm);
    if (createdProject) {
      if (createdProject.id) setSelectedProjectId(createdProject.id);
      setProjectForm({
        name: '',
        code: '',
        description: '',
        location: 'Hà Nội',
        manager: 'Trần Quốc Hưng',
        startDate: todayIsoDate(),
        endDate: todayIsoDate()
      });
      setShowAddProjectModal(false);
    }
  };

  const openProjectDateEditor = () => {
    const project = projects.find(item => item.id === selectedProjectId);
    if (!project) return;
    setEditProjectForm({ startDate: project.startDate || '', endDate: project.endDate || '' });
    setShowEditProjectModal(true);
  };

  const handleProjectDateSubmit = async (e) => {
    e.preventDefault();
    if (!editProjectForm.startDate || !editProjectForm.endDate || editProjectForm.endDate < editProjectForm.startDate) {
      window.alert('Vui lòng chọn khoảng ngày bắt đầu và kết thúc hợp lệ.');
      return;
    }
    if (await updateProject(selectedProjectId, editProjectForm)) setShowEditProjectModal(false);
  };

  const handleEditOpen = (item) => {
    setEditingItem(item);
    const days = inclusiveDays(item.startDate, item.endDate);
    const assignedEmployee = employees.find(employee => employee.name === item.assignee);
    const estimatedHours = Number(item.estimatedHoursPerDay) || (Number(item.estimatedHours) > 0 ? Number(item.estimatedHours) / days : Number(assignedEmployee?.standardHours) || 8);
    setEditForm({ startDate: item.startDate, endDate: item.endDate, days, estimatedHours, estimatedHoursEdited: true });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const project = projects.find(item => item.id === editingItem.projectId);
    if (project && ((project.startDate && editForm.startDate < project.startDate) || (project.endDate && editForm.endDate > project.endDate))) {
      window.alert(`Ngày task phải nằm trong thời gian dự án (${formatDateVi(project.startDate)} → ${formatDateVi(project.endDate)}).`);
      return;
    }
    const success = await updateGanttItem(editingItem.id, { ...editForm, estimatedHoursPerDay: editForm.estimatedHours });
    if (success) setEditingItem(null);
  };

  const handleAssignmentsOpen = (item) => {
    const linkedTask = tasks.find(task => task.ganttId === item.id);
    const taskHasAssignmentState = hasStoredAssignmentState(linkedTask);
    const currentAssignments = taskHasAssignmentState
      ? (Array.isArray(linkedTask.assignees) && linkedTask.assignees.length
        ? linkedTask.assignees
        : linkedTask.employeeId || linkedTask.employeeName
        ? [{
          employeeId: linkedTask.employeeId || '',
          employeeName: linkedTask.employeeName || '',
          startDate: item.startDate,
          endDate: item.endDate
        }]
        : [{ employeeId: '', startDate: item.startDate, endDate: item.endDate }])
      : Array.isArray(item.assignees) && item.assignees.length
        ? item.assignees
        : item.assignee
          ? [{
            employeeId: employees.find(employee => employee.name === item.assignee)?.id || '',
            employeeName: item.assignee,
            startDate: item.startDate,
            endDate: item.endDate
          }]
          : [{ employeeId: '', startDate: item.startDate, endDate: item.endDate }];
    setAssignmentRows(currentAssignments.map(assignment => ({
      employeeId: assignment.employeeId || '',
      startDate: assignment.startDate || item.startDate,
      endDate: assignment.endDate || item.endDate,
      estimatedHoursPerDay: Number(assignment.estimatedHoursPerDay) ||
        Number(linkedTask?.estimatedHoursPerDay) ||
        Number(item.estimatedHoursPerDay) ||
        Number(employees.find(employee => employee.id === assignment.employeeId)?.standardHours) || 8
    })));
    setAssignmentEditorItem(item);
  };

  const handleAssignmentsSubmit = async (e) => {
    e.preventDefault();
    if (!assignmentEditorItem || assignmentRows.some(assignment =>
      !assignment.employeeId || !assignment.startDate || !assignment.endDate || assignment.endDate < assignment.startDate ||
      !Number.isFinite(Number(assignment.estimatedHoursPerDay)) || Number(assignment.estimatedHoursPerDay) <= 0
    )) {
      window.alert('Vui lòng chọn người đảm nhận và khoảng thời gian hợp lệ cho từng người.');
      return;
    }
    const duplicateEmployee = assignmentRows.some((assignment, index) =>
      assignmentRows.findIndex(row => row.employeeId === assignment.employeeId) !== index
    );
    if (duplicateEmployee) {
      window.alert('Mỗi người chỉ được xuất hiện một lần trong danh sách đảm nhận.');
      return;
    }
    const outsideTaskDates = assignmentRows.some(assignment =>
      assignment.startDate < assignmentEditorItem.startDate || assignment.endDate > assignmentEditorItem.endDate
    );
    if (outsideTaskDates) {
      window.alert(`Khoảng thời gian đảm nhận phải nằm trong thời gian công việc (${formatDateVi(assignmentEditorItem.startDate)} → ${formatDateVi(assignmentEditorItem.endDate)}).`);
      return;
    }
    const success = await updateGanttItem(assignmentEditorItem.id, { assignees: assignmentRows });
    if (success) setAssignmentEditorItem(null);
  };

  const handleDeleteSelectedProject = async () => {
    if (selectedProjectId === 'ALL') return;
    const success = await deleteProject(selectedProjectId);
    if (success) setSelectedProjectId('ALL');
  };

  return (
    <div className="w-full space-y-0">
      
      {/* THANH ĐIỀU KHIỂN & BỘ LỌC GANTT */}
      <div className="sticky top-16 z-[60] w-full px-4 sm:px-5 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
        
        {/* Chọn dự án & Banner */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-sky-600 flex-shrink-0" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 max-w-xs"
            >
              <option value="ALL">Tất cả dự án</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={openProjectDateEditor}
              disabled={selectedProjectId === 'ALL'}
              title="Chỉnh thời gian dự án"
              className="p-2 rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDeleteSelectedProject}
              disabled={selectedProjectId === 'ALL'}
              title={selectedProjectId === 'ALL' ? 'Chọn một dự án để xóa' : 'Xóa dự án và toàn bộ dữ liệu liên quan'}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Nút Tạo Dự Án Mới */}
          <button
            onClick={() => setShowAddProjectModal(true)}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
          >
            + Dự Án Mới
          </button>

          <div className="relative" ref={createMenuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
              disabled={projects.length === 0}
              onClick={() => setCreateMenuOpen(open => !open)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm mới</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {createMenuOpen && (
              <div role="menu" className="absolute right-0 top-full z-[100] mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  role="menuitem"
                  onClick={openTaskCreation}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <CalendarRange className="h-4 w-4 text-sky-600" />
                  Tạo công việc mới
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openGroupCreation}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Layers className="h-4 w-4 text-sky-600" />
                  Tạo mục công việc mới
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Thu phóng & Nút thêm */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Lọc giai đoạn */}
          {/* Thu phóng (Zoom Level) */}
          <div className="flex w-[120px] shrink-0 items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setZoomLevel('month')}
              className={`flex-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                zoomLevel === 'month' ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-500'
              }`}
            >
              Tháng
            </button>
            <button
              onClick={() => setZoomLevel('week')}
              className={`flex-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                zoomLevel === 'week' ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-500'
              }`}
            >
              Tuần
            </button>
          </div>

          <div className="hidden sm:flex w-[160px] shrink-0 items-center justify-center gap-1.5 px-3 py-1 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-semibold">
            <span>T{timelineStart.getMonth() + 1}/{timelineStart.getFullYear()} - T{timelineEnd.getMonth() + 1}/{timelineEnd.getFullYear()}</span>
          </div>

        </div>

      </div>

      {/* BẢNG TIẾN ĐỘ & BIỂU ĐỒ GANTT TƯƠNG TÁC (CỘT TRỜI ĐÓNG BĂNG) */}
      <div className="w-full bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Khung cuộn ngang chứa cả Bảng bên trái + Biểu đồ bên phải */}
        <div
          ref={timelineScrollRef}
          className="h-[calc(100dvh-124px)] min-h-[320px] overflow-x-auto overflow-y-auto relative isolate bg-slate-100 dark:bg-slate-950"
        >
          <div className="flex bg-slate-100 dark:bg-slate-950" style={{ width: `${LEFT_PANEL_WIDTH + ganttWidth}px`, minWidth: '100%' }}>
            
            {/* ================= KHUNG TRÁI: BẢNG DỮ LIỆU CÔNG VIỆC (ĐÓNG BĂNG FREEZE) ================= */}
            <div className="w-[788px] min-w-[788px] max-w-[788px] flex-shrink-0 sticky left-0 z-40 bg-white dark:bg-slate-900 border-r-2 border-slate-300 dark:border-slate-700 shadow-md">
              
              {/* Header Bảng Bên Trái - Khóa cứng 52px */}
              <div
                className="sticky top-0 z-50 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider box-border"
                style={{ height: `${HEADER_HEIGHT}px`, minHeight: `${HEADER_HEIGHT}px`, maxHeight: `${HEADER_HEIGHT}px` }}
              >
                <div className="w-14 min-w-[56px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">STT</div>
                <div className="w-[220px] min-w-[220px] max-w-[220px] py-2 px-3 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap truncate shrink-0">CÔNG VIỆC TRONG DỰ ÁN</div>
                <div className="w-[76px] min-w-[76px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">BẮT ĐẦU</div>
                <div className="w-[76px] min-w-[76px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">KẾT THÚC</div>
                <div className="w-[72px] min-w-[72px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">NGÀY</div>
                <div className="w-[88px] min-w-[88px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">THỜI GIAN</div>
                <div className="w-24 min-w-[96px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">TRẠNG THÁI</div>
                <div className="w-[104px] min-w-[104px] text-center py-2 px-1 shrink-0">THAO TÁC</div>
              </div>

              {/* Danh Sách Các Hàng Công Việc (Khóa cứng 44px mỗi dòng) */}
              <div style={{ minHeight: `${chartBodyHeight}px` }}>
                {filteredGanttItems.map((item, itemIndex) => {
                  const isGroup = item.isGroup;
                  const isHoliday = item.status === 'holiday';
                  if (item.isProjectHeader) {
                    const project = projects.find(candidate => candidate.id === item.projectId);
                    const projectTasks = tasks.filter(task => task.projectId === item.projectId || (!task.projectId && task.projectName === project?.name));
                    const projectTaskGanttIds = new Set(projectTasks.map(task => task.ganttId).filter(Boolean));
                    const projectTaskTitles = new Set(projectTasks.map(task => task.title?.trim().toLowerCase()).filter(Boolean));
                    const ganttOnlyProjectItems = ganttItems.filter(ganttItem =>
                      projectIdForItem(ganttItem) === item.projectId && !ganttItem.isGroup && ganttItem.status !== 'holiday' &&
                      !projectTaskGanttIds.has(ganttItem.id) && !projectTaskTitles.has(ganttItem.title?.trim().toLowerCase())
                    );
                    const totalProjectHours = [
                      ...projectTasks.map(task => Number(task.estimatedHours) || (Number(task.estimatedHoursPerDay) || 8) * (Number(task.estimatedDays) || 1)),
                      ...ganttOnlyProjectItems.map(ganttItem => Number(ganttItem.estimatedHours) || (Number(ganttItem.estimatedHoursPerDay) || 8) * (Number(ganttItem.days) || 1))
                    ].reduce((sum, hours) => sum + hours, 0);
                    const totalProjectDays = inclusiveDays(project?.startDate, project?.endDate);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center h-9 min-h-9 bg-sky-50 dark:bg-slate-800 border-b border-sky-100 dark:border-slate-700 text-sky-800 dark:text-sky-200 font-bold text-xs"
                        style={{ height: `${rowHeights[itemIndex]}px`, minHeight: `${rowHeights[itemIndex]}px` }}
                      >
                        <div className="w-14 min-w-[56px] h-full border-r border-sky-100 dark:border-slate-700" />
                        <div className="w-[220px] min-w-[220px] max-w-[220px] h-full px-3 flex items-center gap-2 border-r border-sky-100 dark:border-slate-700 truncate">
                          <button
                            type="button"
                            onClick={() => toggleProjectCollapsed(item.projectId)}
                            aria-label={`${collapsedProjectIds.has(item.projectId) ? 'Mở rộng' : 'Thu gọn'} dự án ${item.title}`}
                            title={`${collapsedProjectIds.has(item.projectId) ? 'Mở rộng' : 'Thu gọn'} dự án`}
                            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-sky-100 hover:text-sky-700 dark:hover:bg-slate-700"
                          >
                            {collapsedProjectIds.has(item.projectId)
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <Building className="w-3.5 h-3.5 shrink-0 text-sky-600" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        <div className="w-[76px] min-w-[76px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatDateVi(project?.startDate) || '-'}</div>
                        <div className="w-[76px] min-w-[76px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatDateVi(project?.endDate) || '-'}</div>
                        <div className="w-[72px] min-w-[72px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">{totalProjectDays} ngày</div>
                        <div className="w-[88px] min-w-[88px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{totalProjectHours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h</div>
                        <div className="w-24 min-w-[96px] h-full border-r border-sky-100 dark:border-slate-700" />
                        <div className="w-[104px] min-w-[104px] h-full" />
                      </div>
                    );
                  }

                  if (isGroup) {
                    return (
                      <div
                        key={item.id}
                        className="flex items-center border-b border-slate-100 bg-slate-50/80 font-bold text-slate-900 dark:border-slate-800/80 dark:bg-slate-800/80 dark:text-white"
                        style={{ height: `${rowHeights[itemIndex]}px`, minHeight: `${rowHeights[itemIndex]}px` }}
                      >
                        <div className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-3">
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapsed(item.id)}
                            aria-label={`${collapsedGroupIds.has(item.id) ? 'Mở rộng' : 'Thu gọn'} mục ${item.title}`}
                            title={`${collapsedGroupIds.has(item.id) ? 'Mở rộng' : 'Thu gọn'} mục công việc`}
                            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-sky-700 dark:hover:bg-slate-700"
                          >
                            {collapsedGroupIds.has(item.id)
                              ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <span className="min-w-0 truncate" title={item.title}>{item.title}</span>
                          <div className="relative ml-auto shrink-0" ref={groupMenuOpenId === item.id ? groupMenuRef : null}>
                            <button
                              type="button"
                              aria-label={`Tùy chọn mục công việc ${item.title}`}
                              aria-haspopup="menu"
                              aria-expanded={groupMenuOpenId === item.id}
                              onClick={() => setGroupMenuOpenId(current => current === item.id ? null : item.id)}
                              className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {groupMenuOpenId === item.id && (
                              <div role="menu" className="absolute right-0 top-full z-[100] mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => openGroupEdit(item)}
                                  className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Chỉnh sửa mục công việc
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setGroupMenuOpenId(null);
                                    deleteGanttItem(item.id);
                                  }}
                                  className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Xóa mục công việc
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const linkedTask = tasks.find(task => task.ganttId === item.id) || tasks.find(task =>
                    task.title?.trim().toLowerCase() === item.title?.trim().toLowerCase() &&
                    (!task.projectId || !item.projectId || task.projectId === item.projectId)
                  );
                  const rowTask = linkedTask || item;
                  const rowOverdue = isTaskOverdue(rowTask, currentTime);
                  const rowDelayHours = taskDelayHours(rowTask, currentTime);
                  const notStarted = rowTask.startDate && rowTask.startDate > todayIsoDate(currentTime);
                  const rowStatus = item.isGroup || isHoliday ? null : rowTask.status === 'completed' && (rowTask.speedStatus === 'delayed' || rowTask.delayHours > 0)
                    ? { label: 'Hoàn thành muộn', style: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
                    : rowTask.status === 'completed' && rowTask.speedStatus === 'early'
                      ? { label: 'Hoàn thành sớm', style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
                    : rowTask.status === 'completed'
                      ? { label: 'Hoàn thành', style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
                      : rowOverdue
                        ? { label: 'Quá hạn', style: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' }
                        : rowDelayHours > 0
                          ? { label: 'Chậm trễ', style: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
                          : notStarted
                            ? { label: 'Chưa bắt đầu', style: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
                            : { label: 'Đang làm', style: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' };

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 box-border border-b border-slate-100 dark:border-slate-800/80 overflow-hidden ${
                        isGroup
                          ? 'font-bold bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-white'
                          : isHoliday
                          ? 'bg-amber-500/5 text-amber-800 dark:text-amber-200'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                      style={{ height: `${rowHeights[itemIndex]}px`, minHeight: `${rowHeights[itemIndex]}px` }}
                    >
                      {/* Cột STT */}
                      <div className="w-14 min-w-[56px] text-center py-1 px-1 font-mono font-semibold border-r border-slate-100 dark:border-slate-800 truncate shrink-0">
                        {item.code}
                      </div>

                      {/* Cột Tên Công Việc (Có thụt dòng theo cấp WBS) */}
                      <div
                        className="w-[220px] min-w-[220px] max-w-[220px] h-full min-h-0 px-3 border-r border-slate-100 dark:border-slate-800 overflow-hidden whitespace-nowrap flex items-center gap-1.5 shrink-0"
                      >
                        {isGroup && (
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapsed(item.id)}
                            aria-label={`${collapsedGroupIds.has(item.id) ? 'Mở rộng' : 'Thu gọn'} mục ${item.title}`}
                            title={`${collapsedGroupIds.has(item.id) ? 'Mở rộng' : 'Thu gọn'} mục công việc`}
                            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-sky-700 dark:hover:bg-slate-700"
                          >
                            {collapsedGroupIds.has(item.id)
                              ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {isGroup && <Layers className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
                        <span className="min-w-0 flex-1 truncate" title={item.title}>
                          {item.title}
                        </span>
                      </div>

                      {/* Cột Bắt Đầu */}
                      <div className="w-[76px] min-w-[76px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">
                        {formatDateVi(item.startDate) || '-'}
                      </div>

                      {/* Cột Kết Thúc */}
                      <div className="w-[76px] min-w-[76px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">
                        {formatDateVi(item.endDate) || '-'}
                      </div>

                      {/* Cột Ngày (Duration) */}
                      <div className="w-[72px] min-w-[72px] text-center py-1 px-1 font-bold text-[11px] border-r border-slate-100 dark:border-slate-800 shrink-0">
                        {item.days}
                      </div>

                      <div className="w-[88px] min-w-[88px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">{item.isGroup || isHoliday ? '—' : `${(Number(rowTask.estimatedHours) || (Number(rowTask.estimatedHoursPerDay) || 8) * (Number(rowTask.estimatedDays) || Number(item.days) || 1)).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h`}</div>
                      <div className="w-24 min-w-[96px] text-center py-1 px-1 border-r border-slate-100 dark:border-slate-800 shrink-0">
                        {rowStatus && <span className={`inline-flex max-w-full min-w-0 px-1.5 py-1 rounded-full text-center text-[9px] font-bold whitespace-normal break-words leading-tight ${rowStatus.style}`}>{rowStatus.label}</span>}
                      </div>

                      {/* Cột Thao Tác */}
                      <div className="w-[104px] min-w-[104px] flex items-center justify-center gap-0.5 py-1 px-1 shrink-0">
                        <button
                          onClick={() => handleEditOpen(item)}
                          className="p-1 rounded text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
                          title="Chỉnh sửa thời gian công việc"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!isGroup && !isHoliday && (
                          <button
                            onClick={() => handleAssignmentsOpen(item)}
                            className="p-1 rounded text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
                            title="Quản lý người đảm nhận và thời gian"
                          >
                            <UsersRound className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteGanttItem(item.id)}
                          className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Xóa công việc này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>

            {/* ================= KHUNG PHẢI: BIỂU ĐỒ GANTT NẰM BÊN PHẢI (SVG TƯƠNG TÁC) ================= */}
            <div className="relative z-0 flex-none bg-slate-100 dark:bg-slate-950" style={{ width: `${ganttWidth}px` }}>
              
              {/* Header Tháng & Tuần của Biểu Đồ Gantt - Khóa cứng 52px */}
              <div
                className="sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex box-border"
                style={{ width: `${ganttWidth}px`, height: `${HEADER_HEIGHT}px`, minHeight: `${HEADER_HEIGHT}px`, maxHeight: `${HEADER_HEIGHT}px` }}
              >
                {monthColumns.map((col, idx) => (
                  <div
                    key={idx}
                    className={`border-r border-slate-200 dark:border-slate-700 flex flex-col items-center text-center select-none overflow-hidden shrink-0 ${zoomLevel === 'month' ? 'justify-start px-0' : 'justify-center px-1'}`}
                    style={{ width: `${col.width}px` }}
                  >
                    <span className={`font-extrabold text-xs text-sky-600 dark:text-sky-400 ${zoomLevel === 'month' ? 'flex h-[34px] min-h-[34px] items-center' : ''}`}>
                      {col.label}
                    </span>
                    {zoomLevel === 'month' ? (
                      <div className="flex h-8 min-h-8 w-full border-t border-slate-200 dark:border-slate-700">
                        {Array.from({ length: col.days }, (_, dayIndex) => (
                          <div
                            key={dayIndex + 1}
                            className="flex h-full shrink-0 items-center justify-center border-r border-slate-200/80 text-[9px] font-medium leading-none text-slate-500 last:border-r-0 dark:border-slate-700 dark:text-slate-400"
                            style={{ width: `${pxPerDay}px` }}
                            title={`${dayIndex + 1}/${col.label.slice(1)}`}
                          >
                            {dayIndex + 1}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">Tuần 1-4</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Lưới Nền (Grid Lines) */}
              <div
                className="absolute inset-x-0 pointer-events-none flex"
                style={{
                  width: `${ganttWidth}px`,
                  height: `${chartBodyHeight}px`,
                  top: `${HEADER_HEIGHT}px`
                }}
              >
                {monthColumns.map((col, idx) => (
                  <div
                    key={idx}
                    className="border-r border-slate-200/40 dark:border-slate-800/40 h-full flex-shrink-0"
                    style={{ width: `${col.width}px` }}
                  />
                ))}
              </div>

              {/* KHUNG VẼ THANH GANTT & ĐƯỜNG MŨI TÊN FS BẰNG SVG CHÍNH XÁC */}
              <svg
                width={ganttWidth}
                height={chartBodyHeight}
                className="relative z-0 block"
              >
                <defs>
                  {/* Mũi tên đầu đường phụ thuộc Finish-to-Start */}
                  <marker
                    id="arrowhead-default"
                    markerWidth="10"
                    markerHeight="10"
                    refX="7"
                    refY="5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 5, 0 10" fill="#64748b" className="dark:fill-white" />
                  </marker>
                  <marker
                    id="arrowhead-active"
                    markerWidth="10"
                    markerHeight="10"
                    refX="7"
                    refY="5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 5, 0 10" fill="#ef4444" className="dark:fill-white" />
                  </marker>
                  
                  {/* Gradient cho các thanh bar */}
                  <linearGradient id="grad-sky" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#70172e" />
                    <stop offset="100%" stopColor="#b84b65" />
                  </linearGradient>
                  <linearGradient id="grad-amber" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#936017" />
                    <stop offset="100%" stopColor="#e6b83e" />
                  </linearGradient>
                  <linearGradient id="grad-red" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#b91c1c" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                  <linearGradient id="grad-green" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#15803d" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                  <linearGradient id="grad-slate" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#64748b" />
                    <stop offset="100%" stopColor="#94a3b8" />
                  </linearGradient>
                </defs>

                {/* 1. Vẽ các đường kẻ ngang phân tách từng dòng */}
                {filteredGanttItems.map(item => {
                  const coord = taskCoordinates[item.id];
                  if (!coord || item.isGroup) return null;
                  const rowCellRects = zoomLevel === 'month'
                    ? monthColumns.flatMap((month, monthIndex) => Array.from({ length: month.days }, (_, dayIndex) => ({
                        key: `day-cell-${item.id}-${monthIndex}-${dayIndex}`,
                        x: month.left + dayIndex * pxPerDay,
                        width: pxPerDay
                      })))
                    : monthColumns.flatMap((month, monthIndex) => Array.from({ length: 4 }, (_, weekIndex) => ({
                        key: `week-cell-${item.id}-${monthIndex}-${weekIndex}`,
                        x: month.left + month.width * weekIndex / 4,
                        width: month.width / 4
                      })));
                  return rowCellRects.map(cell => (
                    <rect
                      key={cell.key}
                      x={cell.x}
                      y={coord.rowTop}
                      width={cell.width}
                      height={coord.rowHeight}
                      fill="none"
                      stroke="#cbd5e1"
                      strokeOpacity="0.75"
                      strokeWidth="0.7"
                      shapeRendering="crispEdges"
                      className="dark:stroke-slate-700"
                    />
                  ));
                })}
                {filteredGanttItems.map((_, idx) => (
                  <line
                    key={idx}
                    x1="0"
                    y1={rowOffsets[idx + 1]}
                    x2={ganttWidth}
                    y2={rowOffsets[idx + 1]}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    className="dark:stroke-slate-800/60"
                  />
                ))}

                {/* 2. HIỂN THỊ MŨI TÊN KẺ XUỐNG CÔNG VIỆC TIẾP THEO TRONG DỰ ÁN (FS Dependency) */}
                {dependencyLines.map(line => {
                  const isActive = hoveredDependencyKey === line.key;
                  return (
                    <path
                      key={line.key}
                      d={line.path}
                      fill="none"
                      stroke={isActive ? '#ef4444' : '#64748b'}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={!isActive ? 'dark:stroke-white' : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd={line.type === 'dependency' ? (isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead-default)') : undefined}
                      opacity="0.95"
                      style={{ cursor: 'pointer', transition: 'stroke 0.2s ease, stroke-width 0.2s ease' }}
                      onMouseEnter={() => setHoveredDependencyKey(line.key)}
                      onMouseLeave={() => setHoveredDependencyKey(null)}
                    >
                      <title>{line.type === 'trunk' ? 'Nhánh chung của liên kết FS' : 'Công việc trước → công việc sau (Finish-to-Start)'}</title>
                    </path>
                  );
                })}

                {/* 3. Vẽ các thanh tiến độ Gantt Bar */}
                {filteredGanttItems.map((item) => {
                  const coord = taskCoordinates[item.id];
                  if (!coord) return null;

                  const isGroup = item.isGroup;
                  const isHoliday = item.status === 'holiday';
                  const isDependencyHighlighted = hoveredDependency
                    && (hoveredDependency.sourceId === item.id || hoveredDependency.targetId === item.id);
                  const linkedTask = tasks.find(task => task.ganttId === item.id);
                  const taskHasAssignmentState = hasStoredAssignmentState(linkedTask);
                  const itemAssignees = taskHasAssignmentState
                    ? (Array.isArray(linkedTask.assignees) && linkedTask.assignees.length
                      ? linkedTask.assignees
                      : linkedTask.employeeId || linkedTask.employeeName
                        ? [{
                          employeeId: linkedTask.employeeId || '',
                          employeeName: linkedTask.employeeName || '',
                          startDate: linkedTask.startDate || item.startDate,
                          endDate: linkedTask.endDate || item.endDate
                        }]
                        : [])
                    : item.assignees;
                  const assignee = employees.find(employee =>
                    employee.id === linkedTask?.employeeId ||
                    (!taskHasAssignmentState && employee.name === item.assignee)
                  );
                  // Merge the linked task with its Gantt row so completion timing survives
                  // when one side has not yet received the latest synchronized fields.
                  const progressTask = linkedTask ? { ...item, ...linkedTask } : item;
                  const progress = scheduledProgress(progressTask, assignee?.standardHours || 8, currentTime);
                  const overdue = isTaskOverdue(progressTask, currentTime);
                  const delayHours = Math.max(
                    taskDelayHours(progressTask, currentTime),
                    Number(linkedTask?.delayHours) || 0,
                    Number(item.delayHours) || 0
                  );
                  const completedLate = progressTask.status === 'completed' && (progressTask.speedStatus === 'delayed' || item.speed === 'delayed');
                  const completedEarly = progressTask.status === 'completed' && (progressTask.speedStatus === 'early' || item.speed === 'early');
                  const earlyHours = Math.max(
                    Number(progressTask.earlyHours) || 0,
                    Number(linkedTask?.earlyHours) || 0,
                    Number(item.earlyHours) || 0
                  );
                  const notStarted = progressTask.startDate && progressTask.startDate > todayIsoDate(currentTime);

                  // Keep the bar and progress fill aligned with the task status pill.
                  const statusColor = isHoliday ? '#f59e0b'
                    : progressTask.status === 'completed' ? (completedLate ? '#f59e0b' : '#10b981')
                      : overdue ? '#ef4444'
                        : delayHours > 0 ? '#f59e0b'
                          : notStarted ? '#94a3b8'
                            : '#10b981';
                  const fillColor = isHoliday || (progressTask.status === 'completed' && completedLate) || (!overdue && delayHours > 0)
                    ? 'url(#grad-amber)'
                    : progressTask.status === 'completed'
                      ? 'url(#grad-green)'
                      : overdue
                        ? 'url(#grad-red)'
                        : notStarted
                          ? 'url(#grad-slate)'
                          : 'url(#grad-sky)';
                  const hasAssignments = Array.isArray(itemAssignees) && itemAssignees.length > 0;
                  const hasLegacyAssignee = !taskHasAssignmentState && Boolean(item.assignee);
                  const assignmentLabels = !isGroup && !isHoliday && (hasAssignments || hasLegacyAssignee)
                    ? (hasAssignments
                      ? itemAssignees
                      : [{ employeeName: item.assignee, startDate: item.startDate, endDate: item.endDate }])
                      .map((assignment, index) => {
                        return {
                          key: `${item.id}-${assignment.employeeId || index}`,
                          employeeName: assignment.employeeName || item.assignee,
                          startDate: assignment.startDate || item.startDate,
                          endDate: assignment.endDate || item.endDate,
                          days: inclusiveDays(assignment.startDate || item.startDate, assignment.endDate || item.endDate),
                          hoursPerDay: Number(assignment.estimatedHoursPerDay) || Number(item.estimatedHoursPerDay) || Number(item.estimatedHours) / (Number(item.days) || 1) || 8,
                          y: coord.rowTop + 16 + index * 22
                        };
                      })
                    : [];
                  const overtimeContributions = item.overtimeContributions || [];
                  const overtimeForAssignment = assignment => overtimeContributions.filter(contribution =>
                    (contribution.employeeId && assignment.employeeId === contribution.employeeId) ||
                    (contribution.employeeName || '').trim().toLocaleLowerCase('vi') ===
                      (assignment.employeeName || '').trim().toLocaleLowerCase('vi')
                  );
                  const unassignedOvertime = overtimeContributions.filter(contribution =>
                    !assignmentLabels.some(assignment =>
                      (contribution.employeeId && assignment.employeeId === contribution.employeeId) ||
                      (contribution.employeeName || '').trim().toLocaleLowerCase('vi') ===
                        (assignment.employeeName || '').trim().toLocaleLowerCase('vi')
                    )
                  );

                  return (
                    <g key={item.id} className="cursor-pointer group">
                      
                      {/* Dải ruy băng mờ kéo ngang cho ngày lễ */}
                      {isHoliday && (
                        <rect
                          x={coord.x}
                          y={0}
                          width={coord.width}
                          height={rowsHeight}
                          fill="#fef08a"
                          fillOpacity="0.12"
                        />
                      )}

                      {isHoliday && !isGroup && (
                        <rect
                          x={coord.x}
                          y={coord.y}
                          width={coord.width}
                          height={coord.height}
                          rx="6"
                          ry="6"
                          fill={fillColor}
                          stroke={isDependencyHighlighted ? '#ef4444' : 'transparent'}
                          strokeWidth={isDependencyHighlighted ? 2.4 : 0}
                          className="transition-all hover:opacity-90 shadow-sm"
                          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
                        />
                      )}

                      {!isGroup && !isHoliday && (
                        <>
                          <rect
                            x={coord.x}
                            y={coord.y}
                            width={coord.width}
                            height={coord.height}
                            rx="6"
                            ry="6"
                            fill={fillColor}
                            stroke={isDependencyHighlighted ? '#ef4444' : 'transparent'}
                            strokeWidth={isDependencyHighlighted ? 2.4 : 0}
                            className="transition-all hover:opacity-90 shadow-sm"
                            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
                          />
                          {progress > 0 && (
                            <rect
                              x={coord.x}
                              y={coord.y}
                              width={coord.width * progress / 100}
                              height={coord.height}
                              rx="6"
                              ry="6"
                              fill={statusColor}
                              fillOpacity="1"
                              stroke={isDependencyHighlighted ? '#ef4444' : 'transparent'}
                              strokeWidth={isDependencyHighlighted ? 2.2 : 0}
                              className="pointer-events-none transition-all duration-500"
                            >
                              <title>{`Tiến độ theo thời gian: ${progress}%${overdue ? ' · Quá hạn' : ''}`}</title>
                            </rect>
                          )}
                        </>
                      )}

                      {/* Nhãn trên thanh hoặc cạnh thanh: Tên người đảm nhận, thời gian, tăng ca */}
                      {!isGroup && (
                        <>
                        {assignmentLabels.length === 0 && (
                          <g
                            role="button"
                            tabIndex={0}
                            aria-label={`Giao công việc ${item.title}`}
                            className="select-none"
                            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                            onClick={() => handleAssignmentsOpen(item)}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleAssignmentsOpen(item);
                              }
                            }}
                          >
                            <circle cx={coord.endX + 15} cy={coord.centerY} r="7" fill="none" stroke="#861b36" className="dark:stroke-rose-300" />
                            <path d={`M ${coord.endX + 12} ${coord.centerY} h 6 M ${coord.endX + 15} ${coord.centerY - 3} v 6`} fill="none" stroke="#861b36" strokeWidth="1.5" strokeLinecap="round" className="dark:stroke-rose-300" />
                            <text x={coord.endX + 27} y={coord.centerY + 4} fill="#861b36" fontSize="11" fontWeight="700" className="dark:fill-rose-300">
                              Giao cho
                            </text>
                            <title>Giao công việc cho nhân viên</title>
                          </g>
                        )}
                        {assignmentLabels.map((bar, index) => (
                        <text
                          key={`label-${bar.key}`}
                          x={coord.endX + 8}
                          y={bar.y}
                          fill="#64748b"
                          fontSize="11"
                          fontWeight="600"
                          className="dark:fill-white select-none pointer-events-none"
                        >
                          <tspan fill="#64748b" className="dark:fill-white">
                            {bar.employeeName} ({bar.days} ngày, {bar.hoursPerDay}h/ngày · {formatAssignmentDateRange(bar.startDate, bar.endDate)})
                          </tspan>
                          {overtimeForAssignment(bar).map(contribution => (
                            <tspan key={contribution.employeeId || contribution.employeeName} fill="#d97706" fontWeight="bold">
                              {' '}[+{contribution.hours}h OT]
                            </tspan>
                          ))}
                          {index === 0 && !overtimeContributions.length && item.overtimeHours > 0 && (
                            <tspan fill="#f59e0b" fontWeight="bold"> [+{item.overtimeHours}h OT]</tspan>
                          )}
                          {index === 0 && <>
                          {completedEarly && (
                          <tspan fill="#15803d" fontWeight="bold"> [Hoàn thành sớm · Sớm {formatDelayHours(earlyHours)}]</tspan>
                          )}
                          {overdue && (
                          <tspan fill="#ef4444" fontWeight="bold"> [Quá hạn{delayHours > 0 ? ` · Trễ ${formatDelayHours(delayHours)}` : ''}]</tspan>
                          )}
                          {!overdue && (completedLate || item.speed === 'delayed' || delayHours > 0) && (
                          <tspan fill="#d97706" fontWeight="bold"> [{completedLate ? (delayHours > 0 ? `Hoàn thành muộn · Trễ ${formatDelayHours(delayHours)}` : 'Hoàn thành muộn') : (delayHours > 0 ? `Chậm ${formatDelayHours(delayHours)}` : 'Chậm trễ')}]</tspan>
                          )}
                          {!overdue && progress >= 80 && progressTask.status !== 'completed' && (
                          <tspan fill="#f59e0b" fontWeight="bold"> [Sắp hết hạn]</tspan>
                          )}
                          </>}
                        </text>
                        ))}
                        {unassignedOvertime.map((contribution, contributionIndex) => (
                          <text
                            key={`overtime-${contribution.employeeId || contribution.employeeName}`}
                            x={coord.endX + 8}
                            y={coord.rowTop + 16 + assignmentLabels.length * 22 + contributionIndex * 18}
                            fill="#d97706"
                            fontSize="11"
                            fontWeight="600"
                            className="select-none pointer-events-none"
                          >
                            {contribution.employeeName} [+{contribution.hours}h OT]
                          </text>
                        ))}
                        </>
                      )}

                    </g>
                  );
                })}

              </svg>

            </div>

          </div>
        </div>

      </div>

      {showEditProjectModal && (
        <ModalOverlay>
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Chỉnh thời gian dự án</h3>
              <button type="button" onClick={() => setShowEditProjectModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <form onSubmit={handleProjectDateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Ngày Bắt Đầu</label>
                  <DateInput required value={editProjectForm.startDate} onChange={value => setEditProjectForm(current => ({ ...current, startDate: value, endDate: current.endDate < value ? value : current.endDate }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Ngày Kết Thúc</label>
                  <DateInput required min={editProjectForm.startDate} value={editProjectForm.endDate} onChange={value => setEditProjectForm(current => ({ ...current, endDate: value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <button type="button" onClick={() => setShowEditProjectModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Hủy</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-sky-600 text-xs font-bold text-white">Lưu thời gian dự án</button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {editingItem && (
        <ModalOverlay>
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Chỉnh thời gian công việc</h3>
                <p className="text-xs text-slate-500 mt-1">{editingItem.code} - {editingItem.title}</p>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày bắt đầu
                  <DateInput
                    required
                    value={editForm.startDate}
                    onChange={(value) => updateDateRange(setEditForm, 'startDate', value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày kết thúc
                  <DateInput
                    required
                    value={editForm.endDate}
                    onChange={(value) => updateDateRange(setEditForm, 'endDate', value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Số ngày dự kiến
                <input
                  type="number"
                  min="1"
                  required
                  value={editForm.days}
                  readOnly
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Giờ/ngày dự kiến
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  required
                  value={editForm.estimatedHours}
                  onChange={event => setEditForm(current => ({ ...current, estimatedHours: Number(event.target.value), estimatedHoursEdited: true }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                />
              </label>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setEditingItem(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Hủy</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs">Lưu thay đổi</button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {assignmentEditorItem && (
        <ModalOverlay>
          <div className="w-full max-w-2xl p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Người đảm nhận công việc</h3>
                <p className="text-xs text-slate-500 mt-1">{assignmentEditorItem.code} - {assignmentEditorItem.title}</p>
              </div>
              <button type="button" onClick={() => setAssignmentEditorItem(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleAssignmentsSubmit} className="space-y-3">
              <p className="text-xs text-slate-500">
                Mỗi người có khoảng thời gian đảm nhận riêng; các khoảng thời gian có thể trùng nhau.
              </p>
              {assignmentRows.map((assignment, index) => {
                const availableEmployees = employees.filter(item =>
                  item.id === assignment.employeeId || !assignmentRows.some(row => row.employeeId === item.id)
                );
                return (
                  <div key={`assignment-${index}`} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 items-end">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                          {index === 0 ? 'Người đảm nhận ban đầu' : `Người đảm nhận ${index + 1}`}
                        </label>
                        <EmployeeCombobox
                          employees={availableEmployees}
                          value={assignment.employeeId}
                          onChange={selectedEmployee => setAssignmentRows(current => current.map((row, rowIndex) =>
                            rowIndex === index
                              ? {
                                ...row,
                                employeeId: selectedEmployee.id,
                                estimatedHoursPerDay: Number(selectedEmployee.standardHours) || Number(row.estimatedHoursPerDay) || 8
                              }
                              : row
                          ))}
                          placeholder="Giao cho"
                        />
                      </div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Giờ dự kiến / ngày
                        <input
                          type="number"
                          required
                          min="0.25"
                          step="0.25"
                          value={assignment.estimatedHoursPerDay}
                          onChange={event => setAssignmentRows(current => current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, estimatedHoursPerDay: event.target.value } : row
                          ))}
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setAssignmentRows(current => current.filter((_, rowIndex) => rowIndex !== index))}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        aria-label={`Xóa người đảm nhận ${index + 1}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Ngày bắt đầu
                        <DateInput
                          required
                          min={assignmentEditorItem.startDate}
                          max={assignmentEditorItem.endDate}
                          value={assignment.startDate}
                          onChange={value => setAssignmentRows(current => current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, startDate: value, endDate: row.endDate < value ? value : row.endDate } : row
                          ))}
                          className="mt-1 w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Ngày kết thúc
                        <DateInput
                          required
                          min={assignmentEditorItem.startDate}
                          max={assignmentEditorItem.endDate}
                          value={assignment.endDate}
                          onChange={value => setAssignmentRows(current => current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, endDate: value, startDate: row.startDate > value ? value : row.startDate } : row
                          ))}
                          className="mt-1 w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
              {assignmentRows.length === 0 && (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Chưa giao cho nhân viên nào.
                </p>
              )}

              <button
                type="button"
                disabled={assignmentRows.length >= employees.length}
                onClick={() => {
                  setAssignmentRows(current => [...current, {
                    employeeId: '',
                    startDate: assignmentEditorItem.startDate,
                    endDate: assignmentEditorItem.endDate,
                    estimatedHoursPerDay: 8
                  }]);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-sky-200 dark:border-sky-800 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                Thêm người đảm nhận
              </button>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setAssignmentEditorItem(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Hủy</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs">Lưu phân công</button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {showAddGroupModal && (
        <ModalOverlay>
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                <Layers className="h-5 w-5 text-sky-600" />
                Tạo mục công việc mới
              </h3>
              <button
                type="button"
                onClick={() => setShowAddGroupModal(false)}
                aria-label="Đóng"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleGroupSubmit} className="space-y-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tên mục công việc *
                <input
                  autoFocus
                  required
                  type="text"
                  maxLength={120}
                  value={groupForm.title}
                  onChange={event => setGroupForm(current => ({ ...current, title: event.target.value }))}
                  placeholder="Nhập tên mục công việc"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Dự án *
                <select
                  required
                  value={groupForm.projectId}
                  onChange={event => setGroupForm(current => ({ ...current, projectId: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sau khi tạo, bạn có thể thêm công việc vào mục này và thu gọn hoặc mở rộng danh sách công việc.
              </p>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddGroupModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-sky-500"
                >
                  Tạo mục công việc
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {editingGroup && (
        <ModalOverlay>
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                <Layers className="h-5 w-5 text-sky-600" />
                Chỉnh sửa mục công việc
              </h3>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                aria-label="Đóng"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleGroupEditSubmit} className="space-y-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tên mục công việc *
                <input
                  autoFocus
                  required
                  type="text"
                  maxLength={120}
                  value={groupEditTitle}
                  onChange={event => setGroupEditTitle(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingGroup(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-sky-500"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 1: THÊM CÔNG VIỆC VÀO DỰ ÁN */}
      {showAddTaskModal && (
        <ModalOverlay>
          <div className="w-full max-w-xl p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-sky-600" />
                Thêm Công Việc Mới Vào Tiến Độ Dự Án
              </h3>
              <button
                onClick={() => setShowAddTaskModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTaskSubmit} className="space-y-3.5">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Mã STT (VD: A1.3, B6)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="A1.3"
                    value={taskForm.code}
                    onChange={(e) => setTaskForm({ ...taskForm, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Người Đảm Nhận
                  </label>
                  <EmployeeCombobox
                    employees={employees}
                    value={taskForm.assigneeId}
                    onChange={employee => setTaskForm(current => ({ ...current, assigneeId: employee.id }))}
                    placeholder="Giao cho"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Tên Công Việc *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Kiểm tra tính toán tải trọng kết cấu móng"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                />
              </div>

              <div className="w-full">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Dự Án
                  </label>
                  <select
                    required
                    value={taskForm.projectId}
                    onChange={(e) => {
                      const project = projects.find(item => item.id === e.target.value);
                      const clampToProject = date => project?.startDate && date < project.startDate
                        ? project.startDate
                        : project?.endDate && date > project.endDate ? project.endDate : date;
                      const startDate = clampToProject(taskForm.startDate);
                      let endDate = clampToProject(taskForm.endDate);
                      if (endDate < startDate) endDate = startDate;
                      setTaskForm(current => ({ ...current, projectId: e.target.value, parentGroupId: '', dependencies: [], successorId: '', startDate, endDate, days: inclusiveDays(startDate, endDate), estimatedHours: current.estimatedHoursEdited ? current.estimatedHours : 8 }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Mục công việc
                </label>
                <select
                  value={taskForm.parentGroupId}
                  onChange={event => setTaskForm(current => ({ ...current, parentGroupId: event.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="">-- Không thuộc mục nào --</option>
                  {ganttItems
                    .filter(item => item.isGroup && projectIdForItem(item) === taskForm.projectId)
                    .map(group => (
                      <option key={group.id} value={group.id}>{group.title}</option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Công Việc Trước (Mũi tên liên kết FS)
                  </label>
                  <select
                    onChange={(e) => {
                      const val = e.target.value;
                      setTaskForm(current => ({
                        ...current,
                        dependencies: val ? [val] : [],
                        successorId: current.successorId === val ? '' : current.successorId
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="">-- Không có liên kết FS --</option>
                    {ganttItems.filter(g => !g.isGroup && projectIdForItem(g) === taskForm.projectId).map(g => (
                      <option key={g.id} value={g.id}>[{g.code}] {g.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Công Việc Sau (Mũi tên liên kết FS)
                  </label>
                  <select
                    value={taskForm.successorId}
                    onChange={(e) => setTaskForm(current => ({ ...current, successorId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="">-- Tự động nối tới công việc bên dưới gần nhất --</option>
                    {ganttItems
                      .filter(g => !g.isGroup && projectIdForItem(g) === taskForm.projectId && g.id !== taskForm.dependencies[0])
                      .map(g => (
                        <option key={g.id} value={g.id}>[{g.code}] {g.title}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="h-5 whitespace-nowrap text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ngày Bắt Đầu
                  </label>
                  <DateInput
                    required
                    value={taskForm.startDate}
                    onChange={(value) => updateDateRange(setTaskForm, 'startDate', value)}
                    min={projects.find(project => project.id === taskForm.projectId)?.startDate}
                    max={projects.find(project => project.id === taskForm.projectId)?.endDate}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div>
                  <label className="h-5 whitespace-nowrap text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ngày Kết Thúc
                  </label>
                  <DateInput
                    required
                    value={taskForm.endDate}
                    onChange={(value) => updateDateRange(setTaskForm, 'endDate', value)}
                    min={projects.find(project => project.id === taskForm.projectId)?.startDate}
                    max={projects.find(project => project.id === taskForm.projectId)?.endDate}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div>
                  <label className="h-5 whitespace-nowrap text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Số Ngày (d)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={taskForm.days}
                    readOnly
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="h-5 whitespace-nowrap text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Giờ/ngày dự kiến
                  </label>
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    required
                    value={taskForm.estimatedHours}
                    onChange={(e) => setTaskForm({ ...taskForm, estimatedHours: Number(e.target.value), estimatedHoursEdited: true })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-600/20"
                >
                  Lưu Vào Tiến Độ Gantt
                </button>
              </div>

            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 2: TẠO DỰ ÁN MỚI */}
      {showAddProjectModal && (
        <ModalOverlay>
          <div className="w-full max-w-lg p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-sky-600" />
                Khởi Tạo Dự Án Xây Dựng Mới (APS)
              </h3>
              <button
                onClick={() => setShowAddProjectModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProjectSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Tên Dự Án Xây Dựng *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: DỰ ÁN XÂY DỰNG TRUNG TÂM CÔNG NGHỆ APS HÀ NỘI"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Mã Dự Án
                  </label>
                  <input
                    type="text"
                    placeholder="APS-2026-03"
                    value={projectForm.code}
                    onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>

                <div className="relative">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Địa Điểm
                  </label>
                  <input
                    type="text"
                    placeholder="Tìm tỉnh hoặc thành phố"
                    value={projectForm.location}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={locationSuggestionsOpen && matchingLocations.length > 0}
                    aria-controls="project-location-options"
                    onFocus={() => {
                      setLocationSearch('');
                      setLocationSuggestionsOpen(true);
                    }}
                    onChange={(e) => {
                      setLocationSearch(e.target.value);
                      setProjectForm({ ...projectForm, location: e.target.value });
                      setLocationSuggestionsOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setLocationSuggestionsOpen(false);
                      if (e.key === 'Enter' && locationSuggestionsOpen && matchingLocations.length > 0) {
                        e.preventDefault();
                        setProjectForm({ ...projectForm, location: matchingLocations[0] });
                        setLocationSearch('');
                        setLocationSuggestionsOpen(false);
                      }
                    }}
                    onBlur={() => setTimeout(() => {
                      setLocationSearch('');
                      setLocationSuggestionsOpen(false);
                    }, 120)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                  {locationSuggestionsOpen && matchingLocations.length > 0 && (
                    <ul
                      id="project-location-options"
                      role="listbox"
                      className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                    >
                      {matchingLocations.map(location => (
                        <li key={location} role="option" aria-selected={projectForm.location === location}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setProjectForm({ ...projectForm, location });
                              setLocationSearch('');
                              setLocationSuggestionsOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-sky-50 hover:text-sky-700 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-sky-300"
                          >
                            {location}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Ngày Bắt Đầu *</label>
                  <DateInput
                    required
                    value={projectForm.startDate}
                    onChange={(value) => setProjectForm(current => ({ ...current, startDate: value, endDate: current.endDate < value ? value : current.endDate }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Ngày Kết Thúc *</label>
                  <DateInput
                    required
                    value={projectForm.endDate}
                    min={projectForm.startDate}
                    onChange={(value) => setProjectForm(current => ({ ...current, endDate: value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-600/20"
                >
                  Tạo Dự Án
                </button>
              </div>

            </form>
          </div>
        </ModalOverlay>
      )}

    </div>
  );
}
