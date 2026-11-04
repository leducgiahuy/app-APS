import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { removeMissingEmployeeAssignments } from '../utils/employeeAssignments.js';
import { ensureEmployeeCodes } from '../utils/employeeCodes.js';
import { normalizeAssignmentSchedules } from '../../../frontend/src/utils/assignmentCalendar.js';
import { clearStaleTaskSelections, resetNeverStartedTasks } from '../utils/taskStatus.js';
import { structureFlatWbs } from '../../../frontend/src/utils/wbsStructure.js';
import { removeOrphanRecords } from '../utils/deletionCleanup.js';
import { dropRetiredOperations } from '../utils/operationsStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEGACY_DB_FILE = path.join(__dirname, '../../data/db.json');
const DEFAULT_DATA_ROOT = process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const DB_FILE = path.resolve(process.env.APS_DB_PATH || path.join(DEFAULT_DATA_ROOT, 'APS Project Manager', 'db.json'));

let cachedDb = null;
const SEED_FILE = path.join(__dirname, '../../data/seed.json');

/** Bản sao lưu hằng ngày mới nhất còn đọc được (backups/db-YYYY-MM-DD.json), hoặc null. */
function latestValidBackup() {
  const backupDir = path.join(path.dirname(DB_FILE), 'backups');
  if (!fs.existsSync(backupDir)) return null;
  const names = fs.readdirSync(backupDir).filter(name => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse();
  for (const name of names) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(backupDir, name), 'utf-8'));
      if (data && Array.isArray(data.projects) && Array.isArray(data.ganttItems)) return { name, data };
    } catch { /* bản sao lưu hỏng: thử bản cũ hơn */ }
  }
  return null;
}

// Đọc dữ liệu từ file db.json (có cache bộ nhớ & dự phòng seed.json an toàn)
export function readDb() {
  try {
    // Migrate existing installations once before reading the new external path.
    if (!fs.existsSync(DB_FILE) && path.resolve(DB_FILE) !== path.resolve(LEGACY_DB_FILE) && fs.existsSync(LEGACY_DB_FILE)) {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      fs.copyFileSync(LEGACY_DB_FILE, DB_FILE);
      console.info(`Đã chuyển dữ liệu cũ sang: ${DB_FILE}`);
    }

    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      if (raw && raw.trim().length > 10) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.ganttItems)) {
          // Repair assignments left behind by employee deletions in older versions.
          const assignmentsChanged = removeMissingEmployeeAssignments(parsed);
          const codesChanged = ensureEmployeeCodes(parsed);
          const schedulesChanged = normalizeAssignmentSchedules(parsed);
          const statusesChanged = resetNeverStartedTasks(parsed);
          const selectionsChanged = clearStaleTaskSelections(parsed);
          // Dự án nhập file bằng code cũ: dòng A/A1 thành nhóm, A1.1.1 thành task con.
          const wbsChanged = structureFlatWbs(parsed);
          // Dữ liệu cũ / bản khôi phục còn dòng của dự án, nhân sự đã xóa thì gỡ luôn.
          const orphansChanged = removeOrphanRecords(parsed);
          // Dữ liệu của các trang đã bỏ (danh sách trong operationsStore.js) không giữ lại trong db.
          const retiredChanged = dropRetiredOperations(parsed);
          if (assignmentsChanged || codesChanged || schedulesChanged || statusesChanged || selectionsChanged || wbsChanged || orphansChanged || retiredChanged) writeDb(parsed);
          cachedDb = parsed;
          return parsed;
        }
      }
    }
  } catch (error) {
    console.error('Lỗi khi đọc file db.json:', error.message);
  }

  // Sử dụng cache trong RAM nếu có
  if (cachedDb && Array.isArray(cachedDb.ganttItems)) {
    return cachedDb;
  }

  // db.json đã có nhưng trống / hỏng: lấy bản sao lưu hằng ngày mới nhất, không nạp dữ liệu mẫu
  // (dữ liệu mẫu sẽ làm dự án, nhân sự đã xóa xuất hiện lại). File hỏng được giữ lại để tra cứu.
  const backup = latestValidBackup();
  if (backup) {
    try {
      if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}`);
      console.error(`db.json không đọc được, dùng bản sao lưu ${backup.name}`);
      writeDb(backup.data);
      return backup.data;
    } catch (backupErr) {
      console.error('Lỗi khi nạp bản sao lưu:', backupErr.message);
    }
  }

  // Chỉ máy mới cài (chưa có db.json, chưa có sao lưu) mới nạp seed.json
  try {
    if (!fs.existsSync(DB_FILE) && fs.existsSync(SEED_FILE)) {
      const rawSeed = fs.readFileSync(SEED_FILE, 'utf-8');
      const seedObj = JSON.parse(rawSeed);
      removeMissingEmployeeAssignments(seedObj);
      ensureEmployeeCodes(seedObj);
      normalizeAssignmentSchedules(seedObj);
      resetNeverStartedTasks(seedObj);
      clearStaleTaskSelections(seedObj);
      structureFlatWbs(seedObj);
      removeOrphanRecords(seedObj);
      dropRetiredOperations(seedObj);
      cachedDb = seedObj;
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(seedObj, null, 2), 'utf-8');
      return seedObj;
    }
  } catch (seedErr) {
    console.error('Lỗi khi nạp seed.json:', seedErr.message);
  }

  return cachedDb || { projects: [], employees: [], tasks: [], overtimes: [], ganttItems: [] };
}

// Lưu dữ liệu vào file db.json an toàn
export function writeDb(data) {
  try {
    if (!data) return false;
    // Applies to employee deletions and all future task/Gantt writes.
    removeMissingEmployeeAssignments(data);
    ensureEmployeeCodes(data);
    normalizeAssignmentSchedules(data);
    resetNeverStartedTasks(data);
    clearStaleTaskSelections(data);
    structureFlatWbs(data);
    removeOrphanRecords(data);
    dropRetiredOperations(data);
    cachedDb = data;
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const backupDir=path.join(path.dirname(DB_FILE),'backups'),day=new Date(Date.now()+7*3600000).toISOString().slice(0,10),backupFile=path.join(backupDir,`db-${day}.json`);
    if(fs.existsSync(DB_FILE)&&!fs.existsSync(backupFile)){
      fs.mkdirSync(backupDir,{recursive:true});fs.copyFileSync(DB_FILE,backupFile);
      const backups=fs.readdirSync(backupDir).filter(name=>/^db-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
      for(const name of backups.slice(0,Math.max(0,backups.length-30)))fs.unlinkSync(path.join(backupDir,name));
    }
    const temporary=`${DB_FILE}.tmp`;fs.writeFileSync(temporary,JSON.stringify(data,null,2),'utf-8');fs.renameSync(temporary,DB_FILE);
    return true;
  } catch (error) {
    console.error('Lỗi khi ghi file db.json:', error.message);
    return false;
  }
}
