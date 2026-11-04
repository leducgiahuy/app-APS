import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GanttEditableWorkCell } from '../src/modules/gantt/GanttWorkColumns';
import '../src/index.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('root'));
const checks = [];
const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
const savedNotes = [];
const longNote = 'Nội dung ghi chú dài không bị cắt. '.repeat(350) + '\nDòng cuối cùng';
function Fixture() {
  return <div style={{ width: 180, height: 55, margin: 20 }}><GanttEditableWorkCell item={{ id: 'new', title: 'Task mới', ganttNote: longNote }} field="ganttNote" onSave={async (id, patch) => { savedNotes.push({ id, ...patch }); return true; }} /></div>;
}
try {
  await act(async () => root.render(<Fixture />));
  const note = document.querySelector('textarea');
  check(note.value === longNote && note.value.length > 10000, 'long Unicode multiline note has no character truncation');
  check(!note.hasAttribute('maxlength'), 'note has no maxlength');
  check(getComputedStyle(note).overflowWrap === 'anywhere' && note.scrollHeight > note.clientHeight, 'note wraps and scrolls to expose all text');
  await act(async () => document.querySelector('[title="Mở rộng ghi chú"]').click());
  const expanded = document.querySelector('[aria-label="Nội dung ghi chú"]');
  check(expanded.value === longNote && !expanded.hasAttribute('maxlength'), 'expanded editor preserves full note without maxlength');
  check(expanded.clientWidth > note.clientWidth * 2 && expanded.getBoundingClientRect().height >= 240, 'expanded editor provides a large writing area');
  const changed = longNote + '\nNội dung thêm sau khi mở rộng';
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(expanded, changed);
    expanded.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Lưu ghi chú').click());
  check(savedNotes.at(-1)?.ganttNote === changed, 'expanded editor saves all long Unicode content to the same task');
  check(!document.querySelector('[role="dialog"]') && note.value === changed, 'saved note returns to the table without truncation');
  document.getElementById('test-results').textContent = JSON.stringify({ passed: checks.length, checks });
} catch (error) {
  document.getElementById('test-results').textContent = JSON.stringify({ failed: error.message });
  throw error;
}
