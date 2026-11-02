import { randomUUID } from 'node:crypto';
import { calendarCapacity, positionKey, employeePosition } from '../../../frontend/src/utils/workforceForecast.js';
import { calculateAssignmentHours } from '../../../frontend/src/utils/ganttEffort.js';
import { assignmentWorkingDates } from '../../../frontend/src/utils/assignmentCalendar.js';
import { addDate } from './operationsReports.js';
import { projectTemplates } from './defaultProjectTemplate.js';
import { EXTERNAL_DEPARTMENTS, employeeDepartments, taskDepartments } from '../../../frontend/src/utils/departmentCodes.js';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const nonnegative=value=>{const n=Number(value);check(Number.isFinite(n)&&n>=0,'Giá trị số phải không âm.');return n;};
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const overlapHours=(task,assignment,startDate,endDate)=>{
 const start=[task.startDate,assignment.startDate,startDate].filter(Boolean).sort().at(-1),end=[task.endDate,assignment.endDate,endDate].filter(Boolean).sort()[0];
 return start&&end&&start<=end?calculateAssignmentHours({...task,startDate:start,endDate:end},{...assignment,startDate:start,endDate:end}):0;
};
/**
 * Dựng "template tạm" từ bảng hạng mục trong file báo giá, dùng khi dạng dự án chưa có template.
 * - Mỗi dòng (code, title, department, workDays) thành 1 việc; số giờ = công báo giá × 8, không co giãn theo diện tích.
 *   Hạng mục chưa có công giữ 0 giờ (fixedHours), không tự lấy đủ công theo số ngày như việc của template.
 * - Việc xếp nối tiếp theo thứ tự trong file, mỗi việc chiếm số ngày tỷ lệ với số công của nó trong khoảng dự án.
 * - Dòng mục lớn (isGroup: phần A, B... và nhóm A1, A2...) thành nhóm trên Gantt, tiêu đề "A. ..." / "A1. ...";
 *   nhóm A1 nằm trong phần A, việc nằm trong nhóm gần nhất phía trên; ngày của nhóm bao trùm các việc con, nhóm không có công.
 * - Vị trí để tự gán người: lấy theo cách các template đã có ánh xạ bộ môn → vị trí (VD KT → Thiết Kế);
 *   bộ môn chưa từng xuất hiện trong template nào thì dùng chính tên bộ môn.
 */
function quoteItemsTemplate(db,input){
 const rows=input.quoteItems;check(Array.isArray(rows)&&rows.some(row=>!row.isGroup)&&rows.length<=1000,'Bảng hạng mục trong file báo giá đang trống.');
 const positionOf=new Map(projectTemplates(db).flatMap(t=>t.items||[]).filter(t=>t.requiredPosition&&t.assignmentPosition).map(t=>[positionKey(t.requiredPosition),t.assignmentPosition]));
 const span=Math.round((Date.parse(input.endDate)-Date.parse(input.startDate))/86400000)+1;
 const hours=rows.map(row=>row.isGroup?0:nonnegative(row.workDays||0)*8),known=hours.filter(value=>value>0);
 // Xếp lịch theo trọng số = số giờ; hạng mục chưa có công lấy trọng số trung bình để vẫn có khoảng ngày hợp lý (số giờ vẫn là 0).
 const average=known.length?known.reduce((sum,value)=>sum+value,0)/known.length:8,weights=rows.map((row,index)=>row.isGroup?0:hours[index]>0?hours[index]:average),total=weights.reduce((sum,value)=>sum+value,0);
 let before=0,phase=null,group=null,previousTask='';
 const items=rows.map((row,index)=>{
  const id=`file-${index+1}`,code=String(row.code||'').trim(),title=String(row.title||'').trim().replace(/:$/,'').trim(),department=String(row.department||'').trim();check(title,'Mỗi hạng mục trong file cần có tên.');
  if(row.isGroup){
   // Mã 1 chữ cái (A) là phần; mã chữ + số (A1) là nhóm con của phần cùng chữ cái.
   const sub=/\d/.test(code),item={id,code,title:code?`${code}. ${title}`:title,isGroup:true,parentGroupId:sub&&phase&&code.startsWith(phase.code)?phase.id:'',startOffset:null,endOffset:null,estimatedHours:0,fixedHours:true,scaleWithArea:false,dependencies:[]};
   if(sub)group=item;else{phase=item;group=null;}
   return item;
  }
  const startOffset=total>0?Math.min(span-1,Math.floor(before/total*span)):0;before+=weights[index];
  const endOffset=total>0?Math.max(startOffset,Math.min(span-1,Math.ceil(before/total*span)-1)):span-1;
  const item={id,code,title,parentGroupId:(group||phase)?.id||'',requiredPosition:department,assignmentPosition:positionOf.get(positionKey(department))||department,startOffset,endOffset,estimatedHours:hours[index],fixedHours:true,scaleWithArea:false,dependencies:previousTask?[previousTask]:[]};
  previousTask=id;
  return item;
 });
 // Ngày của nhóm = từ việc con sớm nhất đến việc con muộn nhất (tính cả nhóm con); nhóm rỗng lấy ngày đầu dự án.
 const groups=items.filter(item=>item.isGroup).reverse();
 for(const g of groups){const children=items.filter(item=>item.parentGroupId===g.id&&item.startOffset!=null);if(children.length){g.startOffset=Math.min(...children.map(c=>c.startOffset));g.endOffset=Math.max(...children.map(c=>c.endOffset));}}
 groups.forEach(g=>{g.startOffset??=0;g.endOffset??=0;});
 return {id:'',name:'Theo bảng hạng mục trong file',baseArea:0,items,budgetPercents:[],milestones:[],scopeOptions:[]};
}

export function projectBlueprint(db,input,user){
 check(String(input.name||'').trim(),'Cần tên dự án.');check(date(input.startDate)&&date(input.endDate)&&input.endDate>=input.startDate,'Khoảng ngày dự án không hợp lệ.');
 // Có template → dùng template; không chọn template nhưng có bảng hạng mục từ file → dựng template tạm từ file.
 const template=input.templateId?projectTemplates(db).find(t=>t.id===input.templateId):input.quoteItems?quoteItemsTemplate(db,input):null;check(!input.templateId||template,'Mẫu dự án không tồn tại.');
 const area=nonnegative(input.area||0),fee=input.contractFee==null||input.contractFee===''?null:nonnegative(input.contractFee),scale=template?.baseArea>0&&area>0?area/template.baseArea:1,projectId=`proj-${randomUUID()}`;
 const project={id:projectId,name:input.name.trim(),code:String(input.code||'').trim(),description:String(input.description||'').trim(),location:String(input.location||'').trim(),client:String(input.client||'').trim(),area,manager:input.managerEmail||user.email,managerEmail:input.managerEmail||user.email,startDate:input.startDate,endDate:input.endDate,status:'planning',approvalStatus:'pending',createdBy:user.email,createdAt:new Date().toISOString(),progress:0,contractWork:null,templateId:template?.id||'',scope:input.scope||[],importFiles:{quoteFileName:String(input.quoteFileName||'').trim(),contractFileName:String(input.contractFileName||'').trim()}};
 const source=(template?.items||[]).filter(t=>!t.scopeKey||project.scope.includes(t.scopeKey));
 const ids=new Map(source.map(t=>[t.id,`G-${randomUUID()}`]));
 const items=source.map(t=>{const startDate=addDate(input.startDate,Number(t.startOffset)||0),endDate=addDate(input.startDate,Math.max(Number(t.startOffset)||0,Number(t.endOffset)||0));const planned=t.fixedHours?Number(t.estimatedHours)||0:Number(t.estimatedHours)||calendarCapacity(startDate,endDate,Number(t.estimatedHoursPerDay)||8);return {...t,templateItemId:t.id,id:ids.get(t.id),projectId,parentGroupId:ids.get(t.parentGroupId)||'',parentTaskId:ids.get(t.parentTaskId)||'',dependencies:(t.dependencies||[]).map(id=>ids.get(id)).filter(Boolean),startDate,endDate,estimatedHours:planned*(t.scaleWithArea===false?1:scale),assignees:[],assignee:'',status:'not_started',createdAt:project.createdAt};});
 check(items.every(t=>t.startDate>=input.startDate&&t.endDate<=input.endDate),'Khoảng dự án ngắn hơn lịch của mẫu. Hãy kéo dài ngày kết thúc.');
 const parentIds=new Set(items.map(t=>t.parentTaskId).filter(Boolean)),allocations=[];
 const employeeLoad=(employee,item)=>[...(db.ganttItems||[]),...items].filter(t=>!t.isGroup&&t.status!=='completed'&&t.endDate>=item.startDate&&t.startDate<=item.endDate).reduce((sum,t)=>sum+(t.assignees||[]).filter(a=>a.employeeId===employee.id).reduce((hours,a)=>hours+overlapHours(t,a,item.startDate,item.endDate),0),0);
 const activeEmployees=(db.employees||[]).filter(e=>e.status!=='inactive');
 const assignment=(employee,item,hours)=>({employeeId:employee.id,employeeName:employee.name,startDate:item.startDate,endDate:item.endDate,estimatedHoursPerDay:hours/Math.max(1,assignmentWorkingDates(item,{excludeNonWorkingDays:true}).length),excludeNonWorkingDays:true,excludedDates:[]});
 for(const item of items.filter(t=>!t.isGroup&&!parentIds.has(t.id))){
  const position=item.requiredPosition||item.position||'',capacity=calendarCapacity(item.startDate,item.endDate),departments=taskDepartments(item);
  // Việc ghi theo bộ môn (VD "KC, HT"): mỗi bộ môn nội bộ 1 người ít tải nhất của bộ môn đó, công chia đều; CĐT không gán.
  // Việc kiểu cũ (vị trí như "Kiến trúc sư"): 1 người có chức danh trùng vị trí, nhận đủ công.
  const slots=departments.length?departments.filter(d=>!EXTERNAL_DEPARTMENTS.includes(d)).map(d=>({label:d,match:e=>employeeDepartments(e).includes(d),primary:e=>employeeDepartments(e)[0]===d})):[{label:'',match:e=>positionKey(employeePosition(e))===positionKey(item.assignmentPosition||position),primary:()=>true}];
  const share=slots.length?item.estimatedHours/slots.length:0,parts=[];
  item.assignees=[];
  for(const slot of slots){
   // Ưu tiên người có bộ môn chính đúng suất này (VD "YẾN _ HT" cho suất HT dù chức danh ghi MEP), rồi người ít tải hơn.
   const candidates=activeEmployees.filter(e=>slot.match(e)&&!item.assignees.some(a=>a.employeeId===e.id)).sort((a,b)=>Number(slot.primary(b))-Number(slot.primary(a))||employeeLoad(a,item)-employeeLoad(b,item)||a.id.localeCompare(b.id));
   const employee=candidates[0];
   if(employee)item.assignees.push(assignment(employee,item,share));
   const existing=employee?employeeLoad(employee,item)-share:0,load=capacity>0&&employee?(existing+share)/capacity*100:null;
   parts.push({department:slot.label,employeeId:employee?.id||'',employeeName:employee?.name||'',hours:share,load,missingHours:employee?Math.max(0,existing+share-capacity):share});
  }
  if(item.assignees.length){item.assignee=item.assignees.map(a=>a.employeeName).join(', ');item.autoAssigned=true;}
  const missing=parts.filter(part=>!part.employeeId),loads=parts.map(part=>part.load).filter(value=>value!=null);
  const employeeName=!slots.length?'Việc của CĐT · không gán':parts.map(part=>part.employeeName||(part.department?`Chưa có người ${part.department}`:'Chưa có nhân sự cùng vị trí')).join(', ');
  allocations.push({taskId:item.id,title:item.title,position,employeeId:parts.find(part=>part.employeeId)?.employeeId||'',employeeName,parts,hours:item.estimatedHours,dailyHours:item.assignees[0]?.estimatedHoursPerDay||0,load:loads.length?Math.max(...loads):null,overloaded:missing.length>0||loads.some(value=>value>100),missingHours:parts.reduce((sum,part)=>sum+part.missingHours,0)});
 }
 const totalHours=allocations.reduce((sum,a)=>sum+a.hours,0);project.contractWork=totalHours/8;
 const rateCard=(db.operations?.params?.rateCard||[]).filter(r=>r.status==='approved'&&r.effectiveFrom<=input.startDate),rateFor=id=>rateCard.filter(r=>r.grade===db.employees?.find(e=>e.id===id)?.grade).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1)?.amount;
 const laborParts=allocations.flatMap(a=>a.parts),laborKnown=laborParts.every(p=>rateFor(p.employeeId)!=null),labor=laborKnown?laborParts.reduce((sum,p)=>sum+p.hours*rateFor(p.employeeId),0):null;
 const lines=Array.from({length:9},(_,i)=>({group:i+1,amount:input.budgetLines?.[i]?.amount!=null?nonnegative(input.budgetLines[i].amount):i===0?labor??0:fee*Number(template?.budgetPercents?.[i]||0)/100,hours:i===0?totalHours:0}));
 const milestones=(input.milestones||template?.milestones||[]).map(m=>{const percent=nonnegative(m.percent||0);check(percent<=100,'Tỷ lệ mốc không hợp lệ.');return {id:randomUUID(),title:String(m.title||'').trim(),percent,amount:m.amount!=null?nonnegative(m.amount):fee*percent/100,conditions:(m.conditions||[]).map(c=>{check(ids.has(c.taskId),'Task điều kiện của mẫu đã bị loại khỏi phạm vi.');return {...c,taskId:ids.get(c.taskId)};}),taskIds:[],completionRequired:nonnegative(m.completionRequired??100),expectedDate:m.expectedOffset!=null?addDate(input.startDate,Number(m.expectedOffset)):m.expectedDate||'',createdBy:user.email};});
 check(milestones.reduce((sum,m)=>sum+m.percent,0)<=100.001,'Tổng tỷ lệ mốc vượt 100%.');
 return {project,items,allocations,lines,milestones,fee,totalHours,laborKnown,totalBudget:lines.reduce((sum,line)=>sum+line.amount,0)};
}
