import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { removeMissingEmployeeAssignments } from '../utils/employeeAssignments.js';
import { ensureEmployeeCodes } from '../utils/employeeCodes.js';
import { normalizeAssignmentSchedules } from '../../../frontend/src/utils/assignmentCalendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEGACY_DB_FILE = path.join(__dirname, '../../data/db.json');
const DEFAULT_DATA_ROOT = process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const DB_FILE = path.resolve(process.env.APS_DB_PATH || path.join(DEFAULT_DATA_ROOT, 'APS Project Manager', 'db.json'));

let cachedDb = null;
const SEED_FILE = path.join(__dirname, '../../data/seed.json');

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
          if (assignmentsChanged || codesChanged || schedulesChanged) writeDb(parsed);
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

  // Fallback an toàn tới seed.json nếu db.json trống hoặc bị lỗi
  try {
    if (fs.existsSync(SEED_FILE)) {
      const rawSeed = fs.readFileSync(SEED_FILE, 'utf-8');
      const seedObj = JSON.parse(rawSeed);
      removeMissingEmployeeAssignments(seedObj);
      ensureEmployeeCodes(seedObj);
      normalizeAssignmentSchedules(seedObj);
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
    cachedDb = data;
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Lỗi khi ghi file db.json:', error.message);
    return false;
  }
}
