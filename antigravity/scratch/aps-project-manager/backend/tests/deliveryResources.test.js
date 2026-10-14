import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { fiscalMonths, fiscalStart, monthSnapshot, vietnamMonth } from '../../frontend/src/utils/deliveryResources.js';
import { computeDelivery } from '../../frontend/src/utils/deliveryMetrics.js';

test('legacy linked CR work excludes baseline effort while preserving approved actual hours', () => {
  const items = ['original', 'rework'].map(id => ({ id, projectId: 'p', startDate: '2026-10-12', endDate: '2026-10-13', assignees: [{ employeeId: 'e', estimatedHoursPerDay: 8 }] }));
  const db = { projects: [{ id: 'p', startDate: '2026-10-01', endDate: '2026-10-31' }], employees: [{ id: 'e' }], ganttItems: items };
  const data = { settings: { contractFee: 1000, hourlyRate: 10 }, records: {}, changes: [{ id: 'cr', reworkTaskId: 'rework', status: 'Đã duyệt', free: false }], timesheets: [{ id: 'tt', taskId: 'rework', employeeId: 'e', date: '2026-10-12', hours: 8, status: 'approved' }] };
  const result = computeDelivery(db, 'p', data);
  assert.equal(result.taskMetrics.rework.planned, 0); assert.equal(result.taskMetrics.rework.output, 0);
  assert.equal(result.taskMetrics.rework.actualHours, 8); assert.equal(result.taskMetrics.rework.laborCost, 80);
  assert.equal(result.summary.totalPlanned, result.taskMetrics.original.planned);
});

test('October–September fiscal periods and locked snapshots retain their original amounts', () => {
  assert.equal(fiscalStart('2027-09'), 2026); assert.equal(fiscalStart('2027-10'), 2027);
  assert.deepEqual([fiscalMonths(2026)[0], fiscalMonths(2026).at(-1)], ['2026-10', '2027-09']);
  const data = { settings: { contractFee: 1000 }, history: [{ at: '2026-09-30T12:00:00Z', output: 100, completion: 10 }], closes: [{ id: 'c', month: '2026-10', status: 'closed', output: 200, cumulative: 300, completion: 30, fee: 1000, startCompletion: 10 }] };
  assert.equal(monthSnapshot(data, '2026-10', { summary: { output: 999, completion: 99 } }).output, 200);
});

test('resource APIs persist procedure events/components, CR decisions, scoped reporting, review/lock/reopen and annual plans', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-resources-'));
  const previous = process.env.APS_DB_PATH; process.env.APS_DB_PATH = path.join(directory, 'db.json');
  const month = vietnamMonth(); const year = fiscalStart(month);
  const baseData = () => ({ revision: 0, settings: { contractFee: 1000 }, records: {}, documents: [], changes: [], closes: [], timesheets: [], receipts: [], expenses: [], milestones: [], evidence: [], comments: [], audit: [], history: [] });
  const db = { projects: [{ id: 'p', name: 'Dự án phụ trách', manager: 'manager@aps.vn', startDate: `${month}-01`, endDate: `${month}-28` }, { id: 'other', name: 'Dự án khác', manager: 'Người khác', startDate: `${month}-01`, endDate: `${month}-28` }], employees: [{ id: 'e', name: 'Duy' }], tasks: [], overtimes: [], ganttItems: ['a', 'b'].map(id => ({ id, projectId: 'p', title: id, startDate: `${month}-01`, endDate: `${month}-02`, assignees: [{ employeeId: 'e', employeeName: 'Duy', estimatedHoursPerDay: 8 }] })), delivery: { users: [], sessions: [], templates: [], projects: { p: baseData(), other: baseData() } } };
  fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify(db));
  let server;
  try {
    const { default: routes } = await import('../src/routes/api.js');
    const app = express(); app.use(express.json()); app.use('/api', routes); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/delivery`;
    const call = async (endpoint, method = 'GET', body, token) => { const response = await fetch(url + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, ...await response.json() }; };
    const admin = (await call('/session', 'POST', { email: 'demo@aps.vn', password: 'APS@2026' })).data.token;
    const tokens = { admin };
    for (const role of ['manager', 'accountant', 'employee']) {
      assert.equal((await call('/users', 'POST', { email: `${role}@aps.vn`, name: role, role, employeeId: role === 'employee' ? 'e' : '', password: 'password1' }, admin)).status, 200);
      tokens[role] = (await call('/session', 'POST', { email: `${role}@aps.vn`, password: 'password1' })).data.token;
    }
    let state = (await call('/p', 'GET', null, admin)).data;
    const mutate = async (action, value, id, token = admin) => { const response = await call('/p', 'PATCH', { action, value, id, revision: state.revision }, token); if (response.status === 200) state = response.data; return response; };
    assert.equal((await mutate('document', { title: 'ĐTM', status: 'Bổ sung', taskId: 'a', procedureKey: 'environment', authority: 'Cơ quan của dự án', dueAt: `${month}-20T16:30:00+07:00`, fee: 32000000, processingTime: 'Theo danh mục dự án', expectedAt: `${month}-28` })).status, 200);
    const documentId = state.documents[0].id;
    assert.equal((await mutate('documentEvent', { documentId, title: 'Đã nộp hồ sơ', at: `${month}-10T14:30:00+07:00`, type: 'submission', reference: 'BN-01', employeeId: 'e' })).status, 200);
    assert.equal((await mutate('documentComponent', { documentId, title: 'Báo cáo chỉnh sửa', employeeId: 'e', status: 'Xong' })).status, 200);
    assert.equal(state.documents[0].events[0].reference, 'BN-01'); assert.equal(state.documents[0].components[0].status, 'Xong');
    assert.equal((await mutate('documentEvent', { documentId: 'wrong', title: 'Sai hồ sơ', at: `${month}-10` })).status, 400);
    assert.equal((await call('/p', 'GET', null, tokens.employee)).data.documents[0].fee, undefined);
    assert.equal((await mutate('change', { title: 'Điều chỉnh mặt bằng', status: 'Đề xuất', scope: 'Ngoài phạm vi', department: 'KT', estimatedHours: 36, taskId: 'a', amount: 12000000, decision: 'pending' })).status, 200);
    const change = state.changes[0];
    assert.equal((await mutate('change', { ...change, decision: 'free', status: 'Đã duyệt', reworkTaskId: 'b' }, change.id, tokens.manager)).status, 400);
    assert.equal((await mutate('change', { ...change, decision: 'free', status: 'Đã duyệt', reworkTaskId: 'b' }, change.id)).status, 200);
    assert.equal(state.records.b.isChangeWork, true); assert.equal(state.taskMetrics.b.planned, 0); assert.equal(state.taskMetrics.b.output, 0);
    const reportUrl = `/reporting?year=${year}&month=${month}`;
    assert.equal((await call(reportUrl, 'GET', null, tokens.employee)).status, 403);
    assert.deepEqual((await call(reportUrl, 'GET', null, tokens.manager)).data.projects.map(row => row.id), ['p']);
    assert.equal((await call(reportUrl, 'GET', null, tokens.manager)).data.pipeline, null);
    let report = (await call(reportUrl, 'GET', null, admin)).data;
    const reporting = async (action, value = {}, token = admin) => {
      const response = await call('/reporting', 'POST', { action, value, year, month, revisions: Object.fromEntries(report.projects.map(row => [row.id, row.revision])) }, token);
      if (response.status === 200) report = response.data; return response;
    };
    assert.equal((await reporting('reviewMonth', { projectId: 'other' }, tokens.manager)).status, 400);
    assert.equal((await reporting('reviewMonth', { projectId: 'p' })).status, 200);
    assert.equal((await reporting('approveMonth', {}, tokens.accountant)).status, 400);
    assert.equal((await reporting('approveMonth')).status, 400, 'all projects must be reviewed before atomic approval');
    report = (await call(reportUrl, 'GET', null, admin)).data;
    assert.equal(report.projects.find(row => row.id === 'p').month.status, 'reviewed');
    assert.equal((await reporting('reviewMonth', { projectId: 'other' })).status, 200);
    assert.equal((await reporting('approveMonth')).status, 200);
    assert.ok(report.projects.every(row => row.month.status === 'closed'));
    const locked = report.projects.find(row => row.id === 'p').month;
    state = (await call('/p', 'GET', null, admin)).data;
    assert.equal((await mutate('settings', { contractFee: 9000 })).status, 200);
    report = (await call(reportUrl, 'GET', null, admin)).data;
    assert.equal(report.projects.find(row => row.id === 'p').month.fee, locked.fee);
    assert.equal(report.projects.find(row => row.id === 'p').month.output, locked.output);
    assert.equal((await reporting('reopenMonth', { projectId: 'p' })).status, 400);
    assert.equal((await reporting('reopenMonth', { projectId: 'p', reason: 'Điều chỉnh biên bản' })).status, 200);
    assert.equal((await reporting('approvePlan', { revision: 0, projects: { p: 1200000000 } }, tokens.accountant)).status, 400);
    assert.equal((await reporting('savePlan', { revision: 0, projects: { p: 1200000000, other: 800000000, __pipeline__: 500000000 } }, tokens.accountant)).status, 200);
    assert.equal((await reporting('approvePlan', { revision: 1, projects: { p: 1200000000, other: 800000000, __pipeline__: 500000000 } })).status, 200);
    assert.equal(report.plan.status, 'approved'); assert.equal(report.projects[0].annualPlan, 1200000000);
    assert.equal(report.pipeline.annualPlan, 500000000);
    assert.equal((await reporting('savePlan', { revision: 0, projects: {} })).status, 400);
    const persisted = JSON.parse(fs.readFileSync(process.env.APS_DB_PATH, 'utf8'));
    assert.ok(persisted.delivery.projects.p.audit.some(row => row.action.startsWith('reopenMonth')));
    assert.equal(persisted.delivery.fiscalPlans[year].approvedBy, 'demo@aps.vn');
    assert.equal(persisted.delivery.projects.p.documents[0].components.length, 1);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.APS_DB_PATH; else process.env.APS_DB_PATH = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
