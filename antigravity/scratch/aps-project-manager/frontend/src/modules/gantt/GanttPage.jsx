import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import DateInput from '../../components/DateInput';
import { formatDateVi, inclusiveDays, scheduledProgress, isTaskOverdue, taskDelayHours, formatDelayHours, todayIsoDate } from '../../utils/date';
import {
  CalendarRange,
  Plus,
  Trash2,
  Building,
  Layers,
  Clock,
  Flame,
  Maximize2,
  Calendar,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ChevronUp,
  ChevronDown,
  Pencil
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
    moveGanttItem,
    deleteGanttItem,
    addProject,
    updateProject,
    deleteProject,
    updateGanttItem
  } = useApp();

  // Chọn dự án đang xem
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj-1');
  const [collapsedProjectIds, setCollapsedProjectIds] = useState(() => new Set());

  const toggleProjectCollapsed = (projectId) => {
    setCollapsedProjectIds(current => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // Chế độ thu phóng (Zoom: 'day' | 'week' | 'month')
  const [zoomLevel, setZoomLevel] = useState('week'); // 1 day = 18px (day), 1 day = 6px (week), 1 day = 3px (month)

  // Trạng thái modal
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
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
    assignee: employees[0]?.name || 'Trần Quốc Hưng',
    notes: '',
    color: '#0284c7',
    dependencies: [],
    speed: 'on_time',
    insertAfterId: ''
  });

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
        ...(collapsedProjectIds.has(project.id) ? [] : projectItems)
      ];
    }

    return projects.flatMap(project => {
      const items = projectItems.filter(item => projectIdForItem(item) === project.id);
      if (items.length === 0) return [];
      return [
        { id: `project-heading-${project.id}`, projectId: project.id, title: project.name, isProjectHeader: true },
        ...(collapsedProjectIds.has(project.id) ? [] : items)
      ];
    });
  }, [ganttItems, tasks, projects, selectedProjectId, collapsedProjectIds]);

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
    const assigneeName = (item.assignee || '').trim().toLowerCase();
    const additionalAssignees = (item.overtimeContributions || []).filter(contribution =>
      (contribution.employeeName || '').trim().toLowerCase() !== assigneeName
    ).length;
    return ROW_HEIGHT + additionalAssignees * 18;
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
          if (candidate && !candidate.isProjectHeader && candidate.projectId === item.projectId) {
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
        edges.set(key, { key, from, to });
      });
    });

    return [...edges.values()].map(({ key, from, to }) => {
      const startX = from.x;
      const startY = from.centerY;
      const endX = to.x;
      const endY = to.centerY;
      const horizontalDistance = endX - startX;
      const controlX = horizontalDistance > 32
        ? horizontalDistance / 2
        : -Math.max(24, Math.abs(horizontalDistance) / 2);
      return {
        key,
        path: `M ${startX} ${startY} C ${startX + controlX} ${startY}, ${endX - controlX} ${endY}, ${endX} ${endY}`,
        type: 'dependency'
      };
    });
  }, [filteredGanttItems, taskCoordinates]);

  // Xử lý gửi Form thêm Task
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.title) return;
    const project = projects.find(item => item.id === taskForm.projectId);
    if (project && ((project.startDate && taskForm.startDate < project.startDate) || (project.endDate && taskForm.endDate > project.endDate))) {
      window.alert(`Ngày task phải nằm trong thời gian dự án (${formatDateVi(project.startDate)} → ${formatDateVi(project.endDate)}).`);
      return;
    }
    const success = await addGanttItem({ ...taskForm, estimatedHoursPerDay: taskForm.estimatedHours });
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
        assignee: employees[0]?.name || 'Trần Quốc Hưng',
        notes: '',
        color: '#0284c7',
        dependencies: [],
        speed: 'on_time',
        insertAfterId: ''
      });
      setShowAddTaskModal(false);
    }
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

  const handleDeleteSelectedProject = async () => {
    if (selectedProjectId === 'ALL') return;
    const success = await deleteProject(selectedProjectId);
    if (success) setSelectedProjectId('ALL');
  };

  return (
    <div className="w-full space-y-0">
      
      {/* THANH ĐIỀU KHIỂN & BỘ LỌC GANTT */}
      <div className="sticky top-16 z-[60] w-full px-4 sm:px-5 py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        
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

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-semibold">
            <span>T{timelineStart.getMonth() + 1}/{timelineStart.getFullYear()} - T{timelineEnd.getMonth() + 1}/{timelineEnd.getFullYear()}</span>
          </div>
        </div>

        {/* Thu phóng & Nút thêm */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Lọc giai đoạn */}
          {/* Thu phóng (Zoom Level) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setZoomLevel('month')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                zoomLevel === 'month' ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-500'
              }`}
            >
              Tháng
            </button>
            <button
              onClick={() => setZoomLevel('week')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                zoomLevel === 'week' ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-500'
              }`}
            >
              Tuần
            </button>
          </div>

          {/* Nút Tạo Dự Án Mới */}
          <button
            onClick={() => setShowAddProjectModal(true)}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
          >
            + Dự Án Mới
          </button>

          {/* Nút Thêm Công Việc Cho Dự Án */}
          <button
            onClick={() => {
              const projectId = selectedProjectId === 'ALL' ? projects[0]?.id : selectedProjectId;
              const currentDate = todayIsoDate();
              setTaskForm(current => ({
                ...current,
                projectId: projectId || '',
                startDate: currentDate,
                endDate: currentDate,
                days: 1,
                estimatedHours: 8,
                estimatedHoursEdited: false,
                dependencies: []
              }));
              setShowAddTaskModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Công Việc</span>
          </button>

        </div>

      </div>

      {/* BẢNG TIẾN ĐỘ & BIỂU ĐỒ GANTT TƯƠNG TÁC (CỘT TRỜI ĐÓNG BĂNG) */}
      <div className="w-full bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Khung cuộn ngang chứa cả Bảng bên trái + Biểu đồ bên phải */}
        <div
          ref={timelineScrollRef}
          className="h-[calc(100vh-180px)] min-h-[320px] overflow-x-auto overflow-y-auto relative isolate bg-slate-100 dark:bg-slate-950"
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
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                        )}
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
                        {rowStatus && <span className={`inline-flex max-w-full px-1.5 py-1 rounded-full text-[9px] font-bold whitespace-nowrap ${rowStatus.style}`}>{rowStatus.label}</span>}
                      </div>

                      {/* Cột Thao Tác (Di chuyển lên/xuống & Xóa) */}
                      <div className="w-[104px] min-w-[104px] flex items-center justify-center gap-0.5 py-1 px-1 shrink-0">
                        <button
                          onClick={() => handleEditOpen(item)}
                          className="p-1 rounded text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
                          title="Chỉnh sửa thời gian công việc"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveGanttItem(item.id, 'up')}
                          className="p-1 rounded text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
                          title="Di chuyển lên trên"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveGanttItem(item.id, 'down')}
                          className="p-1 rounded text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
                          title="Di chuyển xuống dưới"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
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
                    id="arrowhead"
                    markerWidth="7"
                    markerHeight="7"
                    refX="5"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 4, 0 8" fill="#64748b" />
                  </marker>
                  
                  {/* Gradient cho các thanh bar */}
                  <linearGradient id="grad-sky" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                  <linearGradient id="grad-amber" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d97706" />
                    <stop offset="100%" stopColor="#fbbf24" />
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
                {dependencyLines.map(line => (
                  <path
                    key={`${line.key}-halo`}
                    d={line.path}
                    fill="none"
                    stroke="#f8fafc"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                ))}
                {dependencyLines.map(line => (
                  <path
                    key={line.key}
                    d={line.path}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth={line.type === 'trunk' ? '2.1' : '1.9'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd={line.type === 'dependency' ? 'url(#arrowhead)' : undefined}
                    className="transition-colors hover:stroke-sky-500"
                  >
                    <title>{line.type === 'trunk' ? 'Nhánh chung của liên kết FS' : 'Công việc trước → công việc sau (Finish-to-Start)'}</title>
                  </path>
                ))}

                {/* 3. Vẽ các thanh tiến độ Gantt Bar */}
                {filteredGanttItems.map((item) => {
                  const coord = taskCoordinates[item.id];
                  if (!coord) return null;

                  const isGroup = item.isGroup;
                  const isHoliday = item.status === 'holiday';
                  const linkedTask = tasks.find(task => task.ganttId === item.id);
                  const assignee = employees.find(employee => employee.id === linkedTask?.employeeId || employee.name === item.assignee);
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

                      {/* Thanh Gantt: Nhóm tổng hoặc Hạng mục chi tiết */}
                      {isGroup ? (
                        <rect
                          x={coord.x}
                          y={coord.y + 3}
                          width={coord.width}
                          height={coord.height - 6}
                          rx="4"
                          ry="4"
                          fill="#0369a1"
                          className="shadow-sm"
                          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"
                        />
                      ) : (
                        <rect
                          x={coord.x}
                          y={coord.y}
                          width={coord.width}
                          height={coord.height}
                          rx="6"
                          ry="6"
                          fill={fillColor}
                          className="transition-all hover:opacity-90 shadow-sm"
                          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
                        />
                      )}

                      {!isGroup && progress > 0 && (
                        <rect
                          x={coord.x}
                          y={coord.y}
                          width={coord.width * progress / 100}
                          height={coord.height}
                          rx="6"
                          ry="6"
                          fill={statusColor}
                          fillOpacity="1"
                          className="pointer-events-none transition-all duration-500"
                        >
                          <title>{`Tiến độ theo thời gian: ${progress}%${overdue ? ' · Quá hạn' : ''}`}</title>
                        </rect>
                      )}

                      {/* Nhãn trên thanh hoặc cạnh thanh: Tên người đảm nhận, thời gian, tăng ca */}
                      <text
                        x={coord.endX + 8}
                        y={isGroup ? coord.centerY + 4 : coord.rowTop + ROW_HEIGHT / 2 + 4}
                        fill="#64748b"
                        stroke="#f1f5f9"
                        strokeWidth="4"
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        fontSize="11"
                        fontWeight="600"
                        className="dark:fill-slate-300 dark:stroke-slate-950 select-none pointer-events-none"
                      >
                        {isGroup ? `${item.title} (${item.days} ngày)` : <>
                          <tspan fill="#64748b">{item.assignee} ({item.days} ngày{item.days > 1 ? `, ${Number(item.estimatedHoursPerDay) || Number(item.estimatedHours) / item.days || 8}h/ngày` : `, ${Number(item.estimatedHours) || item.days * 8}h`})</tspan>
                          {(item.overtimeContributions || [])
                            .filter(contribution => (contribution.employeeName || '').trim().toLowerCase() === (item.assignee || '').trim().toLowerCase())
                            .map(contribution => (
                              <tspan key={contribution.employeeId || contribution.employeeName} fill="#d97706" fontWeight="bold">
                                {' '}[+{contribution.hours}h OT]
                              </tspan>
                            ))}
                          {(item.overtimeContributions || [])
                            .filter(contribution => (contribution.employeeName || '').trim().toLowerCase() !== (item.assignee || '').trim().toLowerCase())
                            .map((contribution, contributionIndex) => (
                            <tspan
                              key={contribution.employeeId || contribution.employeeName}
                              x={coord.endX + 8}
                              dy={18}
                              fill="#d97706"
                              fontWeight="bold"
                            >
                              {contribution.employeeName} [+{contribution.hours}h OT]
                            </tspan>
                          ))}
                          {!(item.overtimeContributions || []).length && item.overtimeHours > 0 && (
                            <tspan fill="#f59e0b" fontWeight="bold"> [+{item.overtimeHours}h OT]</tspan>
                          )}
                        </>}
                        {completedEarly && (
                          <tspan fill="#15803d" fontWeight="bold"> [Hoàn thành sớm{earlyHours > 0 ? ` · Sớm ${formatDelayHours(earlyHours)}` : ''}]</tspan>
                        )}
                        {overdue && (
                          <tspan fill="#ef4444" fontWeight="bold"> [Quá hạn{delayHours > 0 ? ` ${formatDelayHours(delayHours)}` : ''}]</tspan>
                        )}
                        {!overdue && (completedLate || item.speed === 'delayed' || delayHours > 0) && (
                          <tspan fill="#d97706" fontWeight="bold"> [{completedLate ? (delayHours > 0 ? `Hoàn thành muộn · Trễ ${formatDelayHours(delayHours)}` : 'Hoàn thành muộn') : (delayHours > 0 ? `Chậm ${formatDelayHours(delayHours)}` : 'Chậm trễ')}]</tspan>
                        )}
                        {!overdue && progress >= 80 && progressTask.status !== 'completed' && (
                          <tspan fill="#f59e0b" fontWeight="bold"> [Sắp hết hạn]</tspan>
                        )}
                      </text>

                    </g>
                  );
                })}

              </svg>

            </div>

          </div>
        </div>

      </div>

      {showEditProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
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
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
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
        </div>
      )}

      {/* MODAL 1: THÊM CÔNG VIỆC VÀO DỰ ÁN */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
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
                  <select
                    value={taskForm.assignee}
                    onChange={(e) => setTaskForm({ ...taskForm, assignee: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.name}>{employee.name} ({employee.title})</option>
                    ))}
                  </select>
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

              {/* VỊ TRÍ CHÈN TRONG TIẾN ĐỘ WBS */}
              <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/80 dark:border-sky-800/60 space-y-1.5">
                <label className="text-xs font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-600" />
                  Vị Trí Đặt Trong Tiến Độ Dự Án
                </label>
                <select
                  value={taskForm.insertAfterId}
                  onChange={(e) => setTaskForm({ ...taskForm, insertAfterId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">
                    ⚡ Tự động theo mã STT (Ví dụ: A1.3 sẽ tự động nằm ngay sau A1.2 và trước A2)
                  </option>
                  <optgroup label="Hoặc chọn chèn sau một công việc cụ thể:">
                    {ganttItems.map((g) => (
                      <option key={g.id} value={g.id}>
                        Nằm ngay sau [{g.code}] {g.title}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {taskForm.code && !taskForm.insertAfterId && (
                  <p className="text-[11px] text-sky-600 dark:text-sky-400 italic">
                    💡 Khi nhập mã <strong>{taskForm.code}</strong>, hệ thống tự động tìm vị trí thích hợp nhất trong cây WBS (sau các mã nhỏ hơn và trước các mã lớn hơn).
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      setTaskForm(current => ({ ...current, projectId: e.target.value, dependencies: [], startDate, endDate, days: inclusiveDays(startDate, endDate), estimatedHours: current.estimatedHoursEdited ? current.estimatedHours : 8 }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Công Việc Trước (Mũi tên liên kết FS)
                  </label>
                  <select
                    onChange={(e) => {
                      const val = e.target.value;
                      setTaskForm({ ...taskForm, dependencies: val ? [val] : [] });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="">-- Không có liên kết FS --</option>
                    {ganttItems.filter(g => projectIdForItem(g) === taskForm.projectId).map(g => (
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
        </div>
      )}

      {/* MODAL 2: TẠO DỰ ÁN MỚI */}
      {showAddProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
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
        </div>
      )}

    </div>
  );
}
