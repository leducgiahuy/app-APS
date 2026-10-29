import OperationsNotifications from '../../modules/operations/OperationsNotifications';
import React, { useEffect, useRef, useState } from 'react';
import { useApp, useClock, useLayout } from '../../context/AppContext';
import { usePageAccess } from '../../context/PageAccessContext';
import {
  Menu,
  Sun,
  Moon,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserRoundPen,
  Users,
  CheckSquare,
  UsersRound,
  CalendarRange,
  BarChart3,
  Activity,
  ShieldCheck
} from 'lucide-react';
import { endAuthSession, getCurrentUser } from '../../modules/auth/authSession';
import { placeholderPages } from './placeholderPages';

export default function Header() {
  const {
    activeTab,
    theme,
    toggleTheme,
    selectedDate,
    selectDate,
    ganttMonth,
    setGanttMonth,
    goToPrevDay,
    goToNextDay,
    goToToday,
    workHubSection,
    workloadPeriod,
    workloadMonth,
    setWorkloadMonth,
    workloadYear,
    setWorkloadYear,
    ganttHeaderMode,
    fiscalYear,
    setFiscalYear
  } = useApp();
  const { canSee } = usePageAccess();
  const currentTime = useClock();
  const { setMobileMenuOpen } = useLayout();
  const accountUser = getCurrentUser();
  const accountInitials = accountUser?.name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'APS';
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  // Tiêu đề đồng bộ với tên mục trên thanh điều hướng.
  const pageTitles = {
    ...Object.fromEntries(placeholderPages.map(page => [page.id, page.label])),
    company: 'Công ty',
    'my-work': 'Việc của tôi',
    'work-hub': 'Công việc',
    'director-overview': 'Tổng quan',
    hr: 'Thành Viên',
    tasks: 'Công việc',
    workload: 'Quản Lý Nhân Sự',
    gantt: 'Dự án',
    activity: 'Nhật Ký Hoạt Động'
  };

  const pageIcons = {
    ...Object.fromEntries(placeholderPages.map(page => [page.id, page.icon])),
    company: ShieldCheck,
    'my-work': CheckSquare,
    'work-hub': CheckSquare,
    'director-overview': BarChart3,
    hr: Users,
    tasks: CheckSquare,
    workload: UsersRound,
    gantt: CalendarRange,
    activity: Activity
  };

  const currentTitle = pageTitles[activeTab] || pageTitles.hr;
  const CurrentPageIcon = pageIcons[activeTab] || pageIcons.hr;
  const isGanttView = activeTab === 'gantt';
  const dayPickerRef = useRef(null);
  const selectedDateValue = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const ganttMonthValue = `${ganttMonth.getFullYear()}-${String(ganttMonth.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

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

  // Ô ngày trên thanh tiêu đề đổi theo trang đang xem: Dự án theo tháng; Quản Lý Nhân Sự theo kỳ đang chọn
  // (Tháng / Năm); còn lại theo ngày.
  const workloadMode = activeTab === 'work-hub' && workHubSection === 'workload' && ['month', 'year'].includes(workloadPeriod)
    && canSee(`work-hub.workload.${workloadPeriod}`) ? workloadPeriod : '';
  const monthKeyOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const shiftMonthKey = (key, delta) => { const [year, month] = key.split('-').map(Number); return monthKeyOf(new Date(year, month - 1 + delta, 1)); };
  const [workloadYearNumber, workloadMonthNumber] = workloadMonth.split('-').map(Number);
  const thisYear = currentTime.getFullYear();
  const yearOptions = Array.from({ length: 16 }, (_, index) => String(Math.min(thisYear, Number(workloadYear) || thisYear) - 10 + index));
  const thisFiscalYear = currentTime.getMonth() >= 9 ? thisYear : thisYear - 1;
  const fiscalYearOptions = Array.from({ length: 16 }, (_, index) => Math.min(thisFiscalYear, fiscalYear) - 10 + index);
  const nav = isGanttView && ganttHeaderMode === 'fiscal-year' ? {
    unit: 'năm tài chính', label: `${fiscalYear}–${fiscalYear + 1}`, todayLabel: 'Năm nay', pickerType: 'fiscal-year',
    pickerTitle: `Năm tài chính T10/${fiscalYear} – T9/${fiscalYear + 1} · bấm để chọn năm`,
    prev: () => setFiscalYear(fiscalYear - 1),
    next: () => setFiscalYear(fiscalYear + 1),
    today: () => setFiscalYear(thisFiscalYear),
  } : isGanttView ? {
    unit: 'tháng', label: `Tháng ${ganttMonth.getMonth() + 1}/${ganttMonth.getFullYear()}`, todayLabel: 'Tháng này',
    pickerType: 'month', pickerTitle: 'Chọn tháng và năm', pickerValue: ganttMonthValue,
    prev: () => setGanttMonth(new Date(ganttMonth.getFullYear(), ganttMonth.getMonth() - 1, 1)),
    next: () => setGanttMonth(new Date(ganttMonth.getFullYear(), ganttMonth.getMonth() + 1, 1)),
    today: () => setGanttMonth(new Date(currentTime.getFullYear(), currentTime.getMonth(), 1)),
    onPick: ([year, month]) => { if (year && month) setGanttMonth(new Date(year, month - 1, 1)); },
  } : workloadMode === 'month' ? {
    unit: 'tháng', label: `Tháng ${workloadMonthNumber}/${workloadYearNumber}`, todayLabel: 'Tháng này',
    pickerType: 'month', pickerTitle: 'Chọn tháng và năm', pickerValue: workloadMonth,
    prev: () => setWorkloadMonth(shiftMonthKey(workloadMonth, -1)),
    next: () => setWorkloadMonth(shiftMonthKey(workloadMonth, 1)),
    today: () => setWorkloadMonth(monthKeyOf(currentTime)),
    onPick: ([year, month]) => { if (year && month) setWorkloadMonth(`${year}-${String(month).padStart(2, '0')}`); },
  } : workloadMode === 'year' ? {
    unit: 'năm', label: `Năm ${workloadYear}`, todayLabel: 'Năm nay', pickerType: 'year', pickerTitle: 'Chọn năm',
    prev: () => setWorkloadYear(String((Number(workloadYear) || thisYear) - 1)),
    next: () => setWorkloadYear(String((Number(workloadYear) || thisYear) + 1)),
    today: () => setWorkloadYear(String(thisYear)),
  } : {
    unit: 'ngày', label: formatVietnameseDate(selectedDate), todayLabel: 'Hôm nay',
    pickerType: 'date', pickerTitle: 'Mở lịch để chọn ngày', pickerValue: selectedDateValue,
    prev: goToPrevDay, next: goToNextDay, today: goToToday,
    onPick: ([year, month, day]) => { if (year && month && day) selectDate(new Date(year, month - 1, day)); },
  };
  return (
    <header className="aps-brand-header sticky top-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="h-full px-3 sm:px-5 flex items-center justify-between gap-3">
        
        {/* Phần bên trái: Nút Menu Mobile + Tiêu đề trang */}
        <div className="aps-header-title flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="aps-header-menu p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden flex-shrink-0"
          >
            <Menu className="w-6 h-6" />
          </button>

          <CurrentPageIcon className="h-6 w-6 flex-shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <h1 className="min-w-0 text-base sm:text-xl font-bold text-slate-900 dark:text-white truncate">
            {currentTitle}
          </h1>
        </div>

        {/* Phần bên phải: Đồng hồ số Real-time + Bộ chọn ngày + Theme Toggle + User Badge */}
        <div className="aps-header-actions flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          
          <OperationsNotifications />
          {/* Đồng hồ số chạy theo thời gian thực (Real-time Clock) */}
          <div className="aps-header-clock flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-sky-600 dark:text-sky-400 font-mono font-bold text-[11px] sm:text-xs shadow-inner">
            <Clock className="w-4 h-4 animate-spin" style={{ animationDuration: '6s' }} />
            <span>{formatTime(currentTime)}</span>
          </div>

          {/* Bộ điều khiển ngày tháng: theo ngày (mặc định), theo tháng ở trang Dự án, theo tháng / năm ở Quản Lý Nhân Sự. */}
          <div className="aps-header-date hidden md:flex w-[350px] shrink-0 items-center justify-between gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={nav.prev}
              title={`Lùi 1 ${nav.unit}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Khung flex để nút ngày / tháng căn giữa theo chiều dọc như hai nút mũi tên (không bị đẩy lên vì dòng chữ). */}
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={['year', 'fiscal-year'].includes(nav.pickerType) ? undefined : openDayPicker}
                title={nav.pickerTitle}
                tabIndex={['year', 'fiscal-year'].includes(nav.pickerType) ? -1 : undefined}
                className="inline-flex h-7 w-[176px] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-lg px-2 text-xs font-semibold leading-none tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap hover:text-sky-600 dark:hover:text-sky-400"
              >
                {/* Căn theo mắt: tâm biểu tượng trùng tâm chữ số (phông chữ vẽ chữ hơi cao hơn tâm hộp dòng). */}
                <Calendar className="w-3.5 h-3.5 shrink-0 -translate-y-[0.5px]" strokeWidth={2.25} />
                {nav.label}
              </button>
              {nav.pickerType === 'fiscal-year' ? (
                <select
                  aria-label="Chọn năm tài chính"
                  title={nav.pickerTitle}
                  value={fiscalYear}
                  onChange={(event) => setFiscalYear(Number(event.target.value))}
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
                >
                  {fiscalYearOptions.map(year => <option key={year} value={year}>{year}–{year + 1} (T10/{year} – T9/{year + 1})</option>)}
                </select>
              ) : nav.pickerType === 'year' ? (
                // Chọn năm: ô chọn phủ trong suốt lên đúng nút, bấm vào chữ là mở danh sách năm.
                <select
                  aria-label="Chọn năm"
                  title={nav.pickerTitle}
                  value={workloadYear}
                  onChange={(event) => setWorkloadYear(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
                >
                  {yearOptions.map(year => <option key={year} value={year}>Năm {year}</option>)}
                </select>
              ) : (
                <input
                  ref={dayPickerRef}
                  type={nav.pickerType}
                  value={nav.pickerValue}
                  onChange={(event) => nav.onPick(event.target.value.split('-').map(Number))}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2 opacity-0"
                />
              )}
            </div>

            <button
              onClick={nav.next}
              title={`Tiến 1 ${nav.unit}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={nav.today}
              title={`Trở về ${nav.todayLabel.toLowerCase()}`}
              className="ml-1 w-[82px] shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-center text-[11px] font-bold bg-sky-600 text-white hover:bg-sky-500 transition-colors"
            >
              {nav.todayLabel}
            </button>
          </div>

          {/* Nút chuyển đổi giao diện Light/Dark Mode */}
          <button
            onClick={toggleTheme}
              className="aps-header-theme p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all duration-200"
            title={theme === 'dark' ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '20s' }} />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          <div ref={accountMenuRef} className="aps-header-account relative border-l border-slate-200 pl-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setAccountMenuOpen(open => !open)}
              className="aps-header-account-button flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-slate-200 text-xs font-bold text-slate-700 hover:ring-2 hover:ring-sky-500/40 dark:bg-slate-600 dark:text-slate-100"
              aria-label="Mở menu tài khoản"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              {accountUser?.avatarData
                ? <img src={accountUser.avatarData} alt="" className="h-full w-full object-cover" />
                : accountInitials}
            </button>

            {accountMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900" role="menu">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{accountUser?.name || 'Người dùng'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {accountUser?.role === 'admin' ? 'Quản trị viên' : accountUser?.company || 'APS Việt Nam'}
                  </p>
                </div>
                <a
                  href="/account"
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <UserRoundPen className="h-4 w-4" />
                  Tài khoản
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    endAuthSession();
                    window.location.assign('/login');
                  }}
                  className="flex w-full items-center gap-3 border-t border-slate-200 px-4 py-3 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
