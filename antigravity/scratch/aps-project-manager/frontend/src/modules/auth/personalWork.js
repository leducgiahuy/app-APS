function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

export function resolveEmployee(user, employees = []) {
  if (!user) return null;
  if (user.employeeId) {
    const linked = employees.find(employee => employee.id === user.employeeId);
    if (linked) return linked;
  }
  const email = normalize(user.email);
  const name = normalize(user.name);
  return employees.find(employee => normalize(employee.email) === email)
    || employees.find(employee => normalize(employee.name) === name)
    || null;
}

export function isTaskAssignedTo(task, employee) {
  if (!employee || !task) return false;
  if (task.employeeId) return task.employeeId === employee.id;
  return normalize(task.employeeName || task.assignee) === normalize(employee.name);
}
