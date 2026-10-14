import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '../src/context/AppContext';
import GanttPage from '../src/modules/gantt/GanttPage';
import { computeDelivery } from '../src/utils/deliveryMetrics';
import { deliveryView, maskDeliveryFinance } from '../src/utils/deliveryView';
import '../src/index.css';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
localStorage.setItem('aps-authenticated','demo@aps.vn');
const role = new URLSearchParams(location.search).get('role') || 'employee';
const viewer={email:`${role}@aps.vn`,name:role==='employee'?'Duy – Kiến trúc sư':role==='leader'?'Yến – Leader':'Khoa – Quản lý dự án',role,employeeId:role==='employee'?'e':role==='leader'?'l':'m'};
const db={projects:[{id:'p',name:'NHÀ MÁY BETRAMEX – CÀNG LONG',startDate:'2026-10-01',endDate:'2027-06-07'}],employees:[{id:'e',name:'Duy',team:'Thiết kế'},{id:'l',name:'Yến',team:'Thiết kế'},{id:'x',name:'Lan',team:'Pháp lý'}],tasks:[],ganttItems:[{id:'g',projectId:'p',isGroup:true,title:'A. THIẾT KẾ XÂY DỰNG',startDate:'2026-10-01',endDate:'2026-10-31'},...['e','l','x'].map((employeeId,index)=>({id:`t${index}`,projectId:'p',parentGroupId:'g',code:`A1.${index+1}`,title:['Lập báo cáo nghiên cứu khả thi','Kiểm tra chéo hồ sơ','Công việc khác'][index],startDate:'2026-10-12',endDate:'2026-10-14',days:3,dependencies:[],assignees:[{employeeId,employeeName:dbName(employeeId),estimatedHoursPerDay:8}]}))]};
function dbName(id){return {e:'Duy',l:'Yến',x:'Lan'}[id];}
const saved={revision:0,settings:{contractFee:3200000000,hourlyRate:350000},records:{t0:{level:60,evidenceId:'f',confirmedBy:'leader@aps.vn',submittedBy:'employee@aps.vn',dueAt:'2026-10-13T17:00:00+07:00'}},timesheets:[{id:'ts',employeeId:'e',employeeName:'Duy',taskId:'t0',date:'2026-10-12',hours:8,status:'approved'}],evidence:[{id:'f',name:'Email gửi CĐT',taskId:'t0',kind:'handover'}],documents:[],changes:[],closes:[],history:[{at:'2026-09-30T08:00:00Z',output:0,completion:0}],receipts:[],expenses:[],comments:[],milestones:[]};
const data=()=>{const snapshot={...saved,...computeDelivery(db,'p',saved),viewer,permissions:{...deliveryView(role),users:false}};return deliveryView(role).financial?snapshot:maskDeliveryFinance(snapshot);};
window.fetch=async(url,options={})=>{const endpoint=String(url).split('/api/')[1];let result={};if(endpoint==='delivery/session')result={token:'mock',expiresAt:Date.now()+1e8};else if((endpoint==='delivery/p'||endpoint==='delivery/proj-1')){if(options.method==='PATCH'){const body=JSON.parse(options.body);if(body.action==='task'){saved.records[body.taskId]={...saved.records[body.taskId],...body.value};saved.revision++;}}result=data();}else if(endpoint==='delivery/templates')result=[];else if(endpoint==='projects')result=db.projects;else if(endpoint==='employees')result=db.employees;else if(endpoint==='tasks')result={tasks:[],overtimes:[]};else if(endpoint==='gantt')result=db.ganttItems;return {ok:true,status:200,json:async()=>({success:true,data:structuredClone(result)})};};
const checks=[],root=createRoot(document.getElementById('root'));
const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await act(async()=>new Promise(resolve=>setTimeout(resolve,40)));}throw new Error('Timed out');};
const click=async element=>{check(Boolean(element),'control exists');await act(async()=>element.click());};
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const change=async(element,next)=>act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(element,next);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});
try{
 await act(async()=>root.render(<AppProvider><GanttPage/></AppProvider>));await wait(()=>document.querySelector('.delivery-row:not(.project):not(.group) .delivery-status').textContent.includes('60%'));
 const mine=[...document.querySelectorAll('label')].find(node=>node.textContent.includes('Chỉ việc của tôi')).querySelector('input');
 if(role==='employee'){
  await wait(()=>mine.checked);check(!document.querySelector('.delivery-band-label.money'),'employee has no financial chart');
  check(!document.querySelector('.delivery-kpis').textContent.includes('Sản lượng') && document.querySelector('.delivery-kpis').textContent.includes('Tăng trong tháng'),'employee has own operational KPIs');
  check(document.querySelectorAll('.delivery-row:not(.project):not(.group)').length===1,'employee defaults to assigned task only');
  check(getComputedStyle(button('+ Dự Án Mới')).display==='none' && !document.querySelector('.delivery-task-code button'),'employee has no creation controls');
  await click(document.querySelector('.delivery-row:not(.project):not(.group)'));await wait(()=>document.querySelector('.delivery-drawer'));
  const level=[...document.querySelectorAll('.delivery-drawer label')].find(node=>node.textContent.startsWith('Mức trạng thái')).querySelector('select');
  check(!level.disabled,'employee can update own status');check(!document.querySelector('.delivery-cost-note'),'employee drawer hides labor money');check(document.querySelector('.delivery-drawer').textContent.includes('70')===false,'no unrelated costs injected');
  check(!button('✓ Xác nhận mức đã lưu') && !button('Phân công'),'employee has no leader confirmation or assignment controls');
  await change(level,'40');await click(button('Lưu thông tin'));await wait(()=>saved.records.t0.level===40);check(saved.records.t0.level===40,'employee status saves');
  await click(document.querySelector('[aria-label="Đóng chi tiết"]'));await click(mine);
  await click([...document.querySelectorAll('.delivery-row:not(.group):not(.project)')].find(row=>row.textContent.includes('Công việc khác')));
  check([...document.querySelectorAll('.delivery-drawer label')].find(node=>node.textContent.startsWith('Mức trạng thái')).querySelector('select').disabled,'employee cannot edit another employee task');
  await click(document.querySelector('[aria-label="Đóng chi tiết"]'));await click(mine);
 }else{
  check(!mine.checked,'manager and leader do not default to own-only');
  check(Boolean(document.querySelector('.delivery-band-label.money'))===(role==='manager'),'financial chart follows role');
  await click(document.querySelector('.delivery-row:not(.group):not(.project)'));await wait(()=>document.querySelector('.delivery-drawer'));
  check(Boolean(document.querySelector('.delivery-cost-note'))===(role==='manager'),'drawer labor cost follows role');
  check(Boolean(button('✓ Xác nhận mức đã lưu')),'manager or same-team leader can confirm other person task');
  if(role==='leader'){await click(document.querySelector('[aria-label="Đóng chi tiết"]'));await click([...document.querySelectorAll('.delivery-row:not(.group):not(.project)')].find(row=>row.textContent.includes('Công việc khác')));check([...document.querySelectorAll('.delivery-drawer label')].find(node=>node.textContent.startsWith('Mức trạng thái')).querySelector('select').disabled,'leader cannot edit another department');}
 }
 document.getElementById('test-results').textContent=JSON.stringify({passed:true,count:checks.length,role,checks});
}catch(error){document.getElementById('test-results').textContent=JSON.stringify({passed:false,count:checks.length,error:error.message,stack:error.stack});}
