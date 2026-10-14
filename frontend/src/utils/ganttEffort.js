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
  const days = countInclusiveDays(item.startDate, item.endDate);
  const hoursPerDay = Number(item.estimatedHoursPerDay) ||
    Number(item.estimatedHours) / (Number(item.days) || days) || 8;
  return days * hoursPerDay / 8;
};
