/**
 * Lựa chọn cột hiện / ẩn của bảng tiến độ (nút "Bố cục" → Hiển thị cột), lưu trên trình duyệt.
 * Bản lưu v2 = { keys: cột đang hiện, known: mọi cột web có lúc lưu }:
 * - mở lại trang / chuyển trang rồi quay lại: giữ đúng các cột đã chọn, không tự bật lại cột đã tắt;
 * - sau này web thêm cột mới (không có trong known): cột mới tự hiện, cột người dùng đã tắt vẫn tắt;
 * - bản lưu cũ v1 (chỉ có danh sách cột) được chuyển đổi một lần theo quy tắc cũ rồi ghi sang v2.
 */
export const COLUMN_PREFS_KEY = 'aps_delivery_columns_v2';
const LEGACY_KEY = 'aps_delivery_columns_v1';

/** Quy tắc nâng cấp của bản v1: các cột mới thêm hồi đó được chèn cạnh cột liên quan. Chỉ chạy một lần. */
function migrateLegacy(valid) {
  let restored = valid.includes('contractWork') && !valid.includes('duration')
    ? valid.flatMap(key => key === 'contractWork' ? [key, 'duration'] : [key])
    : valid;
  if (!restored.includes('actualWork') && (restored.includes('weight') || restored.includes('output'))) {
    const outputIndex = restored.indexOf('output');
    restored = outputIndex >= 0 ? [...restored.slice(0, outputIndex), 'actualWork', ...restored.slice(outputIndex)] : [...restored, 'actualWork'];
  }
  if (restored.includes('actualWork')) {
    const comparisonKeys = ['remainingWork', 'varianceWork'];
    const withoutComparison = restored.filter(key => !comparisonKeys.includes(key));
    const actualIndex = withoutComparison.indexOf('actualWork');
    restored = [...withoutComparison.slice(0, actualIndex + 1), ...comparisonKeys, ...withoutComparison.slice(actualIndex + 1)];
  }
  return restored;
}

const read = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };

export function restoreDeliveryColumns(storage, allKeys, defaults) {
  const saved = read(storage, COLUMN_PREFS_KEY);
  if (saved && Array.isArray(saved.keys)) {
    const known = new Set(Array.isArray(saved.known) ? saved.known : saved.keys);
    const keys = [...saved.keys.filter(key => allKeys.includes(key)), ...allKeys.filter(key => !known.has(key))];
    return keys.length ? [...new Set(keys)] : defaults;
  }
  const legacy = read(storage, LEGACY_KEY);
  if (!Array.isArray(legacy)) return defaults;
  const restored = migrateLegacy(legacy.filter(key => allKeys.includes(key)));
  return restored.length ? [...new Set(restored)] : defaults;
}

export function saveDeliveryColumns(storage, keys, allKeys) {
  try {
    storage.setItem(COLUMN_PREFS_KEY, JSON.stringify({ keys, known: allKeys }));
    storage.removeItem(LEGACY_KEY);
  } catch { /* Trình duyệt chặn lưu (chế độ riêng tư): vẫn dùng được, chỉ không nhớ lần sau. */ }
}
