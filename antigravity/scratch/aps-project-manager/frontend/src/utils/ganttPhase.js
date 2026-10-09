import { inferGanttGroupHierarchy } from './ganttHierarchy.js';

// Resolve through stable Gantt IDs, so renaming a group never leaves old labels.
export function createGanttPhaseResolver(items) {
  const hierarchy = inferGanttGroupHierarchy(items);
  const byId = new Map(hierarchy.map(item => [item.id, item]));
  return task => {
    const item = byId.get(task.ganttId);
    const projectId = item?.projectId || task.projectId;
    let current = item || task;
    let phase;
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.isGroup) phase = current;
      const parentId = current.parentGroupId || current.parentTaskId;
      const parent = byId.get(parentId);
      if (parent?.projectId && projectId && parent.projectId !== projectId) break;
      current = parent;
    }
    if (!phase) {
      // Legacy tasks may only have a WBS code; match the current project group.
      const code = String(item?.code || task.code || task.phase || '').trim().toUpperCase();
      const letter = code.match(/^([A-Z])(?:\d|\.)/)?.[1];
      phase = letter && hierarchy.find(group => group.isGroup && !group.parentGroupId &&
        group.projectId === projectId &&
        (String(group.code || '').toUpperCase() === letter || String(group.title || '').trim().toUpperCase().startsWith(`${letter}.`)));
    }
    return {
      name: String(phase?.title || task.phase || '').trim() || 'Chưa phân loại',
      color: phase?.color || null
    };
  };
}
