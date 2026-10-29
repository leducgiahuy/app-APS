// Ô "Dự án đang xem": bấm ở bất kỳ đâu trên ô đều mở danh sách; danh sách rộng đúng bằng ô; chọn / bàn phím / bấm ra ngoài.
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectPicker from '../src/modules/gantt/ProjectPicker';
import '../src/index.css';
import '../src/modules/gantt/DeliveryPage.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const projects = [{ id: 'p1', name: 'NHÀ MÁY BETRAMEX - CÀNG LONG / VĨNH LONG' }, { id: 'p2', name: 'Trường mầm non Hoa Sen' }, { id: 'p3', name: 'Văn phòng APS' }];
let current = 'p1';
function Fixture() {
  const [value, setValue] = useState('p1');
  return <fieldset className="delivery-project-context"><ProjectPicker projects={projects} value={value} onChange={next => { current = next; setValue(next); }} /></fieldset>;
}
const checks = [];
const check = (ok, name) => { if (!ok) throw new Error(name); checks.push(name); };
const out = document.getElementById('test-results');
const button = () => document.querySelector('.delivery-project-picker-button');
const list = () => document.querySelector('.delivery-project-picker-list');
const press = async key => act(async () => { button().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
try {
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(<Fixture />));
  check(button().textContent.includes('NHÀ MÁY BETRAMEX - CÀNG LONG / VĨNH LONG'), 'ô hiện tên dự án đang chọn');
  // Bấm đúng vào chữ nhỏ "Dự án đang xem" (chỗ trước đây bị bôi chọn) vẫn mở danh sách.
  const label = button().querySelector('small');
  const box = label.getBoundingClientRect();
  check(document.elementFromPoint(box.left + 5, box.top + box.height / 2)?.closest('.delivery-project-picker-button') === button(), 'bấm vào chữ nhỏ trúng nút');
  await act(async () => button().click());
  check(list() && list().querySelectorAll('[role="option"]').length === 4, 'mở danh sách: Tất cả dự án + 3 dự án');
  check(Math.abs(list().getBoundingClientRect().width - button().getBoundingClientRect().width) < 1, 'danh sách rộng đúng bằng ô');
  check(list().querySelector('[aria-selected="true"]')?.textContent === projects[0].name, 'đánh dấu dự án đang chọn');
  await act(async () => [...list().querySelectorAll('[role="option"]')].find(node => node.textContent === 'Văn phòng APS').click());
  check(current === 'p3' && !list() && button().textContent.includes('Văn phòng APS'), 'chọn dự án: đổi dự án và đóng danh sách');
  await press('ArrowDown');
  check(list(), 'phím ↓ mở danh sách');
  await press('ArrowUp'); await press('Enter');
  check(current === 'p2' && !list(), 'phím ↑ + Enter chọn dự án phía trên');
  await act(async () => button().click());
  await act(async () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  check(!list(), 'bấm ra ngoài thì đóng');
  await act(async () => button().click());
  await press('Escape');
  check(!list() && current === 'p2', 'Esc đóng, không đổi dự án');
  await act(async () => button().click());
  out.textContent = JSON.stringify({ passed: true, checks }, null, 2);
} catch (error) {
  out.textContent = JSON.stringify({ passed: false, error: error.message, checks }, null, 2);
}
