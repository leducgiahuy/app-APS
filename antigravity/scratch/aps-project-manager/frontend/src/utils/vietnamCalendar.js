// Vietnamese lunar calendar, astronomical new moons and solar longitude at UTC+7.
// Formula reference: Ho Ngoc Duc, https://www.xemamlich.uhm.vn/calrules.html
const floor = Math.floor;
const rad = Math.PI / 180;
const cycle = 29.530588853;
const epoch = 2415021.076998695;

function julianDay(day, month, year) {
  const a = floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - floor(y / 100) + floor(y / 400) - 32045;
}

function newMoonDay(k) {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const sun = (359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3) * rad;
  const moon = (306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3) * rad;
  const latitude = (21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3) * rad;
  const correction = (0.1734 - 0.000393 * t) * Math.sin(sun) + 0.0021 * Math.sin(2 * sun)
    - 0.4068 * Math.sin(moon) + 0.0161 * Math.sin(2 * moon) - 0.0004 * Math.sin(3 * moon)
    + 0.0104 * Math.sin(2 * latitude) - 0.0051 * Math.sin(sun + moon)
    - 0.0074 * Math.sin(sun - moon) + 0.0004 * Math.sin(2 * latitude + sun)
    - 0.0004 * Math.sin(2 * latitude - sun) - 0.0006 * Math.sin(2 * latitude + moon)
    + 0.001 * Math.sin(2 * latitude - moon) + 0.0005 * Math.sin(2 * moon + sun);
  const delta = t < -11
    ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
    : -0.000278 + 0.000265 * t + 0.000262 * t2;
  const jd = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3
    + 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * rad) + correction - delta;
  return floor(jd + 0.5 + 7 / 24);
}

function solarSector(jd) {
  const t = (jd - 2451545.5 - 7 / 24) / 36525;
  const anomaly = (357.5291 + 35999.0503 * t - 0.0001559 * t * t - 0.00000048 * t * t * t) * rad;
  const longitude = (280.46645 + 36000.76983 * t + 0.0003032 * t * t
    + (1.9146 - 0.004817 * t - 0.000014 * t * t) * Math.sin(anomaly)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * anomaly) + 0.00029 * Math.sin(3 * anomaly)) * rad;
  return floor(((longitude % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) / Math.PI * 6);
}

function monthEleven(year) {
  const k = floor((julianDay(31, 12, year) - 2415021) / cycle);
  const moon = newMoonDay(k);
  return solarSector(moon) >= 9 ? newMoonDay(k - 1) : moon;
}

export function vietnamLunarDate(date) {
  const year = date.getFullYear();
  const jd = julianDay(date.getDate(), date.getMonth() + 1, year);
  const k = floor((jd - epoch) / cycle);
  let start = newMoonDay(k + 1);
  if (start > jd) start = newMoonDay(k);
  let a = monthEleven(year);
  let b = a;
  let lunarYear = year;
  if (a >= start) a = monthEleven(year - 1);
  else { b = monthEleven(year + 1); lunarYear += 1; }
  const diff = floor((start - a) / 29);
  let month = diff + 11;
  let leap = false;
  if (b - a > 365) {
    const base = floor((a - epoch) / cycle + 0.5);
    let i = 1;
    let sector = solarSector(newMoonDay(base + i));
    let previous;
    do { previous = sector; i += 1; sector = solarSector(newMoonDay(base + i)); }
    while (sector !== previous && i < 14);
    const leapOffset = i - 1;
    if (diff >= leapOffset) { month = diff + 10; leap = diff === leapOffset; }
  }
  if (month > 12) month -= 12;
  if (month >= 11 && diff < 4) lunarYear -= 1;
  return { day: jd - start + 1, month, year: lunarYear, leap };
}

export const CALENDAR_COLORS = { holiday: '#eab308', sunday: '#ddc5af', saturday: '#e9dfd3' };

// Only published annual choices belong here. Do not project them onto later years.
// 9441/TB-BNV: https://moha.gov.vn/tin-tuc/---oid57695
const annualSchedules = {
  2026: { tet: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20'], nationalDay: ['2026-09-01'] },
  // 10065/VPCP-KGVX, approved 02/10/2026; includes the two Tet compensatory days.
  // https://xaydungchinhsach.chinhphu.vn/de-xuat-2-phuong-an-nghi-tet-nguyen-dan-2027-tet-dinh-mui-11926080513033257.htm
  2027: { tet: ['2027-02-04', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10'], nationalDay: ['2027-09-03'] }
};

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function vietnamCalendarDay(date) {
  const key = dateKey(date);
  const fixed = { '01-01': 'Tết Dương lịch', '04-30': 'Ngày Giải phóng miền Nam', '05-01': 'Ngày Quốc tế Lao động', '09-02': 'Quốc khánh' };
  let holiday = fixed[key.slice(5)];
  // Resolution 28/2026/QH16, effective 01/07/2026.
  if (date.getFullYear() >= 2026 && key.slice(5) === '11-24') holiday = 'Ngày Văn hóa Việt Nam';
  const annual = annualSchedules[date.getFullYear()];
  const lunar = vietnamLunarDate(date);
  if (!lunar.leap && lunar.month === 3 && lunar.day === 10) holiday = 'Giỗ Tổ Hùng Vương (10/3 âm lịch)';
  if (annual?.tet.includes(key)) holiday = 'Tết Nguyên đán (lịch nghỉ đã công bố)';
  else if (!annual && !lunar.leap && lunar.month === 1 && lunar.day <= 5) holiday = 'Tết Nguyên đán (mùng 1–5; chờ lịch nghỉ hằng năm)';
  if (annual?.nationalDay.includes(key)) holiday = 'Nghỉ lễ Quốc khánh (lịch đã công bố)';
  const kind = holiday ? 'holiday' : date.getDay() === 0 ? 'sunday' : date.getDay() === 6 ? 'saturday' : null;
  const label = holiday || (kind === 'sunday' ? 'Chủ nhật' : kind === 'saturday' ? 'Thứ Bảy' : '');
  return { key, kind, label, color: CALENDAR_COLORS[kind] };
}

export function calendarColumns(start, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { ...vietnamCalendarDay(date), index };
  });
}
