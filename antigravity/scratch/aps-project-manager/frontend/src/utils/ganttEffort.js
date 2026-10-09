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
  const days = assignment.excludeNonWorkingDays === true ? assignmentWorkingDates(item, assignment).length : countInclusiveDays(assignment.startDate || item.startDate, assignment.endDate || item.endDate);
  const hoursPerDay = Number(assignment.estimatedHoursPerDay) ||
    Number(item.estimatedHoursPerDay) || Number(item.estimatedHours) / (Number(item.days) || 1) || 8;
  return days * hoursPerDay;
};

export const calculatePlannedPersonDays = item => {
  const assignments = Array.isArray(item.assignees)
    ? item.assignees.filter(assignment => assignment.employeeId || assignment.employeeName)
    : [];
  if (assignments.length) {
    const total = assignments.reduce((sum, assignment) => {
      return sum + calculateAssignmentHours(item, assignment) / 8;
    }, 0);
    return Math.round(total * 100) / 100;
  }

  const hasLegacyAssignee = item.assignee || item.employeeId || item.employeeName;
  if (!hasLegacyAssignee) return 0;
  const days = countInclusiveDays(item.startDate, item.endDate);
  const hoursPerDay = Number(item.estimatedHoursPerDay) ||
    Number(item.estimatedHours) / (Number(item.days) || days) || 8;
  return Math.round(days * hoursPerDay / 8 * 100) / 100;
};
