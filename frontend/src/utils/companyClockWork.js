import { datesInRange, nonWorkingDay, workingDayWeight } from './assignmentCalendar.js';
import { dayWorkHours, scheduledWorkHours, vnDateKey } from './workSchedule.js';

/**
 * Cột "Thực tế" chạy theo GIỜ CÔNG TY, không cần ai vào ca (người dùng chọn 05/11/2026):
 * - đồng hồ chỉ chạy trong giờ làm (workSchedule.js): T2–T6 8:00–12:00 và 13:30–17:30 (8 tiếng), T7 8:00–12:00;
 *   ngoài khung giờ, nghỉ trưa, Chủ nhật, ngày lễ thì đứng yên;
 * - mỗi người được phân công cộng đúng giờ/ngày phân công của họ (VD 2,29h/ngày), rải đều theo giờ công ty đã trôi qua
 *   trong ngày (thứ 7 = nửa ngày) → chạy hết lịch thì Thực tế = đúng kế hoạch;
 * - bắt đầu từ ngày bắt đầu phân công; task đã hoàn thành dừng ở lúc hoàn thành (xong sớm = ít công hơn);
 *   chưa xong mà quá ngày kết thúc thì vẫn chạy tiếp mỗi ngày làm việc cho tới khi xong;
 * - task chưa có người được giao: không chạy.
 * Giờ chấm công thật (vào ca / chọn task) không dùng cho cột này — vẫn dùng ở trang Công việc, Duyệt giờ, Chấm công.
 */
const workedShareOfDay = (key, untilMs) => {
  const dayHours = dayWorkHours(key);
  if (dayHours <= 0) return 0;
  return Math.min(1, scheduledWorkHours(Date.parse(`${key}T00:00:00+07:00`), untilMs) / dayHours);
};

/** Thời điểm đồng hồ của task dừng: lúc hoàn thành (task đã xong) hoặc bây giờ. */
export function taskClockUntil(item, linkedTask, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (item?.status !== 'completed' && linkedTask?.status !== 'completed') return nowMs;
  const done = Date.parse(item.completedAt || linkedTask?.completedAt || '');
  if (Number.isFinite(done)) return Math.min(done, nowMs);
  // Dữ liệu cũ không có lúc hoàn thành: coi như xong cuối ngày kết thúc.
  const end = Date.parse(`${item.endDate}T23:59:59+07:00`);
  return Number.isFinite(end) ? Math.min(end, nowMs) : nowMs;
}

/** Giờ đã chạy theo giờ công ty của một task, cộng mọi người được phân công. running = đồng hồ đang chạy lúc này. */
export function companyClockWorkHours(item, { linkedTask = null, now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const untilMs = taskClockUntil(item, linkedTask, nowMs);
  const untilKey = vnDateKey(untilMs);
  const completed = item?.status === 'completed' || linkedTask?.status === 'completed';
  const assignees = (item?.assignees || []).filter(assignment => assignment.employeeId || assignment.employeeName);
  let hours = 0, running = false;
  for (const assignment of assignees) {
    const daily = Number(assignment.estimatedHoursPerDay) || Number(item.estimatedHoursPerDay) || 8;
    const start = assignment.startDate || item.startDate;
    const plannedEnd = assignment.endDate || item.endDate;
    if (!start || start > untilKey) continue;
    // Chưa xong mà đã quá ngày kết thúc → chạy tiếp tới hôm nay.
    const end = !completed && plannedEnd < untilKey ? untilKey : plannedEnd;
    for (const key of datesInRange(start, end < untilKey ? end : untilKey)) {
      // Đồng hồ công ty không bao giờ chạy vào Chủ nhật / ngày lễ (không có giờ làm), dù phân công có bỏ ngày nghỉ hay không.
      if (nonWorkingDay(key) || dayWorkHours(key) <= 0) continue;
      const share = key < untilKey ? 1 : workedShareOfDay(key, untilMs);
      hours += daily * workingDayWeight(key) * share;
      if (key === untilKey && !completed && share > 0 && share < 1) running = true;
    }
  }
  // "running" chỉ khi đang trong khung giờ làm (phần đã chạy trong ngày tăng theo phút).
  if (running) running = scheduledWorkHours(nowMs - 60000, nowMs) > 0;
  return { hours, running };
}
