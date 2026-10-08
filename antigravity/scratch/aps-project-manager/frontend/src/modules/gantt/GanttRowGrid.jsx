import { memo, useId } from 'react';

// The month grid shares one day pattern across rows instead of mounting a
// separate SVG element for every day of the year on every task row.
function GanttRowGrid({ items, coordinates, monthColumns, zoomLevel, pxPerDay, width, height, rowOffsets }) {
  const patternId = `gantt-day-grid-${useId().replace(/:/g, '')}`;
  const monthView = zoomLevel === 'month';
  const calendarWidth = monthColumns.reduce((sum, month) => sum + month.width, 0);
  // Adjacent legacy cells each painted their shared edge at 0.75 opacity:
  // 1 - (1 - 0.75)^2 = 0.9375. Keep that appearance with a single pattern line.

  return (
    <g pointerEvents="none">
      {monthView && (
        <defs>
          <pattern id={patternId} patternUnits="userSpaceOnUse" x={-pxPerDay / 2} width={pxPerDay} height={height}>
            <path
              d={`M${pxPerDay / 2} 0V${height}`}
              fill="none"
              stroke="#cbd5e1"
              strokeOpacity="0.9375"
              strokeWidth="0.7"
              shapeRendering="crispEdges"
              className="dark:stroke-slate-700"
            />
          </pattern>
        </defs>
      )}
      {items.map(item => {
        const coord = coordinates[item.id];
        if (!coord || item.isGroup) return null;
        if (monthView) {
          return (
            <g key={item.id}>
              <rect x={pxPerDay / 2} y={coord.rowTop} width={Math.max(0, calendarWidth - pxPerDay)} height={coord.rowHeight} fill={`url(#${patternId})`} />
              <rect
                x={0} y={coord.rowTop} width={calendarWidth} height={coord.rowHeight}
                fill="none" stroke="#cbd5e1" strokeOpacity="0.75" strokeWidth="0.7"
                shapeRendering="crispEdges" className="dark:stroke-slate-700"
              />
            </g>
          );
        }
        return monthColumns.flatMap((month, monthIndex) => Array.from({ length: 4 }, (_, weekIndex) => (
          <rect
            key={`week-cell-${item.id}-${monthIndex}-${weekIndex}`}
            x={month.left + month.width * weekIndex / 4} y={coord.rowTop}
            width={month.width / 4} height={coord.rowHeight}
            fill="none" stroke="#cbd5e1" strokeOpacity="0.75" strokeWidth="0.7"
            shapeRendering="crispEdges" className="dark:stroke-slate-700"
          />
        )));
      })}
      {items.map((item, index) => (
        <line
          key={item.id} x1={0} y1={rowOffsets[index + 1]} x2={width} y2={rowOffsets[index + 1]}
          stroke="#e2e8f0" strokeWidth="1" className="dark:stroke-slate-800/60"
        />
      ))}
    </g>
  );
}

export default memo(GanttRowGrid);
