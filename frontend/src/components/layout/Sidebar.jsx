import React from 'react';
import { useApp, useLayout } from '../../context/AppContext';
import {
  CheckSquare,
  CalendarRange,
  BarChart3,
  Activity,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldCheck
} from 'lucide-react';
import { getCurrentUser } from '../../modules/auth/authSession';
import { placeholderPages } from './placeholderPages';
import './SidebarAlignment.css';

export default function Sidebar() {
  React.useLayoutEffect(() => {
    const sidebar = document.querySelector('.app-shell > aside');
    if (!sidebar) return;
    const label = [...sidebar.querySelectorAll('*')].find(
      element => element.children.length === 0 && element.textContent.trim().toLocaleUpperCase('vi') === 'PHÂN HỆ QUẢN LÝ'
    );
    if (!label) return;
    let container = label;
    while (
      container.parentElement !== sidebar &&
      container.parentElement?.textContent.trim().toLocaleUpperCase('vi') === 'PHÂN HỆ QUẢN LÝ' &&
      container.parentElement.children.length === 1
    ) container = container.parentElement;
    container.style.display = 'none';
  });
  const { activeTab, setActiveTab } = useApp();
  const { sidebarCollapsed, setSidebarCollapsed, mobileMenuOpen, setMobileMenuOpen } = useLayout();

  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const menuItems = [
    {
      id: 'work-hub',
      label: 'Công việc',
      compactLabel: 'Công việc',
      icon: CheckSquare
    },
    {
      id: 'director-overview',
      label: 'Tổng quan',
      compactLabel: 'Tổng quan',
      icon: BarChart3
    },
    {
      id: 'gantt',
      label: 'Dự án',
      compactLabel: 'Dự án',
      icon: CalendarRange
    },
    ...placeholderPages.filter(page => page.id === 'timesheets'),
    {
      id: 'company',
      label: 'Công ty',
      compactLabel: 'Công ty',
      icon: ShieldCheck
    },
    ...placeholderPages.filter(page => !['timesheets', 'permissions'].includes(page.id))
  ];

  // Chỉ thêm trang nhật ký vào menu của phiên quản trị viên.
  if (isAdmin) {
    menuItems.push({
      id: 'activity',
      label: 'Nhật Ký Hoạt Động',
      compactLabel: 'Nhật ký',
      icon: Activity
    });
  }

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId === 'work-hub' ? 'my-work' : tabId);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Backdrop trên Mobile khi mở Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-transparent backdrop-blur-[2px] lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Khung Sidebar chính */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 shadow-xl lg:shadow-none
          ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'}
          ${mobileMenuOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header của Sidebar: Logo APS Vietnam */}
        <div className="h-18 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 overflow-hidden">
            {!sidebarCollapsed
              ? <img className="aps-sidebar-logo" src="/aps-logo.svg" alt="APS Việt Nam · Project Management" />
              : <span className="aps-sidebar-symbol" aria-label="APS">APS</span>}
          </div>

          {/* Nút đóng trên mobile */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Danh sách các Menu điều hướng */}
        <div className={`flex-1 py-4 ${sidebarCollapsed ? 'px-2' : 'px-3'} space-y-1.5 overflow-y-auto`}>
          {!sidebarCollapsed && (
            <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Phân Hệ Quản Lý
            </div>
          )}

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`sidebar-nav-item w-full flex items-center ${sidebarCollapsed ? 'flex-col justify-center gap-1 px-1 py-2.5' : 'gap-3.5 px-3.5 py-3'} rounded-xl font-semibold transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/25 dark:shadow-sky-900/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }
                `}
              >
                <Icon
                  className={`sidebar-nav-icon flex-shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />

                {!sidebarCollapsed && (
                  <div className="flex-1 flex items-center truncate">
                    <span className="truncate">{item.label}</span>
                  </div>
                )}

                {sidebarCollapsed && (
                  <span className="sidebar-nav-compact w-full text-center leading-tight font-semibold whitespace-nowrap">{item.compactLabel || item.label}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Chân Sidebar: Thông tin hệ thống & nút thu gọn trên desktop */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {!sidebarCollapsed && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="flex-1 truncate">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Công trường APS</p>
                <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  Đang hoạt động
                </p>
              </div>
            </div>
          )}

          {/* Nút thu gọn / mở rộng Sidebar trên Desktop */}
          <button
            onClick={() => setSidebarCollapsed(prev => !prev)}
            className="hidden lg:flex w-full items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={sidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
      </aside>

    </>
  );
}
