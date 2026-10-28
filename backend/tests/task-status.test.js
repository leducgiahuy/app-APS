import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetNeverStartedTasks } from '../src/utils/taskStatus.js';

test('legacy "in progress" tasks without any work evidence go back to not started', () => {
  const db = {
    employees: [{ id: 'e', activeTaskId: 'running' }],
    tasks: [
      { id: 'legacy', ganttId: 'g-legacy', status: 'in_progress' },
      { id: 'tracked', ganttId: 'g-tracked', status: 'in_progress', actualWorkHours: 2 },
      { id: 'reported', status: 'in_progress', deliveryStatusLevel: 40 },
      { id: 'session', status: 'in_progress', startedAt: '2026-10-01T01:00:00Z' },
      { id: 'running', status: 'in_progress' },
      { id: 'done', status: 'completed' }
    ],
    ganttItems: [
      { id: 'g-legacy', status: 'in_progress' },
      { id: 'g-tracked', status: 'in_progress' },
      { id: 'g-template', status: 'in_progress' },
      { id: 'group', status: 'in_progress', isGroup: true }
    ]
  };
  assert.equal(resetNeverStartedTasks(db), true);
  const status = id => [...db.tasks, ...db.ganttItems].find(item => item.id === id).status;
  assert.equal(status('legacy'), 'not_started');
  assert.equal(status('g-legacy'), 'not_started');
  assert.equal(status('g-template'), 'not_started');
  for (const id of ['tracked', 'reported', 'session', 'running', 'g-tracked', 'group']) assert.equal(status(id), 'in_progress', id);
  assert.equal(status('done'), 'completed');
  assert.equal(resetNeverStartedTasks(db), false, 'idempotent');
});

test('the rule applies automatically to any data written or restored later', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aps-status-')), 'db.json');
  process.env.APS_DB_PATH = file;
  fs.writeFileSync(file, JSON.stringify({ projects: [], employees: [], tasks: [{ id: 'restored', status: 'in_progress' }], ganttItems: [] }));
  const { readDb, writeDb } = await import('../src/models/db.js');
  const db = readDb();
  assert.equal(db.tasks[0].status, 'not_started', 'restored backups are normalized on read');
  db.tasks.push({ id: 'imported', status: 'in_progress' });
  writeDb(db);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).tasks[1].status, 'not_started', 'new writes are normalized');
});
