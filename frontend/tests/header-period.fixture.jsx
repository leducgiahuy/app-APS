// Ô ngày trên thanh tiêu đề đổi theo kỳ của Quản Lý Nhân Sự: Ngày → ngày, Tháng → "Tháng M/YYYY", Năm → "Năm YYYY";
// mũi tên / nút "… này" / chọn năm đổi đúng kỳ của bảng; trang không còn ô chọn tháng / năm riêng.
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import '../src/index.css';

localStorage.setItem('aps-authenticated', 'demo@aps.vn');
const viewer = { email: 'demo@aps.vn', name: 'Quản trị', role: 'admin', employeeId: '' };
const employees = [{ id: 'e1', name: 'Duy', code: 'NV-001', team: 'KT', title: 'Kỹ sư', standardHours: 8 }];
window.fetch = async url => {
  const endpoint = String(url).split('/api/')[1]?.split('?')[0] || '';
  let result = {};
  if (endpoint === 'delivery/session') result = { token: 'mock', expiresAt: Date.now() + 1e8, user: viewer };
  else if (endpoint === 'delivery/page-access') result = { role: 'admin', access: {} };
  else if (endpoint === 'employees') result = employees;
  else if (endpoint === 'tasks') result = { tasks: [], overtimes: [] };
  else if (endpoint === 'projects' || endpoint === 'gantt') result = [];
  else if (endpoint === 'delivery/notifications') result = { revision: 0, notifications: [] };
  else if (endpoint === 'workforce-plan') result = { demands: [], settings: [], recruitments: [] };
  else if (endpoint.startsWith('delivery/')) return { ok: false, status: 404, json: async () => ({ message: 'không dùng' }) };
  return { ok: true, status: 200, json: async () => ({ success: true, data: structuredClone(result) }) };
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (fn, name) => { for (let i = 0; i < 100; i++) { if (fn()) return; await sleep(50); } throw new Error(`Hết thời gian chờ: ${name}`); };
const out = document.getElementById('test-results');
const checks = [];
const check = async (fn, name) => { await waitFor(fn, name); checks.push(name); };
const nav = () => document.querySelector('.aps-header-date');
const label = () => nav()?.querySelector('.relative > button')?.textContent.trim() || '';
const todayButton = () => nav().lastElementChild;
const click = node => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const periodButton = text => [...document.querySelectorAll('.workload-period-switch button')].find(node => node.textContent.trim() === text);
const dayColumns = () => document.querySelectorAll('.workload-table thead th').length - 2;
const now = new Date();
const monthLabel = date => `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`;

try {
  createRoot(document.getElementById('root')).render(<App />);
  await waitFor(() => document.querySelector('.work-hub-tabs'), 'trang Công việc');
  click([...document.querySelectorAll('.work-hub-tabs button')].find(node => node.textContent.trim() === 'Quản Lý Nhân Sự'));
  await check(() => periodButton('Tháng'), 'mở Quản Lý Nhân Sự');
  await check(() => todayButton().textContent.trim() === 'Hôm nay' && !label().startsWith('Tháng'), 'kỳ Ngày: ô tiêu đề hiện ngày + Hôm nay');

  click(periodButton('Tháng'));
  await check(() => label() === monthLabel(now) && todayButton().textContent.trim() === 'Tháng này', 'kỳ Tháng: ô tiêu đề hiện tháng hiện tại + Tháng này');
  await check(() => !document.querySelector('.workload-page input[type="month"], .workload-page input[type="number"], .workload-period-picker'), 'trang không còn ô chọn tháng / năm riêng');
  const daysIn = date => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  await check(() => dayColumns() === daysIn(now), 'bảng tháng có đúng số ngày của tháng đang chọn');
  click(nav().firstElementChild);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  await check(() => label() === monthLabel(previous) && dayColumns() === daysIn(previous), 'mũi tên ‹ lùi 1 tháng: tiêu đề và bảng cùng đổi');
  click(todayButton());
  await check(() => label() === monthLabel(now), 'Tháng này: về tháng hiện tại');

  click(periodButton('Năm'));
  await check(() => label() === `Năm ${now.getFullYear()}` && todayButton().textContent.trim() === 'Năm nay', 'kỳ Năm: ô tiêu đề hiện Năm + Năm nay');
  await check(() => dayColumns() === 12, 'bảng năm có 12 tháng');
  click(nav().children[2]);
  await check(() => label() === `Năm ${now.getFullYear() + 1}`, 'mũi tên › tiến 1 năm');
  const select = nav().querySelector('select[aria-label="Chọn năm"]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, String(now.getFullYear() - 2));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await check(() => label() === `Năm ${now.getFullYear() - 2}`, 'bấm vào chữ chọn năm trong danh sách');
  click(todayButton());
  await check(() => label() === `Năm ${now.getFullYear()}`, 'Năm nay: về năm hiện tại');

  click(periodButton('Ngày'));
  await check(() => todayButton().textContent.trim() === 'Hôm nay', 'quay lại kỳ Ngày: ô tiêu đề hiện ngày');
  click(periodButton('Tháng'));
  click(document.querySelector('aside button[aria-label="Dự án"]'));
  await check(() => todayButton().textContent.trim() === 'Tháng này' && label().startsWith('Tháng'), 'trang Dự án vẫn theo tháng như cũ');
  out.textContent = JSON.stringify({ passed: true, checks }, null, 2);
} catch (error) {
  out.textContent = JSON.stringify({ passed: false, error: error.message, checks, label: label() }, null, 2);
}
