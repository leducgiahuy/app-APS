import { memo } from 'react';
import GanttExcludedDaysBar from './GanttExcludedDaysBar';
import { assignmentWorkingDates } from '../../utils/assignmentCalendar';
import { formatDateVi, elapsedScheduleProgress, isTaskOverdue, taskDelayHours, formatDelayHours } from '../../utils/date';

export const hasStoredAssignmentState = task => Boolean(task && (
  Array.isArray(task.assignees) ||
  Object.hasOwn(task, 'employeeId') ||
  Object.hasOwn(task, 'employeeName')
));

const DEPENDENCY_HANDLE_OFFSET = 6;
export const dependencyHandleX = coord => Math.max(DEPENDENCY_HANDLE_OFFSET, coord.x - DEPENDENCY_HANDLE_OFFSET);

/**
 * Một thanh trên biểu đồ Gantt (task, hoặc thanh gộp của nhóm / dự án đang thu gọn).
 * Tách riêng + memo: mở drawer, mở menu, gõ trong form… không còn vẽ lại hàng trăm thanh không đổi;
 * thanh chỉ vẽ lại khi dữ liệu của chính nó (task, toạ độ, giờ hiện tại, trạng thái kéo/rê đường nối) thay đổi.
 * Thao tác (mở chi tiết, giao việc, kéo nối) gọi qua actions.current nên luôn dùng hàm mới nhất của trang.
 */
function GanttTaskBar({ item, coord, linkedTask, tasksByGanttId, highlighted: isDependencyHighlighted, dropTarget: isDependencyDropTarget, dragging, timelineStart, totalTimelineDays, pxPerDay, currentTime, employees, rowsHeight, freeRework, canManageStructure, canManageAssignments, previewing, actions }) {
  const openDetail = target => actions.current.openDetail(target);
  const handleAssignmentsOpen = target => actions.current.assign(target);
  const startDependencyDrag = (target, targetCoord, event) => actions.current.startDependencyDrag(target, targetCoord, event);
  if (item.isProjectHeader || item.isGroup || coord.isTaskAggregate) {
    if (!item.isProjectHeader && !coord.isAggregate) return null;
    const clipId = `aggregate-bar-clip-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const aggregateStart = new Date(`${coord.startDate}T00:00:00`);
    const aggregateEnd = new Date(`${coord.endDate}T00:00:00`);
    const aggregateStartOffset = (aggregateStart - timelineStart) / 86400000;
    const aggregateEndOffset = (aggregateEnd - timelineStart) / 86400000 + 1;
    return (
      <g key={`aggregate-${item.id}`} className="pointer-events-auto" data-aggregate-id={item.id}>
        <defs>
          <clipPath id={clipId}>
            <rect x={coord.x} y={coord.y} width={coord.width} height={coord.height} rx="6" ry="6" />
          </clipPath>
        </defs>
        <rect
          x={coord.x}
          y={coord.y}
          width={coord.width}
          height={coord.height}
          rx="6"
          ry="6"
          fill="url(#grad-slate)"
          opacity="0.88"
          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
        >
          <title>{`${coord.aggregateTasks.length} công việc · ${formatDateVi(aggregateStart.toISOString().slice(0, 10))} – ${formatDateVi(aggregateEnd.toISOString().slice(0, 10))}`}</title>
        </rect>
        <g clipPath={`url(#${clipId})`}>
          {coord.aggregateTasks.map(child => {
            if (!child.startDate || !child.endDate) return null;
            const linkedChildTask = tasksByGanttId.get(child.id);
            const progressTask = linkedChildTask ? { ...child, ...linkedChildTask } : child;
            const progress = elapsedScheduleProgress(progressTask, currentTime);
            if (progress <= 0) return null;
            const childStart = new Date(`${child.startDate}T00:00:00`);
            const childEnd = new Date(`${child.endDate}T00:00:00`);
            if (!Number.isFinite(childStart.getTime()) || !Number.isFinite(childEnd.getTime())) return null;
            const childStartOffset = Math.max(aggregateStartOffset, (childStart - timelineStart) / 86400000, 0);
            const childEndOffset = Math.min(aggregateEndOffset, (childEnd - timelineStart) / 86400000 + 1, totalTimelineDays);
            const childX = childStartOffset * pxPerDay;
            const childWidth = Math.max(0, (childEndOffset - childStartOffset) * pxPerDay);
            if (!childWidth) return null;
            const overdue = isTaskOverdue(progressTask, currentTime);
            const completedLate = progressTask.status === 'completed' && (progressTask.speedStatus === 'delayed' || child.speed === 'delayed');
            const progressColor = progressTask.status === 'completed'
              ? (completedLate ? '#e6b83e' : '#10b981')
              : overdue ? '#ef4444' : '#861b36';
            return (
              <rect
                key={`progress-${child.id}`}
                x={childX}
                y={coord.y}
                width={Math.max(0, childWidth * progress / 100)}
                height={coord.height}
                fill={progressColor}
                opacity="0.98"
                className="pointer-events-none"
              >
                <title>{`${child.title}: ${progress}%`}</title>
              </rect>
            );
          })}
        </g>
      </g>
    );
  }

  const isGroup = item.isGroup;
  const isHoliday = item.status === 'holiday';
  const taskHasAssignmentState = hasStoredAssignmentState(linkedTask);
  const itemAssignees = taskHasAssignmentState
    ? (Array.isArray(linkedTask.assignees) && linkedTask.assignees.length
      ? linkedTask.assignees
      : linkedTask.employeeId || linkedTask.employeeName
        ? [{
          employeeId: linkedTask.employeeId || '',
          employeeName: linkedTask.employeeName || '',
          startDate: linkedTask.startDate || item.startDate,
          endDate: linkedTask.endDate || item.endDate
        }]
        : [])
    : item.assignees;
  // Merge the linked task with its Gantt row so completion timing survives
  // when one side has not yet received the latest synchronized fields.
  const progressTask = linkedTask ? { ...item, ...linkedTask } : item;
  const progress = elapsedScheduleProgress(progressTask, currentTime);
  const overdue = isTaskOverdue(progressTask, currentTime);
  const delayHours = Math.max(
    taskDelayHours(progressTask, currentTime),
    Number(linkedTask?.delayHours) || 0,
    Number(item.delayHours) || 0
  );
  const storedEarlyHours = Math.max(
    Number(progressTask.earlyHours) || 0,
    Number(linkedTask?.earlyHours) || 0,
    Number(item.earlyHours) || 0
  );
  const completionTime = Date.parse(progressTask.completedAt || linkedTask?.completedAt || item.completedAt || '');
  const [, endYear, endMonth, endDay] = String(progressTask.endDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  const scheduledEndStart = endYear ? new Date(Number(endYear), Number(endMonth) - 1, Number(endDay)).getTime() : NaN;
  const scheduledDeadline = endYear ? new Date(Number(endYear), Number(endMonth) - 1, Number(endDay) + 1).getTime() : NaN;
  const calendarEarlyHours = Number.isFinite(completionTime) && Number.isFinite(scheduledEndStart)
    ? Math.max(0, scheduledEndStart - completionTime) / 3600000
    : 0;
  const calendarLateHours = Number.isFinite(completionTime) && Number.isFinite(scheduledDeadline)
    ? Math.max(0, completionTime - scheduledDeadline) / 3600000
    : 0;
  const completedLate = progressTask.status === 'completed' && (
    progressTask.speedStatus === 'delayed' || item.speed === 'delayed' || delayHours > 0 || calendarLateHours > 0
  );
  const completedEarly = progressTask.status === 'completed' && !completedLate && (
    progressTask.speedStatus === 'early' || item.speed === 'early' || storedEarlyHours > 0 || calendarEarlyHours > 0
  );
  const earlyHours = Math.max(storedEarlyHours, calendarEarlyHours);
  const completionDelayHours = Math.max(delayHours, calendarLateHours);
  const timingLabel = progressTask.status === 'completed'
    ? completedEarly
      ? `Hoàn thành sớm${earlyHours > 0 ? ` · Sớm ${formatDelayHours(earlyHours)}` : ''}`
      : completedLate
        ? `Chậm trễ${completionDelayHours > 0 ? ` · Muộn ${formatDelayHours(completionDelayHours)}` : ''}`
        : 'Hoàn thành'
    : overdue
      ? `Quá hạn ${formatDelayHours(delayHours)}`
      : '';
  const timingColor = progressTask.status === 'completed'
    ? completedEarly ? '#059669' : completedLate || delayHours > 0 ? '#d97706' : '#059669'
    : overdue ? '#dc2626' : item.parentTaskId ? '#b45309' : '#64748b';

  // Keep the bar and progress fill aligned with the task status pill.
  const statusColor = isHoliday ? '#f59e0b'
    : progressTask.status === 'completed' ? (completedLate ? '#f59e0b' : '#10b981')
      : overdue ? '#ef4444'
        : '#861b36';
  const fillColor = isHoliday ? 'url(#grad-amber)' : 'url(#grad-slate)';
  const hasAssignments = Array.isArray(itemAssignees) && itemAssignees.length > 0;
  const hasLegacyAssignee = !taskHasAssignmentState && Boolean(item.assignee);
  const assignmentLabels = !isGroup && !isHoliday && (hasAssignments || hasLegacyAssignee)
    ? (hasAssignments
      ? itemAssignees
      : [{ employeeName: item.assignee, startDate: item.startDate, endDate: item.endDate }])
      .map((assignment, index) => {
        return {
          key: `${item.id}-assignment-${index}`,
          employeeName: assignment.employeeName || employees.find(employee => employee.id === assignment.employeeId)?.name || item.assignee || 'Chưa gán',
          startDate: assignment.startDate || item.startDate,
          endDate: assignment.endDate || item.endDate,
          days: assignmentWorkingDates(item, assignment).length,
          hoursPerDay: Number(assignment.estimatedHoursPerDay) || Number(item.estimatedHoursPerDay) || Number(item.estimatedHours) / (Number(item.days) || 1) || 8,
          y: coord.rowTop + 21 + index * 16
        };
      })
    : [];
  const overtimeContributions = item.overtimeContributions || [];
  const overtimeForAssignment = assignment => overtimeContributions.filter(contribution =>
    (contribution.employeeId && assignment.employeeId === contribution.employeeId) ||
    (contribution.employeeName || '').trim().toLocaleLowerCase('vi') ===
      (assignment.employeeName || '').trim().toLocaleLowerCase('vi')
  );
  const unassignedOvertime = overtimeContributions.filter(contribution =>
    !assignmentLabels.some(assignment =>
      (contribution.employeeId && assignment.employeeId === contribution.employeeId) ||
      (contribution.employeeName || '').trim().toLocaleLowerCase('vi') ===
        (assignment.employeeName || '').trim().toLocaleLowerCase('vi')
    )
  );
  const taskTextColor = item.parentTaskId ? '#b45309' : '#64748b';

  return (
    <g key={item.id} className="cursor-pointer group" onClick={event => { if (!event.target.closest('[role="button"]')) openDetail(item); }}>
      
      {/* Dải ruy băng mờ kéo ngang cho ngày lễ */}
      {isHoliday && (
        <rect
          x={coord.x}
          y={0}
          width={coord.width}
          height={rowsHeight}
          fill="#fef08a"
          fillOpacity="0.12"
        />
      )}

      {isHoliday && !isGroup && (
        <rect
          x={coord.x}
          y={coord.y}
          width={coord.width}
          height={coord.height}
          rx="6"
          ry="6"
          fill={fillColor}
          stroke={isDependencyHighlighted ? '#ef4444' : 'transparent'}
          strokeWidth={isDependencyHighlighted ? 2.4 : 0}
          className="transition-all hover:opacity-90 shadow-sm"
          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
        />
      )}

      {!isGroup && !isHoliday && !itemAssignees?.some(a => a.excludeNonWorkingDays === true) && (
        <>
          <rect
            x={coord.x}
            y={coord.y}
            width={coord.width}
            height={coord.height}
            rx="6"
            ry="6"
            fill={fillColor}
            stroke={isDependencyHighlighted ? '#ef4444' : 'transparent'}
            strokeWidth={isDependencyHighlighted ? 2.4 : 0}
            className="transition-all hover:opacity-90 shadow-sm"
            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
          />
          {progress > 0 && (
            <rect
              x={coord.x}
              y={coord.y}
              width={coord.width * progress / 100}
              height={coord.height}
              rx="6"
              ry="6"
              fill={statusColor}
              fillOpacity="1"
              stroke={isDependencyHighlighted ? '#ef4444' : 'transparent'}
              strokeWidth={isDependencyHighlighted ? 2.2 : 0}
              className="pointer-events-none transition-all duration-500"
            >
              <title>{`Tiến độ theo thời gian: ${progress}%${overdue ? ' · Quá hạn' : ''}`}</title>
            </rect>
          )}
        </>
      )}

      {!isGroup && !isHoliday && itemAssignees?.some(a => a.excludeNonWorkingDays === true) && <GanttExcludedDaysBar item={{ ...item, assignees: itemAssignees }} timelineStart={timelineStart} pxPerDay={pxPerDay} coord={coord} progress={progress} fillColor={fillColor} statusColor={statusColor} highlighted={isDependencyHighlighted} />}

      {/* Nhãn trên thanh hoặc cạnh thanh: Tên người đảm nhận, thời gian, tăng ca */}
      {!isGroup && !isHoliday && isDependencyDropTarget && (
        <rect
          x={Math.max(0, coord.x - 3)}
          y={coord.y - 4}
          width={coord.width + 6}
          height={coord.height + 8}
          rx="8"
          fill="none"
          stroke="#0284c7"
          strokeWidth="2.5"
          strokeDasharray="5 3"
          className="pointer-events-none"
        />
      )}

      {!isGroup && !isHoliday && canManageStructure && !previewing && (
        <g
          role="button"
          aria-label={`Kéo để nối ${item.title} với task tiếp theo`}
          style={{ cursor: dragging ? 'grabbing' : 'crosshair', touchAction: 'none' }}
          onPointerDown={event => startDependencyDrag(item, coord, event)}
          onClick={event => { event.preventDefault(); event.stopPropagation(); }}
        >
          <circle cx={dependencyHandleX(coord)} cy={coord.centerY} r="10" fill="transparent" />
          <title>Kéo chấm này và thả vào task cần nối phía sau</title>
        </g>
      )}

      {!isGroup && (
        <>
        {canManageAssignments && !previewing && assignmentLabels.length === 0 && (
          <g
            role="button"
            tabIndex={0}
            aria-label={`Giao công việc ${item.title}`}
            className="select-none"
            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
            onClick={() => handleAssignmentsOpen(item)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleAssignmentsOpen(item);
              }
            }}
          >
            <circle cx={coord.endX + 15} cy={coord.centerY} r="7" fill="none" stroke="#861b36" className="dark:stroke-rose-300" />
            <path d={`M ${coord.endX + 12} ${coord.centerY} h 6 M ${coord.endX + 15} ${coord.centerY - 3} v 6`} fill="none" stroke="#861b36" strokeWidth="1.5" strokeLinecap="round" className="dark:stroke-rose-300" />
            <text x={coord.endX + 27} y={coord.centerY + 4} fill={item.parentTaskId ? '#b45309' : '#861b36'} fontSize="11" fontWeight="700" className={item.parentTaskId ? undefined : 'dark:fill-rose-300'}>
              Giao cho
            </text>
            <title>Giao công việc cho nhân viên</title>
          </g>
        )}
        {assignmentLabels.map((bar, index) => (
        <text
          key={`label-${bar.key}`}
          x={coord.endX + 8}
          y={bar.y}
          fill={taskTextColor}
          fontSize="11"
          fontWeight="600"
          className={`${item.parentTaskId ? '' : 'dark:fill-white '}select-none pointer-events-none`}
        >
          <tspan fill={taskTextColor} className={item.parentTaskId ? undefined : 'dark:fill-white'}>
            {bar.employeeName} · {formatDateVi(bar.startDate).slice(0, 5)}–{formatDateVi(bar.endDate).slice(0, 5)} · {Number(bar.hoursPerDay).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h/ngày{freeRework ? ' · CR' : ''}
          </tspan>
          {timingLabel && <tspan fill={timingColor} fontWeight="700"> · [{timingLabel}]</tspan>}
          <title>{`${bar.employeeName}: ${formatDateVi(bar.startDate)} đến ${formatDateVi(bar.endDate)} · ${Number(bar.hoursPerDay).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giờ/ngày${timingLabel ? ` · ${timingLabel}` : ''}`}</title>
          {overtimeForAssignment(bar).map(contribution => (
            <tspan key={contribution.employeeId || contribution.employeeName} fill="#d97706" fontWeight="bold">
              {' '}[+{contribution.hours}h OT]
            </tspan>
          ))}
          {index === 0 && !overtimeContributions.length && item.overtimeHours > 0 && (
            <tspan fill="#f59e0b" fontWeight="bold"> [+{item.overtimeHours}h OT]</tspan>
          )}

        </text>
        ))}
        {unassignedOvertime.map((contribution, contributionIndex) => (
          <text
            key={`overtime-${contribution.employeeId || contribution.employeeName}`}
            x={coord.endX + 8}
            y={coord.rowTop + 16 + assignmentLabels.length * 22 + contributionIndex * 18}
            fill="#d97706"
            fontSize="11"
            fontWeight="600"
            className="select-none pointer-events-none"
          >
            {contribution.employeeName} [+{contribution.hours}h OT]
          </text>
        ))}
        </>
      )}

    </g>
  );
}

export default memo(GanttTaskBar);
