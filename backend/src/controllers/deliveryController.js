import { DEFAULT_PROCEDURES } from '../../../frontend/src/utils/deliveryResources.js';
import { matrixAllows } from '../../../frontend/src/utils/operationsDefaults.js';
import { operations } from '../utils/operationsStore.js';
import { allSheets, canReviewSheet, sheetFlags } from '../utils/operationsReports.js';
import { assignmentWorkingDates } from '../../../frontend/src/utils/assignmentCalendar.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { readDb, writeDb } from '../models/db.js';
import { deliveryStore, canEditDeliveryTask, publicDelivery } from '../utils/deliveryAuth.js';
import { computeDelivery, projectDeliveryItems, defaultDeliveryRecord, DELIVERY_LEVELS, managingRole, moneyAccess } from '../../../frontend/src/utils/deliveryMetrics.js';
import { isTaskOverdue } from '../../../frontend/src/utils/date.js';
import { syncTaskCompletionFromDelivery } from './taskController.js';
import { addDays, dateDifference } from '../../../frontend/src/utils/workforceForecast.js';

export const emptyDeliveryProject = () => ({ revision: 0, settings: { contractFee: null, hourlyRate: null }, records: {}, timesheets: [], documents: [], customerRequests: [], meetingMinutes: [], changes: [], closes: [], receipts: [], expenses: [], milestones: [], evidence: [], comments: [], audit: [], history: [] });
const text = value => typeof value === 'string' ? value.trim() : '';
const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const timestampValid = value => !value || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
const money = value => value === '' || value == null ? null : Number(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const fileRoot = () => path.join(path.dirname(path.resolve(process.env.APS_DB_PATH || path.join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'APS Project Manager', 'db.json'))), 'delivery-files');

function context(req) {
  const db = structuredClone(readDb());
  assert((db.projects || []).some(project => project.id === req.params.projectId), 'Dự án không tồn tại.');
  const store = deliveryStore(db);
  const data = { ...emptyDeliveryProject(), ...store.projects[req.params.projectId] };
  store.projects[req.params.projectId] = data;
  return { db, data, user: req.deliveryUser, projectId: req.params.projectId };
}
function response(ctx) {
  return { ...publicDelivery(ctx.data, computeDelivery(ctx.db, ctx.projectId, ctx.data), ctx.user,ctx.db.operations?.matrix), procedures:(ctx.db.operations?.procedures||DEFAULT_PROCEDURES).map(row=>moneyAccess(ctx.user.role)?row:Object.fromEntries(Object.entries(row).filter(([key])=>key!=='fee'))), revision: ctx.data.revision, history: moneyAccess(ctx.user.role)&&matrixAllows(ctx.db.operations?.matrix,'hdValue',ctx.user.role) ? ctx.data.history : [] };
}
export function getDeliveryProject(req, res) {
  try {
    const ctx = context(req);
    const derived = computeDelivery(ctx.db, ctx.projectId, ctx.data);
    let changed = false;
    derived.milestones.forEach(item => {
      const saved = ctx.data.milestones.find(entry => entry.id === item.id);
      if (item.met && !saved.metOn) { saved.metOn = item.metOn; changed = true; }
      if (!item.met && saved.metOn) { saved.metOn = ''; changed = true; }
    });
    if (changed) { ctx.data.revision++; if (!writeDb(ctx.db)) throw new Error('Không lưu được cập nhật mốc thanh toán.'); }
    return res.json({ success: true, data: response(ctx) });
  } catch (error) { return res.status(400).json({ message: error.message }); }
}

export function applyDeliveryMutation(ctx, body) {
  const { db, data, user, projectId } = ctx;
  const { action, value = {}, taskId, id } = body;
  const items = projectDeliveryItems(db, projectId);
  const item = items.find(item => item.id === taskId);
  const manager = managingRole(user.role);
  const financial = moneyAccess(user.role);
  const before = computeDelivery(db, projectId, data);
  const current = item ? before.records[taskId] : null;
  const matrixKey={task:'editStatus',confirm:'confirmStatus',timesheet:'tsSubmit',lockWeights:'scope',milestone:'milestones',reopenMonth:'payment'}[action];
  if(matrixKey)assert(matrixAllows(operations(db).matrix,matrixKey,user.role,'write') || user.role==='admin','Ma trận phân quyền không cho phép thao tác này.');
  const auditBefore=structuredClone(data.records);
  if (['task', 'confirm', 'comment'].includes(action)) assert(item, 'Task không tồn tại hoặc không phải task lá của dự án.');
  if (action === 'task') {
    assert(canEditDeliveryTask(user, item, db), 'Bạn chỉ được cập nhật việc của mình hoặc việc thuộc nhóm phụ trách.');
    const level = Number(value.level ?? current.level);
    assert(DELIVERY_LEVELS.includes(level), 'Chỉ được chọn mức 0, 20, 40, 60, 80 hoặc 100%.');
    const linkedTask = (db.tasks || []).find(task => task.ganttId === item.id);
    const completedTask = item.status === 'completed' || linkedTask?.status === 'completed';
    const overdueTask = !completedTask && (isTaskOverdue(item) || isTaskOverdue(linkedTask));
    if (value.level !== undefined && completedTask) {
      assert(level >= 40, 'Task đã hoàn thành nên chỉ có thể chọn mức trạng thái từ 40% trở lên; không thể chọn 0% hoặc 20%.');
    }
    assert(['design', 'legal'].includes(value.kind || current.kind), 'Loại việc không hợp lệ.');
    ['dueAt', 'sentAt'].forEach(key => assert(timestampValid(value[key]), 'Ngày giờ nộp hồ sơ không hợp lệ.'));
    const record = { ...current, level, kind: value.kind || current.kind, dueAt: value.dueAt ?? current.dueAt, sentAt: value.sentAt ?? current.sentAt, recipient: text(value.recipient ?? current.recipient), submissionContent: text(value.submissionContent ?? current.submissionContent), notes: text(value.notes ?? current.notes), evidenceId: value.evidenceId ?? current.evidenceId, submittedBy: user.email, updatedAt: new Date().toISOString() };
    if (manager) { record.department = text(value.department ?? current.department); record.approvalOnly = value.approvalOnly ?? current.approvalOnly; record.assignmentRoles = value.assignmentRoles ?? current.assignmentRoles ?? {}; }
    if (record.approvalOnly && !completedTask && !overdueTask) assert(level === 0 || level === 100, 'Việc CĐT phê duyệt chỉ có mức 0% hoặc 100%.');
    const approvedHours = computeDelivery(db, projectId, data).taskMetrics[taskId]?.actualHours || 0;
    if (!overdueTask && level === 20 && current.level !== 20) assert(approvedHours > 0, 'Mức 20% cần có giờ chấm công đã được duyệt vào việc.');
    if (!overdueTask && level === 0 && current.level !== 0) assert(approvedHours === 0, 'Đã có giờ công; không thể chuyển về Chưa bắt đầu.');
    if (record.evidenceId) assert(data.evidence.some(file => file.id === record.evidenceId && file.taskId === taskId && !file.deletedAt), 'Bằng chứng không thuộc task này.');
    const changed = ['level', 'evidenceId', 'sentAt', 'kind', 'approvalOnly'].some(key => record[key] !== current[key]);
    record.submittedBy = changed ? user.email : current.submittedBy || '';
    if (changed) { record.confirmedBy = ''; record.confirmedAt = ''; record.levelChangedAt = new Date().toISOString(); }
    data.records[taskId] = record;
    const canonical = db.ganttItems.find(row => row.id === taskId);
    if (canonical) canonical.ganttNote = record.notes;
    (db.tasks || []).filter(row => row.ganttId === taskId).forEach(row => { row.ganttNote = record.notes; });
  } else if (action === 'confirm') {
    assert(['leader', 'manager', 'director', 'admin'].includes(user.role) && canEditDeliveryTask(user, item, db), 'Bạn không có quyền xác nhận task này.');
    assert(user.email !== current.submittedBy && !item.assignees?.some(assignment => assignment.employeeId === user.employeeId && user.employeeId), 'Không được xác nhận việc do chính mình thực hiện hoặc tự báo cáo.');
    assert(manager || !item.assignees?.some(assignment => deliveryStore(db).users.some(person => !person.disabled && person.role === 'leader' && person.employeeId === assignment.employeeId)), 'Việc của Leader cần quản lý xác nhận.');
    assert(current.level >= 60 && current.evidenceId, 'Cần mức từ 60% và có bằng chứng trước khi xác nhận.');
    const requiredKind = current.level === 60 ? (current.kind === 'legal' ? 'receipt' : 'handover') : current.level === 80 ? 'feedback' : 'approval';
    const evidence = data.evidence.find(file => file.id === current.evidenceId && file.taskId === taskId);
    assert(evidence?.kind === requiredKind, `Mức này cần bằng chứng loại ${requiredKind === 'receipt' ? 'Biên nhận nộp hồ sơ' : requiredKind === 'handover' ? 'Email/biên bản giao' : requiredKind === 'feedback' ? 'Văn bản góp ý/bổ sung' : 'Văn bản/email chấp thuận'}.`);
    data.records[taskId] = { ...current, confirmedBy: user.email, confirmedAt: new Date().toISOString() };
  } else if (action === 'revokeConfirmation' || action === 'revokeEvidence') {
    const target=items.find(t=>t.id===taskId);assert(target&&canEditDeliveryTask(user,target,db),'Không có quyền thu hồi bằng chứng / xác nhận.');assert(text(value.reason),'Cần lý do thu hồi.');
    const record={...before.records[taskId],...(action==='revokeConfirmation'?{confirmedBy:'',confirmedAt:''}:{}),revokedBy:user.email,revokedAt:new Date().toISOString(),revokeReason:text(value.reason)};
    if(action==='revokeEvidence'){const file=data.evidence.find(f=>f.id===id&&f.taskId===taskId&&!f.deletedAt);assert(file,'Bằng chứng không tồn tại.');file.deletedAt=new Date().toISOString();file.deletedBy=user.email;if(record.evidenceId===id)Object.assign(record,{evidenceId:'',confirmedBy:'',confirmedAt:''});}
    data.records[taskId]=record;
  } else if (action === 'changeAppendix') {
    assert(['director','admin'].includes(user.role),'Chỉ Giám đốc ký phụ lục.');const cr=data.changes.find(c=>c.id===id);assert(cr&&cr.decision==='paid'&&!cr.signedAt,'CR phải được quyết định thu phí và chưa ký phụ lục.');assert(cr.createdBy!==user.email,'Không tự duyệt phụ lục do mình đề xuất.');
    assert(text(value.appendix)&&dateValid(value.signedDate)&&dateValid(value.startDate)&&dateValid(value.endDate)&&value.endDate>=value.startDate,'Cần số phụ lục, ngày ký và lịch việc mới.');assert(data.settings.contractFee!=null,'Cần giá trị hợp đồng hiện tại.');const delta=Number(value.amount),hours=Number(value.estimatedHours);assert(Number.isInteger(delta)&&delta>0&&Number.isFinite(hours)&&hours>0,'Phí và giờ bổ sung phải lớn hơn 0.');
    const project=db.projects.find(p=>p.id===projectId);assert(value.startDate>=project.startDate&&value.endDate<=project.endDate,'Lịch mới phải nằm trong thời gian dự án.');const employee=db.employees.find(e=>e.id===value.employeeId);assert(employee,'Chọn nhân sự thực hiện việc mới.');
    const addedContractWork=hours/8;
    const currentProjectBudget=project.contractWork !== '' && project.contractWork != null && Number.isFinite(Number(project.contractWork))
      ? Number(project.contractWork)
      : Object.values(before.taskMetrics || {}).reduce((sum,metric)=>sum+(Number(metric.budgetedWork)||0),0);
    const task={id:`G-${randomUUID()}`,projectId,code:`${cr.code}.PL`,title:text(value.title)||cr.title,startDate:value.startDate,endDate:value.endDate,requiredPosition:employee.title||'',estimatedHours:hours,contractWork:addedContractWork,parentGroupId:db.ganttItems.find(t=>t.id===cr.taskId)?.parentGroupId||'',dependencies:[],isGroup:false,status:'not_started',createdAt:new Date().toISOString(),changeId:cr.id};const days=assignmentWorkingDates(task,{excludeNonWorkingDays:true}).length;assert(days>0,'Khoảng lịch không có ngày làm việc.');task.assignees=[{employeeId:employee.id,employeeName:employee.name,startDate:task.startDate,endDate:task.endDate,estimatedHoursPerDay:hours/days,excludeNonWorkingDays:true}];task.assignee=employee.name;db.ganttItems.push(task);db.tasks ||= [];db.tasks.push({...task,id:`task-${randomUUID()}`,ganttId:task.id,employeeId:employee.id,employeeName:employee.name,projectName:project.name,progress:0,actualWorkHours:0});
    project.contractWork=currentProjectBudget+addedContractWork;
    data.settings.contractFee+=delta;Object.assign(cr,{appendix:text(value.appendix),signedAt:value.signedDate,signedBy:user.email,appendixAmount:delta,appendixTaskId:task.id,approvedEstimatedHours:hours,budgetWorkAdded:addedContractWork});
    if(data.settings.contractLocked){const m=computeDelivery(db,projectId,{...data,lockedWeights:{},settings:{...data.settings,contractLocked:false}});data.lockedWeights=Object.fromEntries(Object.entries(m.taskMetrics).map(([key,t])=>[key,m.summary.totalPlanned>0?t.planned/m.summary.totalPlanned:0]));}
  } else if (action === 'applyTemplate') {
    assert(manager, 'Chỉ quản lý được áp dụng mẫu dự án.');
    assert(!(db.ganttItems || []).some(item => item.projectId === projectId), 'Chỉ áp dụng mẫu cho dự án chưa có công việc.');
    const template = deliveryStore(db).templates.find(item => item.id === value.templateId);
    assert(template, 'Mẫu dự án không tồn tại.');
    const project = db.projects.find(item => item.id === projectId);
    const idMap = new Map(template.items.map(item => [item.id, `G-${randomUUID()}`]));
    const created = template.items.map(item => ({ ...item, id: idMap.get(item.id), projectId, startDate: addDays(project.startDate, item.startOffset), endDate: addDays(project.startDate, item.endOffset), parentGroupId: idMap.get(item.parentGroupId) || '', parentTaskId: idMap.get(item.parentTaskId) || '', dependencies: (item.dependencies || []).map(id => idMap.get(id)).filter(Boolean), assignees: [], assignee: '', createdAt: new Date().toISOString(), status: 'not_started' }));
    assert(created.every(item => item.endDate <= project.endDate), 'Thời gian dự án ngắn hơn mẫu. Hãy kéo dài ngày kết thúc dự án trước.');
    db.ganttItems.push(...created);
    db.tasks ||= [];
    created.filter(item => !item.isGroup).forEach(item => db.tasks.push({ ...item, id: `task-${randomUUID()}`, ganttId: item.id, projectName: project.name, title: item.title, employeeId: '', employeeName: '', progress: 0, actualWorkHours: 0, estimatedDays: item.days }));
  } else if (action === 'settings') {
    assert(manager, 'Chỉ quản lý được cấu hình dự án.');
    const settings = { ...data.settings };
    for (const key of ['contractFee', 'hourlyRate']) if (Object.hasOwn(value, key)) { const number = money(value[key]); assert(number == null || Number.isFinite(number) && number >= 0, 'Phí hợp đồng/đơn giá không hợp lệ.'); settings[key] = number; }
    if (value.rates) { assert(typeof value.rates === 'object' && !Array.isArray(value.rates), 'Bảng đơn giá không hợp lệ.'); settings.rates = {}; for (const [employeeId, rate] of Object.entries(value.rates)) { assert(Number.isFinite(Number(rate)) && Number(rate) >= 0, 'Đơn giá phải không âm.'); settings.rates[employeeId] = Number(rate); } }
    data.settings = settings;
  } else if (action === 'lockWeights') {
    assert(manager, 'Chỉ quản lý được khóa tỷ trọng.');
    assert(!data.settings.contractLocked || text(value.reason), 'Điều chỉnh khóa cần ghi lý do/phụ lục hợp đồng.');
    const metrics = computeDelivery(db, projectId, { ...data, lockedWeights: {} });
    assert(metrics.summary.totalPlanned > 0, 'Cần có Công DT từ lịch hoặc phân công trước khi khóa tỷ trọng.');
    data.lockedWeights = Object.fromEntries(Object.entries(metrics.taskMetrics).map(([key, item]) => [key, data.records[key]?.freeRework ? 0 : item.planned / metrics.summary.totalPlanned]));
    data.settings.contractLocked = true; data.settings.lockedAt = new Date().toISOString(); data.settings.lockReason = text(value.reason) || 'Khóa khi ký hợp đồng';
  } else if (action === 'timesheet') {
    assert(item || value.taskId, 'Chọn task chấm công.');
    const target = items.find(item => item.id === (value.taskId || taskId));
    assert(target && (manager || value.employeeId === user.employeeId && canEditDeliveryTask(user, target, db)), 'Bạn không được nhập giờ cho nhân sự này.');
    assert((db.employees || []).some(employee => employee.id === value.employeeId), 'Nhân sự không tồn tại.');
    assert(dateValid(value.date) && value.date <= new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10), 'Ngày chấm công phải hợp lệ và không ở tương lai.');
    assert(Number.isFinite(Number(value.hours)) && Number(value.hours) > 0 && Number(value.hours) <= 24, 'Giờ công phải lớn hơn 0 và không quá 24h/phiếu.');
    data.timesheets.push({ id: randomUUID(), taskId: target.id, employeeId: value.employeeId, employeeName: db.employees.find(employee => employee.id === value.employeeId)?.name, date: value.date, hours: Number(value.hours), shiftType: value.shiftType === 'overtime' ? 'overtime' : 'regular', source: 'manual', status: 'pending', createdBy: user.email });
  } else if (action === 'approveTimesheet') {
    const candidate = computeDelivery(db, projectId, data).timesheets.find(entry => entry.id === id);
    assert(['pending', 'submitted'].includes(candidate?.status) && !candidate?.locked, 'Phiếu giờ không ở trạng thái chờ duyệt hoặc đã bị khóa.');
    assert(candidate, 'Phiếu giờ công không tồn tại.');
    assert(canReviewSheet(db,user,{...candidate,projectId}),'Không được tự duyệt hoặc duyệt sai cấp / nhóm.');
    assert(['approved', 'rejected'].includes(value.status), 'Trạng thái duyệt không hợp lệ.');
    if (value.status === 'rejected') assert(text(value.reason), 'Cần ghi lý do từ chối.');
    if (value.status === 'approved') {
      const all = allSheets(db);
      const flags = sheetFlags(db, { ...candidate, projectId }, all);
      assert(!flags.some(flag => flag !== 'Chưa có dữ liệu chấm công'), 'Dòng giờ có lỗi: ' + flags.join('; '));
      if (flags.length) assert(text(value.reason), 'Chưa có chấm công: cần ghi lý do đối chiếu trước khi duyệt.');
      const other = all.filter(entry => entry.id !== candidate.id && entry.status === 'approved' && entry.employeeId === candidate.employeeId && entry.date === candidate.date);
      assert(other.reduce((sum, entry) => sum + Number(entry.hours), 0) + candidate.hours <= 24, 'Tổng giờ đã duyệt của một người không được quá 24h/ngày.');
      if (candidate.shiftType === 'overtime') {
        const linked = db.tasks?.find(row => row.ganttId === candidate.taskId);
        const slips = (db.overtimes || []).filter(row => row.status === 'approved' && row.employeeId === candidate.employeeId && row.date === candidate.date && [candidate.taskId, linked?.id].includes(row.taskId));
        const used = other.filter(entry => entry.taskId === candidate.taskId && entry.shiftType === 'overtime').reduce((sum, entry) => sum + entry.hours, 0);
        assert(slips.reduce((sum, row) => sum + Number(row.hours), 0) >= used + candidate.hours, 'Giờ OT cần có phiếu tăng ca đã duyệt cho đúng người, task và ngày, đủ số giờ.');
      }
    }
    const row = { ...candidate, status: value.status, locked: value.status === 'approved', reason: text(value.reason), approvedBy: user.email, approvedAt: new Date().toISOString() };
    const index = data.timesheets.findIndex(entry => entry.id === id);
    if (index < 0) data.timesheets.push(row); else data.timesheets[index] = row;
  } else if (action === 'comment') {
    assert(text(value.content), 'Nhập nội dung thảo luận.');
    data.comments.push({ id: randomUUID(), taskId, content: text(value.content), actor: user.email, at: new Date().toISOString() });
  } else if (action === 'document') {
    assert(manager || user.role === 'leader', 'Chỉ quản lý/Leader cập nhật hồ sơ pháp lý.');
    assert(text(value.title), 'Nhập tên hồ sơ pháp lý.');
    assert(['Chuẩn bị', 'Đã nộp', 'Bổ sung', 'Có kết quả'].includes(value.status), 'Trạng thái hồ sơ không hợp lệ.');
    assert(!value.taskId || items.some(item => item.id === value.taskId), 'Task hồ sơ không thuộc dự án.');
    assert(timestampValid(value.dueAt), 'Hạn hồ sơ không hợp lệ.');
    const old = data.documents.find(entry => entry.id === id);
    assert(!id || old, 'Hồ sơ không tồn tại.');
    assert(!value.expectedAt || dateValid(value.expectedAt), 'Ngày dự kiến có kết quả không hợp lệ.');
    assert(!value.order || Number.isInteger(Number(value.order)) && Number(value.order) > 0, 'Thứ tự thủ tục phải là số nguyên dương.');
    assert(value.fee == null || value.fee === '' || financial && Number.isFinite(Number(value.fee)) && Number(value.fee) >= 0, 'Phí hồ sơ không hợp lệ hoặc không có quyền tài chính.');
    const document = { ...old, id: id || randomUUID(), title: text(value.title), taskId: value.taskId || '', authority: text(value.authority), status: value.status, dueAt: value.dueAt || '', reference: text(value.reference), evidenceId: value.evidenceId || '', procedureKey: text(value.procedureKey), order: Number(value.order || old?.order || data.documents.length + 1), expectedAt: value.expectedAt || '', processingTime: text(value.processingTime), fee: financial && Object.hasOwn(value, 'fee') ? money(value.fee) : old?.fee ?? null, updatedAt: new Date().toISOString() };
    assert(!document.evidenceId || data.evidence.some(file => file.id === document.evidenceId), 'Bằng chứng hồ sơ không tồn tại.');
    const index = data.documents.findIndex(entry => entry.id === id); if (index < 0) data.documents.push(document); else data.documents[index] = document;
  } else if (action === 'documentEvent' || action === 'documentComponent') {
    assert(manager || user.role === 'leader', 'Chỉ quản lý/Leader cập nhật hồ sơ pháp lý.');
    const document = data.documents.find(entry => entry.id === value.documentId);
    assert(document && text(value.title), 'Chọn hồ sơ và nhập nội dung.');
    assert(!value.employeeId || db.employees.some(entry => entry.id === value.employeeId), 'Nhân sự không tồn tại.');
    assert(!value.evidenceId || data.evidence.some(entry => entry.id === value.evidenceId), 'Bằng chứng không thuộc dự án.');
    const key = action === 'documentEvent' ? 'events' : 'components';
    document[key] ||= [];
    assert(!id || document[key].some(entry => entry.id === id), 'Nội dung hồ sơ không tồn tại.');
    const entry = { id: id || randomUUID(), title: text(value.title), employeeId: value.employeeId || '', evidenceId: value.evidenceId || '', actor: user.email };
    if (key === 'events') { assert(value.at && timestampValid(value.at), 'Ngày giờ nhật ký không hợp lệ.'); Object.assign(entry, { at: value.at, reference: text(value.reference), type: ['work', 'submission', 'meeting', 'request', 'result'].includes(value.type) ? value.type : 'work' }); }
    else { assert(['Chưa làm', 'Đang làm', 'Xong', 'Chờ CĐT ký'].includes(value.status), 'Trạng thái thành phần không hợp lệ.'); entry.status = value.status; }
    const index = document[key].findIndex(row => row.id === id);
    if (index < 0) document[key].push(entry); else document[key][index] = entry;
    document.updatedAt = new Date().toISOString();
  } else if (action === 'customerRequest') {
    assert(manager || user.role === 'leader', 'Chỉ quản lý/Leader được cập nhật đề nghị cung cấp thông tin.');
    assert(text(value.title), 'Nhập nội dung đề nghị CĐT cung cấp thông tin.');
    assert(!value.taskId || items.some(candidate => candidate.id === value.taskId), 'Task ảnh hưởng không thuộc dự án.');
    for (const key of ['sentAt', 'dueAt', 'receivedAt']) assert(!value[key] || dateValid(value[key]), 'Ngày của phiếu RFI không hợp lệ.');
    assert(['Đang chờ CĐT', 'Đã nhận', 'Đến hạn', 'Quá hạn', 'Đã đóng'].includes(value.status || 'Đang chờ CĐT'), 'Trạng thái RFI không hợp lệ.');
    const old = data.customerRequests.find(entry => entry.id === id);
    assert(!id || old, 'Phiếu RFI không tồn tại.');
    const request = { ...old, id: id || randomUUID(), code: old?.code || `RFI-${String(data.customerRequests.length + 1).padStart(2, '0')}`, title: text(value.title), taskId: value.taskId || '', sentAt: value.sentAt || '', dueAt: value.dueAt || '', receivedAt: value.receivedAt || '', status: value.status || 'Đang chờ CĐT', notes: text(value.notes), createdBy: old?.createdBy || user.email, updatedAt: new Date().toISOString() };
    const index = data.customerRequests.findIndex(entry => entry.id === id); if (index < 0) data.customerRequests.push(request); else data.customerRequests[index] = request;
  } else if (action === 'meetingMinute') {
    assert(manager || user.role === 'leader', 'Chỉ quản lý/Leader được cập nhật biên bản họp.');
    assert(text(value.title), 'Nhập tiêu đề biên bản họp.');
    assert(value.at && timestampValid(value.at), 'Ngày giờ họp không hợp lệ.');
    assert(!value.confirmedAt || dateValid(value.confirmedAt), 'Ngày khách xác nhận không hợp lệ.');
    const requests = Array.isArray(value.requests) ? value.requests.map(text).filter(Boolean) : text(value.requestsText).split(/\r?\n/).map(text).filter(Boolean);
    assert(requests.length, 'Nhập ít nhất một yêu cầu của khách hàng.');
    const old = data.meetingMinutes.find(entry => entry.id === id);
    assert(!id || old, 'Biên bản họp không tồn tại.');
    const minute = { ...old, id: id || randomUUID(), code: old?.code || `BB-${String(data.meetingMinutes.length + 1).padStart(3, '0')}`, title: text(value.title), at: value.at, participants: text(value.participants), clientContact: text(value.clientContact), requests, scope: text(value.scope) || 'Trong hợp đồng', resolution: text(value.resolution), confirmedAt: value.confirmedAt || '', createdBy: old?.createdBy || user.email, updatedAt: new Date().toISOString() };
    const index = data.meetingMinutes.findIndex(entry => entry.id === id); if (index < 0) data.meetingMinutes.push(minute); else data.meetingMinutes[index] = minute;
  } else if (action === 'change') {
    assert(text(value.title), 'Nhập nội dung yêu cầu thay đổi.');
    const old = data.changes.find(entry => entry.id === id);
    assert(!old || manager || old.createdBy === user.email && old.status === 'Đề xuất', 'Chỉ được sửa yêu cầu do mình đề xuất và chưa được duyệt.');
    const status = manager ? value.status || 'Đề xuất' : 'Đề xuất';
    assert(['Đề xuất', 'Đã duyệt', 'Từ chối', 'Đang làm', 'Hoàn tất'].includes(status), 'Trạng thái CR không hợp lệ.');
    assert(!value.taskId || items.some(item => item.id === value.taskId), 'Task CR không thuộc dự án.');
    const amount = money(value.amount); if (financial) assert(amount == null || Number.isFinite(amount) && amount >= 0, 'Giá trị CR không hợp lệ.');
    assert(value.estimatedHours == null || value.estimatedHours === '' || Number.isFinite(Number(value.estimatedHours)) && Number(value.estimatedHours) >= 0, 'Giờ dự kiến phải không âm.');
    let decision = old?.decision || (old?.status && old.status !== 'Đề xuất' ? old.free ? 'free' : 'paid' : 'pending');
    if (value.decision && value.decision !== decision) { assert(['director', 'admin'].includes(user.role), 'Chỉ Giám đốc được quyết định thu phí / miễn phí.'); assert(['pending', 'paid', 'free'].includes(value.decision), 'Quyết định không hợp lệ.'); decision = value.decision; }
    if (status !== 'Đề xuất') assert(decision !== 'pending', 'Giám đốc phải quyết định thu phí hoặc miễn phí trước khi duyệt CR.');
    const change = { ...old, id: id || randomUUID(), code: old?.code || `CR-${String(data.changes.length + 1).padStart(2, '0')}`, title: text(value.title), taskId: value.taskId || '', free: decision === 'free', amount: decision === 'free' ? 0 : financial ? amount : old?.amount ?? null, status, decision, scope: text(value.scope) || old?.scope || 'Ngoài phạm vi', department: text(value.department ?? old?.department), estimatedHours: Number(value.estimatedHours ?? old?.estimatedHours ?? 0), appendix: text(value.appendix ?? old?.appendix), notes: text(value.notes), createdBy: old?.createdBy || user.email, updatedAt: new Date().toISOString() };
    if (status !== 'Đề xuất') assert(manager, 'Chỉ quản lý được duyệt yêu cầu thay đổi.');
    const index = data.changes.findIndex(entry => entry.id === id); if (index < 0) data.changes.push(change); else data.changes[index] = change;
    if (old?.reworkTaskId && (old.reworkTaskId !== value.reworkTaskId || status === 'Từ chối')) { const previous = data.records[old.reworkTaskId]; if (previous?.changeId === old.id) { previous.freeRework = false; previous.isChangeWork = false; previous.changeId = ''; } change.reworkTaskId = ''; }
    if (value.reworkTaskId && status !== 'Từ chối') {
      assert(status !== 'Đề xuất', 'Duyệt yêu cầu thay đổi trước khi gắn task làm lại.');
      assert(manager && items.some(item => item.id === value.reworkTaskId), 'Chọn task làm lại thuộc dự án.');
      const target = items.find(item => item.id === value.reworkTaskId);
      assert(target.id !== value.taskId, 'Task làm lại phải tách riêng, không biến việc gốc thành việc miễn phí.');
    assert(!data.records[target.id]?.changeId || data.records[target.id].changeId === change.id, 'Task làm lại đã gắn với yêu cầu thay đổi khác.');
    data.records[target.id] = { ...defaultDeliveryRecord(target), ...data.records[target.id], freeRework: change.free, isChangeWork: true, changeId: change.id };
      change.reworkTaskId = target.id;
    }
  } else if (['receipt', 'expense', 'milestone'].includes(action)) {
    assert(financial, 'Bạn không có quyền tài chính.');
    assert(text(value.title), 'Nhập nội dung.');
    assert(Number.isFinite(Number(value.amount)) && Number(value.amount) >= 0, 'Số tiền không hợp lệ.');
    const collection = { receipt: 'receipts', expense: 'expenses', milestone: 'milestones' }[action];
    const entry = { id: id || randomUUID(), title: text(value.title), amount: Number(value.amount), date: value.date || '', status: value.status || 'approved' };
    if (action !== 'milestone') assert(dateValid(value.date), 'Ngày thu/chi không hợp lệ.');
    if (action === 'expense') assert(['pending', 'approved', 'rejected'].includes(entry.status), 'Trạng thái chi phí không hợp lệ.');
    if (action === 'milestone') {
      assert(managingRole(user.role) || user.role === 'accountant', 'Không có quyền cấu hình thanh toán.');
      assert(Number(value.completionRequired) >= 0 && Number(value.completionRequired) <= 100, 'Mức hoàn thành phải từ 0 đến 100%.');
      assert(Array.isArray(value.taskIds || []) && (value.taskIds || []).every(id => items.some(item => item.id === id)), 'Task mốc thanh toán không hợp lệ.');
      Object.assign(entry, { completionRequired: Number(value.completionRequired), taskIds: value.taskIds || [], requestedAt: value.requestedAt || '', metOn: data.milestones.find(item => item.id === id)?.metOn || '' });
      assert(!entry.requestedAt || dateValid(entry.requestedAt), 'Ngày đề nghị thanh toán không hợp lệ.');
    }
    const index = data[collection].findIndex(item => item.id === id); if (index < 0) data[collection].push(entry); else data[collection][index] = entry;
  } else if (action === 'closeMonth') {
    assert(['director', 'admin'].includes(user.role), 'Chỉ Giám đốc được duyệt khóa tháng.');
    assert(financial && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month || ''), 'Không có quyền hoặc tháng không hợp lệ.');
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    assert(value.month <= today.slice(0, 7), 'Không thể chốt tháng tương lai.');
    const snapshots = (data.history || []).filter(entry => new Date(Date.parse(entry.at) + 7 * 3600000).toISOString().slice(0, 7) <= value.month);
    const previous = snapshots.filter(entry => new Date(Date.parse(entry.at) + 7 * 3600000).toISOString().slice(0, 7) < value.month).at(-1)?.output || 0;
    const current = snapshots.at(-1);
    assert(current?.output != null, 'Cần nhập phí hợp đồng và có dữ liệu ghi nhận sản lượng trước khi chốt.');
    assert(!data.closes.some(entry => entry.month === value.month && entry.status === 'closed'), 'Tháng đã chốt. Cần mở lại với lý do trước khi chốt lại.');
    const close = { id: randomUUID(), month: value.month, output: current.output - previous, cumulative: current.output, completion: current.completion, fee: current.fee ?? data.settings.contractFee, efficiency: current.efficiency ?? null, taskMetrics: structuredClone(current.taskMetrics || {}), status: 'closed', closedBy: user.email, closedAt: new Date().toISOString(), notes: text(value.notes) };
    data.closes.push(close);
  } else if (action === 'reopenMonth') {
    assert(['director', 'admin'].includes(user.role) && text(value.reason), 'Chỉ Giám đốc được mở lại tháng, cần ghi lý do.');
    const close = data.closes.find(entry => entry.id === id); assert(close, 'Không tìm thấy kỳ chốt.'); close.status = 'reopened'; close.reopenReason = text(value.reason); close.reopenedBy = user.email;
  } else throw new Error('Thao tác không hợp lệ.');
  data.audit.push({ id: randomUUID(), actor: user.email, action: `${action}${taskId ? `:${taskId}` : ''}`, at: new Date().toISOString(), before:auditBefore, after:structuredClone(data.records) });
  let metrics = computeDelivery(db, projectId, data);
  let completionChanged = false;
  for (const [taskId, record] of Object.entries(data.records)) {
    if (!metrics.taskMetrics[taskId]) continue;
    const fields = { deliveryStatusLevel: record.level, deliveryKind: record.kind || 'design', deliveryRecognized: metrics.taskMetrics[taskId].recognized };
    const gantt = db.ganttItems.find(row => row.id === taskId);
    if (gantt) Object.assign(gantt, fields);
    (db.tasks || []).filter(row => row.ganttId === taskId).forEach(row => Object.assign(row, fields));
    if (syncTaskCompletionFromDelivery(db, taskId, fields.deliveryRecognized, user.name || user.email)) completionChanged = true;
  }
  // Hoàn thành/mở lại đổi Công TT nên tính lại số liệu trước khi lưu lịch sử.
  if (completionChanged) metrics = computeDelivery(db, projectId, data);
  data.history.push({ at: new Date().toISOString(), output: metrics.summary.output, completion: metrics.summary.completion, earned: metrics.summary.totalEarned, taskMetrics:metrics.taskMetrics, fee: data.settings.contractFee, efficiency: metrics.summary.efficiency });
  for (const milestone of metrics.milestones) { const saved = data.milestones.find(entry => entry.id === milestone.id); if (milestone.met && !saved.metOn) saved.metOn = milestone.metOn; else if (!milestone.met) saved.metOn = ''; }
  data.revision++;
}
export function updateDeliveryProject(req, res) {
  try {
    const ctx = context(req);
    if (req.body.revision !== ctx.data.revision) return res.status(409).json({ message: 'Dữ liệu vừa được cập nhật ở phiên khác. Đã tải bản mới; hãy kiểm tra rồi lưu lại.' });
    applyDeliveryMutation(ctx, req.body);
    if (!writeDb(ctx.db)) return res.status(500).json({ message: 'Không lưu được dữ liệu Tiến độ.' });
    return res.json({ success: true, data: response(ctx) });
  } catch (error) { return res.status(400).json({ message: error.message }); }
}
export function uploadDeliveryEvidence(req, res) {
  let savedPath;
  try {
    const ctx = context(req); const { taskId, name, base64, kind } = req.body || {};
    const item = projectDeliveryItems(ctx.db, ctx.projectId).find(item => item.id === taskId);
    assert(item && canEditDeliveryTask(ctx.user, item, ctx.db), 'Không có quyền tải bằng chứng cho task này.');
    assert(['handover', 'receipt', 'feedback', 'approval', 'other'].includes(kind), 'Loại bằng chứng không hợp lệ.');
    assert(text(name) && typeof base64 === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(base64), 'Tệp không hợp lệ.');
    const buffer = Buffer.from(base64, 'base64'); assert(buffer.length > 0 && buffer.length <= 10 * 1024 * 1024, 'Tệp cần lớn hơn 0 và không quá 10 MB.');
    const id = randomUUID(); fs.mkdirSync(fileRoot(), { recursive: true }); savedPath = path.join(fileRoot(), id); fs.writeFileSync(savedPath, buffer);
    ctx.data.evidence.push({ id, taskId, name: path.basename(name), kind, size: buffer.length, uploadedBy: ctx.user.email, uploadedAt: new Date().toISOString() }); ctx.data.revision++;
    if (!writeDb(ctx.db)) throw new Error('Không lưu được bằng chứng.');
    return res.status(201).json({ success: true, data: response(ctx), evidenceId: id });
  } catch (error) { if (savedPath) fs.rmSync(savedPath, { force: true }); return res.status(400).json({ message: error.message }); }
}
export function downloadDeliveryEvidence(req, res) {
  try {
    const ctx = context(req); const file = ctx.data.evidence.find(entry => entry.id === req.params.fileId);
    assert(file && !file.deletedAt && /^[0-9a-f-]{36}$/.test(file.id), 'Không tìm thấy bằng chứng.');
    const target = path.join(fileRoot(), file.id); assert(fs.existsSync(target), 'Tệp không còn trên máy chủ.');
    res.setHeader('X-Content-Type-Options', 'nosniff'); return res.download(target, file.name);
  } catch (error) { return res.status(404).json({ message: error.message }); }
}

export function deliveryTemplates(req, res) {
  const db = structuredClone(readDb()); const store = deliveryStore(db);
  if (req.method === 'GET') return res.json({ success: true, data: store.templates.map(({ items, ...template }) => ({ ...template, count: items.length })) });
  try {
    assert(managingRole(req.deliveryUser.role), 'Chỉ quản lý được lưu mẫu dự án.');
    const { projectId, name } = req.body;
    const project = db.projects.find(item => item.id === projectId); assert(project && text(name), 'Chọn dự án và tên mẫu.');
    const source = db.ganttItems.filter(item => item.projectId === projectId && item.status !== 'holiday');
    assert(source.length > 0, 'Dự án chưa có công việc để lưu mẫu.');
    const items = source.map(item => ({ id: item.id, code: item.code, title: item.title, isGroup: Boolean(item.isGroup), parentGroupId: item.parentGroupId || '', parentTaskId: item.parentTaskId || '', dependencies: item.dependencies || [], startOffset: dateDifference(item.startDate || project.startDate, project.startDate), endOffset: dateDifference(item.endDate || project.endDate, project.startDate), days: item.days, estimatedHoursPerDay: item.estimatedHoursPerDay || 8, estimatedHours: item.estimatedHours || 0, color: item.color, unit: item.unit || 'TK', requiredPosition:item.requiredPosition || item.position || '', scopeKey:item.scopeKey || '', scaleWithArea:item.scaleWithArea !== false }));
    store.templates.push({ id: randomUUID(), name: text(name), createdBy: req.deliveryUser.email, createdAt: new Date().toISOString(), items });
    assert(writeDb(db), 'Không lưu được mẫu.');
    return res.status(201).json({ success: true, data: store.templates.map(({ items, ...template }) => ({ ...template, count: items.length })) });
  } catch (error) { return res.status(400).json({ message: error.message }); }
}
