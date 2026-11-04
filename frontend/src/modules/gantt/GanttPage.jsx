import ProjectWizard from '../operations/ProjectWizard';
import ProjectImportWorkspace from './ProjectImportWorkspace';
import { deliveryView, ownsDeliveryTask } from '../../utils/deliveryView';
import { personalTaskChain } from '../../utils/personalTaskChain';
import { restoreDeliveryColumns, saveDeliveryColumns } from '../../utils/deliveryColumnPrefs';
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useProjectDelivery } from './useProjectDelivery';
import DeliveryRow, { DELIVERY_COLUMNS, COMPACT_KEYS } from './DeliveryRow';
import DeliveryDrawer from './DeliveryDrawer';
import DeliveryResources from './DeliveryResources';
import DeliveryChartOverlay from './DeliveryChartOverlay';
import { deliveryApi } from './deliveryApi';
import { summarizeProjectWork } from '../../utils/deliveryMetrics';
import './DeliveryPage.css';
import GanttRowGrid from './GanttRowGrid';
import GanttCalendarBackground from './GanttCalendarBackground';
import { calendarColumns } from '../../utils/vietnamCalendar';
import { assignmentCalendarConflicts, assignmentWorkingDates } from '../../utils/assignmentCalendar';
import { allocateTaskHierarchyWeightPercent } from '../../utils/ganttEffort';
import GanttTaskBar, { dependencyHandleX, hasStoredAssignmentState } from './GanttTaskBar';
import AssignmentCalendarConfirmation from './AssignmentCalendarConfirmation';
import AssignmentMachinePage from './AssignmentMachinePage';
import { useApp } from '../../context/AppContext';
import { usePageAccess } from '../../context/PageAccessContext';
import ProjectPicker from './ProjectPicker';
import ModalOverlay from '../../components/layout/ModalOverlay';
import SearchableSelect from '../../components/SearchableSelect';
import DateInput from '../../components/DateInput';
import EmployeeCombobox from '../../components/EmployeeCombobox';
import { WBS_PHASE_PRESETS, phasePresetFor } from '../../utils/wbsStructure';
import {
  inferGanttGroupHierarchy,
  getGroupDescendantTasks
} from './GanttWorkColumns';
import { formatDateVi, inclusiveDays, todayIsoDate } from '../../utils/date';
import {
  CalendarRange,
  Plus,
  Trash2,
  Layers,
  ChevronDown,
  Pencil,
  UserPlus,
  SlidersHorizontal,
  X
} from 'lucide-react';

// Danh sách 64 đơn vị cấp tỉnh theo yêu cầu (giai đoạn 2004–2008).

const NO_ITEMS = [];
const NO_COORDINATES = {};
const DEPENDENCY_ARROW_TARGET_OFFSET = 16;

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
// Một dòng tên ở cột Người làm: 18px + 4px khoảng cách.
const PERSON_LINE_HEIGHT = 22;
// Giới hạn khi kéo đổi độ rộng một cột của bảng tiến độ.
const COLUMN_MIN_WIDTH = 40;
const COLUMN_MAX_WIDTH = 640;
const clampColumnWidth = width => Math.round(Math.min(COLUMN_MAX_WIDTH, Math.max(COLUMN_MIN_WIDTH, width)));
// Giai đoạn A/B/C/L: nhận theo chữ cái đầu (mã "A" hoặc tên "A. …"), không cần trùng tên mẫu.
const GANTT_PHASE_PRESETS = WBS_PHASE_PRESETS;

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

const DELIVERY_TABS = [['gantt', 'Tiến độ & Công'], ['legal', 'Hồ sơ'], ['changes', 'Khách hàng'], ['close', 'Chốt sản lượng tháng'], ['new-project', '+ Dự án mới / nhập HĐ']];
const DELIVERY_TAB_ACCESS = { gantt: 'gantt.progress', legal: 'gantt.legal', changes: 'gantt.customer', close: 'gantt.close', 'new-project': 'gantt.new-project' };
const PROGRESS_SECTIONS = [['table', 'Bảng tiến độ & công'], ['assignment', 'Phân công (máy gán)']];

/**
 * Một dòng của bảng tiến độ, chỉ vẽ lại khi dữ liệu của chính dòng đó đổi (task, số liệu, độ rộng cột, thu gọn…).
 * Mở drawer / menu / gõ trong form không còn vẽ lại cả bảng. Các thao tác gọi qua actions.current (hàm mới nhất của trang).
 */
const GanttTableRow = memo(function GanttTableRow({ actions, ...props }) {
  const { item } = props;
  return (
    <DeliveryRow
      {...props}
      onToggle={() => actions.current.toggle(item)}
      onOpen={section => actions.current.openDetail(item, typeof section === 'string' ? section : '')}
      onEdit={() => actions.current.edit(item)}
      onAssign={() => actions.current.assign(item)}
      onDelete={() => actions.current.remove(item)}
      onSaveWork={(id, patch) => actions.current.saveWork(item, id, patch)}
      onCreateTask={child => actions.current.createTask(item, child)}
    />
  );
});

export default function GanttPage() {
  const today = todayIsoDate();
  const {
    ganttItems,
    tasks,
    projects,
    employees,
    currentTime,
    ganttMonth,
    addGanttItem,
    deleteGanttItem,
    updateProject,
    deleteProject,
    updateGanttItem,
    refreshAllData,
    permissions: companyPermissions
  } = useApp();

  // Chọn dự án đang xem
  const [reportLink] = useState(() => { try { const link = JSON.parse(sessionStorage.getItem('aps_report_link') || 'null'); return projects.some(project => project.id === link?.projectId) ? link : null; } catch { return null; } });
  useEffect(() => { sessionStorage.removeItem('aps_report_link'); }, []);
  const [selectedProjectId, setSelectedProjectId] = useState(reportLink?.projectId || projects[0]?.id || 'proj-1');
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => DELIVERY_COLUMNS.filter(column => COMPACT_KEYS.includes(column.key)).reduce((sum, column) => sum + column.width, 0));
  const delivery = useProjectDelivery(selectedProjectId, refreshAllData);
  const [deliveryTabChoice, setDeliveryTab] = useState(['gantt', 'legal', 'changes', 'close'].includes(reportLink?.tab) ? reportLink.tab : 'gantt');
  const [progressSectionChoice, setProgressSection] = useState('table');
  const { canSee } = usePageAccess();
  const [tableMode] = useState('compact');
  // Cột hiện / ẩn của bảng tiến độ: lưu trên trình duyệt kèm danh sách cột đã biết lúc lưu (restoreDeliveryColumns).
  const [deliveryColumns, setDeliveryColumns] = useState(() => restoreDeliveryColumns(localStorage, DELIVERY_COLUMNS.map(column => column.key), COMPACT_KEYS));
  const [detailItemId, setDetailItemId] = useState(null);
  const pendingDetail = useRef(reportLink?.taskId ? { id: reportLink.taskId, section: '' } : null);
  // Task được dẫn tới từ trang khác (vd. nút "Cập nhật trạng thái"): cuộn tới dòng + thanh Gantt và làm nổi bật.
  const [linkTargetId, setLinkTargetId] = useState(reportLink?.taskId || null);
  const linkScrolledRef = useRef(false);
  const [detailSection, setDetailSection] = useState('');
  const [department, setDepartment] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [deliveryUsers, setDeliveryUsers] = useState([]);
  const [projectTemplates, setProjectTemplates] = useState([]);
  
  const previewing = false;
  const deliveryData = delivery.data;
  // Tab / tab con hiện theo ma trận Trang & mục; tab đang mở bị tắt quyền thì về tab đầu tiên còn được thấy.
  const deliveryTabs = DELIVERY_TABS.filter(([key]) => canSee(DELIVERY_TAB_ACCESS[key]) && (key !== 'close' || deliveryData?.permissions.financial));
  const deliveryTab = deliveryTabs.some(([key]) => key === deliveryTabChoice) ? deliveryTabChoice : deliveryTabs[0]?.[0] || 'gantt';
  const progressSections = PROGRESS_SECTIONS.filter(([key]) => canSee(`gantt.progress.${key}`));
  const progressSection = progressSections.some(([key]) => key === progressSectionChoice) ? progressSectionChoice : progressSections[0]?.[0] || 'table';
  // Ô chọn dự án nằm đầu thanh công cụ của Bảng tiến độ & công; các tab khác có thanh ngữ cảnh riêng dưới hàng tab.
  const projectPickerInToolbar = deliveryTab === 'gantt' && progressSection === 'table';
  const roleView = deliveryView(deliveryData?.viewer.role);
  const viewerEmail = deliveryData?.viewer?.email || '';
  const viewerRole = deliveryData?.viewer?.role || '';
  const ownByDefault = roleView.ownByDefault;
  const hasDeliveryData = Boolean(deliveryData);
  const canViewDeliveryUsers = Boolean(deliveryData?.permissions.users);
  // Theo quy tắc nghiệp vụ của vai trò người xem ở dự án đang chọn:
  // "Tiến độ tổng thể" → sửa cấu trúc/lịch; "Phân công task" → giao việc.
  const canManageStructure = Boolean(deliveryData?.permissions.schedule);
  const canManageAssignments = Boolean(deliveryData?.permissions.assign);
  useEffect(() => { if (viewerEmail || viewerRole) setOnlyMine(ownByDefault); }, [viewerEmail, viewerRole, ownByDefault, selectedProjectId]);
  // Độ rộng từng cột do người dùng kéo ở tiêu đề; tiêu đề và mọi dòng cùng đọc width từ currentColumns nên co giãn theo nhau.
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('aps_delivery_column_widths_v1'));
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem('aps_delivery_column_widths_v1', JSON.stringify(columnWidths)); }, [columnWidths]);
  // Phụ thuộc vào cờ đúng/sai thay vì cả object permissions: dữ liệu dự án tải lại định kỳ tạo object mới,
  // nếu không thì danh sách cột "đổi" theo và độ rộng khung bảng đã kéo bị đặt lại sau vài giây.
  const canSeeMoneyColumns = Boolean(deliveryData?.permissions?.financial);
  const currentColumns = useMemo(
    () => DELIVERY_COLUMNS
      .filter(column => deliveryColumns.includes(column.key) && (!column.financial || canSeeMoneyColumns))
      .map(column => Number.isFinite(columnWidths[column.key]) ? { ...column, width: clampColumnWidth(columnWidths[column.key]) } : column),
    [deliveryColumns, canSeeMoneyColumns, columnWidths]
  );
  const columnResizeRef = useRef(null);
  const startColumnResize = (event, column) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    columnResizeRef.current = { key: column.key, pointerX: event.clientX, width: column.width };
  };
  const resizeColumn = event => {
    const start = columnResizeRef.current;
    if (!start) return;
    setColumnWidths(current => ({ ...current, [start.key]: clampColumnWidth(start.width + event.clientX - start.pointerX) }));
  };
  const stopColumnResize = event => {
    columnResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resetColumnWidth = key => setColumnWidths(({ [key]: _removed, ...rest }) => rest);
  const nudgeColumnWidth = (column, delta) => setColumnWidths(current => ({ ...current, [column.key]: clampColumnWidth(column.width + delta) }));
  const maxLeftPanelWidth = Math.max(GANTT_TABLE_MIN_WIDTH, currentColumns.reduce((sum, column) => sum + column.width, 0));
  // Khung bảng chỉ về vừa khít các cột khi tổng độ rộng cột thật sự đổi (bật / tắt cột, kéo độ rộng một cột).
  const columnsTotalWidth = currentColumns.reduce((sum, column) => sum + column.width, 0);
  useEffect(() => { setLeftPanelWidth(columnsTotalWidth); }, [columnsTotalWidth]);
  const departments = [...new Set([...employees.map(employee => employee.team), ...Object.values(deliveryData?.records || {}).map(record => record.department)].filter(Boolean))];
  useEffect(() => { saveDeliveryColumns(localStorage, deliveryColumns, DELIVERY_COLUMNS.map(column => column.key)); }, [deliveryColumns]);
  useEffect(() => { setDetailItemId(pendingDetail.current?.id || null); setDetailSection(pendingDetail.current?.section || ''); pendingDetail.current = null; setDepartment(''); }, [selectedProjectId]);
  useEffect(() => {
    if (!hasDeliveryData) return;
    deliveryApi.templates().then(result => setProjectTemplates(result.data)).catch(() => {});
    if (canViewDeliveryUsers) deliveryApi.users().then(result => setDeliveryUsers(result.data)).catch(() => {});
  }, [hasDeliveryData, canViewDeliveryUsers, viewerEmail]);
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

  // Kéo thanh chia bảng / Gantt, bảng co giãn ngay trong lúc kéo nhưng không làm trang tính lại bố cục mỗi bước
  // (bảng rất lớn, đổi độ rộng thật tốn ~40ms mỗi lần):
  // - bắt đầu kéo: mở khung bảng (tiêu đề + thân) ra độ rộng tối đa một lần, phần Gantt bên phải trượt ngược lại cho khỏi lệch;
  // - trong lúc kéo: chỉ đổi clip-path của khung bảng và transform của phần Gantt (card đồ họa vẽ, không tính lại bố cục);
  // - thả chuột: lưu độ rộng thật vào state; các kiểu tạm được gỡ ngay sau khi trang đã vẽ với độ rộng mới.
  const applyPanelDrag = drag => {
    const hidden = drag.max - drag.next;
    drag.panels.forEach(({ left, right }) => {
      left.style.clipPath = `inset(0 ${hidden}px 0 0)`;
      if (right) right.style.transform = `translateX(${-hidden}px)`;
    });
  };
  const clearPanelDrag = drag => {
    drag.panels.forEach(({ left, right }) => {
      ['width', 'minWidth', 'maxWidth', 'clipPath', 'willChange'].forEach(key => { left.style[key] = drag.saved.get(left)?.[key] ?? ''; });
      if (right) { right.style.transform = ''; right.style.willChange = ''; }
    });
  };
  // Kết thúc một lần kéo: gỡ chỉ báo, trả con trỏ và lưu độ rộng. Gọi khi thả chuột (ở bất cứ đâu), khi hủy,
  // hoặc khi thanh chia mất quyền nhận chuột giữa chừng, để không bao giờ còn sót vạch đỏ đứng yên trên màn hình.
  const finishPanelDrag = () => {
    const drag = leftPanelResizeRef.current;
    leftPanelResizeRef.current = null;
    document.querySelectorAll('.delivery-panel-drag-indicator').forEach(element => element.remove());
    document.querySelectorAll('[data-panel-drag-static]').forEach(element => { element.style.position = ''; delete element.dataset.panelDragStatic; });
    document.body.classList.remove('is-panel-resizing');
    if (!drag) return;
    window.removeEventListener('pointerup', drag.onWindowUp, true);
    window.removeEventListener('pointercancel', drag.onWindowUp, true);
    if (drag.frame) cancelAnimationFrame(drag.frame);
    applyPanelDrag(drag);
    if (drag.next === drag.width) { clearPanelDrag(drag); return; }
    pendingPanelCleanupRef.current = drag;
    setLeftPanelWidth(drag.next);
  };
  const startLeftPanelResize = event => {
    event.preventDefault();
    // Lần kéo trước chưa kết thúc (hiếm): kết thúc nó trước, dọn mọi vạch chỉ báo còn sót.
    if (leftPanelResizeRef.current) finishPanelDrag();
    document.querySelectorAll('.delivery-panel-drag-indicator').forEach(element => element.remove());
    event.currentTarget.setPointerCapture(event.pointerId);
    const page = event.currentTarget.closest('.delivery-page') || document;
    const lefts = [page.querySelector('.delivery-heading-left'), event.currentTarget.closest('.delivery-chart-scroll')?.querySelector('.delivery-panel-resize')?.parentElement || page.querySelector('.delivery-chart-scroll .delivery-panel-resize')?.parentElement].filter(Boolean);
    const max = Math.min(maxLeftPanelWidth, Math.max(56, visibleTableWidth));
    const saved = new Map(lefts.map(left => [left, { width: left.style.width, minWidth: left.style.minWidth, maxWidth: left.style.maxWidth, clipPath: left.style.clipPath, willChange: left.style.willChange }]));
    const panels = lefts.map(left => ({ left, right: left.nextElementSibling }));
    const drag = { pointerX: event.clientX, width: LEFT_PANEL_WIDTH, max, next: LEFT_PANEL_WIDTH, frame: 0, panels, saved };
    panels.forEach(({ left, right }) => {
      Object.assign(left.style, { width: `${max}px`, minWidth: `${max}px`, maxWidth: `${max}px`, willChange: 'clip-path' });
      if (right) right.style.willChange = 'transform';
    });
    // Chỉ báo đang kéo: vạch đỏ gắn vào mép trái phần Gantt (tiêu đề + thân), trượt cùng phần Gantt nên luôn nằm đúng mép bảng;
    // con trỏ kéo ngang toàn trang.
    panels.forEach(({ right }) => {
      if (!right) return;
      if (getComputedStyle(right).position === 'static') { right.dataset.panelDragStatic = '1'; right.style.position = 'relative'; }
      const edge = document.createElement('div');
      edge.className = 'delivery-panel-drag-indicator';
      right.appendChild(edge);
    });
    document.body.classList.add('is-panel-resizing');
    applyPanelDrag(drag);
    drag.onWindowUp = () => finishPanelDrag();
    window.addEventListener('pointerup', drag.onWindowUp, true);
    window.addEventListener('pointercancel', drag.onWindowUp, true);
    leftPanelResizeRef.current = drag;
  };
  const resizeLeftPanel = event => {
    const drag = leftPanelResizeRef.current;
    if (!drag) return;
    drag.next = Math.round(Math.min(drag.max, Math.max(GANTT_TABLE_MIN_WIDTH, drag.width + event.clientX - drag.pointerX)));
    if (drag.frame) return;
    drag.frame = requestAnimationFrame(() => { drag.frame = 0; applyPanelDrag(drag); });
  };
  const stopLeftPanelResize = event => {
    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishPanelDrag();
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
  const [dependencyMenu, setDependencyMenu] = useState(null);
  const [dependencyDrag, setDependencyDrag] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', startDate: '', endDate: '', days: 1, estimatedHours: 8, estimatedHoursEdited: true });
  const timelineScrollRef = useRef(null);
  const ganttSvgRef = useRef(null);
  const headingScrollRef = useRef(null);
  const horizontalScrollRef = useRef(null);
  const pageScrollRef = useRef(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const chartViewportWidthRef = useRef(0);
  const leftPanelWidthRef = useRef(0);
  const [leftPanelOverflows, setLeftPanelOverflows] = useState(false);
  useEffect(() => {
    const body = timelineScrollRef.current;
    const heading = headingScrollRef.current;
    const scrollbar = horizontalScrollRef.current;
    if (!body || !heading || !scrollbar) return;
    let mirroredScrollLeft = scrollbar.scrollLeft;
    // Hàng tiêu đề (tháng / ngày, tên cột) cuộn ngang theo phần thân ngay trong cùng sự kiện cuộn, không đợi khung hình sau
    // (trước đây đợi requestAnimationFrame nên tiêu đề luôn chậm 1 khung hình, kéo nhanh thì lệch tới hơn 100px).
    const sync = () => {
      if (heading.scrollLeft !== body.scrollLeft) heading.scrollLeft = body.scrollLeft;
      if (Math.abs(scrollbar.scrollLeft - body.scrollLeft) > 1) {
        scrollbar.scrollLeft = body.scrollLeft;
        mirroredScrollLeft = scrollbar.scrollLeft;
      }
    };
    const dragScrollbar = () => {
      if (Math.abs(scrollbar.scrollLeft - mirroredScrollLeft) <= 1) return;
      mirroredScrollLeft = scrollbar.scrollLeft;
      // Kéo thanh cuộn dưới cùng: đặt thân và tiêu đề cùng lúc để hai phần luôn khớp.
      if (Math.abs(body.scrollLeft - scrollbar.scrollLeft) > 1) body.scrollLeft = scrollbar.scrollLeft;
      heading.scrollLeft = body.scrollLeft;
    };
    // Khi thu/mở menu, độ rộng đổi liên tục ~18 khung hình. Chỉ lưu kết quả có/không
    // "bảng trái rộng hơn khung nhìn" nên trang chỉ vẽ lại khi kết quả đó thật sự đổi.
    const measure = () => {
      scrollbar.firstElementChild.style.width = `${body.scrollWidth}px`;
      sync();
      chartViewportWidthRef.current = body.clientWidth;
      setLeftPanelOverflows(body.clientWidth > 0 && leftPanelWidthRef.current >= body.clientWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    // Vuốt ngang bằng touchpad / Shift + lăn chuột: trình duyệt cuộn trên luồng đồ họa riêng nên thân bảng đi trước,
    // sự kiện scroll tới sau một nhịp làm hàng tiêu đề bị tụt lại. Tự xử lý cú vuốt để thân và tiêu đề dịch cùng một khung hình.
    // Vuốt dọc thuần để trình duyệt cuộn trang như cũ; Ctrl (phóng to bằng hai ngón) không đụng tới.
    const page = pageScrollRef.current;
    const wheel = event => {
      if (event.ctrlKey) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? body.clientWidth : 1;
      let dx = event.deltaX * unit, dy = event.deltaY * unit;
      if (event.shiftKey && !dx) { dx = dy; dy = 0; }
      if (!dx || Math.abs(dx) < Math.abs(dy) * 0.5) return;
      const max = body.scrollWidth - body.clientWidth;
      const left = Math.max(0, Math.min(max, body.scrollLeft + dx));
      if (left === body.scrollLeft && !dy) return;
      event.preventDefault();
      body.scrollLeft = left;
      heading.scrollLeft = left;
      if (dy && page) page.scrollTop += dy;
      sync();
    };
    body.addEventListener('wheel', wheel, { passive: false });
    heading.addEventListener('wheel', wheel, { passive: false });
    body.addEventListener('scroll', sync, { passive: true });
    scrollbar.addEventListener('scroll', dragScrollbar, { passive: true });
    measure();
    return () => {
      body.removeEventListener('wheel', wheel);
      heading.removeEventListener('wheel', wheel);
      body.removeEventListener('scroll', sync);
      scrollbar.removeEventListener('scroll', dragScrollbar);
      observer.disconnect();
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

  const projectIdForItem = useCallback((item) => item.projectId || tasks.find(task => task.ganttId === item.id)?.projectId, [tasks]);
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
  const selectedProjectItems = useMemo(() => selectedProjectId === 'ALL'
    ? hierarchyGanttItems
    : hierarchyGanttItems.filter(item => projectIdForItem(item) === selectedProjectId),
  [hierarchyGanttItems, projectIdForItem, selectedProjectId]);
  const hierarchyGroupsById = useMemo(() => new Map(hierarchyGanttItems.filter(entry => entry.isGroup).map(entry => [entry.id, entry])), [hierarchyGanttItems]);
  const hierarchyItemsById = useMemo(() => new Map(hierarchyGanttItems.map(entry => [entry.id, entry])), [hierarchyGanttItems]);
  const phaseColorForGroup = item => {
    const groupsById = hierarchyGroupsById;
    const seen = new Set();
    let current = groupsById.get(item.id) || item;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const phase = phasePresetFor(current);
      if (phase) return phase.color;
      current = current.parentGroupId ? groupsById.get(current.parentGroupId) : null;
    }
    const subsectionCode = String(item.title || '').match(/^\s*([A-Z]\d+)\s*[. ]/i)?.[1]?.toUpperCase();
    if (!subsectionCode) return item.color || '#64748b';
    const phase = hierarchyGanttItems.find(candidate => candidate.isGroup && projectIdForItem(candidate) === projectIdForItem(item) && String(candidate.title || '').match(/^\s*([A-Z])\s*\./i)?.[1]?.toUpperCase() === subsectionCode[0]);
    return phasePresetFor(phase)?.color || item.color || '#64748b';
  };
  const groupDepthForItem = item => {
    const groupsById = hierarchyItemsById;
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

    if (department || onlyMine) {
      const hierarchy = inferGanttGroupHierarchy(projectItems);
      const included = new Set(hierarchy.filter(item => !item.isGroup &&
        (!onlyMine || ownsDeliveryTask(deliveryData?.viewer, item)) &&
        (!department || deliveryData?.records?.[item.id]?.department === department || item.assignees?.some(assignment => employees.find(employee => employee.id === assignment.employeeId)?.team === department))
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
  }, [ganttItems, projects, selectedProjectId, collapsedProjectIds, collapsedGroupIds, collapsedTaskIds, department, onlyMine, deliveryData, employees, projectIdForItem]);

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
  }, [ganttItems, projects, selectedProjectId, projectIdForItem]);

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
  // Ô tháng / ngày trên đầu Gantt (khoảng 365 ô): chỉ dựng lại khi đổi tháng xem, Tuần/Tháng hoặc lịch nghỉ.
  const timelineHeaderCells = useMemo(() => monthColumns.map((col, idx) => (
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
                )), [monthColumns, zoomLevel, pxPerDay, calendarDays]);
  const ganttWidth = Math.max(1200, monthColumns.reduce((total, month) => total + month.width, 0));

  // Chiều cao mỗi dòng trong bảng & biểu đồ (khóa cứng pixel để không bao giờ bị lệch)
  const ROW_HEIGHT = 34;
  const GROUP_ROW_HEIGHT = 30;
  const HEADER_HEIGHT = 48;
  const BAR_HEIGHT = 12;
  const visibleTableWidth = currentColumns.reduce((width, column) => width + column.width, 0);
  const LEFT_PANEL_WIDTH = tableMode === 'full' ? visibleTableWidth : Math.min(leftPanelWidth, Math.max(56, visibleTableWidth));
  leftPanelWidthRef.current = LEFT_PANEL_WIDTH;
  const pendingPanelCleanupRef = useRef(null);
  useLayoutEffect(() => {
    const drag = pendingPanelCleanupRef.current;
    if (!drag) return;
    pendingPanelCleanupRef.current = null;
    drag.panels.forEach(({ left, right }) => {
      left.style.clipPath = ''; left.style.willChange = '';
      // React đã ghi độ rộng mới cho các thuộc tính nó quản lý; thuộc tính tạm React không quản lý (VD min/max của khung tiêu đề) thì gỡ.
      ['width', 'minWidth', 'maxWidth'].forEach(key => { if (!drag.saved.get(left)?.[key]) left.style[key] = ''; });
      if (right) { right.style.transform = ''; right.style.willChange = ''; }
    });
  }, [LEFT_PANEL_WIDTH]);
  useEffect(() => {
    const viewport = chartViewportWidthRef.current;
    setLeftPanelOverflows(viewport > 0 && LEFT_PANEL_WIDTH >= viewport);
  }, [LEFT_PANEL_WIDTH]);
  const leftPanelPosition = leftPanelOverflows ? 'relative' : 'sticky';
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
    // Mỗi người làm chiếm một dòng 18px + khoảng cách 4px (xem .delivery-people trong DeliveryPage.css), đệm trên dưới 8px.
    return Math.max(ROW_HEIGHT, 16 + assigneeCount * PERSON_LINE_HEIGHT - 4) + additionalOvertimeRows * 16;
  }), [filteredGanttItems, tasks]);
  const rowOffsets = useMemo(() => rowHeights.reduce((offsets, height, index) => {
    offsets.push((offsets[index] || 0) + height);
    return offsets;
  }, [0]), [rowHeights]);
  const rowsHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  const tasksByGanttId = useMemo(() => {
    const map = new Map();
    tasks.forEach(task => { if (task.ganttId && !map.has(task.ganttId)) map.set(task.ganttId, task); });
    return map;
  }, [tasks]);
  // Không phụ thuộc trạng thái menu: thu/mở menu không được bắt trang này vẽ lại.
  const chartBodyHeight = Math.max(200, rowsHeight + 20, viewportHeight - 170);

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
  }, [filteredGanttItems, timelineStart, totalTimelineDays, pxPerDay, rowHeights, rowOffsets, hierarchyGanttItems, collapsedGroupIds, collapsedProjectIds, projectIdForItem]);

  // Cuộn một lần khi dòng và thanh của task đích đã được dựng: dọc tới giữa màn hình, ngang tới đầu thanh Gantt.
  useEffect(() => {
    if (!linkTargetId || linkScrolledRef.current) return undefined;
    const coord = taskCoordinates[linkTargetId];
    const row = document.querySelector(`[data-gantt-row="${CSS.escape(linkTargetId)}"]`);
    if (!row) return undefined;
    linkScrolledRef.current = true;
    requestAnimationFrame(() => {
      row.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (coord && tableMode !== 'full') timelineScrollRef.current?.scrollTo({ left: Math.max(0, coord.x - 48), behavior: 'smooth' });
    });
    return undefined;
  }, [linkTargetId, taskCoordinates, tableMode]);
  useEffect(() => {
    if (!linkTargetId) return undefined;
    const timer = window.setTimeout(() => setLinkTargetId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [linkTargetId]);

  // Tạo đường cong mũi tên phụ thuộc Finish-to-Start (FS) - TỰ ĐỘNG NỐI TỪ TASK TRƯỚC XUỐNG
  const dependencyLines = useMemo(() => {
    const edges = new Map();
    const dependencyOrder = new Map(dependencyRows.map((item, index) => [item.id, index]));
    const taskChildrenByParent = new Map();
    hierarchyGanttItems.filter(item => !item.isGroup && item.parentTaskId).forEach(item => {
      const children = taskChildrenByParent.get(item.parentTaskId) || [];
      children.push(item);
      taskChildrenByParent.set(item.parentTaskId, children);
    });
    taskChildrenByParent.forEach(children => children.sort((a, b) => (dependencyOrder.get(a.id) ?? 0) - (dependencyOrder.get(b.id) ?? 0)));
    const descendantRepresentative = (itemId, endpoint, visited = new Set()) => {
      if (visited.has(itemId)) return null;
      const nextVisited = new Set(visited).add(itemId);
      const children = taskChildrenByParent.get(itemId) || [];
      if (children.length && !collapsedTaskIds.has(itemId)) {
        const representatives = children.map(child => descendantRepresentative(child.id, endpoint, nextVisited)).filter(Boolean);
        if (representatives.length) return endpoint === 'source' ? representatives.at(-1) : representatives[0];
      }
      return taskCoordinates[itemId] ? itemId : null;
    };
    const visibleRepresentative = (itemId, endpoint) => {
      const descendant = descendantRepresentative(itemId, endpoint);
      if (descendant) return descendant;
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
      const suppressedDependencies = new Set(Array.isArray(item.suppressedDependencies) ? item.suppressedDependencies : []);
      let deps = (Array.isArray(item.dependencies) ? [...item.dependencies] : [])
        .filter(dependencyId => !suppressedDependencies.has(dependencyId));

      // Nếu là công việc con và chưa có liên kết, tự động nối từ công việc đứng ngay trước đó
      if (deps.length === 0 && !item.isGroup && toIndex > 0) {
        for (let p = toIndex - 1; p >= 0; p--) {
          const candidate = dependencyRows[p];
          if (candidate && !candidate.isProjectHeader && !candidate.isGroup && candidate.projectId === item.projectId && candidate.parentTaskId === item.parentTaskId) {
            if (!suppressedDependencies.has(candidate.id)) deps = [candidate.id];
            break;
          }
        }
      }

      [...new Set(deps)].filter(depId => depId !== item.id).forEach((depId) => {
        const sourceId = visibleRepresentative(depId, 'source');
        const targetId = visibleRepresentative(item.id, 'target');
        if (!sourceId || !targetId || sourceId === targetId) return;
        const from = taskCoordinates[sourceId];
        const to = taskCoordinates[targetId];
        if (!from || !to) return;
        const key = `${sourceId}->${targetId}:${depId}->${item.id}`;
        edges.set(key, { key, from, to, sourceId, targetId, dependencySourceId: depId, dependencyTargetId: item.id });
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
        if ((Array.isArray(target.suppressedDependencies) ? target.suppressedDependencies : []).includes(source.id)) continue;

        const sourceId = visibleRepresentative(source.id, 'source');
        const targetId = visibleRepresentative(target.id, 'target');
        if (!sourceId || !targetId || sourceId === targetId) continue;
        const from = taskCoordinates[sourceId];
        const to = taskCoordinates[targetId];
        if (!from || !to) continue;
        const key = `${sourceId}->${targetId}:${source.id}->${target.id}`;
        if (!edges.has(key)) edges.set(key, { key, from, to, sourceId, targetId, dependencySourceId: source.id, dependencyTargetId: target.id });
      }
    });

    return [...edges.values()].map(({ key, from, to, sourceId, targetId, dependencySourceId, dependencyTargetId }) => {
      const startX = from.x + 6;
      const startY = from.centerY;
      const endX = Math.max(to.x - DEPENDENCY_ARROW_TARGET_OFFSET, 0);
      const endY = to.centerY;
      const laneX = Math.min(startX, endX) - 32;
      // Orthogonal connector: left into the lane, straight down/up, then right into the target.
      const path = `M ${startX} ${startY} H ${laneX} V ${endY} H ${endX}`;

      return {
        key,
        path,
        type: 'dependency',
        sourceId,
        targetId,
        dependencySourceId,
        dependencyTargetId
      };
    });
  }, [dependencyRows, hierarchyGanttItems, collapsedGroupIds, collapsedTaskIds, taskCoordinates]);

  // "Chỉ việc của tôi": đường nối riêng theo thứ tự việc của người xem (không phải phụ thuộc của dự án, không lưu lại).
  // Đi từ cuối thanh việc trước tới đầu thanh việc sau; việc sau bắt đầu sớm hơn thì vòng xuống mép trên dòng việc sau.
  const personalLines = useMemo(() => {
    if (!onlyMine) return [];
    return personalTaskChain(filteredGanttItems, deliveryData?.viewer?.employeeId).map(([sourceId, targetId]) => {
      const from = taskCoordinates[sourceId], to = taskCoordinates[targetId];
      if (!from || !to || from.isTaskAggregate || to.isTaskAggregate) return null;
      const startX = from.endX, startY = from.centerY, endX = Math.max(to.x - 3, 0), endY = to.centerY;
      // Đi xuống ngay sau cuối thanh (trước nhãn tên người làm ở cuối thanh + 8px) để không cắt qua chữ.
      const exitX = startX + 4;
      const path = endX >= exitX + 6
        ? `M ${startX} ${startY} H ${exitX} V ${endY} H ${endX}`
        : `M ${startX} ${startY} H ${exitX} V ${to.rowTop + 3} H ${Math.max(endX - 12, 0)} V ${endY} H ${endX}`;
      return { key: `personal-${sourceId}->${targetId}`, path, sourceId, targetId };
    }).filter(Boolean);
  }, [onlyMine, filteredGanttItems, deliveryData?.viewer?.employeeId, taskCoordinates]);
  // Bật "Chỉ việc của tôi" thì chỉ vẽ đường riêng của người xem, ẩn đường phụ thuộc của dự án cho khỏi lẫn.
  const visibleDependencyLines = onlyMine ? [] : dependencyLines;
  const hoveredDependency = dependencyLines.find(line => line.key === hoveredDependencyKey) || null;
  useEffect(() => {
    if (!dependencyMenu) return undefined;
    const closeMenu = () => setDependencyMenu(null);
    const closeOnEscape = event => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [dependencyMenu]);

  const removeDependencyLine = async () => {
    const line = dependencyMenu?.line;
    setDependencyMenu(null);
    if (!line || !canManageStructure || previewing) return;
    const target = hierarchyGanttItems.find(item => item.id === line.dependencyTargetId);
    if (!target) return;
    const suppressedDependencies = [...new Set([
      ...(Array.isArray(target.suppressedDependencies) ? target.suppressedDependencies : []),
      line.dependencySourceId
    ])];
    await updateGanttItem(target.id, { suppressedDependencies });
  };
  const dependencyPoint = event => {
    const svg = ganttSvgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (event.clientX - rect.left) * ganttWidth / rect.width,
      y: (event.clientY - rect.top) * chartBodyHeight / rect.height
    };
  };
  const dependencyTargetAt = (sourceId, point) => {
    const source = hierarchyGanttItems.find(item => item.id === sourceId);
    if (!source || !point) return null;
    return filteredGanttItems.find(item => {
      const coord = taskCoordinates[item.id];
      return coord && item.id !== sourceId && !item.isProjectHeader && !item.isGroup && !item.deliveryBand && item.status !== 'holiday' &&
        projectIdForItem(item) === projectIdForItem(source) && point.y >= coord.rowTop && point.y <= coord.rowTop + coord.rowHeight;
    }) || null;
  };
  const startDependencyDrag = (item, coord, event) => {
    if (!canManageStructure || previewing || item.isGroup || item.isProjectHeader || item.status === 'holiday') return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const handleX = dependencyHandleX(coord);
    setDependencyDrag({ sourceId: item.id, startX: handleX, startY: coord.centerY, pointerX: handleX, pointerY: coord.centerY, targetId: null });
  };
  const moveDependencyDrag = event => {
    if (!dependencyDrag) return;
    const point = dependencyPoint(event);
    if (!point) return;
    const target = dependencyTargetAt(dependencyDrag.sourceId, point);
    setDependencyDrag(current => current ? { ...current, pointerX: point.x, pointerY: point.y, targetId: target?.id || null } : current);
  };
  const finishDependencyDrag = async event => {
    if (!dependencyDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const drag = dependencyDrag;
    const point = dependencyPoint(event);
    const target = dependencyTargetAt(drag.sourceId, point);
    setDependencyDrag(null);
    if (!target) return;
    const currentDependencies = Array.isArray(target.dependencies) ? target.dependencies : [];
    if (currentDependencies.includes(drag.sourceId)) return;
    await updateGanttItem(target.id, { dependencies: [...currentDependencies, drag.sourceId] });
  };
  const dependencyPreviewPath = dependencyDrag ? (() => {
    const targetCoord = dependencyDrag.targetId ? taskCoordinates[dependencyDrag.targetId] : null;
    const endX = targetCoord ? Math.max(targetCoord.x - DEPENDENCY_ARROW_TARGET_OFFSET, 0) : dependencyDrag.pointerX;
    const endY = targetCoord ? targetCoord.centerY : dependencyDrag.pointerY;
    const laneX = endX >= dependencyDrag.startX
      ? dependencyDrag.startX + Math.max(18, (endX - dependencyDrag.startX) * 0.5)
      : Math.max(dependencyDrag.startX, endX) + 28;
    return `M ${dependencyDrag.startX} ${dependencyDrag.startY} H ${laneX} V ${endY} H ${endX}`;
  })() : '';

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
      item.isGroup && projectIdForItem(item) === projectId && phasePresetFor(item)
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
      item.isGroup && projectIdForItem(item) === project.id && phasePresetFor(item)?.code === phase.code
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

  const isTaskCompleted = item => Boolean(item) && (
    item.status === 'completed' || tasks.some(task => task.ganttId === item.id && task.status === 'completed')
  );
  const completedAssignmentWarning = 'Task đã hoàn thành nên không thể thay đổi người đảm nhận.';

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
    if (isTaskCompleted(assignmentEditorItem)) {
      window.alert(completedAssignmentWarning);
      return;
    }
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
    if (isTaskCompleted(assignmentEditorItem)) {
      window.alert(completedAssignmentWarning);
      setAssignmentCalendarPrompt(null);
      return;
    }
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
    const add = (id, item, metric, free) => { const sum = result.get(id) || { planned: 0, earned: 0, actual: 0, actualHours: 0, completedActual: 0, completedActualHours: 0, completedCount: 0, budgetedWork: 0, forecastWork: 0, remainingWork: 0, varianceWork: 0, variancePercent: null, laborCost: 0, output: 0, weight: 0 }; const hasContractWork = item.contractWork !== '' && item.contractWork != null && Number.isFinite(Number(item.contractWork)); const budgetedWork = metric.budgetedWork ?? (free ? 0 : hasContractWork ? Number(item.contractWork) : Number(metric.planned) || 0); const forecastWork = metric.forecastWork ?? (Number(metric.planned) || 0); const actualWork = metric.completedActual ?? 0; const remainingWork = metric.remainingWork ?? Math.max(0, forecastWork - actualWork); const varianceWork = metric.varianceWork ?? forecastWork - budgetedWork; sum.planned += free ? 0 : metric.planned; sum.earned += metric.earned; sum.actual += metric.actual; sum.actualHours += metric.actualHours; sum.budgetedWork += budgetedWork; sum.forecastWork += forecastWork; sum.remainingWork += remainingWork; sum.varianceWork += varianceWork; sum.variancePercent = sum.budgetedWork > 0 ? sum.varianceWork / sum.budgetedWork * 100 : null; if (metric.completedCount > 0) { sum.completedActual += Number(metric.completedActual) || 0; sum.completedActualHours += Number(metric.completedActualHours) || 0; sum.completedCount += metric.completedCount; } sum.weight += free ? 0 : Number(metric.weight) || 0; sum.laborCost = sum.laborCost == null || metric.laborCost == null ? null : sum.laborCost + metric.laborCost; sum.output = sum.output == null || metric.output == null ? null : sum.output + metric.output; result.set(id, sum); };
    hierarchyGanttItems.forEach(item => { const metric = deliveryData?.taskMetrics[item.id]; if (!metric) return; const free = deliveryData.records[item.id]?.freeRework; add(`project-heading-${projectIdForItem(item)}`, item, metric, free); const seen = new Set([item.id]); let parent = byId.get(item.parentTaskId || item.parentGroupId); while (parent && !seen.has(parent.id)) { seen.add(parent.id); add(parent.id, item, metric, free); parent = byId.get(parent.parentTaskId || parent.parentGroupId); } });
    projects.forEach(project => {
      const projectMetric = result.get(`project-heading-${project.id}`);
      if (!projectMetric) return;
      const comparison = summarizeProjectWork(project, deliveryData?.taskMetrics);
      Object.assign(projectMetric, comparison, {
        actual: comparison.actualWork,
        completedActual: comparison.actualWork,
      });
    });
    return result;
  }, [hierarchyGanttItems, deliveryData, projects, projectIdForItem]);
  const displayedWeightPercent = useMemo(() => {
    const weightFor = item => deliveryData?.taskMetrics[item.id]?.weight ?? groupMetrics.get(item.id)?.weight ?? 0;
    return allocateTaskHierarchyWeightPercent(hierarchyGanttItems, weightFor);
  }, [hierarchyGanttItems, deliveryData, groupMetrics]);
  const rowMetricCache = useMemo(() => new Map(), [deliveryData, groupMetrics, displayedWeightPercent]);
  const metricForRow = item => {
    if (rowMetricCache.has(item.id)) return rowMetricCache.get(item.id);
    const metric = deliveryData?.taskMetrics[item.id] || groupMetrics.get(item.id);
    const displayWeightPercent = displayedWeightPercent.get(item.id);
    const value = metric && displayWeightPercent != null ? { ...metric, displayWeightPercent } : metric;
    rowMetricCache.set(item.id, value);
    return value;
  };
  const groupPercent = useCallback(item => { if (item.isProjectHeader && item.projectId === selectedProjectId && deliveryData) return deliveryData.summary.completion; const metric = groupMetrics.get(item.id); return metric ? metric.planned ? metric.earned / metric.planned * 100 : 0 : null; }, [selectedProjectId, deliveryData, groupMetrics]);
  const editDeliveryItem = item => { if (item.isProjectHeader) { setSelectedProjectId(item.projectId); setEditProjectForm({ name: item.title || '', startDate: item.startDate || '', endDate: item.endDate || '' }); setShowEditProjectModal(true); } else if (item.isGroup) openGroupEdit(item); else handleEditOpen(item); };
  const removeDeliveryItem = async item => { if (item.isProjectHeader) { if (await deleteProject(item.projectId)) setDetailItemId(null); } else if (await deleteGanttItem(item.id)) setDetailItemId(null); };
  const createDeliveryTask = (item, child = false) => {
    if (child && isTaskCompleted(item)) {
      window.alert('Task đã hoàn thành nên không thể tạo task con.');
      return;
    }
    if (item.isGroup || item.isProjectHeader) { openTaskCreation(); if (item.isGroup) setTaskForm(current => ({ ...current, projectId: projectIdForItem(item), parentGroupId: item.id, parentTaskId: '', startDate: item.startDate || current.startDate, endDate: item.endDate || current.endDate, days: inclusiveDays(item.startDate, item.endDate) })); }
    else openInlineTaskCreation(item, child ? 'child' : 'sibling');
  };
  const detailItem = filteredGanttItems.find(item => item.id === detailItemId) || hierarchyGanttItems.find(item => item.id === detailItemId);
  const assignmentLocked = isTaskCompleted(assignmentEditorItem);
  useEffect(() => {
    if (detailItemId && !detailItem) { setDetailItemId(null); setDetailSection(''); }
  }, [detailItemId, detailItem]);

  const showIT = false;
  const refreshDeliveryMetrics = delivery.refresh;
  // Dòng bảng và thanh Gantt được memo: thao tác của chúng đi qua ref, cập nhật sau mỗi lần vẽ, nên luôn gọi hàm mới nhất.
  const rowActionsRef = useRef(null);
  const chartActionsRef = useRef(null);
  useLayoutEffect(() => {
    rowActionsRef.current = {
      toggle: item => item.isProjectHeader ? toggleProjectCollapsed(item.projectId) : item.isGroup ? toggleGroupCollapsed(item.id) : toggleTaskCollapsed(item.id),
      openDetail,
      edit: editDeliveryItem,
      assign: handleAssignmentsOpen,
      remove: removeDeliveryItem,
      saveWork: (item, id, patch) => item.isProjectHeader ? updateProject(item.projectId, patch) : updateGanttItem(id, patch),
      createTask: createDeliveryTask,
    };
    chartActionsRef.current = { openDetail, assign: handleAssignmentsOpen, startDependencyDrag };
  });
  useEffect(() => { refreshDeliveryMetrics(); }, [ganttItems, tasks, refreshDeliveryMetrics]);
  const projectPicker = (
    <fieldset disabled={previewing} className="delivery-project-context">
      <ProjectPicker projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} disabled={previewing} />
      <button
        type="button"
        onClick={openProjectDateEditor}
        hidden={!canManageStructure}
        disabled={selectedProjectId === 'ALL'}
        title="Chỉnh tên và thời gian dự án"
        aria-label="Chỉnh dự án đang xem"
      >
        <Pencil />
      </button>
      <button
        type="button"
        onClick={handleDeleteSelectedProject}
        hidden={!canManageStructure}
        disabled={selectedProjectId === 'ALL'}
        title={selectedProjectId === 'ALL' ? 'Chọn một dự án để xóa' : 'Xóa dự án và toàn bộ dữ liệu liên quan'}
        aria-label="Xóa dự án đang xem"
      >
        <Trash2 />
      </button>
    </fieldset>
  );
  return (
    <div className={`delivery-page ${detailItem ? "with-detail" : ""} ${tableMode === "full" ? "full-table" : ""}`} style={{ "--delivery-scrollbar-width": `${scrollbarWidth}px` }}>
      <div className="delivery-page-scroll" ref={pageScrollRef} data-modal-background-scroll>
      <div className="delivery-fixed-top">
      

      <div className="delivery-navigation">
        <nav>{deliveryTabs.map(([key,label]) => <button key={key} className={deliveryTab === key ? 'active' : ''} onClick={() => setDeliveryTab(key)}>{label}</button>)}</nav>
      </div>
      {deliveryTab === 'gantt' && <div className="project-progress-switch" role="tablist" aria-label="Tiến độ và phân công">
        {progressSections.map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={progressSection === key} className={progressSection === key ? 'active' : ''} onClick={() => setProgressSection(key)}>{label}</button>)}
      </div>}
      {/* Ô chọn dự án luôn nằm dưới hàng mục con: Phân công (máy gán) đặt ở đây; Hồ sơ / Khách hàng / Chốt đặt trong trang con. */}
      {deliveryTab === 'gantt' && !projectPickerInToolbar && <div className="delivery-context-bar">{projectPicker}</div>}
      {/* THANH ĐIỀU KHIỂN & BỘ LỌC GANTT */}
      {deliveryTab === 'gantt' && progressSection === 'table' && <div className="delivery-toolbar z-[60] w-full px-4 sm:px-5 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
        
        <fieldset disabled={previewing} className="contents">
        {/* Công cụ tạo dữ liệu dự án */}
        <div className="flex flex-wrap items-center gap-3">
          {projectPicker}
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
              className="delivery-toolbar-control flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
          <div className="delivery-toolbar-task-filters flex flex-wrap items-center gap-2">
            <select
              aria-label="Bộ môn"
              value={department}
              onChange={event => setDepartment(event.target.value)}
              className="delivery-toolbar-control rounded-xl border-0 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 outline-none transition-all hover:bg-slate-200 focus:ring-2 focus:ring-sky-500/30 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <option value="">Bộ môn: Tất cả</option>
              {departments.map(value => <option key={value}>{value}</option>)}
            </select>
            <label className="delivery-toolbar-control flex items-center gap-2 rounded-xl border-0 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              <input
                type="checkbox"
                checked={onlyMine}
                disabled={!deliveryData?.viewer.employeeId}
                onChange={event => setOnlyMine(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span title="Chỉ hiện việc được giao cho bạn và nối chúng theo thứ tự ngày làm (đường nét đứt xanh, riêng của bạn, không đổi tiến độ dự án)">Chỉ việc của tôi</span>
            </label>
          </div>
          
          {/* Lọc giai đoạn */}
          {/* Thu phóng (Zoom Level) */}
          <div className="relative" ref={columnFilterRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={columnFilterOpen}
              onClick={() => setColumnFilterOpen(open => !open)}
              className="delivery-toolbar-control flex shrink-0 items-center gap-1.5 rounded-xl border-0 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
                        checked={deliveryColumns.includes(column.key)}
                        // Giữ ít nhất một cột để bảng không trống.
                        disabled={deliveryColumns.includes(column.key) && currentColumns.length <= 1}
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

          <div className="delivery-toolbar-control flex w-[120px] shrink-0 items-center rounded-xl border-0 bg-slate-100 p-1 dark:bg-slate-800">
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

          <div className="delivery-toolbar-control delivery-date-range hidden w-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-0 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-600 dark:bg-sky-500/10 dark:text-sky-400 sm:flex">
            <span>T{timelineStart.getMonth() + 1}/{timelineStart.getFullYear()} - T{timelineEnd.getMonth() + 1}/{timelineEnd.getFullYear()}</span>
          </div>

        </div>

      </div>}
      {delivery.error && <p role="alert" className="delivery-error">{delivery.error} <button onClick={delivery.refresh}>Tải lại</button></p>}
      {selectedProjectId === 'ALL' && <p className="delivery-notice">Chọn một dự án để xem số liệu, hồ sơ và cập nhật trạng thái theo quy tắc mới.</p>}
      {deliveryTab === 'gantt' && progressSection === 'assignment' && <AssignmentMachinePage key={selectedProjectId} projectId={selectedProjectId} items={selectedProjectItems} tasks={tasks} employees={employees} updateGanttItem={updateGanttItem} readOnly={previewing || !canManageAssignments} />}

      {deliveryTab === 'gantt' && progressSection === 'table' && <div className="delivery-chart-heading-scroll" ref={headingScrollRef}>
        <div className="flex" style={{ width: `${LEFT_PANEL_WIDTH + (tableMode === 'full' ? 0 : ganttWidth)}px`, minWidth: '100%' }}>
          <div className="delivery-heading-left sticky left-0 z-40 flex-none relative" style={{ width: `${LEFT_PANEL_WIDTH}px`, position: leftPanelPosition }}>
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
                onLostPointerCapture={() => { if (leftPanelResizeRef.current) finishPanelDrag(); }}
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
                    className={`delivery-column ${column.key} ${column.alignLeft ? 'delivery-column-left' : 'delivery-column-center'} relative flex h-full shrink-0 items-center border-r border-slate-200 dark:border-slate-700 ${column.key === 'createdAt' || ['contractWork', 'actualWork', 'remainingWork', 'varianceWork', 'note'].includes(column.key) ? 'text-[10px]' : ''}`}
                    style={{ width: `${column.width}px`, minWidth: `${column.width}px` }}
                  >
                    <span className="truncate whitespace-nowrap normal-case">{column.label}</span>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Kéo để đổi độ rộng cột ${column.label}`}
                      aria-valuenow={column.width}
                      tabIndex={0}
                      title="Kéo để đổi độ rộng · nhấp đúp để về mặc định"
                      className="delivery-column-resizer"
                      onPointerDown={event => startColumnResize(event, column)}
                      onPointerMove={resizeColumn}
                      onPointerUp={stopColumnResize}
                      onPointerCancel={stopColumnResize}
                      onDoubleClick={() => resetColumnWidth(column.key)}
                      onKeyDown={event => {
                        if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeColumnWidth(column, -8); }
                        if (event.key === 'ArrowRight') { event.preventDefault(); nudgeColumnWidth(column, 8); }
                      }}
                    />
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
                {timelineHeaderCells}
              </div>

            {deliveryData?.permissions.financial && <svg width={ganttWidth} height={80}><DeliveryChartOverlay data={deliveryData} financial items={NO_ITEMS} coordinates={NO_COORDINATES} rowOffsets={NO_ITEMS} timelineStart={timelineStart} pxPerDay={pxPerDay} width={ganttWidth} height={80} now={currentTime} groupPercent={groupPercent} /></svg>}
          </div>
        </div>
      </div>}
      </div>
      <div className="delivery-page-body">
      {deliveryTab === 'gantt' && progressSection === 'table' && <>
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
                onLostPointerCapture={() => { if (leftPanelResizeRef.current) finishPanelDrag(); }}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft') setLeftPanelWidth(width => Math.max(GANTT_TABLE_MIN_WIDTH, width - 16));
                  if (event.key === 'ArrowRight') setLeftPanelWidth(width => Math.min(maxLeftPanelWidth, width + 16));
                }}
              />
              
              {/* Danh Sách Các Hàng Công Việc (Khóa cứng 44px mỗi dòng) */}
              <div style={{ minHeight: `${chartBodyHeight}px` }}>
                {filteredGanttItems.map((item, itemIndex) => <GanttTableRow key={item.id} actions={rowActionsRef} item={item} columns={currentColumns} height={rowHeights[itemIndex]} depth={groupDepthForItem(item)} record={deliveryData?.records[item.id]} metric={metricForRow(item)} aggregate={groupPercent(item)} employees={employees} collapsed={item.isProjectHeader ? collapsedProjectIds.has(item.projectId) : item.isGroup ? collapsedGroupIds.has(item.id) : collapsedTaskIds.has(item.id)} color={item.isGroup ? phaseColorForGroup(item) : item.color} readOnly={previewing || !canManageStructure} canAssign={!previewing && canManageAssignments} highlighted={item.id === linkTargetId} />)}
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
                ref={ganttSvgRef}
                width={ganttWidth}
                height={chartBodyHeight}
                className="relative z-0 block"
                onPointerMove={moveDependencyDrag}
                onPointerUp={finishDependencyDrag}
                onPointerCancel={() => setDependencyDrag(null)}
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
                  {/* Mũi tên đường nối riêng "Chỉ việc của tôi" */}
                  <marker id="arrowhead-personal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                    <polygon points="0 0, 8 4, 0 8" fill="#0d9488" className="dark:fill-teal-300" />
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
                {visibleDependencyLines.map(line => {
                  return (
                    <path
                      key={line.key}
                      d={line.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="stroke"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredDependencyKey(line.key)}
                      onMouseLeave={() => setHoveredDependencyKey(null)}
                      onContextMenu={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!canManageStructure || previewing) return;
                        setHoveredDependencyKey(line.key);
                        setDependencyMenu({ x: event.clientX, y: event.clientY, line });
                      }}
                    >
                      <title>{line.type === 'trunk' ? 'Nhánh chung của liên kết FS' : 'Công việc trước → công việc sau (Finish-to-Start)'}</title>
                    </path>
                  );
                })}

                {/* 3. Vẽ các thanh tiến độ Gantt Bar */}
                {dependencyDrag && (
                  <path
                    d={dependencyPreviewPath}
                    fill="none"
                    stroke={dependencyDrag.targetId ? '#0284c7' : '#861b36'}
                    strokeWidth="2.5"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    markerEnd="url(#arrowhead-active)"
                    className="pointer-events-none"
                  />
                )}
                {linkTargetId && taskCoordinates[linkTargetId] && (
                  <rect
                    className="gantt-link-target pointer-events-none"
                    x={0}
                    y={taskCoordinates[linkTargetId].rowTop}
                    width={ganttWidth}
                    height={taskCoordinates[linkTargetId].rowHeight}
                  />
                )}
                {filteredGanttItems.map((item) => {
                  const coord = taskCoordinates[item.id];
                  if (!coord) return null;
                  if (coord.isTaskAggregate && !collapsedTaskIds.has(item.id)) return null;
                  return (
                    <GanttTaskBar
                      key={item.id}
                      item={item}
                      coord={coord}
                      linkedTask={tasksByGanttId.get(item.id)}
                      tasksByGanttId={tasksByGanttId}
                      highlighted={Boolean(hoveredDependency && (hoveredDependency.sourceId === item.id || hoveredDependency.targetId === item.id))}
                      dropTarget={dependencyDrag?.targetId === item.id}
                      dragging={Boolean(dependencyDrag)}
                      timelineStart={timelineStart}
                      totalTimelineDays={totalTimelineDays}
                      pxPerDay={pxPerDay}
                      currentTime={currentTime}
                      employees={employees}
                      rowsHeight={rowsHeight}
                      freeRework={Boolean(deliveryData?.records[item.id]?.freeRework)}
                      canManageStructure={canManageStructure}
                      canManageAssignments={canManageAssignments}
                      previewing={previewing}
                      actions={chartActionsRef}
                    />
                  );
                })}

                <DeliveryChartOverlay data={deliveryData} financial={false} items={filteredGanttItems} coordinates={taskCoordinates} rowOffsets={rowOffsets} timelineStart={timelineStart} pxPerDay={pxPerDay} width={ganttWidth} height={chartBodyHeight} now={currentTime} groupPercent={groupPercent} />
                <g pointerEvents="none" aria-hidden="true">
                  {personalLines.map(line => (
                    <path
                      key={line.key}
                      d={line.path}
                      fill="none"
                      stroke="#0d9488"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd="url(#arrowhead-personal)"
                      className="dark:stroke-teal-300"
                    />
                  ))}
                  {visibleDependencyLines.map(line => {
                    const isActive = hoveredDependencyKey === line.key;
                    return <path
                      key={`visible-${line.key}`}
                      d={line.path}
                      fill="none"
                      stroke={isActive ? '#ef4444' : '#64748b'}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={!isActive ? 'dark:stroke-white' : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd={line.type === 'dependency' ? (isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead-default)') : undefined}
                      opacity="0.95"
                      style={{ transition: 'stroke 0.2s ease, stroke-width 0.2s ease' }}
                    />;
                  })}
                </g>
                <g pointerEvents="none" aria-hidden="true">
                  {filteredGanttItems.map(item => {
                    const coord = taskCoordinates[item.id];
                    if (!item.parentTaskId || !coord || item.status === 'holiday' || coord.isTaskAggregate) return null;
                    return <rect
                      key={`child-bar-outline-${item.id}`}
                      x={coord.x}
                      y={coord.y}
                      width={coord.width}
                      height={coord.height}
                      rx="6"
                      ry="6"
                      fill="none"
                      stroke="#b45309"
                      strokeWidth="1.4"
                      opacity="0.95"
                    />;
                  })}
                </g>
                {canManageStructure && !previewing && (
                  <g pointerEvents="none" aria-hidden="true">
                    {filteredGanttItems.map(item => {
                      const coord = taskCoordinates[item.id];
                      if (!coord || item.isProjectHeader || item.isGroup || item.status === 'holiday' || coord.isTaskAggregate) return null;
                      return <circle
                        key={`dependency-handle-${item.id}`}
                        cx={dependencyHandleX(coord)}
                        cy={coord.centerY}
                        r="4.5"
                        fill="#ffffff"
                        stroke="#861b36"
                        strokeWidth="2"
                        className="dark:fill-slate-900 dark:stroke-rose-300"
                      />;
                    })}
                  </g>
                )}
              </svg>

            </div>

          </div>
        </div>

      </div>

      </>}
      {deliveryTab === 'new-project' && !companyPermissions.createProject && <p className="delivery-empty">Vai trò của bạn chỉ được xem mục Dự án mới / nhập HĐ: không có thao tác tạo dự án hay nhập hợp đồng.</p>}
      {deliveryTab === 'new-project' && companyPermissions.createProject && <ProjectImportWorkspace onCreated={async id => { await refreshAllData(); setSelectedProjectId(id); setDeliveryTab('gantt'); }} />}
      {deliveryTab !== 'gantt' && deliveryTab !== 'new-project' && <DeliveryResources key={`${deliveryTab}:${selectedProjectId}`} onOpenTask={openDetail} showIT={showIT} tab={deliveryTab} contextBar={(extra, variant = '') => <div className={`delivery-context-inline ${variant}`.trim()}>{projectPicker}{extra}</div>} data={deliveryData} delivery={delivery} projectId={selectedProjectId} employees={employees} items={selectedProjectItems} refreshApp={refreshAllData} readOnly={previewing} users={deliveryUsers} setUsers={setDeliveryUsers} templates={projectTemplates} setTemplates={setProjectTemplates} currentTime={currentTime} />}
      </div></div>
      {deliveryTab === 'gantt' && progressSection === 'table' && <div ref={horizontalScrollRef} className="delivery-horizontal-scroll" role="region" aria-label="Cuộn ngang bảng và biểu đồ Gantt" tabIndex={0}><div /></div>}
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
              {assignmentLocked && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Task đã hoàn thành. Danh sách người đảm nhận được giữ nguyên và chỉ có thể xem.</p>}
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
                          disabled={assignmentLocked}
                          onDisabledClick={() => window.alert(completedAssignmentWarning)}
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
                          disabled={assignmentLocked}
                          value={assignment.estimatedHoursPerDay}
                          onChange={event => setAssignmentRows(current => current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, estimatedHoursPerDay: event.target.value } : row
                          ))}
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => assignmentLocked
                          ? window.alert(completedAssignmentWarning)
                          : setAssignmentRows(current => current.filter((_, rowIndex) => rowIndex !== index))}
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
                          disabled={assignmentLocked}
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
                          disabled={assignmentLocked}
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
                  if (assignmentLocked) {
                    window.alert(completedAssignmentWarning);
                    return;
                  }
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
                <button type="submit" disabled={assignmentSaving || assignmentLocked} className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs disabled:opacity-50">{assignmentSaving ? 'Đang lưu...' : 'Lưu phân công'}</button>
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
                      item.isGroup && projectIdForItem(item) === event.target.value && phasePresetFor(item)
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
                    ...ganttItems.filter(item => item.isGroup && projectIdForItem(item) === groupForm.projectId && phasePresetFor(item))
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

      {dependencyMenu && createPortal(
        <div
          className="fixed z-[300] min-w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          style={{
            left: Math.max(8, Math.min(dependencyMenu.x, window.innerWidth - 176)),
            top: Math.max(8, Math.min(dependencyMenu.y, window.innerHeight - 56))
          }}
          onPointerDown={event => event.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={removeDependencyLine}
            role="menuitem"
          >
            <Trash2 size={16} />
            Xóa liên kết
          </button>
        </div>,
        document.body
      )}

      {showAddProjectModal && <ProjectWizard onClose={()=>setShowAddProjectModal(false)} onCreated={async id=>{await refreshAllData();setSelectedProjectId(id);setShowAddProjectModal(false);}}/>}

    </div>
  );
}
