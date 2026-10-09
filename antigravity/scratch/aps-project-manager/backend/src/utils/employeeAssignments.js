const normalizeName = value => String(value || '').trim().toLowerCase();

// Keep current assignments separate from historical work sessions and activity logs.
// An ID is authoritative: a new employee with the same name must not inherit work.
export function removeMissingEmployeeAssignments(db) {
  if (!Array.isArray(db?.employees)) return false;
  const byId = new Map(db.employees.map(employee => [employee.id, employee]));
  const byName = new Map(db.employees.map(employee => [normalizeName(employee.name), employee]));
  const resolve = assignment => assignment.employeeId
    ? byId.get(assignment.employeeId)
    : byName.get(normalizeName(assignment.employeeName || assignment.assignee));
  const hasIdentity = assignment => Boolean(assignment.employeeId || assignment.employeeName || assignment.assignee);
  let changed = false;

  for (const item of [...(db.tasks || []), ...(db.ganttItems || [])]) {
    if (Array.isArray(item.assignees)) {
      const remaining = item.assignees.filter(assignment =>
        assignment && (!hasIdentity(assignment) || resolve(assignment))
      );
      if (remaining.length !== item.assignees.length) {
        item.assignees = remaining;
        changed = true;
      }
    }

    if (hasIdentity(item) && !resolve(item)) {
      const primary = item.assignees?.find(assignment => hasIdentity(assignment) && resolve(assignment));
      const employee = primary && resolve(primary);
      for (const [key, value] of Object.entries({
        employeeId: employee?.id || '',
        employeeName: employee?.name || '',
        assignee: employee?.name || ''
      })) {
        if (Object.hasOwn(item, key)) item[key] = value;
      }
      changed = true;
    } else if (item.assignee && !byName.has(normalizeName(item.assignee))) {
      item.assignee = resolve(item)?.name || '';
      changed = true;
    }
  }
  return changed;
}
