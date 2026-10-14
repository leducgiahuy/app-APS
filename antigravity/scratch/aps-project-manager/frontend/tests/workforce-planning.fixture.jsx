import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '../src/context/AppContext';
import WorkloadPage from '../src/modules/workload/WorkloadPage';
import { forecastMonths } from '../src/utils/workforceForecast';
import '../src/index.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
localStorage.setItem('aps-authenticated', 'demo@aps.vn');
const months = forecastMonths(new Date());
const employee = { id: 'e', name: 'Thịnh', title: 'Kỹ sư MEP', code: 'NV-001', team: 'Ban Thiết Kế', standardHours: 8 };
let plan = { demands: [{ id: 'd', position: 'Kỹ sư MEP', projectName: 'Dự án sắp ký', startDate: months[0].start, endDate: months[0].end, hours: 1200, probability: 100 }], settings: [], recruitments: [], taskRoles: [] };
let failSave = false;
window.fetch = async (url, options = {}) => {
  const endpoint = String(url).split('/api/')[1];
  let data;
  if (endpoint === 'workforce-plan') {
    if (options.method === 'PATCH') {
      if (failSave) return { ok: false, status: 500, json: async () => ({ message: 'Lỗi lưu thử nghiệm' }) };
      const { kind, data: record, id } = JSON.parse(options.body);
      const index = plan[kind].findIndex(item => kind === 'demands' ? item.id === id : item.position === record.position);
      if (index < 0) plan[kind].push({ ...record, id: id || 'new' }); else plan[kind][index] = { ...record, id };
    }
    data = structuredClone(plan);
  } else if (endpoint === 'employees') data = [employee];
  else if (endpoint === 'tasks') data = { tasks: [], overtimes: [] };
  else if (endpoint === 'projects') data = [{ id: 'p', name: 'Dự án hiện tại' }];
  else if (endpoint === 'gantt') data = [];
  else data = {};
  return { ok: true, json: async () => ({ success: true, data }) };
};
const root = createRoot(document.getElementById('root'));
const checks = [];
const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
const wait = async predicate => {
  for (let index = 0; index < 80; index++) { if (predicate()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 50))); }
  throw new Error('Timed out waiting for UI');
};
const click = async element => { check(Boolean(element), 'control exists'); await act(async () => element.click()); };
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent === text);
const setValue = async (element, value) => act(async () => {
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const render = async key => act(async () => root.render(<AppProvider key={key}><div className="app-fixed-controls"><div className="app-content-column" style={{ display:'flex', flexDirection:'column', height:'100%' }}><header style={{ height:64, flexShrink:0, background:'#fbfaf8' }}>Quản Lý Nhân Sự · Kiểm thử riêng</header><main className="app-page-scroll" style={{ flex:1 }}><WorkloadPage /></main></div></div></AppProvider>));
try {
  await render('initial');
  await wait(() => document.querySelector('.workload-employee-info strong')?.textContent === 'Thịnh');
  check(document.querySelector('.workload-position-column')?.textContent === 'Vị trí', 'day allocation includes position column');
  await click(button('Tháng'));
  check(document.querySelector('.workload-table.month td.workload-position-column')?.textContent === 'Kỹ sư MEP', 'month shows live employee position');
  check(!document.querySelector('.workload-table.month .workload-meter'), 'month is compact like reference');
  check(document.querySelector('.workload-overload-badge')?.textContent.includes('0 nhân viên'), 'overload badge counts distinct people');
  await click(button('6 tháng tới'));
  await wait(() => document.querySelector('.forecast-heatmap'));
  check(document.querySelectorAll('.forecast-heatmap thead th').length === 8, 'six consecutive month columns plus role and gap');
  check(document.querySelector('.forecast-heatmap .forecast-load.over'), 'overload heatmap renders from demand');
  check(document.querySelectorAll('.forecast-kpis article').length === 3, 'three recruitment and spare capacity KPIs');
  check(document.querySelectorAll('.recruitment-stages span').length === 6, 'six recruitment stages');
  check(document.querySelector('.recruitment-timeline svg'), 'recruitment timeline is rendered');
  await click(button('Nhân viên'));
  check(document.querySelector('.forecast-heatmap tbody th')?.textContent.includes('Thịnh'), 'employee view switches to named people');
  check(document.querySelector('.forecast-load')?.textContent === '0%', 'unassigned pipeline is not falsely assigned to a person');
  await click(button('Vị trí'));
  await click(document.querySelector('.recruitment-stages'));
  check(document.querySelector('[role="dialog"]'), 'recruitment editor opens');
  await setValue(document.querySelector('.forecast-modal select'), 'Phỏng vấn');
  await setValue(document.querySelector('.forecast-modal textarea'), 'Thuê ngoài 2 tuần');
  await click(document.querySelector('.forecast-modal button[type="submit"]'));
  await wait(() => !document.querySelector('[role="dialog"]'));
  check(plan.recruitments[0].status === 'Phỏng vấn' && plan.recruitments[0].openedAt, 'stage and posting date persist');
  check(document.querySelector('.recruitment-table')?.textContent.includes('Thuê ngoài 2 tuần'), 'temporary plan appears in table');
  await click(button('+ Thêm nhu cầu'));
  await setValue(document.querySelector('.forecast-modal input[list]'), 'Kỹ sư kết cấu');
  const inputs = [...document.querySelectorAll('.forecast-modal input')];
  await setValue(inputs.find(input => input.type === 'text' && !input.hasAttribute('list')), 'Dự án mới');
  await setValue(inputs.find(input => input.type === 'number'), '300');
  failSave = true;
  await click(document.querySelector('.forecast-modal button[type="submit"]'));
  await wait(() => document.querySelector('.forecast-modal [role="alert"]'));
  check(document.querySelector('.forecast-modal input[list]').value === 'Kỹ sư kết cấu', 'failed save retains draft and exposes server error');
  failSave = false;
  await click(document.querySelector('.forecast-modal button[type="submit"]'));
  await wait(() => !document.querySelector('[role="dialog"]'));
  check(document.querySelector('.forecast-demand-table').textContent.includes('Dự án mới'), 'new pipeline demand appears after save');
  await render('reopened');
  await click(button('6 tháng tới'));
  await wait(() => document.querySelector('.forecast-demand-table'));
  check(document.querySelector('.forecast-demand-table').textContent.includes('Dự án mới'), 'saved demand is reloaded after reopening page');
  const main = document.querySelector('main');
  const toolbar = document.querySelector('.workload-toolbar');
  const before = toolbar.getBoundingClientRect().top;
  main.scrollTop = 500;
  await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
  check(Math.abs(toolbar.getBoundingClientRect().top - before) < 1, 'toolbar remains fixed while forecast scrolls');
  check(document.documentElement.scrollWidth <= window.innerWidth, 'wide tables scroll inside cards without page overflow');
  main.scrollTop = 0;
  document.getElementById('test-results').textContent = JSON.stringify({ passed: checks.length, checks });
} catch (error) { document.getElementById('test-results').textContent = JSON.stringify({ failed: error.message, checks }); throw error; }
