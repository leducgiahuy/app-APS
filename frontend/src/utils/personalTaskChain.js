/**
 * Thứ tự làm việc riêng của một nhân sự (đường nối "Chỉ việc của tôi" trên Gantt).
 * - Chỉ lấy task lá được giao cho người đó (bỏ nhóm, tiêu đề dự án, ngày lễ, task cha có task con).
 * - Xếp theo ngày bắt đầu trong phân công của chính người đó, rồi ngày kết thúc, rồi thứ tự dòng trên bảng.
 * - Trả về các cặp [task trước, task sau] liên tiếp. Không đọc / ghi phụ thuộc của dự án (dependencies):
 *   đây là đường riêng của người xem, tính lại mỗi lần vẽ nên luôn khớp phân công hiện tại.
 */
export function personalTaskChain(items = [], employeeId = '') {
  if (!employeeId) return [];
  const mine = items
    .map((item, index) => {
      if (!item || item.isGroup || item.isProjectHeader || item.hasTaskChildren || item.status === 'holiday') return null;
      const assignment = (item.assignees || []).find(entry => entry?.employeeId === employeeId);
      if (!assignment) return null;
      const start = String(assignment.startDate || item.startDate || '').slice(0, 10);
      const end = String(assignment.endDate || item.endDate || start).slice(0, 10);
      return start ? { id: item.id, start, end, index } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.index - b.index);
  return mine.slice(1).map((entry, index) => [mine[index].id, entry.id]);
}
