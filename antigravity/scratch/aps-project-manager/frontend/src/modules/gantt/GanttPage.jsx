import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import ModalOverlay from '../../components/layout/ModalOverlay';
import DateInput from '../../components/DateInput';
import EmployeeCombobox from '../../components/EmployeeCombobox';
import {
  calculateGroupPlannedPersonDays,
  calculatePlannedPersonDays,
  GanttEditableWorkCell,
  inferGanttGroupHierarchy,
  getGroupDescendantTasks
} from './GanttWorkColumns';
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
  SlidersHorizontal,
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

const formatCreatedAt = (...values) => {
  let createdAt = values.find(value => value && Number.isFinite(new Date(value).getTime()));
  if (!createdAt) {
    const id = values.find(value => typeof value === 'string' && /(?:proj-|G-|task-)\d{13}$/.test(value));
    const timestamp = id?.match(/(?:proj-|G-|task-)(\d{13})$/)?.[1];
    if (timestamp) createdAt = Number(timestamp);
  }
  if (!createdAt) return '—';
  const date = new Date(createdAt);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
};

const hasStoredAssignmentState = task => Boolean(task && (
  Array.isArray(task.assignees) ||
  Object.hasOwn(task, 'employeeId') ||
  Object.hasOwn(task, 'employeeName')
));

const orderByDependencies = items => {
  const itemIds = new Set(items.map(item => item.id));
  const itemById = new Map(items.map(item => [item.id, item]));
  const indegrees = new Map(items.map(item => [item.id, 0]));
  const successors = new Map(items.map(item => [item.id, []]));

  items.forEach(item => {
    [...new Set(Array.isArray(item.dependencies) ? item.dependencies : [])]
      .filter(predecessorId => itemIds.has(predecessorId) && predecessorId !== item.id)
      .forEach(predecessorId => {
        indegrees.set(item.id, indegrees.get(item.id) + 1);
        successors.get(predecessorId).push(item.id);
      });
  });

  const ordered = [];
  const remaining = new Set(items.map(item => item.id));
  while (remaining.size) {
    // Keep existing order whenever dependencies do not require a different position.
    const next = items.find(item => remaining.has(item.id) && indegrees.get(item.id) === 0)
      || itemById.get(remaining.values().next().value);
    ordered.push(next);
    remaining.delete(next.id);
    successors.get(next.id).forEach(successorId => {
      if (remaining.has(successorId)) indegrees.set(successorId, indegrees.get(successorId) - 1);
    });
  }
  return ordered;
};

const GANTT_TABLE_MAX_WIDTH = 1208;
const GANTT_TABLE_MIN_WIDTH = 120;
const GANTT_COLUMNS = [
  { key: 'code', label: 'STT', width: 56 },
  { key: 'title', label: 'CÔNG VIỆC TRONG DỰ ÁN', width: 220, alignLeft: true },
  { key: 'startDate', label: 'BẮT ĐẦU', width: 76 },
  { key: 'endDate', label: 'KẾT THÚC', width: 76 },
  { key: 'days', label: 'NGÀY', width: 72 },
  { key: 'createdAt', label: 'NGÀY TẠO', width: 96 },
  { key: 'duration', label: 'THỜI GIAN', width: 88 },
  { key: 'contractWork', label: 'CÔNG HĐ', width: 72 },
  { key: 'actualWork', label: 'CÔNG TT', width: 72 },
  { key: 'note', label: 'GHI CHÚ', width: 180 },
  { key: 'status', label: 'TRẠNG THÁI', width: 96 },
  { key: 'actions', label: 'THAO TÁC', width: 104 }
];

const GANTT_PHASE_PRESETS = [
  { code: 'A', title: 'A. THIẾT KẾ XÂY DỰNG', color: '#2563eb' },
  { code: 'B', title: 'B. XIN PHÉP / PHÁP LÍ', color: '#dc2626' },
  { code: 'C', title: 'C. THẦU THI CÔNG', color: '#16a34a' },
  { code: 'L', title: 'L. NGHỈ LỄ VIỆT NAM', color: '#eab308' }
];

const flattenWorkGroups = (items, collapsedGroupIds) => {
  const hierarchyItems = inferGanttGroupHierarchy(items);

  const childrenByParent = new Map();
  hierarchyItems.filter(item => !item.isProjectHeader).forEach(item => {
    const parentId = item.parentGroupId || '';
    const children = childrenByParent.get(parentId) || [];
    children.push(item);
    childrenByParent.set(parentId, children);
  });

  const descendantsOf = (group, visited = new Set()) => {
    if (visited.has(group.id)) return [];
    const nextVisited = new Set(visited).add(group.id);
    const descendants = [];
    (childrenByParent.get(group.id) || []).forEach(child => {
      if (child.isGroup) descendants.push(...descendantsOf(child, nextVisited));
      else descendants.push(child);
    });
    return descendants;
  };

  const orderSiblings = siblings => {
    const ownerByTaskId = new Map();
    siblings.forEach(sibling => {
      const descendantTasks = sibling.isGroup ? descendantsOf(sibling) : [sibling];
      descendantTasks.forEach(task => ownerByTaskId.set(task.id, sibling.id));
    });
    const dependencyRows = siblings.map(sibling => {
      const descendantTasks = sibling.isGroup ? descendantsOf(sibling) : [sibling];
      return {
        id: sibling.id,
        dependencies: [...new Set(descendantTasks.flatMap(task =>
          (Array.isArray(task.dependencies) ? task.dependencies : [])
            .map(dependencyId => ownerByTaskId.get(dependencyId))
            .filter(ownerId => ownerId && ownerId !== sibling.id)
        ))]
      };
    });
    const orderedIds = orderByDependencies(dependencyRows).map(item => item.id);
    const siblingById = new Map(siblings.map(item => [item.id, item]));
    return orderedIds.map(id => siblingById.get(id));
  };

  const visibleRows = hierarchyItems.filter(item => item.isProjectHeader);
  const appendSiblings = siblings => {
    orderSiblings(siblings).forEach(item => {
      visibleRows.push(item);
      if (item.isGroup && !collapsedGroupIds.has(item.id)) {
        appendSiblings(childrenByParent.get(item.id) || []);
      }
    });
  };
  appendSiblings(childrenByParent.get('') || []);
  return visibleRows;
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
  const [leftPanelWidth, setLeftPanelWidth] = useState(GANTT_TABLE_MAX_WIDTH);
  const leftPanelResizeRef = useRef(null);
  const [columnFilterOpen, setColumnFilterOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => Object.fromEntries(GANTT_COLUMNS.map(column => [column.key, true])));
  const columnFilterRef = useRef(null);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState(() => new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(() => new Set());
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false);
  const createMenuRef = useRef(null);
  const phaseMenuRef = useRef(null);
  const groupMenuRef = useRef(null);

  useEffect(() => {
    if (!columnFilterOpen) return undefined;
    const closeOnOutsideClick = event => {
      if (!columnFilterRef.current?.contains(event.target)) setColumnFilterOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setColumnFilterOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [columnFilterOpen]);

  const startLeftPanelResize = event => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    leftPanelResizeRef.current = { pointerX: event.clientX, width: leftPanelWidth };
  };
  const resizeLeftPanel = event => {
    const resizeStart = leftPanelResizeRef.current;
    if (!resizeStart) return;
    setLeftPanelWidth(Math.min(GANTT_TABLE_MAX_WIDTH, Math.max(GANTT_TABLE_MIN_WIDTH, resizeStart.width + event.clientX - resizeStart.pointerX)));
  };
  const stopLeftPanelResize = event => {
    leftPanelResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

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
  const [showPhaseDateModal, setShowPhaseDateModal] = useState(false);
  const [phaseDateForm, setPhaseDateForm] = useState({ phase: null, projectId: '', itemId: '', startDate: today, endDate: today });
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupEditForm, setGroupEditForm] = useState({ title: '', startDate: '', endDate: '' });
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

  useEffect(() => {
    const closeOnOutsideClick = event => {
      if (!phaseMenuRef.current?.contains(event.target)) setPhaseMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setPhaseMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
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
  const [groupForm, setGroupForm] = useState({ title: '', projectId: projects[0]?.id || '', parentGroupId: '', startDate: today, endDate: today });

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
  const hierarchyGanttItems = useMemo(() => inferGanttGroupHierarchy(ganttItems), [ganttItems]);
  const phaseColorForGroup = item => {
    const groupsById = new Map(ganttItems.filter(entry => entry.isGroup).map(entry => [entry.id, entry]));
    let current = item;
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const phase = GANTT_PHASE_PRESETS.find(preset => preset.title === current.title);
      if (phase) return phase.color;
      current = current.parentGroupId ? groupsById.get(current.parentGroupId) : null;
    }

    const subsectionCode = String(item.title || '').match(/^\s*([A-Z]\d+)\s*[. ]/i)?.[1]?.toUpperCase();
    if (!subsectionCode) return item.color || '#64748b';
    const phase = ganttItems.find(candidate =>
      candidate.isGroup && projectIdForItem(candidate) === projectIdForItem(item) &&
      String(candidate.title || '').match(/^\s*([A-Z])\s*\./i)?.[1]?.toUpperCase() === subsectionCode[0]
    );
    return GANTT_PHASE_PRESETS.find(preset => preset.title === phase?.title)?.color || item.color || '#64748b';
  };
  const groupDepthForItem = item => {
    const groupsById = new Map(ganttItems.filter(entry => entry.isGroup).map(entry => [entry.id, entry]));
    let parentGroupId = item.parentGroupId;
    let depth = 0;
    const seen = new Set();
    while (parentGroupId && !seen.has(parentGroupId)) {
      seen.add(parentGroupId);
      const parent = groupsById.get(parentGroupId);
      if (!parent) break;
      depth += 1;
      parentGroupId = parent.parentGroupId;
    }
    return depth;
  };

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

  // Keep a complete hierarchy for aggregate bars and dependency routing even when rows are collapsed.
  const dependencyRows = useMemo(() => {
    const projectItems = selectedProjectId === 'ALL'
      ? ganttItems
      : ganttItems.filter(item => projectIdForItem(item) === selectedProjectId);
    if (selectedProjectId !== 'ALL') {
      return flattenWorkGroups(projectItems, new Set());
    }
    return projects.flatMap(project => flattenWorkGroups(
      projectItems.filter(item => projectIdForItem(item) === project.id),
      new Set()
    ));
  }, [ganttItems, tasks, projects, selectedProjectId]);

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
  const GROUP_ROW_HEIGHT = 36;
  const HEADER_HEIGHT = zoomLevel === 'month' ? 72 : 52;
  const BAR_HEIGHT = 24;
  const visibleTableWidth = GANTT_COLUMNS.reduce((width, column) => width + (visibleColumns[column.key] ? column.width : 0), 0);
  const LEFT_PANEL_WIDTH = Math.min(leftPanelWidth, Math.max(56, visibleTableWidth));
  const rowHeights = filteredGanttItems.map(item => {
    if (item.isProjectHeader) return 36;
    if (item.isGroup) return GROUP_ROW_HEIGHT;
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
      const aggregateTasks = item.isGroup && collapsedGroupIds.has(item.id)
        ? getGroupDescendantTasks(item.id, hierarchyGanttItems)
        : null;
      const dateTasks = aggregateTasks?.length ? aggregateTasks : null;
      const startDate = dateTasks
        ? dateTasks.map(task => task.startDate).filter(Boolean).sort()[0]
        : item.startDate;
      const endDate = dateTasks
        ? dateTasks.map(task => task.endDate).filter(Boolean).sort().at(-1)
        : item.endDate;
      const sDate = new Date(`${startDate}T00:00:00`);
      const eDate = new Date(`${endDate}T00:00:00`);
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
        item,
        isAggregate: Boolean(dateTasks),
        aggregateTasks: dateTasks || []
      };
    });
    return coords;
  }, [filteredGanttItems, timelineStart, totalTimelineDays, pxPerDay, rowHeights, rowOffsets, hierarchyGanttItems, collapsedGroupIds]);

  // Tạo đường cong mũi tên phụ thuộc Finish-to-Start (FS) - TỰ ĐỘNG NỐI TỪ TASK TRƯỚC XUỐNG
  const dependencyLines = useMemo(() => {
    const edges = new Map();
    const visibleRepresentative = itemId => {
      if (taskCoordinates[itemId]) return itemId;
      let item = hierarchyGanttItems.find(candidate => candidate.id === itemId);
      const groupsById = new Map(hierarchyGanttItems.filter(candidate => candidate.isGroup).map(group => [group.id, group]));
      const seen = new Set();
      while (item?.parentGroupId && !seen.has(item.parentGroupId)) {
        const parentId = item.parentGroupId;
        seen.add(parentId);
        if (collapsedGroupIds.has(parentId) && taskCoordinates[parentId]) return parentId;
        item = groupsById.get(parentId);
      }
      return null;
    };
    dependencyRows.forEach((item, toIndex) => {
      if (item.isProjectHeader) return;
      let deps = Array.isArray(item.dependencies) ? [...item.dependencies] : [];

      // Nếu là công việc con và chưa có liên kết, tự động nối từ công việc đứng ngay trước đó
      if (deps.length === 0 && !item.isGroup && toIndex > 0) {
        for (let p = toIndex - 1; p >= 0; p--) {
          const candidate = dependencyRows[p];
          if (candidate && !candidate.isProjectHeader && !candidate.isGroup && candidate.projectId === item.projectId) {
            deps = [candidate.id];
            break;
          }
        }
      }

      [...new Set(deps)].filter(depId => depId !== item.id).forEach((depId) => {
        const sourceId = visibleRepresentative(depId);
        const targetId = visibleRepresentative(item.id);
        if (!sourceId || !targetId || sourceId === targetId) return;
        const from = taskCoordinates[sourceId];
        const to = taskCoordinates[targetId];
        if (!from || !to) return;
        const key = `${sourceId}->${targetId}`;
        edges.set(key, { key, from, to, sourceId, targetId });
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
  }, [dependencyRows, hierarchyGanttItems, collapsedGroupIds, taskCoordinates]);

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
    const startDate = groupForm.startDate || project.startDate || todayIsoDate();
    const endDate = groupForm.endDate || startDate;
    if (endDate < startDate) return;
    const success = await addGanttItem({
      code: `GR${codeIndex}`,
      projectId: project.id,
      title,
      isGroup: true,
      parentGroupId: groupForm.parentGroupId,
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
      setGroupForm({ title: '', projectId: project.id, parentGroupId: groupForm.parentGroupId, startDate, endDate });
      setShowAddGroupModal(false);
    }
  };

  const openGroupEdit = item => {
    setGroupEditForm({ title: item.title, startDate: item.startDate || '', endDate: item.endDate || '' });
    setEditingGroup(item);
    setGroupMenuOpenId(null);
  };

  const handleGroupEditSubmit = async event => {
    event.preventDefault();
    const title = groupEditForm.title.trim();
    if (!editingGroup || !title || !groupEditForm.startDate || !groupEditForm.endDate || groupEditForm.endDate < groupEditForm.startDate) return;
    if (await updateGanttItem(editingGroup.id, {
      title,
      startDate: groupEditForm.startDate,
      endDate: groupEditForm.endDate
    })) setEditingGroup(null);
  };
  const editingGroupParent = editingGroup?.parentGroupId
    ? hierarchyGanttItems.find(item => item.id === editingGroup.parentGroupId)
    : null;
  const editingGroupProject = editingGroup
    ? projects.find(project => project.id === projectIdForItem(editingGroup))
    : null;

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
    const project = projects.find(item => item.id === projectId);
    const startDate = project?.startDate || todayIsoDate();
    const phaseGroup = ganttItems.find(item =>
      item.isGroup && projectIdForItem(item) === projectId && GANTT_PHASE_PRESETS.some(phase => phase.title === item.title)
    );
    setGroupForm({ title: '', projectId: projectId || '', parentGroupId: phaseGroup?.id || '', startDate, endDate: project?.endDate || startDate });
    setCreateMenuOpen(false);
    setShowAddGroupModal(true);
  };

  const openPhaseDateForm = phase => {
    const projectId = selectedProjectId === 'ALL' ? projects[0]?.id : selectedProjectId;
    const project = projects.find(item => item.id === projectId);
    if (!project) return;

    setPhaseMenuOpen(false);
    const existingGroup = ganttItems.find(item =>
      item.isGroup && projectIdForItem(item) === project.id && item.title === phase.title
    );
    const startDate = existingGroup?.startDate || project.startDate || todayIsoDate();
    const endDate = existingGroup?.endDate || project.endDate || startDate;
    setPhaseDateForm({
      phase,
      projectId: project.id,
      itemId: existingGroup?.id || '',
      startDate,
      endDate: endDate < startDate ? startDate : endDate
    });
    setShowPhaseDateModal(true);
  };

  const handlePhaseDateSubmit = async event => {
    event.preventDefault();
    const { phase, projectId, itemId, startDate, endDate } = phaseDateForm;
    const project = projects.find(item => item.id === projectId);
    if (!phase || !project || !startDate || !endDate || endDate < startDate) return;

    if (itemId) {
      if (await updateGanttItem(itemId, { startDate, endDate })) {
        setSelectedProjectId(project.id);
        setCollapsedProjectIds(current => {
          const next = new Set(current);
          next.delete(project.id);
          return next;
        });
        setCollapsedGroupIds(current => {
          const next = new Set(current);
          next.delete(itemId);
          return next;
        });
        setShowPhaseDateModal(false);
      }
      return;
    }

    let codeIndex = 1;
    while (ganttItems.some(item => item.code === `GR${codeIndex}`)) codeIndex += 1;
    const projectItems = ganttItems.filter(item => projectIdForItem(item) === project.id);
    const lastProjectItem = projectItems.at(-1);
    const success = await addGanttItem({
      code: `GR${codeIndex}`,
      projectId: project.id,
      title: phase.title,
      isGroup: true,
      unit: 'GR',
      startDate,
      endDate,
      estimatedHoursPerDay: 8,
      assignee: '',
      notes: '',
      color: phase.color,
      dependencies: [],
      insertAfterId: lastProjectItem?.id || ''
    });
    if (success) setShowPhaseDateModal(false);
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
    if (!editForm.startDate || !editForm.endDate || editForm.endDate < editForm.startDate) {
      window.alert('Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.');
      return;
    }
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

          <div className="relative" ref={phaseMenuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={phaseMenuOpen}
              disabled={projects.length === 0}
              onClick={() => setPhaseMenuOpen(open => !open)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Giai đoạn</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {phaseMenuOpen && (
              <div role="menu" className="absolute left-0 top-full z-[100] mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {GANTT_PHASE_PRESETS.map(phase => (
                  <button
                    key={phase.code}
                    type="button"
                    role="menuitem"
                    onClick={() => openPhaseDateForm(phase)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: phase.color }} />
                    <span>{phase.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Thu phóng & Nút thêm */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Lọc giai đoạn */}
          {/* Thu phóng (Zoom Level) */}
          <div className="relative" ref={columnFilterRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={columnFilterOpen}
              onClick={() => setColumnFilterOpen(open => !open)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Bộ lọc</span>
            </button>
            {columnFilterOpen && (
              <div role="menu" className="absolute right-0 top-full z-[110] mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-1 flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Hiển thị cột</span>
                  <button
                    type="button"
                    onClick={() => setVisibleColumns(Object.fromEntries(GANTT_COLUMNS.map(column => [column.key, true])))}
                    className="text-[10px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                  >
                    Hiện tất cả
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {GANTT_COLUMNS.map(column => (
                    <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={visibleColumns[column.key]}
                        onChange={event => setVisibleColumns(current => ({ ...current, [column.key]: event.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

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
            <div
              className="relative flex-shrink-0 sticky left-0 z-40 overflow-hidden bg-white dark:bg-slate-900 border-r-2 border-slate-300 dark:border-slate-700 shadow-md"
              style={{ width: `${LEFT_PANEL_WIDTH}px`, minWidth: `${LEFT_PANEL_WIDTH}px`, maxWidth: `${LEFT_PANEL_WIDTH}px` }}
            >
              <div
                role="separator"
                aria-label="Thay đổi độ rộng bảng"
                aria-orientation="vertical"
                aria-valuemin={GANTT_TABLE_MIN_WIDTH}
                aria-valuemax={GANTT_TABLE_MAX_WIDTH}
                aria-valuenow={LEFT_PANEL_WIDTH}
                tabIndex={0}
                className="absolute right-0 top-0 z-[70] h-full w-2 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-sky-500/30 focus-visible:bg-sky-500/30"
                onPointerDown={startLeftPanelResize}
                onPointerMove={resizeLeftPanel}
                onPointerUp={stopLeftPanelResize}
                onPointerCancel={stopLeftPanelResize}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft') setLeftPanelWidth(width => Math.max(GANTT_TABLE_MIN_WIDTH, width - 16));
                  if (event.key === 'ArrowRight') setLeftPanelWidth(width => Math.min(GANTT_TABLE_MAX_WIDTH, width + 16));
                }}
              />
              
              {/* Header Bảng Bên Trái - Khóa cứng 52px */}
              <div
                className="sticky top-0 z-50 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider box-border"
                style={{ height: `${HEADER_HEIGHT}px`, minHeight: `${HEADER_HEIGHT}px`, maxHeight: `${HEADER_HEIGHT}px` }}
              >
                {GANTT_COLUMNS.filter(column => visibleColumns[column.key]).map(column => (
                  <div
                    key={column.key}
                    className={`flex h-full shrink-0 items-center border-r border-slate-200 px-1 text-center leading-none dark:border-slate-700 ${column.alignLeft ? 'justify-start px-3' : 'justify-center'} ${column.key === 'createdAt' || ['contractWork', 'actualWork', 'note'].includes(column.key) ? 'text-[10px]' : ''}`}
                    style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                  >
                    <span className={column.alignLeft ? 'truncate whitespace-nowrap' : ''}>{column.label}</span>
                  </div>
                ))}
              </div>

              {/* Danh Sách Các Hàng Công Việc (Khóa cứng 44px mỗi dòng) */}
              <div style={{ minHeight: `${chartBodyHeight}px` }}>
                {filteredGanttItems.map((item, itemIndex) => {
                  const isGroup = item.isGroup;
                  const isHoliday = item.status === 'holiday';
                  if (item.isProjectHeader) {
                    const project = projects.find(candidate => candidate.id === item.projectId);
                    const projectContractRow = { ...item, contractWork: project?.contractWork };
                    const projectPlannedPersonDays = hierarchyGanttItems
                      .filter(ganttItem => projectIdForItem(ganttItem) === item.projectId && !ganttItem.isGroup && ganttItem.status !== 'holiday')
                      .reduce((total, ganttItem) => total + calculatePlannedPersonDays(ganttItem), 0);
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
                        {visibleColumns.code && <div className="w-14 min-w-[56px] h-full flex items-center justify-center border-r border-sky-100 dark:border-slate-700">
                          {!visibleColumns.title && <button type="button" onClick={() => toggleProjectCollapsed(item.projectId)} className="rounded p-0.5 text-slate-500 hover:bg-sky-100 dark:hover:bg-slate-700">{collapsedProjectIds.has(item.projectId) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>}
                        </div>}
                        {visibleColumns.title && <div className="w-[220px] min-w-[220px] max-w-[220px] h-full px-3 flex items-center gap-2 border-r border-sky-100 dark:border-slate-700 truncate">
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
                        </div>}
                        {visibleColumns.startDate && <div className="w-[76px] min-w-[76px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatDateVi(project?.startDate) || '-'}</div>}
                        {visibleColumns.endDate && <div className="w-[76px] min-w-[76px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatDateVi(project?.endDate) || '-'}</div>}
                        {visibleColumns.days && <div className="w-[72px] min-w-[72px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">{totalProjectDays} ngày</div>}
                        {visibleColumns.createdAt && <div className="w-[96px] min-w-[96px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[10px] text-slate-500" title={formatCreatedAt(project?.createdAt, project?.id)}>{formatCreatedAt(project?.createdAt, project?.id)}</div>}
                        {visibleColumns.duration && <div className="w-[88px] min-w-[88px] h-full px-1 flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{totalProjectHours.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h</div>}
                        {visibleColumns.contractWork && <div className="w-[72px] min-w-[72px] h-full flex items-center justify-center border-r border-sky-100 dark:border-slate-700">
                          <GanttEditableWorkCell item={projectContractRow} field="contractWork" type="number" onSave={(_, data) => updateProject(project.id, data)} />
                        </div>}
                        {visibleColumns.actualWork && <div className="w-[72px] min-w-[72px] h-full flex items-center justify-center border-r border-sky-100 dark:border-slate-700 text-[11px] font-bold">
                          {projectPlannedPersonDays || '\u2014'}
                        </div>}
                        {visibleColumns.note && <div className="w-[180px] min-w-[180px] h-full border-r border-sky-100 dark:border-slate-700" />}
                        {visibleColumns.status && <div className="w-24 min-w-[96px] h-full border-r border-sky-100 dark:border-slate-700" />}
                        {visibleColumns.actions && <div className="w-[104px] min-w-[104px] h-full" />}
                      </div>
                    );
                  }

                  if (isGroup) {
                    const phaseColor = phaseColorForGroup(item);
                    const groupLabelWidth = (visibleColumns.code ? 56 : 0) + (visibleColumns.title ? 220 : 0);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center border-b border-slate-100 bg-slate-50/80 text-[13px] font-bold text-slate-900 dark:border-slate-800/80 dark:bg-slate-800/80 dark:text-white"
                        style={{
                          height: `${rowHeights[itemIndex]}px`,
                          minHeight: `${rowHeights[itemIndex]}px`,
                          boxShadow: `inset 4px 0 0 ${phaseColor}`,
                          backgroundColor: `${phaseColor}14`,
                          color: phaseColor
                        }}
                      >
                        {groupLabelWidth > 0 && <div
                          className="flex h-full shrink-0 items-center gap-1.5 border-r border-slate-200/70 pr-3 dark:border-slate-700/70"
                          style={{ width: `${groupLabelWidth}px`, minWidth: `${groupLabelWidth}px`, maxWidth: `${groupLabelWidth}px`, paddingLeft: `${visibleColumns.code ? 12 + groupDepthForItem(item) * 16 : 8}px` }}
                        >
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
                          {visibleColumns.title && <span className="min-w-0 truncate" title={item.title}>{item.title}</span>}
                        </div>}
                        {visibleColumns.startDate && <div className="flex h-full w-[76px] min-w-[76px] items-center justify-center border-r border-slate-200/70 px-1 text-[11px] font-semibold dark:border-slate-700/70">
                          {formatDateVi(item.startDate) || '—'}
                        </div>}
                        {visibleColumns.endDate && <div className="flex h-full w-[76px] min-w-[76px] items-center justify-center border-r border-slate-200/70 px-1 text-[11px] font-semibold dark:border-slate-700/70">
                          {formatDateVi(item.endDate) || '—'}
                        </div>}
                        {visibleColumns.days && <div className="flex h-full w-[72px] min-w-[72px] items-center justify-center border-r border-slate-200/70 px-1 text-[11px] font-bold dark:border-slate-700/70">
                          {inclusiveDays(item.startDate, item.endDate)}
                        </div>}
                        {visibleColumns.createdAt && <div className="flex h-full w-[96px] min-w-[96px] items-center justify-center border-r border-slate-200/70 px-1 text-[10px] text-slate-500 dark:border-slate-700/70" title={formatCreatedAt(item.createdAt, item.id)}>{formatCreatedAt(item.createdAt, item.id)}</div>}
                        {visibleColumns.duration && <div className="h-full w-[88px] min-w-[88px] border-r border-slate-200/70 dark:border-slate-700/70" />}
                        {visibleColumns.contractWork && <div className="flex h-full w-[72px] min-w-[72px] items-center justify-center border-r border-slate-200/70 dark:border-slate-700/70">
                          <GanttEditableWorkCell item={item} field="contractWork" type="number" onSave={updateGanttItem} />
                        </div>}
                        {visibleColumns.actualWork && <div className="flex h-full w-[72px] min-w-[72px] items-center justify-center border-r border-slate-200/70 text-[11px] font-semibold dark:border-slate-700/70">
                          {calculateGroupPlannedPersonDays(item.id, hierarchyGanttItems) || '\u2014'}
                        </div>}
                        {visibleColumns.note && <div className="h-full w-[180px] min-w-[180px] border-r border-slate-200/70 dark:border-slate-700/70" />}
                        {visibleColumns.status && <div className="h-full w-24 min-w-[96px] border-r border-slate-200/70 dark:border-slate-700/70" />}
                        {visibleColumns.actions && <div className="relative flex h-full w-[104px] min-w-[104px] items-center justify-center" ref={groupMenuOpenId === item.id ? groupMenuRef : null}>
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
                        </div>}
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
                      {visibleColumns.code && <div className="w-14 min-w-[56px] text-center py-1 px-1 font-mono font-semibold border-r border-slate-100 dark:border-slate-800 truncate shrink-0">
                        {item.code}
                      </div>}

                      {/* Cột Tên Công Việc (Có thụt dòng theo cấp WBS) */}
                      {visibleColumns.title && <div
                        className="w-[220px] min-w-[220px] max-w-[220px] h-full min-h-0 px-3 border-r border-slate-100 dark:border-slate-800 overflow-hidden whitespace-nowrap flex items-center gap-1.5 shrink-0"
                        style={{ paddingLeft: `${isGroup ? 12 + groupDepthForItem(item) * 16 : 4 + Math.max(0, groupDepthForItem(item) - 1) * 6}px` }}
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
                      </div>}

                      {/* Cột Bắt Đầu */}
                      {visibleColumns.startDate && <div className="w-[76px] min-w-[76px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">
                        {formatDateVi(item.startDate) || '-'}
                      </div>}

                      {/* Cột Kết Thúc */}
                      {visibleColumns.endDate && <div className="w-[76px] min-w-[76px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">
                        {formatDateVi(item.endDate) || '-'}
                      </div>}

                      {/* Cột Ngày (Duration) */}
                      {visibleColumns.days && <div className="w-[72px] min-w-[72px] text-center py-1 px-1 font-bold text-[11px] border-r border-slate-100 dark:border-slate-800 shrink-0">
                        {item.days}
                      </div>}

                      {visibleColumns.createdAt && <div className="w-[96px] min-w-[96px] text-center py-1 px-1 text-[10px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0" title={formatCreatedAt(item.createdAt, rowTask.createdAt, item.id, rowTask.id)}>
                        {formatCreatedAt(item.createdAt, rowTask.createdAt, item.id, rowTask.id)}
                      </div>}

                      {visibleColumns.duration && <div className="w-[88px] min-w-[88px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">{item.isGroup || isHoliday ? '—' : `${(Number(rowTask.estimatedHours) || (Number(rowTask.estimatedHoursPerDay) || 8) * (Number(rowTask.estimatedDays) || Number(item.days) || 1)).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h`}</div>}
                      {visibleColumns.contractWork && <div className="w-[72px] min-w-[72px] text-center py-1 px-1 border-r border-slate-100 dark:border-slate-800 shrink-0">
                        {!isHoliday && <GanttEditableWorkCell item={item} field="contractWork" type="number" placeholder={'\u2014'} onSave={updateGanttItem} />}
                      </div>}
                      {visibleColumns.actualWork && <div className="w-[72px] min-w-[72px] flex items-center justify-center py-1 px-1 text-[11px] font-semibold border-r border-slate-100 dark:border-slate-800 shrink-0" title="C?ng s? ng?y giao cho t?ng ng??i">
                        {(!isHoliday && calculatePlannedPersonDays(item)) || '\u2014'}
                      </div>}
                      {visibleColumns.note && <div className="w-[180px] min-w-[180px] flex items-center py-1 px-1 border-r border-slate-100 dark:border-slate-800 shrink-0">
                        {!isHoliday && <GanttEditableWorkCell item={item} field="ganttNote" onSave={updateGanttItem} placeholder={'Ghi ch\u00fa...'} />}
                      </div>}
                      {visibleColumns.status && <div className="w-24 min-w-[96px] text-center py-1 px-1 border-r border-slate-100 dark:border-slate-800 shrink-0">
                        {rowStatus && <span className={`inline-flex max-w-full min-w-0 px-1.5 py-1 rounded-full text-center text-[9px] font-bold whitespace-normal break-words leading-tight ${rowStatus.style}`}>{rowStatus.label}</span>}
                      </div>}

                      {/* Cột Thao Tác */}
                      {visibleColumns.actions && <div className="w-[104px] min-w-[104px] flex items-center justify-center gap-0.5 py-1 px-1 shrink-0">
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
                      </div>}

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

                  if (item.isGroup) {
                    if (!coord.isAggregate) return null;
                    const clipId = `aggregate-bar-clip-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                    const aggregateStart = new Date(`${coord.aggregateTasks.map(task => task.startDate).filter(Boolean).sort()[0]}T00:00:00`);
                    const aggregateEnd = new Date(`${coord.aggregateTasks.map(task => task.endDate).filter(Boolean).sort().at(-1)}T00:00:00`);
                    const aggregateStartOffset = (aggregateStart - timelineStart) / 86400000;
                    const aggregateEndOffset = (aggregateEnd - timelineStart) / 86400000 + 1;
                    return (
                      <g key={`aggregate-${item.id}`} className="pointer-events-auto">
                        <defs>
                          <clipPath id={clipId}>
                            <rect x={coord.x} y={coord.y} width={coord.width} height={coord.height} rx="6" ry="6" />
                          </clipPath>
                        </defs>
                        <rect
                          x={coord.x}
                          y={coord.y}
                          width={coord.width}
                          height={coord.height}
                          rx="6"
                          ry="6"
                          fill="url(#grad-slate)"
                          opacity="0.88"
                          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
                        >
                          <title>{`${coord.aggregateTasks.length} công việc · ${formatDateVi(aggregateStart.toISOString().slice(0, 10))} – ${formatDateVi(aggregateEnd.toISOString().slice(0, 10))}`}</title>
                        </rect>
                        <g clipPath={`url(#${clipId})`}>
                          {coord.aggregateTasks.map(child => {
                            if (!child.startDate || !child.endDate) return null;
                            const linkedChildTask = tasks.find(task => task.ganttId === child.id);
                            const progressTask = linkedChildTask ? { ...child, ...linkedChildTask } : child;
                            const childAssignee = employees.find(employee =>
                              employee.id === linkedChildTask?.employeeId ||
                              (!hasStoredAssignmentState(linkedChildTask) && employee.name === child.assignee)
                            );
                            const progress = scheduledProgress(progressTask, childAssignee?.standardHours || 8, currentTime);
                            if (progress <= 0) return null;
                            const childStart = new Date(`${child.startDate}T00:00:00`);
                            const childEnd = new Date(`${child.endDate}T00:00:00`);
                            if (!Number.isFinite(childStart.getTime()) || !Number.isFinite(childEnd.getTime())) return null;
                            const childStartOffset = Math.max(aggregateStartOffset, (childStart - timelineStart) / 86400000, 0);
                            const childEndOffset = Math.min(aggregateEndOffset, (childEnd - timelineStart) / 86400000 + 1, totalTimelineDays);
                            const childX = childStartOffset * pxPerDay;
                            const childWidth = Math.max(0, (childEndOffset - childStartOffset) * pxPerDay);
                            if (!childWidth) return null;
                            const overdue = isTaskOverdue(progressTask, currentTime);
                            const delayHours = Math.max(taskDelayHours(progressTask, currentTime), Number(linkedChildTask?.delayHours) || 0, Number(child.delayHours) || 0);
                            const completedLate = progressTask.status === 'completed' && (progressTask.speedStatus === 'delayed' || child.speed === 'delayed');
                            const completedEarly = progressTask.status === 'completed' && (progressTask.speedStatus === 'early' || child.speed === 'early');
                            const notStarted = progressTask.startDate && progressTask.startDate > todayIsoDate(currentTime);
                            const progressColor = progressTask.status === 'completed'
                              ? (completedLate ? '#e6b83e' : completedEarly ? '#10b981' : '#22c55e')
                              : overdue ? '#ef4444' : delayHours > 0 ? '#e6b83e' : notStarted ? '#94a3b8' : '#38bdf8';
                            return (
                              <rect
                                key={`progress-${child.id}`}
                                x={childX}
                                y={coord.y}
                                width={Math.max(0, childWidth * progress / 100)}
                                height={coord.height}
                                fill={progressColor}
                                opacity="0.98"
                                className="pointer-events-none"
                              >
                                <title>{`${child.title}: ${progress}%`}</title>
                              </rect>
                            );
                          })}
                        </g>
                      </g>
                    );
                  }

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
                    onChange={value => setEditForm(current => {
                      const next = { ...current, startDate: value };
                      next.days = inclusiveDays(next.startDate, next.endDate);
                      return next;
                    })}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày kết thúc
                  <DateInput
                    required
                    value={editForm.endDate}
                    onChange={value => setEditForm(current => {
                      const next = { ...current, endDate: value };
                      next.days = inclusiveDays(next.startDate, next.endDate);
                      return next;
                    })}
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

      {showPhaseDateModal && (
        <ModalOverlay>
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Thiết lập thời gian giai đoạn</h3>
                <p className="mt-1 text-xs font-semibold" style={{ color: phaseDateForm.phase?.color }}>
                  {phaseDateForm.phase?.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPhaseDateModal(false)}
                aria-label="Đóng"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handlePhaseDateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày bắt đầu *
                  <DateInput
                    required
                    min={projects.find(project => project.id === phaseDateForm.projectId)?.startDate}
                    max={projects.find(project => project.id === phaseDateForm.projectId)?.endDate}
                    value={phaseDateForm.startDate}
                    onChange={value => setPhaseDateForm(current => ({
                      ...current,
                      startDate: value,
                      endDate: current.endDate < value ? value : current.endDate
                    }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày kết thúc *
                  <DateInput
                    required
                    min={phaseDateForm.startDate || projects.find(project => project.id === phaseDateForm.projectId)?.startDate}
                    max={projects.find(project => project.id === phaseDateForm.projectId)?.endDate}
                    value={phaseDateForm.endDate}
                    onChange={value => setPhaseDateForm(current => ({ ...current, endDate: value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Tổng thời gian: </span>
                <strong className="text-slate-900 dark:text-white">
                  {inclusiveDays(phaseDateForm.startDate, phaseDateForm.endDate)} ngày
                </strong>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPhaseDateModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!phaseDateForm.startDate || !phaseDateForm.endDate || phaseDateForm.endDate < phaseDateForm.startDate}
                  className="rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: phaseDateForm.phase?.color || '#2563eb' }}
                >
                  {phaseDateForm.itemId ? 'Lưu thời gian' : 'Thêm giai đoạn'}
                </button>
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
                  onChange={event => {
                    const project = projects.find(item => item.id === event.target.value);
                    const startDate = project?.startDate || todayIsoDate();
                    const phaseGroup = ganttItems.find(item =>
                      item.isGroup && projectIdForItem(item) === event.target.value && GANTT_PHASE_PRESETS.some(phase => phase.title === item.title)
                    );
                    setGroupForm(current => ({
                      ...current,
                      projectId: event.target.value,
                      parentGroupId: phaseGroup?.id || '',
                      startDate,
                      endDate: project?.endDate || startDate
                    }));
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Thuộc giai đoạn
                <select
                  value={groupForm.parentGroupId}
                  onChange={event => setGroupForm(current => ({ ...current, parentGroupId: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">-- Mục gốc dự án --</option>
                  {ganttItems
                    .filter(item => item.isGroup && projectIdForItem(item) === groupForm.projectId && GANTT_PHASE_PRESETS.some(phase => phase.title === item.title))
                    .map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày bắt đầu *
                  <DateInput
                    required
                    min={projects.find(project => project.id === groupForm.projectId)?.startDate}
                    max={projects.find(project => project.id === groupForm.projectId)?.endDate}
                    value={groupForm.startDate}
                    onChange={value => setGroupForm(current => ({
                      ...current,
                      startDate: value,
                      endDate: current.endDate < value ? value : current.endDate
                    }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày kết thúc *
                  <DateInput
                    required
                    min={groupForm.startDate || projects.find(project => project.id === groupForm.projectId)?.startDate}
                    max={projects.find(project => project.id === groupForm.projectId)?.endDate}
                    value={groupForm.endDate}
                    onChange={value => setGroupForm(current => ({ ...current, endDate: value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Tổng thời gian: </span>
                <strong className="text-slate-900 dark:text-white">
                  {inclusiveDays(groupForm.startDate, groupForm.endDate)} ngày
                </strong>
              </div>
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
                  value={groupEditForm.title}
                  onChange={event => setGroupEditForm(current => ({ ...current, title: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày bắt đầu *
                  <DateInput
                    required
                    min={editingGroupParent?.startDate || editingGroupProject?.startDate}
                    max={groupEditForm.endDate || editingGroupParent?.endDate || editingGroupProject?.endDate}
                    value={groupEditForm.startDate}
                    onChange={value => setGroupEditForm(current => ({
                      ...current,
                      startDate: value,
                      endDate: current.endDate < value ? value : current.endDate
                    }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày kết thúc *
                  <DateInput
                    required
                    min={groupEditForm.startDate || editingGroupParent?.startDate || editingGroupProject?.startDate}
                    max={editingGroupParent?.endDate || editingGroupProject?.endDate}
                    value={groupEditForm.endDate}
                    onChange={value => setGroupEditForm(current => ({ ...current, endDate: value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Tổng thời gian: </span>
                <strong className="text-slate-900 dark:text-white">{inclusiveDays(groupEditForm.startDate, groupEditForm.endDate)} ngày</strong>
              </div>
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
                    onChange={employee => setTaskForm(current => ({ ...current, assigneeId: employee?.id || '' }))}
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
                      <option key={group.id} value={group.id}>{group.parentGroupId ? `↳ ${group.title}` : group.title}</option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Công Việc Trước (Mũi tên liên kết FS)
                  </label>
                  <select
                    value={taskForm.dependencies[0] || ''}
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
                    <option value="">
                      {taskForm.dependencies[0]
                        ? '-- Bỏ trống để thêm task ở cuối dự án --'
                        : '-- Tự động nối theo thứ tự hiện tại --'}
                    </option>
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
