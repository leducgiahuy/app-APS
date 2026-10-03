import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { formatDateVi, scheduledProgress, isTaskOverdue, taskDelayHours, formatDelayHours } from '../../utils/date';
import { getGanttTaskCode } from '../../utils/taskCode';
import {
  BarChart3,
  Building,
  CheckCircle2,
  Clock,
  Flame,
  AlertTriangle,
  Users,
  Briefcase,
  TrendingUp,
  Search,
  Filter
} from 'lucide-react';

export default function DashboardPage() {
  const { stats, projects, tasks, ganttItems, employees, currentTime } = useApp();

  // Bộ lọc dự án trong bảng thống kê
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const overview = stats?.overview || {
    totalProjects: projects.length,
    totalEmployees: employees.length,
    onSiteEmployees: employees.filter(e => e.isOnSite).length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
    delayedTasks: tasks.filter(t => t.speedStatus === 'delayed').length,
    earlyTasks: tasks.filter(t => t.speedStatus === 'early').length,
    onTimeTasks: tasks.filter(t => t.speedStatus === 'on_time').length,
    totalOtHours: 9.5,
    overallCompletionRate: projects.length > 0
      ? Math.round(projects.reduce((sum, project) => {
        const projectTasks = tasks.filter(task => task.projectId === project.id);
        return sum + (projectTasks.length ? projectTasks.filter(task => task.status === 'completed').length / projectTasks.length * 100 : 0);
      }, 0) / projects.length)
      : 0
  };
  const liveDelayedTaskCount = tasks.filter(task => task.status === 'completed'
    ? task.speedStatus === 'delayed'
    : taskDelayHours(task, currentTime) > 0
  ).length;

  // Lọc danh sách công việc hiển thị trong bảng
  const filteredTasks = tasks.filter(task => {
    const matchesProj = selectedProjectId === 'ALL' || task.projectId === selectedProjectId;
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.projectName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesProj && matchesSearch;
  });

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 pt-0 pb-6">
      <div className="sticky top-16 z-20 -mx-4 sm:-mx-6 bg-slate-50 dark:bg-slate-950 pb-2">
      {/* 4 Thẻ KPI Dashboard Tổng Quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
        
        {/* KPI 1: Tỉ lệ hoàn thành dự án */}
        <div className="p-4 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tiến Độ Dự Án Trung Bình
            </p>
            <p className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">
              {overview.overallCompletionRate}%
            </p>
            <div className="w-32 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-sky-600 rounded-full"
                style={{ width: `${overview.overallCompletionRate}%` }}
              />
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Tổng công việc & Tình trạng */}
        <div className="p-4 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Công Việc Đã Xong
            </p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {overview.completedTasks} <span className="text-sm font-normal text-slate-400">/ {overview.totalTasks}</span>
            </p>
            <p className="text-[11px] text-emerald-500 font-semibold mt-1">
              {Math.round((overview.completedTasks / Math.max(1, overview.totalTasks)) * 100)}% đạt yêu cầu
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Công việc chậm tiến độ */}
        <div className="p-4 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Chậm Tiến Độ / Cảnh Báo
            </p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {liveDelayedTaskCount} <span className="text-sm font-normal text-slate-400">hạng mục</span>
            </p>
            <p className="text-[11px] text-rose-500 font-semibold mt-1">
              Cần ưu tiên bổ sung OT
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: Tổng giờ làm thêm OT */}
        <div className="p-4 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng Giờ Tăng Ca Đã Cấp
            </p>
            <p className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">
              {overview.totalOtHours} <span className="text-sm font-normal text-slate-400">giờ</span>
            </p>
            <p className="text-[11px] text-amber-500 font-semibold mt-1">
              Đảm bảo tiến độ công trình
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
        </div>

      </div>
      </div>

      {/* BẢNG THỐNG KÊ CHI TIẾT CÁC CÔNG VIỆC TRONG DỰ ÁN */}
      <div className="p-6 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        
        {/* Header Bảng: Tiêu đề + Bộ lọc tìm kiếm */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-600" />
              Bảng Thống Kê Chi Tiết Các Công Việc Trong Dự Án
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tổng hợp tên dự án, công việc, nhân viên đảm nhận và thời gian hoàn thành
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Lọc dự án */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                <option value="ALL">Tất cả dự án</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Tìm kiếm */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm công việc, nhân viên..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Bảng dữ liệu thống kê */}
        <div className="max-h-[360px] overflow-x-auto overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold">
                <th className="py-3 px-3">Tên Dự Án</th>
                <th className="py-3 px-3">Tên Công Việc</th>
                <th className="py-3 px-3">Tên Nhân Viên Đảm Nhận</th>
                <th className="py-3 px-3">Thời Gian Hoàn Thành (Dự Kiến)</th>
                <th className="py-3 px-3 text-center">Tiến Độ</th>
                <th className="py-3 px-3 text-center">Tình Trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredTasks.map((t) => {
                const assignee = employees.find(e => e.id === t.employeeId);
                const progress = scheduledProgress(t, assignee?.standardHours || 8, currentTime);
                const overdue = isTaskOverdue(t, currentTime);
                const delayHours = taskDelayHours(t, currentTime);
                const earlyHours = Number(t.earlyHours) || 0;
                const liveLate = t.status !== 'completed' && delayHours > 0;
                const progressColor = t.status === 'completed' ? 'bg-emerald-500' : overdue ? 'bg-rose-500' : progress >= 80 ? 'bg-amber-500' : 'bg-sky-600';
                const taskCode = getGanttTaskCode(t, ganttItems);

                return (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    {/* Tên Dự Án */}
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white max-w-[200px] truncate" title={t.projectName}>
                      <span className="flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                        <span className="truncate">{t.projectName}</span>
                      </span>
                    </td>

                    {/* Tên công việc */}
                    <td className="py-3 px-3 max-w-[260px]" title={taskCode ? `${taskCode} · ${t.title}` : t.title}>
                      <div className="flex min-w-0 items-center gap-2">
                        {taskCode && <span className="flex-shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-600 dark:text-sky-400">{taskCode}</span>}
                        <span className="truncate font-bold text-sky-600 dark:text-sky-400">{t.title}</span>
                      </div>
                    </td>

                    {/* Tên nhân viên đảm nhận */}
                    <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-[10px]">
                          {t.employeeName.charAt(0)}
                        </div>
                        <div>
                          <span>{t.employeeName}</span>
                          <span className="text-[10px] text-slate-400 block">{assignee?.title}</span>
                        </div>
                      </div>
                    </td>

                    {/* Thời gian hoàn thành */}
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {t.estimatedDays} ngày ({t.estimatedDays > 1
                            ? `${Number(t.estimatedHoursPerDay) || (Number(t.estimatedHours) / t.estimatedDays) || (assignee?.standardHours || 8)}h/ngày, ${Number(t.estimatedHours) || t.estimatedDays * (assignee?.standardHours || 8)}h tổng`
                            : `${Number(t.estimatedHours) || t.estimatedDays * (assignee?.standardHours || 8)}h`})
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {formatDateVi(t.startDate)} → {formatDateVi(t.endDate)}
                        </span>
                      </div>
                    </td>

                    {/* Tiến độ % */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`font-bold text-xs ${overdue ? 'text-rose-600 dark:text-rose-400' : progress >= 80 && t.status !== 'completed' ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                          {progress}%{overdue ? ' · Quá hạn' : progress >= 80 && t.status !== 'completed' ? ' · Sắp hết hạn' : ''}
                        </span>
                        <div className="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mt-1">
                          <div
                            className={`h-full rounded-full transition-all ${progressColor}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Tình trạng sớm / đúng hạn / chậm */}
                    <td className="py-3 px-3 text-center">
                      {overdue && t.status !== 'completed' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                          Quá hạn{delayHours > 0 ? ` · Trễ ${formatDelayHours(delayHours)}` : ''}
                        </span>
                      )}
                      {!overdue && liveLate && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                          Chậm trễ · {formatDelayHours(delayHours)}
                        </span>
                      )}
                      {t.status === 'completed' && t.speedStatus === 'early' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          Hoàn thành sớm · Sớm {formatDelayHours(earlyHours)}
                        </span>
                      )}
                      {t.status === 'completed' && t.speedStatus === 'on_time' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-500 border border-sky-500/20">
                          Đúng hạn
                        </span>
                      )}
                      {t.status === 'completed' && t.speedStatus === 'delayed' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                          Hoàn thành muộn{delayHours > 0 ? ` · Trễ ${formatDelayHours(delayHours)}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* BẢNG XẾP HẠNG HIỆU SUẤT NHÂN SỰ */}
      <div className="p-6 rounded-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600" />
          Hiệu Suất & Đóng Góp Của Từng Nhân Sự APS
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const empTasks = tasks.filter(t => t.employeeId === emp.id);
            const completedCount = empTasks.filter(t => t.status === 'completed').length;
            const rate = empTasks.length > 0 ? Math.round((completedCount / empTasks.length) * 100) : 100;

            return (
              <div
                key={emp.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={emp.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'}
                    alt={emp.name}
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                  />
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white">{emp.name}</h4>
                    <p className="text-[11px] text-sky-600 dark:text-sky-400">{emp.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{empTasks.length} task đảm nhận</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                    {rate}% hoàn thành
                  </span>
                  <span className="text-[10px] font-semibold text-amber-500 block mt-0.5">
                    +{emp.totalOtHours || 0}h tăng ca
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
