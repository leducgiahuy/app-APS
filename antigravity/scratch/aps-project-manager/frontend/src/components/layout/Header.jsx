import React, { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Menu,
  Sun,
  Moon,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Building,
  Users,
  CheckSquare,
  CalendarRange,
  BarChart3
} from 'lucide-react';

export default function Header() {
  const {
    activeTab,
    theme,
    toggleTheme,
    currentTime,
    selectedDate,
    selectDate,
    ganttMonth,
    setGanttMonth,
    goToPrevDay,
    goToNextDay,
    goToToday,
    setMobileMenuOpen
  } = useApp();

  // Tiêu đề tương ứng từng trang
  const pageTitles = {
    hr: {
      title: 'Thành Viên',
      sub: '',
      icon: Users
    },
    tasks: {
      title: 'Công việc',
      sub: '',
      icon: CheckSquare
    },
    gantt: {
      title: 'Tiến Độ Dự Án',
      sub: '',
      icon: CalendarRange
    },
    dashboard: {
      title: 'Thống Kê & Báo Cáo Hiệu Suất',
      sub: '',
      icon: BarChart3
    }
  };

  const currentInfo = pageTitles[activeTab] || pageTitles.hr;
  const isGanttView = activeTab === 'gantt';
  const dayPickerRef = useRef(null);
  const selectedDateValue = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const ganttMonthValue = `${ganttMonth.getFullYear()}-${String(ganttMonth.getMonth() + 1).padStart(2, '0')}`;

  const openDayPicker = () => {
    const picker = dayPickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === 'function') picker.showPicker();
    else picker.click();
  };

  // Format ngày tháng tiếng Việt
  const formatVietnameseDate = (date) => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[date.getDay()];
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dayName}, ${dd}/${mm}/${yyyy}`;
  };

  // Format giờ thực: HH:mm:ss
  const formatTime = (date) => {
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="h-full px-4 sm:px-5 flex items-center justify-between gap-3">
        
        {/* Phần bên trái: Nút Menu Mobile + Tiêu đề trang */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden flex-shrink-0"
          >
            <Menu className="w-6 h-6" />
          </button>

          {currentInfo.title && <div className="flex items-center gap-2.5 min-w-0">
            {currentInfo.icon && <span className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
              <currentInfo.icon className="w-[18px] h-[18px]" />
            </span>}
            <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {currentInfo.title}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block truncate">
              {currentInfo.sub}
            </p>
            </div>
          </div>}
        </div>

        {/* Phần bên phải: Đồng hồ số Real-time + Bộ chọn ngày + Theme Toggle + User Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          
          {/* Đồng hồ số chạy theo thời gian thực (Real-time Clock) */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-sky-600 dark:text-sky-400 font-mono font-bold text-xs sm:text-sm shadow-inner">
            <Clock className="w-4 h-4 animate-spin" style={{ animationDuration: '6s' }} />
            <span>{formatTime(currentTime)}</span>
          </div>

          {/* Bộ điều khiển ngày tháng (Lùi ngày, Hôm nay, Tiến ngày) */}
          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                if (isGanttView) setGanttMonth(new Date(ganttMonth.getFullYear(), ganttMonth.getMonth() - 1, 1));
                else goToPrevDay();
              }}
              title={isGanttView ? 'Lùi 1 tháng' : 'Lùi 1 ngày'}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={openDayPicker}
                title={isGanttView ? 'Chọn tháng và năm' : 'Mở lịch để chọn ngày'}
                className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap hover:text-sky-600 dark:hover:text-sky-400"
              >
                <Calendar className="w-3.5 h-3.5" />
                {isGanttView ? `Tháng ${ganttMonth.getMonth() + 1}/${ganttMonth.getFullYear()}` : formatVietnameseDate(selectedDate)}
              </button>
              <input
                ref={dayPickerRef}
                type={isGanttView ? 'month' : 'date'}
                value={isGanttView ? ganttMonthValue : selectedDateValue}
                onChange={(event) => {
                  const parts = event.target.value.split('-').map(Number);
                  if (parts[0] && parts[1]) {
                    if (isGanttView) setGanttMonth(new Date(parts[0], parts[1] - 1, 1));
                    else if (parts[2]) selectDate(new Date(parts[0], parts[1] - 1, parts[2]));
                  }
                }}
                tabIndex={-1}
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2 opacity-0"
              />
            </div>

            <button
              onClick={() => {
                if (isGanttView) setGanttMonth(new Date(ganttMonth.getFullYear(), ganttMonth.getMonth() + 1, 1));
                else goToNextDay();
              }}
              title={isGanttView ? 'Tiến 1 tháng' : 'Tiến 1 ngày'}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (isGanttView) setGanttMonth(new Date(currentTime.getFullYear(), currentTime.getMonth(), 1));
                else goToToday();
              }}
              title={isGanttView ? 'Trở về tháng này' : 'Trở về hôm nay'}
              className="ml-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-sky-600 text-white hover:bg-sky-500 transition-colors"
            >
              {isGanttView ? 'Tháng này' : 'Hôm nay'}
            </button>
          </div>

          {/* Nút chuyển đổi giao diện Light/Dark Mode */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all duration-200"
            title={theme === 'dark' ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '20s' }} />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          {/* Badge nhận diện người dùng: IT Phần Cứng - APS VN */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-md">
              IT
            </div>
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                IT Phần Cứng
              </span>
              <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">
                APS Việt Nam
              </span>
            </div>
          </div>

        </div>

      </div>
    </header>
  );
}
