import { useEffect, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import ModalOverlay from '../../components/layout/ModalOverlay';
import './GanttWorkColumns.css';
import { calculatePlannedPersonDays } from '../../utils/ganttEffort';
export { calculatePlannedPersonDays } from '../../utils/ganttEffort';
export { inferGanttGroupHierarchy } from '../../utils/ganttHierarchy';



export const getGroupDescendantTasks = (groupId, items) => {
  const groupsById = new Map(items.filter(item => item.isGroup).map(item => [item.id, item]));
  const descendantGroupIds = new Set([groupId]);
  let addedGroup;
  do {
    addedGroup = false;
    groupsById.forEach(group => {
      if (group.parentGroupId && descendantGroupIds.has(group.parentGroupId) && !descendantGroupIds.has(group.id)) {
        descendantGroupIds.add(group.id);
        addedGroup = true;
      }
    });
  } while (addedGroup);

  const taskContainerIds = new Set(items.filter(item => !item.isGroup && item.parentTaskId).map(item => item.parentTaskId));
  return items.filter(item => !item.isGroup && item.status !== 'holiday' && !taskContainerIds.has(item.id) && descendantGroupIds.has(item.parentGroupId));
};

export const calculateGroupPlannedPersonDays = (groupId, items) =>
  getGroupDescendantTasks(groupId, items)
    .reduce((total, item) => total + calculatePlannedPersonDays(item), 0);


export function GanttEditableWorkCell({ item, field, onSave, type = 'text', placeholder = '' }) {
  const value = item[field] ?? '';
  const [draft, setDraft] = useState(String(value));
  const isNote = field === 'ganttNote';
  const Editor = isNote ? 'textarea' : 'input';
  const [expandedDraft, setExpandedDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => setDraft(String(value)), [item.id, value]);

  const commit = async (text = draft) => {
    if (text === String(value)) return true;
    const nextValue = type === 'number'
      ? (text.trim() === '' ? null : Number(text))
      : text;
    const saved = await onSave(item.id, { [field]: nextValue });
    if (!saved) setDraft(String(value));
    return Boolean(saved);
  };

  const editor = (
    <Editor
      type={isNote ? undefined : type}
      rows={isNote ? 2 : undefined}
      min={type === 'number' ? 0 : undefined}
      step={type === 'number' ? '0.1' : undefined}
      value={draft}
      placeholder={placeholder}
      aria-label={field === 'contractWork' ? `Công hợp đồng: ${item.title}` : `Ghi chú: ${item.title}`}
      title={draft || (field === 'contractWork' ? 'Contract work' : 'Note')}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => commit()}
      onKeyDown={event => {
        if (event.key === 'Enter' && (!isNote || event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      className={type === 'number'
        ? 'gantt-work-number-input h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-center text-[11px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:bg-white dark:text-slate-200 dark:focus:bg-slate-900'
        : 'gantt-note-input h-full w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-1 text-left text-[11px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 focus:bg-white dark:text-slate-200 dark:focus:bg-slate-900'}
    />
  );

  if (!isNote) return editor;
  const openExpanded = () => { setExpandedDraft(draft); setSaveError(''); };
  return (
    <>
      <div className="flex h-full w-full min-w-0 items-center gap-0.5" onDoubleClick={openExpanded}>
        {editor}
        <button type="button" aria-label={`Mở rộng ghi chú: ${item.title}`} title="Mở rộng ghi chú" onClick={openExpanded} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-sky-700 dark:hover:bg-slate-700">
          <Maximize2 size={13} />
        </button>
      </div>
      {expandedDraft !== null && <ModalOverlay>
        <section role="dialog" aria-modal="true" aria-label={`Ghi chú: ${item.title}`} className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Ghi chú</h3><p className="break-words text-sm text-slate-500">{item.title}</p></div>
            <button type="button" aria-label="Đóng ghi chú" disabled={saving} onClick={() => setExpandedDraft(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
          </div>
          <textarea autoFocus aria-label="Nội dung ghi chú" value={expandedDraft} onChange={event => setExpandedDraft(event.target.value)} placeholder="Nhập nội dung ghi chú..." className="block min-h-[240px] w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" style={{ maxHeight: '55dvh', overflowWrap: 'anywhere' }} />
          {saveError && <p role="alert" className="mt-2 text-sm text-rose-600">{saveError}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" disabled={saving} onClick={() => setExpandedDraft(null)} className="rounded-xl px-4 py-2 text-sm text-slate-500">Hủy</button>
            <button type="button" disabled={saving} onClick={async () => {
              setSaving(true);
              setSaveError('');
              try {
                if (await commit(expandedDraft)) { setDraft(expandedDraft); setExpandedDraft(null); }
                else setSaveError('Chưa lưu được ghi chú. Vui lòng thử lại.');
              } catch { setSaveError('Chưa lưu được ghi chú. Vui lòng thử lại.'); }
              finally { setSaving(false); }
            }} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu ghi chú'}</button>
          </div>
        </section>
      </ModalOverlay>}
    </>
  );
}
