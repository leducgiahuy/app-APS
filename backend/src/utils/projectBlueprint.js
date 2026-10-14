import { randomUUID } from 'node:crypto';
import { calendarCapacity, positionKey, employeePosition } from '../../../frontend/src/utils/workforceForecast.js';
import { calculateAssignmentHours } from '../../../frontend/src/utils/ganttEffort.js';
import { assignmentWorkingDates } from '../../../frontend/src/utils/assignmentCalendar.js';
import { addDate } from './operationsReports.js';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const nonnegative=value=>{const n=Number(value);check(Number.isFinite(n)&&n>=0,'Giá trị số phải không âm.');return n;};
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const overlapHours=(task,assignment,startDate,endDate)=>{
 const start=[task.startDate,assignment.startDate,startDate].filter(Boolean).sort().at(-1),end=[task.endDate,assignment.endDate,endDate].filter(Boolean).sort()[0];
 return start&&end&&start<=end?calculateAssignmentHours({...task,startDate:start,endDate:end},{...assignment,startDate:start,endDate:end}):0;
};
export function projectBlueprint(db,input,user){
 check(String(input.name||'').trim(),'Cần tên dự án.');check(date(input.startDate)&&date(input.endDate)&&input.endDate>=input.startDate,'Khoảng ngày dự án không hợp lệ.');
 const template=(db.delivery?.templates||[]).find(t=>t.id===input.templateId);check(!input.templateId||template,'Mẫu dự án không tồn tại.');
 const area=nonnegative(input.area||0),fee=input.contractFee==null||input.contractFee===''?null:nonnegative(input.contractFee),scale=template?.baseArea>0&&area>0?area/template.baseArea:1,projectId=`proj-${randomUUID()}`;
 const project={id:projectId,name:input.name.trim(),code:String(input.code||'').trim(),description:String(input.description||'').trim(),location:String(input.location||'').trim(),client:String(input.client||'').trim(),area,manager:input.managerEmail||user.email,managerEmail:input.managerEmail||user.email,startDate:input.startDate,endDate:input.endDate,status:'planning',approvalStatus:'pending',createdBy:user.email,createdAt:new Date().toISOString(),progress:0,contractWork:null,templateId:template?.id||'',scope:input.scope||[]};
 const source=(template?.items||[]).filter(t=>!t.scopeKey||project.scope.includes(t.scopeKey));
 const ids=new Map(source.map(t=>[t.id,`G-${randomUUID()}`]));
 const items=source.map(t=>{const startDate=addDate(input.startDate,Number(t.startOffset)||0),endDate=addDate(input.startDate,Math.max(Number(t.startOffset)||0,Number(t.endOffset)||0));const planned=Number(t.estimatedHours)||calendarCapacity(startDate,endDate,Number(t.estimatedHoursPerDay)||8);return {...t,templateItemId:t.id,id:ids.get(t.id),projectId,parentGroupId:ids.get(t.parentGroupId)||'',parentTaskId:ids.get(t.parentTaskId)||'',dependencies:(t.dependencies||[]).map(id=>ids.get(id)).filter(Boolean),startDate,endDate,estimatedHours:planned*(t.scaleWithArea===false?1:scale),assignees:[],assignee:'',status:'not_started',createdAt:project.createdAt};});
 check(items.every(t=>t.startDate>=input.startDate&&t.endDate<=input.endDate),'Khoảng dự án ngắn hơn lịch của mẫu. Hãy kéo dài ngày kết thúc.');
 const parentIds=new Set(items.map(t=>t.parentTaskId).filter(Boolean)),allocations=[];
 const employeeLoad=(employee,item)=>[...(db.ganttItems||[]),...items].filter(t=>!t.isGroup&&t.status!=='completed'&&t.endDate>=item.startDate&&t.startDate<=item.endDate).reduce((sum,t)=>sum+(t.assignees||[]).filter(a=>a.employeeId===employee.id).reduce((hours,a)=>hours+overlapHours(t,a,item.startDate,item.endDate),0),0);
 for(const item of items.filter(t=>!t.isGroup&&!parentIds.has(t.id))){const position=item.requiredPosition||item.position||'',candidates=(db.employees||[]).filter(e=>e.status!=='inactive'&&positionKey(employeePosition(e))===positionKey(position));
  candidates.sort((a,b)=>employeeLoad(a,item)-employeeLoad(b,item)||a.id.localeCompare(b.id));const employee=candidates[0],capacity=calendarCapacity(item.startDate,item.endDate),daily=item.estimatedHours/Math.max(1,assignmentWorkingDates(item,{excludeNonWorkingDays:true}).length);
  if(employee){item.assignees=[{employeeId:employee.id,employeeName:employee.name,startDate:item.startDate,endDate:item.endDate,estimatedHoursPerDay:daily,excludeNonWorkingDays:true,excludedDates:[]}];item.assignee=employee.name;item.autoAssigned=true;}
  const existing=employee?employeeLoad(employee,item)-item.estimatedHours:0,load=capacity>0?(existing+item.estimatedHours)/capacity*100:null;
  allocations.push({taskId:item.id,title:item.title,position,employeeId:employee?.id||'',employeeName:employee?.name||'Chưa có nhân sự cùng vị trí',hours:item.estimatedHours,dailyHours:daily,load,overloaded:!employee||load>100,missingHours:employee?Math.max(0,existing+item.estimatedHours-capacity):item.estimatedHours});
 }
 const totalHours=allocations.reduce((sum,a)=>sum+a.hours,0);project.contractWork=totalHours/8;
 const rateCard=(db.operations?.params?.rateCard||[]).filter(r=>r.status==='approved'&&r.effectiveFrom<=input.startDate),rateFor=id=>rateCard.filter(r=>r.grade===db.employees?.find(e=>e.id===id)?.grade).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1)?.amount;
 const laborKnown=allocations.every(a=>rateFor(a.employeeId)!=null),labor=laborKnown?allocations.reduce((sum,a)=>sum+a.hours*rateFor(a.employeeId),0):null;
 const lines=Array.from({length:9},(_,i)=>({group:i+1,amount:input.budgetLines?.[i]?.amount!=null?nonnegative(input.budgetLines[i].amount):i===0?labor??0:fee*Number(template?.budgetPercents?.[i]||0)/100,hours:i===0?totalHours:0}));
 const milestones=(input.milestones||template?.milestones||[]).map(m=>{const percent=nonnegative(m.percent||0);check(percent<=100,'Tỷ lệ mốc không hợp lệ.');return {id:randomUUID(),title:String(m.title||'').trim(),percent,amount:m.amount!=null?nonnegative(m.amount):fee*percent/100,conditions:(m.conditions||[]).map(c=>{check(ids.has(c.taskId),'Task điều kiện của mẫu đã bị loại khỏi phạm vi.');return {...c,taskId:ids.get(c.taskId)};}),taskIds:[],completionRequired:nonnegative(m.completionRequired??100),expectedDate:m.expectedOffset!=null?addDate(input.startDate,Number(m.expectedOffset)):m.expectedDate||'',createdBy:user.email};});
 check(milestones.reduce((sum,m)=>sum+m.percent,0)<=100.001,'Tổng tỷ lệ mốc vượt 100%.');
 return {project,items,allocations,lines,milestones,fee,totalHours,laborKnown,totalBudget:lines.reduce((sum,line)=>sum+line.amount,0)};
}
