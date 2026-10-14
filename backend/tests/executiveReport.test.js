import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { buildExecutiveReport } from '../src/utils/executiveReport.js';
const fixture = () => ({ employees: [], tasks: [], projects: [{ id: 'p', name: 'Dự án A', manager: 'manager@aps.vn', startDate: '2026-10-01', endDate: '2026-12-31' }, { id: 'q', name: 'Dự án B', startDate: '2026-10-01', endDate: '2026-12-31' }], ganttItems: [{ id: 't', projectId: 'p', title: 'Hồ sơ ĐTM', code: 'B1.2', startDate: '2026-10-01', endDate: '2026-10-02', assignees: [{ employeeId: 'e', estimatedHoursPerDay: 8 }] }], delivery: { projects: { p: { settings: { contractFee: 100000000, hourlyRate: 100000 }, records: { t: { level: 60, evidenceId: 'proof', confirmedBy: 'leader', dueAt: '2026-10-10T17:00:00+07:00', sentAt: '2026-10-10T16:00:00+07:00' } }, timesheets: [{ id: 'ts', taskId: 't', employeeId: 'e', date: '2026-10-09', hours: 8, status: 'approved' }], receipts: [{ amount: 10000000, date: '2026-10-05' }], expenses: [{ amount: 1000000, date: '2026-10-06', status: 'approved' }], history: [{ at: '2026-10-10T17:00:00Z', output: 60000000, completion: 60 }], changes: [{ id: 'cr', code: 'CR-01', title: 'Thêm phạm vi', decision: 'pending' }] } }, executive: { openingMonth: '2026-10', openingBalance: 100000000, collectionTargets: { '2026-10': 20000000 }, cashPlans: [{ month: '2026-11', inflow: 0, outflow: 20000000 }], receivables: [{ id: 'd', projectId: 'p', title: 'Đợt 1', dueDate: '2026-10-01', amount: 20000000, paidAmount: 5000000 }], contracts: [{ id: 'c', code: 'HĐ-01', title: 'Thuê phối cảnh', amount: 5000000, status: 'pending' }] } } });
const now = new Date('2026-10-13T10:00:00+07:00');
test('executive uses recognized progress, approved hours, receipts, debts and cumulative cash; masks financial data by role', () => {
  const db = fixture();
  const admin = buildExecutiveReport(db, { role: 'admin' }, '2026-10', now);
  assert.equal(admin.projects[0].completion, 60);
  assert.equal(admin.projects[0].efficiency, 1.2);
  assert.equal(admin.executive.collected, 10000000);
  assert.equal(admin.executive.onTime, 100);
  assert.equal(admin.executive.overdueAmount, 15000000);
  assert.equal(admin.executive.cash.length, 6);
  assert.equal(admin.executive.cash[0].balance, 108200000);
  assert.equal(admin.executive.cash[1].balance, 88200000);
  assert.equal(admin.executive.cash[1].spendingMore, true);
  assert(admin.executive.actions.some(row => row.kind === 'change'));
  assert(admin.executive.actions.some(row => row.kind === 'contract'));
  const employee = buildExecutiveReport(db, { role: 'employee' }, '2026-10', now);
  assert.equal(employee.executive, undefined); assert.equal(employee.settings, undefined);
  assert.equal(employee.projects[0].fee, undefined); assert.equal(employee.projects[0].grossMargin, undefined);
  const manager = buildExecutiveReport(db, { role: 'manager', email: 'manager@aps.vn' }, '2026-10', now);
  assert.equal(manager.projects.length, 2); assert.equal(manager.projects[0].financial, true); assert.equal(manager.projects[1].financial, false);
  delete db.delivery.projects.p.records.t.confirmedBy;
  assert.equal(buildExecutiveReport(db, { role: 'admin' }, '2026-10', now).projects[0].completion, 40);
});
test('locked production remains immutable; missing opening balance/rates remain unknown; late submission fails on-time rate', () => {
  const db = fixture();
  db.delivery.projects.p.closes = [{ month: '2026-10', status: 'closed', output: 123, cumulative: 123, completion: 20, fee: 1000 }];
  db.delivery.projects.p.settings.contractFee = 200000000;
  db.delivery.projects.p.records.t.sentAt = '2026-10-11T09:00:00+07:00';
  let report = buildExecutiveReport(db, { role: 'admin' }, '2026-10', now);
  assert.equal(report.executive.monthlyOutput, 123); assert.equal(report.projects[0].completion, 20); assert.equal(report.executive.annualOutput, 123);
  assert.equal(report.executive.onTime, 0);
  delete db.delivery.projects.p.settings.hourlyRate;
  report = buildExecutiveReport(db, { role: 'admin' }, '2026-10', now);
  assert.equal(report.executive.minBalance, null);
  assert(report.executive.cash.every(row => row.balance == null));
});
test('executive API persists financial inputs, rejects stale edits and unauthorized writes, validates balances and signature permissions', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-executive-'));
  process.env.APS_DB_PATH = path.join(directory, 'db.json');
  const db = fixture(); db.delivery.users = []; db.delivery.sessions = [];
  fs.writeFileSync(process.env.APS_DB_PATH, JSON.stringify(db));
  let server;
  try {
    const { default: routes } = await import('../src/routes/api.js');
    const app = express(); app.use(express.json()); app.use('/api', routes);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/delivery`;
    const call = async (endpoint, method = 'GET', body, token) => {
      const response = await fetch(url + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, ...await response.json() };
    };
    const admin = (await call('/session', 'POST', { email: 'demo@aps.vn', password: 'APS@2026' })).data.token;
    const tokens = { admin };
    for (const role of ['employee', 'accountant', 'manager']) {
      await call('/users', 'POST', { email: `${role}@aps.vn`, role, name: role, password: 'password1' }, admin);
      tokens[role] = (await call('/session', 'POST', { email: `${role}@aps.vn`, password: 'password1' })).data.token;
    }
    const month = '2026-10';
    assert.equal((await call(`/executive?month=${month}`)).status, 401);
    assert.equal((await call('/executive?month=invalid', 'GET', null, admin)).status, 400);
    let report = (await call(`/executive?month=${month}`, 'GET', null, admin)).data;
    const mutate = async (action, value, token = admin, id) => {
      const response = await call('/executive', 'PATCH', { month, revision: report.settings.revision, action, value, id }, token);
      if (response.status === 200) report = response.data;
      return response;
    };
    assert.equal((await mutate('settings', { openingMonth: month, openingBalance: 300, productivityTarget: 100, onTimeTarget: 95, collectionTarget: 200 })).status, 200);
    assert.equal((await call('/executive', 'PATCH', { month, revision: 0, action: 'settings', value: {} }, admin)).status, 409);
    assert.equal((await mutate('cashPlan', { title: 'Lương tháng sau', month: '2026-11', inflow: 0, outflow: 200 }, tokens.manager)).status, 403);
    assert.equal((await mutate('cashPlan', { title: 'Lương tháng sau', month: '2026-11', inflow: 0, outflow: 200 }, tokens.accountant)).status, 200);
    const planId = report.settings.cashPlans.at(-1).id;
    assert.equal((await mutate('receivable', { title: 'Sai', projectId: 'p', amount: 100, paidAmount: 101, dueDate: '2026-10-01' })).status, 400);
    assert.equal((await mutate('contract', { title: 'Phối cảnh', status: 'signed', amount: 100 }, tokens.accountant)).status, 400);
    assert.equal((await mutate('contract', { title: 'Phối cảnh', status: 'pending', amount: 100 }, tokens.accountant)).status, 200);
    const contract = report.settings.contracts.at(-1);
    assert.equal((await mutate('contract', { ...contract, status: 'signed' }, admin, contract.id)).status, 200);
    assert.equal(report.settings.contracts.at(-1).signedBy, 'demo@aps.vn');
    assert.equal((await mutate('contract', { ...report.settings.contracts.at(-1), title: 'Cập nhật nội dung sau ký' }, tokens.accountant, contract.id)).status, 200);
    assert.equal(report.settings.contracts.at(-1).signedBy, 'demo@aps.vn');
    assert.equal((await mutate('delete', { collection: 'cashPlans' }, admin, planId)).status, 200);
    assert(!report.settings.cashPlans.some(row => row.id === planId));
    const employee = (await call(`/executive?month=${month}`, 'GET', null, tokens.employee)).data;
    assert.equal(employee.settings, undefined); assert.equal(employee.executive, undefined); assert.equal(employee.projects[0].overdueAmount, undefined);
    assert(fs.readFileSync(process.env.APS_DB_PATH, 'utf8').includes('executive:contract'));
  } finally { if (server) await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); }
});
