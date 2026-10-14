import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { filterSearchOptions } from '../utils/searchOptions';

export default function SearchableSelect({ options, value, onChange, label, searchPlaceholder = 'Tìm theo tên hoặc STT...', className = '', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const selected = options.find(option => option.value === value);
  const filtered = filterSearchOptions(options, query);
  const highlightedIndex = Math.min(activeIndex, filtered.length - 1);

  const openList = () => { if (!disabled) { setQuery(''); setActiveIndex(0); setOpen(true); } };
  const choose = option => { onChange(option.value); setOpen(false); setQuery(''); };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const reposition = () => {
      const rect = containerRef.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 160 && above > below;
      const maxHeight = Math.max(80, Math.min(240, upward ? above : below));
      setPosition({ left: rect.left, width: rect.width, maxHeight,
        ...(upward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!containerRef.current?.contains(event.target) && !listRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlightedIndex, query]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : selected?.label || ''}
        placeholder={open ? searchPlaceholder : options.find(option => option.value === '')?.label || searchPlaceholder}
        title={selected?.label}
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'Tab') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) openList();
            else setActiveIndex(Math.max(0, Math.min(filtered.length - 1, highlightedIndex + (event.key === 'ArrowDown' ? 1 : -1))));
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (filtered[highlightedIndex]) choose(filtered[highlightedIndex]);
          }
        }}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-9 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-default disabled:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      />
      <button type="button" disabled={disabled} aria-label={`Mở danh sách ${label}`} onClick={() => {
        inputRef.current?.focus();
        if (open) setOpen(false); else openList();
      }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400">
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && position && createPortal(
        <div ref={listRef} id={listId} role="listbox" aria-label={label}
          style={{ ...position, position: 'fixed', zIndex: 1100, pointerEvents: 'auto' }}
          className="overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          {filtered.map((option, index) => (
            <button key={option.value} id={`${listId}-${index}`} type="button" role="option"
              aria-selected={option.value === value}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 ${highlightedIndex === index ? 'bg-sky-50 dark:bg-slate-700' : ''}`}>
              {option.code && <span className="w-[72px] shrink-0 border-r border-slate-200 pr-2 text-center font-mono font-bold text-slate-500 dark:border-slate-600">{option.code}</span>}
              <span className="min-w-0 whitespace-normal break-words">{option.code ? option.title || option.label : option.label}</span>
            </button>
          ))}
          {!filtered.length && <p className="px-3 py-2 text-xs text-slate-500">Không tìm thấy kết quả phù hợp</p>}
        </div>, document.body
      )}
    </div>
  );
}
