import { capacityWeight } from '../../../frontend/src/utils/workforceForecast.js';
import { computeDelivery } from '../../../frontend/src/utils/deliveryMetrics.js';
import { operations } from './operationsStore.js';
import { attendanceHours, sumBy } from './operationsReports.js';

// Recomputed from source records; no sample statistics are persisted.
export function hoursAnomalies(db, entries, month) {
 const params=operations(db).params, active=entries.filter(e=>!['draft','returned','rejected'].includes(e.status));
 const period=active.filter(e=>e.date?.slice(0,7)===month), result=Object.fromEntries(['presence','projectSpike','identical','otSpike','exact','hoursProgress'].map(key=>[key,[]]));
 const metrics=new Map((db.projects||[]).map(p=>[p.id,computeDelivery(db,p.id,db.delivery?.projects?.[p.id]||{})]));
 const label=e=>db.employees?.find(p=>p.id===e)?.name||e;
 const daily=new Map();for(const entry of period){const key=`${entry.employeeId}:${entry.date}`;if(!daily.has(key))daily.set(key,[]);daily.get(key).push(entry);}
 for(const rows of daily.values()){const e=rows[0],present=attendanceHours(db,e.employeeId,e.date),hours=sumBy(rows,'hours');if(present!=null&&hours>present+.01)result.presence.push({employeeId:e.employeeId,date:e.date,detail:`${label(e.employeeId)} ${e.date}: ${hours}h / có mặt ${present}h`});}
 const previous=new Date(`${month}-01T12:00:00Z`);previous.setUTCMonth(previous.getUTCMonth()-1);const previousMonth=previous.toISOString().slice(0,7);
 for(const p of db.projects||[]){const current=sumBy(period.filter(e=>e.projectId===p.id),'hours'),prior=sumBy(active.filter(e=>e.projectId===p.id&&e.date?.slice(0,7)===previousMonth),'hours');
  const leaders=(db.operations?.members||[]).filter(m=>m.projectId===p.id&&m.role==='leader'&&!m.deletedAt).map(m=>m.email);
  const other=(db.projects||[]).find(q=>q.id!==p.id&&(leaders.length?(db.operations?.members||[]).some(m=>m.projectId===q.id&&leaders.includes(m.email)&&m.role==='leader'):p.manager&&q.manager===p.manager)&&metrics.get(q.id)?.summary.totalPlanned>0&&metrics.get(q.id).summary.totalActual/metrics.get(q.id).summary.totalPlanned*100>=params.hoursUsed);
  if(prior>0&&current>prior*params.overtimeSpike/100&&other)result.projectSpike.push({projectId:p.id,detail:`${p.name}: ${current}h, kỳ trước ${prior}h; ${other.name} đã dùng ≥ ${params.hoursUsed}% giờ`});
  for(const [taskId,t] of Object.entries(metrics.get(p.id)?.taskMetrics||{})){if(t.planned>0&&t.actual/t.planned*100>=params.hoursUsed&&t.recognized<=params.completionLow)result.hoursProgress.push({projectId:p.id,taskId,detail:`${p.name} · ${taskId}: dùng ${Math.round(t.actual/t.planned*100)}% giờ, ghi nhận ${t.recognized}%`});}
 }
 for(const employee of db.employees||[]){
  const ot=sumBy(period.filter(e=>e.employeeId===employee.id&&e.shiftType==='overtime'),'hours');
  const priorMonths=Array.from({length:3},(_,i)=>{const date=new Date(`${month}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-i-1);return date.toISOString().slice(0,7);});
  const average=sumBy(active.filter(e=>e.employeeId===employee.id&&e.shiftType==='overtime'&&priorMonths.includes(e.date?.slice(0,7))),'hours')/3;
  if(average>0&&ot>average*params.overtimeSpike/100)result.otSpike.push({employeeId:employee.id,detail:`${employee.name}: ${ot}h OT / bình quân 3 tháng ${Math.round(average*10)/10}h`});
  const usedTasks=new Set(period.filter(e=>e.employeeId===employee.id).map(e=>`${e.projectId}|${e.taskId}`));let comparable=0,exact=0;
  for(const key of usedTasks){const [pid,tid]=key.split('|'),t=metrics.get(pid)?.taskMetrics[tid],plan=t?.assignments?.find(a=>a.employeeId===employee.id)?.plannedHours;if(!(plan>0)||t.recognized<100)continue;comparable++;if(Math.abs(sumBy(active.filter(e=>e.employeeId===employee.id&&e.projectId===pid&&e.taskId===tid),'hours')-plan)<.01)exact++;}
  if(comparable&&exact/comparable*100>=params.exactEstimate)result.exact.push({employeeId:employee.id,detail:`${employee.name}: ${exact}/${comparable} task hoàn tất khai đúng giờ dự toán`});
 }
 for(const team of new Set((db.employees||[]).map(e=>e.team).filter(Boolean))){const people=(db.employees||[]).filter(e=>e.team===team);if(people.length<2)continue;const dates=[...new Set(period.map(e=>e.date))],same=dates.filter(date=>{const values=people.map(person=>sumBy(period.filter(e=>e.employeeId===person.id&&e.date===date),'hours'));return values[0]>0&&values.every(v=>v===values[0]);});let run=0,longest=0;const end=new Date(`${month}-01T12:00:00Z`);end.setUTCMonth(end.getUTCMonth()+1);for(let key=`${month}-01`;key<end.toISOString().slice(0,10);){if(capacityWeight(key)>0){run=same.includes(key)?run+1:0;longest=Math.max(longest,run);}key=new Date(Date.parse(`${key}T12:00:00Z`)+86400000).toISOString().slice(0,10);}if(longest>=params.identicalDays)result.identical.push({team,detail:`${team}: ${people.length} người khai cùng số giờ trong ${longest} ngày làm việc liên tiếp (${same.join(', ')})`});}
 return result;
}
export function monthlyReviewSample(entries,month,count=2){
 const hash=row=>{let value=2166136261;for(const c of `${month}:${row.projectId}:${row.id}`){value^=c.charCodeAt(0);value=Math.imul(value,16777619);}return (value>>>0).toString(16).padStart(8,'0');};
 return entries.filter(e=>e.status==='approved'&&e.date?.slice(0,7)===month).sort((a,b)=>hash(a).localeCompare(hash(b))).slice(0,Math.floor(count));
}
