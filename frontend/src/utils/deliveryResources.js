// Shared by reporting APIs and the UI; financial years run October–September.
export const vietnamMonth = (date = new Date()) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 7);
export const fiscalStart = month => Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 10 ? 1 : 0);
export const fiscalMonths = year => Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(Number(year), 9 + index, 1));
  return date.toISOString().slice(0, 7);
});
export const DEFAULT_PROCEDURES = [
  { procedureKey: 'planning', title: 'Chấp thuận tổng mặt bằng (QH 1/500 KCN đã có)', authority: 'Ban quản lý các KCN', taskCodes: ['A2.5'], expected: false },
  { procedureKey: 'environment', title: 'ĐTM → Giấy phép môi trường', authority: 'Cơ quan môi trường theo danh mục dự án', taskCodes: ['B1.1', 'B1.2'] },
  { procedureKey: 'fire', title: 'Thẩm duyệt thiết kế PCCC', authority: 'Cơ quan PCCC theo danh mục dự án', taskCodes: ['B2.1'] },
  { procedureKey: 'design', title: 'Thẩm định BCNCKT / thiết kế cơ sở', authority: 'Cơ quan xây dựng theo danh mục dự án', taskCodes: ['B2.2'] },
  { procedureKey: 'permit', title: 'Giấy phép xây dựng', authority: 'Cơ quan cấp phép theo danh mục dự án', taskCodes: ['B2.3', 'B6.1', 'B6.2'] },
];
export function monthSnapshot(data, month, metrics, now = new Date()) {
  const closes = (data.closes || []).filter(row => row.status === 'closed');
  const reopened = (data.closes || []).some(row => row.month === month && row.status === 'reopened');
  const locked = closes.filter(row => row.month === month).at(-1);
  if (locked) return { ...locked, fee: locked.fee ?? data.settings?.contractFee, startCompletion: locked.startCompletion ?? (locked.fee || data.settings?.contractFee ? (locked.cumulative - locked.output) / (locked.fee || data.settings.contractFee) * 100 : 0) };
  const history = (data.history || []).filter(row => row.output != null && Number.isFinite(Date.parse(row.at))).toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const before = history.filter(row => vietnamMonth(new Date(row.at)) < month).at(-1);
  const prior = closes.filter(row => row.month < month).toSorted((a, b) => a.month.localeCompare(b.month)).at(-1);
  const end = month === vietnamMonth(now) || reopened ? metrics?.summary : data.draftSnapshots?.[month] ? {...data.draftSnapshots[month],output:data.draftSnapshots[month].cumulative} : history.filter(row => vietnamMonth(new Date(row.at)) <= month).at(-1);
  const cumulative = end?.output ?? null;
  const previous = prior?.cumulative ?? before?.output ?? 0;
  const reviewed = (data.closes || []).filter(row => row.month === month && row.status === 'reviewed').at(-1);
  return { month, fee: end?.fee ?? data.settings?.contractFee ?? null, startCompletion: prior?.completion ?? before?.completion ?? 0, completion: end?.completion ?? 0, output: cumulative == null ? null : cumulative - previous, cumulative, efficiency: month === vietnamMonth(now) ? metrics?.summary.efficiency ?? null : end?.efficiency ?? null, status: reviewed ? 'reviewed' : 'draft', reviewedBy: reviewed?.reviewedBy, reviewedAt: reviewed?.reviewedAt };
}
