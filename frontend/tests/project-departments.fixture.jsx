import { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectDepartmentList from '../src/modules/dashboard/ProjectDepartmentList';
import { summarizeProjectGantt } from '../src/utils/projectGanttSummary';
import '../src/index.css';
import '../src/modules/dashboard/DashboardPage.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const project = { id: 'project', startDate: '2026-11-01' };
const employees = [
  { id: 'one', name: 'Thịnh', team: 'Ban Thiết Kế' },
  { id: 'two', name: 'Duy', team: 'Ban Thiết Kế' }
];
const gantt = [{ id: 'g', projectId: 'project', startDate: '2026-11-01', endDate: '2026-11-03', assignees: [{ employeeId: 'one', estimatedHoursPerDay: 8 }, { employeeId: 'two', estimatedHoursPerDay: 4 }] }];
const tasks = [{ id: 't', ganttId: 'g', projectId: 'project' }];
const overtimes = [{ id: 'ot', taskId: 't', employeeId: 'one', hours: 2, status: 'approved' }];
const root = createRoot(document.getElementById('root'));
const checks = [];
const check = (condition, description) => { if (!condition) throw new Error(description); checks.push(description); };
async function render(people) {
  const summary = summarizeProjectGantt(project, gantt, tasks, people, overtimes);
  await act(async () => root.render(<div className="aps-dashboard"><ProjectDepartmentList departments={summary.departments} /></div>));
}
try {
  await render(employees);
  const heading = document.querySelector('.department-summary-row');
  check(heading.textContent.includes('Ban Thiết Kế') && heading.textContent.includes('4,5 công'), 'department name and summed effort');
  check(document.querySelectorAll('.department-person-row').length === 2, 'members initially visible');
  const thinh = document.querySelector('.department-person-row');
  check(thinh.textContent.includes('Thịnh') && thinh.textContent.includes('2h') && thinh.textContent.includes('3 công'), 'employee OT and effort');
  check(thinh.children[1].textContent === '1' && heading.children[1].textContent === '1', 'shared task counted once per employee and department');
  await act(async () => heading.querySelector('button').click());
  check(document.querySelectorAll('.department-person-row').length === 0 && heading.querySelector('button').getAttribute('aria-expanded') === 'false', 'collapse hides department members');
  await act(async () => heading.querySelector('button').click());
  check(document.querySelectorAll('.department-person-row').length === 2, 'expand restores department members');
  await render([employees[0], { ...employees[1], team: 'Ban Quản Lý' }]);
  check(document.querySelectorAll('.department-summary-row').length === 2, 'department changes update grouping');
  await render([employees[0]]);
  check(document.querySelectorAll('.department-person-row').length === 1 && !document.getElementById('root').textContent.includes('Duy'), 'deleted employee disappears from grouped summary');
  await render(employees);
  document.getElementById('test-results').textContent = JSON.stringify({ passed: true, checks });
} catch (error) {
  document.getElementById('test-results').textContent = JSON.stringify({ passed: false, checks, error: error.message });
}
