import { useEffect, useState } from 'react';
import './GanttWorkColumns.css';

const countInclusiveDays = (startDate, endDate) => {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.floor((end - start) / 86400000) + 1
    : 0;
};

export const inferGanttGroupHierarchy = items => {
  const hierarchyItems = items.map(item => ({ ...item }));
  const groups = hierarchyItems.filter(item => item.isGroup && !item.isProjectHeader);
  const phaseByProjectAndCode = new Map();
  groups.forEach(group => {
    const phaseCode = String(group.title || '').match(/^\s*([A-Z])\s*\./i)?.[1]?.toUpperCase();
    if (phaseCode) phaseByProjectAndCode.set(`${group.projectId || ''}:${phaseCode}`, group);
  });

  groups.forEach(group => {
    if (group.parentGroupId) return;
    const subsectionCode = String(group.title || '').match(/^\s*([A-Z]\d+)\s*[. ]/i)?.[1]?.toUpperCase();
    const phase = subsectionCode && phaseByProjectAndCode.get(`${group.projectId || ''}:${subsectionCode[0]}`);
    if (phase && phase.id !== group.id) group.parentGroupId = phase.id;
  });

  const subsectionGroups = groups
    .map(group => ({ group, code: String(group.title || '').match(/^\s*([A-Z]\d+)\s*[. ]/i)?.[1]?.toUpperCase() }))
    .filter(entry => entry.code)
    .sort((a, b) => b.code.length - a.code.length);
  hierarchyItems.forEach(item => {
    if (item.isGroup || item.isProjectHeader || item.parentGroupId) return;
    const code = String(item.code || '').trim().toUpperCase();
    const parent = subsectionGroups.find(entry =>
      entry.group.projectId === item.projectId && (code === entry.code || code.startsWith(`${entry.code}.`))
    );
    if (parent) item.parentGroupId = parent.group.id;
  });
  return hierarchyItems;
};

export const getGroupDescendantTasks = (groupId, items) => {
  const groupsById = new Map(items.filter(item => item.isGroup).map(item => [item.id, item]));
  const descendantGroupIds = new Set([groupId]);
  let addedGroup;
  do {
    addedGroup = false;
    groupsById.forEach(group => {
      if (group.parentGroupId && descendantGroupIds.has(group.parentGroupId) && !descendantGroupIds.has(group.id)) {
        descendantGroupIds.add(group.id);
        addedGroup = true;
      }
    });
  } while (addedGroup);

  return items.filter(item => !item.isGroup && item.status !== 'holiday' && descendantGroupIds.has(item.parentGroupId));
};

export const calculateGroupPlannedPersonDays = (groupId, items) =>
  getGroupDescendantTasks(groupId, items)
    .reduce((total, item) => total + calculatePlannedPersonDays(item), 0);

export const calculatePlannedPersonDays = item => {
  const assignments = Array.isArray(item.assignees)
    ? item.assignees.filter(assignment => assignment.employeeId || assignment.employeeName)
    : [];
  if (assignments.length) {
    return assignments.reduce((total, assignment) => total + countInclusiveDays(
      assignment.startDate || item.startDate,
      assignment.endDate || item.endDate
    ), 0);
  }

  const hasLegacyAssignee = item.assignee || item.employeeId || item.employeeName;
  return hasLegacyAssignee ? countInclusiveDays(item.startDate, item.endDate) : 0;
};

export function GanttEditableWorkCell({ item, field, onSave, type = 'text', placeholder = '' }) {
  const value = item[field] ?? '';
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [item.id, value]);

  const commit = async () => {
    if (draft === String(value)) return;
    const nextValue = type === 'number'
      ? (draft.trim() === '' ? null : Number(draft))
      : draft;
    const saved = await onSave(item.id, { [field]: nextValue });
    if (!saved) setDraft(String(value));
  };

  return (
    <input
      type={type}
      min={type === 'number' ? 0 : undefined}
      step={type === 'number' ? '0.1' : undefined}
      value={draft}
      placeholder={placeholder}
      aria-label={field === 'contractWork' ? `Công hợp đồng: ${item.title}` : `Ghi chú: ${item.title}`}
      title={draft || (field === 'contractWork' ? 'Contract work' : 'Note')}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      className={type === 'number'
        ? 'gantt-work-number-input h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-center text-[11px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:bg-white dark:text-slate-200 dark:focus:bg-slate-900'
        : 'h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-center text-[11px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:bg-white dark:text-slate-200 dark:focus:bg-slate-900'}
    />
  );
}
