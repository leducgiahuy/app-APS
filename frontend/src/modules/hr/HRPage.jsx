import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getCurrentUser } from '../auth/authSession';
import { linkAccountsToEmployees } from '../auth/accountEmployeeSync';
import EmployeeCard from './EmployeeCard';
import {
  Users,
  UserCheck,
  Clock,
  Search,
  Flame,
  Filter
} from 'lucide-react';

export default function HRPage() {
  const {
    employees,
    tasks: allTasks,
    overtimes,
    toggleOnSite,
    toggleBreak,
    setActiveTask,
    deleteEmployee,
    selectedDate,
    currentTime,
    loading,
    refreshAllData,
    showToast,
    permissions,
    viewerEmployeeId
  } = useApp();

  // Tài khoản tạo trước khi có liên kết: admin mở trang thì tự gắn/tạo nhân sự tương ứng (chạy 1 lần)
  const accountsLinked = useRef(false);
  useEffect(() => {
    if (loading || accountsLinked.current || getCurrentUser()?.role !== 'admin') return;
    accountsLinked.current = true;
    linkAccountsToEmployees()
      .then(count => {
        if (!count) return;
        showToast(`Đã liên kết ${count} tài khoản với hồ sơ nhân sự`);
        refreshAllData();
      })
      .catch(error => showToast(`Chưa liên kết được tài khoản với nhân sự: ${error.message}`, 'error'));
  }, [loading]);

  // Bộ lọc và tìm kiếm
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  // Được đặt bởi nút "Làm" ở Việc của tôi khi người dùng cần vào ca trước khi bắt đầu task.
  const [focusEmployeeId] = useState(() => sessionStorage.getItem('aps-focus-employee-id') || '');

  useEffect(() => {
    if (!focusEmployeeId || !employees.some(employee => employee.id === focusEmployeeId)) return undefined;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-employee-id="${focusEmployeeId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      sessionStorage.removeItem('aps-focus-employee-id');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusEmployeeId, employees]);

  // Tính toán KPI nhanh
  const totalEmployees = employees.length;
  const onSiteEmployees = employees.filter(e => e.isOnSite);
  const onSiteCount = onSiteEmployees.length;
  const totalOtHours = employees.reduce((sum, e) => sum + (e.totalOtHours || 0), 0);
  const selectedDateKey = selectedDate instanceof Date
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : String(selectedDate || '').slice(0, 10);

  // Danh sách ban/đội duy nhất
  const teams = ['ALL', ...new Set(employees.map(e => e.team).filter(Boolean))];

  // Lọc danh sách nhân sự
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = selectedTeam === 'ALL' || emp.team === selectedTeam;
    return matchesSearch && matchesTeam;
  });

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 pt-0 pb-6">
      <div className="hr-fixed-controls sticky top-16 z-20 -mx-4 sm:-mx-6 space-y-0 bg-slate-50 dark:bg-slate-950 pb-1">
      {/* 4 Thẻ KPI Tóm Tắt Đầu Trang */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
        
        {/* KPI 1: Tổng nhân sự */}
        <div className="p-3 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng Nhân Sự
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {totalEmployees} <span className="text-sm font-normal text-slate-500">người</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Nhân sự tại văn phòng */}
        <div className="p-3 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Có Mặt Tại Văn Phòng
            </p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {onSiteCount} <span className="text-sm font-normal text-slate-500">/ {totalEmployees}</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center relative">
            <UserCheck className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
        </div>

        {/* KPI 3: Định mức giờ chuẩn */}
        <div className="p-3 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ca Làm Chuẩn
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              8 <span className="text-sm font-normal text-slate-500">giờ / ngày</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: Giờ tăng ca */}
        <div className="p-3 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400">
              Tổng Giờ Tăng Ca (OT)
            </p>
            <p className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">
              {totalOtHours} <span className="text-sm font-normal text-slate-500">giờ</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Thanh công cụ: Tìm kiếm, Lọc đội nhóm */}
      <div className="p-3 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Ô tìm kiếm */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên, mã NV, chức danh..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Bộ lọc đội ngũ */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {teams.map(team => (
                <option key={team} value={team}>
                  {team === 'ALL' ? 'Tất cả ban / đội' : team}
                </option>
              ))}
            </select>
          </div>
        </div>

      </div>
      </div>

      {/* Lưới danh sách nhân sự (Personnel Cards Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredEmployees.map((emp) => (
          <EmployeeCard
            key={emp.id}
            emp={emp}
            allTasks={allTasks}
            overtimes={overtimes}
            selectedDate={selectedDate}
            selectedDateKey={selectedDateKey}
            currentTime={currentTime}
            toggleOnSite={toggleOnSite}
            toggleBreak={toggleBreak}
            setActiveTask={setActiveTask}
            deleteEmployee={deleteEmployee}
            highlighted={emp.id === focusEmployeeId}
            canOperate={emp.id === viewerEmployeeId || permissions.superviseAttendance}
            canDelete={permissions.manageMembers}
          />
        ))}
      </div>

    </div>
  );
}
