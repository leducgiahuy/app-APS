import { cashflowReport } from './operationsCashflow.js';
import { financeReport } from './operationsReports.js';
import { projectActor,operations } from './operationsStore.js';
import { moneyRole,roleAllows } from '../../../frontend/src/utils/operationsDefaults.js';
import { computeDelivery, moneyAccess, projectDeliveryItems } from '../../../frontend/src/utils/deliveryMetrics.js';
import { fiscalMonths, fiscalStart, monthSnapshot, vietnamMonth } from '../../../frontend/src/utils/deliveryResources.js';
import { buildWorkforceForecast } from '../../../frontend/src/utils/workforceForecast.js';

export const emptyExecutiveSettings = () => ({ revision: 0, openingMonth: '', openingBalance: null, productivityTarget: 6800000, onTimeTarget: 95, collectionTargets: {}, cashPlans: [], receivables: [], contracts: [] });
const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const day = value => value ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10) : '';
const monthsFrom = month => Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + i, 1)).toISOString().slice(0, 7));
function submissions(data, metrics, items) {
  const entries = items.filter(item => metrics.records[item.id]?.dueAt).map(item => ({ ...metrics.records[item.id], taskId: item.id, code: item.code || item.title, title: item.title }));
  (data.documents || []).filter(doc => doc.dueAt && !entries.some(row => row.taskId === doc.taskId)).forEach(doc => {
    const sentAt = doc.events?.filter(row => row.type === 'submission').toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)?.at || '';
    entries.push({ taskId: doc.taskId || `document:${doc.id}`, documentId: doc.id, code: doc.title, title: doc.title, dueAt: doc.dueAt, sentAt, completed: doc.status === 'Có kết quả' });
  });
  return entries;
}
export function managesProject(db, user, project) {
  const employee = db.employees?.find(row => row.id === user.employeeId);
  return [user.email, user.name, user.employeeId, employee?.name].filter(Boolean).includes(project.manager) || Boolean(user.employeeId && project.managerId === user.employeeId) || project.managerEmail === user.email;
}

// Derived from the same recognized effort, approved hours and immutable closes as Gantt.
// Receivables are invoice balances, not contract fee minus production.
export function buildExecutiveReport(db, user, month, now = new Date()) {
  const director = ['director', 'admin'].includes(user.role);
  const financial = moneyAccess(user.role);
  const config = { ...emptyExecutiveSettings(), ...db.delivery?.executive };
  config.receivables=[...config.receivables,...(db.operations?.paymentRequests||[]).filter(r=>r.status==='sent').map(r=>({...r,title:r.code,paidAmount:sum((db.delivery?.projects?.[r.projectId]?.receipts||[]).filter(receipt=>receipt.paymentRequestId===r.id),'amount')}))];
  const currentMonth = vietnamMonth(now);
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1) - 7 * 3600000);
  const asOf = month < currentMonth ? new Date(end.getTime() - 1) : now;
  const today = day(now);
  const actions = [];
  const portfolio = (db.projects || []).filter(p=>projectActor(db,user,p.id)).map(project => {
    const data = db.delivery?.projects?.[project.id] || {};
    const metrics = computeDelivery(db, project.id, data, now);
    const planMetrics = month < currentMonth ? computeDelivery(db, project.id, data, asOf) : metrics;
    const snapshot = monthSnapshot(data, month, metrics, now);
    const effective=projectActor(db,user,project.id),explicit=(db.operations?.members||[]).some(m=>m.projectId===project.id&&m.email===user.email&&!m.deletedAt);
    const maySeeMoney = moneyRole(effective.role) && roleAllows('hdValue',effective.role) && (user.role !== 'manager' || explicit || managesProject(db, user, project));
    const approvedBudget=(db.operations?.budgets||[]).some(b=>b.projectId===project.id&&b.status==='approved');
    const projectedMargin=approvedBudget&&maySeeMoney?financeReport(db,project.id,effective).marginPercent:null;
    const items = projectDeliveryItems(db, project.id);
    const entries = submissions(data, metrics, items);
    const urgent = entries.filter(row => !row.sentAt && !row.completed && Date.parse(row.dueAt) - now.getTime() < 72 * 3600000).map(row => {
      const hours = (Date.parse(row.dueAt) - now.getTime()) / 3600000;
      return { taskId: row.taskId, documentId: row.documentId, code: row.code, title: row.title, dueAt: row.dueAt, hours, overdue: hours < 0 };
    }).sort((a, b) => a.hours - b.hours);
    if (director) {
      urgent.forEach(item => actions.push({ id: `task:${item.taskId}`, kind: item.documentId ? 'document' : 'task', projectId: project.id, taskId: item.taskId, code: item.code, title: `${item.title} · ${item.overdue ? 'Quá hạn nộp hồ sơ' : 'Sắp đến hạn nộp hồ sơ'}`, dueAt: item.dueAt, priority: item.overdue ? 0 : 1 }));
      (data.changes || []).filter(row => row.status !== 'Từ chối' && (!row.decision || row.decision === 'pending')).forEach(row => actions.push({ id: `change:${row.id}`, kind: 'change', projectId: project.id, changeId: row.id, code: row.code, title: `Quyết định thu phí / miễn phí: ${row.title}`, amount: row.amount, priority: 2 }));
      metrics.milestones.filter(row => row.reminder).forEach(row => actions.push({ id: `milestone:${row.id}`, kind: 'payment', projectId: project.id, code: project.name, title: `${row.title} đủ điều kiện, chưa gửi đề nghị thanh toán`, amount: row.amount, priority: 2 }));
    }
    const overdueDebts = config.receivables.filter(row => row.projectId === project.id && row.dueDate < today && Number(row.amount) > Number(row.paidAmount || 0));
    if (director) overdueDebts.forEach(row => actions.push({ id: `debt:${row.id}`, kind: 'debt', projectId: project.id, recordId: row.id, code: project.name, title: `${row.title} · Công nợ quá hạn`, amount: Number(row.amount) - Number(row.paidAmount || 0), dueAt: row.dueDate, priority: 0 }));
    const months = fiscalMonths(fiscalStart(month)).filter(key => key <= month).map(key => monthSnapshot(data, key, metrics, now));
    const overdueAmount = overdueDebts.reduce((total, row) => total + Number(row.amount) - Number(row.paidAmount || 0), 0);
    return { id: project.id, name: project.name, code: project.code, manager: project.manager, endDate: project.endDate, completion: snapshot.completion ?? metrics.summary.completion,
      planPercent: planMetrics.summary.planPercent, deviation: (snapshot.completion ?? metrics.summary.completion) - planMetrics.summary.planPercent,
      efficiency: month < currentMonth ? snapshot.efficiency ?? null : metrics.summary.efficiency, urgent,
      ...(maySeeMoney ? { financial: true, output: snapshot.output, outputStatus: snapshot.status, annualOutput: months.filter(row => row.status === 'closed').reduce((total, row) => total + Number(row.output || 0), 0),
        fee: data.settings?.contractFee ?? null, cost: metrics.summary.cost,
        grossMargin: approvedBudget ? projectedMargin : metrics.summary.output > 0 && metrics.summary.cost != null ? (metrics.summary.output - metrics.summary.cost) / metrics.summary.output * 100 : null,
        overdueAmount, overdueDays: overdueDebts.length ? Math.max(...overdueDebts.map(row => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.dueDate}T00:00:00Z`)) / 86400000))) : 0 } : { financial: false }),
      // Internal aggregates are removed before responding.
      _data: data, _metrics: metrics, _snapshot: snapshot, _submissions: entries };
  });
  const result = { month, viewer: { role: user.role, email: user.email, name: user.name }, permissions: { executive: director, configure: director || ['accountant','chiefAccountant'].includes(user.role), financial }, projects: portfolio.map(({ _data, _metrics, _snapshot, _submissions, ...row }) => row) };
  if (director) {
    const forecast = buildWorkforceForecast({ ...db, plan: db.workforcePlan || {}, now });
    forecast.recruitment.filter(row => row.status !== 'Nhận việc').forEach(row => actions.push({ id: `capacity:${row.key}`, kind: 'capacity', code: row.position, title: `${row.reason} → cần ${row.quantity} người hoặc thuê ngoài`, priority: 3 }));
    config.contracts.filter(row => row.status === 'pending').forEach(row => actions.push({ id: `contract:${row.id}`, kind: 'contract', recordId: row.id, code: row.code, title: `Ký hợp đồng: ${row.title}`, amount: row.amount, priority: 2 }));
    const received = portfolio.flatMap(row => row._data.receipts || []);
    const expenses = portfolio.flatMap(row => (row._data.expenses || []).filter(entry => entry.status === 'approved'));
    const monthlyActual = portfolio.reduce((total, row) => total + row._metrics.timesheets.filter(entry => entry.status === 'approved' && entry.date?.slice(0, 7) === month && entry.date <= today).reduce((hours, entry) => hours + Number(entry.hours), 0) / 8, 0);
    const dated = portfolio.flatMap(row => row._submissions).filter(row => row.dueAt && day(row.dueAt).slice(0, 7) === month && (Date.parse(row.dueAt) <= asOf.getTime() || row.sentAt));
    const onTime = dated.filter(row => row.sentAt && Date.parse(row.sentAt) <= Date.parse(row.dueAt)).length;
    const annualPlan = sum(Object.entries(db.delivery?.fiscalPlans?.[fiscalStart(month)]?.projects || {}).map(([id, value]) => ({ value })), 'value');
    const cash = [];
    const ratesMissing = portfolio.some(row => row._metrics.timesheets.some(entry => entry.status === 'approved' && entry.date >= `${config.openingMonth}-01` && entry.date <= today && row._data.settings?.rates?.[entry.employeeId] == null && row._data.settings?.hourlyRate == null));
    let balance = config.openingBalance == null || !config.openingMonth || config.openingMonth > month || ratesMissing ? null : Number(config.openingBalance);
    const historyMonths = balance == null ? [] : (() => { const keys = []; for (let key = config.openingMonth; key <= monthsFrom(month).at(-1);) { keys.push(key); const date = new Date(`${key}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); key = date.toISOString().slice(0, 7); } return keys; })();
    for (const key of historyMonths) {
      const plans = config.cashPlans.filter(row => row.month === key);
      // Actual entries up to today; plans are remaining cash flow, avoiding duplicates.
      const inflow = sum(received.filter(row => row.date?.slice(0, 7) === key && row.date <= today), 'amount') + sum(plans, 'inflow');
      const outflow = sum(expenses.filter(row => row.date?.slice(0, 7) === key && row.date <= today), 'amount') + portfolio.reduce((total, row) => total + row._metrics.timesheets.filter(entry => entry.status === 'approved' && entry.date?.slice(0, 7) === key && entry.date <= today).reduce((cost, entry) => cost + Number(entry.hours) * Number(row._data.settings?.rates?.[entry.employeeId] ?? row._data.settings?.hourlyRate ?? 0), 0), 0) + sum(plans, 'outflow');
      balance += inflow - outflow;
      if (key >= month) cash.push({ month: key, balance, inflow, outflow, spendingMore: outflow > inflow });
    }
    if (!cash.length) monthsFrom(month).forEach(key => cash.push({ month: key, balance: null, inflow: null, outflow: null }));
    if(db.operations?.cashForecasts?.length||db.operations?.paymentRequests?.length){const forecastCash=cashflowReport(db,month);cash.splice(0,cash.length,...forecastCash.rows.map(r=>({...r,inflow:r.incoming,outflow:r.outgoing,spendingMore:r.outgoing>r.incoming})));}
    for(const request of [...(db.operations?.expenseRequests||[]),...(db.operations?.projectApprovals||[]),...(db.operations?.budgets||[])].filter(r=>r.status==='pending'&&r.steps?.find(step=>step.status==='pending')?.role==='director'))actions.push({id:`operation:${request.id}`,kind:'operation',projectId:request.projectId,code:request.code||'Duyệt',title:request.title||'Duyệt dự án / ngân sách',amount:request.amount,priority:2});
    const known = cash.filter(row => row.balance != null);
    const productionKnown = portfolio.filter(row => row._snapshot.output != null);
    const monthOutput = productionKnown.length ? productionKnown.reduce((total, row) => total + row._snapshot.output, 0) : null;
    result.executive = { monthlyOutput: monthOutput, productionComplete: productionKnown.length === portfolio.length, monthlyStatus: portfolio.length && portfolio.every(row => row._snapshot.status === 'closed') ? 'closed' : 'draft',
      annualOutput: sum(result.projects, 'annualOutput'), annualPlan: annualPlan || null,
      productivity: monthlyActual && productionKnown.length === portfolio.length ? monthOutput / monthlyActual : null,
      onTime: dated.length ? onTime / dated.length * 100 : null, onTimeCount: onTime, submissionCount: dated.length,
      collected: sum(received.filter(row => row.date?.slice(0, 7) === month && row.date <= today), 'amount'), collectionTarget: config.collectionTargets[month] ?? null,
      overdueAmount: sum(result.projects, 'overdueAmount'), minBalance: known.length ? Math.min(...known.map(row => row.balance)) : null,
      productivityTarget: config.productivityTarget, onTimeTarget: config.onTimeTarget, cash, actions: actions.sort((a, b) => a.priority - b.priority || String(a.dueAt || '').localeCompare(String(b.dueAt || ''))),
      annualToDatePlan: annualPlan ? annualPlan * (fiscalMonths(fiscalStart(month)).indexOf(month) + 1) / 12 : null };
  }
  if (result.permissions.configure) result.settings = config;
  return result;
}
