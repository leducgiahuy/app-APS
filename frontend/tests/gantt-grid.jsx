import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import GanttRowGrid from '../src/modules/gantt/GanttRowGrid';
import '../src/index.css';

if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');

// Isolated rendering fixture: never loads or modifies application data.
function LegacyGrid({ items, coordinates, monthColumns, zoomLevel, pxPerDay, width, rowOffsets }) {
  return <g>
    {items.flatMap(item => {
      const coord = coordinates[item.id];
      if (!coord || item.isGroup) return [];
      return monthColumns.flatMap((month, monthIndex) => Array.from({ length: zoomLevel === 'month' ? month.days : 4 }, (_, index) => (
        <rect key={`${item.id}-${monthIndex}-${index}`}
          x={month.left + index * (zoomLevel === 'month' ? pxPerDay : month.width / 4)}
          y={coord.rowTop} width={zoomLevel === 'month' ? pxPerDay : month.width / 4} height={coord.rowHeight}
          fill="none" stroke="#cbd5e1" strokeOpacity="0.75" strokeWidth="0.7"
          shapeRendering="crispEdges" className="dark:stroke-slate-700" />
      )));
    })}
    {items.map((item, index) => <line key={item.id}
      x1={0} y1={rowOffsets[index + 1]} x2={width} y2={rowOffsets[index + 1]}
      stroke="#e2e8f0" strokeWidth="1" className="dark:stroke-slate-800/60" />)}
  </g>;
}

function fixture(zoomLevel) {
  const pxPerDay = zoomLevel === 'month' ? 20 : 7.5;
  let left = 0;
  const monthColumns = Array.from({ length: 12 }, (_, index) => {
    const days = new Date(2026, 10 + index, 0).getDate();
    const month = { days, left, width: days * pxPerDay };
    left += month.width;
    return month;
  });
  const items = Array.from({ length: 40 }, (_, index) => ({ id: `row-${index}`, isGroup: index === 1 }));
  const rowOffsets = [0];
  const coordinates = {};
  items.forEach((item, index) => {
    const rowHeight = item.isGroup ? 36 : index % 3 === 0 ? 70 : 44;
    if (index !== 0) coordinates[item.id] = { rowTop: rowOffsets[index], rowHeight };
    rowOffsets.push(rowOffsets[index] + rowHeight);
  });
  return { items, coordinates, monthColumns, zoomLevel, pxPerDay, width: left, height: rowOffsets.at(-1) + 20, rowOffsets };
}

const root = createRoot(document.getElementById('benchmark'));
function render(Component, props) {
  flushSync(() => root.render(<svg width={props.width} height={props.height}><Component {...props} /></svg>));
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const host = document.getElementById('benchmark');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

try {
  const month = fixture('month');
  const week = fixture('week');
  render(LegacyGrid, month);
  const oldMonthRects = host.querySelectorAll('rect').length;
  render(GanttRowGrid, month);
  const newMonthRects = host.querySelectorAll('rect').length;
  assert(newMonthRects === 76, 'Month should use two rects per eligible row, excluding project/group rows');
  assert(host.querySelector('pattern').getAttribute('width') === '20', 'Day spacing changed');
  assert(host.querySelector('pattern').getAttribute('height') === String(month.height), 'Pattern height mismatch');
  assert(host.querySelectorAll('line').length === month.items.length, 'Row separators changed');
  const outlines = [...host.querySelectorAll('rect[stroke]')];
  const eligible = month.items.filter(item => month.coordinates[item.id] && !item.isGroup);
  outlines.forEach((rect, index) => {
    const coord = month.coordinates[eligible[index].id];
    assert(Number(rect.getAttribute('y')) === coord.rowTop, 'Month row offset changed');
    assert(Number(rect.getAttribute('height')) === coord.rowHeight, 'Variable row height changed');
    assert(Number(rect.getAttribute('width')) === month.width, 'Calendar width changed');
  });
  const geometry = () => [...host.querySelectorAll('rect, line')].map(node =>
    [node.tagName, ...['x', 'y', 'width', 'height', 'x1', 'x2', 'y1', 'y2', 'fill', 'stroke', 'stroke-opacity', 'stroke-width', 'shape-rendering'].map(key => node.getAttribute(key))]);
  render(LegacyGrid, week);
  const oldWeek = JSON.stringify(geometry());
  const originalStroke = getComputedStyle(host.querySelector('rect')).stroke;
  render(GanttRowGrid, week);
  assert(JSON.stringify(geometry()) === oldWeek, 'Week grid geometry or styling changed');
  render(GanttRowGrid, month);
  assert(getComputedStyle(host.querySelector('pattern path')).stroke === originalStroke, 'Theme stroke color changed');

  function measure(Component) {
    render(Component, week);
    const switching = [];
    for (let index = 0; index < 5; index++) {
      const start = performance.now();
      render(Component, month);
      switching.push(performance.now() - start);
      render(Component, week);
    }
    render(Component, month);
    const updates = [];
    for (let index = 0; index < 5; index++) {
      const start = performance.now();
      render(Component, month);
      updates.push(performance.now() - start);
    }
    return { monthSwitchMedianMs: +median(switching).toFixed(2), unchangedUpdateMedianMs: +median(updates).toFixed(2) };
  }
  const before = measure(LegacyGrid);
  const after = measure(GanttRowGrid);
  const result = { passed: true, rows: month.items.length, oldMonthRects, newMonthRects, before, after };
  const preview = createRoot(document.getElementById('preview'));
  flushSync(() => preview.render(<>
    {[['Before', LegacyGrid], ['After', GanttRowGrid]].map(([label, Component]) => <section key={label}>
      <h2>{label}</h2><svg width="1000" height="280" style={{ background: '#f1f5f9' }}><Component {...month} /></svg>
    </section>)}
  </>));
  document.getElementById('results').textContent = JSON.stringify(result);
  document.title = 'PASS: Gantt grid regression';
  root.unmount();
} catch (error) {
  document.getElementById('results').textContent = JSON.stringify({ passed: false, error: error.message });
  document.title = 'FAIL: Gantt grid regression';
}
