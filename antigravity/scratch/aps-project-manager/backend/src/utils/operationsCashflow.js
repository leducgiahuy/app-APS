import { computeDelivery } from '../../../frontend/src/utils/deliveryMetrics.js';
import { sumBy,vietnamDay,addDate } from './operationsReports.js';
export function cashflowReport(db,startMonth=vietnamDay().slice(0,7)) {
 const months=Array.from({length:6},(_,i)=>new Date(Date.UTC(Number(startMonth.slice(0,4)),Number(startMonth.slice(5))-1+i,1)).toISOString().slice(0,7));
 const ops=db.operations || {},versions=(ops.cashForecasts||[]).filter(row=>row.month===startMonth),version=versions.filter(row=>row.status==='approved').at(-1)||null;
 const legacy=db.delivery?.executive;
 const openingBalance=version?.openingBalance??(legacy?.openingMonth===startMonth?legacy.openingBalance:null);
 let balance=openingBalance;
 const rows=months.map(month=>{
  const line=version?.lines.find(row=>row.month===month)||{},sources=[];
  let incoming=Number(line.otherIn||0),outgoing=Number(line.fixedCost||0)+Number(line.salary||0)+Number(line.otherOut||0);
  for(const project of db.projects || []){
   const data=db.delivery?.projects?.[project.id]||{},metrics=computeDelivery(db,project.id,data);
   const actualIncoming=sumBy((data.receipts||[]).filter(row=>row.date?.slice(0,7)===month),'amount');
   const actualOutgoing=sumBy((data.expenses||[]).filter(row=>row.status==='approved'&&row.date?.slice(0,7)===month),'amount');
   incoming+=actualIncoming;outgoing+=actualOutgoing;
   if(actualIncoming)sources.push(`${project.name} · thực thu`);
   if(actualOutgoing)sources.push(`${project.name} · thực chi`);
   const requests=(ops.paymentRequests||[]).filter(row=>row.projectId===project.id&&!row.deletedAt&&!['rejected'].includes(row.status));
   for(const request of requests){const received=sumBy((data.receipts||[]).filter(row=>row.paymentRequestId===request.id),'amount'),remaining=Math.max(0,request.amount-received);const dueMonth=request.dueDate?.slice(0,7);const target=dueMonth<startMonth?startMonth:dueMonth;if(target===month&&remaining>0){const certainty=request.status==='sent'?1:.8;incoming+=remaining*certainty;sources.push(`${project.name} · ${request.code} (${certainty*100}%)`);}}
   for(const milestone of metrics.milestones){if(requests.some(row=>row.milestoneId===milestone.id))continue;const planned=milestone.expectedDate&&addDate(milestone.expectedDate,15);if(planned?.slice(0,7)===month){incoming+=Number(milestone.amount||0)*.8;sources.push(`${project.name} · ${milestone.title} (80%)`);}}
   for(const request of (ops.expenseRequests||[]).filter(row=>row.projectId===project.id&&row.committedAt&&!['settled','rejected'].includes(row.status))){const paid=sumBy((data.expenses||[]).filter(row=>row.expenseRequestId===request.id&&row.status==='approved'),'amount'),remaining=Math.max(0,Number(request.amount||0)-paid);if((request.dueDate||vietnamDay()).slice(0,7)===month)outgoing+=remaining;}
  }
  // Legacy manual plans remain readable; no old amount is overwritten or converted.
  if(!version)for(const plan of legacy?.cashPlans?.filter(row=>row.month===month)||[]){incoming+=Number(plan.inflow)||0;outgoing+=Number(plan.outflow)||0;}
  const net=incoming-outgoing;balance=balance==null?null:balance+net;
  return {month,incoming,outgoing,net,balance,note:[line.note,...sources].filter(Boolean).join('; ')};
 });
 return {rows,version,minBalance:rows.every(row=>row.balance!=null)?Math.min(...rows.map(row=>row.balance)):null,spendingMonths:rows.filter(row=>row.outgoing>row.incoming).length,openingBalance};
}
