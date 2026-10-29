import { buildWorkforceForecast,positionKey } from '../../../frontend/src/utils/workforceForecast.js';
import { updateOperationsJobs } from '../utils/operationsJobs.js';
import { projectBlueprint } from '../utils/projectBlueprint.js';
import { DEFAULT_PROJECT_TEMPLATE } from '../utils/defaultProjectTemplate.js';
import { randomUUID } from 'node:crypto';
import { readDb,writeDb } from '../models/db.js';
import { operations,projectActor,stamp } from '../utils/operationsStore.js';
import { allSheets,operationsReport,canReviewSheet,sheetFlags,vietnamDay,addDate,monday,financeReport,sumBy } from '../utils/operationsReports.js';
import { DEFAULT_PARAMS,OP_ROLES,companyAdmin,roleAllows } from '../../../frontend/src/utils/operationsDefaults.js';
import { computeDelivery,projectDeliveryItems } from '../../../frontend/src/utils/deliveryMetrics.js';
import { ownsDeliveryTask } from '../../../frontend/src/utils/deliveryView.js';
import { PAGE_ACCESS_CODES,PAGE_ACCESS_ITEMS,normalizePageAccess } from '../../../frontend/src/utils/pageAccess.js';
import { emptyDeliveryProject } from './deliveryController.js';

const ensure=(condition,message,status=400)=>{if(!condition)throw Object.assign(new Error(message),{status});};
const text=value=>typeof value==='string'?value.trim():'';
const validDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const number=(value,max=1e15)=>{ensure(value!=='' && value!=null && Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=max,'Giá trị số không hợp lệ.');return Number(value);};
const money=value=>{const n=number(value);ensure(Number.isInteger(n),'Tiền phải là số nguyên đồng.');return n;};
const self=(user,row)=>user.email===row.createdBy || Boolean(user.employeeId && row.employeeId===user.employeeId);
const requireRole=(user,roles)=>ensure(companyAdmin(user.role)||roles.includes(user.role),'Bạn không có quyền thực hiện thao tác này.',403);
const permission=(ops,actor,key)=>ensure(roleAllows(key,actor.role,'write'),'Vai trò trên dự án không được phép thực hiện chức năng này.',403);
function dataFor(db,id){db.delivery ||= {projects:{}};db.delivery.projects ||= {};db.delivery.projects[id] ||= emptyDeliveryProject();return db.delivery.projects[id];}
function recordProject(db,id){const data=dataFor(db,id);data.revision=(data.revision||0)+1;const metrics=computeDelivery(db,id,data);data.history ||= [];data.history.push({at:new Date().toISOString(),completion:metrics.summary.completion,output:metrics.summary.output,earned:metrics.summary.totalEarned,efficiency:metrics.summary.efficiency,fee:data.settings.contractFee,taskMetrics:metrics.taskMetrics});}
function flowStep(role,label){return {role,label,status:'pending'};}
function selfSafeSteps(actor,steps){return steps.map(step=>step.role===actor.role?{...step,role:actor.role==='leader'?'manager':actor.role==='manager'?'director':actor.role==='chiefAccountant'?'director':step.role}:step);}
function expenseFlow(actor,value,params,overBudget){
 let steps=[];
 if(value.type==='advance')steps=[flowStep('chiefAccountant','Xác nhận tạm ứng'),flowStep('director','Duyệt tạm ứng')];
 else if(value.type==='contract')steps=[flowStep('chiefAccountant','Xác nhận nguồn tiền'),flowStep('director','Ký hợp đồng thuê ngoài')];
 else if(value.amount>params.limitB || overBudget || value.group>=7)steps=[flowStep('accountant','Kiểm tra chứng từ'),flowStep('chiefAccountant','Xác nhận nguồn tiền'),flowStep('director','Duyệt vượt hạn mức')];
 else {
  if(value.group===4 && actor.role==='employee')steps.push(flowStep('leader','Xác nhận công tác phí'));
  steps.push(flowStep('manager','Duyệt chi trong hạn mức'));
  steps.push(flowStep('accountant','Kiểm tra chứng từ'));
  steps.push(flowStep('chiefAccountant','Duyệt chi'));
 }
 return selfSafeSteps(actor,steps);
}
function approveStep(user,row,decision,reason){
 const step=row.steps.find(step=>step.status==='pending');ensure(step,'Luồng này đã kết thúc.');
 ensure(!self(user,row),'Không được tự duyệt đề nghị do mình lập.',403);
 ensure(user.role==='admin'||step.role===user.role,'Chưa đến lượt vai trò của bạn.',403);
 ensure(decision==='approved'||decision==='rejected','Quyết định không hợp lệ.');
 if(decision==='rejected')ensure(text(reason),'Cần ghi lý do trả lại / từ chối.');
 Object.assign(step,{status:decision,by:user.email,at:new Date().toISOString(),reason:text(reason)});
 row.status=decision==='rejected'?'rejected':row.steps.some(step=>step.status==='pending')?'pending':'approved';
 Object.assign(row,stamp(user));return step;
}
export function getOperations(req,res){try{const db=readDb(),actual=req.deliveryUser;let user=actual;const previewUsers=companyAdmin(actual.role)?(db.delivery?.users||[]).filter(row=>!row.disabled).map(({email,name,role})=>({email,name,role})):[];if(req.query.asUser){ensure(companyAdmin(actual.role),'Không được xem thử tài khoản khác.',403);user=db.delivery.users.find(row=>row.email===req.query.asUser&&!row.disabled);ensure(user,'Tài khoản xem thử không tồn tại.');}return res.json({success:true,data:{...operationsReport(db,user,req.query),readOnly:Boolean(req.query.asUser&&req.query.asUser!==actual.email),previewUsers}});}catch(error){return res.status(error.status||400).json({message:error.message});}}
export function getOperationsNotifications(req,res){const ops=operations(readDb());return res.json({success:true,data:{revision:ops.revision,notifications:ops.notifications.filter(n=>n.email===req.deliveryUser.email).slice(-100).reverse()}});}
export function previewProject(req,res){try{const db=readDb(),user=req.deliveryUser;requireRole(user,['manager']);permission(operations(db),user,'newProject');return res.json({success:true,data:projectBlueprint(db,req.body,user)});}catch(error){return res.status(error.status||400).json({message:error.message});}}
export function mutateOperations(req,res){
 try {
  const db=structuredClone(readDb()),ops=operations(db),user=req.deliveryUser;
  const {action,value={},id,projectId,revision,query={}}=req.body || {};
  ensure(revision===ops.revision,'Dữ liệu vừa thay đổi. Tải lại trước khi lưu.',409);
  ensure(!query.asUser||query.asUser===user.email,'Chế độ xem thử chỉ đọc.',403);
  const actor=projectActor(db,user,projectId);ensure(actor,'Bạn không có vai trò trên dự án này.',403);
  if(projectId)ensure(db.projects.some(row=>row.id===projectId),'Dự án không tồn tại.');
  const original=structuredClone(ops),originalProjects=structuredClone(db.delivery?.projects||{});
  const at=new Date().toISOString();let before=null,changed=null;
  if(action==='policyRead'){
   const code=text(value.code),version=text(value.version);ensure(/^QD-\d{2}$/.test(code)&&version.length>0&&version.length<=30,'Quy định hoặc phiên bản không hợp lệ.');
   ops.policyReads ||= [];const old=ops.policyReads.find(row=>row.email===user.email&&row.code===code&&row.version===version);changed={id:old?.id||randomUUID(),email:user.email,code,version,readAt:at};if(old)Object.assign(old,changed);else ops.policyReads.push(changed);
  }else if(action==='companyImport'){
   requireRole(user,[]);const type=text(value.type),name=text(value.name);ensure(['personnel','quotation','calendar','policies','procedures'].includes(type)&&name&&name.length<=255,'Thông tin file nhập không hợp lệ.');
   ops.companyImports ||= [];const old=ops.companyImports.find(row=>row.type===type);changed={id:old?.id||randomUUID(),type,name,size:number(value.size||0,100000000),status:'received',...stamp(user)};if(old)Object.assign(old,changed);else ops.companyImports.push(changed);
  }else if(action==='procedures'){
   requireRole(user,[]);ensure(Array.isArray(value.rows)&&value.rows.length<=100,'Danh mục thủ tục không hợp lệ.');const keys=new Set();ops.procedures=value.rows.map(row=>{ensure(text(row.procedureKey)&&!keys.has(row.procedureKey)&&text(row.title),'Mỗi thủ tục cần khóa duy nhất và tên.');keys.add(row.procedureKey);return {procedureKey:text(row.procedureKey),title:text(row.title),authority:text(row.authority),processingTime:text(row.processingTime),taskCodes:Array.isArray(row.taskCodes)?row.taskCodes.map(text):[],...(row.fee!=null?{fee:money(row.fee)}:{})};});
  }else if(action==='recruitmentCancel'){
   requireRole(user,[]);const forecast=buildWorkforceForecast({...db,plan:db.workforcePlan||{},now:new Date()});const suggestion=forecast.cancellationSuggestions.find(r=>positionKey(r.position)===positionKey(value.position)&&r.needMonth===value.needMonth);ensure(suggestion,'Chỉ hủy đợt chưa đăng tuyển khi thiếu giảm dưới 0,5 người.');ensure(text(value.reason),'Cần lý do xác nhận hủy tuyển.');const row=db.workforcePlan.recruitments.find(r=>r===suggestion||r.position===suggestion.position&&r.needMonth===suggestion.needMonth);Object.assign(row,{canceledAt:at,canceledBy:user.email,cancelReason:text(value.reason)});
  }else if(action==='projectCreate'){
   requireRole(user,['manager']);permission(ops,user,'newProject');const plan=projectBlueprint(db,value,user);ensure(!plan.project.code||!db.projects.some(p=>p.code===plan.project.code),'Mã dự án đã tồn tại.');
   db.projects.push(plan.project);db.ganttItems.push(...plan.items);db.tasks ||= [];const parents=new Set(plan.items.map(t=>t.parentTaskId).filter(Boolean));db.tasks.push(...plan.items.filter(t=>!t.isGroup&&!parents.has(t.id)).map(t=>({...t,id:`task-${randomUUID()}`,ganttId:t.id,projectName:plan.project.name,employeeId:t.assignees[0]?.employeeId||'',employeeName:t.assignees[0]?.employeeName||'',progress:0,actualWorkHours:0,estimatedDays:t.days})));const data=dataFor(db,plan.project.id);data.settings.contractFee=plan.fee;data.milestones=plan.milestones;
   ops.budgets.push({id:randomUUID(),projectId:plan.project.id,version:1,lines:plan.lines,status:'pending',steps:[flowStep('chiefAccountant','Xác nhận ngân sách'),flowStep('director','Duyệt ngân sách')],createdBy:user.email,createdAt:at});
   ops.projectApprovals ||= [];changed={id:randomUUID(),projectId:plan.project.id,status:'pending',steps:[flowStep('director','Duyệt dự án mới')],createdBy:user.email,createdAt:at};ops.projectApprovals.push(changed);
   const emails=[...new Set([user.email,value.managerEmail,...(value.leaderEmails||[])].filter(Boolean))];for(const email of emails){const account=db.delivery.users.find(a=>a.email===email&&!a.disabled);ensure(account,'Tài khoản quản lý / Leader chưa được cấp quyền.');ops.members.push({id:randomUUID(),projectId:plan.project.id,email,employeeId:account.employeeId||'',role:email===(value.managerEmail||user.email)?'manager':email===user.email?'manager':'leader'});}
   for(const a of plan.allocations.filter(a=>a.employeeId)){const account=db.delivery.users.find(u=>u.employeeId===a.employeeId&&!u.disabled);if(account&&!ops.members.some(m=>m.email===account.email&&m.projectId===plan.project.id))ops.members.push({id:randomUUID(),projectId:plan.project.id,email:account.email,employeeId:a.employeeId,role:'employee'});}
   ops.lastCreatedProjectId=plan.project.id;
  }else if(action==='projectDecision'){
   requireRole(user,[]);const row=ops.projectApprovals?.find(r=>r.id===id);ensure(row&&row.status==='pending','Dự án không chờ duyệt.');approveStep(user,row,value.status,value.reason);const project=db.projects.find(p=>p.id===row.projectId);project.approvalStatus=row.status;if(row.status==='approved')project.status='active';
  }else if(action==='template'){
   requireRole(user,[]);ensure(text(value.name)&&Array.isArray(value.items)&&value.items.length<=1000,'Cần tên và danh sách công việc của mẫu.');const seen=new Set();const items=value.items.map(item=>{ensure(text(item.id)&&!seen.has(item.id)&&text(item.title),'Task cần ID duy nhất và tên.');seen.add(item.id);return {...item,startOffset:number(item.startOffset||0,3650),endOffset:number(item.endOffset||0,3650),estimatedHours:number(item.estimatedHours||0)};});for(const item of items)ensure(item.endOffset>=item.startOffset&&(!item.parentTaskId||seen.has(item.parentTaskId))&&(!item.parentGroupId||seen.has(item.parentGroupId)),'Lịch / nhóm cha của mẫu không hợp lệ.');
   const store=db.delivery;let old=store.templates.find(t=>t.id===id);if(id===DEFAULT_PROJECT_TEMPLATE.id&&!old){old=structuredClone(DEFAULT_PROJECT_TEMPLATE);store.templates.push(old);}ensure(!id||old,'Mẫu không tồn tại.');changed={...(old||{}),id:old?.id||randomUUID(),name:text(value.name),baseArea:number(value.baseArea||0),items,budgetPercents:value.budgetPercents||[],milestones:value.milestones||[],scopeOptions:value.scopeOptions||[],...stamp(user)};if(old)Object.assign(old,changed);else store.templates.push(changed);
  }else if(action==='pageAccess'){
   // Ma trận "Trang & mục": chỉ Giám đốc / Admin sửa; mỗi ô là X, S hoặc —.
   requireRole(user,[]);ensure(value.rows&&typeof value.rows==='object'&&!Array.isArray(value.rows),'Ma trận trang & mục không hợp lệ.');
   ensure(Object.keys(value.rows).every(key=>PAGE_ACCESS_ITEMS.some(entry=>entry.key===key)),'Có mục không thuộc web.');
   for(const row of Object.values(value.rows)){ensure(OP_ROLES.every(role=>row?.values?.[role]==null||PAGE_ACCESS_CODES.some(option=>option.code===row.values[role])),'Ô quyền chỉ nhận X, S hoặc —.');ensure(text(row?.note).length<=1000,'Ghi chú ma trận không được vượt quá 1.000 ký tự.');}
   const current=normalizePageAccess(ops.pageAccess);
   ops.pageAccess=normalizePageAccess(Object.fromEntries(Object.entries(current).map(([key,row])=>{const next=value.rows[key];return [key,next?{values:{...row.values,...next.values},note:next.note==null?row.note:text(next.note)}:row];})));
  }else if(action==='params'){
   requireRole(user,['chiefAccountant']);before=structuredClone(ops.params);
   if(companyAdmin(user.role))for(const key of Object.keys(DEFAULT_PARAMS).filter(key=>key!=='rateCard'))if(value[key]!=null)ops.params[key]=number(value[key],1e12);
   if(value.rateCard){ensure(Array.isArray(value.rateCard),'Bảng đơn giá không hợp lệ.');ops.params.rateCard=value.rateCard.map(row=>{ensure(text(row.grade),'Cần cấp bậc.');ensure(!row.effectiveFrom||validDate(row.effectiveFrom),'Ngày đơn giá không hợp lệ.');return {grade:text(row.grade),amount:money(row.amount),effectiveFrom:row.effectiveFrom||vietnamDay(),status:companyAdmin(user.role)?'approved':before.rateCard?.some(old=>old.status==='approved'&&old.grade===text(row.grade)&&old.effectiveFrom===(row.effectiveFrom||vietnamDay())&&old.amount===Number(row.amount))?'approved':'draft'};});}
   ensure(ops.params.limitB>=ops.params.limitA && ops.params.budgetWarning<=100 && ops.params.hoursUsed<=100 && ops.params.completionLow<=100 && ops.params.exactEstimate<=100,'Hạn mức / tỷ lệ không hợp lệ.');
  }else if(action==='member'){
   requireRole(user,[]);ensure(projectId && OP_ROLES.includes(value.role),'Chọn dự án và vai trò hợp lệ.');
   const account=db.delivery?.users?.find(row=>row.email===value.email && !row.disabled);ensure(account,'Tài khoản chưa được cấp quyền ứng dụng.');
   ensure(!value.employeeId||db.employees.some(row=>row.id===value.employeeId),'Nhân sự liên kết không tồn tại.');
   const old=ops.members.find(row=>row.projectId===projectId && row.email===value.email);
   changed={...(old||{}),id:old?.id||randomUUID(),projectId,email:value.email,role:value.role,employeeId:value.employeeId||account.employeeId||'',...stamp(user)};
   if(old)Object.assign(old,changed);else ops.members.push(changed);
  }else if(action==='saveWeek'||action==='submitWeek'||action==='copyWeek'){
   ensure(user.employeeId,'Tài khoản chưa liên kết nhân sự.');
   ensure(validDate(value.week),'Tuần không hợp lệ.');const week=monday(value.week),end=addDate(week,6);
   const all=allSheets(db);
   if(action==='copyWeek'){
    const previous=all.filter(row=>row.employeeId===user.employeeId&&row.source==='weekly'&&row.date>=addDate(week,-7)&&row.date<week);
    ensure(previous.length,'Không có dữ liệu tuần trước.');
    value.entries=previous.filter(row=>addDate(row.date,7)<=vietnamDay()).map(row=>({...row,id:undefined,date:addDate(row.date,7)}));
   }
   ensure(Array.isArray(value.entries),'Các dòng giờ công không hợp lệ.');
   for(const entry of value.entries){
    ensure(validDate(entry.date)&&entry.date>=week&&entry.date<=end&&entry.date<=vietnamDay(),'Ngày khai giờ phải trong tuần và không ở tương lai.');
    const a=projectActor(db,user,entry.projectId);ensure(a,'Không có vai trò tại dự án của task.',403);permission(ops,a,'tsSubmit');
    const item=projectDeliveryItems(db,entry.projectId).find(row=>row.id===entry.taskId);ensure(item&&ownsDeliveryTask(a,item),'Chỉ khai giờ vào việc được giao.');
    const hours=number(entry.hours,24);ensure(Number.isInteger(hours*2),'Giờ khai theo bước 0,5 giờ.');
    const data=dataFor(db,entry.projectId);const old=data.timesheets.find(row=>row.id===entry.id) || data.timesheets.find(row=>row.source==='weekly'&&row.employeeId===user.employeeId&&row.taskId===entry.taskId&&row.date===entry.date&&row.shiftType===(entry.shiftType||'regular'));
    ensure(!old||['draft','returned','rejected'].includes(old.status),'Dòng đã nộp / duyệt / khóa không được sửa.');
    const shiftType=entry.shiftType==='overtime'?'overtime':'regular';
    if(shiftType==='overtime'&&hours>0){const linked=db.tasks?.find(row=>row.ganttId===entry.taskId);const slips=(db.overtimes||[]).filter(row=>row.status==='approved'&&row.employeeId===user.employeeId&&row.date===entry.date&&[item.id,linked?.id].includes(row.taskId));ensure(sumBy(slips,'hours')>=hours,'Cần phiếu làm thêm đã được duyệt, đủ giờ.');}
    const updated={...(old||{}),id:old?.id||randomUUID(),taskId:entry.taskId,employeeId:user.employeeId,employeeName:db.employees.find(row=>row.id===user.employeeId)?.name,date:entry.date,hours,shiftType,source:'weekly',status:action==='submitWeek'?'submitted':'draft',createdBy:old?.createdBy||user.email,createdAt:old?.createdAt||at,...stamp(user),...(action==='submitWeek'?{submittedAt:at}:{})};
    if(old)Object.assign(old,updated);else if(hours>0)data.timesheets.push(updated);
    data.revision=(data.revision||0)+1;
   }
   if(action==='submitWeek'){
    for(const project of db.projects){const data=db.delivery?.projects?.[project.id];if(!data)continue;const a=projectActor(db,user,project.id);if(!a||!roleAllows('tsSubmit',a.role,'write'))continue;data.timesheets.filter(row=>row.source==='weekly'&&row.employeeId===user.employeeId&&row.date>=week&&row.date<=end&&row.hours>0&&['draft','returned'].includes(row.status)).forEach(row=>Object.assign(row,{status:'submitted',submittedAt:at}));}
   }
  }else if(action==='reviewHours'){
   const all=allSheets(db),entry=all.find(row=>row.id===id&&row.projectId===projectId);ensure(entry,'Dòng giờ không tồn tại.');
   ensure(canReviewSheet(db,actor,entry),'Không được tự duyệt hoặc duyệt sai cấp / nhóm.',403);
   const targetRole=(ops.members.find(row=>row.projectId===projectId&&row.employeeId===entry.employeeId)||db.delivery?.users?.find(row=>row.employeeId===entry.employeeId))?.role || 'employee';permission(ops,actor,targetRole==='leader'?'tsApproveLeader':targetRole==='manager'?'tsApproveManager':'tsApproveStaff');
   ensure(['submitted','pending'].includes(entry.status),'Dòng này không chờ duyệt.');
   ensure(['approved','returned'].includes(value.status),'Trạng thái duyệt không hợp lệ.');
   if(value.status==='returned')ensure(text(value.reason),'Cần lý do trả lại.');
   else {const flags=sheetFlags(db,entry,all);ensure(!flags.some(flag=>flag!=='Chưa có dữ liệu chấm công'),'Dòng giờ có lỗi: '+flags.join('; '));if(flags.length)ensure(text(value.reason),'Chưa có chấm công: cần ghi lý do đối chiếu trước khi duyệt.');}
   const data=dataFor(db,projectId);const existing=data.timesheets.find(row=>row.id===id);const updated={...entry,status:value.status,locked:value.status==='approved',reason:text(value.reason),approvedBy:user.email,approvedAt:at,...stamp(user)};
   if(existing)Object.assign(existing,updated);else data.timesheets.push(updated);recordProject(db,projectId);
  }else if(action==='unlockRequest'){
   requireRole(actor,['leader','manager']);ensure(text(value.reason),'Cần lý do mở khóa.');
   const entry=allSheets(db).find(row=>row.id===value.entryId&&row.projectId===projectId);ensure(entry&&entry.status==='approved','Chỉ mở khóa giờ đã duyệt.');permission(ops,actor,'unlock');ensure(actor.role!=='leader'||canReviewSheet(db,actor,entry),'Chỉ đề xuất mở khóa giờ của nhóm mình.',403);
   changed={id:randomUUID(),projectId,entryId:entry.id,employeeId:entry.employeeId,reason:text(value.reason),status:'pending',createdBy:user.email,createdAt:at};ops.unlocks.push(changed);
  }else if(action==='unlockDecision'){
   requireRole(actor,['manager']);const row=ops.unlocks.find(row=>row.id===id&&row.projectId===projectId);ensure(row&&row.status==='pending','Yêu cầu không chờ duyệt.');ensure(!self(user,row),'Không tự duyệt mở khóa.',403);
   ensure(['approved','rejected'].includes(value.status),'Trạng thái không hợp lệ.');Object.assign(row,{status:value.status,...stamp(user)});
   if(value.status==='approved'){const data=dataFor(db,projectId),entry=data.timesheets.find(entry=>entry.id===row.entryId);ensure(entry,'Dòng giờ không còn tồn tại.');before=structuredClone(entry);Object.assign(entry,{status:'returned',locked:false,unlockId:id,reason:row.reason});recordProject(db,projectId);}
  }else if(action==='otRequest'){
   ensure(user.employeeId,'Tài khoản chưa liên kết nhân sự.');permission(ops,actor,'otRegister');
   const item=projectDeliveryItems(db,projectId).find(row=>row.id===value.taskId);ensure(item&&ownsDeliveryTask(actor,item),'Chọn việc được giao.');
   ensure(validDate(value.date)&&value.date>=vietnamDay(),'Đăng ký làm thêm trước khi làm.');
   const hours=number(value.hours,24);ensure(hours>0&&Number.isInteger(hours*2),'Giờ làm thêm theo bước 0,5 giờ.');ensure(text(value.reason),'Cần lý do làm thêm.');
   const used=sumBy(ops.otRequests.filter(row=>row.employeeId===user.employeeId&&row.date.slice(0,7)===value.date.slice(0,7)&&row.status!=='rejected'),'hours');
   let roles=actor.role==='manager'?['director']:actor.role==='leader'?['manager']:['leader','manager'];if(used+hours>ops.params.otLimit&&!roles.includes('director'))roles.push('director');
   changed={id:randomUUID(),code:`OT-${String(ops.otRequests.length+1).padStart(3,'0')}`,projectId,taskId:item.id,employeeId:user.employeeId,date:value.date,hours,reason:text(value.reason),steps:roles.map(role=>flowStep(role,`Duyệt ${role}`)),status:'pending',createdBy:user.email,createdAt:at};ops.otRequests.push(changed);
  }else if(action==='otDecision'){
   const row=ops.otRequests.find(row=>row.id===id&&row.projectId===projectId);ensure(row&&row.status==='pending','Phiếu không chờ duyệt.');ensure(row.date>=vietnamDay(),'Không duyệt hồi tố phiếu làm thêm.');approveStep(actor,row,value.status,value.reason);
   if(row.status==='approved'){db.overtimes ||= [];db.overtimes.push({id:row.id,employeeId:row.employeeId,taskId:row.taskId,date:row.date,hours:row.hours,status:'approved',approvedBy:user.email,approvedAt:at,source:'operations'});}
  }else if(action==='attendanceImport'){
   requireRole(user,['accountant']);ensure(Array.isArray(value.rows)&&value.rows.length<=10000,'Danh sách chấm công không hợp lệ.');
   for(const input of value.rows){const employee=db.employees.find(e=>e.id===input.employeeId||Boolean(input.employeeCode||input.employeeId)&&e.code===(input.employeeCode||input.employeeId));const row={...input,employeeId:employee?.id};ensure(db.employees.some(e=>e.id===row.employeeId)&&validDate(row.date),'Mã nhân viên / ngày chấm công không hợp lệ.');const hours=number(row.hours,24);const existing=ops.attendance.find(e=>e.employeeId===row.employeeId&&e.date===row.date);const updated={id:existing?.id||randomUUID(),employeeId:row.employeeId,date:row.date,hours,source:'attendance-import',...stamp(user)};if(existing)Object.assign(existing,updated);else ops.attendance.push(updated);}
   ops.syncEvents.push({id:randomUUID(),kind:'attendance',count:value.rows.length,at,by:user.email,status:'imported'});
  }else if(action==='check'){
   requireRole(actor,['manager','accountant','chiefAccountant']);ensure(text(value.result),'Cần kết quả đối chiếu.');changed={id:randomUUID(),projectId,entryId:value.entryId||'',result:text(value.result),createdBy:user.email,createdAt:at};ops.checks.push(changed);
  }else if(action==='budget'){
   permission(ops,actor,'budget');requireRole(actor,['manager','chiefAccountant']);ensure(projectId&&Array.isArray(value.lines)&&value.lines.length===9,'Ngân sách cần đủ 9 nhóm.');
   const lines=value.lines.map((line,index)=>({group:index+1,amount:money(line.amount),hours:index===0?number(line.hours||0):0}));
    changed={id:randomUUID(),projectId,version:ops.budgets.filter(row=>row.projectId===projectId).length+1,lines,status:'pending',steps:selfSafeSteps(actor,[flowStep('chiefAccountant','Xác nhận ngân sách'),flowStep('director','Duyệt ngân sách')]),createdBy:user.email,createdAt:at};ops.budgets.push(changed);
  }else if(action==='budgetDecision'){
   const row=ops.budgets.find(row=>row.id===id&&row.projectId===projectId);ensure(row&&row.status==='pending','Ngân sách không chờ duyệt.');approveStep(actor,row,value.status,value.reason);
  }else if(action==='expenseRequest'){
   ensure(projectId,'Chọn dự án.');const group=number(value.group,9);ensure(group>=2&&Number.isInteger(group),'Nhóm chi phí phải từ 2 đến 9.');
   ensure(['expense','advance','contract'].includes(value.type),'Loại đề nghị không hợp lệ.');
   permission(ops,actor,value.type==='advance'?'advance':value.type==='contract'?'outsource':({2:'outsource',3:'printing',4:'travel',5:'courier',6:'hospitality',7:'fees',8:'budgetFees',9:'budgetOverhead'})[group]);
   if(actor.role==='employee')ensure(group===4&&value.type!=='contract','Nhân viên chỉ lập công tác phí / tạm ứng công tác.');
   if(actor.role==='leader')ensure(group<=6,'Leader chỉ lập đề nghị nhóm 2–6.');
   ensure(text(value.title),'Cần nội dung đề nghị.');const amount=money(value.amount);ensure(amount>0,'Số tiền phải lớn hơn 0.');
   const budget=ops.budgets.filter(row=>row.projectId===projectId&&!row.deletedAt&&row.status==='approved').at(-1),line=budget?.lines.find(row=>row.group===group),projectData=dataFor(db,projectId);
   const actual=sumBy((projectData.expenses||[]).filter(row=>row.status==='approved'&&Number(row.group||2)===group),'amount');
   const committed=ops.expenseRequests.filter(row=>row.projectId===projectId&&row.group===group&&row.committedAt&&row.status!=='settled'&&!row.deletedAt).reduce((sum,row)=>sum+Math.max(0,Number(row.amount||0)-Number(row.paidAmount||0)),0);
   const remaining=line?Number(line.amount)-actual-committed:null;
   ensure(!value.dueDate||validDate(value.dueDate),'Ngày dự kiến chi / hạn hoàn ứng không hợp lệ.');
   const steps=expenseFlow(actor,{...value,group,amount},ops.params,remaining!=null&&amount>remaining);
   changed={id:randomUUID(),code:`${value.type==='advance'?'TU':value.type==='contract'?'HĐTN':'ĐNC'}-${String(ops.expenseRequests.length+1).padStart(3,'0')}`,projectId,group,type:value.type,title:text(value.title),amount,documentRef:text(value.documentRef),dueDate:value.dueDate||addDate(vietnamDay(),ops.params.advanceDays),steps,status:'pending',createdBy:user.email,employeeId:user.employeeId||'',createdAt:at};ops.expenseRequests.push(changed);
  }else if(action==='expenseDecision'){
   const row=ops.expenseRequests.find(row=>row.id===id&&row.projectId===projectId);ensure(row&&row.status==='pending','Đề nghị không chờ duyệt.');
   const step=row.steps.find(s=>s.status==='pending');if(step?.label==='Kiểm tra chứng từ' && value.status==='approved')ensure(text(value.documentRef||row.documentRef),'Cần mã / đường dẫn chứng từ.');
   if(value.documentRef)row.documentRef=text(value.documentRef);approveStep(actor,row,value.status,value.reason);
   if(row.steps.some(step=>step.status==='approved'&&['leader','manager','director'].includes(step.role)))row.committedAt ||= at;
  }else if(action==='settlement'){
   const row=ops.expenseRequests.find(row=>row.id===id&&row.projectId===projectId&&row.type==='advance');ensure(row&&row.status==='paid','Chỉ quyết toán tạm ứng đã được chi.');ensure(self(user,row)||['accountant','chiefAccountant'].includes(actor.role)||companyAdmin(actor.role),'Không có quyền quyết toán.');ensure(text(value.documentRef),'Cần chứng từ hoàn ứng.');row.settlement={amount:money(value.amount),documentRef:text(value.documentRef),...stamp(user)};row.status='settled';
  }else if(action==='milestone'){
   permission(ops,actor,'milestones');requireRole(actor,['manager']);const data=dataFor(db,projectId);ensure(text(value.title),'Cần nội dung mốc.');
   const conditions=(value.conditions||[]).map(condition=>{ensure(projectDeliveryItems(db,projectId).some(row=>row.id===condition.taskId),'Task điều kiện không hợp lệ.');ensure(['>=','='].includes(condition.op),'Toán tử không hợp lệ.');return {taskId:condition.taskId,op:condition.op,level:number(condition.level,100)};});
   ensure(!value.expectedDate||validDate(value.expectedDate),'Ngày dự kiến không hợp lệ.');
   const old=data.milestones.find(row=>row.id===id);ensure(!id||old,'Mốc không tồn tại.');changed={...(old||{}),id:id||randomUUID(),title:text(value.title),amount:money(value.amount===''||value.amount==null?Number(data.settings.contractFee||0)*number(value.percent||0,100)/100:value.amount),percent:number(value.percent||0,100),conditions,expectedDate:value.expectedDate||'',completionRequired:number(value.completionRequired??100,100),taskIds:[],createdBy:old?.createdBy||user.email,createdAt:old?.createdAt||at,...stamp(user)};
   if(old)Object.assign(old,changed);else data.milestones.push(changed);recordProject(db,projectId);
  }else if(action==='paymentRequest'){
   permission(ops,actor,'payment');requireRole(actor,['manager']);const metrics=computeDelivery(db,projectId,dataFor(db,projectId));const milestone=metrics.milestones.find(row=>row.id===value.milestoneId);ensure(milestone?.met,'Mốc chưa đủ điều kiện thanh toán.');ensure(!ops.paymentRequests.some(row=>row.milestoneId===milestone.id&&row.status!=='rejected'),'Đã có đề nghị cho mốc này.');ensure(validDate(value.dueDate),'Cần hạn thanh toán.');
   changed={id:randomUUID(),projectId,milestoneId:milestone.id,code:text(value.code)||`ĐNTT-${ops.paymentRequests.length+1}`,amount:milestone.amount,dueDate:value.dueDate,collectorId:value.collectorId||user.employeeId||'',status:'pending',steps:[flowStep('chiefAccountant','Xác nhận số tiền, điều khoản'),flowStep('director','Duyệt ĐNTT'),flowStep('accountant','Yêu cầu xuất HĐĐT tại phần mềm kế toán'),flowStep('manager','Gửi CĐT')],createdBy:user.email,createdAt:at};ops.paymentRequests.push(changed);
  }else if(action==='paymentDecision'){
   const row=ops.paymentRequests.find(row=>row.id===id&&row.projectId===projectId);ensure(row&&row.status==='pending','ĐNTT không chờ xử lý.');const step=row.steps.find(s=>s.status==='pending');
    if(step?.label==='Gửi CĐT'){ensure(actor.role==='manager'||companyAdmin(actor.role),'QL cấp trung gửi CĐT.',403);ensure(['approved','rejected'].includes(value.status),'Quyết định không hợp lệ.');if(value.status==='rejected')ensure(text(value.reason),'Cần ghi lý do từ chối.');if(value.status==='approved')ensure(row.invoiceNo,'Chưa đồng bộ số hóa đơn điện tử.');Object.assign(step,{status:value.status,by:user.email,at,reason:text(value.reason)});row.status=value.status==='approved'?'sent':'rejected';if(value.status==='approved'){row.sentAt=vietnamDay();const milestone=dataFor(db,projectId).milestones.find(m=>m.id===row.milestoneId);if(milestone)milestone.requestedAt=row.sentAt;recordProject(db,projectId);}}
   else approveStep(actor,row,value.status,value.reason);
  }else if(action==='accountingImport'){
   requireRole(user,['accountant','chiefAccountant']);ensure(Array.isArray(value.rows)&&value.rows.length<=10000,'Dữ liệu đồng bộ không hợp lệ.');
   for(const input of value.rows){const project=db.projects.find(p=>p.id===input.projectId||Boolean(input.projectCode||input.projectId)&&p.code===(input.projectCode||input.projectId));const row={...input,projectId:project?.id};row.paymentRequestId ||= input.requestCode&&ops.paymentRequests.find(p=>p.projectId===row.projectId&&p.code===input.requestCode)?.id;row.expenseRequestId ||= input.requestCode&&ops.expenseRequests.find(p=>p.projectId===row.projectId&&p.code===input.requestCode)?.id;ensure(['invoice','receipt','disbursement'].includes(row.kind)&&text(row.externalId)&&validDate(row.date),'Cần loại dữ liệu, mã ngoài hệ thống và ngày.');ensure(db.projects.some(p=>p.id===row.projectId),'Dự án đồng bộ không tồn tại.');const data=dataFor(db,row.projectId);
    if(row.kind==='invoice'){const request=ops.paymentRequests.find(p=>p.id===row.paymentRequestId&&p.projectId===row.projectId);ensure(request&&text(row.invoiceNo),'ĐNTT / số HĐĐT không hợp lệ.');ensure(request.steps.slice(0,2).every(step=>step.status==='approved'),'ĐNTT chưa được duyệt xuất hóa đơn.');request.invoiceNo=text(row.invoiceNo);request.invoiceDate=row.date;request.invoiceExternalId=text(row.externalId);}
    else if(row.kind==='receipt'){ensure(ops.paymentRequests.some(p=>p.id===row.paymentRequestId&&p.projectId===row.projectId),'Cần liên kết ĐNTT.');const entry={id:`accounting:${row.externalId}`,externalId:text(row.externalId),paymentRequestId:row.paymentRequestId,title:text(row.title)||'Tiền về từ kế toán',date:row.date,amount:money(row.amount),source:'accounting',...stamp(user)};const index=data.receipts.findIndex(p=>p.id===entry.id);if(index<0)data.receipts.push(entry);else data.receipts[index]=entry;}
    else {const request=ops.expenseRequests.find(p=>p.id===row.expenseRequestId&&p.projectId===row.projectId);ensure(['approved','partiallyPaid','paid'].includes(request?.status),'Đề nghị chi chưa được duyệt hoàn tất.');const entry={id:`accounting:${row.externalId}`,externalId:text(row.externalId),expenseRequestId:request.id,title:request.title,group:request.group,date:row.date,amount:money(row.amount),status:'approved',source:'accounting',...stamp(user)};const index=data.expenses.findIndex(p=>p.id===entry.id);if(index<0)data.expenses.push(entry);else data.expenses[index]=entry;request.paidAmount=sumBy(data.expenses.filter(p=>p.expenseRequestId===request.id&&p.status==='approved'),'amount');ensure(request.paidAmount<=request.amount,'Tổng số tiền chi không được vượt đề nghị.');request.status=request.paidAmount>=request.amount?'paid':'partiallyPaid';request.paidAt=row.date;if(request.type==='advance'&&request.status==='paid')request.dueDate=addDate(row.date,ops.params.advanceDays);}
    recordProject(db,row.projectId);
   }
   ops.syncEvents.push({id:randomUUID(),kind:'accounting',count:value.rows.length,at,by:user.email,status:'imported'});
  }else if(action==='cashForecast'){
   requireRole(user,['chiefAccountant']);ensure(/^\d{4}-\d{2}$/.test(value.month||'')&&Array.isArray(value.lines)&&value.lines.length===6,'Dự báo cần đủ 6 tháng.');
   changed={id:randomUUID(),month:value.month,openingBalance:money(value.openingBalance),lines:value.lines.map((line,index)=>{const expected=new Date(`${value.month}-01T12:00:00Z`);expected.setUTCMonth(expected.getUTCMonth()+index);ensure(line.month===expected.toISOString().slice(0,7),'Các tháng dự báo phải liên tiếp.');return {month:line.month,fixedCost:money(line.fixedCost||0),salary:money(line.salary||0),otherIn:money(line.otherIn||0),otherOut:money(line.otherOut||0),note:text(line.note)};}),status:'pending',steps:[flowStep('director','Duyệt dự báo dòng tiền')],createdBy:user.email,createdAt:at};ops.cashForecasts.push(changed);
  }else if(action==='cashDecision'){
   requireRole(user,[]);const row=ops.cashForecasts.find(row=>row.id===id);ensure(row&&row.status==='pending','Dự báo không chờ duyệt.');approveStep(user,row,value.status,value.reason);
  }else if(action==='notificationRead'){
   const row=ops.notifications.find(row=>row.id===id);ensure(row&&(row.email===user.email||companyAdmin(user.role)),'Thông báo không tồn tại.');row.readAt=at;
  }else throw new Error('Thao tác không hợp lệ.');
  const deltas=[];for(const key of Object.keys(original).filter(key=>!['audit','revision'].includes(key)))if(JSON.stringify(original[key])!==JSON.stringify(ops[key]))deltas.push({collection:key,before:original[key],after:structuredClone(ops[key])});
  for(const pid of Object.keys(db.delivery?.projects||{}))if(JSON.stringify(originalProjects[pid])!==JSON.stringify(db.delivery.projects[pid]))deltas.push({collection:`project:${pid}`,before:originalProjects[pid]||null,after:structuredClone(db.delivery.projects[pid])});
  ops.revision++;ops.audit.push({id:randomUUID(),action,projectId:projectId||'',actor:user.email,at,before:deltas.map(row=>({collection:row.collection,value:row.before})),after:deltas.map(row=>({collection:row.collection,value:row.after}))});db.operations=ops;
  updateOperationsJobs(db);ensure(writeDb(db),'Không lưu được dữ liệu.');
  return res.json({success:true,data:{...operationsReport(db,user,{...query,projectId:query.projectId??projectId}),...(action==='projectCreate'?{createdProjectId:ops.lastCreatedProjectId}:{})}});
 }catch(error){return res.status(error.status||400).json({message:error.message});}
}
