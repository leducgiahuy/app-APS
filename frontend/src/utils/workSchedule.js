import { vietnamCalendarDay } from './vietnamCalendar.js';

/**
 * Giờ làm việc chuẩn của công ty: một nguồn duy nhất cho máy chủ (vào / rời ca, tính giờ task, chấm công)
 * và giao diện (nhắc nghỉ trưa, cảnh báo rời sớm, thanh tiến độ). Đổi giờ làm chỉ cần sửa ở đây.
 *
 * - Thứ Hai–thứ Sáu: 8:00–17:30, nghỉ trưa 12:00–13:30 (không tính giờ) → 8 giờ làm.
 * - Thứ Bảy: 8:00–12:00, không nghỉ trưa → 4 giờ.
 * - Chủ nhật, ngày lễ: không có ca thường (chỉ tăng ca có phiếu duyệt, theo quy tắc tăng ca riêng).
 * - Được bấm Vào văn phòng sớm nhất 15 phút trước giờ bắt đầu (7:45); giờ làm chỉ tính trong khung giờ ca.
 * Mọi mốc giờ tính theo giờ Việt Nam (UTC+7, không đổi giờ theo mùa), dù máy chủ đặt múi giờ nào.
 */
export const WORK_SCHEDULE = {
  checkInLeadMinutes: 15,
  weekday: { start: 8 * 60, end: 17 * 60 + 30, lunch: [12 * 60, 13 * 60 + 30] },
  saturday: { start: 8 * 60, end: 12 * 60, lunch: null },
};

const VN_OFFSET_MS = 7 * 3600000;
const MINUTE = 60000;
const toMs = value => value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);

/** Ngày (yyyy-mm-dd) theo giờ Việt Nam của một thời điểm. */
export const vnDateKey = value => new Date(toMs(value) + VN_OFFSET_MS).toISOString().slice(0, 10);
/** Số phút tính từ 0:00 (giờ Việt Nam) của một thời điểm. */
export const vnMinuteOfDay = value => { const date = new Date(toMs(value) + VN_OFFSET_MS); return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60; };
const dayStartMs = key => Date.parse(`${key}T00:00:00Z`) - VN_OFFSET_MS;
const nextKey = key => new Date(Date.parse(`${key}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
/** "8:00", "17:30" từ số phút trong ngày. */
export const clockLabel = minutes => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
/** Số giờ để hiển thị: tối đa 2 chữ số thập phân, dấu phẩy kiểu Việt ("2,29", "8", "1,5"). Chỉ để hiện — tính toán vẫn dùng số đầy đủ. */
export const hoursLabel = value => (Number(value) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
/** "2 giờ 15 phút", "45 phút". */
export function durationLabel(ms) {
  const total = Math.max(0, Math.round(ms / MINUTE));
  const hours = Math.floor(total / 60), minutes = total % 60;
  return hours ? `${hours} giờ${minutes ? ` ${minutes} phút` : ''}` : `${minutes} phút`;
}

/** Khung ca của một ngày, null nếu Chủ nhật / ngày lễ. */
export function scheduleForDate(key) {
  const kind = vietnamCalendarDay(new Date(`${key}T12:00:00`)).kind;
  if (kind === 'holiday' || kind === 'sunday') return null;
  return new Date(`${key}T12:00:00Z`).getUTCDay() === 6 ? WORK_SCHEDULE.saturday : WORK_SCHEDULE.weekday;
}

/** Các khoảng giờ được tính công của một ngày (ms), đã bỏ nghỉ trưa. */
export function workWindows(key) {
  const schedule = scheduleForDate(key);
  if (!schedule) return [];
  const base = dayStartMs(key), at = minutes => base + minutes * MINUTE;
  return schedule.lunch
    ? [[at(schedule.start), at(schedule.lunch[0])], [at(schedule.lunch[1]), at(schedule.end)]]
    : [[at(schedule.start), at(schedule.end)]];
}

/** Số ms làm việc thật trong khoảng [start, end]: chỉ phần nằm trong giờ ca, không tính nghỉ trưa, trước giờ vào hay sau giờ tan. */
export function scheduledWorkMs(start, end) {
  const from = toMs(start), to = toMs(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  let total = 0;
  for (let key = vnDateKey(from), last = vnDateKey(to); key <= last; key = nextKey(key)) {
    for (const [windowStart, windowEnd] of workWindows(key)) total += Math.max(0, Math.min(to, windowEnd) - Math.max(from, windowStart));
  }
  return total;
}
export const scheduledWorkHours = (start, end) => scheduledWorkMs(start, end) / 3600000;

/** Tổng giờ làm của một ngày theo lịch (8 / 4 / 0). */
export const dayWorkHours = key => workWindows(key).reduce((sum, [start, end]) => sum + (end - start), 0) / 3600000;
/** Giờ tan ca (ms) của một ngày, null nếu không có ca. */
export function shiftEndMs(key) { const schedule = scheduleForDate(key); return schedule ? dayStartMs(key) + schedule.end * MINUTE : null; }
/** Khung nghỉ trưa (ms) của một ngày, null nếu ngày đó không nghỉ trưa. */
export function lunchWindowMs(key) { const schedule = scheduleForDate(key); return schedule?.lunch ? schedule.lunch.map(minutes => dayStartMs(key) + minutes * MINUTE) : null; }

/** Kiểm tra bấm "Vào văn phòng" (ca thường) tại thời điểm now. */
export function regularClockInCheck(now = Date.now()) {
  const key = vnDateKey(now), schedule = scheduleForDate(key);
  if (!schedule) return { ok: false, lateMinutes: 0, message: 'Hôm nay là Chủ nhật / ngày lễ nên không có ca làm việc thường. Chỉ vào được ca tăng ca đã được duyệt.' };
  const minute = vnMinuteOfDay(now), opensAt = schedule.start - WORK_SCHEDULE.checkInLeadMinutes;
  if (minute < opensAt) return { ok: false, lateMinutes: 0, message: `Chưa tới giờ vào ca. Ca làm việc bắt đầu lúc ${clockLabel(schedule.start)}, được bấm Vào văn phòng từ ${clockLabel(opensAt)}.` };
  if (minute >= schedule.end) return { ok: false, lateMinutes: 0, message: `Đã hết giờ làm việc hôm nay (${clockLabel(schedule.end)}). Làm thêm cần vào ca tăng ca đã được duyệt.` };
  const lateMinutes = Math.max(0, Math.floor(minute - schedule.start));
  return { ok: true, lateMinutes, message: lateMinutes ? `Đi trễ ${durationLabel(lateMinutes * MINUTE)} (ca bắt đầu ${clockLabel(schedule.start)}). Giờ làm tính từ lúc vào ca tới ${clockLabel(schedule.end)}.` : '' };
}

/** Kiểm tra bấm "Tạm nghỉ" (ca thường): chỉ trong giờ nghỉ trưa. */
export function breakStartCheck(now = Date.now()) {
  const key = vnDateKey(now), schedule = scheduleForDate(key);
  if (!schedule?.lunch) return { ok: false, message: 'Hôm nay không có giờ nghỉ trưa nên không tạm nghỉ được.' };
  const minute = vnMinuteOfDay(now);
  if (minute < schedule.lunch[0] || minute >= schedule.lunch[1]) return { ok: false, message: `Chỉ được tạm nghỉ trong giờ nghỉ trưa ${clockLabel(schedule.lunch[0])}–${clockLabel(schedule.lunch[1])}.` };
  return { ok: true, message: '' };
}

/** Rời văn phòng (ca thường) tại now: còn bao nhiêu giờ làm tới giờ tan ca của ngày vào ca. */
export function earlyLeaveInfo(checkInAt, now = Date.now()) {
  const end = shiftEndMs(vnDateKey(checkInAt || now));
  const remainingMs = end == null ? 0 : scheduledWorkMs(now, end);
  return { early: remainingMs > 0, remainingMs, endLabel: end == null ? '' : clockLabel(vnMinuteOfDay(end)), label: durationLabel(remainingMs) };
}

/** Đang trong giờ nghỉ trưa không (dùng để nhắc nghỉ trưa). */
export function isLunchTime(now = Date.now()) {
  const lunch = lunchWindowMs(vnDateKey(now)), at = toMs(now);
  return Boolean(lunch && at >= lunch[0] && at < lunch[1]);
}
