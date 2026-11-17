import { summarizeProjectWork } from '../../utils/deliveryMetrics';

const work = value => Number(value || 0).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const brief = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const signed = value => `${value >= 0 ? '+' : ''}${work(value)}`;

/** Ai đang giữ CR chưa cộng vào Công dự toán (theo luồng duyệt CR trong deliveryController). */
function waitingFor(change) {
  if (change.decision === 'pending' || !change.decision) return 'chờ GĐ quyết định';
  if (change.status === 'Đề xuất') return 'chờ duyệt';
  return 'chờ ký phụ lục';
}

/**
 * Thanh tóm tắt công của dự án: Dự toán / Dự báo, Thực tế, Còn lại, Chênh,
 * kèm danh sách CR đang chờ (chưa cộng vào Công dự toán).
 */
export default function BudgetSourceBanner({ project, changes = [], items = [], taskMetrics = {} }) {
  if (!project) return null;
  const codeOf = id => items.find(item => item.id === id)?.code;
  const summary = summarizeProjectWork(project, taskMetrics);
  const total = summary.budgetedWork;
  const variance = Number(summary.varianceWork) || 0;
  const variancePercent = total > 0 ? variance / total * 100 : null;
  const pending = changes.filter(change => !change.signedAt && change.status !== 'Từ chối' && change.decision !== 'free');

  return (
    <div className="budget-source-banner" role="note">
      <span className="budget-source-summary">
        Dự toán / dự báo <strong>{brief(total)} / {brief(summary.forecastWork)} công</strong>
        <small>thực tế {brief(summary.actualWork)} · còn lại {brief(summary.remainingWork)} · chênh {variance > 0 ? '+' : ''}{brief(variance)}{variancePercent != null ? ` (${variancePercent > 0 ? '+' : ''}${variancePercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)` : ''}</small>
      </span>
      {pending.length > 0 && (
        <span className="budget-source-pending">
          Chờ duyệt, CHƯA cộng: {pending.map(change => {
            const target = codeOf(change.taskId);
            return `${change.code} ${signed(Number(change.estimatedHours || 0) / 8)}${target ? ` vào ${target}` : ''} (${change.title ? `${change.title}, ` : ''}${waitingFor(change)})`;
          }).join(' · ')}
        </span>
      )}
    </div>
  );
}
