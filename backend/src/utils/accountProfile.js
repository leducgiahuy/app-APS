import { readDb, writeDb } from '../models/db.js';
import { deliveryStore, safeUser } from './deliveryAuth.js';

// Hồ sơ tài khoản (tên, công ty, SĐT, ảnh, phòng ban, chuyên môn) lưu ở máy chủ, cùng bản ghi đăng nhập,
// để mọi trình duyệt / lần đăng nhập sau luôn đọc bản mới nhất thay vì bản cũ trong trình duyệt.
// Danh mục phòng ban / chuyên môn: bắt đầu rỗng, tự thêm mỗi khi admin tạo / sửa user với giá trị mới.

const TEXT_FIELDS = { company: 160, phone: 40, department: 120, specialty: 120 };
const AVATAR_MAX = 400 * 1024;
const CATALOG_KINDS = ['departments', 'specialties'];

/** Lấy các trường hồ sơ hợp lệ có trong body; trường không gửi thì bỏ qua (không xóa giá trị đang lưu). */
export function profileFields(body = {}) {
  const fields = {};
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (typeof body[key] === 'string') fields[key] = body[key].trim().slice(0, max);
  }
  if (typeof body.avatarData === 'string' && (body.avatarData === '' || (body.avatarData.startsWith('data:image/') && body.avatarData.length <= AVATAR_MAX))) {
    fields.avatarData = body.avatarData;
  }
  return fields;
}

const FIELD_OF = { departments: 'department', specialties: 'specialty' };
const sameText = (a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }) === 0;

/**
 * Danh mục đã lưu + phòng ban / chuyên môn của mọi tài khoản đang có (kể cả user tạo trước khi có danh mục),
 * trừ các mục admin đã bấm × (`hidden`). Gọi mỗi lần đọc nên dữ liệu cũ / khôi phục từ bản sao lưu luôn đủ.
 */
export function accountCatalog(db) {
  db.accountCatalog ||= {};
  const catalog = db.accountCatalog;
  if (!Array.isArray(catalog.hidden)) catalog.hidden = [];
  for (const kind of CATALOG_KINDS) {
    if (!Array.isArray(catalog[kind])) catalog[kind] = [];
    for (const user of deliveryStore(db).users) {
      const value = typeof user[FIELD_OF[kind]] === 'string' ? user[FIELD_OF[kind]].trim() : '';
      if (value && !catalog[kind].some(entry => sameText(entry, value)) && !catalog.hidden.some(entry => entry.kind === kind && sameText(entry.value, value))) catalog[kind].push(value);
    }
  }
  return catalog;
}

/** Thêm phòng ban / chuyên môn vừa nhập vào danh mục (không trùng, không phân biệt hoa thường); nhập lại mục đã ẩn thì hiện lại. */
export function rememberCatalogValues(db, { department, specialty }) {
  const catalog = accountCatalog(db);
  for (const [kind, value] of [['departments', department], ['specialties', specialty]]) {
    if (!value) continue;
    catalog.hidden = catalog.hidden.filter(entry => !(entry.kind === kind && sameText(entry.value, value)));
    if (!catalog[kind].some(entry => sameText(entry, value))) catalog[kind].push(value);
  }
}

const publicCatalog = catalog => ({ departments: catalog.departments, specialties: catalog.specialties });

/** GET: hồ sơ của chính mình. PATCH: tự sửa tên / công ty / SĐT / ảnh; đồng bộ sang nhân sự liên kết. */
export function deliveryProfile(req, res) {
  const db = readDb(); const store = deliveryStore(db);
  const user = store.users.find(item => item.email === req.deliveryCompanyUser.email);
  if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
  if (req.method === 'GET') return res.json({ success: true, data: safeUser(user) });
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return res.status(400).json({ message: 'Họ và tên không được để trống.' });
  const { company, phone, avatarData } = profileFields(body);
  Object.assign(user, { name, profileSavedAt: new Date().toISOString() },
    company !== undefined && { company }, phone !== undefined && { phone }, avatarData !== undefined && { avatarData });
  const employee = user.employeeId && (db.employees || []).find(item => item.id === user.employeeId);
  if (employee) {
    employee.name = name;
    if (phone !== undefined) employee.phone = phone || 'Đang cập nhật';
    if (avatarData !== undefined) { if (avatarData) employee.avatar = avatarData; else delete employee.avatar; }
  }
  if (!writeDb(db)) return res.status(500).json({ message: 'Không lưu được hồ sơ.' });
  return res.json({ success: true, data: safeUser(user) });
}

/** GET: danh mục phòng ban / chuyên môn đã dùng. DELETE { kind, value }: admin bỏ một mục khỏi danh mục. */
export function deliveryAccountCatalog(req, res) {
  if (!['admin', 'director'].includes(req.deliveryUser.role)) return res.status(403).json({ message: 'Chỉ quản trị/giám đốc được xem danh mục tài khoản.' });
  const db = readDb(); const catalog = accountCatalog(db);
  if (req.method === 'DELETE') {
    const { kind, value } = req.body || {};
    if (!CATALOG_KINDS.includes(kind) || typeof value !== 'string') return res.status(400).json({ message: 'Mục cần xóa không hợp lệ.' });
    catalog[kind] = catalog[kind].filter(entry => !sameText(entry, value));
    if (!catalog.hidden.some(entry => entry.kind === kind && sameText(entry.value, value))) catalog.hidden.push({ kind, value });
    if (!writeDb(db)) return res.status(500).json({ message: 'Không lưu được danh mục.' });
  }
  return res.json({ success: true, data: publicCatalog(catalog) });
}
