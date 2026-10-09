import { useState } from 'react';
import { Briefcase, Phone, Trash2 } from 'lucide-react';
import { isTaskActiveOnDate } from '../../utils/date';
import {
  employeeOtEntries,
  isOvertimeClockInAllowed,
  isOvertimeShift,
  localDateKey,
  matchesEmployee,
  overtimeHoursForDate,
  overtimeTasksFromEntries,
  regularClockInDateWarning,
  SHIFT_TYPE
} from '../../utils/shift';

function assignedTasksOnDate(allTasks, emp, selectedDate) {
  return allTasks.filter(task => {
    if (Array.isArray(task.assignees) && task.assignees.length > 0) {
      return task.assignees.some(assignment => {
        const assignmentTask = {
          startDate: assignment.startDate || task.startDate,
          endDate: assignment.endDate || task.endDate
        };
        return matchesEmployee(assignment, emp) && isTaskActiveOnDate(assignmentTask, selectedDate);
      });
    }
    return matchesEmployee(task, emp) && isTaskActiveOnDate(task, selectedDate);
  });
}

function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

export default function EmployeeCard({
  emp,
  allTasks,
  overtimes,
  selectedDate,
  selectedDateKey,
  currentTime,
  toggleOnSite,
  toggleBreak,
  setActiveTask,
  deleteEmployee
}) {
  const [viewMode, setViewMode] = useState(
    isOvertimeShift(emp.shiftType) ? SHIFT_TYPE.OVERTIME : SHIFT_TYPE.REGULAR
  );
  const [pending, setPending] = useState(false);
  const isToday = selectedDateKey === localDateKey(currentTime || new Date());
  const overtimeView = viewMode === SHIFT_TYPE.OVERTIME;
  const currentShiftIsOt = isOvertimeShift(emp.shiftType);
  const actionIsOt = emp.isOnSite ? currentShiftIsOt : overtimeView;

  const regularTasks = assignedTasksOnDate(allTasks, emp, selectedDate);
  const otEntries = employeeOtEntries(overtimes, emp, selectedDateKey);
  const otTasks = overtimeTasksFromEntries(otEntries, allTasks);
  const displayedTasks = overtimeView ? otTasks : regularTasks;
  const dailyOtHours = overtimeHoursForDate(overtimes, emp, selectedDateKey);

  const checkInDate = emp.checkInAt ? new Date(emp.checkInAt) : null;
  const checkInDateLabel = checkInDate && Number.isFinite(checkInDate.getTime())
    ? checkInDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  const selectedTaskShift = emp.isOnSite ? emp.shiftType : (emp.activeTaskShiftType || SHIFT_TYPE.REGULAR);
  const selectedTaskId = isOvertimeShift(selectedTaskShift) === overtimeView && displayedTasks.some(task => task.id === emp.activeTaskId && task.status !== 'completed')
    ? emp.activeTaskId
    : '';
  const showLiveTimer = emp.activeTaskId && !emp.isOnBreak && emp.isOnSite && selectedTaskId && actionIsOt === overtimeView;

  const runAction = async (action) => {
    if (pending) return;
    setPending(true);
    try { await action(); } finally { setPending(false); }
  };

  const handleOnSiteAction = async () => {
    if (!emp.isOnSite) {
      const todayKey = localDateKey(new Date());
      if (!overtimeView) {
        const warning = regularClockInDateWarning(allTasks, emp, todayKey, selectedDateKey);
        if (warning) {
          window.alert(warning);
          return;
        }
      }
      if (selectedDateKey !== todayKey) {
        window.alert('Chỉ có thể vào ca cho ngày hôm nay. Hãy chọn hôm nay để bắt đầu task.');
        return;
      }
      if (overtimeView) {
        const gate = isOvertimeClockInAllowed(new Date());
        if (!gate.ok) {
          window.alert(gate.message);
          return;
        }
        if (dailyOtHours <= 0) {
          window.alert('Chưa có đăng ký tăng ca được duyệt cho hôm nay.');
          return;
        }
      }
      if (displayedTasks.some(task => task.status !== 'completed') && !selectedTaskId) {
        window.alert(overtimeView
          ? 'Hãy chọn task tăng ca muốn bắt đầu trước khi vào ca.'
          : 'Hãy chọn task muốn bắt đầu trước khi vào văn phòng.');
        return;
      }
      await runAction(() => toggleOnSite(emp.id, overtimeView ? SHIFT_TYPE.OVERTIME : SHIFT_TYPE.REGULAR));
      return;
    }

    const checkInTimestamp = Date.parse(emp.checkInAt || '');
    if (Number.isFinite(checkInTimestamp)) {
      const now = new Date();
      const checkIn = new Date(checkInTimestamp);
      const shiftDateKey = localDateKey(checkIn);
      const requiredHours = currentShiftIsOt
        ? overtimeHoursForDate(overtimes, emp, shiftDateKey)
        : (Number(emp.standardHours) || 8);
      const breakStartedTimestamp = Date.parse(emp.breakStartedAt || '');
      const activeBreakMs = emp.isOnBreak && Number.isFinite(breakStartedTimestamp)
        ? Math.max(0, now.getTime() - breakStartedTimestamp)
        : 0;
      const workedMinutes = Math.max(0, Math.floor((
        now.getTime() - checkInTimestamp - (Number(emp.totalBreakMs) || 0) - activeBreakMs
      ) / 60000));
      const requiredMinutes = Math.ceil(requiredHours * 60);

      if (requiredMinutes > 0 && workedMinutes < requiredMinutes) {
        const remaining = requiredMinutes - workedMinutes;
        const hoursLabel = currentShiftIsOt ? 'giờ tăng ca đã duyệt' : 'giờ ca chuẩn';
        const leaveLabel = 'rời văn phòng';
        const confirmed = window.confirm(
          `${emp.name} mới làm ${formatDuration(workedMinutes)}, còn thiếu ${formatDuration(remaining)} theo ${hoursLabel}. Bạn có chắc chắn muốn ${leaveLabel} và kết thúc ca không?`
        );
        if (!confirmed) return;
      }
    }

    await runAction(() => toggleOnSite(emp.id, emp.shiftType || SHIFT_TYPE.REGULAR));
  };

  const presenceLabel = emp.isOnBreak
    ? 'Đang tạm nghỉ'
    : emp.isOnSite
      ? (currentShiftIsOt ? 'Đang tăng ca' : 'Tại văn phòng')
      : 'Vắng mặt';
  const clockInButtonLabel = overtimeView ? 'Tăng ca' : 'Vào văn phòng';
  const clockOutButtonLabel = 'Rời văn phòng';

  return (
    <div
      className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col justify-between
        ${emp.isOnSite
          ? currentShiftIsOt
            ? 'border-amber-500/40 dark:border-amber-500/30 ring-1 ring-amber-500/20'
            : 'border-emerald-500/40 dark:border-emerald-500/30 ring-1 ring-emerald-500/20'
          : 'border-slate-200 dark:border-slate-800'
        }
      `}
    >
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

          <button
            onClick={() => deleteEmployee(emp.id)}
            title="Xóa nhân sự"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className={`mt-4 p-3 rounded-xl border ${
          overtimeView
            ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/50'
            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/60'
        }`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Briefcase className={`w-3.5 h-3.5 ${overtimeView ? 'text-amber-500' : 'text-sky-500'}`} />
              {overtimeView ? 'Công việc tăng ca:' : 'Công việc phụ trách:'}
            </span>
            <span className={`font-bold px-2 py-0.5 rounded-full ${
              overtimeView
                ? 'text-amber-700 dark:text-amber-300 bg-amber-500/10'
                : 'text-sky-600 dark:text-sky-400 bg-sky-500/10'
            }`}>
              {displayedTasks.length} task
            </span>
          </div>

          {displayedTasks.length > 0 ? (
            <div className="mt-2 space-y-1">
              {displayedTasks.map((t) => (
                <div
                  key={t.id}
                  className="text-[11px] text-slate-700 dark:text-slate-300 truncate flex items-center gap-1.5"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${overtimeView ? 'bg-amber-500' : 'bg-sky-500'}`} />
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400 italic">
              {overtimeView ? 'Chưa có task tăng ca ngày này' : 'Chưa được giao task'}
            </p>
          )}
          {displayedTasks.length > 0 && (
            <div className="mt-3 border-t border-slate-200/70 pt-2 dark:border-slate-700/70">
              <label className="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Task đang thực hiện
              </label>
              <select
                value={selectedTaskId}
                onChange={event => runAction(() => setActiveTask(emp.id, event.target.value, viewMode))}
                disabled={pending || !isToday || (emp.isOnSite && overtimeView !== currentShiftIsOt)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 disabled:opacity-60"
              >
                <option value="">-- Chọn task --</option>
                {displayedTasks.filter(task => task.status !== 'completed').map(task => (
                  <option key={task.id} value={task.id}>{task.code} · {task.title}</option>
                ))}
              </select>
              {showLiveTimer && (
                <p className={`mt-1 text-[10px] font-semibold ${currentShiftIsOt ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  Đang tính giờ: {emp.activeTaskTitle || displayedTasks.find(task => task.id === emp.activeTaskId)?.title}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setViewMode(SHIFT_TYPE.REGULAR)}
            aria-pressed={!overtimeView}
            className={`p-2 rounded-lg text-left transition-all ${
              !overtimeView
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 ring-2 ring-slate-400/80'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-150'
            }`}
          >
            <span className="text-slate-400 text-[10px] block">Ca chuẩn</span>
            <span className="font-bold">{emp.standardHours || 8}h / ngày</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode(SHIFT_TYPE.OVERTIME)}
            aria-pressed={overtimeView}
            className={`p-2 rounded-lg text-left transition-all ${
              overtimeView
                ? 'bg-amber-500/25 text-amber-800 dark:text-amber-200 ring-2 ring-amber-500/80'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15'
            }`}
          >
            <span className="text-amber-500/70 text-[10px] block">Tăng ca (OT)</span>
            <span className="font-bold">{dailyOtHours > 0 ? `+${dailyOtHours}h` : '—'}</span>
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span>{emp.phone || 'Chưa có SĐT'}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              emp.isOnBreak ? 'bg-amber-500' : emp.isOnSite ? (currentShiftIsOt ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse') : 'bg-slate-400'
            }`}
          />
          <div className="flex flex-col">
            <span
              className={`text-xs font-bold ${
                emp.isOnBreak
                  ? 'text-amber-600 dark:text-amber-400'
                  : emp.isOnSite
                    ? currentShiftIsOt
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500'
              }`}
            >
              {presenceLabel}
            </span>
            {emp.isOnSite && emp.checkInTime && (
              <span className="text-[10px] text-slate-400">
                {currentShiftIsOt ? 'Vào ca OT' : 'Vào ca'}: {emp.checkInTime}{checkInDateLabel ? ` · ${checkInDateLabel}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {emp.isOnSite && (
            <button
              onClick={() => runAction(() => toggleBreak(emp.id))}
              disabled={pending}
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
            disabled={pending}
            title={!emp.isOnSite && !isToday ? 'Chỉ vào ca cho ngày hôm nay' : undefined}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              emp.isOnSite
                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300'
                : actionIsOt
                  ? 'bg-amber-500 text-white hover:bg-amber-400 shadow-sm'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm'
            }`}
          >
            {emp.isOnSite ? clockOutButtonLabel : clockInButtonLabel}
          </button>
        </div>
      </div>
      {!isToday && (
        <p className="mt-2 text-[10px] text-slate-500">Đang xem task theo ngày đã chọn. Vào ca và chọn task chỉ áp dụng cho hôm nay.</p>
      )}
    </div>
  );
}
