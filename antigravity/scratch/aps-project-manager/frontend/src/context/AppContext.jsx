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

  // Điều hướng ngày: Hôm trước, Hôm nay, Hôm sau
  const goToPrevDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const goToNextDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // Tải toàn bộ dữ liệu từ Backend
  const refreshAllData = async () => {
    try {
      setLoading(true);
      const [empRes, taskRes, projRes, ganttRes, statRes] = await Promise.all([
        api.getEmployees(),
        api.getTasks(),
        api.getProjects(),
        api.getGanttItems(),
        api.getStats()
      ]);

      if (empRes?.data) setEmployees(empRes.data);
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

  // Hành động: Chuyển trạng thái điểm danh nhân sự (On-site / Vắng mặt)
  const toggleOnSite = async (id) => {
    try {
      const res = await api.toggleOnSite(id);
      showToast(res.message || 'Cập nhật trạng thái thành công');
      // Cập nhật state trực tiếp
      setEmployees(prev => prev.map(emp => {
        if (emp.id === id) {
          const newStatus = !emp.isOnSite;
          return {
            ...emp,
            isOnSite: newStatus,
            checkInTime: newStatus ? new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null
          };
        }
        return emp;
      }));
    } catch (err) {
      showToast('Lỗi khi cập nhật trạng thái', 'error');
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
        goToPrevDay,
        goToNextDay,
        goToToday,
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
        addEmployee,
        deleteEmployee,
        addTask,
        updateTask,
        deleteTask,
        addOvertime,
        deleteOvertime,
        addProject,
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
