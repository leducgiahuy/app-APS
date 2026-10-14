import { taskWorkingDates, workingDateSegments } from '../../utils/assignmentCalendar';

export default function GanttExcludedDaysBar({ item, timelineStart, pxPerDay, coord, progress, fillColor, statusColor, highlighted }) {
  const working = taskWorkingDates(item);
  let remaining = working.length * progress / 100;
  return workingDateSegments(working).map(segment => {
    const x = (Date.parse(`${segment.startDate}T00:00:00Z`) - Date.UTC(timelineStart.getFullYear(), timelineStart.getMonth(), timelineStart.getDate())) / 86400000 * pxPerDay;
    const width = segment.days * pxPerDay;
    const filled = Math.min(segment.days, remaining);
    remaining = Math.max(0, remaining - segment.days);
    return <g key={segment.startDate} data-working-segment={segment.startDate}>
      <rect x={x} y={coord.y} width={width} height={coord.height} rx={6} fill={fillColor} stroke={highlighted ? '#ef4444' : 'transparent'} strokeWidth={highlighted ? 2.4 : 0} filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))" />
      {filled > 0 && <rect data-progress x={x} y={coord.y} width={filled * pxPerDay} height={coord.height} rx={6} fill={statusColor} className="pointer-events-none"><title>{`Tiến độ: ${progress}%`}</title></rect>}
    </g>;
  });
}
