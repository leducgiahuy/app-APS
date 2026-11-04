import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanyQualityReport } from '../../frontend/src/utils/companyQualityReport.js';

const now = new Date('2026-11-04T08:00:00+07:00');
const at = date => new Date(`${date}T09:00:00+07:00`).toISOString();
const snapshot = levels => Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, { level }]));

const db = {
  projects: [{ id: 'p1', name: 'Dự án 1' }, { id: 'p2', name: 'Dự án ẩn' }],
  ganttItems: [
    { id: 't1', projectId: 'p1', code: 'A1.1', title: 'Kiến trúc đạt ngay', requiredPosition: 'KT' },
    { id: 't2', projectId: 'p1', code: 'A1.2', title: 'Kết cấu phải sửa', requiredPosition: 'KC' },
    { id: 't3', projectId: 'p1', code: 'A1.3', title: 'Kiến trúc đang chờ', requiredPosition: 'KT' },
    { id: 't4', projectId: 'p1', code: 'A1.4', title: 'Chưa gửi', requiredPosition: 'KT' },
    { id: 't9', projectId: 'p2', code: 'X', title: 'Không được thấy', requiredPosition: 'KT' },
  ],
  tasks: [],
  delivery: { projects: {
    p1: {
      records: {
        t1: { kind: 'design', level: 100, sentAt: at('2026-10-01'), confirmedBy: 'ql', confirmedAt: at('2026-10-11') },
        t2: { kind: 'design', level: 100, sentAt: at('2026-10-01'), confirmedBy: 'ql', confirmedAt: at('2026-10-21'), notes: 'Sai tải trọng sàn' },
        t3: { kind: 'design', level: 60, sentAt: at('2026-10-10') },
        t4: { kind: 'design', level: 20 },
      },
      // Nhật ký: t2 đã đi qua mức 80% (sửa theo góp ý) trước khi được duyệt.
      audit: [
        { at: at('2026-10-01'), after: snapshot({ t1: 60, t2: 60 }) },
        { at: at('2026-10-05'), after: snapshot({ t1: 60, t2: 80 }) },
        { at: at('2026-10-11'), after: snapshot({ t1: 100, t2: 80 }) },
        { at: at('2026-10-21'), after: snapshot({ t1: 100, t2: 100 }) },
      ],
      documents: [{
        id: 'd1', title: 'Thẩm duyệt PCCC', authority: 'Cảnh sát PCCC', processingTime: '15 ngày làm việc', status: 'Có kết quả', validUntil: '2026-12-01', evidenceId: 'e-pccc',
        events: [
          { type: 'submission', at: at('2026-09-01') },
          { type: 'request', at: at('2026-09-10'), title: 'Thiếu bản vẽ thoát nạn', cause: 'company' },
          { type: 'request', at: at('2026-09-15'), title: 'Bổ sung giấy tờ CĐT', cause: 'external' },
          { type: 'result', at: at('2026-09-21') },
        ],
      }],
      evidence: [{ id: 'e-pccc', kind: 'approval', taskId: 't1', uploadedAt: at('2026-09-21') }, { id: 'e2', kind: 'approval', taskId: 't1', name: 'cdt-duyet.pdf', uploadedAt: at('2026-10-11') }, { id: 'e3', kind: 'handover', taskId: 't3' }],
    },
    p2: { records: { t9: { kind: 'design', level: 100, sentAt: at('2026-10-01'), confirmedBy: 'ql', confirmedAt: at('2026-10-02') } }, audit: [], documents: [], evidence: [] },
  } },
};

test('báo cáo chất lượng tính từ trạng thái task, nhật ký dự án và hồ sơ pháp lý', () => {
  const report = buildCompanyQualityReport(db, ['p1'], now);
  const k = report.kpis;
  // Đã có kết quả: t1 (đạt), t2 (phải sửa), hồ sơ PCCC (bị trả) → 1/3; t3 đang chờ không tính vào tỷ lệ.
  assert.equal(k.decided, 3);
  assert.equal(k.firstPass, 1);
  assert.equal(k.firstPassRate, 33);
  assert.equal(k.issued, 4);
  // Góp ý: 1 vòng sửa của t2 + 2 yêu cầu bổ sung PCCC = 3 / 4 hồ sơ; 1/2 góp ý pháp lý do lỗi công ty.
  assert.equal(k.feedbackPerIssue, 0.8);
  assert.equal(k.companyFaultShare, 50);
  // Nộp → duyệt: t1 10 ngày, t2 20 ngày, PCCC 20 ngày → 17 ngày.
  assert.equal(k.submitToApprovalDays, 17);
  // t3 gửi 10/10, tới 04/11 đã chờ 25 ngày > 15.
  assert.equal(k.waitingOverLimit, 1);

  const kt = report.departments.find(row => row.code === 'KT');
  assert.deepEqual({ issued: kt.issued, decided: kt.decided, firstPass: kt.firstPass, rate: kt.rate }, { issued: 2, decided: 1, firstPass: 1, rate: 100 });
  const kc = report.departments.find(row => row.code === 'KC');
  assert.equal(kc.rate, 0);
  assert.equal(kc.commonIssue, 'Sai tải trọng sàn');
  assert.equal(report.departments.find(row => row.code === 'PL').commonIssue, 'Bổ sung giấy tờ CĐT');

  assert.deepEqual(report.permits, [{ authority: 'Cảnh sát PCCC', procedure: 'Thẩm duyệt PCCC', count: 1, averageDays: 20, limitDays: 15, returns: 2, companyFaults: 1 }]);

  // Kho văn bản: hồ sơ PCCC (sắp hết hiệu lực trong 60 ngày) + tệp chấp thuận riêng của t1; tệp đã gắn với hồ sơ không lặp lại.
  assert.equal(report.archive.length, 2);
  const pccc = report.archive.find(row => row.title.startsWith('Thẩm duyệt PCCC'));
  assert.equal(pccc.expiringSoon, true);
  assert.ok(report.archive.some(row => row.title.startsWith('A1.1 Kiến trúc đạt ngay')));
  // Dự án người xem không có quyền không được tính.
  assert.ok(!JSON.stringify(report).includes('Không được thấy'));
});

test('chưa có dữ liệu thì báo cáo trống, không bịa số', () => {
  const report = buildCompanyQualityReport({ projects: [], ganttItems: [], tasks: [], delivery: { projects: {} } }, [], now);
  assert.equal(report.kpis.firstPassRate, null);
  assert.equal(report.kpis.submitToApprovalDays, null);
  assert.deepEqual([report.departments, report.permits, report.archive], [[], [], []]);
});
