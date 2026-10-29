// Việc của tôi: task của nhiều dự án nằm chung một dòng thời gian theo hạn, không gom theo dự án.
import { buildMyWorkItems } from '../src/modules/my-work/myWork';

const checks = [];
const check = (ok, name, detail = '') => checks.push({ ok: Boolean(ok), name, detail: ok ? '' : detail });
const admin = { role: 'admin', email: 'demo@aps.vn' };
const now = new Date(2026, 9, 28, 9);
const projects = [{ id: 'pa', name: 'Dự án A' }, { id: 'pb', name: 'Dự án B' }, { id: 'pc', name: 'Dự án C' }];
const day = n => `2026-11-${String(n).padStart(2, '0')}`;
let id = 0;
const task = (projectId, code, endDate, extra = {}) => ({ id: `t${++id}`, projectId, code, title: `Việc ${code}`, endDate, status: 'not_started', ...extra });
// Ví dụ: A có hạn ngày 1, 4, 5 · B có 2, 3, 4 · C có 3, 5, 6 (nạp lộn xộn, đúng như dữ liệu thêm dần).
const tasks = [
  task('pc', 'C3', day(6)), task('pa', 'A2', day(4)), task('pb', 'B1', day(2)), task('pc', 'C1', day(3)),
  task('pa', 'A1', day(1)), task('pb', 'B3', day(4)), task('pc', 'C2', day(5)), task('pb', 'B2', day(3)), task('pa', 'A3', day(5)),
];
const items = buildMyWorkItems({ tasks, employees: [], projects, now, user: admin });
const order = items.map(item => `${item.dueAt.slice(-2)}:${item.projectName.slice(-1)}`);
check(JSON.stringify(order) === JSON.stringify(['01:A', '02:B', '03:B', '03:C', '04:A', '04:B', '05:A', '05:C', '06:C']),
  'ba dự án xen kẽ theo ngày 1 → 6; cùng ngày xếp theo tên dự án', order.join(' '));
check(new Set(items.slice(0, 3).map(item => item.projectId)).size > 1, 'không gom task theo từng dự án');

const extra = buildMyWorkItems({
  tasks: [
    task('pa', 'A1.10', day(9)), task('pa', 'A1.2', day(9)), task('pb', 'B9', ''),
    task('pc', 'C9', '2026-11-07T00:00:00.000Z'), task('pa', 'A0', day(1), { status: 'completed' }),
  ],
  employees: [], projects, now, user: admin,
});
const codes = extra.map(item => item.title.split(' · ')[0]);
check(JSON.stringify(codes) === JSON.stringify(['C9', 'A1.2', 'A1.10', 'B9']),
  'hạn dạng ISO vẫn đúng thứ tự, A1.2 trước A1.10, chưa có hạn nằm cuối, task hoàn thành bị ẩn', codes.join(' '));

const passed = checks.every(item => item.ok);
document.getElementById('test-results').textContent = JSON.stringify({ passed, checks }, null, 2);
