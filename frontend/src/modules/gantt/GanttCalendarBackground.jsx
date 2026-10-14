import { memo } from 'react';

function GanttCalendarBackground({ days, pxPerDay, height }) {
  return (
    <g pointerEvents="none" aria-hidden="true" data-calendar-background>
      {days.filter(day => day.color).map(day => (
        <rect key={day.key} x={day.index * pxPerDay} y={0} width={pxPerDay} height={height} fill={day.color} fillOpacity={day.kind === 'holiday' ? 0.25 : 0.4} />
      ))}
    </g>
  );
}

export default memo(GanttCalendarBackground);
