import { useEffect, useState } from 'react';
import { deliveryApi } from './deliveryApi';
import { WORK_CALENDARS } from '../../utils/assignmentCalendar';

const day = key => key ? key.split('-').reverse().slice(0, 2).join('/') : '';
const range = value => `${day(value.startDate)}–${day(value.endDate)}`;
// Thứ tự hiện 3 lựa chọn đúng như người dùng đặt (25/11/2026).
const CALENDAR_OPTIONS = ['all', 'sunday', 'none'];
const CALENDAR_HINTS = {
  all: 'Chủ nhật và ngày lễ, Tết đều là ngày làm (8 tiếng). Không dời việc nào.',
  sunday: 'Chủ nhật là ngày làm (8 tiếng); ngày lễ, Tết nghỉ — việc chưa bắt đầu dính ngày lễ được dời ra.',
  none: 'Nghỉ Chủ nhật và ngày lễ, Tết — việc chưa bắt đầu dính các ngày này được dời ra.',
};

/**
 * Sửa dự án đang chạy (người dùng chốt 24/11/2026, thêm lựa chọn lịch 25/11/2026): chọn cách áp dụng → xem trước → áp dụng.
 * - Lịch ngày nghỉ của dự án: 1. làm lễ + Chủ nhật · 2. không làm lễ, chỉ làm Chủ nhật · 3. không làm lễ và Chủ nhật.
 *   Lưu vào dự án; mọi task sau này tự theo.
 * - Mã "MOI" → số tiếp theo mục; việc CHƯA BẮT ĐẦU dính ngày nghỉ (theo lựa chọn) được dời; việc đã bắt đầu chỉ tính lại giờ/ngày.
 * Máy chủ tự sao lưu trước khi áp dụng và ghi Nhật ký.
 */
export default function CalendarFixDialog({ projectId, projectName, onClose, onApplied }) {
  const [step, setStep] = useState('preview');
  const [choice, setChoice] = useState(null);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fetchPreview = workCalendar => deliveryApi.calendarFix(projectId, false, workCalendar ?? undefined)
    .then(result => { setPlan(result.data); setChoice(current => current ?? result.data.policy); })
    .catch(failure => setError(failure.message));
  // Lần mở đầu: xem trước theo cách áp dụng đang dùng của dự án.
  useEffect(() => { fetchPreview(null); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadPreview = workCalendar => { setPlan(null); setError(''); fetchPreview(workCalendar); };
  const changesPolicy = plan && plan.policy !== plan.oldPolicy;
  const nothing = plan && !plan.codeChanges.length && !plan.dateChanges.length && !plan.hourChanges?.length && !changesPolicy;
  const apply = async () => {
    setSaving(true); setError('');
    try { await deliveryApi.calendarFix(projectId, true, plan.policy); await onApplied?.(); onClose(); }
    catch (failure) { setError(failure.message); setSaving(false); }
  };
  const showPreview = () => { setStep('preview'); loadPreview(choice); };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Sửa mã MOI và lịch ngày nghỉ">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 text-sm shadow-2xl dark:bg-slate-900 dark:text-slate-100">
        <h2 className="text-lg font-bold">Sửa mã MOI và lịch ngày nghỉ</h2>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Dự án: <b>{projectName}</b>. Đổi mã "MOI" và áp dụng lịch ngày nghỉ cho các task. Việc <b>chưa bắt đầu</b> dính ngày nghỉ được dời; việc đã bắt đầu chỉ tính lại giờ/ngày. Tổng giờ dự kiến của từng người giữ nguyên. Máy chủ sao lưu dữ liệu trước khi áp dụng.</p>

        {step === 'choose' ? (
          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            <h3 className="mb-2 font-bold">Chọn cách áp dụng cho các task của dự án</h3>
            <div className="space-y-2" role="radiogroup" aria-label="Lịch ngày nghỉ của dự án">
              {CALENDAR_OPTIONS.map((key, index) => (
                <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${choice === key ? 'border-[#8a1c3a] bg-rose-50/60 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="radio" name="work-calendar" value={key} checked={choice === key} onChange={() => setChoice(key)} className="mt-0.5 h-4 w-4 accent-[#8a1c3a]" />
                  <span>
                    <b>{index + 1}. {WORK_CALENDARS[key]}</b>
                    {plan?.oldPolicy === key && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">đang dùng</span>}
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{CALENDAR_HINTS[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            {plan && <p className="mb-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">Cách áp dụng: <b>{WORK_CALENDARS[plan.policy]}</b>{changesPolicy && <span className="text-slate-500 dark:text-slate-400"> (đang dùng: {WORK_CALENDARS[plan.oldPolicy]})</span>}</p>}
            {!plan && !error && <p>Đang kiểm tra dự án…</p>}
            {nothing && <p className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Dự án không còn mã MOI và không có task nào cần đổi theo cách áp dụng này.</p>}
            {plan && !nothing && changesPolicy && !plan.codeChanges.length && !plan.dateChanges.length && !plan.hourChanges.length && <p className="mb-3 rounded-xl bg-sky-50 p-3 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">Không task nào cần đổi ngày hay giờ. Bấm Áp dụng để lưu cách áp dụng này cho dự án (task thêm sau sẽ theo).</p>}
            {plan?.codeChanges.length > 0 && <section className="mb-4"><h3 className="mb-2 font-bold">Đổi mã ({plan.codeChanges.length})</h3>
              <ul className="space-y-1">{plan.codeChanges.map(row => <li key={row.id}><span className="text-slate-400 line-through">{row.from}</span> → <b>{row.to}</b> · {row.title}</li>)}</ul></section>}
            {plan?.dateChanges.length > 0 && <section className="mb-4"><h3 className="mb-2 font-bold">Dời khỏi ngày nghỉ ({plan.dateChanges.length})</h3>
              <ul className="space-y-1">{plan.dateChanges.map(row => <li key={row.id}><b>{row.code}</b> {row.title}: <span className="text-slate-400">{range(row.from)}</span> → <b>{range(row.to)}</b></li>)}</ul></section>}
            {plan?.hourChanges?.length > 0 && <section className="mb-4"><h3 className="mb-2 font-bold">Giữ ngày, chia lại giờ/ngày ({plan.hourChanges.length})</h3>
              <ul className="space-y-1">{plan.hourChanges.map(row => <li key={row.id}><b>{row.code}</b> {row.title} ({range(row.from)}): <span className="text-slate-400">{row.before}</span> → <b>{row.after}</b></li>)}</ul></section>}
            {plan?.startedOnHoliday.length > 0 && <section className="rounded-xl bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><h3 className="mb-1 font-bold">Không tự dời ({plan.startedOnHoliday.length} việc đã bắt đầu)</h3>
              <ul className="space-y-1">{plan.startedOnHoliday.map(row => <li key={row.id}><b>{row.code}</b> {row.title}: {range(row.from)}</li>)}</ul><p className="mt-1">Việc đã làm giữ nguyên ngày, chỉ tính lại giờ/ngày; cần Quản lý tự sửa ngày nếu muốn.</p></section>}
          </div>
        )}
        {error && <p className="mt-2 rounded-xl bg-red-50 p-3 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {step === 'preview'
            ? <button type="button" onClick={() => setStep('choose')} disabled={saving || !plan} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">← Chọn lại cách áp dụng</button>
            : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-slate-100 px-4 py-2 font-bold dark:bg-slate-800">Đóng</button>
            {step === 'choose' && <button type="button" onClick={showPreview} disabled={!choice} className="rounded-xl bg-[#8a1c3a] px-4 py-2 font-bold text-white disabled:opacity-60">Xem trước →</button>}
            {step === 'preview' && plan && !nothing && <button type="button" onClick={apply} disabled={saving} className="rounded-xl bg-[#8a1c3a] px-4 py-2 font-bold text-white disabled:opacity-60">{saving ? 'Đang áp dụng…' : 'Áp dụng'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
