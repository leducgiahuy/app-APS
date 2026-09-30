import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { isTaskActiveOnDate } from '../../utils/date';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Briefcase,
  Plus,
  Search,
  Phone,
  Mail,
  CheckCircle,
  AlertTriangle,
  Flame,
  Trash2,
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
    addEmployee,
    deleteEmployee,
    selectedDate
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
    <div className="space-y-6">
      
      {/* 4 Thẻ KPI Tóm Tắt Đầu Trang */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Tổng nhân sự */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng Nhân Sự
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {totalEmployees} <span className="text-sm font-normal text-slate-500">người</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2: Nhân sự tại công trường */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Có Mặt Tại Công Trường
            </p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {onSiteCount} <span className="text-sm font-normal text-slate-500">/ {totalEmployees}</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center relative">
            <UserCheck className="w-6 h-6" />
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
        </div>

        {/* KPI 3: Định mức giờ chuẩn */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ca Làm Chuẩn
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              8 <span className="text-sm font-normal text-slate-500">giờ / ngày</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Giờ tăng ca */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400">
              Tổng Giờ Tăng Ca (OT)
            </p>
            <p className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">
              {totalOtHours} <span className="text-sm font-normal text-slate-500">giờ</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Flame className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Thanh công cụ: Tìm kiếm, Lọc đội nhóm, Nút thêm nhân sự */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Ô tìm kiếm */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên, mã NV, chức danh..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Bộ lọc đội ngũ & Nút tạo */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm shadow-md shadow-sky-600/20 transition-all hover:scale-[1.02] flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Nhân Sự</span>
          </button>
        </div>

      </div>

      {/* Lưới danh sách nhân sự (Personnel Cards Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredEmployees.map((emp) => {
          const activeTasks = allTasks.filter(task => {
            const assignedById = task.employeeId === emp.id;
            const assignedByName = (task.employeeName || '').trim().toLowerCase() === emp.name.trim().toLowerCase();
            return (assignedById || assignedByName) && isTaskActiveOnDate(task, selectedDate);
          });
          const dailyOtHours = overtimes
            .filter(ot => (ot.employeeId === emp.id || (ot.employeeName || '').trim().toLowerCase() === emp.name.trim().toLowerCase()) && String(ot.date || '').slice(0, 10) === selectedDateKey && (!ot.status || ot.status === 'approved'))
            .reduce((sum, ot) => sum + (Number(ot.hours) || 0), 0);
          const checkInDate = emp.checkInAt ? new Date(emp.checkInAt) : null;
          const checkInDateLabel = checkInDate && Number.isFinite(checkInDate.getTime())
            ? checkInDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '';
          const handleOnSiteAction = () => {
            if (!emp.isOnSite) {
              toggleOnSite(emp.id);
              return;
            }

            const checkInTimestamp = Date.parse(emp.checkInAt || '');
            if (Number.isFinite(checkInTimestamp)) {
              const now = new Date();
              const checkIn = new Date(checkInTimestamp);
              const shiftDateKey = `${checkIn.getFullYear()}-${String(checkIn.getMonth() + 1).padStart(2, '0')}-${String(checkIn.getDate()).padStart(2, '0')}`;
              const shiftOtHours = overtimes
                .filter(ot =>
                  (ot.employeeId === emp.id || (ot.employeeName || '').trim().toLowerCase() === emp.name.trim().toLowerCase()) &&
                  String(ot.date || '').slice(0, 10) === shiftDateKey &&
                  (!ot.status || ot.status === 'approved')
                )
                .reduce((sum, ot) => sum + (Number(ot.hours) || 0), 0);
              const breakStartedTimestamp = Date.parse(emp.breakStartedAt || '');
              const activeBreakMs = emp.isOnBreak && Number.isFinite(breakStartedTimestamp)
                ? Math.max(0, now.getTime() - breakStartedTimestamp)
                : 0;
              const workedMinutes = Math.max(0, Math.floor((
                now.getTime() - checkInTimestamp - (Number(emp.totalBreakMs) || 0) - activeBreakMs
              ) / 60000));
              const requiredMinutes = Math.ceil(((Number(emp.standardHours) || 8) + shiftOtHours) * 60);

              if (workedMinutes < requiredMinutes) {
                const formatDuration = minutes => `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
                const remaining = requiredMinutes - workedMinutes;
                const confirmed = window.confirm(
                  `${emp.name} mới làm ${formatDuration(workedMinutes)}, còn thiếu ${formatDuration(remaining)} theo giờ ca và OT đã duyệt. Bạn có chắc chắn muốn rời công trường và kết thúc ca không?`
                );
                if (!confirmed) return;
              }
            }

            toggleOnSite(emp.id);
          };
          return (
            <div
              key={emp.id}
              className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col justify-between
                ${emp.isOnSite
                  ? 'border-emerald-500/40 dark:border-emerald-500/30 ring-1 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-800'
                }
              `}
            >
              {/* Header của Card: Avatar, Tên, Mã NV, Chức danh */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={emp.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'}
                      alt={emp.name}
                      className="w-13 h-13 rounded-2xl object-cover border-2 border-slate-200 dark:border-slate-700 shadow-sm"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">
                          {emp.name}
                        </h3>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {emp.code}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 mt-0.5">
                        {emp.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {emp.team}
                      </p>
                    </div>
                  </div>

                  {/* Nút xóa nhân viên */}
                  <button
                    onClick={() => deleteEmployee(emp.id)}
                    title="Xóa nhân sự"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Huy hiệu: SỐ LƯỢNG TASK ĐANG ĐẢM NHẬN BÊN DƯỚI TÊN */}
                <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                      <Briefcase className="w-3.5 h-3.5 text-sky-500" />
                      Công việc phụ trách:
                    </span>
                    <span className="font-bold text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-full bg-sky-500/10">
                      {activeTasks.length} task
                    </span>
                  </div>

                  {/* Danh sách các task dưới dạng tag */}
                  {activeTasks.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {activeTasks.map((t, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] text-slate-700 dark:text-slate-300 truncate flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                          <span className="truncate">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400 italic">Chưa được giao task</p>
                  )}
                </div>

                {/* Giờ làm việc chuẩn & Tăng ca */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <span className="text-slate-400 text-[10px] block">Ca chuẩn</span>
                    <span className="font-bold">{emp.standardHours || 8}h / ngày</span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <span className="text-amber-500/70 text-[10px] block">Tăng ca (OT)</span>
                    <span className="font-bold">{dailyOtHours > 0 ? `+${dailyOtHours}h` : '—'}</span>
                  </div>
                </div>

                {/* Thông tin liên hệ */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{emp.phone || 'Chưa có SĐT'}</span>
                  </div>
                </div>
              </div>

              {/* Chân Card: Trạng thái On-Site & Nút Chuyển Đổi Nhanh */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      emp.isOnBreak ? 'bg-amber-500' : emp.isOnSite ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  <div className="flex flex-col">
                    <span
                      className={`text-xs font-bold ${
                        emp.isOnBreak ? 'text-amber-600 dark:text-amber-400' : emp.isOnSite ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {emp.isOnBreak ? 'Đang tạm nghỉ' : emp.isOnSite ? 'Tại công trường' : 'Vắng mặt'}
                    </span>
                    {emp.isOnSite && emp.checkInTime && (
                      <span className="text-[10px] text-slate-400">
                        Vào ca: {emp.checkInTime}{checkInDateLabel ? ` · ${checkInDateLabel}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Nút Toggle Điểm danh */}
                <div className="flex items-center gap-2">
                  {emp.isOnSite && (
                    <button
                      onClick={() => toggleBreak(emp.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        emp.isOnBreak
                          ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}
                    >
                      {emp.isOnBreak ? 'Tiếp tục' : 'Tạm nghỉ'}
                    </button>
                  )}
                  <button
                    onClick={handleOnSiteAction}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      emp.isOnSite
                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300'
                        : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm'
                    }`}
                  >
                    {emp.isOnSite ? 'Rời công trường' : 'Vào công trường'}
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal: Tạo Nhân Sự Mới */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
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
        </div>
      )}

    </div>
  );
}
