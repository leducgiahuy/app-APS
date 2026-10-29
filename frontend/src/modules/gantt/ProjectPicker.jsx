import { useEffect, useId, useRef, useState } from 'react';
import { Building, Check, ChevronDown } from 'lucide-react';

// Ô "Dự án đang xem": cả ô là một nút bấm, danh sách mở ngay bên dưới và rộng đúng bằng ô.
// Dùng được bằng bàn phím (↑ ↓ Home End Enter Esc) và đóng khi bấm ra ngoài.
export default function ProjectPicker({ projects, value, onChange, disabled }) {
  const options = [{ id: 'ALL', name: 'Tất cả dự án' }, ...projects.map(project => ({ id: project.id, name: project.name }))];
  const selected = options.find(option => option.id === value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const show = () => { setActive(Math.max(0, options.findIndex(option => option.id === value))); setOpen(true); };
  const choose = option => { setOpen(false); buttonRef.current?.focus(); if (option.id !== value) onChange(option.id); };
  const onKeyDown = event => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show(); }
      return;
    }
    const last = options.length - 1;
    if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown') setActive(index => Math.min(last, index + 1));
    else if (event.key === 'ArrowUp') setActive(index => Math.max(0, index - 1));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(last);
    else if (event.key === 'Enter' || event.key === ' ') choose(options[active]);
    else return;
    event.preventDefault();
  };

  return <div className={`delivery-project-picker${open ? ' is-open' : ''}`} ref={rootRef}>
    <button
      ref={buttonRef}
      type="button"
      className="delivery-project-picker-button"
      disabled={disabled}
      aria-label={`Dự án đang xem: ${selected?.name || 'Chọn dự án'}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${active}` : undefined}
      title={selected?.name}
      onClick={() => (open ? setOpen(false) : show())}
      onKeyDown={onKeyDown}
    >
      <span className="delivery-project-picker-icon" aria-hidden="true"><Building /></span>
      <span className="delivery-project-picker-text">
        <small>Dự án đang xem</small>
        <b>{selected?.name || 'Chọn dự án'}</b>
      </span>
      <ChevronDown className="delivery-project-picker-caret" aria-hidden="true" />
    </button>
    {open && <ul id={listId} ref={listRef} className="delivery-project-picker-list" role="listbox" aria-label="Dự án đang xem">
      {options.map((option, index) => <li
        key={option.id}
        id={`${listId}-${index}`}
        role="option"
        data-index={index}
        aria-selected={option.id === value}
        className={`${index === active ? 'is-active' : ''}${option.id === value ? ' is-selected' : ''}`}
        title={option.name}
        onPointerEnter={() => setActive(index)}
        onClick={() => choose(option)}
      >
        <span>{option.name}</span>
        {option.id === value && <Check aria-hidden="true" />}
      </li>)}
    </ul>}
  </div>;
}
