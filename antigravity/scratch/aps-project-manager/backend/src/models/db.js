import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '../../data/db.json');

let cachedDb = null;
const SEED_FILE = path.join(__dirname, '../../data/seed.json');

// Đọc dữ liệu từ file db.json (có cache bộ nhớ & dự phòng seed.json an toàn)
export function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      if (raw && raw.trim().length > 10) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.ganttItems)) {
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
      cachedDb = seedObj;
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
    cachedDb = data;
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Lỗi khi ghi file db.json:', error.message);
    return false;
  }
}
