import { cleanWbsCode, itemWbsCode, spanParentDates } from '../../../frontend/src/utils/wbsStructure.js';

/**
 * Kéo thả một task sang mục khác / vào giữa hai task (người dùng chốt 25/11/2026) — một nguồn duy nhất, gọi qua
 * PATCH /api/gantt/:id/relocate { groupId, beforeId }.
 * - Chỉ task cấp mục (không phải task con); task con đi theo task cha.
 * - groupId: mục nhận task; beforeId: task (cấp mục) đứng ngay sau chỗ thả, bỏ trống = cuối mục.
 * - Nối FS: chỗ cũ — task đứng sau nối thẳng với task đứng trước (bỏ qua task đã kéo đi);
 *   chỗ mới — task kéo vào tự nối từ task đứng trước theo thứ tự, task đứng sau nối từ task kéo vào.
 * - Đánh số lại STT task trong cả mục cũ và mục mới theo thứ tự (B4.1, B4.2…); task con đổi theo tiền tố.
 * - Giữ nguyên ngày / giờ của task; mục cũ, mục mới (và mục cha) tự bao trùm lại ngày các dòng con.
 * Trả về thông báo lỗi (chuỗi) hoặc '' khi thành công. Chỉ sửa db khi hợp lệ.
 */
const projectIdOf = (db, item) => item?.projectId || (db.tasks || []).find(task => task.ganttId === item?.id)?.projectId || '';
const linkedTasks = (db, item) => (db.tasks || []).filter(task => task.ganttId === item.id);

function setCode(db, item, code) {
  item.code = code;
  linkedTasks(db, item).forEach(task => { task.code = code; });
}

/** Đánh số lại task cấp mục của một mục theo thứ tự trong danh sách; task con đổi theo tiền tố. */
function renumberGroup(db, group, projectId) {
  const key = itemWbsCode(group);
  if (!/^[A-Z]\d*$/.test(key)) return;
  const items = db.ganttItems.filter(item => projectIdOf(db, item) === projectId);
  const tasks = items.filter(item => !item.isGroup && !item.parentTaskId && item.parentGroupId === group.id);
  const childrenOf = parent => items.filter(item => item.parentTaskId === parent.id);
  const renames = [];
  const collect = (row, next) => {
    const old = cleanWbsCode(row.code);
    if (old !== next) renames.push([row, next]);
    for (const child of childrenOf(row)) {
      const childCode = cleanWbsCode(child.code);
      collect(child, old && childCode.startsWith(`${old}.`) ? next + childCode.slice(old.length) : childCode);
    }
  };
  tasks.forEach((task, index) => collect(task, `${key}.${index + 1}`));
  renames.forEach(([row, next]) => setCode(db, row, next));
}

export function relocateGanttTask(db, itemId, { groupId, beforeId = '' } = {}) {
  const items = db.ganttItems || [];
  const byId = new Map(items.map(item => [item.id, item]));
  const item = byId.get(itemId);
  if (!item) return 'Không tìm thấy task.';
  if (item.isGroup) return 'Chỉ kéo được task, không kéo mục công việc.';
  if (item.parentTaskId) return 'Task con đi theo task cha — hãy kéo task cha.';
  const projectId = projectIdOf(db, item);
  const group = byId.get(groupId);
  if (!group?.isGroup || projectIdOf(db, group) !== projectId) return 'Chỉ thả task vào mục công việc của cùng dự án.';
  const before = beforeId ? byId.get(beforeId) : null;
  if (beforeId && (!before || before.isGroup || before.parentTaskId || before.parentGroupId !== group.id)) return 'Vị trí thả không hợp lệ.';
  if (before === item) return '';

  const isTopTask = row => !row.isGroup && !row.parentTaskId && projectIdOf(db, row) === projectId;
  const siblingsIn = id => items.filter(row => isTopTask(row) && row.parentGroupId === id);
  const targetSiblings = siblingsIn(group.id).filter(row => row !== item);
  const insertAt = before ? targetSiblings.indexOf(before) : targetSiblings.length;
  // Thả về đúng chỗ cũ → không đổi gì.
  const current = siblingsIn(group.id);
  if (item.parentGroupId === group.id && current.indexOf(item) === insertAt) return '';
  const previous = insertAt > 0 ? targetSiblings[insertAt - 1] : null;
  const sourceGroup = byId.get(item.parentGroupId);

  // 1. Rời chỗ cũ: task đang nối từ task này nối thẳng từ các task trước của nó.
  const predecessors = (Array.isArray(item.dependencies) ? item.dependencies : []).filter(id => id !== item.id);
  for (const row of items) {
    if (row === item || row.isGroup || projectIdOf(db, row) !== projectId) continue;
    const deps = Array.isArray(row.dependencies) ? row.dependencies : [];
    if (deps.includes(item.id)) {
      row.dependencies = [...new Set([...deps.filter(id => id !== item.id), ...predecessors.filter(id => id !== row.id)])];
      if (Array.isArray(row.manualDependencies)) row.manualDependencies = row.manualDependencies.filter(id => id !== item.id);
    }
    if (Array.isArray(row.suppressedDependencies) && row.suppressedDependencies.includes(item.id)) row.suppressedDependencies = row.suppressedDependencies.filter(id => id !== item.id);
  }
  // Task kéo vào tự nối từ task đứng trước theo thứ tự (liên kết tự nối của bảng).
  item.dependencies = [];
  item.manualDependencies = [];
  item.suppressedDependencies = [];

  // 2. Vào chỗ mới: task đứng sau đang nối từ task đứng trước thì nối từ task kéo vào.
  if (before && previous && Array.isArray(before.dependencies) && before.dependencies.includes(previous.id)) {
    before.dependencies = [...new Set(before.dependencies.map(id => id === previous.id ? item.id : id))];
    if (Array.isArray(before.manualDependencies)) before.manualDependencies = [...new Set(before.manualDependencies.map(id => id === previous.id ? item.id : id))];
  }

  // 3. Đổi mục chứa (task con và task ở trang Công việc đi theo).
  const family = [item];
  for (let index = 0; index < family.length; index += 1) items.filter(row => row.parentTaskId === family[index].id).forEach(child => family.push(child));
  for (const row of family) {
    row.parentGroupId = group.id;
    linkedTasks(db, row).forEach(task => { task.parentGroupId = group.id; });
  }

  // 4. Vị trí trong danh sách (thứ tự giữa các task cùng mục = thứ tự trên bảng).
  items.splice(items.indexOf(item), 1);
  const anchor = before || targetSiblings.at(-1);
  const index = anchor ? items.indexOf(anchor) + (before ? 0 : 1) : items.indexOf(group) + 1;
  items.splice(index, 0, item);

  // 5. Đánh số lại STT mục cũ và mục mới.
  if (sourceGroup && sourceGroup !== group) renumberGroup(db, sourceGroup, projectId);
  renumberGroup(db, group, projectId);

  // 6. Mục cũ, mục mới và các mục cha bao trùm lại ngày dòng con (ngày của task giữ nguyên).
  const ancestors = start => { const chain = []; for (let row = start; row && !chain.includes(row); row = byId.get(row.parentGroupId)) chain.unshift(row); return chain; };
  const parents = [...new Set([...ancestors(sourceGroup), ...ancestors(group)].filter(Boolean))];
  spanParentDates(items.filter(row => projectIdOf(db, row) === projectId), parents);
  return '';
}
