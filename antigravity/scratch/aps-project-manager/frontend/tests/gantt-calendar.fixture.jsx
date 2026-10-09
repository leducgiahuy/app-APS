import { act } from 'react';
import { createRoot } from 'react-dom/client';
import GanttCalendarBackground from '../src/modules/gantt/GanttCalendarBackground';
import { calendarColumns } from '../src/utils/vietnamCalendar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
const days = calendarColumns(new Date(2027, 3, 1), 30);
const checks = [];
const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
async function render(pxPerDay) {
  await act(async () => root.render(<div style={{ fontFamily: 'Arial', background: '#f5f2ed', padding: 24 }}>
    <h3>Lịch Gantt — Tháng 4/2027</h3>
    <p>Vàng: ngày lễ · Nâu: Chủ nhật · Be: Thứ Bảy</p>
    <div style={{ display: 'flex' }}>{days.map(d => <div key={d.key} style={{ boxSizing: 'border-box', width: pxPerDay, textAlign: 'center', background: d.color, border: '1px solid #cbd5e1', padding: '8px 0', fontSize: 12 }}>{d.index + 1}</div>)}</div>
    <svg width={30 * pxPerDay} height={220}>
      <GanttCalendarBackground days={days} pxPerDay={pxPerDay} height={220} />
      <g data-foreground>
        {days.map(d => <line key={d.key} x1={d.index * pxPerDay} x2={d.index * pxPerDay} y1={0} y2={220} stroke="#cbd5e1" />)}
        <path d={`M${14 * pxPerDay} 55 C${15 * pxPerDay} 55 ${14 * pxPerDay} 140 ${16 * pxPerDay} 140`} fill="none" stroke="#64748b" strokeWidth={2} />
        <rect data-bar x={14 * pxPerDay} y={40} width={4 * pxPerDay} height={30} rx={7} fill="#64748b" />
        <text x={18 * pxPerDay + 6} y={60} fill="#334155">Thịnh — Công việc dự án</text>
        <rect x={16 * pxPerDay} y={125} width={5 * pxPerDay} height={30} rx={7} fill="#94a3b8" />
      </g>
    </svg>
  </div>));
}
try {
  for (const scale of [30, 12]) {
    await render(scale);
    const svg = document.querySelector('svg');
    const bg = svg.querySelector('[data-calendar-background]');
    check(bg === svg.firstElementChild, `background behind foreground at scale ${scale}`);
    check(bg.getAttribute('pointer-events') === 'none', `background cannot intercept clicks at scale ${scale}`);
    const holiday = [...bg.children].find(r => Number(r.getAttribute('x')) === 15 * scale);
    check(holiday?.getAttribute('fill') === '#eab308', `Hung Kings holiday aligned to 16/4 at scale ${scale}`);
    check(holiday?.getAttribute('width') === String(scale), `column width follows zoom ${scale}`);
    const bar = svg.querySelector('[data-bar]');
    const bounds = bar.getBoundingClientRect();
    check(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === bar, `bar remains above color and interactive at scale ${scale}`);
  }
  await render(30);
  document.getElementById('test-results').textContent = JSON.stringify({ passed: checks.length, checks });
} catch (error) {
  document.getElementById('test-results').textContent = JSON.stringify({ failed: error.message });
  throw error;
}
