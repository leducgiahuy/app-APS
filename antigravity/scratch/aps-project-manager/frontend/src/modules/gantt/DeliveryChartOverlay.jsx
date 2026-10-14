import { formatCompactMoney } from '../../utils/deliveryMetrics';
export default function DeliveryChartOverlay({ data, financial, items, coordinates, rowOffsets, timelineStart, pxPerDay, width, height, now, groupPercent }) {
  const x = value => { const key = String(value).length > 10 && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10) : String(value).slice(0, 10); return (Date.parse(`${key}T00:00:00Z`) - Date.UTC(timelineStart.getFullYear(), timelineStart.getMonth(), timelineStart.getDate())) / 86400000 * pxPerDay; };
  const todayX = x(new Date(now.getTime() + 7 * 3600000).toISOString());
  const series = financial ? [...(data?.history || [])].sort((a, b) => a.at.localeCompare(b.at)) : [];
  const sumByDay = rows => [...new Set(rows.map(row => row.date))].filter(Boolean).sort().map(date => ({ date, amount: rows.filter(row => row.date <= date).reduce((sum, row) => sum + row.amount, 0) }));
  const receipts = sumByDay(data?.receipts || []);
  const expenses = [...(data?.expenses || []).filter(row => row.status === 'approved').map(row => ({ date: row.date, amount: row.amount }))];
  if (financial) (data?.timesheets || []).filter(row => row.status === 'approved').forEach(row => { const rate = data.settings?.rates?.[row.employeeId] ?? data.settings?.hourlyRate; if (rate != null) expenses.push({ date: row.date, amount: row.hours * rate }); });
  const cost = sumByDay(expenses);
  const maximum = Math.max(1, ...receipts.map(row => row.amount), ...cost.map(row => row.amount), ...series.map(row => row.output || 0));
  const points = (rows, key, dateField = 'date') => rows.filter(row => Number.isFinite(x(row[dateField])) && x(row[dateField]) >= 0 && row[key] != null).map(row => `${Math.min(width, x(row[dateField]))},${65 - row[key] / maximum * 48}`).join(' ');
  return <g className="delivery-chart-overlay">
    {financial && <g pointerEvents="none"><rect width={width} height="80" fill="var(--delivery-surface, #fff)" opacity=".94" />{[[receipts, 'amount', 'date', '#16835d', null], [cost, 'amount', 'date', '#c34d53', null], [series, 'output', 'at', '#861b36', '4 3']].map(([rows, key, dateField, color, dashed]) => <polyline key={color} points={points(rows, key, dateField)} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={dashed} />)}<text x={Math.max(4, Math.min(width - 150, todayX + 5))} y="15" fill="#16835d" fontSize="10">Đã thu {formatCompactMoney(data?.summary.collected)}</text><text x={Math.max(4, Math.min(width - 150, todayX + 5))} y="29" fill="#c34d53" fontSize="10">Chi phí {formatCompactMoney(data?.summary.cost)}</text><text x={Math.max(4, Math.min(width - 150, todayX + 5))} y="43" fill="#861b36" fontSize="10">Sản lượng {formatCompactMoney(data?.summary.output)}</text>{!series.length && <text x="10" y="68" fill="#888" fontSize="10">Chưa có lịch sử sản lượng. Dữ liệu bắt đầu từ lần ghi nhận đầu tiên.</text>}</g>}
    {items.map((item, index) => {
      if (item.deliveryBand) return null;
      const coord = coordinates[item.id];
      const record = data?.records?.[item.id];
      if (item.isGroup || item.isProjectHeader) {
        // Collapsed stages already have a full aggregate bar with descendant progress.
        if ((item.isGroup && coord?.isAggregate) || item.isProjectHeader) return null;
        const start = item.startDate ? Math.max(0, x(item.startDate)) : 0;
        const end = item.endDate ? Math.max(start + 10, x(item.endDate) + pxPerDay) : Math.min(width, start + 200);
        return <g key={item.id} pointerEvents="none"><rect x={start} y={rowOffsets[index] + 13} width={end - start} height="4" rx="2" fill="#e6e2dc" /><rect x={start} y={rowOffsets[index] + 13} width={(end - start) * (groupPercent(item) || 0) / 100} height="4" rx="2" fill="#948f87" /></g>;
      }
      if (!record?.dueAt || !coord) return null;
      const pos = x(record.dueAt); if (!Number.isFinite(pos) || pos < 0 || pos > width) return null;
      return <path key={item.id} d={`M${pos} ${coord.centerY - 5} l5 5 l-5 5 l-5 -5 Z`} fill="white" stroke={data.taskMetrics[item.id]?.alert.overdue ? '#c34d53' : '#829089'} strokeWidth="1.2"><title>Hạn nộp {new Date(record.dueAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</title></path>;
    })}
    {todayX >= 0 && todayX <= width && <g pointerEvents="none"><rect x={todayX} width={pxPerDay} height={height} fill="#eab308" opacity=".12" /><line x1={todayX + pxPerDay / 2} x2={todayX + pxPerDay / 2} y1="0" y2={height} stroke="#d69a20" strokeWidth="1" /></g>}
  </g>;
}
