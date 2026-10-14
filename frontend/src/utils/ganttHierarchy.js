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
