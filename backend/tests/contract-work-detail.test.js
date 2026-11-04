import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBlueprint } from '../src/utils/projectBlueprint.js';
import { computeDelivery, summarizeProjectWork } from '../../frontend/src/utils/deliveryMetrics.js';

const quoteItems = [
  { code: 'A', title: 'PHẦN THIẾT KẾ', isGroup: true },
  { code: 'A1', title: 'Khảo sát', isGroup: true },
  { code: 'A1.1', title: 'Kick-off', department: 'KT', workDays: 2 },
  { code: 'A1.2', title: 'Pháp lý', department: 'KT', workDays: 0 },
  { code: 'A1.3', title: 'Đo đạc', department: 'KC', workDays: 3.5 },
  { code: 'A1.3.1', title: 'Đo cao độ', department: 'KC', workDays: 1 },
  { code: 'A1.3.2', title: 'Lập bản vẽ', department: 'KC', workDays: 1.5 },
  { code: 'B', title: 'PHẦN DỰ TOÁN', isGroup: true },
  { code: 'B.1', title: 'Lập dự toán', department: 'KT', workDays: 4 },
];

test('sinh dự án từ file hợp đồng: Dự toán từng task = số công của hạng mục, cộng lại = dự toán dự án', () => {
  const db = { projects: [], ganttItems: [], employees: [], operations: { params: {} } };
  const plan = projectBlueprint(db, { name: 'P', startDate: '2026-11-03', endDate: '2026-12-31', quoteItems }, { email: 'a@aps.com' });
  const byCode = new Map(plan.items.map(item => [item.code, item]));
  assert.equal(byCode.get('A1.1').contractWork, 2);
  assert.equal(byCode.get('A1.2').contractWork, 0, 'hạng mục 0 công trong hợp đồng giữ đúng 0');
  assert.equal(byCode.get('A1.3.1').contractWork, 1);
  assert.equal(byCode.get('A1.3.2').contractWork, 1.5);
  assert.equal(byCode.get('B.1').contractWork, 4);
  assert.equal(byCode.get('A1.3').contractWork, undefined, 'task cha không có dự toán riêng (đã nằm ở task con)');
  assert.equal(byCode.get('A').contractWork, undefined, 'nhóm cộng từ task con khi hiển thị');
  const leafSum = plan.items.filter(item => item.contractWork != null).reduce((sum, item) => sum + item.contractWork, 0);
  assert.equal(leafSum, plan.project.contractWork, 'tổng dự toán task = dự toán dự án');
});

test('dự toán chốt theo hợp đồng: dời lịch / đổi giờ sau này chỉ đổi Dự báo, không đổi Dự toán', () => {
  const db = { projects: [], ganttItems: [], employees: [], tasks: [], operations: { params: {} } };
  const plan = projectBlueprint(db, { name: 'P', startDate: '2026-11-03', endDate: '2026-12-31', quoteItems }, { email: 'a@aps.com' });
  db.projects.push(plan.project); db.ganttItems.push(...plan.items);
  const task = plan.items.find(item => item.code === 'B.1');
  task.estimatedHours = 48; // kéo dài thành 6 công
  const metrics = computeDelivery(db, plan.project.id, { settings: {} }).taskMetrics;
  assert.equal(metrics[task.id].budgetedWork, 4);
  assert.equal(metrics[task.id].varianceWork, metrics[task.id].forecastWork - 4);
  assert.equal(summarizeProjectWork(plan.project, metrics).budgetedWork, plan.project.contractWork);
});
