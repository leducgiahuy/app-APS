/**
 * Liên kết FS (Finish-to-Start) của một task trên Gantt — một nguồn duy nhất cho đường nối trên biểu đồ
 * và ô "Công việc trước / Công việc sau" ở khung sửa task.
 * - Liên kết đặt tay: item.dependencies, bỏ các liên kết đã xóa (item.suppressedDependencies).
 * - Chưa có liên kết đặt tay: tự nối từ task đứng ngay trước trong bảng (cùng dự án, cùng task cha),
 *   trừ khi liên kết tự nối đó đã bị xóa.
 * rows: các dòng theo đúng thứ tự trên bảng (gồm cả nhóm / dòng dự án — được bỏ qua).
 */
const isTaskRow = row => row && !row.isProjectHeader && !row.isGroup;

export function implicitPredecessorId(item, rows) {
  const index = rows.findIndex(row => row.id === item.id);
  for (let position = index - 1; position >= 0; position -= 1) {
    const candidate = rows[position];
    if (isTaskRow(candidate) && candidate.projectId === item.projectId && (candidate.parentTaskId || '') === (item.parentTaskId || '')) return candidate.id;
  }
  return '';
}

export function effectivePredecessorIds(item, rows) {
  if (!isTaskRow(item)) return [];
  const suppressed = new Set(Array.isArray(item.suppressedDependencies) ? item.suppressedDependencies : []);
  const explicit = [...new Set(Array.isArray(item.dependencies) ? item.dependencies : [])].filter(id => id && id !== item.id && !suppressed.has(id));
  if (explicit.length) return explicit;
  const implicit = implicitPredecessorId(item, rows);
  return implicit && !suppressed.has(implicit) ? [implicit] : [];
}

export function effectiveSuccessorIds(item, rows) {
  return rows.filter(row => isTaskRow(row) && row.id !== item.id && effectivePredecessorIds(row, rows).includes(item.id)).map(row => row.id);
}

/**
 * Các thay đổi cần gửi khi người dùng chọn lại "Công việc trước" (predecessorId) và "Công việc sau" (successorId) cho task.
 * Trả về [{ id, patch }] theo thứ tự gửi; rỗng nếu không đổi gì.
 * - Đổi task trước: task này nối từ task được chọn (bỏ trống = không có liên kết); liên kết tự nối cũ bị xóa để không hiện lại.
 * - Đổi task sau: task sau cũ bỏ liên kết tới task này; task sau mới giữ các liên kết đang có và thêm liên kết từ task này.
 */
export function linkChanges(item, rows, { predecessorId = '', successorId = '' } = {}) {
  const changes = [];
  const currentPredecessors = effectivePredecessorIds(item, rows);
  const suppressed = Array.isArray(item.suppressedDependencies) ? item.suppressedDependencies : [];
  if ((currentPredecessors[0] || '') !== predecessorId || currentPredecessors.length > 1) {
    const implicit = implicitPredecessorId(item, rows);
    const nextSuppressed = [...new Set([...suppressed, ...(implicit && implicit !== predecessorId ? [implicit] : [])])].filter(id => id !== predecessorId);
    changes.push({ id: item.id, patch: { dependencies: predecessorId ? [predecessorId] : [], suppressedDependencies: nextSuppressed } });
  }
  const currentSuccessor = effectiveSuccessorIds(item, rows)[0] || '';
  if (currentSuccessor !== successorId) {
    const byId = new Map(rows.map(row => [row.id, row]));
    const old = byId.get(currentSuccessor);
    if (old && currentSuccessor) {
      changes.push({ id: old.id, patch: { suppressedDependencies: [...new Set([...(old.suppressedDependencies || []), item.id])] } });
    }
    const next = byId.get(successorId);
    if (next) {
      const keep = effectivePredecessorIds(next, rows).filter(id => id !== item.id);
      changes.push({ id: next.id, patch: { dependencies: [...keep, item.id], suppressedDependencies: (next.suppressedDependencies || []).filter(id => id !== item.id) } });
    }
  }
  return changes;
}

/**
 * Gom đường nối khi vẽ (chỉ hiển thị, không đổi liên kết lưu trong dữ liệu):
 * các task liền nhau trong bảng (cùng dự án, cùng nhóm, cùng task cha) BẮT ĐẦU CÙNG MỘT NGÀY là một "cụm".
 * - Đường nối giữa hai task trong cùng cụm: không vẽ.
 * - Đường nối từ một task trong cụm sang task bắt đầu ngày khác: vẽ từ task CUỐI cụm (task đại diện).
 * Trả về hàm (sourceId, targetId) → id nguồn để vẽ, hoặc null nếu bỏ đường đó;
 * kèm .blocks (các cụm) và .blockHead(id) (task đầu cụm của id, hoặc null).
 */
export function sameStartLinkSource(rows) {
  const lastOf = new Map(), blockOf = new Map(), byId = new Map(), blocks = [];
  let block = [];
  const sameBlock = (a, b) => a.startDate && a.startDate === b.startDate && a.projectId === b.projectId
    && (a.parentGroupId || '') === (b.parentGroupId || '') && (a.parentTaskId || '') === (b.parentTaskId || '');
  const close = () => {
    if (block.length > 1) {
      blocks.push(block.map(row => row.id));
      block.forEach(row => { lastOf.set(row.id, block.at(-1).id); blockOf.set(row.id, block[0].id); });
    }
    block = [];
  };
  rows.forEach(row => {
    if (!isTaskRow(row)) { close(); return; }
    byId.set(row.id, row);
    // Task con của task khác chen giữa không cắt cụm của task cha.
    const head = block[0];
    if (head && !head.parentTaskId && row.parentTaskId) return;
    if (!head || !sameBlock(head, row)) close();
    block.push(row);
  });
  close();
  const drawSource = (sourceId, targetId) => {
    if (!blockOf.has(sourceId)) return sourceId;
    if (blockOf.get(sourceId) === blockOf.get(targetId)) return null;
    const target = byId.get(targetId);
    if (target && target.startDate === byId.get(sourceId)?.startDate) return sourceId;
    return lastOf.get(sourceId);
  };
  // Danh sách cụm (mảng id theo thứ tự bảng) để vẽ một đường dọc chung rẽ mũi tên vào từng task.
  drawSource.blocks = blocks;
  drawSource.blockHead = id => blockOf.get(id) || null;
  return drawSource;
}
