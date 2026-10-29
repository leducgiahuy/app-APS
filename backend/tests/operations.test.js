import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { emptyOperations } from '../src/utils/operationsStore.js';
import { operationsReport, vietnamDay, monday } from '../src/utils/operationsReports.js';
import { hoursAnomalies, monthlyReviewSample } from '../src/utils/operationsAnomalies.js';
import { computeDelivery } from '../../frontend/src/utils/deliveryMetrics.js';
import { projectBlueprint } from '../src/utils/projectBlueprint.js';
import { updateOperationsJobs } from '../src/utils/operationsJobs.js';
import { monthSnapshot } from '../../frontend/src/utils/deliveryResources.js';
const isolatedDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'aps-operations-suite-')),originalDbPath=process.env.APS_DB_PATH;
process.env.APS_DB_PATH=path.join(isolatedDirectory,'db.json');
const {applyDeliveryMutation}=await import('../src/controllers/deliveryController.js');
after(()=>{if(originalDbPath===undefined)delete process.env.APS_DB_PATH;else process.env.APS_DB_PATH=originalDbPath;fs.rmSync(isolatedDirectory,{recursive:true,force:true});});

const day=vietnamDay(),week=monday(day),month=day.slice(0,7);
function fixture(){
 const data=()=>({revision:0,settings:{contractFee:100000000,hourlyRate:100000},records:{},timesheets:[],documents:[],changes:[],closes:[],receipts:[],expenses:[],milestones:[],evidence:[],comments:[],audit:[],history:[]});
 return {projects:[{id:'p',name:'Dự án thật',startDate:week,endDate:day},{id:'q',name:'Riêng'}],employees:['e','l','m'].map(id=>({id,name:id,team:'KT',grade:'G1'})),tasks:[],overtimes:[],ganttItems:[{id:'t',projectId:'p',title:'Thiết kế',startDate:week,endDate:day,assignees:[{employeeId:'e',estimatedHoursPerDay:8}]}],delivery:{users:[],sessions:[],projects:{p:data(),q:data()},templates:[]},operations:emptyOperations(),untouched:{text:'Giữ nguyên dữ liệu đã sửa'}};
}
test('operations field filtering, project roles and real anomaly calculations',()=>{
 const db=fixture();db.delivery.projects.p.timesheets=[{id:'a',taskId:'t',employeeId:'e',date:day,hours:8,status:'approved'}];db.operations.attendance=[{employeeId:'e',date:day,hours:7}];
 db.operations.budgets=[{id:'b',projectId:'p',status:'approved',lines:Array.from({length:9},(_,i)=>({group:i+1,amount:1000000,hours:i===0?80:0}))}];
 const employee=operationsReport(db,{email:'e@aps.vn',employeeId:'e',role:'employee'},{projectId:'p',week});
 assert.equal(employee.finance.fee,undefined);assert.deepEqual(employee.finance.groups,[]);assert.deepEqual(employee.finance.budgets,[]);assert.equal(employee.params.rateCard,undefined);assert.equal(employee.cashflow,undefined);
 const leader=operationsReport(db,{email:'l@aps.vn',employeeId:'l',role:'leader'},{projectId:'p',week});assert.equal(leader.finance.groups.length,6);assert.equal(leader.finance.groups[0].unit,'giờ');assert.equal(leader.finance.fee,undefined);assert.equal(leader.finance.budgets[0].lines,undefined);
 db.operations.members=[{projectId:'p',email:'m@aps.vn',role:'employee',employeeId:'e'}];assert.equal(operationsReport(db,{email:'m@aps.vn',role:'manager'},{projectId:'p',week}).finance.fee,undefined);assert.throws(()=>operationsReport(db,{email:'other@aps.vn',role:'manager'},{projectId:'p'}),/vai trò/);
 const anomalies=hoursAnomalies(db,[{projectId:'p',employeeId:'e',taskId:'t',date:day,hours:8,status:'approved'}],month);assert.equal(anomalies.presence.length,1);
 const sample=monthlyReviewSample(Array.from({length:20},(_,i)=>({id:`r${i}`,projectId:'p',date:day,status:'approved'})),month,2);assert.equal(sample.length,2);assert.deepEqual(sample,monthlyReviewSample(Array.from({length:20},(_,i)=>({id:`r${i}`,projectId:'p',date:day,status:'approved'})).reverse(),month,2));
});

test('template preview scales effort, auto assigns overloaded staff and never mutates existing records',()=>{
 const db=fixture();db.employees[0].title='Kiến trúc sư';db.delivery.templates=[{id:'template',baseArea:100,items:[{id:'x',code:'A1',title:'Công việc mẫu',requiredPosition:'Kiến trúc sư',startOffset:0,endOffset:1,estimatedHours:40}],milestones:[{title:'Nghiệm thu',percent:20,conditions:[{taskId:'x',op:'>=',level:60}]}]}];
 const before=structuredClone(db),plan=projectBlueprint(db,{name:'Dự án mới',templateId:'template',startDate:week,endDate:day,area:200,contractFee:100000000},{email:'manager@aps.vn'});
 assert.deepEqual(db,before);assert.equal(plan.totalHours,80);assert.equal(plan.items[0].assignees[0].employeeId,'e');assert.equal(plan.items[0].autoAssigned,true);assert.equal(plan.allocations[0].overloaded,true);assert.equal(plan.lines.length,9);assert.equal(plan.milestones[0].conditions[0].taskId,plan.items[0].id);assert.equal(computeDelivery({...db,projects:[...db.projects,plan.project],ganttItems:plan.items},plan.project.id,{}).summary.totalPlanned,10);
 assert.throws(()=>projectBlueprint(db,{name:'Sai',templateId:'template',startDate:week,endDate:week},{email:'m'}),/ngắn hơn/);
});

test('auto assignment compares only workload overlapping the new task window',()=>{
 const db=fixture();db.employees=[{id:'a',name:'A',title:'Kiến trúc sư'},{id:'b',name:'B',title:'Kiến trúc sư'}];db.ganttItems=[{id:'long',startDate:'2026-01-01',endDate:'2026-12-31',assignees:[{employeeId:'a',estimatedHoursPerDay:1}]},{id:'short',startDate:'2026-10-12',endDate:'2026-10-13',assignees:[{employeeId:'b',estimatedHoursPerDay:8}]}];db.delivery.templates=[{id:'template',items:[{id:'x',title:'Việc mới',requiredPosition:'Kiến trúc sư',startOffset:0,endOffset:1,estimatedHours:16}]}];
 const plan=projectBlueprint(db,{name:'Dự án mới',templateId:'template',startDate:'2026-10-12',endDate:'2026-10-13'},{email:'manager@aps.vn'});
 assert.equal(plan.allocations[0].employeeId,'a');
});

test('signed paid CR creates additional work and fee while preserving original tasks and closed months; withdrawal removes recognition',()=>{
 const db=fixture(),data=db.delivery.projects.p,actor={email:'director@aps.vn',role:'director'};db.projects[0].endDate='2027-09-30';data.changes=[{id:'cr',code:'CR-01',taskId:'t',title:'Bổ sung',decision:'paid',createdBy:'manager@aps.vn'}];data.closes=[{id:'closed',month:'2026-09',status:'closed',output:123,cumulative:123,completion:10,fee:100000000}];const original=structuredClone(db.ganttItems[0]),locked=structuredClone(data.closes);
 applyDeliveryMutation({db,data,user:actor,projectId:'p'},{action:'changeAppendix',id:'cr',value:{appendix:'PL-01',signedDate:day,startDate:week,endDate:day,employeeId:'e',amount:20000000,estimatedHours:16}});
 assert.equal(data.settings.contractFee,120000000);assert.deepEqual(db.ganttItems[0],original);assert.deepEqual(data.closes,locked);assert.equal(db.ganttItems.length,2);assert.equal(computeDelivery(db,'p',data).taskMetrics[data.changes[0].appendixTaskId].planned,2);assert.equal(monthSnapshot(data,'2026-09',computeDelivery(db,'p',data)).output,123);
 data.records.t={level:60,evidenceId:'proof',confirmedBy:'leader'};data.evidence=[{id:'proof',taskId:'t',kind:'handover'}];assert.equal(computeDelivery(db,'p',data).taskMetrics.t.recognized,60);applyDeliveryMutation({db,data,user:actor,projectId:'p'},{action:'revokeEvidence',taskId:'t',id:'proof',value:{reason:'Tài liệu bị thu hồi'}});assert.equal(computeDelivery(db,'p',data).taskMetrics.t.recognized,40);assert.ok(data.evidence[0].deletedAt);
});

test('scheduled reminders deduplicate and preserve end-of-month snapshots after later edits',()=>{
 const db=fixture();db.delivery.users=[{email:'leader@aps.vn',role:'leader'}];const data=db.delivery.projects.p;data.records.t={level:40,dueAt:'2026-10-13T07:00:00Z'};data.history=[{at:'2026-09-30T16:59:00Z',fee:100000000,output:10000000,completion:10,taskMetrics:{t:{recognized:10}}}];
 assert.equal(updateOperationsJobs(db,new Date('2026-10-13T05:00:00Z')),true);assert.equal(updateOperationsJobs(db,new Date('2026-10-13T05:01:00Z')),false);assert.equal(db.operations.notifications.length,1);data.settings.contractFee=999999999;data.history.push({at:'2026-10-13T05:02:00Z',output:999999999,completion:100});assert.equal(monthSnapshot(data,'2026-09',computeDelivery(db,'p',data),new Date('2026-10-13')).cumulative,10000000);
});

test('weekly hours, role approval, budget, payment and accounting imports persist without duplicate money or data loss',async()=>{
 fs.writeFileSync(path.join(isolatedDirectory,'db.json'),JSON.stringify(fixture()));let server;
 try{
  const {default:routes}=await import('../src/routes/api.js');const app=express();app.use(express.json());app.use('/api',routes);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/delivery`;
  const call=async(endpoint,method='GET',body,token)=>{const response=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
  const admin=(await call('/session','POST',{email:'demo@aps.vn',password:'APS@2026'})).data.token,tokens={admin};
  for(const [role,employeeId] of [['employee','e'],['leader','l'],['manager','m'],['accountant',''],['chiefAccountant',''],['director','']]){assert.equal((await call('/users','POST',{email:`${role}@aps.vn`,name:role,role,employeeId,password:'password1'},admin)).status,200);tokens[role]=(await call('/session','POST',{email:`${role}@aps.vn`,password:'password1'})).data.token;}
  let revision=0;const mutate=async(action,value={},id,role='admin',projectId='p')=>{const r=await call('/operations','PATCH',{action,value,id,projectId,revision,query:{projectId,week}},tokens[role]);if(r.status===200)revision=r.data.revision;return r;};
  assert.equal((await mutate('attendanceImport',{rows:[{employeeId:'e',date:day,hours:8}]},undefined,'accountant')).status,200);
  const entry={projectId:'p',taskId:'t',date:day,hours:7.5,shiftType:'regular'};
  let r=await mutate('saveWeek',{week,entries:[entry]},undefined,'employee');assert.equal(r.status,200);let entryId=r.data.entries[0].id;
  r=await mutate('submitWeek',{week,entries:[{...entry,id:entryId}]},undefined,'employee');assert.equal(r.data.entries[0].status,'submitted');
  assert.equal((await mutate('reviewHours',{status:'approved'},entryId,'employee')).status,403);assert.equal((await mutate('saveWeek',{week,entries:[entry]},undefined,'employee')).status,400);
  assert.equal((await mutate('reviewHours',{status:'approved'},entryId,'leader')).status,200);
  assert.equal((await mutate('otRequest',{taskId:'t',date:day,hours:2,reason:'Hoàn thiện'},undefined,'employee')).status,200);r=await call(`/operations?week=${week}`,'GET',undefined,tokens.employee);const ot=r.data.otRequests[0];
  assert.equal((await mutate('otDecision',{status:'approved'},ot.id,'employee')).status,403);assert.equal((await mutate('otDecision',{status:'approved'},ot.id,'leader')).status,200);assert.equal((await mutate('otDecision',{status:'approved'},ot.id,'manager')).status,200);
  r=await mutate('budget',{lines:Array.from({length:9},(_,i)=>({amount:1000000,hours:i===0?80:0}))},undefined,'manager');assert.equal(r.status,200);const budget=r.data.finance.budgets[0];assert.equal((await mutate('budgetDecision',{status:'approved'},budget.id,'manager')).status,403);assert.equal((await mutate('budgetDecision',{status:'approved'},budget.id,'chiefAccountant')).status,200);r=await mutate('budgetDecision',{status:'approved'},budget.id,'director');assert.equal(r.data.finance.totalBudget,9000000);
  r=await mutate('milestone',{title:'Tạm ứng',amount:10000000,percent:10,completionRequired:0,conditions:[]},undefined,'manager');assert.equal(r.status,200);const milestone=r.data.finance.milestones[0];assert.equal(milestone.met,true);
  r=await mutate('paymentRequest',{milestoneId:milestone.id,dueDate:day},undefined,'manager');assert.equal(r.status,200);const payment=r.data.finance.payments[0];
  const invoice={kind:'invoice',externalId:'INV-001',projectId:'p',paymentRequestId:payment.id,invoiceNo:'000001',date:day};assert.equal((await mutate('accountingImport',{rows:[invoice]},undefined,'accountant')).status,400);
  assert.equal((await mutate('paymentDecision',{status:'approved'},payment.id,'chiefAccountant')).status,200);assert.equal((await mutate('paymentDecision',{status:'approved'},payment.id,'director')).status,200);assert.equal((await mutate('paymentDecision',{status:'approved'},payment.id,'accountant')).status,200);assert.equal((await mutate('paymentDecision',{status:'approved'},payment.id,'manager')).status,400);
  assert.equal((await mutate('accountingImport',{rows:[invoice]},undefined,'accountant')).status,200);assert.equal((await mutate('paymentDecision',{status:'approved'},payment.id,'manager')).status,200);
  const receipt={kind:'receipt',externalId:'RC-001',projectId:'p',paymentRequestId:payment.id,date:day,amount:3000000};assert.equal((await mutate('accountingImport',{rows:[receipt]},undefined,'accountant')).status,200);r=await mutate('accountingImport',{rows:[receipt]},undefined,'accountant');assert.equal(r.data.finance.collected,3000000);assert.equal(r.data.receivables[0].remaining,7000000);
  r=await mutate('milestone',{title:'Đợt bị từ chối',amount:1000000,percent:1,completionRequired:0,conditions:[]},undefined,'manager');const rejectedMilestone=r.data.finance.milestones.find(row=>row.title==='Đợt bị từ chối');
  r=await mutate('paymentRequest',{milestoneId:rejectedMilestone.id,dueDate:day},undefined,'manager');const rejectedPayment=r.data.finance.payments.find(row=>row.milestoneId===rejectedMilestone.id);
  for(const role of ['chiefAccountant','director','accountant'])assert.equal((await mutate('paymentDecision',{status:'approved'},rejectedPayment.id,role)).status,200);
  assert.equal((await mutate('accountingImport',{rows:[{kind:'invoice',externalId:'INV-REJECT',projectId:'p',paymentRequestId:rejectedPayment.id,invoiceNo:'000002',date:day}]},undefined,'accountant')).status,200);
  r=await mutate('paymentDecision',{status:'rejected',reason:'Khách hàng chưa nhận hồ sơ'},rejectedPayment.id,'manager');assert.equal(r.data.finance.payments.find(row=>row.id===rejectedPayment.id).status,'rejected');
  r=await mutate('expenseRequest',{type:'expense',group:4,title:'Công tác phí',amount:500000,dueDate:day},undefined,'manager');const expense=r.data.finance.requests.find(row=>row.title==='Công tác phí');
  for(const role of ['director','accountant','chiefAccountant'])assert.equal((await mutate('expenseDecision',{status:'approved',documentRef:'CT-01'},expense.id,role)).status,200);
  r=await mutate('accountingImport',{rows:[{kind:'disbursement',externalId:'PC-001',projectId:'p',expenseRequestId:expense.id,date:day,amount:200000}]},undefined,'accountant');let paid=r.data.finance.requests.find(row=>row.id===expense.id);assert.equal(paid.status,'partiallyPaid');assert.equal(paid.paidAmount,200000);
  r=await mutate('accountingImport',{rows:[{kind:'disbursement',externalId:'PC-002',projectId:'p',expenseRequestId:expense.id,date:day,amount:300000}]},undefined,'accountant');paid=r.data.finance.requests.find(row=>row.id===expense.id);assert.equal(paid.status,'paid');assert.equal(paid.paidAmount,500000);
  // Bảng phân quyền cũ đã xóa: không trả về, không lưu được nữa.
  assert.equal(r.data.matrix,undefined);assert.notEqual((await mutate('matrix',{rows:[]})).status,200);
  assert.equal((await call('/operations','PATCH',{action:'params',value:{limitA:1},revision:0},admin)).status,409);
  r=await mutate('template',{name:'Mẫu cấu hình',baseArea:100,items:[{id:'x',title:'Thiết kế từ mẫu',requiredPosition:'Kiến trúc sư',startOffset:0,endOffset:1,estimatedHours:16}]});assert.equal(r.status,200);const templateId=r.data.templates.find(row=>row.name==='Mẫu cấu hình').id;
  const projectInput={name:'Dự án từ khung mới',code:'NEW-01',templateId,startDate:week,endDate:day,area:200,contractFee:200000000};
  const fileBefore=fs.readFileSync(process.env.APS_DB_PATH,'utf8');assert.equal((await call('/project-preview','POST',projectInput,tokens.manager)).status,200);assert.equal(fs.readFileSync(process.env.APS_DB_PATH,'utf8'),fileBefore,'preview never writes source records');
  r=await mutate('projectCreate',projectInput,undefined,'manager',undefined);assert.equal(r.status,200);const created=r.data.createdProjectId;assert.ok(created);const approval=r.data.projectApprovals.find(row=>row.projectId===created);assert.equal((await mutate('projectDecision',{status:'approved'},approval.id,'manager',created)).status,403);assert.equal((await mutate('projectDecision',{status:'approved'},approval.id,'director',created)).status,200);
  const login=(await call('/session','POST',{email:'employee@aps.vn',password:'password1'})).data;assert.ok(login.expiresAt-Date.now()<=8*3600000);
  const saved=JSON.parse(fs.readFileSync(process.env.APS_DB_PATH));assert.deepEqual(saved.untouched,{text:'Giữ nguyên dữ liệu đã sửa'});assert.equal(saved.delivery.projects.p.receipts.length,1);assert.equal(saved.overtimes.length,1);assert.ok(saved.operations.audit.at(-2).after.length);assert.equal(computeDelivery(saved,'p',saved.delivery.projects.p).summary.totalActual,7.5/8);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));}
});
