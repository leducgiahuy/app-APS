import { X } from 'lucide-react';
import ModalOverlay from '../../components/layout/ModalOverlay';
import { formatDateVi } from '../../utils/date';

export default function AssignmentCalendarConfirmation({ title, conflicts, saving, onChoice, onClose }) {
  return <ModalOverlay>
    <div role="alertdialog" aria-modal="true" aria-labelledby="assignment-calendar-title" className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl dark:border-amber-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3"><h3 id="assignment-calendar-title" className="text-lg font-bold text-slate-900 dark:text-white">Task trùng ngày lễ hoặc Chủ nhật</h3><button type="button" aria-label="Đóng cảnh báo" disabled={saving} onClick={onClose}><X size={20} /></button></div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Task “{title}” bạn đang giao có trùng ngày nghỉ. Bạn có muốn làm vào những ngày này không?</p>
      <ul className="my-4 max-h-48 overflow-y-auto rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{conflicts.map(day => <li key={day.key}>{formatDateVi(day.key)} — {day.label}</li>)}</ul>
      <p className="text-xs text-slate-500">Có: tính như ngày thường. Không: bỏ ngày lễ và Chủ nhật khỏi lịch phân công và số công.</p>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" disabled={saving} onClick={() => onChoice(true)} className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-bold text-slate-700 dark:text-slate-200">Không</button>
        <button type="button" disabled={saving} onClick={() => onChoice(false)} className="rounded-xl bg-sky-700 px-5 py-2 text-sm font-bold text-white">CÓ</button>
      </div>
    </div>
  </ModalOverlay>;
}
