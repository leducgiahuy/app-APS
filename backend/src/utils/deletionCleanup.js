/**
 * Xóa là mất hẳn: dữ liệu gắn với dự án / nhân sự đã xóa không được ở lại để cộng vào báo cáo,
 * hiện trong danh sách chọn hay làm dữ liệu "sống lại".
 * Giữ lại lịch sử (nhật ký hoạt động, audit) và các dòng vai trò dự án đang chờ khôi phục cùng tài khoản đã xóa
 * (kho "Tài khoản đã xóa" của Quản trị; xóa vĩnh viễn ở kho thì các dòng này cũng bị gỡ).
 */
const HISTORY = new Set(['audit']);
const keptForRestore = row => row?.deletedReason === 'account-deleted';

/** Lọc mọi danh sách trong db.operations; trả về số dòng đã gỡ. */
function filterOperations(db, drop) {
  let removed = 0;
  for (const [key, rows] of Object.entries(db.operations || {})) {
    if (HISTORY.has(key) || !Array.isArray(rows)) continue;
    const kept = rows.filter(row => !(row && typeof row === 'object' && drop(row)));
    removed += rows.length - kept.length;
    if (kept.length !== rows.length) db.operations[key] = kept;
  }
  return removed;
}

/** Gỡ toàn bộ dữ liệu vận hành / tài chính / tiến độ của các dự án trong projectIds. */
export function purgeProjectData(db, projectIds) {
  const ids = new Set(projectIds);
  if (!ids.size) return 0;
  let removed = filterOperations(db, row => ids.has(row.projectId));
  for (const id of ids) if (db.delivery?.projects?.[id]) { delete db.delivery.projects[id]; removed += 1; }
  return removed;
}

/** Gỡ chấm công, hồ sơ HR, phiếu… của các nhân sự trong employeeIds. */
export function purgeEmployeeData(db, employeeIds) {
  const ids = new Set(employeeIds);
  if (!ids.size) return 0;
  let removed = filterOperations(db, row => ids.has(row.employeeId) && !keptForRestore(row));
  if (Array.isArray(db.appAttendance)) {
    const kept = db.appAttendance.filter(row => !ids.has(row?.employeeId));
    removed += db.appAttendance.length - kept.length;
    db.appAttendance = kept;
  }
  for (const user of db.delivery?.users || []) if (ids.has(user.employeeId)) { user.employeeId = ''; removed += 1; }
  return removed;
}

/**
 * Chuẩn hóa khi đọc/ghi: dữ liệu cũ hoặc bản khôi phục còn dòng trỏ tới dự án / nhân sự không còn thì gỡ.
 * Chỉ chạy khi danh sách dự án / nhân sự đọc được đầy đủ (mảng), để file lỗi không làm mất dữ liệu.
 */
export function removeOrphanRecords(db) {
  let removed = 0;
  if (Array.isArray(db?.projects)) {
    const known = new Set(db.projects.map(project => project.id));
    const missing = new Set();
    for (const rows of Object.entries(db.operations || {}).filter(([key]) => !HISTORY.has(key)).map(([, rows]) => rows)) {
      if (Array.isArray(rows)) rows.forEach(row => { if (/^proj-/.test(row?.projectId || '') && !known.has(row.projectId)) missing.add(row.projectId); });
    }
    Object.keys(db.delivery?.projects || {}).forEach(id => { if (/^proj-/.test(id) && !known.has(id)) missing.add(id); });
    removed += purgeProjectData(db, missing);
  }
  if (Array.isArray(db?.employees) && db.employees.length) {
    const known = new Set(db.employees.map(employee => employee.id));
    const missing = new Set();
    const collect = row => { if (row?.employeeId && !known.has(row.employeeId) && !keptForRestore(row)) missing.add(row.employeeId); };
    Object.entries(db.operations || {}).forEach(([key, rows]) => { if (!HISTORY.has(key) && Array.isArray(rows)) rows.forEach(collect); });
    (db.appAttendance || []).forEach(collect);
    (db.delivery?.users || []).forEach(collect);
    removed += purgeEmployeeData(db, missing);
  }
  return removed > 0;
}
