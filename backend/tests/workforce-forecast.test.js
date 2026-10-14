import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkforceForecast, calendarCapacity, capacityWeight, forecastMonths, workforceTasks, addDays } from '../../frontend/src/utils/workforceForecast.js';
import { workforceMutation } from '../src/controllers/workforceController.js';

const now = new Date('2026-10-12T12:00:00');
const employees = [{ id: 'e', name: 'Thịnh', title: 'Kỹ sư MEP', standardHours: 8 }];
const task = { id: 'g', projectId: 'p', title: 'Thiết kế', startDate: '2026-11-02', endDate: '2026-11-03', estimatedHoursPerDay: 8, assignees: [{ employeeId: 'e', startDate: '2026-11-02', endDate: '2026-11-03', estimatedHoursPerDay: 8 }] };
const forecast = data => buildWorkforceForecast({ now, employees, ...data });

test('six-month horizon advances across years and holiday-aware capacity follows half Saturdays', () => {
  assert.deepEqual(forecastMonths(now).map(month => month.key), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  assert.equal(capacityWeight('2026-11-24'), 0);
  assert.equal(calendarCapacity('2026-11-23', '2026-11-25'), 16);
  assert.equal(calendarCapacity('2026-10-09', '2026-10-11'), 12);
  assert.equal(forecastMonths(new Date('2030-12-12T12:00:00'))[0].key, '2031-01');
});

test('Gantt and linked task are counted once, parent/group/holiday/cancelled rows are excluded', () => {
  const tasks = [{ ...task, id: 't', ganttId: 'g' }, { id: 'cancelled', status: 'cancelled' }];
  const ganttItems = [task, { id: 'group', isGroup: true }, { id: 'holiday', status: 'holiday' }, { id: 'parent' }, { ...task, id: 'child', parentTaskId: 'parent' }];
  assert.deepEqual(workforceTasks(tasks, ganttItems).map(item => item.id), ['g', 'child']);
  const result = forecast({ tasks: [tasks[0]], ganttItems: [task] });
  assert.equal(result.rows[0].cells[0].demand, 16);
  assert.equal(result.employeeRows[0].cells[0].demand, 16);
});

test('remaining work uses progress or actual hours and respects each assignment holiday policy', () => {
  assert.equal(forecast({ ganttItems: [{ ...task, progress: 50 }] }).rows[0].cells[0].demand, 8);
  assert.equal(forecast({ ganttItems: [{ ...task, actualWorkHours: 12 }] }).rows[0].cells[0].demand, 4);
  const holidayTask = { ...task, startDate: '2026-11-23', endDate: '2026-11-25', assignees: [{ employeeId: 'e', startDate: '2026-11-23', endDate: '2026-11-25', estimatedHoursPerDay: 8, excludeNonWorkingDays: true }] };
  assert.equal(forecast({ ganttItems: [holidayTask] }).rows[0].cells[0].demand, 16);
  holidayTask.assignees[0].excludeNonWorkingDays = false;
  assert.equal(forecast({ ganttItems: [holidayTask] }).rows[0].cells[0].demand, 24);
});

test('pipeline demand is probability weighted and automatically generates recruitment at 0.8 people', () => {
  const capacity = calendarCapacity('2026-11-01', '2026-11-30');
  const demand = { id: 'd', position: 'Kỹ sư MEP', startDate: '2026-11-01', endDate: '2026-11-30', hours: capacity * 3.6, probability: 50, projectName: 'Dự án mới' };
  const result = forecast({ plan: { demands: [demand] } });
  assert.ok(Math.abs(result.rows[0].cells[0].demand - capacity * 1.8) < 0.000001);
  assert.equal(result.needed, 1);
  assert.equal(result.recruitment[0].needDate, '2026-11-02');
  assert.equal(result.recruitment[0].deadline, addDays('2026-11-02', -45));
  assert.equal(result.recruitment[0].lateDays, 24);
  assert.equal(result.employeeRows[0].cells[0].demand, 0, 'pipeline is not assigned to a named person');
  const reduced = forecast({ plan: { demands: [{ ...demand, probability: 40 }] } });
  assert.equal(reduced.needed, 0);
});

test('zero staff demand stays visible and recruits the right number without Infinity in reasons', () => {
  const result = forecast({ employees: [], plan: { demands: [{ position: 'Kiến trúc sư', startDate: '2026-11-01', endDate: '2026-11-30', hours: 400, probability: 100 }] } });
  assert.equal(result.rows[0].cells[0].percent, Infinity);
  assert.equal(result.needed, 3);
  assert.ok(!result.recruitment[0].reason.includes('Infinity'));
});

test('position/employee changes recalculate capacity; unresolved tasks can be mapped without editing Gantt', () => {
  const unassigned = { ...task, assignees: [] };
  let result = forecast({ ganttItems: [unassigned] });
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.rows.find(row => row.name === 'Chưa xác định vị trí').cells[0].demand, 16);
  result = forecast({ ganttItems: [unassigned], plan: { taskRoles: [{ taskKey: 'gantt:g', position: 'Kỹ sư MEP' }] } });
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.rows[0].cells[0].demand, 16);
  const added = forecast({ employees: [...employees, { id: 'e2', title: 'Kỹ sư MEP', standardHours: 4 }], ganttItems: [task] });
  assert.equal(added.rows[0].cells[0].capacity, calendarCapacity('2026-11-01', '2026-11-30', 12));
});

test('saved recruitment dates, six stages and per-position lead time determine on-time result', () => {
  const plan = { demands: [{ position: 'Kỹ sư MEP', startDate: '2026-11-01', endDate: '2026-11-30', hours: 400, probability: 100 }], settings: [{ position: 'Kỹ sư MEP', leadDays: 30 }], recruitments: [{ position: 'Kỹ sư MEP', needMonth: '2026-11', status: 'Phỏng vấn', openedAt: '2026-10-01', expectedStart: '2026-10-31', temporary: 'Thuê ngoài' }] };
  const result = forecast({ plan });
  assert.equal(result.recruitment[0].deadline, '2026-10-03');
  assert.equal(result.recruitment[0].status, 'Phỏng vấn');
  assert.equal(result.recruitment[0].lateDays, -2);
  assert.equal(result.onTime, 1);
  const future = forecast({ now: new Date('2027-10-12T12:00:00'), plan: { ...plan, demands: [{ ...plan.demands[0], startDate: '2027-11-01', endDate: '2027-11-30' }] } });
  assert.equal(future.recruitment[0].status, 'Đề xuất', 'a future recruiting cycle does not inherit old status or start date');
  assert.notEqual(future.recruitment[0].expectedStart, '2026-10-31');
});

test('plan mutations validate dates, probability, lead days and posting dates; unrelated records survive', () => {
  let plan = workforceMutation(undefined, { kind: 'settings', data: { position: 'Kỹ sư MEP', leadDays: 45 } });
  plan = workforceMutation(plan, { kind: 'settings', data: { position: ' kỹ sư mep ', leadDays: 30 } });
  assert.equal(plan.settings.length, 1);
  assert.throws(() => workforceMutation(plan, { kind: 'recruitments', data: { position: 'MEP', status: 'Đăng tuyển' } }));
  const valid = { position: 'MEP', startDate: '2026-11-01', endDate: '2026-11-30', hours: 100, probability: 50 };
  assert.throws(() => workforceMutation(plan, { kind: 'demands', data: { ...valid, startDate: '2026-02-30' } }));
  assert.throws(() => workforceMutation(plan, { kind: 'demands', data: { ...valid, probability: 101 } }));
  plan = workforceMutation(plan, { kind: 'demands', data: valid });
  const id = plan.demands[0].id;
  plan = workforceMutation(plan, { kind: 'demands', id, data: { ...valid, hours: 200 } });
  assert.equal(plan.demands[0].hours, 200);
  plan = workforceMutation(plan, { kind: 'demands', id, remove: true });
  assert.equal(plan.demands.length, 0);
  assert.equal(plan.settings[0].leadDays, 30);
});
