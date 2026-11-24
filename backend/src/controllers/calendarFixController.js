import fs from 'node:fs';
import path from 'node:path';
import { readDb, writeDb, dbFilePath } from '../models/db.js';
import { applyCalendarFix, planCalendarFix } from '../utils/calendarFix.js';
import { appendActivity } from '../utils/activityLog.js';
import { managingRole } from '../../../frontend/src/utils/deliveryMetrics.js';

/**
 * POST /api/delivery/:projectId/calendar-fix  { apply: false } → xem trước; { apply: true } → sao lưu rồi áp dụng.
 * Chỉ Quản lý dự án / Giám đốc / Quản trị (vai trò trên dự án).
 */
export function calendarFix(req, res) {
  const { projectId } = req.params;
  if (!managingRole(req.deliveryUser?.role)) return res.status(403).json({ message: 'Chỉ Quản lý dự án, Giám đốc hoặc Quản trị được sửa lịch dự án.' });
  const db = readDb();
  const project = (db.projects || []).find(row => row.id === projectId);
  if (!project) return res.status(404).json({ message: 'Không tìm thấy dự án.' });
  if (!req.body?.apply) return res.json({ success: true, data: planCalendarFix(db, projectId) });
  const working = structuredClone(db);
  const plan = applyCalendarFix(working, projectId);
  if (!plan.codeChanges.length && !plan.dateChanges.length) return res.json({ success: true, data: plan });
  // Sao lưu riêng trước khi sửa dự án đang chạy (cạnh db.json, thư mục backups).
  try {
    const file = dbFilePath(), dir = path.join(path.dirname(file), 'backups');
    if (fs.existsSync(file)) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(file, path.join(dir, `db-before-calendar-fix-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)); }
  } catch (error) { return res.status(500).json({ message: `Không sao lưu được dữ liệu trước khi sửa (${error.message}).` }); }
  const user = req.deliveryCompanyUser || req.deliveryUser;
  appendActivity(working, { email: user.email, name: user.name, role: user.role, action: 'project.calendar-fix', label: 'Sửa mã MOI và lịch ngày nghỉ', category: 'project',
    details: `Dự án "${project.name}": đổi ${plan.codeChanges.length} mã MOI, dời ${plan.dateChanges.length} việc khỏi ngày nghỉ.` });
  if (!writeDb(working)) return res.status(500).json({ message: 'Không lưu được thay đổi.' });
  return res.json({ success: true, data: plan });
}
