/**
 * Đọc file báo giá (theo mẫu "Tải Mẫu báo giá"):
 * - khối THÔNG TIN CHUNG để tự điền bước 2 của form nhập dự án;
 * - khối HẠNG MỤC BÁO GIÁ để tạo việc khi dạng dự án chưa có template.
 *
 * Cách đọc: tìm các dòng có mã trường ở cột A (TEN_DU_AN, MA_DU_AN, ...) và lấy giá trị ở cột C;
 * bảng hạng mục là các dòng dưới dòng tiêu đề MA_HANG_MUC.
 * Không phụ thuộc số dòng, nên người dùng có thêm/bớt dòng trống vẫn đọc đúng.
 * Hỗ trợ .xlsx (mẫu mới) và .csv (mẫu cũ); .xls đời cũ không đọc được, cần lưu lại thành .xlsx.
 */

/** Mã trường ở cột A → tên thuộc tính trong draft của form. */
const FIELD_KEYS = {
  TEN_DU_AN: 'name',
  MA_DU_AN: 'code',
  CHU_DAU_TU: 'client',
  DANG_DU_AN: 'templateId',
  DIEN_TICH_SAN_M2: 'area',
  SO_TANG: 'floors',
  NGAY_BAT_DAU: 'startDate',
  NGAY_KET_THUC: 'endDate',
  GIA_TRI_HD_TRUOC_VAT: 'contractFee',
  DIA_DIEM: 'location',
  QL_LEADER_EMAIL: 'managerEmail',
};

/** So khớp chữ không phân biệt hoa thường, dấu và khoảng trắng thừa. */
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
const pad = number => String(number).padStart(2, '0');

/** Lấy giá trị thô của ô exceljs: chữ, số, ngày, công thức (lấy kết quả), link (email) hoặc chữ nhiều định dạng. */
function cellValue(value) {
  if (value == null) return '';
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('result' in value) return cellValue(value.result);
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
  if ('text' in value) return cellValue(value.text);
  return '';
}

/** Đổi ô ngày sang yyyy-mm-dd cho input date: nhận ngày Excel, số serial Excel hoặc chữ dd/mm/yyyy. */
function toIsoDate(value) {
  if (value instanceof Date) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  if (typeof value === 'number') return toIsoDate(new Date(Math.round((value - 25569) * 86400000)));
  const text = String(value).trim();
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dmy && !iso) return '';
  const [day, month, year] = (dmy ? [dmy[1], dmy[2], dmy[3]] : [iso[3], iso[2], iso[1]]).map(Number);
  // Loại ngày không có thật (VD 31/02, tháng 13): Date tự nhảy sang tháng khác thì coi là sai.
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 ? `${year}-${pad(month)}-${pad(day)}` : '';
}

/** Đổi ô số sang chuỗi số; chữ kiểu "1.200.000" hoặc "1,200,000" được bỏ dấu phân cách. */
function toNumberText(value, { integer = false } = {}) {
  if (typeof value === 'number') return String(value);
  const text = String(value).trim().replace(/\s/g, '');
  const cleaned = integer || /^\d{1,3}([.,]\d{3})+$/.test(text) ? text.replace(/[.,]/g, '') : text.replace(',', '.');
  return Number.isFinite(Number(cleaned)) && cleaned !== '' ? cleaned : '';
}

/** Tách CSV đơn giản (có hỗ trợ ô trong dấu ngoặc kép) thành mảng dòng → mảng ô. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === ';') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** Đọc file thành mảng dòng, mỗi dòng là 4 ô đầu (cột A–D) đã lấy giá trị thô. */
async function readSheetRows(file) {
  const name = file.name.toLocaleLowerCase('vi');
  if (name.endsWith('.csv')) return parseCsv((await file.text()).replace(/^﻿/, ''));
  if (!name.endsWith('.xlsx')) throw new Error('File .xls đời cũ chưa đọc được. Hãy mở file và "Lưu thành" .xlsx rồi chọn lại.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const rows = [];
  workbook.worksheets.forEach(sheet => sheet.eachRow(row => rows.push([1, 2, 3, 4].map(column => cellValue(row.getCell(column).value)))));
  return rows;
}

/** Khối THÔNG TIN CHUNG: cột A mã trường, cột C giá trị (mẫu CSV cũ không có cột MUC thì giá trị ở cột B). */
const infoRows = rows => rows.map(row => [String(row[0] ?? '').trim(), row.length >= 3 ? row[2] : row[1]]);

/**
 * Khối HẠNG MỤC BÁO GIÁ: các dòng nằm dưới dòng tiêu đề có MA_HANG_MUC ở cột A.
 * Bỏ qua dòng trống và dòng TỔNG CỘNG; dòng có tên nhưng thiếu/sai số công thì bỏ ra và cảnh báo.
 */
function quoteItemRows(rows, warnings) {
  const header = rows.findIndex(row => String(row[0] ?? '').trim() === 'MA_HANG_MUC');
  if (header < 0) return [];
  const items = [];
  for (const [code, title, department, workDays] of rows.slice(header + 1)) {
    const name = String(title ?? '').trim();
    if (!name || normalize(name) === 'tong cong') continue;
    const days = Number(toNumberText(workDays ?? ''));
    if (!(days > 0)) { warnings.push(`Hạng mục "${name}" chưa có số công nên bị bỏ qua`); continue; }
    items.push({ code: String(code ?? '').trim(), title: name, department: String(department ?? '').trim(), workDays: days });
  }
  return items;
}

/**
 * Đọc file báo giá và trả về:
 * - patch: các ô của form có giá trị trong file (ô trống trong file không ghi đè dữ liệu đang có trên form)
 * - filled: số ô đã điền được
 * - items: bảng hạng mục (code, title, department, workDays) để tạo việc khi dạng dự án chưa có template
 * - typeName: dạng dự án ghi trong file; unknownType = true nếu không trùng template nào
 * - warnings: các giá trị không dùng được (email không tồn tại, ngày hoặc số sai định dạng, hạng mục thiếu công)
 * templates/managers lấy từ dữ liệu hệ thống để đổi tên template → id và kiểm tra email QL · Leader.
 */
export async function readQuoteInfo(file, { templates = [], managers = [] } = {}) {
  const rows = await readSheetRows(file);
  const patch = {}, warnings = [];
  let typeName = '', unknownType = false;
  for (const [key, raw] of infoRows(rows)) {
    const field = FIELD_KEYS[key];
    if (!field || raw === '' || raw == null) continue;
    const text = String(raw).trim();
    if (field === 'startDate' || field === 'endDate') {
      const date = toIsoDate(raw);
      if (date) patch[field] = date; else warnings.push(`Ngày "${text}" chưa đúng dạng dd/mm/yyyy`);
    } else if (field === 'area' || field === 'floors' || field === 'contractFee') {
      const number = toNumberText(raw, { integer: field === 'contractFee' });
      if (number) patch[field] = number; else warnings.push(`"${text}" ở ${key} không phải số`);
    } else if (field === 'templateId') {
      // Chấp nhận cả "Nhà máy trong KCN" lẫn chữ đầy đủ như trên form "Nhà máy trong KCN · 14 việc".
      // Dạng dự án mới (không trùng template) vẫn hợp lệ: form sẽ chuyển sang lấy hạng mục từ file.
      typeName = text;
      const template = templates.find(row => normalize(row.name) === normalize(text.split('·')[0]));
      if (template) patch.templateId = template.id; else unknownType = true;
    } else if (field === 'managerEmail') {
      const manager = managers.find(account => normalize(account.email) === normalize(text));
      if (manager) patch.managerEmail = manager.email; else warnings.push(`Email QL · Leader "${text}" không có trong danh sách quản lý`);
    } else patch[field] = text;
  }
  if (patch.startDate && patch.endDate && patch.endDate < patch.startDate) warnings.push('Ngày kết thúc đang trước ngày bắt đầu');
  const items = quoteItemRows(rows, warnings);
  return { patch, filled: Object.keys(patch).length, items, typeName, unknownType, warnings };
}

/**
 * Đổi bảng hạng mục (đọc từ file) thành danh sách việc của template:
 * - việc xếp nối tiếp theo thứ tự trong file, mỗi việc kéo dài số ngày = số công (làm tròn lên, tối thiểu 1 ngày);
 * - việc sau phụ thuộc việc trước; số giờ = công × 8; không co giãn theo diện tích (vì công đã là số chốt);
 * - vị trí gán người lấy theo ánh xạ bộ môn → vị trí của các template đã có (positionOf), không có thì dùng tên bộ môn.
 */
export function quoteItemsToTemplateItems(items, positionOf = () => '') {
  let cursor = 0;
  return items.map((item, index) => {
    const startOffset = cursor;
    cursor += Math.max(1, Math.ceil(item.workDays));
    const id = `tpl-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`}`;
    return { id, code: item.code, title: item.title, requiredPosition: item.department, assignmentPosition: positionOf(item.department) || item.department, startOffset, endOffset: cursor - 1, estimatedHours: item.workDays * 8, scaleWithArea: false };
  }).map((item, index, all) => ({ ...item, dependencies: index ? [all[index - 1].id] : [] }));
}

/** Ánh xạ bộ môn → vị trí gán người, học từ các việc trong những template đầy đủ đang có (VD KT → Thiết Kế). */
export function positionLookup(templates = []) {
  const map = new Map(templates.flatMap(template => template.items || []).filter(item => item.requiredPosition && item.assignmentPosition).map(item => [normalize(item.requiredPosition), item.assignmentPosition]));
  return department => map.get(normalize(department)) || '';
}
