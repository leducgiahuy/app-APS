import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureEmployeeCodes, nextEmployeeCode } from '../src/utils/employeeCodes.js';

test('first and fifth creations receive consecutive unique employee codes', () => {
  const db = { employees: [] };
  for (let i = 1; i <= 5; i++) db.employees.push({ id: `e${i}`, code: nextEmployeeCode(db) });
  assert.deepEqual(db.employees.map(e => e.code), ['NV-001', 'NV-002', 'NV-003', 'NV-004', 'NV-005']);
});

test('deleted codes are not reused even after all employees are removed and reloaded', () => {
  const db = { employees: [{ code: 'NV-004' }] };
  ensureEmployeeCodes(db);
  db.employees = [];
  const reloaded = JSON.parse(JSON.stringify(db));
  assert.equal(nextEmployeeCode(reloaded), 'NV-005');
  assert.equal(nextEmployeeCode(reloaded), 'NV-006');
});

test('duplicate repair keeps older code, uses creation timestamps, and is idempotent', () => {
  const db = { employees: [
    { id: 'later', code: 'NV-004', createdAt: '2026-10-09T10:00:00Z' },
    { id: 'older', code: 'NV-004', createdAt: '2026-10-08T10:00:00Z' }
  ], tasks: [{ employeeId: 'later' }] };
  assert.equal(ensureEmployeeCodes(db), true);
  assert.equal(db.employees[0].code, 'NV-005');
  assert.equal(db.employees[1].code, 'NV-004');
  assert.equal(db.tasks[0].employeeId, 'later');
  assert.equal(ensureEmployeeCodes(db), false);
});

test('legacy timestamp IDs and saved order repair duplicate or missing codes without stealing valid codes', () => {
  const db = { employees: [
    { id: 'emp-1791532801000', code: 'NV-002' },
    { id: 'emp-1791532800000', code: 'NV-002' },
    { id: 'seed', code: 'NV-010' },
    { id: 'missing' }, { id: 'other', code: 'nv-00010' }
  ] };
  ensureEmployeeCodes(db);
  assert.equal(db.employees[1].code, 'NV-002');
  assert.equal(db.employees[2].code, 'NV-010');
  assert.equal(new Set(db.employees.map(e => e.code)).size, 5);
  assert.equal(nextEmployeeCode(db), 'NV-014');
});

test('codes expand beyond 999 and honor the persisted counter', () => {
  const db = { employees: [{ code: 'NV-003' }], employeeCodeSequence: 999 };
  assert.equal(nextEmployeeCode(db), 'NV-1000');
});

test('database migration persists repair; creation ignores supplied code and survives deletion', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-employee-codes-'));
  const file = path.join(directory, 'db.json');
  const previous = process.env.APS_DB_PATH;
  process.env.APS_DB_PATH = file;
  try {
    fs.writeFileSync(file, JSON.stringify({ projects: [], ganttItems: [], tasks: [], employees: [{ id: 'old', code: 'NV-004' }, { id: 'later', code: 'NV-004' }] }));
    const { readDb, writeDb } = await import('../src/models/db.js');
    assert.deepEqual(readDb().employees.map(e => e.code), ['NV-004', 'NV-005']);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).employeeCodeSequence, 5);
    const { createEmployee } = await import('../src/controllers/hrController.js');
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    createEmployee({ body: { name: 'Nhân viên mới', title: 'Thiết kế', code: 'NV-004' } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.code, 'NV-006');
    assert.ok(res.body.data.createdAt);
    const db = readDb();
    db.employees = [];
    writeDb(db);
    createEmployee({ body: { name: 'Tiếp theo', title: 'Thiết kế' } }, res);
    assert.equal(res.body.data.code, 'NV-007');
  } finally {
    if (previous === undefined) delete process.env.APS_DB_PATH;
    else process.env.APS_DB_PATH = previous;
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
