import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeMissingEmployeeAssignments } from '../src/utils/employeeAssignments.js';

test('removes deleted employees from tasks and Gantt while retaining co-assignees and history', () => {
  const remaining = { employeeId: 'live', employeeName: 'Duy', startDate: '2026-10-08', estimatedHoursPerDay: 8 };
  const item = {
    employeeId: 'deleted', employeeName: 'Hieu', assignee: 'Hieu',
    assignees: [{ employeeId: 'deleted', employeeName: 'Hieu' }, remaining],
    progress: 40, startDate: '2026-10-08',
    workSessions: [{ employeeId: 'deleted', hours: 2 }]
  };
  const db = {
    employees: [{ id: 'live', name: 'Duy' }],
    tasks: [structuredClone(item)], ganttItems: [structuredClone(item)]
  };
  assert.equal(removeMissingEmployeeAssignments(db), true);
  for (const record of [...db.tasks, ...db.ganttItems]) {
    assert.deepEqual(record.assignees, [remaining]);
    assert.equal(record.employeeId, 'live');
    assert.equal(record.employeeName, 'Duy');
    assert.equal(record.assignee, 'Duy');
    assert.equal(record.progress, 40);
    assert.equal(record.startDate, '2026-10-08');
    assert.deepEqual(record.workSessions, item.workSessions);
  }
  assert.equal(removeMissingEmployeeAssignments(db), false);
});

test('clears legacy names and final assignee without deleting the task', () => {
  const db = {
    employees: [],
    tasks: [{ id: 'task', employeeId: 'deleted', employeeName: 'Hieu', assignees: [{ employeeId: 'deleted' }] }],
    ganttItems: [{ id: 'gantt', assignee: ' HIEU ' }]
  };
  removeMissingEmployeeAssignments(db);
  assert.deepEqual(db.tasks, [{ id: 'task', employeeId: '', employeeName: '', assignees: [] }]);
  assert.deepEqual(db.ganttItems, [{ id: 'gantt', assignee: '' }]);
});

test('matches legacy names but never transfers a deleted ID to a namesake', () => {
  const db = {
    employees: [{ id: 'new', name: 'Hieu' }],
    tasks: [{ assignees: [
      { employeeId: 'deleted', employeeName: 'Hieu' },
      { employeeName: ' HIEU ' },
      { employeeId: 'new', employeeName: 'Hieu' }
    ] }], ganttItems: []
  };
  removeMissingEmployeeAssignments(db);
  assert.deepEqual(db.tasks[0].assignees, [
    { employeeName: ' HIEU ' }, { employeeId: 'new', employeeName: 'Hieu' }
  ]);
});

test('database reads repair old assignments and future employee deletion persists cleanup', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-assignment-test-'));
  const file = path.join(directory, 'db.json');
  const previousPath = process.env.APS_DB_PATH;
  process.env.APS_DB_PATH = file;
  try {
    fs.writeFileSync(file, JSON.stringify({
      projects: [], employees: [{ id: 'live', name: 'Duy' }],
      tasks: [{ id: 'old', employeeId: 'deleted', employeeName: 'Hieu' },
        { id: 'current', employeeId: 'live', employeeName: 'Duy' }],
      ganttItems: [{ assignee: 'Hieu' }, { assignee: 'Duy' }]
    }));
    const { readDb, writeDb } = await import('../src/models/db.js');
    const db = readDb();
    assert.equal(db.tasks[0].employeeName, '');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).ganttItems[0].assignee, '');
    db.employees = [];
    assert.equal(writeDb(db), true);
    const saved = readDb();
    assert.equal(saved.tasks[1].employeeId, '');
    assert.equal(saved.tasks[1].employeeName, '');
    assert.equal(saved.ganttItems[1].assignee, '');
    assert.equal(saved.tasks.length, 2);
  } finally {
    if (previousPath === undefined) delete process.env.APS_DB_PATH;
    else process.env.APS_DB_PATH = previousPath;
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
