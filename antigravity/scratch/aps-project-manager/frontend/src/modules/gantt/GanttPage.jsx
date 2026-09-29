import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import DateInput from '../../components/DateInput';
import { formatDateVi, inclusiveDays, scheduledProgress, isTaskOverdue } from '../../utils/date';
import {
  CalendarRange,
  Plus,
  Trash2,
  Building,
  Layers,
  Clock,
  Flame,
  ArrowRight,
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
  const {
    ganttItems,
    tasks,
    projects,
    employees,
    currentTime,
    sidebarCollapsed,
    addGanttItem,
    moveGanttItem,
    deleteGanttItem,
    addProject,
    deleteProject,
    updateGanttItem
  } = useApp();

  // Chọn dự án đang xem
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj-1');

  // Bộ lọc giai đoạn
  const [phaseFilter, setPhaseFilter] = useState('ALL');

  // Chế độ thu phóng (Zoom: 'day' | 'week' | 'month')
  const [zoomLevel, setZoomLevel] = useState('week'); // 1 day = 18px (day), 1 day = 6px (week), 1 day = 3px (month)

  // Trạng thái modal
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', days: 1 });

  // Form thêm công việc cho dự án
  const [taskForm, setTaskForm] = useState({
    code: '',
    projectId: projects[0]?.id || 'proj-1',
    title: '',
    isGroup: false,
    unit: 'TK',
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    days: 5,
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
    startDate: '2026-11-01',
    endDate: '2027-07-02'
  });
  const matchingLocations = VIETNAM_PROVINCES_AND_CITIES.filter(location =>
    normalizeLocationSearch(location).includes(normalizeLocationSearch(locationSearch.trim()))
  );

  // Lọc theo dự án trước khi tính timeline và vẽ các thanh Gantt.
  const filteredGanttItems = useMemo(() => {
    const projectItems = selectedProjectId === 'ALL'
      ? ganttItems
      : ganttItems.filter(g => projectIdForItem(g) === selectedProjectId);

    if (phaseFilter === 'ALL') return projectItems;
    return projectItems.filter(g => g.code.startsWith(phaseFilter));
  }, [ganttItems, tasks, phaseFilter, selectedProjectId]);

  // Tính toán thời gian bắt đầu và kết thúc tổng thể của Gantt
  // Khung thời gian linh hoạt: bao phủ từ tháng sớm nhất đến tháng muộn nhất của dự án
  const timelineStart = useMemo(() => {
    let earliest = new Date('2026-11-01T00:00:00');
    filteredGanttItems.forEach(item => {
      if (item.startDate) {
        const d = new Date(item.startDate);
        if (!isNaN(d.getTime()) && d < earliest) {
          earliest = new Date(d.getFullYear(), d.getMonth(), 1);
        }
      }
    });
    return earliest;
  }, [filteredGanttItems]);

  const timelineEnd = useMemo(() => {
    let latest = new Date('2027-07-15T23:59:59');
    filteredGanttItems.forEach(item => {
      if (item.endDate) {
        const d = new Date(item.endDate);
        if (!isNaN(d.getTime()) && d > latest) {
          latest = new Date(d.getFullYear(), d.getMonth() + 1, 15);
        }
      }
    });
    return latest;
  }, [filteredGanttItems]);

  // Tính tỷ lệ pixel theo ngày dựa trên zoom level
  const pxPerDay = useMemo(() => {
    if (zoomLevel === 'day') return 18;
    if (zoomLevel === 'week') return 7.5;
    return 3.8;
  }, [zoomLevel]);

  // Tổng số ngày trong timeline
  const totalTimelineDays = useMemo(() => {
    return Math.ceil((timelineEnd - timelineStart) / (1000 * 60 * 60 * 24));
  }, [timelineStart, timelineEnd]);

  // Chiều rộng tổng của biểu đồ SVG
  const ganttWidth = Math.max(1200, totalTimelineDays * pxPerDay);

  // Danh sách các cột tháng (T11/26, T12/26, T1/27, T2/27, T3/27, T4/27, T5/27, T6/27, T7/27)
  const monthColumns = useMemo(() => {
    const months = [];
    const curr = new Date(timelineStart);
    while (curr <= timelineEnd) {
      const year = curr.getFullYear();
      const month = curr.getMonth();
      const monthStart = new Date(year, month, 1);
      const nextMonth = new Date(year, month + 1, 1);
      const monthEnd = nextMonth > timelineEnd ? timelineEnd : new Date(nextMonth - 1);

      const daysFromStart = Math.max(0, (monthStart - timelineStart) / (1000 * 60 * 60 * 24));
      const monthDays = (monthEnd - monthStart) / (1000 * 60 * 60 * 24) + 1;

      months.push({
        label: `T${month + 1}/${String(year).slice(2)}`,
        left: daysFromStart * pxPerDay,
        width: monthDays * pxPerDay
      });

      curr.setMonth(curr.getMonth() + 1);
    }
    return months;
  }, [timelineStart, timelineEnd, pxPerDay]);

  // Chiều cao mỗi dòng trong bảng & biểu đồ (khóa cứng pixel để không bao giờ bị lệch)
  const ROW_HEIGHT = 44;
  const HEADER_HEIGHT = zoomLevel === 'day' ? 76 : 52;
  const BAR_HEIGHT = 24;
  const LEFT_PANEL_WIDTH = 792;
  const chartBodyHeight = Math.max(sidebarCollapsed ? 360 : 200, filteredGanttItems.length * ROW_HEIGHT + 20);

  // Tính tọa độ vị trí (x, width, y) của từng thanh Gantt bên trong SVG (bắt đầu từ y = 0)
  const taskCoordinates = useMemo(() => {
    const coords = {};
    filteredGanttItems.forEach((item, index) => {
      const sDate = new Date(item.startDate);
      const eDate = new Date(item.endDate);

      const offsetDays = Math.max(0, (sDate - timelineStart) / (1000 * 60 * 60 * 24));
      const durationDays = Math.max(1, (eDate - sDate) / (1000 * 60 * 60 * 24) + 1);

      const x = offsetDays * pxPerDay;
      const width = Math.max(24, durationDays * pxPerDay);
      // Tọa độ Y căn giữa tuyệt đối theo từng dòng 44px bên trong SVG
      const y = index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
      const centerY = index * ROW_HEIGHT + ROW_HEIGHT / 2;

      coords[item.id] = {
        x,
        y,
        width,
        height: BAR_HEIGHT,
        endX: x + width,
        centerY,
        item
      };
    });
    return coords;
  }, [filteredGanttItems, timelineStart, pxPerDay]);

  // Tạo đường cong mũi tên phụ thuộc Finish-to-Start (FS) - TỰ ĐỘNG NỐI TỪ TASK TRƯỚC XUỐNG
  const dependencyLines = useMemo(() => {
    const lines = [];
    filteredGanttItems.forEach((item, toIndex) => {
      let deps = Array.isArray(item.dependencies) ? [...item.dependencies] : [];

      // Nếu là công việc con và chưa có liên kết, tự động nối từ công việc đứng ngay trước đó
      if (deps.length === 0 && !item.isGroup && toIndex > 0) {
        for (let p = toIndex - 1; p >= 0; p--) {
          const candidate = filteredGanttItems[p];
          if (candidate) {
            deps = [candidate.id];
            break;
          }
        }
      }

      deps.forEach((depId) => {
        const from = taskCoordinates[depId];
        const to = taskCoordinates[item.id];
        if (from && to) {
          const startX = from.endX;
          const startY = from.centerY;
          const targetX = to.x;
          const targetY = to.centerY;

          let pathData = '';
          if (targetX >= startX) {
            const midX = startX + 10;
            pathData = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
          } else {
            const loopX = startX + 10;
            const midY = (startY + targetY) / 2;
            const approachX = Math.max(10, targetX - 10);
            pathData = `M ${startX} ${startY} L ${loopX} ${startY} L ${loopX} ${midY} L ${approachX} ${midY} L ${approachX} ${targetY} L ${targetX} ${targetY}`;
          }

          lines.push({
            key: `${depId}->${item.id}`,
            path: pathData,
            targetX,
            targetY
          });
        }
      });
    });
    return lines;
  }, [filteredGanttItems, taskCoordinates]);

  // Xử lý gửi Form thêm Task
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.title) return;
    const success = await addGanttItem(taskForm);
    if (success) {
      setTaskForm({
        code: '',
        projectId: selectedProjectId === 'ALL' ? projects[0]?.id || 'proj-1' : selectedProjectId,
        title: '',
        isGroup: false,
        unit: 'TK',
        startDate: '2026-11-01',
        endDate: '2026-11-05',
        days: 5,
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
        startDate: '2026-11-01',
        endDate: '2027-07-02'
      });
      setShowAddProjectModal(false);
    }
  };

  const handleEditOpen = (item) => {
    setEditingItem(item);
    setEditForm({ startDate: item.startDate, endDate: item.endDate, days: inclusiveDays(item.startDate, item.endDate) });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const success = await updateGanttItem(editingItem.id, editForm);
    if (success) setEditingItem(null);
  };

  const handleDeleteSelectedProject = async () => {
    if (selectedProjectId === 'ALL') return;
    const success = await deleteProject(selectedProjectId);
    if (success) setSelectedProjectId('ALL');
  };

  return (
    <div className="space-y-5">
      
      {/* THANH ĐIỀU KHIỂN & BỘ LỌC GANTT */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        
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
              onClick={handleDeleteSelectedProject}
              disabled={selectedProjectId === 'ALL'}
              title={selectedProjectId === 'ALL' ? 'Chọn một dự án để xóa' : 'Xóa dự án và toàn bộ dữ liệu liên quan'}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-semibold">
            <span>Tuần T11/26 → T6/27</span>
            <span>•</span>
            <span>Mũi tên FS</span>
          </div>
        </div>

        {/* Bộ lọc giai đoạn & Zoom & Nút thêm */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Lọc giai đoạn */}
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">Tất cả giai đoạn</option>
            <option value="A">A. Thiết Kế Xây Dựng</option>
            <option value="L">L. Nghỉ Lễ Việt Nam</option>
            <option value="B">B. Xin Phép / Pháp Lý</option>
            <option value="C">C. Mời Thầu Thi Công</option>
          </select>

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
            <button
              onClick={() => setZoomLevel('day')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                zoomLevel === 'day' ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-500'
              }`}
            >
              Chi tiết
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
              setTaskForm(current => ({ ...current, projectId: projectId || '', dependencies: [] }));
              setShowAddTaskModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Công Việc</span>
          </button>

        </div>

      </div>

      {/* CHỈ DẪN MÀU SẮC (LEGEND) */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs">
        <span className="font-bold text-slate-400 uppercase text-[10px]">Ghi chú màu:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-sky-600 inline-block" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">A. Thiết kế</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">L. Nghỉ lễ Việt Nam</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">B. Xin phép / Pháp lý</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-600 inline-block" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">C. Mời thầu thi công</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto text-slate-500 dark:text-slate-400">
          <ArrowRight className="w-3.5 h-3.5 text-sky-500" />
          <span>Mũi tên liên kết Finish-to-Start (FS)</span>
        </div>
      </div>

      {/* BẢNG TIẾN ĐỘ & BIỂU ĐỒ GANTT TƯƠNG TÁC (CỘT TRỜI ĐÓNG BĂNG) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        
        {/* Banner thông báo chế độ kéo ngang & đóng băng */}
        <div className="px-4 py-2 bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            CỘT TRỜI ĐÓNG BĂNG : KÉO THANH CUỘN NGANG ĐỂ XEM THANH TIẾN ĐỘ BAR
          </span>
          <span className="text-slate-400 font-mono text-[10px]">
            {filteredGanttItems.length} hạng mục công việc
          </span>
        </div>

        {/* Khung cuộn ngang chứa cả Bảng bên trái + Biểu đồ bên phải */}
        <div className={`overflow-x-auto relative isolate overflow-y-auto ${
          sidebarCollapsed ? 'max-h-[calc(100vh-220px)]' : 'max-h-[700px]'
        }`}>
          <div className="flex" style={{ width: `${LEFT_PANEL_WIDTH + ganttWidth}px`, minWidth: '100%' }}>
            
            {/* ================= KHUNG TRÁI: BẢNG DỮ LIỆU CÔNG VIỆC (ĐÓNG BĂNG FREEZE) ================= */}
            <div className="w-[792px] min-w-[792px] max-w-[792px] flex-shrink-0 sticky left-0 z-40 bg-white dark:bg-slate-900 border-r-2 border-slate-300 dark:border-slate-700 shadow-md">
              
              {/* Header Bảng Bên Trái - Khóa cứng 52px */}
              <div
                className="sticky top-0 z-50 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider box-border"
                style={{ height: `${HEADER_HEIGHT}px`, minHeight: `${HEADER_HEIGHT}px`, maxHeight: `${HEADER_HEIGHT}px` }}
              >
                <div className="w-14 min-w-[56px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">STT</div>
                <div className="w-[240px] min-w-[240px] max-w-[240px] py-2 px-3 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap truncate shrink-0">CÔNG VIỆC TRONG DỰ ÁN</div>
                <div className="w-14 min-w-[56px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">ĐV</div>
                <div className="w-20 min-w-[80px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">BẮT ĐẦU</div>
                <div className="w-20 min-w-[80px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">KẾT THÚC</div>
                <div className="w-14 min-w-[56px] text-center py-2 px-1 border-r border-slate-200 dark:border-slate-700 shrink-0">NGÀY</div>
                <div className="w-28 min-w-[112px] py-2 px-2 border-r border-slate-200 dark:border-slate-700 truncate shrink-0">GHI CHÚ</div>
                <div className="w-28 min-w-[112px] text-center py-2 px-1 shrink-0">THAO TÁC</div>
              </div>

              {/* Danh Sách Các Hàng Công Việc (Khóa cứng 44px mỗi dòng) */}
              <div style={{ minHeight: `${chartBodyHeight}px` }}>
                {filteredGanttItems.map((item) => {
                  const isGroup = item.isGroup;
                  const isHoliday = item.status === 'holiday';

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 h-[44px] min-h-[44px] max-h-[44px] box-border border-b border-slate-100 dark:border-slate-800/80 overflow-hidden ${
                        isGroup
                          ? 'font-bold bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-white'
                          : isHoliday
                          ? 'bg-amber-500/5 text-amber-800 dark:text-amber-200'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {/* Cột STT */}
                      <div className="w-14 min-w-[56px] text-center py-1 px-1 font-mono font-semibold border-r border-slate-100 dark:border-slate-800 truncate shrink-0">
                        {item.code}
                      </div>

                      {/* Cột Tên Công Việc (Có thụt dòng theo cấp WBS) */}
                      <div
                        className="w-[240px] min-w-[240px] max-w-[240px] py-1 px-3 border-r border-slate-100 dark:border-slate-800 truncate flex items-center gap-1.5 shrink-0"
                        style={{
                          paddingLeft: (item.code && item.code.includes('.'))
                            ? '24px'
                            : (item.code && item.code.length > 1)
                            ? '16px'
                            : '10px'
                        }}
                      >
                        {isGroup && (
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                        )}
                        <span className="truncate" title={item.title}>
                          {item.title}
                        </span>
                      </div>

                      {/* Cột ĐV (Đơn vị thực hiện: TK, PL, CDT, NT, VN) */}
                      <div className="w-14 min-w-[56px] text-center py-1 px-1 font-mono font-bold text-[11px] border-r border-slate-100 dark:border-slate-800 text-sky-600 dark:text-sky-400 shrink-0">
                        {item.unit}
                      </div>

                      {/* Cột Bắt Đầu */}
                      <div className="w-20 min-w-[80px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">
                        {formatDateVi(item.startDate) || '-'}
                      </div>

                      {/* Cột Kết Thúc */}
                      <div className="w-20 min-w-[80px] text-center py-1 px-1 text-[11px] border-r border-slate-100 dark:border-slate-800 text-slate-500 shrink-0">
                        {formatDateVi(item.endDate) || '-'}
                      </div>

                      {/* Cột Ngày (Duration) */}
                      <div className="w-14 min-w-[56px] text-center py-1 px-1 font-bold text-[11px] border-r border-slate-100 dark:border-slate-800 shrink-0">
                        {item.days}
                      </div>

                      {/* Cột Ghi Chú / GATE */}
                      <div className="w-28 min-w-[112px] py-1 px-2 text-[10px] text-slate-400 truncate border-r border-slate-100 dark:border-slate-800 shrink-0" title={item.notes}>
                        {item.notes || '-'}
                      </div>

                      {/* Cột Thao Tác (Di chuyển lên/xuống & Xóa) */}
                      <div className="w-28 min-w-[112px] flex items-center justify-center gap-0.5 py-1 px-1 shrink-0">
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
            <div className="relative z-0 flex-1 bg-slate-50/50 dark:bg-slate-950/50" style={{ width: `${ganttWidth}px` }}>
              
              {/* Header Tháng & Tuần của Biểu Đồ Gantt - Khóa cứng 52px */}
              <div
                className="sticky top-0 z-30 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex box-border"
                style={{ width: `${ganttWidth}px`, height: `${HEADER_HEIGHT}px`, minHeight: `${HEADER_HEIGHT}px`, maxHeight: `${HEADER_HEIGHT}px` }}
              >
                {monthColumns.map((col, idx) => (
                  <div
                    key={idx}
                    className={`border-r border-slate-200 dark:border-slate-700 flex flex-col items-center text-center select-none overflow-hidden ${zoomLevel === 'day' ? 'justify-start px-0' : 'justify-center px-1'}`}
                    style={{ width: `${col.width}px` }}
                  >
                    <span className={`font-extrabold text-xs text-sky-600 dark:text-sky-400 ${zoomLevel === 'day' ? 'flex h-[28px] min-h-[28px] items-center' : ''}`}>
                      {col.label}
                    </span>
                    {zoomLevel === 'day' ? (
                      <div className="flex h-6 min-h-6 w-full border-t border-slate-200 dark:border-slate-700">
                        {Array.from({ length: Math.round(col.width / pxPerDay) }, (_, dayIndex) => (
                          <div
                            key={dayIndex + 1}
                            className="flex h-full shrink-0 items-center justify-center border-r border-slate-200/80 text-[9px] font-medium leading-none text-slate-500 last:border-r-0 dark:border-slate-700 dark:text-slate-400"
                            style={{ width: `${pxPerDay}px` }}
                            title={`${dayIndex + 1} · ${col.label}`}
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
                style={{ width: `${ganttWidth}px`, height: `${chartBodyHeight}px`, top: `${HEADER_HEIGHT}px` }}
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
                    <polygon points="0 0, 7 3.5, 0 7" fill="#0284c7" />
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
                </defs>

                {/* 1. Vẽ các đường kẻ ngang phân tách từng dòng */}
                {filteredGanttItems.map((_, idx) => (
                  <line
                    key={idx}
                    x1="0"
                    y1={(idx + 1) * ROW_HEIGHT}
                    x2={ganttWidth}
                    y2={(idx + 1) * ROW_HEIGHT}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    className="dark:stroke-slate-800/60"
                  />
                ))}

                {/* 2. HIỂN THỊ MŨI TÊN KẺ XUỐNG CÔNG VIỆC TIẾP THEO TRONG DỰ ÁN (FS Dependency) */}
                {dependencyLines.map((line) => (
                  <path
                    key={line.key}
                    d={line.path}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="1.8"
                    strokeDasharray="4 2"
                    markerEnd="url(#arrowhead)"
                    className="transition-all hover:stroke-sky-400"
                  />
                ))}

                {/* 3. Vẽ các thanh tiến độ Gantt Bar */}
                {filteredGanttItems.map((item) => {
                  const coord = taskCoordinates[item.id];
                  if (!coord) return null;

                  const isGroup = item.isGroup;
                  const isHoliday = item.status === 'holiday';
                  const linkedTask = tasks.find(task => task.ganttId === item.id);
                  const assignee = employees.find(employee => employee.id === linkedTask?.employeeId || employee.name === item.assignee);
                  const progressTask = linkedTask || item;
                  const progress = scheduledProgress(progressTask, assignee?.standardHours || 8, currentTime);
                  const overdue = isTaskOverdue(progressTask, currentTime);

                  // Chọn màu gradient
                  let fillColor = 'url(#grad-sky)';
                  if (item.color === '#eab308' || isHoliday) fillColor = 'url(#grad-amber)';
                  if (item.color === '#dc2626') fillColor = 'url(#grad-red)';
                  if (item.color === '#16a34a') fillColor = 'url(#grad-green)';

                  return (
                    <g key={item.id} className="cursor-pointer group">
                      
                      {/* Dải ruy băng mờ kéo ngang cho ngày lễ */}
                      {isHoliday && (
                        <rect
                          x={coord.x}
                          y={0}
                          width={coord.width}
                          height={filteredGanttItems.length * ROW_HEIGHT}
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
                          fill={overdue ? '#ef4444' : progress >= 80 && progressTask.status !== 'completed' ? '#f59e0b' : '#10b981'}
                          fillOpacity="0.78"
                          className="pointer-events-none transition-all duration-500"
                        >
                          <title>{`Tiến độ theo thời gian: ${progress}%${overdue ? ' · Quá hạn' : ''}`}</title>
                        </rect>
                      )}

                      {/* Nhãn trên thanh hoặc cạnh thanh: Tên người đảm nhận, thời gian, tăng ca */}
                      <text
                        x={coord.endX + 8}
                        y={coord.centerY + 4}
                        fill="#64748b"
                        fontSize="11"
                        fontWeight="600"
                        className="dark:fill-slate-300 select-none pointer-events-none"
                      >
                        {isGroup ? `${item.title} (${item.days} ngày)` : `${item.assignee} (${item.days} ngày)`}
                        {item.overtimeHours && (
                          <tspan fill="#f59e0b" fontWeight="bold"> [+{item.overtimeHours}h OT]</tspan>
                        )}
                        {item.speed === 'early' && (
                          <tspan fill="#10b981"> [Sớm]</tspan>
                        )}
                        {item.speed === 'delayed' && (
                          <tspan fill="#ef4444" fontWeight="bold"> [Chậm]</tspan>
                        )}
                        {overdue && (
                          <tspan fill="#ef4444" fontWeight="bold"> [Quá hạn]</tspan>
                        )}
                        {!overdue && progress >= 80 && progressTask.status !== 'completed' && (
                          <tspan fill="#f59e0b" fontWeight="bold"> [Sắp hết hạn]</tspan>
                        )}
                      </text>

                      {/* Chữ hiển thị bên trong thanh nếu đủ rộng */}
                      {coord.width >= 40 && (
                        <text
                          x={coord.x + 8}
                          y={coord.centerY + 4}
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="bold"
                          className="select-none pointer-events-none truncate"
                        >
                          {item.code} {coord.width > 90 ? `- ${item.days}d` : ''}
                        </text>
                      )}

                    </g>
                  );
                })}

              </svg>

            </div>

          </div>
        </div>

      </div>

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
              
              <div className="grid grid-cols-3 gap-3">
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
                    Đơn Vị (ĐV)
                  </label>
                  <select
                    value={taskForm.unit}
                    onChange={(e) => setTaskForm({ ...taskForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-sky-600"
                  >
                    <option value="TK">TK (Thiết kế)</option>
                    <option value="CDT">CDT (Chủ đầu tư)</option>
                    <option value="PL">PL (Pháp lý)</option>
                    <option value="NT">NT (Nhà thầu)</option>
                    <option value="VN">VN (Lễ Việt Nam)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Màu Sắc
                  </label>
                  <select
                    value={taskForm.color}
                    onChange={(e) => setTaskForm({ ...taskForm, color: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="#0284c7">Xanh dương (Thiết kế)</option>
                    <option value="#eab308">Vàng (Nghỉ lễ)</option>
                    <option value="#dc2626">Đỏ (Pháp lý)</option>
                    <option value="#16a34a">Xanh lá (Đấu thầu)</option>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Dự Án
                  </label>
                  <select
                    required
                    value={taskForm.projectId}
                    onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value, dependencies: [] })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
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
                    {employees.map(e => (
                      <option key={e.id} value={e.name}>{e.name} ({e.title})</option>
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ngày Bắt Đầu
                  </label>
                  <DateInput
                    required
                    value={taskForm.startDate}
                    onChange={(value) => updateDateRange(setTaskForm, 'startDate', value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ngày Kết Thúc
                  </label>
                  <DateInput
                    required
                    value={taskForm.endDate}
                    onChange={(value) => updateDateRange(setTaskForm, 'endDate', value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
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
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Ghi Chú / GATE Kiểm Soát
                </label>
                <input
                  type="text"
                  placeholder="VD: GATE 1B: CĐT phê duyệt tối đa 3 ngày"
                  value={taskForm.notes}
                  onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
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
