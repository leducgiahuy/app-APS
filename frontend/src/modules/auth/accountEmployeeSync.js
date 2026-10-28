import { api } from '../../api';
import { deliveryApi } from '../gantt/deliveryApi';
import { roleFromLevel } from '../../utils/rolePermissions';
import { createUser, deletableBlockReason, deleteUser, findUser, getUsers, linkUserEmployee, restoreUser, validateNewUser } from './authSession';
import { getLevelLabel } from './accountOptions';
import { normalize } from './personalWork';

/**
 * Liên kết tài khoản đăng nhập (localStorage) với hồ sơ nhân sự HR và tài khoản phân quyền (backend).
 * Mỗi tài khoản quyền `user` luôn có đúng một nhân sự, gắn qua `employeeId`;
 * hồ sơ tài khoản là nguồn dữ liệu cho tên, SĐT, phòng ban, chức danh và ảnh của nhân sự,
 * còn cấp bậc tài khoản là vai trò dùng để đối chiếu ma trận phân quyền ở backend.
 */

/** Bản ghi tài khoản phân quyền ở backend: cấp bậc → vai trò, kèm nhân sự liên kết. */
function backendAccount(user, extra = {}) {
  return { email: user.email, name: user.name, role: roleFromLevel(user.level), employeeId: user.employeeId || '', disabled: false, ...extra };
}

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
  let employee, created;
  try {
    const { data } = await api.getEmployees();
    ({ employee, created } = await ensureEmployeeForUser(prepared.user, data, { updateExisting: true }));
  } catch (error) {
    return { error: `Không tạo được hồ sơ nhân sự (${error.message}). Tài khoản chưa được tạo.` };
  }
  try {
    await deliveryApi.saveUser(backendAccount({ ...prepared.user, employeeId: employee.id }, { password: prepared.user.password }));
  } catch (error) {
    if (created) await api.deleteEmployee(employee.id).catch(() => {});
    return { error: `Không cấp được quyền đăng nhập (${error.message}). Tài khoản chưa được tạo.` };
  }
  const result = createUser({ ...fields, employeeId: employee.id }, actorEmail);
  return result.error ? result : { ...result, employee };
}

/** Admin sửa hồ sơ/cấp bậc user: đồng bộ nhân sự rồi cập nhật vai trò ở backend (user đó phải đăng nhập lại). */
export async function syncManagedAccount(email) {
  const employee = await syncEmployeeForUser(email);
  const user = findUser(email);
  if (user) await deliveryApi.saveUser(backendAccount(user));
  return employee;
}

/** Admin cấp lại mật khẩu: đặt mật khẩu ở backend trước, thành công mới lưu trên trình duyệt. */
export async function resetBackendPassword(email, password) {
  const user = findUser(email);
  if (!user) throw new Error('Không tìm thấy tài khoản.');
  await deliveryApi.saveUser(backendAccount(user, { password }));
}

/** User tự đổi mật khẩu: backend kiểm tra mật khẩu hiện tại rồi mới đổi. */
export async function changeBackendPassword(currentPassword, newPassword) {
  await deliveryApi.changePassword({ currentPassword, newPassword });
}

/**
 * Admin xóa tài khoản: máy chủ gỡ cùng lúc tài khoản phân quyền, phiên đăng nhập, hồ sơ nhân sự và vai trò theo dự án,
 * lưu một bản vào kho "Tài khoản đã xóa" (chỉ Quản trị xem được). Máy chủ xong mới xóa trên trình duyệt.
 */
export async function deleteUserWithEmployee(email, actorEmail) {
  const user = findUser(email);
  const blocked = deletableBlockReason(user, actorEmail);
  if (blocked) return { error: blocked };
  const { password, ...profile } = user;
  try {
    await deliveryApi.deleteUser({ email, profile });
  } catch (error) {
    return { error: `Không xóa được tài khoản trên máy chủ (${error.message}). Tài khoản chưa bị xóa.` };
  }
  return deleteUser(email, actorEmail);
}

/** Danh sách tài khoản đã xóa (chỉ Quản trị). */
export async function listDeletedAccounts() {
  return (await deliveryApi.deletedUsers()).data || [];
}

/** Xóa vĩnh viễn một bản lưu (id) hoặc toàn bộ kho (không truyền id); không khôi phục được nữa. */
export async function purgeDeletedAccounts(id) {
  return (await deliveryApi.purgeDeletedUser(id)).data?.purged || 0;
}

/** Khôi phục tài khoản đã xóa với mật khẩu mới: máy chủ dựng lại tài khoản + nhân sự trước, rồi tới trình duyệt. */
export async function restoreDeletedAccount(id, password, actorEmail) {
  let restored;
  try {
    restored = (await deliveryApi.restoreUser(id, password)).data;
  } catch (error) {
    return { error: `Không khôi phục được (${error.message}).` };
  }
  return restoreUser(restored.account, restored.email, restored.employeeId, password, actorEmail);
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
  return changed + await syncBackendAccounts();
}

/**
 * Đưa vai trò backend về đúng cấp bậc tài khoản. Chỉ ghi khi lệch (ghi lại sẽ đăng xuất user đó);
 * tài khoản chưa có ở backend được tạo kèm mật khẩu đang lưu.
 */
async function syncBackendAccounts() {
  const backendUsers = (await deliveryApi.users()).data || [];
  let synced = 0;
  for (const user of getUsers().filter((entry) => entry.role === 'user')) {
    const expected = backendAccount(user);
    const existing = backendUsers.find((entry) => entry.email === user.email);
    if (existing && existing.role === expected.role && (existing.employeeId || '') === expected.employeeId && !existing.disabled && existing.name === expected.name) continue;
    await deliveryApi.saveUser(existing ? expected : { ...expected, password: user.password });
    synced += 1;
  }
  return synced;
}

/** Tài khoản đang gắn với nhân sự (nếu có), dùng để chặn xóa nhân sự còn tài khoản. */
export function accountForEmployee(employeeId) {
  return getUsers().find((user) => user.employeeId === employeeId) || null;
}
