import { cleanWbsCode, itemWbsCode, spanParentDates, stripGroupCode } from '../../../frontend/src/utils/wbsStructure.js';

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

/**
 * Kéo thả MỤC CON (B2, A1…) đổi vị trí trong giai đoạn hoặc sang giai đoạn khác (người dùng chốt 25/11/2026),
 * gọi qua cùng PATCH /api/gantt/:id/relocate { groupId: giai đoạn nhận, beforeId: mục con đứng ngay sau chỗ thả }.
 * - Giai đoạn lớn (A, B, C) không kéo: chữ cái gắn với màu / tên giai đoạn.
 * - Cả khối (mục + mọi task bên trong) đi cùng; ngày / giờ giữ nguyên.
 * - Đánh số lại mục con liền từ 1 trong giai đoạn cũ và mới (B1, B2…); task bên trong đổi tiền tố theo (B4.1 → B1.1).
 * - Nối FS: task ngoài khối đang nối từ task trong khối thì nối từ task trước khối; task đầu của mục đứng sau chỗ thả
 *   đang nối từ mục khác thì nối từ task cuối của khối. Liên kết tự nối của bảng đi theo thứ tự mới.
 */
const phaseKey = group => itemWbsCode(group);

function renumberPhaseSections(db, phase, projectId) {
  const key = phaseKey(phase);
  if (!/^[A-Z]$/.test(key)) return;
  const items = db.ganttItems.filter(item => projectIdOf(db, item) === projectId);
  const sections = items.filter(item => item.isGroup && item.parentGroupId === phase.id);
  const membersOf = section => items.filter(item => !item.isGroup && item.parentGroupId === section.id);
  // Tính hết rồi mới gán, để B3 → B2 không đụng task của B2 → B1.
  const plan = sections.map((section, index) => ({ section, old: itemWbsCode(section), next: `${key}${index + 1}`, members: membersOf(section) }));
  for (const { section, old, next, members } of plan) {
    if (old !== next) {
      section.code = next;
      section.title = `${next}. ${stripGroupCode(section.title)}`;
    }
    // Task trong mục luôn mang mã mục ở đầu — đổi theo phần đầu thật của mã task (mục có tên lệch mã task, VD tên A2 mà task A3.x).
    for (const task of members) {
      const code = cleanWbsCode(task.code), head = code.split('.')[0];
      if (/^[A-Z]\d+\.\d/.test(code) && head !== next) setCode(db, task, next + code.slice(head.length));
    }
  }
}

export function relocateGanttSection(db, sectionId, { groupId, beforeId = '' } = {}) {
  const items = db.ganttItems || [];
  const byId = new Map(items.map(item => [item.id, item]));
  const section = byId.get(sectionId);
  if (!section?.isGroup) return 'Không tìm thấy mục công việc.';
  if (!section.parentGroupId) return 'Giai đoạn lớn (A, B, C…) giữ nguyên vị trí; chỉ kéo được mục con.';
  const projectId = projectIdOf(db, section);
  const phase = byId.get(groupId);
  if (!phase?.isGroup || phase.parentGroupId || projectIdOf(db, phase) !== projectId) return 'Chỉ thả mục vào giai đoạn của cùng dự án.';
  const before = beforeId ? byId.get(beforeId) : null;
  if (beforeId && (!before?.isGroup || before.parentGroupId !== phase.id)) return 'Vị trí thả không hợp lệ.';
  if (before === section) return '';
  const siblingsIn = id => items.filter(item => item.isGroup && item.parentGroupId === id && projectIdOf(db, item) === projectId);
  const targetSiblings = siblingsIn(phase.id).filter(item => item !== section);
  const insertAt = before ? targetSiblings.indexOf(before) : targetSiblings.length;
  if (section.parentGroupId === phase.id && siblingsIn(phase.id).indexOf(section) === insertAt) return '';
  const sourcePhase = byId.get(section.parentGroupId);

  // Khối di chuyển: mọi task thuộc mục (kể cả task con).
  const block = new Set(items.filter(item => !item.isGroup && item.parentGroupId === section.id));
  const blockTasks = items.filter(item => block.has(item));
  const outside = id => !block.has(byId.get(id));
  const externalPredecessors = [...new Set(blockTasks.flatMap(task => (task.dependencies || []).filter(outside)))];
  // 1. Rời chỗ cũ: task ngoài khối nối từ task trong khối → nối từ task trước khối.
  for (const row of items) {
    if (row.isGroup || block.has(row) || projectIdOf(db, row) !== projectId || !Array.isArray(row.dependencies)) continue;
    if (row.dependencies.some(id => block.has(byId.get(id)))) {
      row.dependencies = [...new Set([...row.dependencies.filter(outside), ...externalPredecessors.filter(id => id !== row.id)])];
      if (Array.isArray(row.manualDependencies)) row.manualDependencies = row.manualDependencies.filter(outside);
    }
  }
  // Task trong khối bỏ liên kết ra ngoài: task đầu khối tự nối từ dòng đứng trước ở chỗ mới.
  for (const task of blockTasks) {
    if (Array.isArray(task.dependencies)) task.dependencies = task.dependencies.filter(id => !outside(id));
    if (Array.isArray(task.manualDependencies)) task.manualDependencies = task.manualDependencies.filter(id => !outside(id));
  }
  // 2. Vào chỗ mới: task đầu của mục đứng sau đang nối từ mục khác → nối từ task cuối của khối.
  const lastBlockTask = blockTasks.filter(task => !task.parentTaskId).at(-1);
  const firstAfter = before ? items.find(item => !item.isGroup && !item.parentTaskId && item.parentGroupId === before.id) : null;
  if (firstAfter && lastBlockTask && Array.isArray(firstAfter.dependencies)) {
    const external = firstAfter.dependencies.filter(id => byId.get(id)?.parentGroupId !== before.id);
    if (external.length) firstAfter.dependencies = [...new Set([...firstAfter.dependencies.filter(id => !external.includes(id)), lastBlockTask.id])];
  }

  // 3. Đổi giai đoạn chứa + vị trí trong danh sách.
  section.parentGroupId = phase.id;
  items.splice(items.indexOf(section), 1);
  const anchor = before || targetSiblings.at(-1);
  items.splice(anchor ? items.indexOf(anchor) + (before ? 0 : 1) : items.indexOf(phase) + 1, 0, section);

  // 4. Đánh số lại mục con của giai đoạn cũ và mới; 5. giai đoạn bao trùm lại ngày.
  if (sourcePhase && sourcePhase !== phase) renumberPhaseSections(db, sourcePhase, projectId);
  renumberPhaseSections(db, phase, projectId);
  spanParentDates(items.filter(item => projectIdOf(db, item) === projectId), [sourcePhase, phase].filter((row, index, list) => row && list.indexOf(row) === index));
  return '';
}

/** Một cửa cho kéo thả: mục con → relocateGanttSection, task → relocateGanttTask. */
export function relocateGanttRow(db, id, target) {
  const item = (db.ganttItems || []).find(row => row.id === id);
  return item?.isGroup ? relocateGanttSection(db, id, target) : relocateGanttTask(db, id, target);
}
