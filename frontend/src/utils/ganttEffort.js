import { assignmentWorkingDates } from './assignmentCalendar.js';

const countInclusiveDays = (startDate, endDate) => {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.floor((end - start) / 86400000) + 1
    : 0;
};

export const calculateAssignmentHours = (item, assignment) => {
  const hoursPerDay = Number(assignment.estimatedHoursPerDay) ||
    Number(item.estimatedHoursPerDay) || Number(item.estimatedHours) / (Number(item.days) || 1) || 8;
  if (assignment.excludeNonWorkingDays === true) {
    return assignmentWorkingDates(item, assignment).reduce((sum, key) => {
      const saturday = new Date(`${key}T12:00:00Z`).getUTCDay() === 6;
      return sum + hoursPerDay * (saturday ? 0.5 : 1);
    }, 0);
  }
  return countInclusiveDays(assignment.startDate || item.startDate, assignment.endDate || item.endDate) * hoursPerDay;
};

export const calculateUnassignedPlannedPersonDays = item => {
  const estimatedHours = Number(item.estimatedHours);
  if (estimatedHours > 0) return estimatedHours / 8;
  const days = countInclusiveDays(item.startDate, item.endDate);
  const hoursPerDay = Number(item.estimatedHoursPerDay) || 8;
  return days * hoursPerDay / 8;
};

export const calculatePlannedPersonDays = item => {
  const assignments = Array.isArray(item.assignees)
    ? item.assignees.filter(assignment => assignment.employeeId || assignment.employeeName)
    : [];
  if (assignments.length) {
    const total = assignments.reduce((sum, assignment) => {
      return sum + calculateAssignmentHours(item, assignment) / 8;
    }, 0);
    return total;
  }

  const hasLegacyAssignee = item.assignee || item.employeeId || item.employeeName;
  if (!hasLegacyAssignee) return Number(item.estimatedHours) > 0 ? Number(item.estimatedHours) / 8 : 0;
  return calculateUnassignedPlannedPersonDays(item);
};

export const allocateTaskHierarchyWeightPercent = (items, getWeight) => {
  const result = new Map();
  const childrenByParent = new Map();
  items.filter(item => !item.isGroup && item.parentTaskId).forEach(item => {
    const children = childrenByParent.get(item.parentTaskId) || [];
    children.push(item);
    childrenByParent.set(item.parentTaskId, children);
  });
  const weightFor = item => Math.max(0, Number(getWeight(item)) || 0);
  const allocate = (parentId, targetUnits) => {
    const children = childrenByParent.get(parentId) || [];
    if (!children.length) return;
    const rawWeights = children.map(weightFor);
    const total = rawWeights.reduce((sum, weight) => sum + weight, 0);
    const exactUnits = rawWeights.map(weight => total > 0 ? weight / total * targetUnits : 0);
    const units = exactUnits.map(Math.floor);
    let remainder = targetUnits - units.reduce((sum, value) => sum + value, 0);
    exactUnits.map((value, index) => ({ index, fraction: value - units[index] }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
      .forEach(({ index }) => { if (remainder > 0) { units[index] += 1; remainder -= 1; } });
    children.forEach((child, index) => {
      result.set(child.id, units[index] / 10);
      allocate(child.id, units[index]);
    });
  };
  items.filter(item => !item.isGroup && childrenByParent.has(item.id) && !item.parentTaskId).forEach(parent => {
    const parentUnits = Math.round(weightFor(parent) * 1000);
    result.set(parent.id, parentUnits / 10);
    allocate(parent.id, parentUnits);
  });
  items.filter(item => !item.isGroup && !result.has(item.id)).forEach(item => {
    result.set(item.id, Math.round(weightFor(item) * 1000) / 10);
  });
  return result;
};
