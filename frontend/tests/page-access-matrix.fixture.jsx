// Ma trận "Trang & mục": thanh trang, mục, mục con đóng / mở, sửa và lưu ô quyền.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Matrix } from '../src/modules/operations/PermissionsPage';
import { DEFAULT_MATRIX } from '../src/utils/operationsDefaults';
import { PAGE_ACCESS_TREE } from '../src/utils/pageAccess';
import '../src/index.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const checks = [];
const check = (ok, name) => { if (!ok) throw new Error(name); checks.push(name); };
const saved = [];
const api = { data: { viewer: { role: 'director' }, companyRole: 'director', readOnly: false, matrix: DEFAULT_MATRIX, pageAccess: {} }, saving: false,
  mutate: async (action, value) => { saved.push([action, value]); }, run: async fn => fn() };
const out = document.getElementById('test-results');
const click = async node => act(async () => { node.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const text = selector => [...document.querySelectorAll(selector)].map(node => node.textContent.trim());
try {
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(<Matrix api={api} />));
  check(JSON.stringify(text('.page-row th')) === JSON.stringify(PAGE_ACCESS_TREE.map(page => page.label)), 'thanh ngang là tên 5 trang theo thứ tự menu');
  const pageRow = document.querySelector('.page-row th');
  check(pageRow.getBoundingClientRect().height >= 50 && parseFloat(getComputedStyle(pageRow).fontSize) >= 16, 'thanh trang cao hơn, chữ to hơn');
  const rows = [...document.querySelectorAll('.page-access-matrix tbody tr')];
  const after = (label, cls) => rows.slice(rows.findIndex(row => row.textContent.trim() === label) + 1).find(row => row.classList.contains(cls))?.querySelector('td span:not(.page-access-toggle-space)')?.textContent;
  check(after('Công việc', 'section-row') === 'Việc của tôi', 'mục đầu của Công việc là Việc của tôi');
  check(after('Dự án', 'section-row') === 'Tiến độ & Công' && text('.child-row td:first-child').includes('Bảng tiến độ & công'), 'mục con Bảng tiến độ & công nằm trong Tiến độ & Công');
  check(document.querySelectorAll('.page-access-matrix thead th').length === 8 && document.querySelector('.page-access-matrix thead th:last-child').textContent === 'Ghi chú', 'giữ cột vai trò và Ghi chú');
  const childCount = document.querySelectorAll('.child-row').length;
  const toggle = document.querySelector('button[aria-label="Thu gọn Tiến độ & Công"]');
  await click(toggle);
  check(document.querySelectorAll('.child-row').length === childCount - 2 && !text('.child-row td:first-child').includes('Bảng tiến độ & công'), 'đóng mục ẩn mục con');
  await click(document.querySelector('button[aria-label="Mở Tiến độ & Công"]'));
  check(document.querySelectorAll('.child-row').length === childCount, 'mở lại hiện mục con');
  await click([...document.querySelectorAll('button')].find(node => node.textContent === 'Thu gọn tất cả'));
  check(document.querySelectorAll('.child-row').length === 0, 'thu gọn tất cả');
  await click([...document.querySelectorAll('button')].find(node => node.textContent === 'Mở tất cả'));
  await click([...document.querySelectorAll('button')].find(node => node.textContent === 'Sửa ma trận'));
  const select = document.querySelector('select[aria-label="Hồ sơ · Nhân viên"]');
  check(select && [...select.options].map(option => option.value).join(',') === 'X,S,—', 'ô sửa chỉ có X / S / —');
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, '—'); select.dispatchEvent(new Event('change', { bubbles: true })); });
  await click([...document.querySelectorAll('button')].find(node => node.textContent === 'Lưu ma trận'));
  check(saved.at(-1)?.[0] === 'pageAccess' && saved.at(-1)[1].rows['gantt.legal'].values.employee === '—', 'lưu gửi đúng ô đã đổi');
  check(!document.body.textContent.includes('Quyền thao tác') && document.querySelectorAll('.operations-matrix').length === 1, 'không còn tab Quyền thao tác');
  out.textContent = JSON.stringify({ passed: true, checks }, null, 2);
} catch (error) {
  out.textContent = JSON.stringify({ passed: false, error: error.message, checks }, null, 2);
}
