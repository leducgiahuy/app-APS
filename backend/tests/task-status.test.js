import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clearStaleTaskSelections, resetNeverStartedTasks } from '../src/utils/taskStatus.js';

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

test('a pre-selected task that was completed, cancelled or deleted is cleared so check-in is never blocked by it', () => {
  const db = {
    tasks: [{ id: 'done', status: 'completed' }, { id: 'open', status: 'not_started' }, { id: 'gone-cancel', status: 'cancelled' }],
    employees: [
      { id: 'thinh', isOnSite: false, activeTaskId: 'done', activeTaskTitle: 'Thiết kế ý tưởng', activeTaskShiftType: 'overtime' },
      { id: 'a', isOnSite: false, activeTaskId: 'open', activeTaskTitle: 'Việc sắp làm' },
      { id: 'b', isOnSite: false, activeTaskId: 'deleted-task' },
      { id: 'c', isOnSite: false, activeTaskId: 'gone-cancel' },
      { id: 'd', isOnSite: true, activeTaskId: 'done' },
      { id: 'e', isOnSite: false, activeTaskId: 'ot:slip' },
    ],
  };
  assert.equal(clearStaleTaskSelections(db), true);
  const pick = id => db.employees.find(employee => employee.id === id);
  assert.deepEqual([pick('thinh').activeTaskId, pick('thinh').activeTaskTitle, pick('thinh').activeTaskShiftType], [null, null, null]);
  assert.equal(pick('a').activeTaskId, 'open', 'task còn làm được thì giữ lựa chọn');
  assert.equal(pick('b').activeTaskId, null, 'task đã bị xóa');
  assert.equal(pick('c').activeTaskId, null, 'task đã hủy');
  assert.equal(pick('d').activeTaskId, 'done', 'ca đang mở không đụng tới');
  assert.equal(pick('e').activeTaskId, 'ot:slip', 'tăng ca không gắn task giữ nguyên');
  assert.equal(clearStaleTaskSelections(db), false, 'chạy lại không đổi gì');
});
