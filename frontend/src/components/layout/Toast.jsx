import React from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export default function Toast() {
  const { toast } = useApp();

  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-500 flex-shrink-0" />
  };

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 right-6 z-[2147483647] animate-bounce duration-300" role="status" aria-live="polite">
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-2xl border border-slate-200 dark:border-slate-700 min-w-[280px]">
        {icons[toast.type] || icons.info}
        <span className="text-sm font-medium">{toast.message}</span>
      </div>
    </div>,
    document.body
  );
}
