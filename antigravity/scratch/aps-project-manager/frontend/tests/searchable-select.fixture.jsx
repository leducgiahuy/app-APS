import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SearchableSelect from '../src/components/SearchableSelect';
import ModalOverlay from '../src/components/layout/ModalOverlay';
import '../src/index.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let addOption;
let selection;
let submissions = 0;
const initialOptions = [
  { value: '', label: '-- Không có liên kết --' },
  { value: 'one', code: 'A1.1', title: 'Khảo sát địa chất', label: '[A1.1] Khảo sát địa chất', searchText: 'Thiết kế A1 Chuẩn bị' },
  { value: 'two', code: 'B2.1', title: 'Lập báo cáo', label: '[B2.1] Lập báo cáo', searchText: 'Pháp lý B2 Hồ sơ' }
];
export default function Fixture() {
  const [value, setValue] = useState('');
  const [options, setOptions] = useState(initialOptions);
  useEffect(() => {
    addOption = option => setOptions(current => [...current, option]);
  }, []);
  return <>
    <div id="background" data-modal-background-scroll style={{ height: 220, overflowY: 'auto' }}>
      <div style={{ height: 2000 }}>Background scroll fixture</div>
    </div>
    <ModalOverlay allowBackgroundScroll>
      <form id="dialog" style={{ width: 420, padding: 24, background: 'white' }} onSubmit={event => { event.preventDefault(); submissions += 1; }}>
        <SearchableSelect label="Task fixture" value={value} options={options} onChange={next => { selection = next; setValue(next); }} />
        <SearchableSelect label="Locked fixture" disabled value="one" options={options} onChange={() => { throw new Error('Locked field changed'); }} />
        <button type="submit">Save</button>
      </form>
    </ModalOverlay>
  </>;
}
const checks = [];
const check = (condition, description) => { if (!condition) throw new Error(description); checks.push(description); };
const input = () => document.querySelector('[aria-label="Task fixture"]');
const options = () => [...document.querySelectorAll('[role="option"]')];
async function open() { await act(async () => { input().focus(); input().click(); }); }
async function type(text) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(value) { await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))); }

try {
  await act(async () => createRoot(document.getElementById('root')).render(<Fixture />));
  await open();
  check(options().length === 3, 'click opens full list');
  await type('khao sat');
  check(options().length === 1 && options()[0].textContent.includes('Khảo sát'), 'Vietnamese names searchable without accents');
  await key('Enter');
  check(selection === 'one' && submissions === 0, 'Enter selects original ID without submitting form');
  await open();
  await type('B2.1');
  check(options().length === 1 && options()[0].textContent.includes('Lập báo cáo'), 'STT search');
  await act(async () => options()[0].click());
  check(selection === 'two', 'pointer selects correct ID');
  await open();
  await type('thiet ke chuan bi');
  check(options().length === 1 && options()[0].textContent.includes('Khảo sát'), 'phase and parent group search');
  await type('missing task');
  check(options().length === 0 && document.body.textContent.includes('Không tìm thấy kết quả'), 'empty search result');
  await key('Escape');
  check(!document.querySelector('[role="listbox"]'), 'Escape closes list');
  await act(async () => addOption({ value: 'new', label: '[C3.1] Công việc mới', code: 'C3.1' }));
  await open();
  await type('C3.1');
  check(options().length === 1, 'newly added tasks immediately searchable');
  await key('Enter');
  check(selection === 'new', 'new task ID selectable');
  check(document.querySelector('[aria-label="Locked fixture"]').disabled, 'existing locked field remains locked');
  check(document.body.style.overflow !== 'hidden', 'creation modal leaves background unlocked');
  const background = document.getElementById('background');
  const overlay = document.getElementById('dialog').parentElement;
  overlay.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120, clientX: innerWidth - 5, clientY: 100 }));
  check(background.scrollTop > 0, 'wheel over backdrop scrolls background');
  const before = background.scrollTop;
  document.getElementById('dialog').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120, clientX: innerWidth / 2, clientY: innerHeight / 2 }));
  check(background.scrollTop > before, 'wheel over short dialog scrolls background');
  await act(async () => {
    for (let index = 0; index < 40; index += 1) addOption({ value: `many-${index}`, label: `Task ${index}`, code: `D${index}` });
  });
  await open();
  const list = document.querySelector('[role="listbox"]');
  check(list.scrollHeight > list.clientHeight, 'long task lists scroll inside dropdown');
  check(!document.getElementById('dialog').contains(list), 'dropdown portal stays outside dialog clipping');
  for (let index = 0; index < 15; index += 1) await key('ArrowDown');
  check(list.scrollTop > 0, 'keyboard navigation scrolls long task list');
  const backgroundBeforeDropdown = background.scrollTop;
  list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
  check(background.scrollTop === backgroundBeforeDropdown, 'dropdown scrolling does not move background');
  await key('Escape');
  document.getElementById('test-results').textContent = JSON.stringify({ passed: true, checks });
} catch (error) {
  document.getElementById('test-results').textContent = JSON.stringify({ passed: false, checks, error: error.message });
}
