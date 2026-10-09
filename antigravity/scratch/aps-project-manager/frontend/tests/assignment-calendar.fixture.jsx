import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AssignmentCalendarConfirmation from '../src/modules/gantt/AssignmentCalendarConfirmation';
import GanttExcludedDaysBar from '../src/modules/gantt/GanttExcludedDaysBar';
import { assignmentCalendarConflicts } from '../src/utils/assignmentCalendar';
import { calculateAssignmentHours } from '../src/utils/ganttEffort';
import '../src/index.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
const checks = [];
const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
function Fixture({ ordinary = false }) {
  const item = { title: 'Test', startDate: '2026-11-23', endDate: ordinary ? '2026-11-23' : '2026-11-25' };
  const [exclude, setExclude] = useState(null);
  const [open, setOpen] = useState(true);
  const row = { ...item, employeeId: 'e', estimatedHoursPerDay: 8, excludeNonWorkingDays: exclude === true };
  const conflicts = assignmentCalendarConflicts([row]);
  return <div style={{ padding: 24 }}>
    <button id="reopen" onClick={() => setOpen(true)}>Phân công lại</button>
    <div id="hours">{calculateAssignmentHours(item, row)}</div>
    <svg width={150} height={100}>
      <rect x={30} width={30} height={100} fill="#fbefbd" />
      <GanttExcludedDaysBar item={{ ...item, assignees: [row] }} timelineStart={new Date(2026, 10, 23)} pxPerDay={30} coord={{ y: 30, height: 24 }} progress={50} fillColor="#94a3b8" statusColor="#861b36" />
    </svg>
    {open && conflicts.length > 0 && <AssignmentCalendarConfirmation title={item.title} conflicts={conflicts} saving={false} onClose={() => setOpen(false)} onChoice={value => { setExclude(value); setOpen(false); }} />}
  </div>;
}
try {
  await act(async () => root.render(<Fixture />));
  check(document.querySelector('[role="alertdialog"]')?.textContent.includes('24/11/2026'), 'warning identifies an interior holiday');
  await act(async () => [...document.querySelectorAll('[role="alertdialog"] button')].find(b => b.textContent === 'Không').click());
  check(document.getElementById('hours').textContent === '16', 'No excludes holiday hours');
  const segments = [...document.querySelectorAll('[data-working-segment]')];
  check(segments.length === 2, 'No splits the Gantt bar into two segments');
  check(segments[0].firstElementChild.getAttribute('x') === '0' && segments[1].firstElementChild.getAttribute('x') === '60', 'holiday day column has a gap in the task bar');
  check(document.querySelector('[data-progress]').getAttribute('width') === '30', '50% progress fills one of the two actual working days');
  await act(async () => document.getElementById('reopen').click());
  await act(async () => [...document.querySelectorAll('[role="alertdialog"] button')].find(b => b.textContent === 'CÓ').click());
  check(document.getElementById('hours').textContent === '24', 'Yes retains normal holiday hours');
  check(document.querySelectorAll('[data-working-segment]').length === 1 && document.querySelector('[data-working-segment] rect').getAttribute('width') === '90', 'Yes retains continuous three-day bar');
  await act(async () => root.render(<Fixture key="ordinary" ordinary />));
  check(!document.querySelector('[role="alertdialog"]'), 'ordinary dates do not show a warning');
  document.getElementById('test-results').textContent = JSON.stringify({ passed: checks.length, checks });
} catch (error) { document.getElementById('test-results').textContent = JSON.stringify({ failed: error.message }); throw error; }
