import { cleanWbsCode, compareWbsCodes, itemWbsCode, stripGroupCode, wbsLevel } from '../../../frontend/src/utils/wbsStructure.js';

export { itemWbsCode, stripGroupCode };

/**
 * Đổi STT (mã WBS) của một dòng Gantt — một nguồn duy nhất cho khung "Sửa thời gian / tên" của task và của mục công việc.
 * - STT hiển thị của nhóm lấy từ tiền tố tên ("A1. KHẢO SÁT…"), của task lấy từ code: đổi STT thì đổi cả hai cho khớp.
 * - STT không được trùng trong cùng dự án.
 * - Dòng con mang tiền tố STT cũ được đổi theo (A1 → A2 thì A1.1 → A2.1, A1.1.1 → A2.1.1…), không được trùng dòng khác.
 * - STT mới thuộc một mục / task cha đang có (A2.3 → mục A2, A1.2.1 → task A1.2, A3 → giai đoạn A) thì chuyển dòng sang đó;
 *   không có thì giữ chỗ cũ. Không bao giờ chuyển một dòng vào chính dòng con của nó.
 * - Xếp lại vị trí dòng giữa các dòng cùng cấp theo STT mới (bảng và chuỗi Dự báo đi theo thứ tự này).
 * - Task ở trang Công việc (db.tasks cùng ganttId) nhận STT mới.
 * Trả về thông báo lỗi (chuỗi) hoặc '' khi thành công. Chỉ sửa db khi hợp lệ.
 */

const projectIdOf = (db, item) => item.projectId || (db.tasks || []).find(task => task.ganttId === item.id)?.projectId || '';

function setCode(db, item, code) {
  item.code = code;
  if (item.isGroup) item.title = `${code}. ${stripGroupCode(item.title)}`;
  (db.tasks || []).filter(task => task.ganttId === item.id).forEach(task => { task.code = code; });
}

export function applyWbsCodeChange(db, item, rawCode) {
  const code = cleanWbsCode(rawCode);
  if (!code) return 'Vui lòng nhập STT.';
  if (code.length > 30 || !/^[A-Z0-9]+(\.[A-Z0-9]+)*$/.test(code)) return 'STT chỉ gồm chữ, số và dấu chấm (VD: A, A1, A1.2, A1.2.1).';
  const oldCode = itemWbsCode(item);
  // Mục có STT ở tên khác mã đang lưu (VD tên "A2." nhưng code A3, task bên trong A3.x): coi cả hai là STT cũ
  // để dòng con đổi theo. Mã tạm kiểu "GR3" không tính.
  const storedCode = item.isGroup ? cleanWbsCode(item.code) : '';
  const oldCodes = [...new Set([oldCode, /^[A-Z]\d*$/.test(storedCode) ? storedCode : ''].filter(Boolean))];
  const projectId = projectIdOf(db, item);
  const projectItems = (db.ganttItems || []).filter(candidate => projectIdOf(db, candidate) === projectId);
  // Mục con (A1, B2…): task bên trong luôn mang mã mục ở đầu. Task lệch (VD mục A2 còn A3.1 sau khi đổi tên / kéo mục)
  // được đưa về đúng mã mục, kể cả khi STT mục không đổi.
  const sectionMember = candidate => item.isGroup && wbsLevel(code) === 'section' && !candidate.isGroup && candidate.parentGroupId === item.id;
  const wrongHead = key => /^[A-Z]\d+\.\d/.test(key) && key.split('.')[0] !== code;
  const misplaced = projectItems.filter(candidate => sectionMember(candidate) && wrongHead(cleanWbsCode(candidate.code)));
  if (oldCodes.every(old => old === code) && !misplaced.length) return '';

  // Dòng con (mọi cấp): đi ngược lên cha (task cha trước, rồi nhóm) mà gặp dòng đang đổi.
  const byId = new Map(projectItems.map(candidate => [candidate.id, candidate]));
  const isUnder = candidate => {
    const seen = new Set();
    let current = candidate;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentTaskId) || byId.get(current.parentGroupId);
      if (parent === item) return true;
      current = parent;
    }
    return false;
  };
  const descendants = new Set(projectItems.filter(candidate => candidate !== item && isUnder(candidate)));

  // STT mới của các dòng con mang tiền tố cũ (A1 → A2: A1.3 → A2.3; A → B: A1 → B1).
  const renamed = new Map([[item, code]]);
  for (const child of descendants) {
    const key = itemWbsCode(child);
    if (sectionMember(child)) {
      if (wrongHead(key)) renamed.set(child, code + key.slice(key.split('.')[0].length));
      continue;
    }
    const old = oldCodes.find(prefix => key.startsWith(prefix) && /^[.\d]/.test(key.slice(prefix.length)) && !key.startsWith(code + '.'));
    if (old) renamed.set(child, code + key.slice(old.length));
  }
  const others = projectItems.filter(candidate => !renamed.has(candidate));
  for (const [row, next] of renamed) {
    if (others.some(candidate => itemWbsCode(candidate) === next)) {
      return row === item ? `STT "${next}" đã có trong dự án. Hãy chọn STT khác.` : `Đổi STT sẽ làm dòng con thành "${next}", trùng với dòng đang có. Hãy chọn STT khác.`;
    }
  }

  // Dòng cha theo STT mới (chỉ khi dòng cha đó đang có, và không phải dòng con của chính nó).
  const allowed = candidate => candidate && candidate !== item && !descendants.has(candidate);
  const groupWith = key => projectItems.find(candidate => candidate.isGroup && allowed(candidate) && itemWbsCode(candidate) === key);
  const level = wbsLevel(code);
  if (item.isGroup) {
    if (level === 'section') { const phase = groupWith(code[0]); if (phase) item.parentGroupId = phase.id; }
    if (level === 'phase') item.parentGroupId = '';
  } else {
    const parts = code.split('.');
    let parentTask = null;
    for (let length = parts.length - 1; length >= 2 && !parentTask; length -= 1) {
      const key = parts.slice(0, length).join('.');
      parentTask = projectItems.find(candidate => !candidate.isGroup && allowed(candidate) && itemWbsCode(candidate) === key) || null;
    }
    const ownerGroup = parts.length > 1 ? groupWith(parts[0]) || (parts[0].length > 1 ? null : groupWith(parts[0][0])) : null;
    if (parentTask) { item.parentTaskId = parentTask.id; item.parentGroupId = parentTask.parentGroupId || ''; }
    else if (ownerGroup) { item.parentTaskId = ''; item.parentGroupId = ownerGroup.id; }
    // Task con đi theo nhóm của task cha.
    for (const child of descendants) if (!child.isGroup) child.parentGroupId = item.parentGroupId;
  }

  for (const [row, next] of renamed) setCode(db, row, next);

  // Xếp lại vị trí giữa các dòng cùng cấp theo STT mới.
  const list = db.ganttItems;
  const siblings = list.filter(candidate => candidate !== item && projectIdOf(db, candidate) === projectId &&
    (candidate.parentGroupId || '') === (item.parentGroupId || '') && (candidate.parentTaskId || '') === (item.parentTaskId || ''));
  list.splice(list.indexOf(item), 1);
  const before = siblings.find(sibling => compareWbsCodes(code, itemWbsCode(sibling)) < 0);
  const lastSibling = siblings.at(-1);
  const index = before ? list.indexOf(before) : lastSibling ? list.indexOf(lastSibling) + 1 : list.length;
  list.splice(index, 0, item);
  return '';
}
