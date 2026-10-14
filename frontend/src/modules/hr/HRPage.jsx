import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import ModalOverlay from '../../components/layout/ModalOverlay';
import EmployeeCard from './EmployeeCard';
import {
  Users,
  UserCheck,
  Clock,
  Plus,
  Search,
  Flame,
  HardHat,
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
    addEmployee,
    deleteEmployee,
    selectedDate,
    currentTime
  } = useApp();

  // Bộ lọc và tìm kiếm
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form tạo nhân sự mới
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    team: 'Ban Quản Lý',
    phone: '',
    email: '',
    standardHours: 8
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.title) return;
    const success = await addEmployee(formData);
    if (success) {
      setFormData({
        name: '',
        title: '',
        team: 'Ban Quản Lý',
        phone: '',
        email: '',
        standardHours: 8
      });
      setShowAddModal(false);
    }
  };

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

      {/* Thanh công cụ: Tìm kiếm, Lọc đội nhóm, Nút thêm nhân sự */}
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

        {/* Bộ lọc đội ngũ & Nút tạo */}
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

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm shadow-md shadow-sky-600/20 transition-all hover:scale-[1.02] flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Nhân Sự</span>
          </button>
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
          />
        ))}
      </div>

      {/* Modal: Tạo Nhân Sự Mới */}
      {showAddModal && (
        <ModalOverlay allowBackgroundScroll>
          <div className="w-full max-w-lg p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <HardHat className="w-5 h-5 text-sky-600" />
                Thêm Nhân Sự Mới Cho APS
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Họ và Tên Nhân Sự *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: Nguyễn Văn An"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Chức Danh / Vị Trí *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="VD: Kỹ sư xây dựng"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ban / Đội Công Tác
                  </label>
                  <input
                    type="text"
                    value={formData.team}
                    onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                    placeholder="VD: Kỹ Thuật Hiện Trường"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Số Điện Thoại
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="VD: 0912.345.678"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Định Mức Giờ / Ngày
                  </label>
                  <input
                    type="number"
                    value={formData.standardHours}
                    onChange={(e) => setFormData({ ...formData, standardHours: Number(e.target.value) })}
                    placeholder="8"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm shadow-md shadow-sky-600/20"
                >
                  Lưu Nhân Sự
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

    </div>
  );
}
