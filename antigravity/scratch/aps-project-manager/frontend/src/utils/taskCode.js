export function getGanttTaskCode(task, ganttItems) {
  const normalizedTitle = task.title?.trim().toLocaleLowerCase('vi');
  const ganttItem = ganttItems.find(item => item.id === task.ganttId)
    || ganttItems.find(item =>
      !item.isProjectHeader &&
      item.title?.trim().toLocaleLowerCase('vi') === normalizedTitle &&
      (!task.projectId || !item.projectId || task.projectId === item.projectId)
    );

  return ganttItem?.code || task.code || '';
}
