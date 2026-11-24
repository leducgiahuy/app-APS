import { useEffect, useState } from 'react';
import { deliveryApi } from './deliveryApi';

const day = key => key ? key.split('-').reverse().slice(0, 2).join('/') : '';
const range = value => `${day(value.startDate)}–${day(value.endDate)}`;

/**
 * Sửa dự án đang chạy (người dùng chốt 24/11/2026): xem trước rồi mới áp dụng.
 * - Mã "MOI" → số tiếp theo mục; - việc CHƯA BẮT ĐẦU dính Chủ nhật / lễ / Tết được đẩy vào ngày làm việc.
 * Máy chủ tự sao lưu trước khi áp dụng và ghi Nhật ký.
 */
export default function CalendarFixDialog({ projectId, projectName, onClose, onApplied }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    deliveryApi.calendarFix(projectId, false).then(result => setPlan(result.data)).catch(failure => setError(failure.message));
  }, [projectId]);
  const nothing = plan && !plan.codeChanges.length && !plan.dateChanges.length;
  const apply = async () => {
    setSaving(true); setError('');
    try { await deliveryApi.calendarFix(projectId, true); await onApplied?.(); onClose(); }
    catch (failure) { setError(failure.message); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Sửa mã MOI và lịch ngày nghỉ">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 text-sm shadow-2xl dark:bg-slate-900 dark:text-slate-100">
        <h2 className="text-lg font-bold">Sửa mã MOI và lịch ngày nghỉ</h2>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Dự án: <b>{projectName}</b>. Chỉ đổi mã "MOI" và dời việc <b>chưa bắt đầu</b> ra khỏi Chủ nhật, lễ, Tết. Giờ dự kiến của từng người giữ nguyên. Máy chủ sao lưu dữ liệu trước khi áp dụng.</p>
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {!plan && !error && <p>Đang kiểm tra dự án…</p>}
          {nothing && <p className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Dự án không còn mã MOI và không có việc chưa bắt đầu nào rơi vào ngày nghỉ.</p>}
          {plan?.codeChanges.length > 0 && <section className="mb-4"><h3 className="mb-2 font-bold">Đổi mã ({plan.codeChanges.length})</h3>
            <ul className="space-y-1">{plan.codeChanges.map(row => <li key={row.id}><span className="text-slate-400 line-through">{row.from}</span> → <b>{row.to}</b> · {row.title}</li>)}</ul></section>}
          {plan?.dateChanges.length > 0 && <section className="mb-4"><h3 className="mb-2 font-bold">Dời khỏi ngày nghỉ ({plan.dateChanges.length})</h3>
            <ul className="space-y-1">{plan.dateChanges.map(row => <li key={row.id}><b>{row.code}</b> {row.title}: <span className="text-slate-400">{range(row.from)}</span> → <b>{range(row.to)}</b></li>)}</ul></section>}
          {plan?.startedOnHoliday.length > 0 && <section className="rounded-xl bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><h3 className="mb-1 font-bold">Không tự dời ({plan.startedOnHoliday.length} việc đã bắt đầu)</h3>
            <ul className="space-y-1">{plan.startedOnHoliday.map(row => <li key={row.id}><b>{row.code}</b> {row.title}: {range(row.from)}</li>)}</ul><p className="mt-1">Việc đã làm cần Quản lý tự sửa ngày nếu muốn.</p></section>}
          {error && <p className="mt-2 rounded-xl bg-red-50 p-3 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-slate-100 px-4 py-2 font-bold dark:bg-slate-800">Đóng</button>
          {plan && !nothing && <button type="button" onClick={apply} disabled={saving} className="rounded-xl bg-[#8a1c3a] px-4 py-2 font-bold text-white disabled:opacity-60">{saving ? 'Đang áp dụng…' : 'Áp dụng'}</button>}
        </div>
      </div>
    </div>
  );
}
