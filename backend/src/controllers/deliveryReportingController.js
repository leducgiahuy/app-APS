import { projectActor } from '../utils/operationsStore.js';
import { randomUUID } from 'node:crypto';
import { readDb, writeDb } from '../models/db.js';
import { deliveryStore } from '../utils/deliveryAuth.js';
import { computeDelivery, moneyAccess } from '../../../frontend/src/utils/deliveryMetrics.js';
import { fiscalMonths, monthSnapshot, vietnamMonth } from '../../../frontend/src/utils/deliveryResources.js';
import { emptyDeliveryProject } from './deliveryController.js';

const privileged = user => ['director', 'admin'].includes(user.role);
function visibleProjects(db, user) {
  if (user.role !== 'manager') return (db.projects || []).filter(p=>projectActor(db,user,p.id));
  const employee = db.employees?.find(row => row.id === user.employeeId);
  const names = [user.email, user.name, user.employeeId, employee?.name].filter(Boolean);
  return (db.projects || []).filter(project => (db.operations?.members||[]).some(m=>m.projectId===project.id&&m.email===user.email&&m.role==='manager'&&!m.deletedAt) || names.includes(project.manager) || project.managerId === user.employeeId && user.employeeId || project.managerEmail === user.email);
}
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
function projectData(store, id) {
  return { ...emptyDeliveryProject(), ...store.projects[id] };
}
function result(db, user, year, month) {
  const store = deliveryStore(db);
  const plan = store.fiscalPlans?.[year] || { revision: 0, projects: {}, status: 'draft' };
  const projects = visibleProjects(db, user).map(project => {
    const data = projectData(store, project.id);
    const metrics = computeDelivery(db, project.id, data);
    return { id: project.id, name: project.name, revision: data.revision, manager: project.manager, month: monthSnapshot(data, month, metrics), months: fiscalMonths(year).map(key => monthSnapshot(data, key, metrics)), annualPlan: plan.projects?.[project.id] ?? null };
  });
  const months = fiscalMonths(year);
  const count = new Set((db.workforcePlan?.demands || []).filter(row => !row.projectId && row.startDate?.slice(0, 7) <= months.at(-1) && row.endDate?.slice(0, 7) >= months[0]).map(row => row.projectName).filter(Boolean)).size;
  const pipeline = user.role !== 'manager' ? { id: '__pipeline__', name: `Dự án dự kiến ký (${count} dự án)`, annualPlan: plan.projects?.__pipeline__ ?? null, months: months.map(key => ({ month: key, output: null, status: 'draft' })) } : null;
  return { year, month, projects, pipeline, plan: { ...plan, projects: Object.fromEntries([...projects.map(project => [project.id, plan.projects?.[project.id] ?? null]), ...(pipeline ? [['__pipeline__', pipeline.annualPlan]] : [])]) }, permissions: { approve: privileged(user), plan: privileged(user) || ['accountant','chiefAccountant'].includes(user.role), review: ['manager', 'accountant', 'chiefAccountant', 'director', 'admin'].includes(user.role) }, viewer: { role: user.role, email: user.email } };
}
export function deliveryReporting(req, res) {
  try {
    const user = req.deliveryUser;
    if (!moneyAccess(user.role)) return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo sản lượng.' });
    const db = structuredClone(readDb());
    const store = deliveryStore(db);
    const source = req.method === 'GET' ? req.query : req.body;
    const year = Number(source.year);
    const month = source.month;
    ensure(Number.isInteger(year) && year >= 2000 && year <= 2200 && /^\d{4}-(0[1-9]|1[0-2])$/.test(month || ''), 'Năm / tháng báo cáo không hợp lệ.');
    if (req.method !== 'GET') {
      const { action, value = {}, revisions = {} } = req.body;
      const visible = visibleProjects(db, user);
      const at = new Date().toISOString();
      if (action === 'reviewMonth' || action === 'approveMonth' || action === 'reopenMonth') {
        ensure(month <= vietnamMonth(), 'Không thể chốt tháng tương lai.');
        ensure(action === 'reviewMonth' || privileged(user), 'Chỉ Giám đốc được duyệt khóa hoặc mở lại tháng.');
        const targets = visible.filter(project => !value.projectId || project.id === value.projectId);
        ensure(targets.length, 'Không có dự án được phép thao tác.');
        const eligible = targets.filter(project => projectData(store, project.id).settings.contractFee != null);
        ensure(eligible.length, 'Cần nhập phí hợp đồng trước khi rà soát sản lượng.');
        for (const project of eligible) {
          const data = projectData(store, project.id);
          if (revisions[project.id] !== data.revision) return res.status(409).json({ message: 'Báo cáo vừa thay đổi. Tải lại và kiểm tra trước khi lưu.' });
          const snapshot = monthSnapshot(data, month, computeDelivery(db, project.id, data));
          ensure(snapshot.output != null, `Dự án ${project.name} chưa có số liệu tháng này.`);
          if (action === 'reviewMonth') {
            ensure(snapshot.status !== 'closed', 'Tháng đã khóa. Giám đốc cần mở lại trước.');
            data.closes = data.closes.filter(row => row.month !== month || row.status !== 'reviewed');
            data.closes.push({ ...snapshot, id: randomUUID(), status: 'reviewed', reviewedBy: user.email, reviewedAt: at });
          } else if (action === 'approveMonth') {
            if (snapshot.status === 'closed') continue;
            const reviewed = data.closes.filter(row => row.month === month && row.status === 'reviewed').at(-1);
            ensure(reviewed, `Dự án ${project.name} chưa được rà soát.`);
            ensure(['output', 'completion', 'cumulative', 'fee', 'efficiency'].every(key => reviewed[key] === snapshot[key]), `Số liệu ${project.name} thay đổi sau rà soát. Hãy rà soát lại.`);
            data.closes.push({ ...reviewed, id: randomUUID(), status: 'closed', closedBy: user.email, closedAt: at });
          } else {
            ensure(typeof value.reason === 'string' && value.reason.trim(), 'Cần nhập lý do mở lại.');
            ensure(snapshot.status === 'closed', 'Tháng chưa khóa.');
            const close = data.closes.find(row => row.id === snapshot.id);
            Object.assign(close, { status: 'reopened', reopenReason: value.reason.trim(), reopenedBy: user.email, reopenedAt: at });
            data.closes = data.closes.filter(row => row.month !== month || row.status !== 'reviewed');
          }
          data.audit.push({ actor: user.email, action: `${action}:${month}`, at }); data.revision++;
          store.projects[project.id] = data;
        }
      } else if (action === 'savePlan' || action === 'approvePlan') {
        ensure(privileged(user) || ['accountant','chiefAccountant'].includes(user.role), 'Chỉ kế toán / Giám đốc lập kế hoạch năm.');
        ensure(action !== 'approvePlan' || privileged(user), 'Chỉ Giám đốc duyệt kế hoạch năm.');
        store.fiscalPlans ||= {};
        const old = store.fiscalPlans[year] || { revision: 0, projects: {} };
        ensure(value.revision === old.revision, 'Kế hoạch đã thay đổi; hãy tải lại.');
        const projects = { ...old.projects };
        for (const [id, amount] of Object.entries(value.projects || {})) {
          ensure(id === '__pipeline__' || visible.some(project => project.id === id), 'Dự án kế hoạch không tồn tại hoặc không có quyền.');
          ensure(amount == null || amount === '' || Number.isFinite(Number(amount)) && Number(amount) >= 0, 'Kế hoạch năm phải không âm.');
          projects[id] = amount === '' || amount == null ? null : Number(amount);
        }
        store.fiscalPlans[year] = { ...old, projects, revision: old.revision + 1, status: action === 'approvePlan' ? 'approved' : 'draft', updatedBy: user.email, updatedAt: at, approvedBy: action === 'approvePlan' ? user.email : '', approvedAt: action === 'approvePlan' ? at : '' };
        store.reportingAudit ||= []; store.reportingAudit.push({ actor: user.email, action: `${action}:${year}`, at });
      } else throw new Error('Thao tác báo cáo không hợp lệ.');
      ensure(writeDb(db), 'Không lưu được báo cáo.');
    }
    return res.json({ success: true, data: result(db, user, year, month) });
  } catch (error) { return res.status(400).json({ message: error.message }); }
}
