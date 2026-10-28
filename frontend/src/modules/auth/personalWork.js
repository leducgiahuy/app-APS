export function normalize(value) {
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

/**
 * Chiều ngược của resolveEmployee: tìm tài khoản đăng nhập gắn với một nhân sự HR.
 * Ưu tiên liên kết employeeId, sau đó khớp email, cuối cùng khớp tên (bỏ dấu, không phân biệt hoa thường).
 * Dùng để hiển thị cấp bậc/chuyên môn của tài khoản trên thẻ nhân sự.
 */
export function resolveAccount(employee, users = []) {
  if (!employee) return null;
  const email = normalize(employee.email);
  const name = normalize(employee.name);
  return users.find(user => user.employeeId && user.employeeId === employee.id)
    || (email && users.find(user => normalize(user.email) === email))
    || users.find(user => normalize(user.name) === name)
    || null;
}

export function isTaskAssignedTo(task, employee) {
  if (!employee || !task) return false;
  if (Array.isArray(task.assignees) && task.assignees.some(assignment =>
    assignment.employeeId === employee.id || normalize(assignment.employeeName) === normalize(employee.name)
  )) return true;
  if (task.employeeId) return task.employeeId === employee.id;
  return normalize(task.employeeName || task.assignee) === normalize(employee.name);
}
