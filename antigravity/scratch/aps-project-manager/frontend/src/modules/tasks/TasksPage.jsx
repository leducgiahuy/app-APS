import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import DateInput from '../../components/DateInput';
import { formatDateVi, inclusiveDays, scheduledProgress, isTaskOverdue, isTaskActiveOnDate, taskDelayHours, formatDelayHours, todayIsoDate } from '../../utils/date';
import {
  CheckSquare,
  Clock,
  Flame,
  Plus,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Hourglass,
  Building,
  User,
  Search,
  Trash2,
  TrendingUp,
  Tag
} from 'lucide-react';

const normalizeEmployeeSearch = value => String(value || '')
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd');

export default function TasksPage() {
  const today = todayIsoDate();
  const {
    tasks,
    employees,
    projects,
    overtimes,
    currentTime,
    selectedDate,
    addTask,
    updateTask,
    deleteTask,
    addOvertime,
    deleteOvertime
  } = useApp();

  // Tab chuyển đổi: 'tasks' (Phân công) hoặc 'ot' (Tăng ca)
  const [activeSubTab, setActiveSubTab] = useState('tasks');

  // Trạng thái mở modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOtModal, setShowOtModal] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const tasksForSelectedDate = tasks.filter(task => isTaskActiveOnDate(task, selectedDate));
  const visibleTasks = tasksForSelectedDate.filter(task => {
    const assignee = employees.find(employee => employee.id === task.employeeId);
    const assigneeName = task.employeeName || assignee?.name || '';
    return normalizeEmployeeSearch(assigneeName).includes(normalizeEmployeeSearch(employeeSearch.trim()));
  });

  // Form phân công task
  const [taskForm, setTaskForm] = useState({
    projectId: projects[0]?.id || '',
    code: '',
    title: '',
    employeeId: employees[0]?.id || '',
    startDate: today,
    endDate: today,
    estimatedDays: 1,
    estimatedHours: Number(employees[0]?.standardHours) || 8,
    estimatedHoursEdited: false,
    priority: 'normal'
  });

  // Projects load asynchronously; keep the form selection tied to a real project.
  useEffect(() => {
    if (projects.length === 0) return;
    setTaskForm(current => projects.some(project => project.id === current.projectId)
      ? current
      : { ...current, projectId: projects[0].id });
  }, [projects]);

  useEffect(() => {
    if (employees.length === 0) return;
    setTaskForm(current => {
      if (employees.some(employee => employee.id === current.employeeId)) return current;
      const employee = employees[0];
      return {
        ...current,
        employeeId: employee.id,
        estimatedHours: current.estimatedHoursEdited ? current.estimatedHours : current.estimatedDays * (Number(employee.standardHours) || 8)
      };
    });
  }, [employees]);

  useEffect(() => {
    const shouldLockScroll = showTaskModal || showOtModal;
    const previousOverflow = document.body.style.overflow;
    const previousOverflowX = document.body.style.overflowX;

    if (shouldLockScroll) {
      document.body.style.overflow = 'hidden';
      document.body.style.overflowX = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overflowX = previousOverflowX;
    };
  }, [showTaskModal, showOtModal]);

  // Form đăng ký tăng ca (OT)
  const [otForm, setOtForm] = useState({
    taskId: '',
    employeeId: employees[0]?.id || '',
    hours: 2,
    date: today,
    reason: ''
  });

  // Xử lý gửi Form Task
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    const projectId = projects.some(project => project.id === taskForm.projectId)
      ? taskForm.projectId
      : projects[0]?.id;
    if (!taskForm.title || !taskForm.employeeId || !projectId) return;
    const project = projects.find(item => item.id === projectId);
    if (project && ((project.startDate && taskForm.startDate < project.startDate) || (project.endDate && taskForm.endDate > project.endDate))) {
      window.alert(`Ngày task phải nằm trong thời gian dự án (${formatDateVi(project.startDate)} → ${formatDateVi(project.endDate)}).`);
      return;
    }
    const success = await addTask({ ...taskForm, projectId, estimatedHoursPerDay: taskForm.estimatedHours });
    if (success) {
      setTaskForm({
        projectId: projects[0]?.id || '',
        code: '',
        title: '',
        employeeId: employees[0]?.id || '',
        startDate: todayIsoDate(),
        endDate: todayIsoDate(),
        estimatedDays: 1,
        estimatedHours: Number(employees[0]?.standardHours) || 8,
        estimatedHoursEdited: false,
        priority: 'normal'
      });
      setShowTaskModal(false);
    }
  };

  const updateTaskDate = (field, value) => {
    setTaskForm(current => {
      const next = { ...current, [field]: value };
      if (next.startDate && next.endDate && next.endDate < next.startDate) {
        if (field === 'startDate') next.endDate = value;
        else next.startDate = value;
      }
      next.estimatedDays = inclusiveDays(next.startDate, next.endDate);
      if (!current.estimatedHoursEdited) next.estimatedHours = Number(employees.find(item => item.id === current.employeeId)?.standardHours) || 8;
      return next;
    });
  };

  // Xử lý gửi Form Tăng ca
  const handleOtSubmit = async (e) => {
    e.preventDefault();
    if (!otForm.employeeId || !otForm.hours) return;
    const success = await addOvertime(otForm);
    if (success) {
      setOtForm({
        taskId: '',
        employeeId: employees[0]?.id || '',
        hours: 2,
        date: todayIsoDate(),
        reason: ''
      });
      setShowOtModal(false);
    }
  };

  // Đổi trạng thái tiến độ nhanh (Sớm / Đúng hạn / Chậm)
  const handleCompleteTask = (task) => {
    updateTask(task.id, { status: 'completed', progress: 100 });
  };

  const getTaskSpeedStatus = (task) => {
    if (task.status === 'completed') return task.speedStatus || 'on_time';
    if (taskDelayHours(task, currentTime) > 0) return 'delayed';
    const today = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}`;
    return today > task.endDate ? 'delayed' : 'on_time';
  };

  return (
    <div className="space-y-4">
      
      {/* Thanh chuyển đổi 2 Mục: Phân công task & Đăng ký tăng ca */}
      <div className="sticky top-16 z-40 w-full min-w-0 flex flex-col 2xl:flex-row 2xl:flex-nowrap items-center justify-between gap-3 px-4 sm:px-5 py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 w-full 2xl:w-auto 2xl:flex-none min-w-0">
          <button
            onClick={() => setActiveSubTab('tasks')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeSubTab === 'tasks'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Mục 1: Phân Công Công Việc</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
              {tasksForSelectedDate.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('ot')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeSubTab === 'ot'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>Mục 2: Đăng Ký Tăng Ca (OT)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
              {overtimes.length}
            </span>
          </button>
        </div>

        {/* Nút hành động tương ứng */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full 2xl:w-auto 2xl:flex-1 2xl:justify-end min-w-0">
        {activeSubTab === 'tasks' && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:flex-1 lg:min-w-0">
            <label className="relative block w-full sm:flex-1 sm:min-w-0 2xl:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={employeeSearch}
                onChange={event => setEmployeeSearch(event.target.value)}
                placeholder="Tìm task theo tên nhân sự..."
                aria-label="Tìm task theo tên nhân sự"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
              />
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Hiển thị {visibleTasks.length}/{tasksForSelectedDate.length}
            </span>
          </div>
        )}
        {activeSubTab === 'tasks' ? (
          <button
            onClick={() => {
              const selectedProject = projects.find(project => project.id === taskForm.projectId);
              const todayDate = todayIsoDate();
              const currentDate = selectedProject?.startDate && todayDate < selectedProject.startDate
                ? selectedProject.startDate
                : selectedProject?.endDate && todayDate > selectedProject.endDate ? selectedProject.endDate : todayDate;
              setTaskForm(current => ({
                ...current,
                startDate: currentDate,
                endDate: currentDate,
                estimatedDays: 1,
                estimatedHours: Number(employees.find(employee => employee.id === current.employeeId)?.standardHours) || 8,
                estimatedHoursEdited: false
              }));
              setShowTaskModal(true);
            }}
            className="w-full sm:w-auto 2xl:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm shadow-md transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Task Công Việc Mới</span>
          </button>
        ) : (
          <button
            onClick={() => {
              setOtForm(current => ({ ...current, date: todayIsoDate() }));
              setShowOtModal(true);
            }}
            className="w-full sm:w-auto 2xl:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm shadow-md transition-all flex-shrink-0"
          >
            <Flame className="w-4 h-4" />
            <span>Đăng Ký Ca Tăng Ca Mới</span>
          </button>
        )}
        </div>
      </div>

      {/* ================= NỘI DUNG MỤC 1: PHÂN CÔNG CÔNG VIỆC ================= */}
      {activeSubTab === 'tasks' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {visibleTasks.length > 0 ? visibleTasks.map((task) => {
              // Tìm thông tin nhân sự đảm nhận
              const assignee = employees.find(e => e.id === task.employeeId);
              const standardHours = assignee?.standardHours || 8;
              const progress = scheduledProgress(task, standardHours, currentTime);
              const isOverdue = isTaskOverdue(task, currentTime);
              const taskSpeedStatus = getTaskSpeedStatus(task);
              const delayHours = taskDelayHours(task, currentTime);
              const earlyHours = Number(task.earlyHours) || 0;
              const isNearDeadline = progress >= 80 && task.status !== 'completed';
              const progressColor = task.status === 'completed'
                ? 'bg-emerald-500'
                : isOverdue
                  ? 'bg-rose-500'
                  : isNearDeadline
                    ? 'bg-amber-500'
                    : 'bg-sky-600';

              // Định nghĩa màu trạng thái nhanh/chậm
              const speedStyles = {
                early: { label: 'Hoàn thành sớm', bg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
                on_time: { label: 'Đúng hạn', bg: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
                delayed: { label: 'Chậm trễ / Quá hạn', bg: 'bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse' }
              };

              const speedInfo = task.status === 'completed'
                ? taskSpeedStatus === 'delayed'
                  ? { label: 'Hoàn thành muộn', bg: 'bg-amber-500/10 text-amber-700 border-amber-500/20' }
                  : speedStyles[taskSpeedStatus] || speedStyles.on_time
                : isOverdue
                  ? { label: 'Quá hạn', bg: 'bg-rose-500/10 text-rose-600 border-rose-500/20 animate-pulse' }
                  : delayHours > 0
                    ? { label: 'Chậm trễ', bg: 'bg-amber-500/10 text-amber-700 border-amber-500/20' }
                    : speedStyles.on_time;

              return (
                <div
                  key={task.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  {/* Hàng 1: Dự án, Giai đoạn, Độ ưu tiên, Nút xóa */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                        <Building className="w-3.5 h-3.5" />
                        {task.projectName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${speedInfo.bg}`}
                      >
                        {speedInfo.label}{task.status === 'completed' && taskSpeedStatus === 'early' && earlyHours > 0 ? ` · Sớm ${formatDelayHours(earlyHours)}` : delayHours > 0 ? ` · Trễ ${formatDelayHours(delayHours)}` : ''}
                      </span>

                      {task.priority === 'urgent' && (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                          Khẩn cấp
                        </span>
                      )}

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Xóa công việc"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Hàng 2: Tên công việc & Người đảm nhận */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                    
                    {/* Tên công việc */}
                    <div className="lg:col-span-5">
                      <div className="flex items-center gap-2">
                        {task.code && (
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono font-bold text-xs flex-shrink-0">
                            {task.code}
                          </span>
                        )}
                        <h4 className="font-bold text-base text-slate-900 dark:text-white">
                          {task.title}
                        </h4>
                      </div>
                      {task.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                          Ghi chú: {task.notes}
                        </p>
                      )}
                    </div>

                    {/* HIỂN THỊ TÊN NHÂN SỰ & THỜI GIAN LÀM 1 NGÀY (8h/ngày) */}
                    <div className="lg:col-span-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={assignee?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'}
                          alt={task.employeeName}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {task.employeeName}
                          </p>
                          <p className="text-[11px] text-sky-600 dark:text-sky-400">
                            {assignee?.title || 'Kỹ sư công trình'}
                          </p>
                        </div>
                      </div>

                      {/* Thông số ca làm việc chuẩn 1 ngày */}
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Ca chuẩn
                        </span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          {standardHours}h / ngày
                        </span>
                      </div>
                    </div>

                    {/* THỜI GIAN DỰ KIẾN CỦA TASK (NGÀY / GIỜ) */}
                    <div className="lg:col-span-3 flex flex-col justify-center space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Thời gian dự kiến:</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {task.estimatedDays} ngày ({task.estimatedDays > 1
                            ? `${Number(task.estimatedHoursPerDay) || (Number(task.estimatedHours) / task.estimatedDays) || standardHours}h/ngày, ${Number(task.estimatedHours) || task.estimatedDays * standardHours}h tổng`
                            : `${Number(task.estimatedHours) || task.estimatedDays * standardHours}h`})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Thời hạn:</span>
                        <span>{formatDateVi(task.startDate)} → {formatDateVi(task.endDate)}</span>
                      </div>
                    </div>

                  </div>

                  {/* Hàng 3: Điều khiển tiến độ (%) & Tình trạng nhanh/chậm */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                    
                    {/* Thanh tiến độ */}
                    <div className="w-full sm:w-1/2 flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500">Tiến độ:</span>
                      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                        <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${progress}%` }} />
                      </div>
                      <span className={`text-xs font-mono font-bold w-10 text-right ${isOverdue ? 'text-rose-600 dark:text-rose-400' : isNearDeadline ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'}`}>
                        {progress}%
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                      {[
                        { id: 'early', label: 'Làm sớm', active: 'bg-emerald-600 text-white' },
                        { id: 'on_time', label: 'Đúng hạn', active: 'bg-sky-600 text-white' },
                        { id: 'delayed', label: 'Chậm trễ', active: 'bg-rose-600 text-white' }
                      ].map(option => (
                        <button
                          key={option.id}
                          type="button"
                          disabled
                          aria-pressed={taskSpeedStatus === option.id}
                          title="Trạng thái được tự động đánh giá theo tiến độ và thời hạn công việc"
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-default opacity-100 ${
                            taskSpeedStatus === option.id
                              ? option.active
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                      {task.status !== 'completed' && (
                        <button
                          onClick={() => handleCompleteTask(task)}
                          className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                        >
                          Hoàn thành
                        </button>
                      )}
                    </div>

                  </div>

                  {(isOverdue || isNearDeadline) && task.status !== 'completed' && (
                    <p role="status" className={`-mt-2 text-xs font-semibold ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {isOverdue
                        ? 'Đã hết thời gian dự kiến. Hãy cập nhật trạng thái hoàn thành.'
                        : 'Task sắp hết thời gian dự kiến. Hãy theo dõi và xác nhận khi hoàn thành.'}
                    </p>
                  )}

                </div>
              );
            }) : (
              <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-sm text-slate-500 dark:text-slate-400">
                {tasksForSelectedDate.length === 0
                  ? `Không có task nào được phân công vào ngày ${formatDateVi(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`)}.`
                  : 'Không tìm thấy task của nhân sự này. Hãy thử tên khác hoặc xóa nội dung tìm kiếm.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= NỘI DUNG MỤC 2: ĐĂNG KÝ TĂNG CA (OVERTIME) ================= */}
      {activeSubTab === 'ot' && (
        <div className="space-y-4">
          
          {/* Bảng Thống Kê Giờ Tăng Ca */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500" />
                Danh Sách Ca Làm Thêm Giờ (Overtime - OT) Được Phê Duyệt
              </h3>
              <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full">
                Tổng cộng: {overtimes.reduce((sum, o) => sum + (Number(o.hours) || 0), 0)} giờ OT
              </span>
            </div>

            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 text-xs uppercase font-semibold">
                  <th className="py-3 px-3">Nhân sự thực hiện</th>
                  <th className="py-3 px-3">Công việc gấp cần hoàn thành</th>
                  <th className="py-3 px-3">Số giờ tăng ca</th>
                  <th className="py-3 px-3">Ngày tăng ca</th>
                  <th className="py-3 px-3">Lý do thực hiện</th>
                  <th className="py-3 px-3">Người phê duyệt</th>
                  <th className="py-3 px-3">Trạng thái</th>
                  <th className="py-3 px-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                {overtimes.map((ot) => (
                  <tr key={ot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center font-bold text-xs">
                        {ot.employeeName.charAt(0)}
                      </div>
                      {ot.employeeName}
                    </td>
                    <td className="py-3 px-3 font-medium text-sky-600 dark:text-sky-400">
                      {ot.taskTitle}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                        +{ot.hours} giờ
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500">{formatDateVi(ot.date)}</td>
                    <td className="py-3 px-3 italic">{ot.reason}</td>
                    <td className="py-3 px-3 text-slate-500">{ot.approvedBy}</td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Đã duyệt
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => deleteOvertime(ot.id)}
                        title="Xóa phiếu tăng ca"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* MODAL 1: TẠO TASK CÔNG VIỆC MỚI */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-[2px] animate-fade-in">
          <div className="w-full max-w-xl p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-sky-600" />
                Phân Công Công Việc Mới Cho Nhân Viên
              </h3>
              <button
                onClick={() => setShowTaskModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTaskSubmit} className="space-y-3.5">
              
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Dự Án Xây Dựng *
                  </label>
                  <select
                    value={taskForm.projectId}
                    onChange={(e) => {
                      const project = projects.find(item => item.id === e.target.value);
                      const clampDate = date => project?.startDate && date < project.startDate
                        ? project.startDate
                        : project?.endDate && date > project.endDate ? project.endDate : date;
                      const startDate = clampDate(taskForm.startDate);
                      let endDate = clampDate(taskForm.endDate);
                      if (endDate < startDate) endDate = startDate;
                      setTaskForm(current => {
                        const estimatedDays = inclusiveDays(startDate, endDate);
                        const standardHours = Number(employees.find(employee => employee.id === current.employeeId)?.standardHours) || 8;
                        return {
                          ...current,
                          projectId: e.target.value,
                          startDate,
                          endDate,
                          estimatedDays,
                          estimatedHours: current.estimatedHoursEdited ? current.estimatedHours : standardHours
                        };
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-sky-500"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>


              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Mã STT / WBS
                  </label>
                  <input
                    type="text"
                    placeholder="VD: A1.3 (để trống tự sinh)"
                    value={taskForm.code}
                    onChange={(e) => setTaskForm({ ...taskForm, code: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-sky-600 focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Tên Công Việc Cụ Thể Trong Dự Án *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Kiểm tra bản vẽ kết cấu móng và hố pit"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Người Đảm Nhận *
                  </label>
                  <select
                    value={taskForm.employeeId}
                    onChange={(e) => setTaskForm(current => {
                      const employee = employees.find(item => item.id === e.target.value);
                      return { ...current, employeeId: e.target.value, estimatedHours: current.estimatedHoursEdited ? current.estimatedHours : current.estimatedDays * (Number(employee?.standardHours) || 8) };
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-sky-500"
                  >
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.title} - {e.standardHours || 8}h/ngày)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ước Tính Số Ngày Làm Việc
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={taskForm.estimatedDays}
                    readOnly
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ngày Bắt Đầu
                  </label>
                  <DateInput
                    value={taskForm.startDate}
                    onChange={(value) => updateTaskDate('startDate', value)}
                    min={projects.find(project => project.id === taskForm.projectId)?.startDate}
                    max={projects.find(project => project.id === taskForm.projectId)?.endDate}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ngày Kết Thúc Dự Kiến
                  </label>
                  <DateInput
                    value={taskForm.endDate}
                    onChange={(value) => updateTaskDate('endDate', value)}
                    min={projects.find(project => project.id === taskForm.projectId)?.startDate}
                    max={projects.find(project => project.id === taskForm.projectId)?.endDate}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Giờ Làm Dự Kiến (h/ngày) *</label>
                <input
                  type="number"
                  required
                  min="0.25"
                  step="0.25"
                  value={taskForm.estimatedHours}
                  onChange={event => setTaskForm(current => ({ ...current, estimatedHours: Number(event.target.value), estimatedHoursEdited: true }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                />
              </div>



              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-600/20"
                >
                  Xác Nhận Phân Công
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TẠO CA TĂNG CA (OVERTIME) */}
      {showOtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-[2px] animate-fade-in">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500" />
                Đăng Ký Ca Tăng Ca (OT) - Công Việc Khẩn Cấp
              </h3>
              <button
                onClick={() => setShowOtModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOtSubmit} className="space-y-3.5">
              
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nhân Sự Tăng Ca *
                </label>
                <select
                  value={otForm.employeeId}
                  onChange={(e) => setOtForm({ ...otForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} - {e.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Gắn Với Công Việc Khẩn Cấp Cần Đẩy Nhanh Tiến Độ
                </label>
                <select
                  value={otForm.taskId}
                  onChange={(e) => setOtForm({ ...otForm, taskId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="">-- Tăng ca đột xuất tại hiện trường --</option>
                  {tasks.map(t => (
                    <option key={t.id} value={t.id}>
                      [{t.phase.split('.')[0]}] {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Số Giờ Tăng Ca Dự Kiến *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="8"
                    required
                    value={otForm.hours}
                    onChange={(e) => setOtForm({ ...otForm, hours: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ngày Làm Thêm Giờ
                  </label>
                  <DateInput
                    value={otForm.date}
                    onChange={(value) => setOtForm({ ...otForm, date: value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Lý Do Cần Tăng Ca Gấp
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Cần kịp nộp hồ sơ xin phép xây dựng trước cuối tuần"
                  value={otForm.reason}
                  onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOtModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  Xác Nhận Đăng Ký OT
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
