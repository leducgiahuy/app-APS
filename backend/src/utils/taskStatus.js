// Một task chỉ "đang thực hiện" khi đã có dấu vết làm việc thật: phiên tính giờ,
// giờ công đã ghi, hoặc mức trạng thái > 0% ở trang Dự án. Dữ liệu cũ (tạo bởi phiên
// bản trước, khôi phục từ bản sao lưu hoặc nhập vào) gán sẵn "in_progress" lúc tạo
// sẽ được đưa về "not_started" mỗi lần đọc/ghi, để không phải dọn tay lần nữa.
function hasWorkEvidence(item) {
  return Boolean(
    item.startedAt || item.actualWorkStartedAt || item.attendanceTracked || item.workSessionStartedAt ||
    Number(item.actualWorkHours) > 0 || (item.actualWorkEntries || []).length ||
    Number(item.deliveryStatusLevel) > 0
  );
}

export function resetNeverStartedTasks(db) {
  if (!db) return false;
  const activeTaskIds = new Set((db.employees || []).map(employee => employee.activeTaskId).filter(Boolean));
  const tasksByGantt = new Map((db.tasks || []).filter(task => task.ganttId).map(task => [task.ganttId, task]));
  let changed = false;
  const reset = item => {
    if (item.status !== 'in_progress' || item.isGroup || activeTaskIds.has(item.id) || hasWorkEvidence(item)) return;
    item.status = 'not_started';
    changed = true;
  };
  (db.tasks || []).forEach(reset);
  (db.ganttItems || []).forEach(item => {
    // Gantt và task liên kết phải cùng trạng thái: chỉ đặt lại khi task liên kết cũng chưa bắt đầu.
    const linked = tasksByGantt.get(item.id);
    if (linked && linked.status !== 'not_started') return;
    reset(item);
  });
  return changed;
}

// Task "chọn sẵn" của nhân sự đang không ở văn phòng mà đã hoàn thành / hủy / bị xóa thì tự gỡ,
// để lần "Vào văn phòng" kế tiếp không bị chặn bởi một task không còn làm được. Ca đang mở không đụng tới.
export function clearStaleTaskSelections(db) {
  if (!db) return false;
  const tasks = new Map((db.tasks || []).map(task => [task.id, task]));
  let changed = false;
  for (const employee of db.employees || []) {
    const id = employee.activeTaskId;
    if (!id || employee.isOnSite || String(id).startsWith('ot:')) continue;
    const task = tasks.get(id);
    if (task && !['completed', 'cancelled'].includes(task.status)) continue;
    employee.activeTaskId = null;
    employee.activeTaskTitle = null;
    employee.activeTaskShiftType = null;
    changed = true;
  }
  return changed;
}
