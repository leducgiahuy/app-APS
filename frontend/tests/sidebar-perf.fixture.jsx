// Đo độ mượt khi thu/mở menu trái trên trang Dự án (dữ liệu giả, không gọi backend).
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { computeDelivery } from '../src/utils/deliveryMetrics';
import '../src/index.css';

localStorage.setItem('aps-authenticated', 'demo@aps.vn');

const day = offset => { const d = new Date(2026, 9, 1 + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const employees = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, name: `Nhân sự ${i + 1}`, code: `NV-${String(i + 1).padStart(3, '0')}`, team: 'Thiết kế', standardHours: 8 }));
const ganttItems = [];
for (let g = 0; g < 8; g++) {
  ganttItems.push({ id: `g${g}`, projectId: 'proj-1', isGroup: true, title: `${String.fromCharCode(65 + g)}. Giai đoạn ${g + 1}`, code: String.fromCharCode(65 + g), startDate: day(g * 25), endDate: day(g * 25 + 40) });
  for (let t = 0; t < 20; t++) {
    const start = g * 25 + t, emp = employees[(g + t) % employees.length];
    ganttItems.push({ id: `t${g}-${t}`, projectId: 'proj-1', parentGroupId: `g${g}`, code: `${String.fromCharCode(65 + g)}${t + 1}`, title: `Công việc ${g + 1}.${t + 1}`, startDate: day(start), endDate: day(start + 4), estimatedHours: 40, estimatedHoursPerDay: 8, status: 'not_started', assignee: emp.name, assignees: [{ employeeId: emp.id, employeeName: emp.name, startDate: day(start), endDate: day(start + 4), estimatedHoursPerDay: 8 }] });
  }
}
const db = { projects: [{ id: 'proj-1', name: 'DỰ ÁN ĐO HIỆU NĂNG', startDate: day(0), endDate: day(260) }], employees, ganttItems, tasks: [] };
const saved = { revision: 0, settings: { contractFee: 3200000000, hourlyRate: 350000 }, records: {}, timesheets: [], evidence: [], documents: [], changes: [], closes: [], receipts: [], expenses: [], milestones: [], comments: [], audit: [], history: [] };
const viewer = { email: 'demo@aps.vn', name: 'Quản trị', role: 'admin', employeeId: '' };
window.fetch = async url => {
  const endpoint = String(url).split('/api/')[1] || '';
  let result = {};
  if (endpoint === 'delivery/session') result = { token: 'mock', expiresAt: Date.now() + 1e8, user: viewer };
  else if (endpoint === 'delivery/users') result = [viewer];
  else if (endpoint === 'delivery/templates') result = [];
  else if (endpoint === 'delivery/proj-1') result = { ...saved, ...computeDelivery(db, 'proj-1', saved), viewer, permissions: { manage: true, financial: true, users: true } };
  else if (endpoint === 'employees') result = db.employees;
  else if (endpoint === 'projects') result = db.projects;
  else if (endpoint === 'gantt') result = db.ganttItems;
  else if (endpoint === 'tasks') result = { tasks: [], overtimes: [] };
  return { ok: true, status: 200, json: async () => ({ success: true, data: structuredClone(result) }) };
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async fn => { for (let i = 0; i < 200; i++) { if (fn()) return; await sleep(50); } throw new Error('Timed out'); };
const out = document.getElementById('test-results');

async function measureToggle(label) {
  const toggle = document.querySelector('button[title="Thu gọn Sidebar"], button[title="Mở rộng Sidebar"]');
  const deltas = [];
  let last = 0;
  let running = true;
  const loop = time => { if (last) deltas.push(time - last); last = time; if (running) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  await sleep(50);
  toggle.click();
  await sleep(700);
  running = false;
  const slow = deltas.filter(delta => delta > 34);
  return { label, frames: deltas.length, maxFrameMs: Math.round(Math.max(...deltas)), slowFrames: slow.length, jankMs: Math.round(slow.reduce((sum, delta) => sum + delta - 16.7, 0)) };
}

try {
  createRoot(document.getElementById('root')).render(<App />);
  await waitFor(() => document.querySelector('aside button'));
  [...document.querySelectorAll('aside button')].find(node => node.textContent.trim() === 'Dự án').click();
  await waitFor(() => document.querySelectorAll('.delivery-row').length > 100);
  await sleep(1500);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    runs.push(await measureToggle('thu gọn'));
    await sleep(400);
    runs.push(await measureToggle('mở rộng'));
    await sleep(400);
  }
  // Nền: 3 giây không thao tác, để tách phần giật do trang tự vẽ lại định kỳ.
  const idle = [];
  { let last = 0, running = true; const loop = t => { if (last) idle.push(t - last); last = t; if (running) requestAnimationFrame(loop); }; requestAnimationFrame(loop); await sleep(3000); running = false; }
  runs.push({ label: 'không thao tác 3s', frames: idle.length, maxFrameMs: Math.round(Math.max(...idle)), slowFrames: idle.filter(d => d > 34).length, jankMs: Math.round(idle.filter(d => d > 34).reduce((s, d) => s + d - 16.7, 0)) });
  const rows = document.querySelectorAll('.delivery-row').length;
  out.textContent = JSON.stringify({ done: true, rows, worstFrameMs: Math.max(...runs.map(run => run.maxFrameMs)), totalSlowFrames: runs.reduce((sum, run) => sum + run.slowFrames, 0), runs });
} catch (error) {
  out.textContent = JSON.stringify({ done: true, error: error.stack });
}
