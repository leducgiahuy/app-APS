import { projectDeliveryItems } from './deliveryMetrics.js';
import { departmentCodeOf, taskDepartments } from './departmentCodes.js';

/**
 * Báo cáo chất lượng cấp công ty (Công ty → Báo cáo), tính từ dữ liệu thật của các dự án người xem được thấy.
 *
 * Hồ sơ thiết kế = task loại "Thiết kế" (bỏ việc CĐT phê duyệt, việc phát sinh CR, việc chưa từng gửi):
 * - lần phát hành: task đã tới mức 60% "Đã gửi" (ngày gửi = "Thực tế đã nộp" hoặc lần đầu lên ≥ 60%);
 * - đạt lần đầu: được phê duyệt (100% + xác nhận) mà chưa từng phải sửa theo góp ý (mức 80%) hay làm lại;
 * - lịch sử mức lấy từ nhật ký dự án (mỗi lần lưu trạng thái lưu ảnh chụp các task), không đủ thì dùng trạng thái hiện tại.
 * Hồ sơ pháp lý = hồ sơ ở tab Hồ sơ của dự án: nộp = sự kiện "Nộp hồ sơ" đầu tiên, kết quả = "Nhận kết quả" đầu tiên,
 * mỗi "Yêu cầu bổ sung / góp ý" là một lần bị trả; "Nguyên nhân: do lỗi công ty" đếm vào cột lỗi công ty.
 */
const DAY = 86400000;
const TARGET_FIRST_PASS = 85;
const TARGET_SUBMIT_TO_APPROVAL_DAYS = 15;
const WAITING_ALERT_DAYS = 15;
const EXPIRY_NOTICE_DAYS = 60;
const DEPARTMENT_LABELS = { KT: 'Kiến trúc', KC: 'Kết cấu', MEP: 'Điện nước', HT: 'Hạ tầng', PCCC: 'PCCC', PL: 'Pháp lý', 'CĐT': 'Chủ đầu tư' };

const time = value => { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? parsed : null; };
const round1 = value => Math.round(value * 10) / 10;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percent = (part, whole) => whole ? Math.round(part / whole * 100) : null;
const firstNumber = text => { const match = String(text || '').match(/\d+(?:[.,]\d+)?/); return match ? Number(match[0].replace(',', '.')) : null; };

/** Diễn biến mức trạng thái của từng task, dựng từ ảnh chụp trong nhật ký dự án (theo thời gian). */
function levelTimelines(data) {
  const timelines = {};
  for (const entry of [...(data.audit || [])].sort((a, b) => (time(a.at) || 0) - (time(b.at) || 0))) {
    for (const [taskId, record] of Object.entries(entry.after || {})) {
      const list = timelines[taskId] ||= [];
      const level = Number(record?.level) || 0;
      if (list.at(-1)?.level !== level || Boolean(list.at(-1)?.freeRework) !== Boolean(record?.freeRework)) list.push({ at: time(entry.at), level, freeRework: Boolean(record?.freeRework) });
    }
  }
  return timelines;
}

/** Một lần phát hành hồ sơ thiết kế của task (null nếu task chưa từng gửi). */
function designIssue(item, record = {}, timeline = []) {
  if (record.kind === 'legal' || record.approvalOnly || record.isChangeWork) return null;
  const firstSent = timeline.find(step => step.level >= 60)?.at ?? (Number(record.level) >= 60 ? time(record.levelChangedAt) || time(record.updatedAt) : null);
  const sentAt = time(record.sentAt) ?? firstSent;
  if (sentAt == null) return null;
  const revisionRounds = timeline.filter((step, index) => step.level === 80 && timeline[index - 1]?.level !== 80).length || (Number(record.level) === 80 ? 1 : 0);
  const revised = revisionRounds > 0 || Boolean(record.freeRework) || timeline.some(step => step.freeRework);
  const approvedAt = Number(record.level) === 100 && record.confirmedBy ? time(record.confirmedAt) : null;
  const codes = [departmentCodeOf(record.department), ...taskDepartments(item)].filter(Boolean);
  return { departments: [...new Set(codes)], sentAt, approvedAt, revised, revisionRounds, firstPass: approvedAt != null && !revised, decided: approvedAt != null || revised, waiting: approvedAt == null && Number(record.level) >= 60, note: revised ? String(record.notes || '').trim() : '' };
}

/** Một hồ sơ pháp lý đã nộp (null nếu chưa nộp). */
function legalIssue(document) {
  const events = [...(document.events || [])].sort((a, b) => (time(a.at) || 0) - (time(b.at) || 0));
  const submittedAt = time(events.find(event => event.type === 'submission')?.at) ?? (['Đã nộp', 'Bổ sung', 'Có kết quả'].includes(document.status) ? time(document.updatedAt) : null);
  if (submittedAt == null) return null;
  const resultAt = time(events.find(event => event.type === 'result')?.at) ?? (document.status === 'Có kết quả' ? time(document.updatedAt) : null);
  const requests = events.filter(event => event.type === 'request');
  return { submittedAt, resultAt, requests, companyFaults: requests.filter(event => event.cause === 'company').length, firstPass: resultAt != null && !requests.length, decided: resultAt != null || requests.length > 0, waiting: resultAt == null };
}

export function buildCompanyQualityReport(db, projectIds = (db.projects || []).map(project => project.id), now = new Date()) {
  const today = now.getTime();
  const designWindow = today - 183 * DAY;
  const permitWindow = today - 365 * DAY;
  const design = [], legal = [], archive = [];
  for (const projectId of projectIds) {
    const project = (db.projects || []).find(row => row.id === projectId);
    const data = db.delivery?.projects?.[projectId];
    if (!project || !data) continue;
    const items = projectDeliveryItems(db, projectId);
    const timelines = levelTimelines(data);
    for (const item of items) {
      const issue = designIssue(item, data.records?.[item.id], timelines[item.id]);
      if (issue) design.push({ ...issue, projectName: project.name, title: item.title });
    }
    for (const document of data.documents || []) {
      const issue = legalIssue(document);
      if (issue) legal.push({ ...issue, document, projectName: project.name });
    }
    // Kho văn bản chấp thuận: tệp loại "Văn bản / email chấp thuận" và hồ sơ pháp lý đã có kết quả.
    const seen = new Set();
    for (const document of (data.documents || []).filter(row => row.status === 'Có kết quả')) {
      const resultAt = time((document.events || []).find(event => event.type === 'result')?.at) ?? time(document.updatedAt);
      if (document.evidenceId) seen.add(document.evidenceId);
      archive.push({ title: document.title, projectName: project.name, at: resultAt, validUntil: document.validUntil || '', authority: document.authority || '' });
    }
    for (const file of (data.evidence || []).filter(row => row.kind === 'approval' && !row.deletedAt && !seen.has(row.id))) {
      const task = items.find(item => item.id === file.taskId);
      archive.push({ title: task ? `${task.code ? `${task.code} ` : ''}${task.title}` : file.name, projectName: project.name, at: time(file.uploadedAt), validUntil: '', authority: '' });
    }
  }

  const recentDesign = design.filter(row => row.sentAt >= designWindow);
  const recentLegal = legal.filter(row => row.submittedAt >= designWindow);
  const decided = [...recentDesign, ...recentLegal].filter(row => row.decided);
  const firstPass = decided.filter(row => row.firstPass).length;
  const feedbackCount = recentDesign.reduce((sum, row) => sum + row.revisionRounds + (row.revised && !row.revisionRounds ? 1 : 0), 0) + recentLegal.reduce((sum, row) => sum + row.requests.length, 0);
  const companyFaults = recentLegal.reduce((sum, row) => sum + row.companyFaults, 0);
  const legalFeedback = recentLegal.reduce((sum, row) => sum + row.requests.length, 0);
  const approvalDays = [...recentDesign.filter(row => row.approvedAt != null).map(row => (row.approvedAt - row.sentAt) / DAY), ...recentLegal.filter(row => row.resultAt != null).map(row => (row.resultAt - row.submittedAt) / DAY)].map(value => Math.max(0, value));
  const waiting = [...design.filter(row => row.waiting).map(row => row.sentAt), ...legal.filter(row => row.waiting).map(row => row.submittedAt)].filter(at => (today - at) / DAY > WAITING_ALERT_DAYS);

  const departments = new Map();
  const bucket = code => { const key = code || '—'; if (!departments.has(key)) departments.set(key, { code: key, issued: 0, decided: 0, firstPass: 0, notes: [] }); return departments.get(key); };
  // Task nhiều bộ môn (VD KT + HT) được tính cho từng bộ môn tham gia; các ô tổng phía trên vẫn tính mỗi task một lần.
  for (const row of recentDesign) for (const code of row.departments.length ? row.departments : ['']) { const entry = bucket(code); entry.issued += 1; if (row.decided) entry.decided += 1; if (row.firstPass) entry.firstPass += 1; if (row.note) entry.notes.push({ at: row.sentAt, text: row.note }); }
  for (const row of recentLegal) { const entry = bucket('PL'); entry.issued += 1; if (row.decided) entry.decided += 1; if (row.firstPass) entry.firstPass += 1; row.requests.forEach(request => entry.notes.push({ at: time(request.at), text: request.title })); }

  const permits = new Map();
  for (const row of legal.filter(entry => entry.submittedAt >= permitWindow)) {
    const authority = row.document.authority || 'Chưa ghi cơ quan';
    const procedure = row.document.procedureKey || row.document.title;
    const key = `${authority}|${procedure}`;
    if (!permits.has(key)) permits.set(key, { authority, procedure: row.document.title, count: 0, days: [], limits: [], returns: 0, companyFaults: 0 });
    const entry = permits.get(key);
    entry.count += 1; entry.returns += row.requests.length; entry.companyFaults += row.companyFaults;
    if (row.resultAt != null) entry.days.push((row.resultAt - row.submittedAt) / DAY);
    const limit = firstNumber(row.document.processingTime); if (limit != null) entry.limits.push(limit);
  }

  return {
    generatedAt: now.toISOString(),
    kpis: {
      firstPassRate: percent(firstPass, decided.length), firstPass, decided: decided.length, issued: recentDesign.length + recentLegal.length, firstPassTarget: TARGET_FIRST_PASS,
      feedbackPerIssue: recentDesign.length + recentLegal.length ? round1(feedbackCount / (recentDesign.length + recentLegal.length)) : null, feedbackCount,
      companyFaultShare: percent(companyFaults, legalFeedback), companyFaults, legalFeedback,
      submitToApprovalDays: approvalDays.length ? Math.round(average(approvalDays)) : null, approvalSamples: approvalDays.length, submitToApprovalTarget: TARGET_SUBMIT_TO_APPROVAL_DAYS,
      waitingOverLimit: waiting.length, waitingLimitDays: WAITING_ALERT_DAYS,
    },
    departments: [...departments.values()].sort((a, b) => b.issued - a.issued).map(entry => ({
      code: entry.code, label: entry.code === '—' ? 'Chưa ghi bộ môn' : `${entry.code} · ${DEPARTMENT_LABELS[entry.code] || entry.code}`,
      issued: entry.issued, decided: entry.decided, firstPass: entry.firstPass, rate: percent(entry.firstPass, entry.decided),
      commonIssue: entry.notes.sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.text || '',
    })),
    permits: [...permits.values()].sort((a, b) => b.count - a.count).map(entry => ({ authority: entry.authority, procedure: entry.procedure, count: entry.count, averageDays: entry.days.length ? Math.round(average(entry.days)) : null, limitDays: entry.limits.length ? Math.round(average(entry.limits)) : null, returns: entry.returns, companyFaults: entry.companyFaults })),
    archive: archive.sort((a, b) => (b.at || 0) - (a.at || 0)).map(row => {
      const until = time(row.validUntil);
      return { ...row, at: row.at ? new Date(row.at).toISOString() : '', expired: until != null && until < today, expiringSoon: until != null && until >= today && until - today <= EXPIRY_NOTICE_DAYS * DAY };
    }),
  };
}
