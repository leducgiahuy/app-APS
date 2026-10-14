import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { buildExecutiveReport } from '../../backend/src/utils/executiveReport';
import { computeDelivery } from '../src/utils/deliveryMetrics';
import '../src/index.css';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
localStorage.setItem('aps-authenticated', 'demo@aps.vn');
localStorage.setItem('aps_theme', new URLSearchParams(location.search).has('dark') ? 'dark' : 'light');
const now = new Date(), month = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 7);
const user = { email: 'demo@aps.vn', name: 'Nguyễn Minh Anh', role: 'admin' };
const db = { employees: [{ id: 'e', name: 'Duy', title: 'Kiến trúc sư', team: 'Thiết kế' }], tasks: [], overtimes: [], projects: [{ id: 'p', name: 'Nhà máy Betaramex – Càng Long', manager: user.email, startDate: `${month}-01`, endDate: '2027-06-07' }, { id: 'q', name: 'KCN Tân Uyên – Nhà xưởng B', manager: 'Quản lý B', startDate: `${month}-01`, endDate: '2027-04-30' }], ganttItems: [{ id: 'g', isGroup: true, projectId: 'p', title: 'A. Thiết kế', startDate: `${month}-01`, endDate: `${month}-28` }, ...['a','b'].map((id,index) => ({ id, projectId: 'p', parentGroupId: 'g', code: `A1.${index+1}`, title: index ? 'Kiểm tra nội bộ' : 'Lập báo cáo nghiên cứu khả thi', startDate: `${month}-01`, endDate: `${month}-02`, days: 2, dependencies: [], assignees: [{ employeeId: 'e', employeeName: 'Duy', estimatedHoursPerDay: 8 }] }))], delivery: { projects: { p: { revision: 0, settings: { contractFee: 3200000000, hourlyRate: 350000 }, records: { a: { level: 60, evidenceId: 'proof', confirmedBy: 'leader' }, b: { level: 40, dueAt: `${month}-01T10:00:00+07:00` } }, timesheets: [{ id: 'ts', taskId: 'a', employeeId: 'e', date: `${month}-01`, hours: 24, status: 'approved' }], documents: [], changes: [{ id: 'cr', code: 'CR-04', title: 'Thêm nhà ăn ca', amount: 42000000, decision: 'pending' }], receipts: [{ id: 'r', date: `${month}-01`, amount: 360000000 }], expenses: [], milestones: [], history: [{ at: `${month}-02T10:00:00Z`, output: 1600000000, completion: 50 }], evidence: [], comments: [], audit: [] }, q: { revision: 0, settings: { contractFee: 5600000000 }, records: {}, history: [] } }, fiscalPlans: {}, executive: { revision: 0, openingMonth: month, openingBalance: 1500000000, productivityTarget: 6800000, onTimeTarget: 95, collectionTargets: { [month]: 1160000000 }, cashPlans: [{ id:'cp', title:'Chi còn lại', month, inflow: 0, outflow: 200000000 }], receivables: [{ id:'d', projectId:'q', title:'Đợt 1', dueDate:`${month}-01`, amount:840000000, paidAmount:0 }], contracts: [{id:'c',code:'HĐTN-07',title:'Thuê phối cảnh 3D',amount:80000000,status:'pending'}] } } };
let failSave = false, clipboard = '';
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { clipboard = text; } } });
window.fetch = async (url, options = {}) => {
  const endpoint = String(url).split('/api/')[1], body = options.body ? JSON.parse(options.body) : {};
  let result = {};
  if (endpoint === 'delivery/session') result = { token: 'mock', expiresAt: Date.now()+1e8 };
  else if (endpoint?.startsWith('delivery/executive')) {
    if(options.method === 'PATCH') {
      if(failSave) return { ok:false,status:500,json:async()=>({message:'Lỗi lưu thử nghiệm'}) };
      const config = db.delivery.executive;
      if(body.action === 'settings') Object.assign(config, body.value, { collectionTargets: { [body.month]: Number(body.value.collectionTarget) } });
      else if(body.action === 'contract') { const index=config.contracts.findIndex(row=>row.id===body.id);const row={...body.value,id:body.id||'new-contract'}; if(index<0)config.contracts.push(row);else config.contracts[index]=row; }
      else if(body.action === 'cashPlan') config.cashPlans.push({...body.value,id:'new-plan'});
      config.revision++;
    }
    const key = body.month || new URL(String(url)).searchParams.get('month'); result = buildExecutiveReport(db,user,key);
  } else if(endpoint === 'delivery/users') result=[user];
  else if(endpoint === 'delivery/templates') result=[];
  else if(endpoint === 'delivery/p') { const data=db.delivery.projects.p;result={...data,...computeDelivery(db,'p',data), viewer:user, permissions:{financial:true,manage:true,users:true}}; }
  else if(endpoint === 'employees') result=db.employees;
  else if(endpoint === 'tasks') result={tasks:db.tasks,overtimes:[]};
  else if(endpoint === 'projects') result=db.projects;
  else if(endpoint === 'gantt') result=db.ganttItems;
  else if(endpoint === 'workforce-plan') result={};
  return {ok:true,status:200,json:async()=>({success:true,data:structuredClone(result)})};
};
const root=createRoot(document.getElementById('root')), checks=[];
const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await act(async()=>new Promise(resolve=>setTimeout(resolve,40)));}throw new Error('Timed out');};
const click=async element=>{check(Boolean(element),'control exists');await act(async()=>element.click());};
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const value=async(element,next)=>act(async()=>{check(Boolean(element),'input exists');const proto=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,next);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});
try {
  await act(async()=>root.render(<App/>));
  await wait(()=>document.querySelector('aside'));
  await click([...document.querySelectorAll('aside button')].find(node=>node.textContent.includes('Báo Cáo')));
  await wait(()=>document.querySelectorAll('.executive-kpi').length===6);
  check(document.querySelectorAll('.executive-cash>div').length===6,'six cash months');
  await click(button('Báo cáo dự án'));
  check(document.querySelectorAll('.executive-projects tbody tr').length===2,'company projects one row each');
  check(document.querySelectorAll('.executive-projects th').length===8,'eight project columns');
  await value(document.querySelector('[aria-label="Tìm dự án"]'),'Tân Uyên');
  check(document.querySelectorAll('.executive-projects tbody tr').length===1,'search matches projects');
  await value(document.querySelector('[aria-label="Tìm dự án"]'),'');
  await click(button('Báo cáo'));check(clipboard.includes('Hiệu suất'),'report clipboard contains new metrics');
  await value(document.querySelector('[aria-label="Xem thử vai trò"]'),'employee');
  check(!button('Dashboard điều hành'),'employee preview hides executive tab');check(document.querySelectorAll('.executive-projects th').length===6,'employee preview hides financial columns');
  check(!button('Dữ liệu & mục tiêu'),'preview readonly');
  await value(document.querySelector('[aria-label="Xem thử vai trò"]'),'');
  check(!button('Dữ liệu & mục tiêu')&&!document.querySelector('.executive-data-controls'),'dashboard remains read only; financial edits live in Finance');
  await click(button('Dashboard điều hành'));check(document.querySelector('.executive-actions').textContent.includes('HĐTN-07'),'pending contracts remain in source driven actions');
  await click([...document.querySelectorAll('.executive-options input')][0]);check(document.querySelector('.executive-guide'),'calculation guide toggles');
  await click([...document.querySelectorAll('.executive-options input')][0]);
  await click([...document.querySelectorAll('.executive-options input')][1]);check(document.querySelector('.executive-it'),'IT notes toggle');
  const taskButton=[...document.querySelectorAll('.executive-actions>div')].find(row=>row.textContent.includes('A1.2'))?.querySelector('button');await click(taskButton);await wait(()=>document.querySelector('.delivery-drawer'));
  check(document.querySelector('.delivery-drawer').textContent.includes('Kiểm tra nội bộ'),'urgent action opens correct task drawer');
  await click([...document.querySelectorAll('aside button')].find(node=>node.textContent.includes('Báo Cáo')));await wait(()=>document.querySelectorAll('.executive-kpi').length===6);
  if(new URLSearchParams(location.search).has('projects'))await click(button('Báo cáo dự án'));
  document.querySelector('.app-page-scroll').scrollTop=0;
  document.getElementById('test-results').textContent=JSON.stringify({passed:checks.length,checks});
} catch(error) {document.getElementById('test-results').textContent=JSON.stringify({passed:checks.length,error:error.message,stack:error.stack});}
