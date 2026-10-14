import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAssignmentHours, calculatePlannedPersonDays } from '../../frontend/src/utils/ganttEffort.js';
import { computeDelivery } from '../../frontend/src/utils/deliveryMetrics.js';
import { monthSnapshot } from '../../frontend/src/utils/deliveryResources.js';
import { cashflowReport } from '../src/utils/operationsCashflow.js';

test('Saturday contributes four hours and unassigned template work keeps planned effort', () => {
  const item={id:'t',startDate:'2026-10-09',endDate:'2026-10-10',estimatedHoursPerDay:8,estimatedHours:12};
  assert.equal(calculateAssignmentHours(item,{employeeId:'e',excludeNonWorkingDays:true}),12);
  assert.equal(calculatePlannedPersonDays({...item,assignees:[]}),1.5);
});

test('weekly entry replaces the matching clock candidate instead of doubling actual hours', () => {
  const item={id:'t',projectId:'p',startDate:'2026-10-12',endDate:'2026-10-12',estimatedHours:8,actualWorkEntries:[{id:'clock',employeeId:'e',date:'2026-10-12',hours:8}]};
  const db={projects:[{id:'p',startDate:'2026-10-01',endDate:'2026-10-31'}],employees:[{id:'e'}],tasks:[],ganttItems:[item]};
  const data={settings:{},timesheets:[{id:'week',taskId:'t',employeeId:'e',date:'2026-10-12',hours:8,shiftType:'regular',source:'weekly',status:'approved'}]};
  assert.equal(computeDelivery(db,'p',data,new Date('2026-10-13T00:00:00Z')).summary.totalActual,1);
});

test('cash forecast keeps the same total when a forecast receipt becomes actual and retains partial commitments', () => {
  const lines=Array.from({length:6},(_,index)=>({month:new Date(Date.UTC(2026,9+index,1)).toISOString().slice(0,7)}));
  const db={projects:[{id:'p',name:'Dự án'}],employees:[],tasks:[],ganttItems:[],operations:{cashForecasts:[{month:'2026-10',openingBalance:100,status:'approved',lines}],paymentRequests:[{id:'pay',projectId:'p',code:'ĐNTT-1',amount:50,dueDate:'2026-10-20',status:'sent'}],expenseRequests:[{id:'cost',projectId:'p',amount:5,dueDate:'2026-10-20',status:'partiallyPaid',committedAt:'2026-10-01'}]},delivery:{projects:{p:{settings:{},milestones:[],receipts:[{paymentRequestId:'pay',date:'2026-10-13',amount:20}],expenses:[{expenseRequestId:'cost',date:'2026-10-13',amount:1,status:'approved'}]}}}};
  const october=cashflowReport(db,'2026-10').rows[0];
  assert.equal(october.incoming,50);
  assert.equal(october.outgoing,5);
  assert.equal(october.balance,145);
});

test('a reopened month reads current metrics instead of the stale draft snapshot', () => {
  const data={settings:{contractFee:100},closes:[{month:'2026-09',status:'reopened'}],draftSnapshots:{'2026-09':{cumulative:10,completion:10}}};
  const snapshot=monthSnapshot(data,'2026-09',{summary:{output:50,completion:50,efficiency:1}},new Date('2026-10-13T00:00:00Z'));
  assert.equal(snapshot.cumulative,50);
  assert.equal(snapshot.completion,50);
});
