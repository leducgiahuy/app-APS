import { useEffect, useRef, useState } from 'react';

const normalizeSearch = value => String(value || '')
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd');

export default function EmployeeCombobox({ employees, value, onChange, placeholder = 'Chưa giao' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const selectedEmployee = employees.find(employee => employee.id === value);
  const filteredEmployees = employees.filter(employee =>
    normalizeSearch(`${employee.name} ${employee.title}`).includes(normalizeSearch(search.trim()))
  );

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = event => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openSearch = () => {
    setSearch('');
    setOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        autoComplete="off"
        value={open ? search : selectedEmployee?.name || ''}
        placeholder={open ? 'Tìm tên nhân viên...' : placeholder}
        onFocus={openSearch}
        onClick={() => {
          if (!open) openSearch();
        }}
        onChange={event => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      {open && (
        <div role="listbox" className="absolute z-[100] mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {filteredEmployees.length ? filteredEmployees.map(employee => (
            <button
              key={employee.id}
              type="button"
              role="option"
              aria-selected={employee.id === value}
              onClick={() => {
                onChange(employee);
                setOpen(false);
                setSearch('');
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="block font-semibold">{employee.name}</span>
              {employee.title && <span className="mt-0.5 block text-[10px] text-slate-500">{employee.title}</span>}
            </button>
          )) : (
            <p className="px-3 py-2 text-xs text-slate-500">Không tìm thấy nhân viên phù hợp</p>
          )}
        </div>
      )}
    </div>
  );
}
