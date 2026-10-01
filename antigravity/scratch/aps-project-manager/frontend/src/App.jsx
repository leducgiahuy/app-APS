import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Toast from './components/layout/Toast';
import HRPage from './modules/hr/HRPage';
import TasksPage from './modules/tasks/TasksPage';
import GanttPage from './modules/gantt/GanttPage';
import DashboardPage from './modules/dashboard/DashboardPage';

function MainLayout() {
  const { activeTab, sidebarCollapsed } = useApp();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      
      {/* 1. Sidebar bên trái (Collapsible trên Desktop & Drawer trên Mobile) */}
      <Sidebar />

      {/* 2. Khung nội dung chính tự căn chỉnh theo kích thước Sidebar */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'
        }`}
      >
        {/* Header trên cùng (Đồng hồ số thời gian thực, Chọn ngày, Light/Dark mode) */}
        <Header />

        {/* Nội dung trang theo từng phân hệ */}
        <main className={`flex-1 w-full animate-fade-in ${
          activeTab === 'gantt' || activeTab === 'tasks' || activeTab === 'hr' || activeTab === 'dashboard'
            ? 'max-w-none mx-0 p-0'
            : 'p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto'
        }`}>
          {activeTab === 'hr' && <HRPage />}
          {activeTab === 'tasks' && <TasksPage />}
          {activeTab === 'gantt' && <GanttPage />}
          {activeTab === 'dashboard' && <DashboardPage />}
        </main>

      </div>

      {/* Thông báo dạng Toast nổi bật */}
      <Toast />

    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
