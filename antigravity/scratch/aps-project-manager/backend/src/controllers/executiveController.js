import { randomUUID } from 'node:crypto';
import { readDb, writeDb } from '../models/db.js';
import { buildExecutiveReport, emptyExecutiveSettings } from '../utils/executiveReport.js';
import { deliveryStore } from '../utils/deliveryAuth.js';

const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '') && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2200;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const ensure = (value, message) => { if (!value) throw new Error(message); };
const amount = (value, nullable = false, negative = false) => {
  if (nullable && (value === '' || value == null)) return null;
  ensure(value !== '' && value != null && Number.isFinite(Number(value)) && (negative || Number(value) >= 0), 'Số tiền / mục tiêu không hợp lệ.');
  return Number(value);
};
export function executiveReport(req, res) {
  try {
    const month = req.method === 'GET' ? req.query.month : req.body.month;
    ensure(validMonth(month), 'Tháng báo cáo không hợp lệ.');
    const db = structuredClone(readDb());
    if (req.method === 'PATCH') {
      const user = req.deliveryUser;
      if (!['director', 'admin', 'accountant', 'chiefAccountant'].includes(user.role)) return res.status(403).json({ message: 'Chỉ Giám đốc / kế toán được cập nhật dữ liệu điều hành.' });
      const store = deliveryStore(db);
      const old = { ...emptyExecutiveSettings(), ...store.executive };
      if (req.body.revision !== old.revision) return res.status(409).json({ message: 'Dữ liệu vừa thay đổi. Tải lại trước khi lưu.' });
      const { action, value = {}, id } = req.body;
      const next = structuredClone(old);
      if (action === 'settings') {
        ensure(!value.openingMonth || validMonth(value.openingMonth), 'Tháng số dư đầu kỳ không hợp lệ.');
        if(Object.hasOwn(value,'openingMonth'))next.openingMonth = value.openingMonth || '';
        if(Object.hasOwn(value,'openingBalance'))next.openingBalance = amount(value.openingBalance, true, true);
        ensure(next.openingBalance == null || next.openingMonth, 'Cần chọn tháng của số dư đầu kỳ.');
        if(Object.hasOwn(value,'productivityTarget'))next.productivityTarget = amount(value.productivityTarget, true);
        if(Object.hasOwn(value,'onTimeTarget'))next.onTimeTarget = amount(value.onTimeTarget, true);
        ensure(next.onTimeTarget == null || next.onTimeTarget <= 100, 'Mục tiêu nộp đúng hạn tối đa 100%.');
        if(Object.hasOwn(value,'collectionTarget'))next.collectionTargets[month] = amount(value.collectionTarget, true);
      } else if (['cashPlan', 'receivable', 'contract'].includes(action)) {
        const key = { cashPlan: 'cashPlans', receivable: 'receivables', contract: 'contracts' }[action];
        const existing = next[key].find(row => row.id === id);
        ensure(!id || existing, 'Bản ghi không còn tồn tại.');
        ensure(typeof value.title === 'string' && value.title.trim(), 'Cần nhập nội dung.');
        let entry = { id: id || randomUUID(), title: value.title.trim() };
        if (action === 'cashPlan') {
          ensure(validMonth(value.month), 'Tháng thu / chi không hợp lệ.');
          entry = { ...entry, month: value.month, inflow: amount(value.inflow), outflow: amount(value.outflow) };
        } else if (action === 'receivable') {
          ensure(db.projects.some(row => row.id === value.projectId), 'Cần chọn dự án.');
          ensure(validDate(value.dueDate), 'Ngày đến hạn không hợp lệ.');
          entry = { ...entry, projectId: value.projectId, amount: amount(value.amount), paidAmount: amount(value.paidAmount), dueDate: value.dueDate };
          ensure(entry.paidAmount <= entry.amount, 'Số đã thu không được vượt giá trị công nợ.');
        } else {
          ensure(['director', 'admin'].includes(user.role) || value.status === (existing?.status || 'pending'), 'Chỉ Giám đốc được ký hợp đồng.');
          ensure(['pending', 'signed', 'cancelled'].includes(value.status), 'Trạng thái hợp đồng không hợp lệ.');
          entry = { ...entry, code: String(value.code || '').trim(), amount: amount(value.amount), status: value.status, ...(value.status === 'signed' ? { signedBy: existing?.status === 'signed' ? existing.signedBy : user.email, signedAt: existing?.status === 'signed' ? existing.signedAt : new Date().toISOString() } : {}) };
        }
        if (existing) next[key][next[key].indexOf(existing)] = entry; else next[key].push(entry);
      } else if (action === 'delete') {
        ensure(['cashPlans', 'receivables', 'contracts'].includes(value.collection), 'Danh mục không hợp lệ.');
        ensure(next[value.collection].some(row => row.id === id), 'Bản ghi không còn tồn tại.');
        if (value.collection === 'contracts' && !['director', 'admin'].includes(user.role)) return res.status(403).json({ message: 'Chỉ Giám đốc được xóa hợp đồng.' });
        next[value.collection] = next[value.collection].filter(row => row.id !== id);
      } else throw new Error('Thao tác không hợp lệ.');
      next.revision++;
      store.executive = next;
      store.reportingAudit ||= [];
      store.reportingAudit.push({ action: `executive:${action}`, actor: user.email, at: new Date().toISOString(), id });
      ensure(writeDb(db), 'Không lưu được dữ liệu điều hành.');
    }
    return res.json({ success: true, data: buildExecutiveReport(db, req.deliveryUser, month) });
  } catch (error) { return res.status(400).json({ message: error.message }); }
}
