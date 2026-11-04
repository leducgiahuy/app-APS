import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreDeliveryColumns, saveDeliveryColumns, COLUMN_PREFS_KEY } from '../../frontend/src/utils/deliveryColumnPrefs.js';

const memory = (data = {}) => ({ getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; }, removeItem: key => { delete data[key]; }, data });
const ALL = ['code', 'title', 'assignees', 'contractWork', 'duration', 'weight', 'actualWork', 'remainingWork', 'varianceWork', 'output'];
const DEFAULTS = ['code', 'title'];

test('cột đã ẩn giữ nguyên khi mở lại trang, không bị tự bật lại', () => {
  const storage = memory();
  // Ẩn Ngày, Còn lại, Chênh lệch nhưng vẫn hiện Dự toán, Thực tế, Tỷ trọng (trước đây sẽ bị chèn lại).
  const chosen = ['code', 'title', 'contractWork', 'weight', 'actualWork'];
  saveDeliveryColumns(storage, chosen, ALL);
  assert.deepEqual(restoreDeliveryColumns(storage, ALL, DEFAULTS), chosen);
  assert.deepEqual(restoreDeliveryColumns(storage, ALL, DEFAULTS), chosen);
});

test('web thêm cột mới sau này thì cột mới tự hiện, cột đã tắt vẫn tắt', () => {
  const storage = memory();
  saveDeliveryColumns(storage, ['code', 'title'], ALL);
  assert.deepEqual(restoreDeliveryColumns(storage, [...ALL, 'newColumn'], DEFAULTS), ['code', 'title', 'newColumn']);
});

test('bản lưu cũ v1 chuyển đổi một lần rồi ghi sang v2', () => {
  const storage = memory({ aps_delivery_columns_v1: JSON.stringify(['code', 'contractWork', 'actualWork']) });
  const restored = restoreDeliveryColumns(storage, ALL, DEFAULTS);
  assert.deepEqual(restored, ['code', 'contractWork', 'duration', 'actualWork', 'remainingWork', 'varianceWork']);
  saveDeliveryColumns(storage, restored.filter(key => key !== 'varianceWork'), ALL);
  assert.equal(storage.data.aps_delivery_columns_v1, undefined);
  assert.ok(storage.data[COLUMN_PREFS_KEY]);
  assert.ok(!restoreDeliveryColumns(storage, ALL, DEFAULTS).includes('varianceWork'));
});

test('chưa lưu gì hoặc bản lưu hỏng thì dùng bộ cột mặc định', () => {
  assert.deepEqual(restoreDeliveryColumns(memory(), ALL, DEFAULTS), DEFAULTS);
  assert.deepEqual(restoreDeliveryColumns(memory({ [COLUMN_PREFS_KEY]: '{hỏng' }), ALL, DEFAULTS), DEFAULTS);
});
