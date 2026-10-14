import { managingRole, moneyAccess } from './deliveryMetrics.js';

export function deliveryView(role) {
  return { financial: moneyAccess(role), manage: managingRole(role), ownByDefault: role === 'employee', confirm: ['leader', 'manager', 'director', 'admin'].includes(role) };
}
export function ownsDeliveryTask(viewer, item) {
  return Boolean(viewer?.employeeId && (Array.isArray(item?.assignees) ? item.assignees : [item]).some(assignment => assignment?.employeeId === viewer.employeeId));
}
export function canEditProgressTask(viewer, item, employees = []) {
  if (!viewer || !item) return false;
  if (managingRole(viewer.role) || ownsDeliveryTask(viewer, item)) return true;
  const team = employees.find(person => person.id === viewer.employeeId)?.team;
  return viewer.role === 'leader' && Boolean(team) && (Array.isArray(item.assignees) ? item.assignees : [item]).some(assignment => employees.find(person => person.id === assignment?.employeeId)?.team === team);
}
// Use the same financial mask for real responses and role previews.
export function maskDeliveryFinance(data) {
  const clean = structuredClone(data);
  ['output', 'monthlyOutput', 'laborCost', 'expenseCost', 'cost', 'collected', 'eligiblePayment', 'deviation'].forEach(key => { if (clean.summary) delete clean.summary[key]; });
  Object.values(clean.taskMetrics || {}).forEach(metric => { delete metric.output; delete metric.laborCost; });
  clean.settings = { contractLocked: clean.settings?.contractLocked };
  clean.documents = (clean.documents || []).map(row => { const visible = { ...row }; delete visible.fee; return visible; });
  clean.changes = (clean.changes || []).map(row => { const visible = { ...row }; delete visible.amount; delete visible.appendixAmount; return visible; });
  clean.milestones = (clean.milestones || []).map(row => { const visible = { ...row }; delete visible.amount; return visible; });
  ['history', 'receipts', 'expenses', 'closes'].forEach(key => { clean[key] = []; });
  return clean;
}
