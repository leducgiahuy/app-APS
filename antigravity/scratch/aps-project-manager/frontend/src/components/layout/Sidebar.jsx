import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  CheckSquare,
  CalendarRange,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  HardHat,
  X,
  Building2,
  Clock,
  ShieldCheck
} from 'lucide-react';

export default function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileMenuOpen,
    setMobileMenuOpen,
    employees,
    tasks
  } = useApp();

  // Đếm số lượng nhanh cho badge menu
  const onSiteCount = employees.filter(e => e.isOnSite).length;
  const inProgressTaskCount = tasks.filter(t => t.status === 'in_progress').length;

  const menuItems = [
    {
      id: 'hr',
      label: 'Thành Viên',
      icon: Users,
      badge: `${onSiteCount} On-site`,
      badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    },
    {
      id: 'tasks',
      label: 'Công việc',
      icon: CheckSquare,
      badge: `${inProgressTaskCount} Đang làm`,
      badgeColor: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    },
    {
      id: 'gantt',
      label: 'Tiến Độ Dự Án',
      icon: CalendarRange,
      badge: 'FS Link',
      badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    },
    {
      id: 'dashboard',
      label: 'Thống Kê & Báo Cáo',
      icon: BarChart3,
      badge: 'KPI',
      badgeColor: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    }
  ];

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Backdrop trên Mobile khi mở Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
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
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-700 text-white shadow-md shadow-sky-500/20 flex-shrink-0">
              <HardHat className="w-6 h-6 animate-pulse" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col truncate">
                <span className="font-black text-lg tracking-wider text-slate-900 dark:text-white uppercase flex items-center gap-1">
                  APS <span className="text-sky-600 dark:text-sky-400">VIETNAM</span>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Giải Pháp Châu Á Thái Bình Dương
                </span>
              </div>
            )}
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
        <div className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
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
                title={sidebarCollapsed ? item.label : ''}
                className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/25 dark:shadow-sky-900/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }
                `}
              >
                <Icon
                  className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />

                {!sidebarCollapsed && (
                  <div className="flex-1 flex items-center justify-between truncate">
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium truncate ${
                          isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}

                {/* Chấm tròn báo hiệu active khi thu gọn */}
                {sidebarCollapsed && isActive && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-sm" />
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
