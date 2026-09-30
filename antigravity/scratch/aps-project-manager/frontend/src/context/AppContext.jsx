import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AppContext = createContext();

export function AppProvider({ children }) {
  // Theme Light/Dark Mode
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('aps_theme') || 'dark';
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
      showToast(`Đã đủ giờ ca làm. ${endedNames.join(', ')} đã được tự động kết thúc ca; trạng thái đã chuyển về “Vào công trường”.`, 'info');
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
      if (empRes?.meta?.taskSessionsSyncedIds?.length) {
        [taskRes, ganttRes] = await Promise.all([api.getTasks(), api.getGanttItems()]);
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
  const toggleOnSite = async (id) => {
    try {
      const res = await api.toggleOnSite(id);
      if (res.data?.isOnSite && res.data.checkInAt) {
        const checkIn = new Date(res.data.checkInAt);
        const time = checkIn.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const date = checkIn.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        showToast(`Vào ca thành công lúc ${time}, ngày ${date}`);
      } else {
        showToast(res.message || 'Đã rời công trường');
      }
      await refreshAllData();
    } catch (err) {
      showToast('Lỗi khi cập nhật trạng thái', 'error');
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

  // Hành động: Thêm nhân sự mới
  const addEmployee = async (employeeData) => {
    try {
      const res = await api.createEmployee(employeeData);
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
      await api.deleteEmployee(id);
      showToast('Đã xóa nhân sự thành công');
      setEmployees(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      showToast('Lỗi khi xóa nhân sự', 'error');
    }
  };

  // Hành động: Thêm task phân công
  const addTask = async (taskData) => {
    try {
      await api.createTask(taskData);
      showToast('Phân công công việc thành công');
      refreshAllData();
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi tạo công việc', 'error');
      return false;
    }
  };

  // Hành động: Cập nhật task (tiến độ, trạng thái)
  const updateTask = async (id, data) => {
    try {
      await api.updateTask(id, data);
      showToast('Cập nhật tiến độ thành công');
      refreshAllData();
      return true;
    } catch (err) {
      showToast('Lỗi khi cập nhật công việc', 'error');
      return false;
    }
  };

  // Hành động: Xóa task
  const deleteTask = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa công việc này?')) return;
    try {
      await api.deleteTask(id);
      showToast('Đã xóa công việc');
      await refreshAllData();
    } catch (err) {
      showToast('Lỗi khi xóa công việc', 'error');
    }
  };

  // Hành động: Đăng ký tăng ca (OT)
  const addOvertime = async (otData) => {
    try {
      await api.createOvertime(otData);
      showToast('Đăng ký ca tăng ca (OT) thành công');
      refreshAllData();
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
      showToast('Đã cập nhật thời gian dự án');
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
      await api.deleteProject(id);
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
      showToast(res.message || 'Đã cập nhật thời gian task');
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
      if (res.data) {
        setGanttItems(res.data);
      } else {
        await refreshAllData();
      }
      showToast(res.message || 'Đã cập nhật thứ tự công việc');
      return true;
    } catch (err) {
      showToast('Lỗi khi đổi thứ tự', 'error');
      return false;
    }
  };

  // Hành động: Xóa công việc khỏi Gantt
  const deleteGanttItem = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa hạng mục này khỏi tiến độ?')) return;
    try {
      await api.deleteGanttItem(id);
      showToast('Đã xóa hạng mục khỏi biểu đồ Gantt');
      await refreshAllData();
    } catch (err) {
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

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp phải được sử dụng bên trong AppProvider');
  }
  return context;
}
