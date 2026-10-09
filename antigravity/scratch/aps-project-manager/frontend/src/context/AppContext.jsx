import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';
import { recordActivity } from '../modules/auth/authSession';

const AppContext = createContext();

export function AppProvider({ children }) {
  // Theme Light/Dark Mode
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('aps_theme') || 'light';
  });

  // Tab điều hướng chính
  const [activeTab, setActiveTab] = useState('hr'); // 'hr', 'tasks', 'gantt', 'dashboard'
  // Thời gian thực (Real-time Clock chạy từng giây)
  const [currentTime, setCurrentTime] = useState(new Date());

  // Ngày được chọn trên thanh điều hướng ngày
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateFollowsToday, setDateFollowsToday] = useState(true);
  const [ganttMonth, setGanttMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Trạng thái thu gọn Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dữ liệu ứng dụng
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [overtimes, setOvertimes] = useState([]);
  const [ganttItems, setGanttItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Thông báo Toast
  const [toast, setToast] = useState(null);

  // Hiển thị thông báo nhanh
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const announceAutoCheckout = (response) => {
    const endedIds = response?.meta?.autoCheckedOutIds || [];
    if (!endedIds.length) return;
    const endedNames = (response.data || [])
      .filter(employee => endedIds.includes(employee.id))
      .map(employee => employee.name);
    if (endedNames.length) {
      showToast(`Đã đủ giờ ca làm. ${endedNames.join(', ')} đã được tự động kết thúc ca; trạng thái đã chuyển về “Vào văn phòng”.`, 'info');
    }
  };

  // Cập nhật Dark Mode trên HTML root element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('aps_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Đồng hồ chạy thời gian thực mỗi 1 giây
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dateFollowsToday) return;
    // eslint-disable-next-line react/set-state-in-effect
    setSelectedDate(previous => {
      if (previous.getFullYear() === currentTime.getFullYear() &&
          previous.getMonth() === currentTime.getMonth() &&
          previous.getDate() === currentTime.getDate()) return previous;
      return new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
    });
  }, [currentTime, dateFollowsToday]);

  // Điều hướng ngày: Hôm trước, Hôm nay, Hôm sau
  const goToPrevDay = () => {
    setDateFollowsToday(false);
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const goToNextDay = () => {
    setDateFollowsToday(false);
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const goToToday = () => {
    setDateFollowsToday(true);
    setSelectedDate(new Date());
  };

  const selectDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return;
    setDateFollowsToday(false);
    setSelectedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  };

  // Tải toàn bộ dữ liệu từ Backend
  const refreshAllData = async () => {
    try {
      setLoading(true);
      let [empRes, taskRes, projRes, ganttRes, statRes] = await Promise.all([
        api.getEmployees(),
        api.getTasks(),
        api.getProjects(),
        api.getGanttItems(),
        api.getStats()
      ]);

      // If getEmployees just initialized sessions for already-open shifts,
      // reload task data after that database write has completed.
      if (empRes?.meta?.taskSessionsSyncedIds?.length || empRes?.meta?.autoCheckedOutIds?.length) {
        [taskRes, ganttRes, projRes, statRes] = await Promise.all([
          api.getTasks(), api.getGanttItems(), api.getProjects(), api.getStats()
        ]);
      }

      if (empRes?.data) setEmployees(empRes.data);
      announceAutoCheckout(empRes);
      if (taskRes?.data) {
        setTasks(taskRes.data.tasks || []);
        setOvertimes(taskRes.data.overtimes || []);
      }
      if (projRes?.data) setProjects(projRes.data);
      if (ganttRes?.data) setGanttItems(ganttRes.data);
      if (statRes?.data) setStats(statRes.data);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu từ backend:', err);
      showToast('Đang chạy ở chế độ cục bộ hoặc chưa kết nối backend', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    refreshAllData();
  }, []);

  // Poll the employee endpoint while shifts are active. The backend persists
  // automatic check-out as soon as each employee reaches their daily hours.
  useEffect(() => {
    if (!employees.some(employee => employee.isOnSite && employee.checkInAt)) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await api.getEmployees();
        if (response?.data) setEmployees(response.data);
        announceAutoCheckout(response);
        if (response?.meta?.autoCheckedOutIds?.length || response?.meta?.taskSessionsSyncedIds?.length) {
          await refreshAllData();
        }
      } catch (error) {
        console.warn('Không thể đồng bộ trạng thái ca làm:', error.message);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [employees]);

  // Hành động: Chuyển trạng thái điểm danh nhân sự (On-site / Vắng mặt)
  const toggleOnSite = async (id, shiftType = 'regular') => {
    try {
      const res = await api.toggleOnSite(id, shiftType);
      const employee = employees.find(item => item.id === id);
      recordActivity('employee.attendance', `${employee?.name || id}: ${res.data?.isOnSite ? 'có mặt tại văn phòng' : 'cập nhật điểm danh'}.`);
      showToast(res.message || 'Cập nhật trạng thái thành công');
      if (res.data) setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, ...res.data } : emp));
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật trạng thái', 'error');
      return false;
    }
  };

  const toggleBreak = async (id) => {
    try {
      const res = await api.toggleBreak(id);
      showToast(res.message || 'Đã cập nhật trạng thái làm việc');
      await refreshAllData();
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật trạng thái nghỉ', 'error');
    }
  };

  const setActiveTask = async (id, taskId, shiftType = 'regular') => {
    try {
      const res = await api.setActiveTask(id, taskId, shiftType);
      showToast(res.message || 'Đã chuyển công việc đang thực hiện');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Không thể chuyển công việc', 'error');
      return false;
    }
  };

  // Hành động: Thêm nhân sự mới
  const addEmployee = async (employeeData) => {
    try {
      await api.createEmployee(employeeData);
      recordActivity('employee.create', `Thêm nhân sự ${employeeData.name || 'mới'}.`);
      showToast('Thêm nhân sự mới thành công');
      refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi thêm nhân sự', 'error');
      return false;
    }
  };

  // Hành động: Xóa nhân sự
  const deleteEmployee = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa nhân sự này?')) return;
    try {
      const employee = employees.find(item => item.id === id);
      await api.deleteEmployee(id);
      recordActivity('employee.delete', `Xóa nhân sự ${employee?.name || id}.`);
      showToast('Đã xóa nhân sự thành công');
      setEmployees(prev => prev.filter(e => e.id !== id));
      await refreshAllData();
    } catch {
      showToast('Lỗi khi xóa nhân sự', 'error');
    }
  };

  // Hành động: Thêm task phân công
  const addTask = async (taskData) => {
    try {
      await api.createTask(taskData);
      recordActivity('task.create', `Tạo công việc ${taskData.title || 'mới'}.`);
      showToast(taskData.employeeId ? 'Phân công công việc thành công' : 'Đã tạo công việc chưa phân công');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi tạo công việc', 'error');
      return false;
    }
  };

  // Hành động: Cập nhật task (tiến độ, trạng thái)
  const updateTask = async (id, data) => {
    try {
      const response = await api.updateTask(id, data);
      if (data.actualWorkloadNotes !== undefined && response?.data?.actualWorkloadNotes !== data.actualWorkloadNotes) {
        throw new Error('Máy chủ chưa hỗ trợ lưu ghi chú. Hãy khởi động lại backend rồi thử lại.');
      }
      recordActivity('task.update', `Cập nhật công việc ${tasks.find(item => item.id === id)?.title || id}.`);
      showToast('Cập nhật tiến độ thành công');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật công việc', 'error');
      return false;
    }
  };

  // Hành động: Xóa task
  const deleteTask = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa công việc này?')) return;
    try {
      const task = tasks.find(item => item.id === id);
      await api.deleteTask(id);
      recordActivity('task.delete', `Xóa công việc ${task?.title || id}.`);
      showToast('Đã xóa công việc');
      await refreshAllData();
    } catch {
      showToast('Lỗi khi xóa công việc', 'error');
    }
  };

  // Hành động: Đăng ký tăng ca (OT)
  const addOvertime = async (otData) => {
    try {
      await api.createOvertime(otData);
      recordActivity('overtime.create', `Tạo đăng ký tăng ca cho ${otData.employeeName || 'nhân sự'}.`);
      showToast('Đăng ký ca tăng ca (OT) thành công');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi đăng ký tăng ca', 'error');
      return false;
    }
  };

  const deleteOvertime = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa phiếu tăng ca này không?')) return;
    try {
      await api.deleteOvertime(id);
      recordActivity('overtime.delete', `Xóa đăng ký tăng ca ${id}.`);
      showToast('Đã xóa phiếu tăng ca');
      await refreshAllData();
    } catch (err) {
      showToast(err.message || 'Lỗi khi xóa phiếu tăng ca', 'error');
    }
  };

  // Hành động: Tạo dự án mới
  const addProject = async (projectData) => {
    try {
      const res = await api.createProject(projectData);
      recordActivity('project.create', `Tạo dự án ${projectData.name || 'mới'}.`);
      showToast('Tạo dự án mới thành công');
      await refreshAllData();
      return res.data || true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi tạo dự án', 'error');
      return false;
    }
  };

  const updateProject = async (id, projectData) => {
    try {
      await api.updateProject(id, projectData);
      const projectName = projects.find(item => item.id === id)?.name || id;
      recordActivity('project.update', `Cập nhật thông tin dự án ${projectName}.`);
      showToast('\u0110\u00e3 c\u1eadp nh\u1eadt th\u00f4ng tin d\u1ef1 \u00e1n');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật dự án', 'error');
      return false;
    }
  };

  const deleteProject = async (id) => {
    if (!window.confirm('Xóa dự án sẽ xóa toàn bộ task, Gantt và OT liên quan. Bạn có chắc chắn không?')) return false;
    try {
      const project = projects.find(item => item.id === id);
      await api.deleteProject(id);
      recordActivity('project.delete', `Xóa dự án ${project?.name || id}.`);
      showToast('Đã xóa dự án và dữ liệu liên quan');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi xóa dự án', 'error');
      return false;
    }
  };

  // Hành động: Thêm công việc vào Gantt (Tự động chèn theo WBS hoặc theo vị trí đã chọn)
  const addGanttItem = async (itemData) => {
    try {
      const res = await api.createGanttItem(itemData);
      recordActivity('gantt.create', `Thêm hạng mục ${itemData.title || itemData.code || 'mới'} vào Gantt.`);
      showToast(res.message || 'Thêm công việc vào tiến độ thành công');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi thêm vào Gantt', 'error');
      return false;
    }
  };

  const updateGanttItem = async (id, data) => {
    try {
      const res = await api.updateGanttItem(id, data);
      const itemTitle = ganttItems.find(item => item.id === id)?.title || id;
      recordActivity('gantt.update', Array.isArray(data.assignees)
        ? `Cập nhật người đảm nhận cho hạng mục ${itemTitle}.`
        : `Cập nhật hạng mục ${itemTitle}.`);
      showToast(res.message || 'Đã cập nhật hạng mục Gantt');
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật thời gian task', 'error');
      return false;
    }
  };

  // Hành động: Di chuyển công việc lên / xuống (Reorder)
  const moveGanttItem = async (id, direction) => {
    try {
      const res = await api.moveGanttItem(id, direction);
      recordActivity('gantt.reorder', `Di chuyển hạng mục Gantt ${id} ${direction === 'up' ? 'lên' : 'xuống'}.`);
      if (res.data) {
        setGanttItems(res.data);
      } else {
        await refreshAllData();
      }
      showToast(res.message || 'Đã cập nhật thứ tự công việc');
      return true;
    } catch {
      showToast('Lỗi khi đổi thứ tự', 'error');
      return false;
    }
  };

  // Hành động: Xóa công việc khỏi Gantt
  const deleteGanttItem = async (id) => {
    const item = ganttItems.find(entry => entry.id === id);
    const confirmMessage = item?.isGroup
      ? `Bạn có chắc chắn muốn xóa mục công việc "${item.title}"? Các công việc bên trong sẽ được giữ lại và không còn thuộc mục này.`
      : 'Bạn có chắc chắn muốn xóa hạng mục này khỏi tiến độ?';
    if (!window.confirm(confirmMessage)) return;
    try {
      await api.deleteGanttItem(id);
      recordActivity('gantt.delete', `Xóa hạng mục Gantt ${item?.title || id}.`);
      showToast('Đã xóa hạng mục khỏi biểu đồ Gantt');
      await refreshAllData();
    } catch {
      showToast('Lỗi khi xóa hạng mục', 'error');
    }
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        activeTab,
        setActiveTab,
        currentTime,
        selectedDate,
        setSelectedDate,
        selectDate,
        goToPrevDay,
        goToNextDay,
        goToToday,
        ganttMonth,
        setGanttMonth: (date) => {
          if (date instanceof Date && !Number.isNaN(date.getTime())) {
            setGanttMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          }
        },
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileMenuOpen,
        setMobileMenuOpen,
        employees,
        tasks,
        overtimes,
        ganttItems,
        projects,
        stats,
        loading,
        toast,
        showToast,
        refreshAllData,
        toggleOnSite,
        toggleBreak,
        setActiveTask,
        addEmployee,
        deleteEmployee,
        addTask,
        updateTask,
        deleteTask,
        addOvertime,
        deleteOvertime,
        addProject,
        updateProject,
        deleteProject,
        addGanttItem,
        updateGanttItem,
        moveGanttItem,
        deleteGanttItem
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react/only-export-components
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp phải được sử dụng bên trong AppProvider');
  }
  return context;
}
