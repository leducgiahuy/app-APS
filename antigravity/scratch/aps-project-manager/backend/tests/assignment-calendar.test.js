import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assignmentCalendarConflicts, assignmentWorkingDates, assignmentWorksOnDate, taskWorkingDates, normalizeAssignmentSchedules, workingDateSegments } from '../../frontend/src/utils/assignmentCalendar.js';
import { calculateAssignmentHours } from '../../frontend/src/utils/ganttEffort.js';
import { scheduledProgress, isTaskActiveOnDate } from '../../frontend/src/utils/date.js';

const item = { id: 'g', projectId: 'p', title: 'Test', startDate: '2026-11-23', endDate: '2026-11-25', estimatedHoursPerDay: 8, days: 3, estimatedHours: 24 };
const row = { employeeId: 'e', startDate: item.startDate, endDate: item.endDate, estimatedHoursPerDay: 8 };

test('warns for any interior holiday or Sunday, but not a regular Saturday or ordinary range', () => {
  assert.deepEqual(assignmentCalendarConflicts([row]).map(d => d.key), ['2026-11-24']);
  assert.deepEqual(assignmentCalendarConflicts([{ startDate: '2026-10-10', endDate: '2026-10-12' }]).map(d => d.key), ['2026-10-11']);
  assert.equal(assignmentCalendarConflicts([{ startDate: '2026-10-09', endDate: '2026-10-10' }]).length, 0);
});

test('Yes retains all three days and No yields two separated working days and 16 hours', () => {
  const yes = { ...row, excludeNonWorkingDays: false };
  const no = { ...row, excludeNonWorkingDays: true };
  assert.equal(calculateAssignmentHours(item, yes), 24);
  assert.equal(calculateAssignmentHours(item, no), 16);
  assert.deepEqual(assignmentWorkingDates(item, no), ['2026-11-23', '2026-11-25']);
  assert.equal(assignmentWorksOnDate(no, item, '2026-11-24'), false);
  assert.equal(isTaskActiveOnDate({ ...item, assignees: [no] }, new Date('2026-11-24T12:00:00')), false);
  assert.deepEqual(workingDateSegments(assignmentWorkingDates(item, no)).map(s => [s.startDate, s.days]), [['2026-11-23', 1], ['2026-11-25', 1]]);
});

test('saved policy recalculates progress denominator, persists, and adapts to future years/date shifts', () => {
  const db = { ganttItems: [{ ...item, assignees: [{ ...row, excludeNonWorkingDays: true }] }], tasks: [{ ...item, id: 't', employeeId: 'e', actualWorkHours: 8, assignees: [{ ...row, excludeNonWorkingDays: true }] }] };
  normalizeAssignmentSchedules(db);
  assert.equal(db.ganttItems[0].days, 2);
  assert.equal(db.tasks[0].estimatedDays, 2);
  assert.equal(scheduledProgress(db.tasks[0]), 50);
  assert.equal(normalizeAssignmentSchedules(db), false);
  const future = { ...item, startDate: '2027-04-15', endDate: '2027-04-17', assignees: [{ ...row, startDate: '2027-04-15', endDate: '2027-04-17', excludeNonWorkingDays: true }] };
  assert.deepEqual(taskWorkingDates(future), ['2027-04-15', '2027-04-17']);
  for (const record of [...db.ganttItems, ...db.tasks]) record.assignees[0].excludeNonWorkingDays = false;
  normalizeAssignmentSchedules(db);
  assert.equal(db.ganttItems[0].days, 3);
  assert.equal(db.tasks[0].estimatedHours, 24);
});

test('mixed personnel policies preserve a day worked by another employee, and deduplicate holiday/Sunday overlaps', () => {
  const mixed = { ...item, assignees: [{ ...row, excludeNonWorkingDays: true }, { ...row, employeeId: 'two', excludeNonWorkingDays: false }] };
  assert.equal(taskWorkingDates(mixed).length, 3);
  assert.deepEqual(assignmentCalendarConflicts([{ startDate: '2026-04-26', endDate: '2026-04-26' }, { startDate: '2026-04-26', endDate: '2026-04-26' }]).map(d => d.key), ['2026-04-26']);
});

test('assignment API persists Yes/No, synchronizes linked task, and rejects a fully excluded assignment', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-calendar-assignment-'));
  const file = path.join(directory, 'db.json');
  const previous = process.env.APS_DB_PATH;
  process.env.APS_DB_PATH = file;
  try {
    fs.writeFileSync(file, JSON.stringify({ projects: [{ id: 'p' }], employees: [{ id: 'e', name: 'Thịnh', code: 'NV-001' }], ganttItems: [{ ...item }], tasks: [{ ...item, id: 't', ganttId: 'g', status: 'in_progress', actualWorkHours: 8 }] }));
    const { updateGanttItem } = await import('../src/controllers/projectController.js');
    const { readDb } = await import('../src/models/db.js');
    const call = body => {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      updateGanttItem({ params: { id: 'g' }, body }, res);
      return res;
    };
    let res = call({ assignees: [{ ...row, excludeNonWorkingDays: true }] });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.item.days, 2);
    assert.equal(res.body.data.task.estimatedHours, 16);
    assert.equal(readDb().tasks[0].assignees[0].excludeNonWorkingDays, true);
    assert.equal(scheduledProgress(readDb().tasks[0]), 50);
    res = call({ assignees: [{ ...row, startDate: '2026-11-24', endDate: '2026-11-24', excludeNonWorkingDays: true }] });
    assert.equal(res.statusCode, 400);
    assert.equal(readDb().ganttItems[0].days, 2);
    res = call({ assignees: [{ ...row, excludeNonWorkingDays: false }] });
    assert.equal(res.body.data.item.days, 3);
    assert.equal(res.body.data.task.estimatedHours, 24);
    assert.equal(scheduledProgress(res.body.data.task), 33);
  } finally {
    if (previous === undefined) delete process.env.APS_DB_PATH;
    else process.env.APS_DB_PATH = previous;
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
