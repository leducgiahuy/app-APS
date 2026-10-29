// Ma trận Trang & mục áp lên toàn bộ web: menu trái, tab, tab con ẩn / hiện theo vai trò và đổi ngay khi ma trận đổi.
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { normalizePageAccess } from '../src/utils/pageAccess';
import { notifyPageAccessChanged } from '../src/context/PageAccessContext';
import '../src/index.css';

localStorage.setItem('aps-authenticated', 'demo@aps.vn');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const employees = [{ id: 'e1', name: 'Duy', code: 'NV-001', team: 'KT', standardHours: 8 }];
const ganttItems = [{ id: 't1', projectId: 'proj-1', code: 'A1', title: 'Thiết kế', startDate: day(-2), endDate: day(5), estimatedHoursPerDay: 8, status: 'not_started', assignees: [{ employeeId: 'e1', employeeName: 'Duy', startDate: day(-2), endDate: day(5), estimatedHoursPerDay: 8 }] }];
const db = { projects: [{ id: 'proj-1', name: 'DỰ ÁN THỬ', startDate: day(-30), endDate: day(90) }], employees, ganttItems };
let role = 'employee';
let saved = {};
const viewer = () => ({ email: 'demo@aps.vn', name: 'Người dùng', role, employeeId: 'e1' });
window.fetch = async url => {
  const endpoint = String(url).split('/api/')[1]?.split('?')[0] || '';
  let result = {};
  if (endpoint === 'delivery/session') result = { token: 'mock', expiresAt: Date.now() + 1e8, user: viewer() };
  else if (endpoint === 'delivery/page-access') result = { role, access: normalizePageAccess(saved) };
  else if (endpoint === 'employees') result = db.employees;
  else if (endpoint === 'projects') result = db.projects;
  else if (endpoint === 'gantt') result = db.ganttItems;
  else if (endpoint === 'tasks') result = { tasks: [], overtimes: [] };
  else if (endpoint === 'delivery/notifications') result = { revision: 0, notifications: [] };
  else if (endpoint.startsWith('delivery/')) return { ok: false, status: 404, json: async () => ({ message: 'không dùng trong bài này' }) };
  return { ok: true, status: 200, json: async () => ({ success: true, data: structuredClone(result) }) };
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (fn, name) => { for (let i = 0; i < 100; i++) { if (fn()) return; await sleep(50); } throw new Error(`Hết thời gian chờ: ${name}`); };
const out = document.getElementById('test-results');
const checks = [];
const menu = () => [...document.querySelectorAll('aside button[aria-label]')].map(node => node.getAttribute('aria-label'));
const workTabs = () => [...document.querySelectorAll('.work-hub-tabs button')].map(node => node.textContent.trim());
const change = async (nextRole, nextSaved) => { role = nextRole; saved = nextSaved; notifyPageAccessChanged(); await sleep(150); };
const check = async (fn, name) => { await waitFor(fn, name); checks.push(name); };

try {
  createRoot(document.getElementById('root')).render(<App />);
  await check(() => menu().includes('Công việc') && !menu().includes('Tổng quan'), 'Nhân viên mặc định: menu không có Tổng quan');
  await check(() => JSON.stringify(menu().slice(0, 4)) === JSON.stringify(['Công việc', 'Dự án', 'Con người', 'Công ty']), 'Nhân viên mặc định: Công việc, Dự án, Con người, Công ty');
  await check(() => JSON.stringify(workTabs()) === JSON.stringify(['Việc của tôi', 'Thành Viên', 'Tiến độ', 'Quản Lý Nhân Sự']), 'Công việc có đủ 4 mục');

  await change('employee', { 'work-hub.hr': { values: { employee: '—' } } });
  await check(() => !workTabs().includes('Thành Viên') && workTabs().length === 3, 'Tắt Thành Viên: mục biến mất ngay');

  await change('employee', { 'work-hub.my-work': { values: { employee: '—' } } });
  await check(() => workTabs()[0] === 'Thành Viên' && document.querySelector('.work-hub-tabs button.active')?.textContent.trim() === 'Thành Viên', 'Tắt mục đang mở: tự chuyển sang mục đầu tiên còn được thấy');

  const hideProject = Object.fromEntries(['gantt.progress', 'gantt.legal', 'gantt.customer', 'gantt.close', 'gantt.new-project'].map(key => [key, { values: { employee: '—' } }]));
  document.querySelector('aside button[aria-label="Dự án"]').click();
  await sleep(300);
  await change('employee', hideProject);
  await check(() => !menu().includes('Dự án') && document.querySelector('.work-hub-tabs'), 'Ẩn cả trang Dự án khi đang mở: biến khỏi menu và chuyển về trang còn được thấy');

  const hideAll = Object.fromEntries(Object.keys(normalizePageAccess({})).map(key => [key, { values: { employee: '—' } }]));
  await change('employee', hideAll);
  await check(() => document.body.textContent.includes('chưa được cấp quyền xem trang nào') && menu().filter(label => label !== 'Nhật Ký Hoạt Động').length === 0, 'Ẩn hết: menu trống và có thông báo');

  await change('director', {});
  await check(() => menu().includes('Tổng quan') && menu().includes('Dự án'), 'Đổi vai trò sang Giám đốc: thấy Tổng quan ngay');

  await change('admin', hideAll);
  await check(() => ['Công việc', 'Tổng quan', 'Dự án', 'Con người', 'Công ty'].every(label => menu().includes(label)), 'Admin luôn thấy tất cả');
  out.textContent = JSON.stringify({ passed: true, checks }, null, 2);
} catch (error) {
  out.textContent = JSON.stringify({ passed: false, error: error.message, checks, menu: menu(), workTabs: workTabs() }, null, 2);
}
