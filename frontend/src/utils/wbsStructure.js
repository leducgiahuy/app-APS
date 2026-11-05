/**
 * Quy tắc STT (WBS) dùng chung cho nhập file báo giá, bảng tiến độ và chuẩn hóa dữ liệu cũ:
 * - A, B, C, L…        → giai đoạn (nhóm gốc), màu theo chữ cái của danh sách Giai đoạn
 * - A1, B2…            → mục con của giai đoạn cùng chữ cái
 * - A1.1, B2.3…        → task của mục A1/B2 (C.1 → task nằm thẳng trong giai đoạn C)
 * - A1.1.1, A1.1.1.2…  → task con của task có mã là phần đầu dài nhất (A1.1.1 → A1.1)
 */
export const WBS_PHASE_PRESETS = [
  { code: 'A', title: 'A. THIẾT KẾ XÂY DỰNG', color: '#2563eb' },
  { code: 'B', title: 'B. XIN PHÉP / PHÁP LÍ', color: '#dc2626' },
  { code: 'C', title: 'C. THẦU THI CÔNG', color: '#16a34a' },
  { code: 'L', title: 'L. NGHỈ LỄ VIỆT NAM', color: '#eab308' }
];

export const cleanWbsCode = code => String(code ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/\.+$/, '');

/** 'phase' | 'section' | 'task' | 'subtask' | '' (mã không theo quy tắc). */
export function wbsLevel(code) {
  const value = cleanWbsCode(code);
  if (/^[A-Z]$/.test(value)) return 'phase';
  if (/^[A-Z]\d+$/.test(value)) return 'section';
  if (/^[A-Z]\d*(\.\d+)+$/.test(value)) return value.split('.').length === 2 ? 'task' : 'subtask';
  return '';
}

/** Chữ cái giai đoạn của một nhóm: từ mã (A) hoặc từ tên dạng "A. …" (nhóm tạo tay có mã GR1). */
export function phaseLetter(group) {
  const code = cleanWbsCode(group?.code);
  if (/^[A-Z]$/.test(code)) return code;
  return String(group?.title || '').trim().match(/^([A-Z])\s*\./i)?.[1]?.toUpperCase() || '';
}

/** Mẫu giai đoạn (tên chuẩn + màu) của một nhóm gốc; null nếu nhóm không phải giai đoạn A/B/C/L. */
export function phasePresetFor(item) {
  if (!item?.isGroup || item.parentGroupId) return null;
  const letter = phaseLetter(item);
  return WBS_PHASE_PRESETS.find(preset => preset.title === item.title || (letter && preset.code === letter)) || null;
}

const withCodePrefix = (code, title) => {
  const text = String(title || '').trim().replace(/:$/, '').trim();
  return code && !cleanWbsCode(text.split(/[\s.]/)[0]).startsWith(cleanWbsCode(code)) ? `${code}. ${text}` : text;
};

/**
 * Gắn cấp cho danh sách hạng mục theo đúng thứ tự trong file (sửa trực tiếp các phần tử):
 * - promote(item) = true → dòng mã A/A1 đang là việc thường được đổi thành nhóm (tên thêm "A. ", màu giai đoạn);
 * - parentGroupId/parentTaskId đã có thì giữ nguyên.
 * Trả về các dòng vừa đổi thành nhóm và id các task có task con.
 */
export function linkWbsItems(items, { promote = () => true } = {}) {
  let phase = null, section = null;
  const tasksByCode = new Map(), sectionsByCode = new Map(), phasesByLetter = new Map(), promoted = [], parentTaskIds = new Set();
  for (const item of items) {
    const level = wbsLevel(item.code), code = cleanWbsCode(item.code);
    if (!item.isGroup && (level === 'phase' || level === 'section') && promote(item)) {
      Object.assign(item, { isGroup: true, title: withCodePrefix(item.code, item.title) });
      promoted.push(item);
    }
    if (item.isGroup) {
      const sectionLetter = level === 'section' ? code[0] : String(item.title || '').trim().match(/^([A-Z])\d+\s*[. ]/i)?.[1]?.toUpperCase();
      if (sectionLetter) {
        const owner = phasesByLetter.get(sectionLetter);
        if (!item.parentGroupId && owner) item.parentGroupId = owner.id;
        section = item;
        sectionsByCode.set(level === 'section' ? code : String(item.title).trim().match(/^([A-Z]\d+)/i)[1].toUpperCase(), item);
      } else {
        phase = item; section = null;
        if (phaseLetter(item)) phasesByLetter.set(phaseLetter(item), item);
        const preset = phasePresetFor(item);
        if (preset && promoted.includes(item)) item.color = preset.color;
      }
      tasksByCode.clear();
      continue;
    }
    let parentTask = null;
    if (level === 'subtask') {
      const parts = code.split('.');
      for (let length = parts.length - 1; length >= 2 && !parentTask; length -= 1) parentTask = tasksByCode.get(parts.slice(0, length).join('.')) || null;
    }
    if (parentTask && !item.parentTaskId) item.parentTaskId = parentTask.id;
    if (item.parentTaskId) parentTaskIds.add(item.parentTaskId);
    // Mục theo tiền tố mã (A2.1 → A2, C.1 → C); không có mục đó thì lấy mục gần nhất phía trên.
    const ownerGroup = code.includes('.') ? sectionsByCode.get(code.split('.')[0]) || phasesByLetter.get(code[0]) : null;
    if (!item.parentGroupId) item.parentGroupId = parentTask?.parentGroupId || ownerGroup?.id || (section || phase)?.id || '';
    if (code) tasksByCode.set(code, item);
  }
  return { promoted, parentTaskIds };
}

/** Dòng con trực tiếp (task trong nhóm, task con trong task). */
const childrenOf = (items, parent) => items.filter(item => item !== parent && (parent.isGroup ? item.parentGroupId === parent.id && !item.parentTaskId : item.parentTaskId === parent.id));

/** Ngày của nhóm/task cha = từ con sớm nhất đến con muộn nhất (xử lý từ dưới lên để cấp lồng nhau đúng). */
export function spanParentDates(items, parents) {
  for (const parent of [...parents].reverse()) {
    const dated = childrenOf(items, parent).filter(child => child.startDate && child.endDate);
    if (!dated.length) continue;
    parent.startDate = dated.map(child => child.startDate).sort()[0];
    parent.endDate = dated.map(child => child.endDate).sort().at(-1);
  }
}

const hasWork = task => Number(task.actualWorkHours) > 0 || (task.status && task.status !== 'not_started') || (task.sessions || []).length > 0;

/**
 * Chuẩn hóa dự án nhập bằng code cũ: dòng A/A1 bị lưu thành việc thường, mọi việc nằm phẳng.
 * Chỉ xử lý dòng chưa có cấp cha; dòng A/A1 chỉ thành nhóm khi có việc con theo mã và chưa ai chấm công vào nó.
 * Việc của các dòng thành nhóm / task cha bị bỏ khỏi danh sách việc (như khi tạo dự án mới).
 */
export function structureFlatWbs(db) {
  const ganttItems = db?.ganttItems || [];
  const tasks = db?.tasks || [];
  const byProject = new Map();
  ganttItems.forEach(item => { if (item.projectId && !item.isProjectHeader) byProject.set(item.projectId, [...(byProject.get(item.projectId) || []), item]); });
  let changed = false;
  for (const items of byProject.values()) {
    const flat = items.filter(item => !item.isGroup && !item.parentGroupId && !item.parentTaskId);
    const codes = flat.map(item => cleanWbsCode(item.code));
    const workedGanttIds = new Set(tasks.filter(hasWork).map(task => task.ganttId).filter(Boolean));
    const hasChildCode = item => codes.some(other => other.startsWith(`${cleanWbsCode(item.code)}.`));
    // Giai đoạn A/B/C/L luôn là nhóm; mục A1 chỉ thành nhóm khi có task theo mã (A1.x).
    const promotable = flat.filter(item => (wbsLevel(item.code) === 'phase' || (wbsLevel(item.code) === 'section' && hasChildCode(item))) && !workedGanttIds.has(item.id));
    const hasSubtasks = flat.some(item => wbsLevel(item.code) === 'subtask');
    if (!promotable.length && !hasSubtasks) continue;
    const before = new Map(flat.map(item => [item, JSON.stringify(item)]));
    const { promoted, parentTaskIds } = linkWbsItems(flat, { promote: item => promotable.includes(item) });
    promoted.forEach(group => Object.assign(group, { estimatedHours: 0, assignees: [], assignee: '', autoAssigned: false, unit: group.unit || 'GR' }));
    const parents = flat.filter(item => item.isGroup || parentTaskIds.has(item.id));
    spanParentDates(flat, parents);
    const removeTaskFor = new Set([...promoted.map(item => item.id), ...[...parentTaskIds].filter(id => !workedGanttIds.has(id))]);
    if (removeTaskFor.size && db.tasks) {
      const kept = db.tasks.filter(task => !removeTaskFor.has(task.ganttId));
      if (kept.length !== db.tasks.length) { db.tasks = kept; changed = true; }
    }
    if (flat.some(item => before.get(item) !== JSON.stringify(item))) changed = true;
  }
  return changed;
}

// Thứ tự giai đoạn lớn trên bảng tiến độ: A trước L, L trước B, B trước C…
export const WBS_MAJOR_ORDER = ['A', 'L', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Phân tích mã WBS (VD: 'A1.3' -> { majorIdx: 0, segments: [1, 3] })
 */
export function parseWbsCode(code) {
  if (!code) return { majorIdx: 999, segments: [] };
  const cleaned = String(code).trim();
  const match = cleaned.match(/^([A-Za-z]+)(.*)$/);
  if (!match) return { majorIdx: 999, segments: [cleaned] };

  const letter = match[1].toUpperCase();
  const rest = match[2];

  let majorIdx = WBS_MAJOR_ORDER.indexOf(letter);
  if (majorIdx === -1) majorIdx = 100 + letter.charCodeAt(0);

  const segments = rest
    ? rest
        .split('.')
        .map(s => {
          const num = parseInt(s, 10);
          return isNaN(num) ? s : num;
        })
    : [];

  return { majorIdx, segments };
}

/**
 * So sánh 2 mã WBS để sắp xếp đúng thứ tự cây phân tầng
 * Ví dụ: A1 < A1.1 < A1.2 < A1.3 < A2 < A2.1 < L < B
 */
export function compareWbsCodes(codeA, codeB) {
  const pa = parseWbsCode(codeA);
  const pb = parseWbsCode(codeB);

  // So sánh nhóm giai đoạn lớn trước (A trước L, L trước B, B trước C)
  if (pa.majorIdx !== pb.majorIdx) {
    return pa.majorIdx - pb.majorIdx;
  }

  // So sánh từng cấp số con bên trong
  const maxLen = Math.max(pa.segments.length, pb.segments.length);
  for (let i = 0; i < maxLen; i++) {
    const sa = pa.segments[i];
    const sb = pb.segments[i];

    if (sa === undefined) return -1; // Cấp cha ngắn hơn đứng trước (A1 đứng trước A1.1)
    if (sb === undefined) return 1;

    if (typeof sa === 'number' && typeof sb === 'number') {
      if (sa !== sb) return sa - sb;
    } else {
      const cmp = String(sa).localeCompare(String(sb));
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}
