import { DEFAULT_PROCEDURES } from '../../../frontend/src/utils/deliveryResources.js';
import { hoursAnomalies, monthlyReviewSample } from './operationsAnomalies.js';
import { cashflowReport } from './operationsCashflow.js';
import { computeDelivery, projectDeliveryItems } from '../../../frontend/src/utils/deliveryMetrics.js';
import { ownsDeliveryTask } from '../../../frontend/src/utils/deliveryView.js';
import { BUDGET_GROUPS, companyAdmin, moneyRole, matrixAllows } from '../../../frontend/src/utils/operationsDefaults.js';
import { operations, projectActor } from './operationsStore.js';
import { projectTemplates } from './defaultProjectTemplate.js';
export const vietnamDay = (date=new Date()) => new Date(date.getTime()+7*3600000).toISOString().slice(0,10);
export const addDate = (key,days) => new Date(Date.parse(`${key}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);
export function monday(key=vietnamDay()) { const d=new Date(`${key}T12:00:00Z`);return addDate(key,-((d.getUTCDay()+6)%7)); }
export const sumBy = (rows,key) => rows.reduce((sum,row)=>sum+(Number(row[key]) || 0),0);
export function allSheets(db) {
 return (db.projects || []).flatMap(project=>computeDelivery(db,project.id,db.delivery?.projects?.[project.id] || {}).timesheets.map(row=>({...row,projectId:project.id,projectName:project.name})));
}
export function attendanceHours(db,employeeId,date) {
 const imported=(db.operations?.attendance || []).filter(row=>!row.deletedAt && row.employeeId===employeeId && row.date===date);
 if(imported.length)return sumBy(imported,'hours');
 const employee=db.employees?.find(row=>row.id===employeeId);
 if(employee?.isOnSite && employee.checkInAt && vietnamDay(new Date(employee.checkInAt))===date) return Math.max(0,(Date.now()-Date.parse(employee.checkInAt))/3600000-(Number(employee.breakMinutes)||0)/60);
 return null;
}
export function sheetFlags(db,entry,all=allSheets(db)) {
 const item=projectDeliveryItems(db,entry.projectId).find(row=>row.id===entry.taskId);
 const user={employeeId:entry.employeeId};
 const flags=[];
 if(!item || !ownsDeliveryTask(user,item))flags.push('Không được giao việc');
 const daily=all.filter(row=>row.employeeId===entry.employeeId && row.date===entry.date && ['submitted','pending','approved'].includes(row.status));
 const present=attendanceHours(db,entry.employeeId,entry.date);
 if(present==null)flags.push('Chưa có dữ liệu chấm công');
 else if(sumBy(daily,'hours')>present+.01)flags.push(`Khai vượt giờ có mặt ${Math.round((sumBy(daily,'hours')-present)*100)/100}h`);
 if(entry.shiftType==='overtime') {
  const linked=db.tasks?.find(row=>row.ganttId===entry.taskId);
  const slips=(db.overtimes || []).filter(row=>row.status==='approved' && row.employeeId===entry.employeeId && row.date===entry.date && [entry.taskId,linked?.id].includes(row.taskId));
  if(sumBy(daily.filter(row=>row.taskId===entry.taskId && row.shiftType==='overtime'),'hours')>sumBy(slips,'hours'))flags.push('Giờ làm thêm chưa có phiếu đủ giờ');
 }
 if(sumBy(daily,'hours')>24)flags.push('Tổng giờ vượt 24h/ngày');
 return flags;
}
export function canReviewSheet(db,actor,entry) {
 if(!actor || actor.employeeId===entry.employeeId || actor.email===entry.createdBy)return false;
 if(companyAdmin(actor.role))return true;
 const target=(db.operations?.members || []).find(row=>row.projectId===entry.projectId && row.employeeId===entry.employeeId && !row.deletedAt) || db.delivery?.users?.find(row=>row.employeeId===entry.employeeId && !row.disabled);
 const targetRole=target?.role || 'employee';
 if(actor.role==='manager')return targetRole==='leader';
 const team=db.employees?.find(row=>row.id===actor.employeeId)?.team;
 return actor.role==='leader' && targetRole==='employee' && team && db.employees?.find(row=>row.id===entry.employeeId)?.team===team;
}
export function financeReport(db,projectId,actor) {
 const ops=operations(db),data=db.delivery?.projects?.[projectId] || {},metrics=computeDelivery(db,projectId,data);
 const budget=ops.budgets.filter(row=>row.projectId===projectId && !row.deletedAt && row.status==='approved').at(-1);
 const requests=ops.expenseRequests.filter(row=>row.projectId===projectId && !row.deletedAt && row.status!=='rejected');
 const full=moneyRole(actor.role) && matrixAllows(ops.matrix,'hdValue',actor.role), leader=actor.role==='leader';
 const groups=BUDGET_GROUPS.map((name,index)=>{
  const group=index+1,line=budget?.lines.find(row=>row.group===group);
  const expenses=(data.expenses || []).filter(row=>row.status==='approved' && Number(row.group || 2)===group);
  const actual=group===1 ? metrics.summary.laborCost : sumBy(expenses,'amount');
  const committed=requests.filter(row=>row.group===group && row.committedAt && row.status!=='settled').reduce((sum,row)=>sum+Math.max(0,Number(row.amount||0)-Number(row.paidAmount||0)),0);
  const planned=line?.amount ?? null;
  const used=planned>0 && actual!=null ? (actual+committed)/planned*100 : null;
  const result={group,name,budget:planned,actual,committed,remaining:planned==null || actual==null ? null : planned-actual-committed,used,warning:used!=null && used>=ops.params.budgetWarning};
  if(leader && group===1)return {...result,budget:line?.hours ?? null,actual:metrics.summary.totalActual*8,committed:0,remaining:line?.hours==null?null:line.hours-metrics.summary.totalActual*8,used:line?.hours>0?metrics.summary.totalActual*8/line.hours*100:null,unit:'giờ'};
  return {...result,unit:'đ'};
 }).filter(row=>(full || leader && row.group<=6)&&matrixAllows(ops.matrix,row.group===1?'budgetLabor':row.group<=6?'budgetDirect':row.group<=8?'budgetFees':'budgetOverhead',actor.role));
 const totalBudget=budget ? sumBy(budget.lines,'amount') : null;
 const laborBudget=budget?.lines.find(row=>row.group===1)?.amount;
 const forecastCost=totalBudget!=null && metrics.summary.efficiency>0 && laborBudget!=null ? totalBudget-laborBudget+laborBudget/metrics.summary.efficiency : null;
 const fee=data.settings?.contractFee ?? null;
 return {groups,budgetVersion:budget?.version ?? null,budgetStatus:budget?.status || 'Chưa có ngân sách được duyệt',hours:metrics.summary.totalActual*8,
  ...(full?{fee,totalBudget,totalActual:metrics.summary.cost,forecastCost,plannedMargin:fee==null||totalBudget==null?null:fee-totalBudget,forecastMargin:fee==null||forecastCost==null?null:fee-forecastCost,marginPercent:fee>0&&forecastCost!=null?(fee-forecastCost)/fee*100:null,collected:metrics.summary.collected,eligiblePayment:metrics.summary.eligiblePayment}:{}),
  milestones:metrics.milestones.map(row=>{ const clean={...row};if(!full)delete clean.amount;return clean; }),
  budgets:ops.budgets.filter(row=>row.projectId===projectId && !row.deletedAt && (full||leader)).map(row=>leader?{id:row.id,version:row.version,status:row.status,createdBy:row.createdBy,updatedAt:row.updatedAt}:row),
  requests:ops.expenseRequests.filter(row=>row.projectId===projectId && !row.deletedAt && (full || leader && row.group>=2 && row.group<=6 || actor.role==='employee' && row.createdBy===actor.email)),
  payments:ops.paymentRequests.filter(row=>row.projectId===projectId && !row.deletedAt).map(row=>full?row:{id:row.id,milestoneId:row.milestoneId,status:row.status}),
  receipts:full?data.receipts || []:[],
 };
}
export function operationsReport(db,user,query={}) {
 const ops=operations(db),projectId=query.projectId || '',actor=projectActor(db,user,projectId);
 if(!actor)throw Object.assign(new Error('Bạn không có vai trò trên dự án này.'),{status:403});
 const week=monday(query.week || vietnamDay()),end=addDate(week,6),all=allSheets(db);
 const projects=(db.projects || []).filter(row=>projectActor(db,user,row.id)).map(row=>({id:row.id,name:row.name,code:row.code,manager:row.manager,status:row.status,role:projectActor(db,user,row.id).role}));
 const visibleEntries=all.filter(row=>{ const a=projectActor(db,user,row.projectId);if(!a)return false;if(companyAdmin(a.role)||['manager','accountant','chiefAccountant'].includes(a.role))return true;if(row.employeeId===a.employeeId)return true;return a.role==='leader' && canReviewSheet(db,a,row); });
 const finance=projectId && actor ? financeReport(db,projectId,actor):null;
 const financial=moneyRole(actor.role) && matrixAllows(ops.matrix,'hdValue',actor.role),companyFinance=['accountant','chiefAccountant','director','admin'].includes(user.role);
 const params={...ops.params};if(!financial||!matrixAllows(ops.matrix,'rateCard',actor.role))delete params.rateCard;
 const tasks=projects.flatMap(project=>{const metrics=computeDelivery(db,project.id,db.delivery?.projects?.[project.id]||{});return projectDeliveryItems(db,project.id).map(item=>({id:item.id,projectId:project.id,projectName:project.name,code:item.code,title:item.title,startDate:item.startDate,endDate:item.endDate,assignees:metrics.taskMetrics[item.id]?.assignments || [],requiredPosition:item.requiredPosition,role:project.role}));}).filter(item=>item.role!=='employee' || ownsDeliveryTask(projectActor(db,user,item.projectId),item));
 const visibleRecord=row=>{const a=projectActor(db,user,row.projectId);return a&&(row.employeeId===a.employeeId || companyAdmin(a.role)||['manager','accountant','chiefAccountant'].includes(a.role)||a.role==='leader'&&canReviewSheet(db,a,row));};
 const reviewMonth=week.slice(0,7);
 return {revision:ops.revision,viewer:{email:actor.email,name:actor.name,role:actor.role,employeeId:actor.employeeId},companyRole:user.role,projectId,projects,week,end,tasks,
  employees:(db.employees || []).map(({id,name,code,title,team,grade})=>({id,name,code,title,team,grade})),
  users:companyAdmin(user.role)?(db.delivery?.users || []).map(({email,name,role,employeeId,disabled})=>({email,name,role,employeeId,disabled})):[],
  entries:visibleEntries.filter(row=>row.date>=week && row.date<=end).map(row=>({...row,flags:sheetFlags(db,row,all),canReview:canReviewSheet(db,projectActor(db,user,row.projectId),row)})),
  attendance:ops.attendance.filter(row=>!row.deletedAt && row.date>=week && row.date<=end && (visibleEntries.some(entry=>entry.employeeId===row.employeeId) || row.employeeId===user.employeeId || companyFinance)),
  otRequests:ops.otRequests.filter(row=>!row.deletedAt && visibleRecord(row)),
  unlocks:ops.unlocks.filter(row=>!row.deletedAt && visibleRecord(row)),checks:ops.checks.filter(row=>actor.role!=='employee'&&projects.some(p=>p.id===row.projectId)),
  randomSample:actor.role==='employee'?[]:monthlyReviewSample(visibleEntries,reviewMonth,ops.params.randomChecks),
  anomalies:matrixAllows(ops.matrix,'anomalies',actor.role)?hoursAnomalies(db,visibleEntries,reviewMonth):{},
  matrix:ops.matrix,params,procedures:(ops.procedures||DEFAULT_PROCEDURES).map(row=>financial?row:Object.fromEntries(Object.entries(row).filter(([key])=>key!=='fee'))),accounts:['manager','director','admin'].includes(user.role)?(db.delivery?.users||[]).filter(u=>!u.disabled).map(({email,name,role,employeeId})=>({email,name,role,employeeId})):[],templates:projectTemplates(db).map(t=>({...(companyAdmin(user.role)?t:{}),id:t.id,name:t.name,count:t.items.length,scopeOptions:t.scopeOptions||[]})),projectApprovals:(ops.projectApprovals||[]).filter(row=>projects.some(p=>p.id===row.projectId)),members:ops.members.filter(row=>!row.deletedAt && projects.some(p=>p.id===row.projectId) && (!projectId || row.projectId===projectId)),finance,
  ...(companyFinance&&matrixAllows(ops.matrix,'cashCompany',user.role)?{legacyExecutive:db.delivery?.executive||null,cashForecasts:ops.cashForecasts,cashflow:cashflowReport(db,query.month||vietnamDay().slice(0,7))}:{}),
  ...(financial&&matrixAllows(ops.matrix,'receivables',actor.role)?{receivables:[...(db.delivery?.executive?.receivables||[]).filter(row=>projects.some(p=>p.id===row.projectId&&moneyRole(p.role))&&(!projectId||row.projectId===projectId)).map(row=>({...row,source:'legacy',projectName:db.projects.find(p=>p.id===row.projectId)?.name,received:Number(row.paidAmount||0),remaining:Math.max(0,Number(row.amount)-Number(row.paidAmount||0)),age:Math.floor((Date.parse(vietnamDay())-Date.parse(row.dueDate))/86400000)})),...ops.paymentRequests.filter(row=>row.status==='sent' && projects.some(p=>p.id===row.projectId && moneyRole(p.role)) && (actor.role!=='manager'||!projectId||row.projectId===projectId)).map(row=>{const receipts=db.delivery?.projects?.[row.projectId]?.receipts||[];const received=sumBy(receipts.filter(receipt=>receipt.paymentRequestId===row.id),'amount');return {...row,projectName:db.projects.find(p=>p.id===row.projectId)?.name,received,remaining:Math.max(0,row.amount-received),age:Math.floor((Date.parse(vietnamDay())-Date.parse(row.dueDate))/86400000)};})]}:{}),
  integrationMappings:companyFinance?{projects:(db.projects||[]).map(({id,code,name})=>({id,code,name})),employees:(db.employees||[]).map(({id,code,name})=>({id,code,name})),payments:ops.paymentRequests.map(({id,code,projectId})=>({id,code,projectId})),expenses:ops.expenseRequests.map(({id,code,projectId})=>({id,code,projectId}))}:null,syncEvents:companyFinance?ops.syncEvents:[],notifications:ops.notifications.filter(row=>row.email===user.email || companyAdmin(user.role)),
  policyReads:ops.policyReads.filter(row=>row.email===user.email || companyAdmin(user.role)),companyImports:ops.companyImports,
  audit:companyAdmin(user.role)?ops.audit.slice(-150).reverse():[],
 };
}
