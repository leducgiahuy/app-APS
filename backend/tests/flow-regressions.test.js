import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateTaskHierarchyWeightPercent, calculateAssignmentHours, calculatePlannedPersonDays, calculateUnassignedPlannedPersonDays } from '../../frontend/src/utils/ganttEffort.js';
import { computeDelivery } from '../../frontend/src/utils/deliveryMetrics.js';
import { monthSnapshot } from '../../frontend/src/utils/deliveryResources.js';
import { cashflowReport } from '../src/utils/operationsCashflow.js';
import { syncProjectNameReferences } from '../src/controllers/projectController.js';

test('Saturday contributes four hours and unassigned template work keeps planned effort', () => {
  const item={id:'t',startDate:'2026-10-09',endDate:'2026-10-10',estimatedHoursPerDay:8,estimatedHours:12};
  assert.equal(calculateAssignmentHours(item,{employeeId:'e',excludeNonWorkingDays:true}),12);
  assert.equal(calculatePlannedPersonDays({...item,assignees:[]}),1.5);
  assert.equal(calculateUnassignedPlannedPersonDays({...item,estimatedHours:undefined,assignees:[]}),2);
});

test('delivery weights recalculate from planned effort and ignore manual contract work', () => {
  const first={id:'a',projectId:'p',startDate:'2026-10-12',endDate:'2026-10-13',estimatedHours:16,estimatedHoursPerDay:8,assignees:[]};
  const second={id:'b',projectId:'p',startDate:'2026-10-12',endDate:'2026-10-13',estimatedHours:16,estimatedHoursPerDay:8,assignees:[]};
  const db={projects:[{id:'p',startDate:'2026-10-01',endDate:'2026-10-31'}],employees:[{id:'e'}],tasks:[],ganttItems:[first,second]};
  const weights=()=>computeDelivery(db,'p',{settings:{}},new Date('2026-10-13T00:00:00Z')).taskMetrics;
  assert.equal(weights().a.weight,.5);
  assert.equal(weights().b.weight,.5);

  second.assignees=[{employeeId:'e',startDate:'2026-10-12',endDate:'2026-10-13',estimatedHoursPerDay:4}];
  assert.equal(weights().a.weight,2/3);
  assert.equal(weights().b.weight,1/3);

  second.assignees=[];
  second.estimatedHours=8;
  assert.equal(weights().a.weight,2/3);
  assert.equal(weights().b.weight,1/3);

  second.estimatedHours=undefined;
  second.estimatedHoursPerDay=2;
  assert.equal(weights().a.weight,.8);
  assert.equal(weights().b.weight,.2);

  second.contractWork=99;
  assert.equal(weights().a.weight,.8);
  assert.equal(weights().b.weight,.2);
});

test('displayed child weights add up exactly to the displayed parent weight', () => {
  const items=[{id:'parent'},{id:'a',parentTaskId:'parent'},{id:'b',parentTaskId:'parent'},{id:'c',parentTaskId:'parent'}];
  const weights=new Map([['parent',1],['a',1/3],['b',1/3],['c',1/3]]);
  const displayed=allocateTaskHierarchyWeightPercent(items,item=>weights.get(item.id));
  assert.equal(displayed.get('parent'),100);
  assert.equal(Math.round((displayed.get('a')+displayed.get('b')+displayed.get('c'))*10)/10,displayed.get('parent'));
  assert.deepEqual([displayed.get('a'),displayed.get('b'),displayed.get('c')],[33.4,33.3,33.3]);
});

test('completed actual work appears only after completion and converts hours to eight-hour days', () => {
  const completed = { id: 'done', projectId: 'p', startDate: '2026-10-01', endDate: '2026-10-03', estimatedHours: 24, actualWorkHours: 12, status: 'completed', assignees: [{ employeeId: 'e', startDate: '2026-10-01', endDate: '2026-10-03', estimatedHoursPerDay: 8 }] };
  const active = { id: 'active', projectId: 'p', startDate: '2026-10-04', endDate: '2026-10-06', estimatedHours: 24, actualWorkHours: 16, status: 'in_progress', assignees: [{ employeeId: 'e', startDate: '2026-10-04', endDate: '2026-10-06', estimatedHoursPerDay: 8 }] };
  const db = { projects: [{ id: 'p', startDate: '2026-10-01', endDate: '2026-10-31' }], employees: [{ id: 'e' }], tasks: [], ganttItems: [completed, active] };
  const metrics = computeDelivery(db, 'p', { settings: {} }, new Date('2026-10-07T00:00:00Z'));
  assert.equal(metrics.taskMetrics.done.completedActualHours, 12);
  assert.equal(metrics.taskMetrics.done.completedActual, 1.5);
  assert.equal(metrics.taskMetrics.active.completedActual, null);
  assert.equal(metrics.summary.totalCompletedActual, 1.5);
});

test('renaming a project synchronizes stored project-name copies by stable project id', () => {
  const db={
    projects:[{id:'p',name:'Tên cũ'},{id:'other',name:'Dự án khác'}],
    ganttItems:[{id:'g',projectId:'p'}],
    tasks:[
      {id:'by-id',projectId:'p',projectName:'Tên cũ'},
      {id:'by-gantt',ganttId:'g',projectName:'Tên cũ'},
      {id:'legacy',projectName:'Tên cũ'},
      {id:'other',projectId:'other',projectName:'Dự án khác'},
    ],
    workforcePlan:{demands:[{id:'d',projectId:'p',projectName:'Tên cũ'}]},
    operations:{paymentRequests:[{id:'a',projectId:'p',projectName:'Tên cũ'}],audit:[{id:'history',projectId:'p',projectName:'Tên cũ'}]},
  };
  syncProjectNameReferences(db,'p','Tên cũ','Tên mới');
  assert.deepEqual(db.tasks.slice(0,3).map(item=>item.projectName),['Tên mới','Tên mới','Tên mới']);
  assert.equal(db.tasks[3].projectName,'Dự án khác');
  assert.equal(db.workforcePlan.demands[0].projectName,'Tên mới');
  assert.equal(db.operations.paymentRequests[0].projectName,'Tên mới');
  assert.equal(db.operations.audit[0].projectName,'Tên cũ');
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
