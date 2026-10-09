import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarColumns, vietnamLunarDate, vietnamCalendarDay } from '../../frontend/src/utils/vietnamCalendar.js';

const day = key => new Date(`${key}T12:00:00`);

test('Tet follows Vietnamese lunar dates across years, including a Vietnam/China date difference', () => {
  for (const [year, key] of [[2024, '2024-02-10'], [2025, '2025-01-29'], [2026, '2026-02-17'], [2027, '2027-02-06'], [2030, '2030-02-02']]) {
    assert.deepEqual(vietnamLunarDate(day(key)), { day: 1, month: 1, year, leap: false });
  }
  // Vietnam celebrated Tet on 29/01/1968; China on 30/01/1968.
  assert.deepEqual(vietnamLunarDate(day('1968-01-29')), { day: 1, month: 1, year: 1968, leap: false });
});

test('Hung Kings holiday moves with lunar March and excludes leap months', () => {
  for (const key of ['2024-04-18', '2025-04-07', '2026-04-26', '2027-04-16']) {
    assert.match(vietnamCalendarDay(day(key)).label, /Giỗ Tổ/);
  }
  assert.deepEqual(vietnamLunarDate(day('2033-12-22')), { day: 1, month: 11, year: 2033, leap: true });
});

test('official 2026/2027 choices are scoped to their own year', () => {
  for (const key of ['2026-02-16', '2026-02-20', '2027-02-04', '2027-02-10', '2026-09-01', '2027-09-03']) {
    assert.equal(vietnamCalendarDay(day(key)).kind, 'holiday', key);
  }
  assert.notEqual(vietnamCalendarDay(day('2026-02-21')).kind, 'holiday');
  assert.notEqual(vietnamCalendarDay(day('2027-09-01')).kind, 'holiday');
  assert.notEqual(vietnamCalendarDay(day('2028-09-03')).kind, 'holiday');
});

test('weekends differ, holiday takes priority, and culture holiday starts in 2026', () => {
  assert.equal(vietnamCalendarDay(day('2026-10-10')).kind, 'saturday');
  assert.equal(vietnamCalendarDay(day('2026-10-11')).kind, 'sunday');
  assert.equal(vietnamCalendarDay(day('2026-10-12')).kind, null);
  assert.equal(vietnamCalendarDay(day('2026-04-26')).kind, 'holiday');
  assert.equal(vietnamCalendarDay(day('2026-11-24')).kind, 'holiday');
  assert.notEqual(vietnamCalendarDay(day('2025-11-24')).kind, 'holiday');
  for (const key of ['2028-01-01', '2029-04-30', '2030-05-01', '2031-09-02']) assert.equal(vietnamCalendarDay(day(key)).kind, 'holiday');
});

test('columns remain consecutive over year boundaries and leap day', () => {
  assert.deepEqual(calendarColumns(day('2026-12-31'), 3).map(d => [d.key, d.index]), [['2026-12-31', 0], ['2027-01-01', 1], ['2027-01-02', 2]]);
  assert.deepEqual(calendarColumns(day('2028-02-28'), 3).map(d => d.key), ['2028-02-28', '2028-02-29', '2028-03-01']);
});
