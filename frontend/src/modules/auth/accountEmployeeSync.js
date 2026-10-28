import { api } from '../../api';
import { createUser, deleteUser, findUser, getUsers, linkUserEmployee, validateNewUser } from './authSession';
import { getLevelLabel } from './accountOptions';
import { normalize } from './personalWork';

/**
 * Liên kết tài khoản đăng nhập (localStorage) với hồ sơ nhân sự HR (backend).
 * Mỗi tài khoản quyền `user` luôn có đúng một nhân sự, gắn qua `employeeId`;
 * hồ sơ tài khoản là nguồn dữ liệu cho tên, SĐT, phòng ban, chức danh và ảnh của nhân sự.
 */

/** Dựng hồ sơ nhân sự từ tài khoản: phòng ban → ban/đội, chuyên môn (hoặc cấp bậc) → chức danh. */
function employeeProfileFromUser(user) {
  return {
    name: user.name,
    title: user.specialty || getLevelLabel(user.level),
    team: user.department || 'Ban Quản Lý',
    phone: user.phone || 'Đang cập nhật',
    email: user.email,
    level: user.level,
    ...(user.avatarData ? { avatar: user.avatarData } : {}),
  };
}

/**
 * Tìm nhân sự sẵn có cho tài khoản: theo employeeId, rồi email, rồi tên (chỉ nhân sự chưa có email).
 * Bỏ qua nhân sự đã gắn với tài khoản khác để hai tài khoản không dùng chung một hồ sơ.
 */
function findEmployeeForUser(user, employees) {
  const linked = user.employeeId && employees.find((employee) => employee.id === user.employeeId);
  if (linked) return linked;
  const claimed = new Set(getUsers().filter((entry) => entry.employeeId && entry.email !== user.email).map((entry) => entry.employeeId));
  const free = employees.filter((employee) => !claimed.has(employee.id));
  return free.find((employee) => normalize(employee.email) && normalize(employee.email) === normalize(user.email))
    || free.find((employee) => !employee.email && normalize(employee.name) === normalize(user.name))
    || null;
}

/** Bảo đảm tài khoản có nhân sự: dùng lại hồ sơ khớp hoặc tạo mới, rồi lưu employeeId vào tài khoản. */
async function ensureEmployeeForUser(user, employees, { updateExisting }) {
  const profile = employeeProfileFromUser(user);
  const existing = findEmployeeForUser(user, employees);
  let employee = existing;
  if (!existing) employee = (await api.createEmployee(profile)).data;
  else if (updateExisting) employee = (await api.updateEmployee(existing.id, profile)).data;
  if (user.employeeId !== employee.id) linkUserEmployee(user.email, employee.id);
  return { employee, created: !existing };
}

/**
 * Admin tạo tài khoản: tạo (hoặc liên kết) nhân sự trước, chỉ lưu tài khoản khi nhân sự đã có.
 * Nhờ vậy không có tài khoản nào thiếu hồ sơ nhân sự trên trang Thành viên.
 */
export async function createUserWithEmployee(fields, actorEmail) {
  const prepared = validateNewUser(fields, actorEmail);
  if (prepared.error) return prepared;
  let employee;
  try {
    const { data } = await api.getEmployees();
    ({ employee } = await ensureEmployeeForUser(prepared.user, data, { updateExisting: true }));
  } catch (error) {
    return { error: `Không tạo được hồ sơ nhân sự (${error.message}). Tài khoản chưa được tạo.` };
  }
  const result = createUser({ ...fields, employeeId: employee.id }, actorEmail);
  return result.error ? result : { ...result, employee };
}

/**
 * Admin xóa tài khoản: xóa hồ sơ nhân sự liên kết trước, chỉ xóa tài khoản khi máy chủ đã xóa xong.
 * Nhân sự đã không còn trên máy chủ thì bỏ qua bước đó.
 */
export async function deleteUserWithEmployee(email, actorEmail) {
  const user = findUser(email);
  if (!user || user.role !== 'user') return { error: 'Không tìm thấy tài khoản user cần xóa.' };
  try {
    const { data } = await api.getEmployees();
    // Chỉ xóa nhân sự gắn qua employeeId hoặc trùng email, không khớp theo tên để tránh xóa nhầm người trùng tên.
    const employee = data.find((entry) => entry.id === user.employeeId)
      || data.find((entry) => normalize(entry.email) && normalize(entry.email) === normalize(user.email));
    if (employee) await api.deleteEmployee(employee.id);
  } catch (error) {
    return { error: `Không xóa được hồ sơ nhân sự (${error.message}). Tài khoản chưa bị xóa.` };
  }
  return deleteUser(email, actorEmail);
}

/** Sau khi sửa hồ sơ tài khoản: đẩy tên, SĐT, phòng ban, chức danh, ảnh sang nhân sự đã liên kết. */
export async function syncEmployeeForUser(email) {
  const user = findUser(email);
  if (!user || user.role !== 'user') return null;
  const { data } = await api.getEmployees();
  return (await ensureEmployeeForUser(user, data, { updateExisting: true })).employee;
}

/**
 * Bù cho tài khoản tạo trước khi có liên kết: gắn với nhân sự khớp hoặc tạo mới.
 * Không ghi đè hồ sơ nhân sự đã có; trả về số tài khoản vừa được liên kết/tạo nhân sự.
 */
export async function linkAccountsToEmployees() {
  const pending = getUsers().filter((user) => user.role === 'user');
  if (!pending.length) return 0;
  // Luôn đọc danh sách mới từ máy chủ; lỗi mạng sẽ dừng hẳn thay vì tạo trùng nhân sự.
  const known = [...(await api.getEmployees()).data];
  let changed = 0;
  for (const user of pending) {
    if (known.some((employee) => employee.id === user.employeeId)) continue;
    const { employee, created } = await ensureEmployeeForUser(user, known, { updateExisting: false });
    if (created) known.push(employee);
    changed += 1;
  }
  return changed;
}

/** Tài khoản đang gắn với nhân sự (nếu có), dùng để chặn xóa nhân sự còn tài khoản. */
export function accountForEmployee(employeeId) {
  return getUsers().find((user) => user.employeeId === employeeId) || null;
}
