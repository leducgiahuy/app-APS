import ProjectWizard from '../operations/ProjectWizard';
import { deliveryView, maskDeliveryFinance, ownsDeliveryTask } from '../../utils/deliveryView';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useProjectDelivery } from './useProjectDelivery';
import DeliveryRow, { DELIVERY_COLUMNS, COMPACT_KEYS, DATE_KEYS } from './DeliveryRow';
import DeliveryDrawer from './DeliveryDrawer';
import DeliveryResources from './DeliveryResources';
import DeliveryGuide from './DeliveryGuide';
import DeliveryChartOverlay from './DeliveryChartOverlay';
import { deliveryApi } from './deliveryApi';
import { DELIVERY_ROLES, moneyAccess, managingRole, formatCompactMoney } from '../../utils/deliveryMetrics';
import './DeliveryPage.css';
import GanttRowGrid from './GanttRowGrid';
import GanttCalendarBackground from './GanttCalendarBackground';
import { calendarColumns } from '../../utils/vietnamCalendar';
import { assignmentCalendarConflicts, assignmentWorkingDates } from '../../utils/assignmentCalendar';
import GanttExcludedDaysBar from './GanttExcludedDaysBar';
import AssignmentCalendarConfirmation from './AssignmentCalendarConfirmation';
import { useApp } from '../../context/AppContext';
import ModalOverlay from '../../components/layout/ModalOverlay';
import SearchableSelect from '../../components/SearchableSelect';
import DateInput from '../../components/DateInput';
import EmployeeCombobox from '../../components/EmployeeCombobox';
import {
  inferGanttGroupHierarchy,
  getGroupDescendantTasks
} from './GanttWorkColumns';
import { formatDateVi, inclusiveDays, scheduledProgress, isTaskOverdue, taskDelayHours, todayIsoDate } from '../../utils/date';
import {
  CalendarRange,
  Plus,
  Trash2,
  Building,
  Layers,
  ChevronDown,
  Pencil,
  UserPlus,
  SlidersHorizontal,
  X
} from 'lucide-react';

// Danh sách 64 đơn vị cấp tỉnh theo yêu cầu (giai đoạn 2004–2008).

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

const GANTT_TABLE_MIN_WIDTH = 120;
const GANTT_PHASE_PRESETS = [
  { code: 'A', title: 'A. THIẾT KẾ XÂY DỰNG', color: '#2563eb' },
  { code: 'B', title: 'B. XIN PHÉP / PHÁP LÍ', color: '#dc2626' },
  { code: 'C', title: 'C. THẦU THI CÔNG', color: '#16a34a' },
  { code: 'L', title: 'L. NGHỈ LỄ VIỆT NAM', color: '#eab308' }
];

const flattenWorkGroups = (items, collapsedGroupIds, collapsedTaskIds = new Set()) => {
  const hierarchyItems = inferGanttGroupHierarchy(items);
  const groupsByParent = new Map();
  const tasksByParent = new Map();
  hierarchyItems.filter(item => !item.isProjectHeader).forEach(item => {
    if (item.parentTaskId && !item.isGroup) {
      const children = tasksByParent.get(item.parentTaskId) || [];
      children.push(item);
      tasksByParent.set(item.parentTaskId, children);
      return;
    }
    const parentId = item.parentGroupId || '';
    const children = groupsByParent.get(parentId) || [];
    children.push(item);
    groupsByParent.set(parentId, children);
  });

  const descendantLeaves = (item, visited = new Set()) => {
    if (!item || visited.has(item.id)) return [];
    const nextVisited = new Set(visited).add(item.id);
    const children = item.isGroup ? groupsByParent.get(item.id) || [] : tasksByParent.get(item.id) || [];
    return children.length ? children.flatMap(child => descendantLeaves(child, nextVisited)) : [item];
  };

  const orderSiblings = siblings => {
    const ownerByTaskId = new Map();
    siblings.forEach(sibling => {
      const descendantTasks = descendantLeaves(sibling);
      descendantTasks.forEach(task => ownerByTaskId.set(task.id, sibling.id));
    });
    const dependencyRows = siblings.map(sibling => {
      const descendantTasks = descendantLeaves(sibling);
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
  const appendTasks = siblings => {
    orderSiblings(siblings).forEach(item => {
      const children = tasksByParent.get(item.id) || [];
      visibleRows.push({ ...item, hasTaskChildren: children.length > 0 });
      if (children.length && !collapsedTaskIds.has(item.id)) appendTasks(children);
    });
  };
  const appendSiblings = siblings => {
    orderSiblings(siblings).forEach(item => {
      if (!item.isGroup) {
        appendTasks([item]);
        return;
      }
      visibleRows.push(item);
      if (!collapsedGroupIds.has(item.id)) appendSiblings(groupsByParent.get(item.id) || []);
    });
  };
  appendSiblings(groupsByParent.get('') || []);
  return visibleRows;
};

const getTaskLeafDescendants = (parentId, items) => {
  const childrenByParent = new Map();
  items.filter(item => !item.isGroup && item.parentTaskId).forEach(item => {
    const children = childrenByParent.get(item.parentTaskId) || [];
    children.push(item);
    childrenByParent.set(item.parentTaskId, children);
  });
  const leaves = [];
  const visit = currentParentId => (childrenByParent.get(currentParentId) || []).forEach(child => {
    const children = childrenByParent.get(child.id) || [];
    if (children.length) visit(child.id);
    else leaves.push(child);
  });
  visit(parentId);
  return leaves;
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
    updateProject,
    deleteProject,
    updateGanttItem,
    refreshAllData
  } = useApp();

  // Chọn dự án đang xem
  const [reportLink] = useState(() => { try { const link = JSON.parse(sessionStorage.getItem('aps_report_link') || 'null'); return projects.some(project => project.id === link?.projectId) ? link : null; } catch { return null; } });
  useEffect(() => { sessionStorage.removeItem('aps_report_link'); }, []);
  const [selectedProjectId, setSelectedProjectId] = useState(reportLink?.projectId || projects[0]?.id || 'proj-1');
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => DELIVERY_COLUMNS.filter(column => COMPACT_KEYS.includes(column.key)).reduce((sum, column) => sum + column.width, 0));
  const delivery = useProjectDelivery(selectedProjectId, refreshAllData);
  const [deliveryTab, setDeliveryTab] = useState(['gantt', 'legal', 'changes', 'close'].includes(reportLink?.tab) ? reportLink.tab : 'gantt');
  const [tableMode, setTableMode] = useState('compact');
  const [deliveryColumns, setDeliveryColumns] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('aps_delivery_columns_v1')); return Array.isArray(saved) ? [...new Set([...COMPACT_KEYS, ...saved.map(key => key === 'duration' ? 'contractWork' : key).filter(key => DELIVERY_COLUMNS.some(column => column.key === key))])] : COMPACT_KEYS; } catch { return COMPACT_KEYS; }
  });
  const [detailItemId, setDetailItemId] = useState(null);
  const pendingDetail = useRef(reportLink?.taskId ? { id: reportLink.taskId, section: '' } : null);
  const [detailSection, setDetailSection] = useState('');
  const [department, setDepartment] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [warningOnly, setWarningOnly] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [previewEmail, setPreviewEmail] = useState('');
  const [deliveryUsers, setDeliveryUsers] = useState([]);
  const [projectTemplates, setProjectTemplates] = useState([]);
  
  const previewUser = deliveryUsers.find(user => user.email === previewEmail);
  const previewing = Boolean(previewUser && previewUser.email !== delivery.data?.viewer.email);
  const deliveryData = useMemo(() => {
    if (!delivery.data) return null;
    if (!previewing) return delivery.data;
    const financial = moneyAccess(previewUser.role);
    return { ...(financial ? delivery.data : maskDeliveryFinance(delivery.data)), viewer: previewUser, permissions: { financial, manage: managingRole(previewUser.role), users: false } };
  }, [delivery.data, previewUser, previewing]);
  const roleView = deliveryView(deliveryData?.viewer.role);
  const canManageStructure = Boolean(deliveryData?.permissions.manage);
  useEffect(() => { if (deliveryData?.viewer) setOnlyMine(roleView.ownByDefault); }, [deliveryData?.viewer.email, deliveryData?.viewer.role, selectedProjectId]);
  const currentColumns = DELIVERY_COLUMNS.filter(column => deliveryColumns.includes(column.key) && (!column.financial || deliveryData?.permissions.financial));
  const maxLeftPanelWidth = Math.max(GANTT_TABLE_MIN_WIDTH, currentColumns.reduce((sum, column) => sum + column.width, 0));
  const columnsSignature = currentColumns.map(column => column.key).join(',');
  useEffect(() => { setLeftPanelWidth(currentColumns.reduce((sum, column) => sum + column.width, 0)); }, [columnsSignature]);
  const departments = [...new Set([...employees.map(employee => employee.team), ...Object.values(deliveryData?.records || {}).map(record => record.department)].filter(Boolean))];
  useEffect(() => { localStorage.setItem('aps_delivery_columns_v1', JSON.stringify(deliveryColumns)); }, [deliveryColumns]);
  useEffect(() => { setDetailItemId(pendingDetail.current?.id || null); setDetailSection(pendingDetail.current?.section || ''); pendingDetail.current = null; setDepartment(''); setWarningOnly(false); }, [selectedProjectId]);
  useEffect(() => {
    if (!delivery.data) return;
    deliveryApi.templates().then(result => setProjectTemplates(result.data)).catch(() => {});
    if (delivery.data.permissions.users) deliveryApi.users().then(result => setDeliveryUsers(result.data)).catch(() => {});
  }, [delivery.data?.viewer.email, delivery.data?.permissions.users]);
  const setPreset = mode => { setTableMode(mode); setDeliveryColumns(mode === 'compact' ? COMPACT_KEYS : mode === 'dates' ? DATE_KEYS : DELIVERY_COLUMNS.map(column => column.key)); setLeftPanelWidth(DELIVERY_COLUMNS.filter(column => (mode === 'compact' ? COMPACT_KEYS : mode === 'dates' ? DATE_KEYS : DELIVERY_COLUMNS.map(entry => entry.key)).includes(column.key)).reduce((sum, column) => sum + column.width, 0)); };
  const openDetail = (item, section = '') => { const projectId = item.projectId || tasks.find(task => task.ganttId === item.id)?.projectId; if (selectedProjectId === 'ALL' && projectId) { pendingDetail.current = { id: item.id, section }; setSelectedProjectId(projectId); } else { setDetailItemId(item.id); setDetailSection(section); } };
  const leftPanelResizeRef = useRef(null);
  const [columnFilterOpen, setColumnFilterOpen] = useState(false);
  const columnFilterRef = useRef(null);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState(() => new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(() => new Set());
  const [collapsedTaskIds, setCollapsedTaskIds] = useState(() => new Set());
  const [quickCreateContext, setQuickCreateContext] = useState(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false);
  const createMenuRef = useRef(null);
  const phaseMenuRef = useRef(null);
  const groupMenuRef = useRef(null);
  const groupMenuPanelRef = useRef(null);

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
    setLeftPanelWidth(Math.min(maxLeftPanelWidth, Math.max(GANTT_TABLE_MIN_WIDTH, resizeStart.width + event.clientX - resizeStart.pointerX)));
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

  const toggleTaskCollapsed = taskId => {
    setCollapsedTaskIds(current => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // Chế độ thu phóng (Zoom: 'day' | 'week' | 'month')
  const [zoomLevel, setZoomLevel] = useState('month');

  // Trạng thái modal
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showPhaseDateModal, setShowPhaseDateModal] = useState(false);
  const [phaseDateForm, setPhaseDateForm] = useState({ phase: null, projectId: '', itemId: '', startDate: today, endDate: today });
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupEditForm, setGroupEditForm] = useState({ title: '', startDate: '', endDate: '' });
  const [groupMenuOpenId, setGroupMenuOpenId] = useState(null);
  const [groupCreateContext, setGroupCreateContext] = useState(null);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [assignmentEditorItem, setAssignmentEditorItem] = useState(null);
  const [assignmentSubmission, setAssignmentSubmission] = useState({ dueAt: '', recipient: '' });
  const [newSubmission, setNewSubmission] = useState({ dueAt: '', recipient: '' });
  const [assignmentRows, setAssignmentRows] = useState([]);
  const [assignmentCalendarPrompt, setAssignmentCalendarPrompt] = useState(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [hoveredDependencyKey, setHoveredDependencyKey] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', startDate: '', endDate: '', days: 1, estimatedHours: 8, estimatedHoursEdited: true });
  const timelineScrollRef = useRef(null);
  const headingScrollRef = useRef(null);
  const horizontalScrollRef = useRef(null);
  const pageScrollRef = useRef(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [chartViewportWidth, setChartViewportWidth] = useState(0);
  useEffect(() => {
    const body = timelineScrollRef.current;
    const heading = headingScrollRef.current;
    const scrollbar = horizontalScrollRef.current;
    if (!body || !heading || !scrollbar) return;
    let frame = null;
    let mirroredScrollLeft = scrollbar.scrollLeft;
    const sync = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        // Read the latest body position; programmatic scrollbar events do not feed back.
        heading.scrollLeft = body.scrollLeft;
        if (Math.abs(scrollbar.scrollLeft - body.scrollLeft) > 1) {
          scrollbar.scrollLeft = body.scrollLeft;
          mirroredScrollLeft = scrollbar.scrollLeft;
        }
      });
    };
    const dragScrollbar = () => {
      if (Math.abs(scrollbar.scrollLeft - mirroredScrollLeft) <= 1) return;
      mirroredScrollLeft = scrollbar.scrollLeft;
      if (Math.abs(body.scrollLeft - scrollbar.scrollLeft) > 1) body.scrollLeft = scrollbar.scrollLeft;
      sync();
    };
    const measure = () => {
      setChartViewportWidth(body.clientWidth);
      scrollbar.firstElementChild.style.width = `${body.scrollWidth}px`;
      sync();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    body.addEventListener('scroll', sync, { passive: true });
    scrollbar.addEventListener('scroll', dragScrollbar, { passive: true });
    measure();
    return () => {
      body.removeEventListener('scroll', sync);
      scrollbar.removeEventListener('scroll', dragScrollbar);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [deliveryTab]);
  useEffect(() => {
    const element = pageScrollRef.current;
    if (!element) return;
    const measure = () => setScrollbarWidth(element.offsetWidth - element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    [...element.children].forEach(child => observer.observe(child));
    measure();
    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('gantt-no-page-scroll');
    return () => root.classList.remove('gantt-no-page-scroll');
  }, []);
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
    parentGroupId: '',
    parentTaskId: ''
  });
  const [groupForm, setGroupForm] = useState({ title: '', projectId: projects[0]?.id || '', parentGroupId: '', startDate: today, endDate: today });

  const projectIdForItem = (item) => item.projectId || tasks.find(task => task.ganttId === item.id)?.projectId;
  const ganttOptionSearchText = item => {
    const names = [item.code, item.title, item.phase];
    const seen = new Set([item.id]);
    let parentId = hierarchyGanttItems.find(candidate => candidate.id === item.id)?.parentGroupId || item.parentGroupId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = hierarchyGanttItems.find(candidate => candidate.id === parentId);
      if (!parent) break;
      names.push(parent.code, parent.title);
      parentId = parent.parentGroupId;
    }
    return names.filter(Boolean).join(' ');
  };
  const hierarchyGanttItems = useMemo(() => inferGanttGroupHierarchy(ganttItems), [ganttItems]);
  const phaseColorForGroup = item => {
    const groupsById = new Map(hierarchyGanttItems.filter(entry => entry.isGroup).map(entry => [entry.id, entry]));
    const seen = new Set();
    let current = groupsById.get(item.id) || item;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const phase = GANTT_PHASE_PRESETS.find(preset => preset.title === current.title);
      if (phase) return phase.color;
      current = current.parentGroupId ? groupsById.get(current.parentGroupId) : null;
    }
    const subsectionCode = String(item.title || '').match(/^\s*([A-Z]\d+)\s*[. ]/i)?.[1]?.toUpperCase();
    if (!subsectionCode) return item.color || '#64748b';
    const phase = hierarchyGanttItems.find(candidate => candidate.isGroup && projectIdForItem(candidate) === projectIdForItem(item) && String(candidate.title || '').match(/^\s*([A-Z])\s*\./i)?.[1]?.toUpperCase() === subsectionCode[0]);
    return GANTT_PHASE_PRESETS.find(preset => preset.title === phase?.title)?.color || item.color || '#64748b';
  };
  const groupDepthForItem = item => {
    const groupsById = new Map(hierarchyGanttItems.map(entry => [entry.id, entry]));
    let parentGroupId = item.parentTaskId || item.parentGroupId;
    let depth = 0;
    const seen = new Set();
    while (parentGroupId && !seen.has(parentGroupId)) {
      seen.add(parentGroupId);
      const parent = groupsById.get(parentGroupId);
      if (!parent) break;
      depth += 1;
      parentGroupId = parent.parentTaskId || parent.parentGroupId;
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
      if (!groupMenuRef.current?.contains(event.target) && !groupMenuPanelRef.current?.contains(event.target)) setGroupMenuOpenId(null);
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

  const [editProjectForm, setEditProjectForm] = useState({ name: '', startDate: '', endDate: '' });

  // Lọc theo dự án trước khi tính timeline và vẽ các thanh Gantt.
  const filteredGanttItems = useMemo(() => {
    let projectItems = selectedProjectId === 'ALL'
      ? ganttItems
      : ganttItems.filter(g => projectIdForItem(g) === selectedProjectId);

    if (department || onlyMine || warningOnly) {
      const hierarchy = inferGanttGroupHierarchy(projectItems);
      const included = new Set(hierarchy.filter(item => !item.isGroup &&
        (!onlyMine || ownsDeliveryTask(deliveryData?.viewer, item)) &&
        (!department || deliveryData?.records?.[item.id]?.department === department || item.assignees?.some(assignment => employees.find(employee => employee.id === assignment.employeeId)?.team === department)) &&
        (!warningOnly || deliveryData?.taskMetrics?.[item.id]?.alert.warning)
      ).map(item => item.id));
      for (const id of [...included]) { let current = hierarchy.find(item => item.id === id); const seen = new Set(); while (current && !seen.has(current.id)) { seen.add(current.id); included.add(current.id); current = hierarchy.find(item => item.id === (current.parentTaskId || current.parentGroupId)); } }
      projectItems = projectItems.filter(item => included.has(item.id));
    }
    const withBands = rows => rows;

    if (selectedProjectId !== 'ALL') {
      const project = projects.find(item => item.id === selectedProjectId);
      if (!project) return projectItems;
      return withBands([
        { ...project, id: `project-heading-${project.id}`, projectId: project.id, title: project.name, startDate: project.startDate, endDate: project.endDate, days: project.startDate && project.endDate ? inclusiveDays(project.startDate, project.endDate) : undefined, isProjectHeader: true },
        ...(collapsedProjectIds.has(project.id) ? [] : flattenWorkGroups(projectItems, collapsedGroupIds, collapsedTaskIds))
      ]);
    }

    return withBands(projects.flatMap(project => {
      const items = projectItems.filter(item => projectIdForItem(item) === project.id);
      if (items.length === 0) return [];
      return [
        { ...project, id: `project-heading-${project.id}`, projectId: project.id, title: project.name, startDate: project.startDate, endDate: project.endDate, days: project.startDate && project.endDate ? inclusiveDays(project.startDate, project.endDate) : undefined, isProjectHeader: true },
        ...(collapsedProjectIds.has(project.id) ? [] : flattenWorkGroups(items, collapsedGroupIds, collapsedTaskIds))
      ];
    }));
  }, [ganttItems, tasks, projects, selectedProjectId, collapsedProjectIds, collapsedGroupIds, collapsedTaskIds, department, onlyMine, warningOnly, deliveryData, employees]);

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
    if (zoomLevel === 'week') return 4.5;
    return 10;
  }, [zoomLevel]);

  // Tổng số ngày trong timeline
  const totalTimelineDays = useMemo(() => {
    const startUtc = Date.UTC(timelineStart.getFullYear(), timelineStart.getMonth(), timelineStart.getDate());
    const endUtc = Date.UTC(timelineEnd.getFullYear(), timelineEnd.getMonth(), timelineEnd.getDate());
    return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
  }, [timelineStart, timelineEnd]);

  // Danh sách các cột tháng (T11/26, T12/26, T1/27, T2/27, T3/27, T4/27, T5/27, T6/27, T7/27)
  const calendarDays = useMemo(() => calendarColumns(timelineStart, totalTimelineDays), [timelineStart, totalTimelineDays]);

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
  const ROW_HEIGHT = 34;
  const GROUP_ROW_HEIGHT = 30;
  const HEADER_HEIGHT = 48;
  const BAR_HEIGHT = 12;
  const visibleTableWidth = currentColumns.reduce((width, column) => width + column.width, 0);
  const LEFT_PANEL_WIDTH = tableMode === 'full' ? visibleTableWidth : Math.min(leftPanelWidth, Math.max(56, visibleTableWidth));
  const leftPanelPosition = chartViewportWidth > 0 && LEFT_PANEL_WIDTH >= chartViewportWidth ? 'relative' : 'sticky';
  const rowHeights = useMemo(() => filteredGanttItems.map(item => {
    if (item.deliveryBand) return item.deliveryBand === 'money' ? 80 : 34;
    if (item.isProjectHeader) return 30;
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
    return Math.max(ROW_HEIGHT, 10 + assigneeCount * 16) + additionalOvertimeRows * 16;
  }), [filteredGanttItems, tasks]);
  const rowOffsets = useMemo(() => rowHeights.reduce((offsets, height, index) => {
    offsets.push((offsets[index] || 0) + height);
    return offsets;
  }, [0]), [rowHeights]);
  const rowsHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  const chartBodyHeight = Math.max(sidebarCollapsed ? 360 : 200, rowsHeight + 20, viewportHeight - 170);

  // Tính tọa độ vị trí (x, width, y) của từng thanh Gantt bên trong SVG (bắt đầu từ y = 0)
  const taskCoordinates = useMemo(() => {
    const coords = {};
    filteredGanttItems.forEach((item, index) => {
      if (item.deliveryBand) return;
      if (item.isProjectHeader && !collapsedProjectIds.has(item.projectId)) return;
      const aggregateTasks = item.isProjectHeader
        ? hierarchyGanttItems.filter(task => !task.isGroup && !task.isProjectHeader && projectIdForItem(task) === item.projectId && !hierarchyGanttItems.some(candidate => candidate.parentTaskId === task.id))
        : item.isGroup && collapsedGroupIds.has(item.id)
        ? getGroupDescendantTasks(item.id, hierarchyGanttItems).filter(task => !hierarchyGanttItems.some(candidate => candidate.parentTaskId === task.id))
        : item.hasTaskChildren
          ? getTaskLeafDescendants(item.id, hierarchyGanttItems)
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
        startDate,
        endDate,
        isAggregate: Boolean(dateTasks),
        isTaskAggregate: Boolean(item.hasTaskChildren && dateTasks),
        aggregateTasks: dateTasks || []
      };
    });
    return coords;
  }, [filteredGanttItems, timelineStart, totalTimelineDays, pxPerDay, rowHeights, rowOffsets, hierarchyGanttItems, collapsedGroupIds, collapsedProjectIds]);

  // Tạo đường cong mũi tên phụ thuộc Finish-to-Start (FS) - TỰ ĐỘNG NỐI TỪ TASK TRƯỚC XUỐNG
  const dependencyLines = useMemo(() => {
    const edges = new Map();
    const visibleRepresentative = itemId => {
      if (taskCoordinates[itemId]) return itemId;
      let item = hierarchyGanttItems.find(candidate => candidate.id === itemId);
      const groupsById = new Map(hierarchyGanttItems.filter(candidate => candidate.isGroup).map(group => [group.id, group]));
      const seen = new Set();
      while (item?.parentTaskId && !seen.has(item.parentTaskId)) {
        const parentId = item.parentTaskId;
        seen.add(parentId);
        if (collapsedTaskIds.has(parentId) && taskCoordinates[parentId]) return parentId;
        item = hierarchyGanttItems.find(candidate => candidate.id === parentId);
      }
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
          if (candidate && !candidate.isProjectHeader && !candidate.isGroup && candidate.projectId === item.projectId && candidate.parentTaskId === item.parentTaskId) {
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

    // If a task is inserted between two siblings with the exact same schedule,
    // keep the direct outer dependency as well as the normal sequential links.
    // This gives A1.1 -> A1.2, A1.1 -> A1.3, and A1.3 -> A1.2 when A1.3 is
    // scheduled inside A1.1/A1.2's shared date range.
    dependencyRows.forEach((target, targetIndex) => {
      if (target.isProjectHeader || target.isGroup || !target.startDate || !target.endDate) return;
      for (let sourceIndex = targetIndex - 2; sourceIndex >= 0; sourceIndex -= 1) {
        const source = dependencyRows[sourceIndex];
        if (source.isProjectHeader || source.isGroup) break;
        if (source.projectId !== target.projectId || source.parentGroupId !== target.parentGroupId || source.parentTaskId !== target.parentTaskId) break;
        if (source.startDate !== target.startDate || source.endDate !== target.endDate) continue;

        const hasIntermediateTaskInsideRange = dependencyRows
          .slice(sourceIndex + 1, targetIndex)
          .some(candidate => !candidate.isProjectHeader && !candidate.isGroup &&
            candidate.projectId === source.projectId &&
            candidate.parentGroupId === source.parentGroupId &&
            candidate.parentTaskId === source.parentTaskId &&
            candidate.startDate > source.startDate &&
            candidate.startDate <= source.endDate &&
            candidate.endDate >= source.startDate &&
            candidate.endDate <= source.endDate);
        if (!hasIntermediateTaskInsideRange) continue;

        const sourceId = visibleRepresentative(source.id);
        const targetId = visibleRepresentative(target.id);
        if (!sourceId || !targetId || sourceId === targetId) continue;
        const from = taskCoordinates[sourceId];
        const to = taskCoordinates[targetId];
        if (!from || !to) continue;
        const key = `${sourceId}->${targetId}`;
        if (!edges.has(key)) edges.set(key, { key, from, to, sourceId, targetId });
      }
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
  }, [dependencyRows, hierarchyGanttItems, collapsedGroupIds, collapsedTaskIds, taskCoordinates]);

  const hoveredDependency = dependencyLines.find(line => line.key === hoveredDependencyKey) || null;

  // Xử lý gửi Form thêm Task
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.title) return;
    if (!taskForm.startDate || !taskForm.endDate || taskForm.endDate < taskForm.startDate) {
      window.alert('Vui lòng chọn khoảng ngày bắt đầu và kết thúc hợp lệ.');
      return;
    }
    const project = projects.find(item => item.id === taskForm.projectId);
    if (project && ((project.startDate && taskForm.startDate < project.startDate) || (project.endDate && taskForm.endDate > project.endDate))) {
      window.alert(`Ngày task phải nằm trong thời gian dự án (${formatDateVi(project.startDate)} → ${formatDateVi(project.endDate)}).`);
      return;
    }
    const assignee = employees.find(employee => employee.id === taskForm.assigneeId);
    const success = await addGanttItem({
      ...taskForm,
      assignee: assignee?.name || '',
      estimatedHoursPerDay: taskForm.estimatedHours,
      insertAfterId: quickCreateContext?.mode === 'sibling' ? quickCreateContext.anchorTaskId : ''
    });
    if (success) {
      if (success.id && (newSubmission.dueAt || newSubmission.recipient)) { try { const latest = await deliveryApi.get(taskForm.projectId); await deliveryApi.update(taskForm.projectId, { action: 'task', taskId: success.id, revision: latest.data.revision, value: { dueAt: newSubmission.dueAt ? `${newSubmission.dueAt}:00+07:00` : '', recipient: newSubmission.recipient } }); } catch (error) { window.alert(`Task đã được tạo. Hãy bổ sung hạn nộp trong khung chi tiết: ${error.message}`); } }
      setNewSubmission({ dueAt: '', recipient: '' });
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
        parentGroupId: '',
        parentTaskId: ''
      });
      setShowAddTaskModal(false);
      setQuickCreateContext(null);
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
    if (endDate < startDate) {
      window.alert('Vui lòng chọn ngày kết thúc không sớm hơn ngày bắt đầu.');
      return;
    }
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
      insertAfterId: groupCreateContext?.insertAfterId || lastProjectItem?.id || ''
    });
    if (success) {
      setGroupForm({ title: '', projectId: project.id, parentGroupId: groupForm.parentGroupId, startDate, endDate });
      setShowAddGroupModal(false);
      setGroupCreateContext(null);
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
      parentTaskId: '',
      startDate: currentDate,
      endDate: currentDate,
      days: 1,
      estimatedHours: 8,
      estimatedHoursEdited: false,
      dependencies: []
    }));
    setTaskForm(current => ({ ...current, assigneeId: deliveryData?.viewer.employeeId || current.assigneeId }));
    setCreateMenuOpen(false);
    setQuickCreateContext(null);
    setShowAddTaskModal(true);
  };

  const openInlineTaskCreation = (item, mode) => {
    const siblings = hierarchyGanttItems.filter(candidate => !candidate.isGroup && candidate.parentTaskId === (mode === 'child' ? item.id : item.parentTaskId) && candidate.parentGroupId === item.parentGroupId);
    const targetSiblings = siblings;
    const codePrefix = mode === 'child' ? `${item.code}.` : `${String(item.code || '').replace(/\.[^.]+$/, '')}.`;
    const nextCodeNumber = targetSiblings
      .map(candidate => String(candidate.code || '').startsWith(codePrefix) ? Number(String(candidate.code).slice(codePrefix.length)) : NaN)
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0) + 1;
    const startDate = item.startDate || todayIsoDate();
    const endDate = item.endDate || startDate;
    const anchorIndex = hierarchyGanttItems.findIndex(candidate => candidate.id === item.id);
    const nextSibling = mode === 'sibling'
      ? hierarchyGanttItems.slice(anchorIndex + 1).find(candidate => !candidate.isGroup && candidate.parentTaskId === item.parentTaskId && candidate.parentGroupId === item.parentGroupId)
      : null;
    setQuickCreateContext({ mode, anchorTaskId: item.id });
    setTaskForm(current => ({
      ...current,
      code: `${codePrefix}${nextCodeNumber}`,
      projectId: projectIdForItem(item) || current.projectId,
      parentGroupId: item.parentGroupId || '',
      parentTaskId: mode === 'child' ? item.id : (item.parentTaskId || ''),
      title: '',
      startDate,
      endDate,
      days: inclusiveDays(startDate, endDate),
      estimatedHours: 8,
      estimatedHoursEdited: false,
      assigneeId: deliveryData?.viewer.employeeId || '',
      dependencies: mode === 'sibling' ? [item.id] : (siblings.at(-1) ? [siblings.at(-1).id] : []),
      successorId: nextSibling?.id || ''
    }));
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
    setGroupCreateContext(null);
    setCreateMenuOpen(false);
    setShowAddGroupModal(true);
  };

  const openInlineGroupCreation = item => {
    const projectId = projectIdForItem(item) || (selectedProjectId === 'ALL' ? projects[0]?.id : selectedProjectId);
    const project = projects.find(candidate => candidate.id === projectId);
    if (!project) return;
    const startDate = item.startDate || project.startDate || todayIsoDate();
    const endDate = item.endDate || project.endDate || startDate;
    setGroupForm({ title: '', projectId, parentGroupId: item.parentGroupId || '', startDate, endDate });
    setGroupCreateContext({ insertAfterId: item.id });
    setGroupMenuOpenId(null);
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

  const openProjectDateEditor = () => {
    const project = projects.find(item => item.id === selectedProjectId);
    if (!project) return;
    setEditProjectForm({ name: project.name || '', startDate: project.startDate || '', endDate: project.endDate || '' });
    setShowEditProjectModal(true);
  };

  const handleProjectDateSubmit = async (e) => {
    e.preventDefault();
    if (!editProjectForm.name.trim()) { window.alert('Vui lòng nhập tên dự án.'); return; }
    if (!editProjectForm.startDate || !editProjectForm.endDate || editProjectForm.endDate < editProjectForm.startDate) {
      window.alert('Vui lòng chọn khoảng ngày bắt đầu và kết thúc hợp lệ.');
      return;
    }
    if (await updateProject(selectedProjectId, { ...editProjectForm, name: editProjectForm.name.trim() })) setShowEditProjectModal(false);
  };

  const handleEditOpen = (item) => {
    setEditingItem(item);
    const days = inclusiveDays(item.startDate, item.endDate);
    const assignedEmployee = employees.find(employee => employee.name === item.assignee);
    const estimatedHours = Number(item.estimatedHoursPerDay) || (Number(item.estimatedHours) > 0 ? Number(item.estimatedHours) / days : Number(assignedEmployee?.standardHours) || 8);
    setEditForm({ title: item.title || '', startDate: item.startDate, endDate: item.endDate, days, estimatedHours, estimatedHoursEdited: true });
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
    if (!editForm.title.trim()) {
      window.alert('Vui lòng nhập tên công việc.');
      return;
    }
    const success = await updateGanttItem(editingItem.id, { ...editForm, title: editForm.title.trim(), estimatedHoursPerDay: editForm.estimatedHours });
    if (success) setEditingItem(null);
  };

  const handleAssignmentsOpen = (item) => {
    if (previewing || !canManageStructure) return;
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
      ...assignment,
      employeeId: assignment.employeeId || '',
      startDate: assignment.startDate || item.startDate,
      endDate: assignment.endDate || item.endDate,
      estimatedHoursPerDay: Number(assignment.estimatedHoursPerDay) ||
        Number(linkedTask?.estimatedHoursPerDay) ||
        Number(item.estimatedHoursPerDay) ||
        Number(employees.find(employee => employee.id === assignment.employeeId)?.standardHours) || 8
    })));
    const record = deliveryData?.records[item.id];
    setAssignmentSubmission({ dueAt: record?.dueAt ? new Date(Date.parse(record.dueAt) + 7 * 3600000).toISOString().slice(0,16) : '', recipient: record?.recipient || '' });
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
    const outsideTaskDates = assignmentRows.some(assignment =>
      assignment.startDate < assignmentEditorItem.startDate || assignment.endDate > assignmentEditorItem.endDate
    );
    if (outsideTaskDates) {
      window.alert(`Khoảng thời gian đảm nhận phải nằm trong thời gian công việc (${formatDateVi(assignmentEditorItem.startDate)} → ${formatDateVi(assignmentEditorItem.endDate)}).`);
      return;
    }
    const conflicts = assignmentCalendarConflicts(assignmentRows);
    if (conflicts.length) {
      setAssignmentCalendarPrompt({ rows: assignmentRows.map(row => ({ ...row })), conflicts });
      return;
    }
    await saveAssignmentCalendarChoice(assignmentRows);
  };

  const saveAssignmentCalendarChoice = async (rows, excludeNonWorkingDays) => {
    const selected = rows.map(row => typeof excludeNonWorkingDays === 'boolean' ? { ...row, excludeNonWorkingDays } : row);
    if (selected.some(row => !assignmentWorkingDates(assignmentEditorItem, row).length)) {
      window.alert('Có người không còn ngày làm việc sau khi bỏ ngày lễ và Chủ nhật. Vui lòng chỉnh lại khoảng phân công.');
      setAssignmentCalendarPrompt(null);
      return;
    }
    setAssignmentSaving(true);
    try {
      const success = await updateGanttItem(assignmentEditorItem.id, { assignees: selected });
      if (success) { if (deliveryData && !previewing) { try { const latest = await deliveryApi.get(projectIdForItem(assignmentEditorItem)); await deliveryApi.update(projectIdForItem(assignmentEditorItem), { action: 'task', taskId: assignmentEditorItem.id, revision: latest.data.revision, value: { dueAt: assignmentSubmission.dueAt ? `${assignmentSubmission.dueAt}:00+07:00` : '', recipient: assignmentSubmission.recipient } }); await delivery.refresh(); } catch (error) { window.alert(`Phân công đã được lưu. Chưa lưu hạn nộp: ${error.message}`); } } setAssignmentCalendarPrompt(null); setAssignmentEditorItem(null); }
    } finally { setAssignmentSaving(false); }
  };

  const handleDeleteSelectedProject = async () => {
    if (selectedProjectId === 'ALL') return;
    const success = await deleteProject(selectedProjectId);
    if (success) setSelectedProjectId('ALL');
  };

  const groupMetrics = useMemo(() => {
    const result = new Map(); const byId = new Map(hierarchyGanttItems.map(item => [item.id, item]));
    const add = (id, metric, free) => { const sum = result.get(id) || { planned: 0, earned: 0, actual: 0, actualHours: 0, laborCost: 0, output: 0 }; sum.planned += free ? 0 : metric.planned; sum.earned += metric.earned; sum.actual += metric.actual; sum.actualHours += metric.actualHours; sum.laborCost = sum.laborCost == null || metric.laborCost == null ? null : sum.laborCost + metric.laborCost; sum.output = sum.output == null || metric.output == null ? null : sum.output + metric.output; result.set(id, sum); };
    hierarchyGanttItems.forEach(item => { const metric = deliveryData?.taskMetrics[item.id]; if (!metric) return; const free = deliveryData.records[item.id]?.freeRework; add(`project-heading-${projectIdForItem(item)}`, metric, free); const seen = new Set([item.id]); let parent = byId.get(item.parentTaskId || item.parentGroupId); while (parent && !seen.has(parent.id)) { seen.add(parent.id); add(parent.id, metric, free); parent = byId.get(parent.parentTaskId || parent.parentGroupId); } });
    return result;
  }, [hierarchyGanttItems, deliveryData, tasks]);
  const groupPercent = item => { if (item.isProjectHeader && item.projectId === selectedProjectId && deliveryData) return deliveryData.summary.completion; const metric = groupMetrics.get(item.id); return metric ? metric.planned ? metric.earned / metric.planned * 100 : 0 : null; };
  const editDeliveryItem = item => { if (item.isProjectHeader) { setSelectedProjectId(item.projectId); setEditProjectForm({ name: item.title || '', startDate: item.startDate || '', endDate: item.endDate || '' }); setShowEditProjectModal(true); } else if (item.isGroup) openGroupEdit(item); else handleEditOpen(item); };
  const removeDeliveryItem = async item => { if (item.isProjectHeader) { if (await deleteProject(item.projectId)) setDetailItemId(null); } else if (await deleteGanttItem(item.id)) setDetailItemId(null); };
  const createDeliveryTask = (item, child = false) => {
    if (item.isGroup || item.isProjectHeader) { openTaskCreation(); if (item.isGroup) setTaskForm(current => ({ ...current, projectId: projectIdForItem(item), parentGroupId: item.id, parentTaskId: '', startDate: item.startDate || current.startDate, endDate: item.endDate || current.endDate, days: inclusiveDays(item.startDate, item.endDate) })); }
    else openInlineTaskCreation(item, child ? 'child' : 'sibling');
  };
  const detailItem = filteredGanttItems.find(item => item.id === detailItemId) || hierarchyGanttItems.find(item => item.id === detailItemId);
  useEffect(() => {
    if (detailItemId && !detailItem) { setDetailItemId(null); setDetailSection(''); }
  }, [detailItemId, detailItem]);

  const summary = deliveryData?.summary;
  const personalAlerts = Object.entries(deliveryData?.taskMetrics || {}).filter(([id]) => ownsDeliveryTask(deliveryData?.viewer, hierarchyGanttItems.find(item => item.id === id))).map(([, metric]) => metric.alert);
  const alertCounts = roleView.ownByDefault ? { warnings: personalAlerts.filter(alert => alert.warning).length, soon: personalAlerts.filter(alert => alert.soon).length, overdue: personalAlerts.filter(alert => alert.overdue).length, stuck: personalAlerts.filter(alert => alert.stuck).length } : summary;
  const [excludeRework, setExcludeRework] = useState(false);
  const [showIT, setShowIT] = useState(false);
  useEffect(() => { delivery.refresh(); }, [ganttItems, tasks]);
  return (
    <div className={`delivery-page ${detailItem ? "with-detail" : ""} ${tableMode === "full" ? "full-table" : ""}`} style={{ "--delivery-scrollbar-width": `${scrollbarWidth}px` }}>
      <div className="delivery-page-scroll" ref={pageScrollRef} data-modal-background-scroll>
      <div className="delivery-fixed-top">
      
      {/* THANH ĐIỀU KHIỂN & BỘ LỌC GANTT */}
      <div className="delivery-toolbar z-[60] w-full px-4 sm:px-5 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
        
        <fieldset disabled={previewing} className="contents">
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
              hidden={!canManageStructure}
              disabled={selectedProjectId === 'ALL'}
              title="Chỉnh tên và thời gian dự án"
              className="p-2 rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDeleteSelectedProject}
              hidden={!canManageStructure}
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
            hidden={!canManageStructure}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
          >
            + Dự Án Mới
          </button>

          <div className="relative" ref={createMenuRef} hidden={!canManageStructure}>
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
              disabled={projects.length === 0 || !canManageStructure}
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

        </fieldset>
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
                    onClick={() => setDeliveryColumns(DELIVERY_COLUMNS.map(column => column.key))}
                    className="text-[10px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                  >
                    Hiện tất cả
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {DELIVERY_COLUMNS.filter(column => !column.financial || deliveryData?.permissions.financial).map(column => (
                    <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={deliveryColumns.includes(column.key)} disabled={COMPACT_KEYS.includes(column.key)}
                        onChange={event => setDeliveryColumns(current => event.target.checked ? [...current, column.key] : current.filter(key => key !== column.key))}
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

          <div className="delivery-date-range hidden sm:flex w-auto whitespace-nowrap shrink-0 items-center justify-center gap-1.5 px-3 py-1 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-semibold">
            <span>T{timelineStart.getMonth() + 1}/{timelineStart.getFullYear()} - T{timelineEnd.getMonth() + 1}/{timelineEnd.getFullYear()}</span>
          </div>

        </div>

      </div>

      <div className="delivery-navigation">
        <nav>{[['gantt','Tiến độ & Gantt'],['legal','Hồ sơ pháp lý'],['changes','Yêu cầu thay đổi'],...(deliveryData?.permissions.financial ? [['close','Chốt sản lượng tháng']] : [])].map(([key,label]) => <button key={key} className={deliveryTab === key ? 'active' : ''} onClick={() => setDeliveryTab(key)}>{label}{showIT && key !== 'gantt' && <small className="delivery-new">MỚI</small>}</button>)}</nav>
        <div className="delivery-view-options">{deliveryData?.viewer && <span className="delivery-role-badge">{deliveryData.viewer.name || employees.find(person => person.id === deliveryData.viewer.employeeId)?.name || deliveryData.viewer.email} · {DELIVERY_ROLES[deliveryData.viewer.role]}</span>}{delivery.data?.permissions.users && <label>Xem thử vai trò <select value={previewEmail} onChange={event => setPreviewEmail(event.target.value)}><option value="">Vai trò đang đăng nhập</option>{deliveryUsers.filter(user => !user.disabled).map(user => <option key={user.email} value={user.email}>{user.name} · {DELIVERY_ROLES[user.role]}</option>)}</select></label>}<label><input type="checkbox" checked={showGuide} onChange={event => setShowGuide(event.target.checked)} /> Hiện cách tính</label><label><input type="checkbox" checked={showIT} onChange={event => setShowIT(event.target.checked)} /> Nhãn Mới/Đổi & ghi chú IT</label></div>
      </div>
      {previewing && <p className="delivery-notice">Đang xem thử {DELIVERY_ROLES[previewUser.role]} · {previewUser.name}. Thoát xem thử để thực hiện thay đổi.</p>}
      {delivery.error && <p role="alert" className="delivery-error">{delivery.error} <button onClick={delivery.refresh}>Tải lại</button></p>}
      {selectedProjectId === 'ALL' && <p className="delivery-notice">Chọn một dự án để xem số liệu, hồ sơ và cập nhật trạng thái theo quy tắc mới.</p>}
      {showIT && <p className="delivery-notice"><b>MỚI:</b> Hạn nộp, bằng chứng, xác nhận, hồ sơ, CR và chốt tháng. <b>ĐỔI:</b> bảng mặc định 5 cột; giờ dự kiến hiển thị Công DT (8 giờ/công), trạng thái tách khỏi % ghi nhận. Cấu trúc công việc, phân công, lịch nghỉ và liên kết Gantt dùng chung dữ liệu hiện có.</p>}
      {showGuide && <div className="delivery-guide-wrap"><DeliveryGuide financial={deliveryData?.permissions.financial} /></div>}
      {deliveryTab === 'gantt' && <><div className="delivery-kpis">
        <span>% hoàn thành HĐ <b>{summary ? summary.completion.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '—'}%</b><small>kế hoạch {summary ? Math.round(summary.planPercent) : '—'}%</small></span>
        {deliveryData?.permissions.financial && <span title="Theo lịch sử ghi nhận từ khi sử dụng chức năng mới">Sản lượng T{currentTime.getMonth() + 1} <b>{formatCompactMoney(summary?.monthlyOutput)}</b><small>lũy kế {formatCompactMoney(summary?.output)}</small></span>}
        {roleView.ownByDefault && <span>Tăng trong tháng <b>{summary?.progressThisMonth == null ? '—' : `${summary.progressThisMonth > 0 ? '+' : ''}${summary.progressThisMonth.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} điểm`}</b></span>}
        <span>Hiệu suất giờ <b style={{ color: (excludeRework ? summary?.efficiencyWithoutRework : summary?.efficiency) == null ? undefined : (excludeRework ? summary?.efficiencyWithoutRework : summary?.efficiency) >= 1 ? '#16835d' : (excludeRework ? summary?.efficiencyWithoutRework : summary?.efficiency) >= .85 ? '#b27b18' : '#c34d53' }}>{(excludeRework ? summary?.efficiencyWithoutRework : summary?.efficiency)?.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) ?? '—'}</b><label title="Loại giờ làm lại khỏi mẫu số"><input type="checkbox" checked={excludeRework} onChange={event => setExcludeRework(event.target.checked)} />Không tính làm lại</label></span>
        <button onClick={() => setWarningOnly(value => !value)} className={warningOnly ? 'active' : ''}>Cảnh báo{roleView.ownByDefault ? ' của tôi' : ''} <b>{alertCounts?.warnings ?? '—'}</b><small>{alertCounts?.soon ?? 0} sắp đến hạn · {alertCounts?.overdue ?? 0} quá hạn · {alertCounts?.stuck ?? 0} đứng lâu</small></button>
        {deliveryData?.permissions.financial && <span>Đủ ĐK thanh toán, chưa đề nghị <b>{formatCompactMoney(summary?.eligiblePayment)}</b></span>}
      </div>{!roleView.financial && deliveryData && <p className="delivery-role-notice">Phí hợp đồng, sản lượng và mọi giá trị tiền được ẩn với vai trò {DELIVERY_ROLES[deliveryData.viewer.role]}.{roleView.ownByDefault && !deliveryData.viewer.employeeId && ' Tài khoản chưa liên kết nhân sự; cần liên kết để hiển thị việc của bạn.'}</p>}<div className="delivery-table-controls"><span>Cột hiển thị</span>{[['compact','Gọn'],['dates','+ Ngày & công'],['full','Toàn bảng (ẩn Gantt)']].map(([key,label]) => <button key={key} className={tableMode === key ? 'active' : ''} onClick={() => setPreset(key)}>{label}</button>)}<select aria-label="Bộ môn" value={department} onChange={event => setDepartment(event.target.value)}><option value="">Bộ môn: Tất cả</option>{departments.map(value => <option key={value}>{value}</option>)}</select><label><input type="checkbox" checked={onlyMine} disabled={!deliveryData?.viewer.employeeId} onChange={event => setOnlyMine(event.target.checked)} />Chỉ việc của tôi</label><small>Bấm vào dòng để xem chi tiết</small></div>
      </>}

      {deliveryTab === 'gantt' && <div className="delivery-chart-heading-scroll" ref={headingScrollRef}>
        <div className="flex" style={{ width: LEFT_PANEL_WIDTH + (tableMode === 'full' ? 0 : ganttWidth), minWidth: '100%' }}>
          <div className="delivery-heading-left sticky left-0 z-40 flex-none relative" style={{ width: LEFT_PANEL_WIDTH, position: leftPanelPosition }}>
              <div
                role="separator"
                aria-label="Thay đổi độ rộng bảng"
                aria-orientation="vertical"
                aria-valuemin={GANTT_TABLE_MIN_WIDTH}
                aria-valuemax={maxLeftPanelWidth}
                aria-valuenow={LEFT_PANEL_WIDTH}
                tabIndex={0}
                className="delivery-panel-resize absolute right-0 top-0 z-[70] h-full cursor-col-resize touch-none"
                onPointerDown={startLeftPanelResize}
                onPointerMove={resizeLeftPanel}
                onPointerUp={stopLeftPanelResize}
                onPointerCancel={stopLeftPanelResize}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft') setLeftPanelWidth(width => Math.max(GANTT_TABLE_MIN_WIDTH, width - 16));
                  if (event.key === 'ArrowRight') setLeftPanelWidth(width => Math.min(maxLeftPanelWidth, width + 16));
                }}
              />
              
              {/* Header Bảng Bên Trái - Khóa cứng 52px */}
              <div
                className="delivery-table-heading sticky top-0 z-50 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider box-border"
                style={{ height: `${HEADER_HEIGHT}px`, minHeight: `${HEADER_HEIGHT}px`, maxHeight: `${HEADER_HEIGHT}px` }}
              >
                {currentColumns.map(column => (
                  <div
                    key={column.key}
                    className={`delivery-column ${column.key} ${column.alignLeft ? 'delivery-column-left' : 'delivery-column-center'} flex h-full shrink-0 items-center border-r border-slate-200 leading-none dark:border-slate-700 ${column.key === 'createdAt' || ['contractWork', 'actualWork', 'note'].includes(column.key) ? 'text-[10px]' : ''}`}
                    style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                  >
                    <span className={`${column.alignLeft ? 'truncate whitespace-nowrap' : ''} normal-case`}>{column.label}</span>
                  </div>
                ))}
              </div>


            {deliveryData?.permissions.financial && <DeliveryRow item={{ deliveryBand:'money' }} height={80} />}
          </div>
          <div className="flex-none" style={{ width: ganttWidth, display: tableMode === 'full' ? 'none' : undefined }}>
              {/* Header tháng/tuần dùng chung chiều cao với bảng bên trái. */}
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
                    <span className={`font-extrabold text-xs text-sky-600 dark:text-sky-400 ${zoomLevel === 'month' ? 'flex h-[22px] min-h-[22px] items-center' : ''}`}>
                      {col.label}
                    </span>
                    {zoomLevel === 'month' ? (
                      <div className="flex h-[24px] min-h-[24px] w-full border-t border-slate-200 dark:border-slate-700">
                        {Array.from({ length: col.days }, (_, dayIndex) => (
                          <div
                            key={dayIndex + 1}
                            className="flex h-full shrink-0 items-center justify-center border-r border-slate-200/80 text-[7px] font-medium leading-none text-slate-500 last:border-r-0 dark:border-slate-700 dark:text-slate-400"
                            style={{ width: `${pxPerDay}px`, backgroundColor: calendarDays[Math.round(col.left / pxPerDay) + dayIndex]?.color }}
                            title={`${dayIndex + 1}/${col.label.slice(1)}${calendarDays[Math.round(col.left / pxPerDay) + dayIndex]?.label ? ` — ${calendarDays[Math.round(col.left / pxPerDay) + dayIndex].label}` : ''}`}
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

            {deliveryData?.permissions.financial && <svg width={ganttWidth} height={80}><DeliveryChartOverlay data={deliveryData} financial items={[]} coordinates={{}} rowOffsets={[]} timelineStart={timelineStart} pxPerDay={pxPerDay} width={ganttWidth} height={80} now={currentTime} groupPercent={groupPercent} /></svg>}
          </div>
        </div>
      </div>}
      </div>
      <div className="delivery-page-body">
      {deliveryTab === 'gantt' && <>
      {/* BẢNG TIẾN ĐỘ & BIỂU ĐỒ GANTT TƯƠNG TÁC (CỘT TRỜI ĐÓNG BĂNG) */}
      <div className="delivery-chart-shell w-full bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Khung cuộn ngang chứa cả Bảng bên trái + Biểu đồ bên phải */}
        <div
          ref={timelineScrollRef}
          className="delivery-chart-scroll relative isolate bg-slate-100 dark:bg-slate-950"
        >
          <div className="flex bg-slate-100 dark:bg-slate-950" style={{ width: `${LEFT_PANEL_WIDTH + (tableMode === 'full' ? 0 : ganttWidth)}px`, minWidth: '100%' }}>
            
            {/* ================= KHUNG TRÁI: BẢNG DỮ LIỆU CÔNG VIỆC (ĐÓNG BĂNG FREEZE) ================= */}
            <div
              className="relative flex-shrink-0 sticky left-0 z-40 overflow-clip bg-white dark:bg-slate-900 border-r-2 border-slate-300 dark:border-slate-700 shadow-md"
              style={{ width: `${LEFT_PANEL_WIDTH}px`, minWidth: `${LEFT_PANEL_WIDTH}px`, maxWidth: `${LEFT_PANEL_WIDTH}px`, position: leftPanelPosition }}
            >
              <div
                role="separator"
                aria-label="Thay đổi độ rộng bảng"
                aria-orientation="vertical"
                aria-valuemin={GANTT_TABLE_MIN_WIDTH}
                aria-valuemax={maxLeftPanelWidth}
                aria-valuenow={LEFT_PANEL_WIDTH}
                tabIndex={0}
                className="delivery-panel-resize absolute right-0 top-0 z-[70] h-full cursor-col-resize touch-none"
                onPointerDown={startLeftPanelResize}
                onPointerMove={resizeLeftPanel}
                onPointerUp={stopLeftPanelResize}
                onPointerCancel={stopLeftPanelResize}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft') setLeftPanelWidth(width => Math.max(GANTT_TABLE_MIN_WIDTH, width - 16));
                  if (event.key === 'ArrowRight') setLeftPanelWidth(width => Math.min(maxLeftPanelWidth, width + 16));
                }}
              />
              
              {/* Danh Sách Các Hàng Công Việc (Khóa cứng 44px mỗi dòng) */}
              <div style={{ minHeight: `${chartBodyHeight}px` }}>
                {filteredGanttItems.map((item, itemIndex) => <DeliveryRow key={item.id} item={item} columns={currentColumns} height={rowHeights[itemIndex]} depth={groupDepthForItem(item)} record={deliveryData?.records[item.id]} metric={deliveryData?.taskMetrics[item.id] || groupMetrics.get(item.id)} aggregate={groupPercent(item)} employees={employees} collapsed={item.isProjectHeader ? collapsedProjectIds.has(item.projectId) : item.isGroup ? collapsedGroupIds.has(item.id) : collapsedTaskIds.has(item.id)} onToggle={() => item.isProjectHeader ? toggleProjectCollapsed(item.projectId) : item.isGroup ? toggleGroupCollapsed(item.id) : toggleTaskCollapsed(item.id)} onOpen={section => openDetail(item, typeof section === 'string' ? section : '')} onEdit={() => editDeliveryItem(item)} onAssign={() => handleAssignmentsOpen(item)} onDelete={() => removeDeliveryItem(item)} onSaveWork={(id, patch) => item.isProjectHeader ? updateProject(item.projectId, patch) : updateGanttItem(id, patch)} color={item.isGroup ? phaseColorForGroup(item) : item.color} onCreateTask={child => createDeliveryTask(item, child)} readOnly={previewing || !canManageStructure} />)}
              </div>

            </div>

            {/* ================= KHUNG PHẢI: BIỂU ĐỒ GANTT NẰM BÊN PHẢI (SVG TƯƠNG TÁC) ================= */}
            <div className="delivery-timeline relative z-0 flex-none bg-slate-100 dark:bg-slate-950" style={{ width: `${ganttWidth}px`, display: tableMode === 'full' ? 'none' : undefined }}>
              
              {/* Lưới Nền (Grid Lines) */}
              <div
                className="absolute inset-x-0 pointer-events-none flex"
                style={{
                  width: `${ganttWidth}px`,
                  height: `${chartBodyHeight}px`,
                  top: 0
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
                {/* Calendar fills are painted first, below grid, links, bars and labels. */}
                <GanttCalendarBackground days={calendarDays} pxPerDay={pxPerDay} height={chartBodyHeight} />
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
                <GanttRowGrid
                  items={filteredGanttItems}
                  coordinates={taskCoordinates}
                  monthColumns={monthColumns}
                  zoomLevel={zoomLevel}
                  pxPerDay={pxPerDay}
                  width={ganttWidth}
                  height={chartBodyHeight}
                  rowOffsets={rowOffsets}
                />

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

                  if (item.isProjectHeader || item.isGroup || coord.isTaskAggregate) {
                    if (!item.isProjectHeader && !coord.isAggregate) return null;
                    const clipId = `aggregate-bar-clip-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                    const aggregateStart = new Date(`${coord.startDate}T00:00:00`);
                    const aggregateEnd = new Date(`${coord.endDate}T00:00:00`);
                    const aggregateStartOffset = (aggregateStart - timelineStart) / 86400000;
                    const aggregateEndOffset = (aggregateEnd - timelineStart) / 86400000 + 1;
                    return (
                      <g key={`aggregate-${item.id}`} className="pointer-events-auto" data-aggregate-id={item.id}>
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
                            const progress = deliveryData?.taskMetrics[child.id]?.recognized ?? scheduledProgress(progressTask, childAssignee?.standardHours || 8, currentTime);
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
                  const progress = deliveryData?.taskMetrics[item.id]?.recognized ?? scheduledProgress(progressTask, assignee?.standardHours || 8, currentTime);
                  const overdue = isTaskOverdue(progressTask, currentTime);
                  const delayHours = Math.max(
                    taskDelayHours(progressTask, currentTime),
                    Number(linkedTask?.delayHours) || 0,
                    Number(item.delayHours) || 0
                  );
                  const completedLate = progressTask.status === 'completed' && (progressTask.speedStatus === 'delayed' || item.speed === 'delayed');
                  const _completedEarly = progressTask.status === 'completed' && (progressTask.speedStatus === 'early' || item.speed === 'early');
                  const _earlyHours = Math.max(
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
                  const fillColor = deliveryData?.records[item.id]?.freeRework ? 'url(#grad-amber)' : deliveryData?.taskMetrics[item.id]?.recognized === 100 ? 'url(#grad-green)' : deliveryData?.taskMetrics[item.id] ? 'url(#grad-slate)' : isHoliday || (progressTask.status === 'completed' && completedLate) || (!overdue && delayHours > 0)
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
                          key: `${item.id}-assignment-${index}`,
                          employeeName: assignment.employeeName || item.assignee,
                          startDate: assignment.startDate || item.startDate,
                          endDate: assignment.endDate || item.endDate,
                          days: assignmentWorkingDates(item, assignment).length,
                          hoursPerDay: Number(assignment.estimatedHoursPerDay) || Number(item.estimatedHoursPerDay) || Number(item.estimatedHours) / (Number(item.days) || 1) || 8,
                          y: coord.rowTop + 21 + index * 16
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
                    <g key={item.id} className="cursor-pointer group" onClick={event => { if (!event.target.closest('[role="button"]')) openDetail(item); }}>
                      
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

                      {!isGroup && !isHoliday && !itemAssignees?.some(a => a.excludeNonWorkingDays === true) && (
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

                      {!isGroup && !isHoliday && itemAssignees?.some(a => a.excludeNonWorkingDays === true) && <GanttExcludedDaysBar item={{ ...item, assignees: itemAssignees }} timelineStart={timelineStart} pxPerDay={pxPerDay} coord={coord} progress={progress} fillColor={fillColor} statusColor={statusColor} highlighted={isDependencyHighlighted} />}

                      {/* Nhãn trên thanh hoặc cạnh thanh: Tên người đảm nhận, thời gian, tăng ca */}
                      {!isGroup && (
                        <>
                        {canManageStructure && !previewing && assignmentLabels.length === 0 && (
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
                            {bar.employeeName} · {deliveryData?.records[item.id]?.freeRework ? 'CR' : `${deliveryData?.records[item.id]?.level ?? Math.round(progress)}%`}
                          </tspan>
                          {overtimeForAssignment(bar).map(contribution => (
                            <tspan key={contribution.employeeId || contribution.employeeName} fill="#d97706" fontWeight="bold">
                              {' '}[+{contribution.hours}h OT]
                            </tspan>
                          ))}
                          {index === 0 && !overtimeContributions.length && item.overtimeHours > 0 && (
                            <tspan fill="#f59e0b" fontWeight="bold"> [+{item.overtimeHours}h OT]</tspan>
                          )}

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

                <DeliveryChartOverlay data={deliveryData} financial={false} items={filteredGanttItems} coordinates={taskCoordinates} rowOffsets={rowOffsets} timelineStart={timelineStart} pxPerDay={pxPerDay} width={ganttWidth} height={chartBodyHeight} now={currentTime} groupPercent={groupPercent} />
              </svg>

            </div>

          </div>
        </div>

      </div>

      </>}
      {deliveryTab !== 'gantt' && <DeliveryResources onOpenTask={openDetail} showIT={showIT} tab={deliveryTab} data={deliveryData} delivery={delivery} projectId={selectedProjectId} employees={employees} items={hierarchyGanttItems} refreshApp={refreshAllData} readOnly={previewing} users={deliveryUsers} setUsers={setDeliveryUsers} templates={projectTemplates} setTemplates={setProjectTemplates} />}
      </div></div>
      {deliveryTab === 'gantt' && <div ref={horizontalScrollRef} className="delivery-horizontal-scroll" role="region" aria-label="Cuộn ngang bảng và biểu đồ Gantt" tabIndex={0}><div /></div>}
      {detailItem && !detailItem.deliveryBand && <DeliveryDrawer scrollbarWidth={scrollbarWidth} key={`${detailItem.id}:${detailSection}:${deliveryData?.viewer.email || 'loading'}`} item={detailItem} data={deliveryData ? { ...deliveryData, taskMetrics: { ...deliveryData.taskMetrics, ...(groupMetrics.has(detailItem.id) ? { [detailItem.id]: groupMetrics.get(detailItem.id) } : {}) } } : null} projectId={projectIdForItem(detailItem) || selectedProjectId} delivery={delivery} employees={employees} onClose={() => setDetailItemId(null)} onEdit={() => editDeliveryItem(detailItem)} onAssign={() => handleAssignmentsOpen(detailItem)} onDelete={() => removeDeliveryItem(detailItem)} onAddSibling={() => createDeliveryTask(detailItem)} onAddChild={() => createDeliveryTask(detailItem, true)} onAddGroup={() => openInlineGroupCreation(detailItem)} onSaveNote={async note => { if (!await updateGanttItem(detailItem.id, { ganttNote: note })) throw new Error('Không lưu được ghi chú.'); }} readOnly={previewing} initialSection={detailSection} />}
      {showEditProjectModal && (
        <ModalOverlay>
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Chỉnh tên và thời gian dự án</h3>
              <button type="button" onClick={() => setShowEditProjectModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <form onSubmit={handleProjectDateSubmit} className="space-y-4">
              <label className="block text-xs font-semibold">Tên dự án<input required aria-label="Tên dự án" value={editProjectForm.name} onChange={event => setEditProjectForm(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" /></label>
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
                <button type="submit" className="px-5 py-2 rounded-xl bg-sky-600 text-xs font-bold text-white">Lưu thông tin dự án</button>
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
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tên task
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={editForm.title}
                  onChange={event => setEditForm(current => ({ ...current, title: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </label>
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
              {deliveryData && <div className="delivery-form-grid"><label>Hạn nộp hồ sơ (giờ Việt Nam)<input className="w-full p-2 border rounded-lg" type="datetime-local" value={assignmentSubmission.dueAt} onChange={event => setAssignmentSubmission({ ...assignmentSubmission, dueAt: event.target.value })} /></label><label>Nơi nhận<input className="w-full p-2 border rounded-lg" value={assignmentSubmission.recipient} onChange={event => setAssignmentSubmission({ ...assignmentSubmission, recipient: event.target.value })} placeholder="CĐT / cơ quan" /></label></div>}

              <p className="text-xs text-slate-500">
                Mỗi người có khoảng thời gian đảm nhận riêng; các khoảng thời gian có thể trùng nhau.
              </p>
              {assignmentRows.map((assignment, index) => {
                const availableEmployees = employees;
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
                <button type="submit" disabled={assignmentSaving} className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs disabled:opacity-50">{assignmentSaving ? 'Đang lưu...' : 'Lưu phân công'}</button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {assignmentCalendarPrompt && assignmentEditorItem && <AssignmentCalendarConfirmation title={assignmentEditorItem.title} conflicts={assignmentCalendarPrompt.conflicts} saving={assignmentSaving} onClose={() => setAssignmentCalendarPrompt(null)} onChoice={exclude => saveAssignmentCalendarChoice(assignmentCalendarPrompt.rows, exclude)} />}

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
        <ModalOverlay allowBackgroundScroll>
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                <Layers className="h-5 w-5 text-sky-600" />
                Tạo mục công việc mới
              </h3>
              <button
                type="button"
                onClick={() => { setShowAddGroupModal(false); setGroupCreateContext(null); }}
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
                  disabled={Boolean(groupCreateContext)}
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm disabled:cursor-default disabled:opacity-100 disabled:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:disabled:text-slate-200"
                >
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Thuộc giai đoạn
                <SearchableSelect
                  className="mt-1"
                  disabled={Boolean(groupCreateContext)}
                  label="Giai đoạn của mục công việc"
                  searchPlaceholder="Tìm tên giai đoạn hoặc STT..."
                  value={groupForm.parentGroupId}
                  onChange={parentGroupId => setGroupForm(current => ({ ...current, parentGroupId }))}
                  options={[
                    { value: '', label: '-- Mục gốc dự án --' },
                    ...ganttItems.filter(item => item.isGroup && projectIdForItem(item) === groupForm.projectId && GANTT_PHASE_PRESETS.some(phase => phase.title === item.title))
                      .map(item => ({ value: item.id, label: item.title, searchText: ganttOptionSearchText(item) }))
                  ]}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày bắt đầu *
                  <DateInput
                    required
                    min={projects.find(project => project.id === groupForm.projectId)?.startDate}
                    max={projects.find(project => project.id === groupForm.projectId)?.endDate}
                    value={groupForm.startDate}
                    onChange={value => setGroupForm(current => ({ ...current, startDate: value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ngày kết thúc *
                  <DateInput
                    required
                    min={projects.find(project => project.id === groupForm.projectId)?.startDate}
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
                  onClick={() => { setShowAddGroupModal(false); setGroupCreateContext(null); }}
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
        <ModalOverlay allowBackgroundScroll>
          <div className="w-full max-w-xl p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-sky-600" />
                Thêm Công Việc Mới Vào Tiến Độ Dự Án
              </h3>
              <button
                onClick={() => { setShowAddTaskModal(false); setQuickCreateContext(null); }}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTaskSubmit} className="space-y-3.5">
              {deliveryData && <div className="delivery-form-grid"><label>Hạn nộp hồ sơ (giờ Việt Nam)<input className="w-full p-2 border rounded-lg" type="datetime-local" value={newSubmission.dueAt} onChange={event => setNewSubmission({ ...newSubmission, dueAt: event.target.value })} /></label><label>Nơi nhận<input className="w-full p-2 border rounded-lg" value={newSubmission.recipient} onChange={event => setNewSubmission({ ...newSubmission, recipient: event.target.value })} placeholder="CĐT / cơ quan" /></label></div>}

              
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

              <label className="block text-xs font-semibold">Vị trí cần thực hiện (tự gán khi chưa chọn người)<select className="w-full border rounded-lg p-2 mt-1" value={taskForm.requiredPosition||''} onChange={e=>setTaskForm({...taskForm,requiredPosition:e.target.value})}><option value="">Chưa xác định</option>{[...new Set(employees.map(e=>e.title).filter(Boolean))].map(title=><option key={title}>{title}</option>)}</select></label>
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

              {!quickCreateContext && <div className="w-full">
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
              </div>}

              {!quickCreateContext && <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Mục công việc
                </label>
                <SearchableSelect
                  label="Mục công việc"
                  searchPlaceholder="Tìm tên mục, giai đoạn hoặc STT..."
                  value={taskForm.parentGroupId}
                  onChange={parentGroupId => setTaskForm(current => ({ ...current, parentGroupId }))}
                  options={[
                    { value: '', label: '-- Không thuộc mục nào --' },
                    ...ganttItems.filter(item => item.isGroup && projectIdForItem(item) === taskForm.projectId)
                      .map(group => ({
                        value: group.id,
                        label: group.parentGroupId ? `↳ ${group.title}` : group.title,
                        searchText: ganttOptionSearchText(group)
                      }))
                  ]}
                />
              </div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Công Việc Trước (Mũi tên liên kết FS)
                  </label>
                  <SearchableSelect
                    label="Công việc trước"
                    value={taskForm.dependencies[0] || ''}
                    onChange={val => setTaskForm(current => ({
                      ...current,
                      dependencies: val ? [val] : [],
                      successorId: current.successorId === val ? '' : current.successorId
                    }))}
                    options={[
                      { value: '', label: '-- Không có liên kết FS --' },
                      ...ganttItems.filter(g => !g.isGroup && projectIdForItem(g) === taskForm.projectId)
                        .map(g => ({ value: g.id, code: g.code, title: g.title, label: `[${g.code}] ${g.title}`, searchText: ganttOptionSearchText(g) }))
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Công Việc Sau (Mũi tên liên kết FS)
                  </label>
                  <SearchableSelect
                    label="Công việc sau"
                    value={taskForm.successorId}
                    onChange={successorId => setTaskForm(current => ({ ...current, successorId }))}
                    options={[
                      { value: '', label: taskForm.dependencies[0]
                        ? '-- Bỏ trống để thêm task ở cuối dự án --'
                        : '-- Tự động nối theo thứ tự hiện tại --' },
                      ...ganttItems.filter(g => !g.isGroup && projectIdForItem(g) === taskForm.projectId && g.id !== taskForm.dependencies[0])
                        .map(g => ({ value: g.id, code: g.code, title: g.title, label: `[${g.code}] ${g.title}`, searchText: ganttOptionSearchText(g) }))
                    ]}
                  />
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
                    onChange={value => setTaskForm(current => {
                      const next = { ...current, startDate: value };
                      next.days = inclusiveDays(next.startDate, next.endDate);
                      return next;
                    })}
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
                    onChange={value => setTaskForm(current => {
                      const next = { ...current, endDate: value };
                      next.days = inclusiveDays(next.startDate, next.endDate);
                      return next;
                    })}
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
                  onClick={() => { setShowAddTaskModal(false); setQuickCreateContext(null); }}
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

      {showAddProjectModal && <ProjectWizard onClose={()=>setShowAddProjectModal(false)} onCreated={async id=>{await refreshAllData();setSelectedProjectId(id);setShowAddProjectModal(false);}}/>}

    </div>
  );
}
