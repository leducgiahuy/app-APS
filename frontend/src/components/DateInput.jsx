import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateVi, parseDateVi } from '../utils/date';

export default function DateInput({ value, onChange, className = '', required = false, min, max, ...props }) {
  const pickerRef = useRef(null);
  const [draft, setDraft] = useState(formatDateVi(value));

  useEffect(() => setDraft(formatDateVi(value)), [value]);

  const handleTextChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    if (!next.trim()) {
      onChange('');
      return;
    }
    const isoDate = parseDateVi(next);
    if (isoDate) onChange(isoDate);
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    // Preserve this field's own value so its native calendar opens on its month.
    if (!picker.value && value) picker.value = value;
    if (typeof picker.showPicker === 'function') picker.showPicker();
    else picker.click();
  };

  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        required={required}
        value={draft}
        placeholder="DD/MM/YYYY"
        onChange={handleTextChange}
        onBlur={() => setDraft(formatDateVi(value))}
        pattern="(?:0?[1-9]|[12][0-9]|3[01])/(?:0?[1-9]|1[0-2])/[0-9]{4}"
        title="Nhập ngày theo định dạng ngày/tháng/năm"
        className={`${className} pr-10`}
      />
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const selectedDate = event.target.value;
          if (selectedDate) {
            onChange(selectedDate);
            setDraft(formatDateVi(selectedDate));
          }
        }}
        className="pointer-events-none absolute right-9 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Mở lịch chọn ngày"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-sky-600"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );
}
