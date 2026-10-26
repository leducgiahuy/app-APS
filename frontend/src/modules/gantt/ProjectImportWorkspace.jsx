import { useMemo, useState } from 'react';
import { deliveryApi } from './deliveryApi';
import { useOperations } from '../operations/OperationsCommon';

const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const validFile = (file, types) => file && types.some(extension => file.name.toLocaleLowerCase('vi').endsWith(extension));
const downloadText = (name, content, type = 'text/csv;charset=utf-8') => { const url = URL.createObjectURL(new Blob(['\ufeff', content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

export default function ProjectImportWorkspace({ onCreated }) {
  const api = useOperations({});
  const [draft, setDraft] = useState({ name: '', code: '', client: '', location: '', startDate: vnToday(), endDate: vnToday(), area: '', floors: '', contractFee: '', managerEmail: '', leaderEmails: [], templateId: '', scope: [] });
  const [quoteFile, setQuoteFile] = useState(null);
  const [contractFile, setContractFile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const template = api.data?.templates?.find(row => row.id === draft.templateId);
  const set = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setPlan(null); };
  const fileError = useMemo(() => quoteFile && !validFile(quoteFile, ['.xlsx', '.xls', '.csv']) ? 'File báo giá phải là Excel hoặc CSV.' : contractFile && !validFile(contractFile, ['.xlsx', '.xls', '.pdf']) ? 'File hợp đồng phải là Excel hoặc PDF.' : '', [contractFile, quoteFile]);
  const preview = async () => {
    if (fileError) { setError(fileError); return; }
    if (!quoteFile) { setError('Chọn file báo giá đã chốt trước khi đọc dữ liệu.'); return; }
    if (!draft.name || !draft.startDate || !draft.endDate || !draft.templateId) { setError('Nhập tên, thời gian và chọn dạng dự án/template trước khi sinh dữ liệu.'); return; }
    setPending(true); setError('');
    try { const response = await deliveryApi.previewProject(draft); setPlan(response.data); }
    catch (exception) { setError(exception.message); }
    finally { setPending(false); }
  };
  const saveDraft = () => {
    localStorage.setItem('aps_project_import_draft_v1', JSON.stringify({ ...draft, quoteFileName: quoteFile?.name || '', contractFileName: contractFile?.name || '', savedAt: new Date().toISOString() }));
    setError('Đã lưu bản nháp thông tin. File cần được chọn lại khi mở trình duyệt lần sau.');
  };
  const create = async () => {
    if (!plan) return;
    setPending(true); setError('');
    try {
      const result = await api.mutate('projectCreate', { ...draft, quoteFileName: quoteFile?.name || '', contractFileName: contractFile?.name || '', budgetLines: plan.lines, milestones: plan.milestones.map(milestone => ({ ...milestone, conditions: (milestone.conditions || []).map(condition => ({ ...condition, taskId: plan.items.find(item => item.id === condition.taskId)?.templateItemId || condition.taskId })) })) });
      localStorage.removeItem('aps_project_import_draft_v1');
      await onCreated(result.createdProjectId);
    } catch (exception) { setError(exception.message); }
    finally { setPending(false); }
  };
  const allocationByTask = new Map((plan?.allocations || []).map(row => [row.taskId, row]));
  const totalDays = plan ? plan.totalHours / 8 : 0;

  return <div className="project-import-workspace">
    {(error || api.error) && <p className={error.startsWith('Đã lưu') ? 'project-import-notice' : 'delivery-error'} role="alert">{error || api.error}</p>}
    <section className="project-import-panel"><header><span className="step-number">1</span><div><b>Tải file</b><small>2 file theo mẫu · máy kiểm tra định dạng trước khi đọc</small></div></header><div className="project-upload-grid">
      <label className={`project-upload-box ${quoteFile && !fileError ? 'valid' : ''}`}><span>File báo giá đã chốt (Excel/CSV)</span><input type="file" accept=".xlsx,.xls,.csv" onChange={event => { setQuoteFile(event.target.files?.[0] || null); setPlan(null); setError(''); }} /><b>{quoteFile?.name || 'Chọn file báo giá'}</b>{quoteFile && !fileError && <small>✓ Đúng định dạng · dữ liệu sẽ ghép theo template</small>}</label>
      <label className={`project-upload-box ${contractFile && !fileError ? 'valid' : ''}`}><span>File hợp đồng đã ký (Excel/PDF)</span><input type="file" accept=".xlsx,.xls,.pdf" onChange={event => { setContractFile(event.target.files?.[0] || null); setError(''); }} /><b>{contractFile?.name || 'Chọn file hợp đồng (không bắt buộc)'}</b><small>{contractFile ? '✓ Đã nhận file hợp đồng' : 'Có thể bổ sung sau nếu chưa ký hợp đồng'}</small></label>
    </div><div className="project-import-actions left"><button onClick={() => downloadText('Mau_bao_gia_APS.csv', 'MA_HANG_MUC,HANG_MUC,BO_MON,CONG_BAO_GIA\nA1,Khao sat nhiem vu thiet ke,KT,8')}>Tải Mẫu báo giá</button><button onClick={() => downloadText('Huong_dan_Claude_APS.txt', 'Xuất báo giá đã chốt theo các cột: MÃ HẠNG MỤC, HẠNG MỤC, BỘ MÔN, CÔNG BÁO GIÁ. Mã trùng template sẽ ghép việc; mã MOI sẽ tạo việc mới.', 'text/plain;charset=utf-8')}>Hướng dẫn cho Claude</button></div></section>

    <section className="project-import-panel"><header><span className="step-number">2</span><div><b>Thông tin chung</b><small>Thông tin dùng để tạo dự án, lịch và người phụ trách</small></div></header><div className="project-info-grid">
      <label>Tên dự án<input required value={draft.name} onChange={event => set('name', event.target.value)} /></label><label>Mã dự án<input value={draft.code} onChange={event => set('code', event.target.value)} /></label><label>Chủ đầu tư<input value={draft.client} onChange={event => set('client', event.target.value)} /></label>
      <label>Dạng dự án → template<select required value={draft.templateId} onChange={event => { setDraft(current => ({ ...current, templateId: event.target.value, scope: [] })); setPlan(null); }}><option value="">Chọn template</option>{api.data?.templates?.map(row => <option key={row.id} value={row.id}>{row.name} · {row.count} việc</option>)}</select></label><label>Diện tích sàn (m²)<input type="number" min="0" value={draft.area} onChange={event => set('area', event.target.value)} /></label><label>Số tầng<input type="number" min="0" value={draft.floors} onChange={event => set('floors', event.target.value)} /></label>
      <label>Bắt đầu<input type="date" required value={draft.startDate} onChange={event => set('startDate', event.target.value)} /></label><label>Kết thúc<input type="date" required min={draft.startDate} value={draft.endDate} onChange={event => set('endDate', event.target.value)} /></label><label>Giá trị HĐ trước VAT<input type="number" min="0" value={draft.contractFee} onChange={event => set('contractFee', event.target.value)} /></label>
      <label>Địa điểm<input value={draft.location} onChange={event => set('location', event.target.value)} /></label><label>QL · Leader<select value={draft.managerEmail} onChange={event => set('managerEmail', event.target.value)}><option value="">Người lập</option>{api.data?.accounts?.filter(account => ['manager', 'director', 'admin'].includes(account.role)).map(account => <option key={account.email} value={account.email}>{account.name || account.email}</option>)}</select></label>{template?.scopeOptions?.length > 0 && <div className="project-scope"><span>Phạm vi</span>{template.scopeOptions.map(option => <label key={option.key}><input type="checkbox" checked={draft.scope.includes(option.key)} onChange={event => set('scope', event.target.checked ? [...draft.scope, option.key] : draft.scope.filter(key => key !== option.key))} />{option.label}</label>)}</div>}
    </div><div className="project-import-actions"><button className="primary" disabled={pending || api.disabled} onClick={preview}>{pending ? 'Đang đọc…' : 'Đọc file & sinh dữ liệu'}</button></div></section>

    <section className="project-import-panel"><header><span className="step-number">3</span><div><b>Hạng mục báo giá → việc trên tiến độ và số công</b><small>{plan ? `${plan.allocations.length} hạng mục · ${totalDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} công · mã hạng mục ghép với mã việc template` : 'Đọc file và sinh dữ liệu để xem kết quả ghép việc'}</small></div></header><div className="project-import-table"><table><thead><tr><th>Mã hạng mục</th><th>Hạng mục</th><th>Bộ môn / vị trí</th><th>Công (báo giá)</th><th>Ghép việc</th><th>Tự gán</th></tr></thead><tbody>{plan?.items?.filter(item => !item.isGroup).map(item => { const allocation = allocationByTask.get(item.id); return <tr key={item.id}><td>{item.code || 'MỚI'}</td><td><b>{item.title}</b></td><td><span className="project-dept">{item.requiredPosition || item.position || 'Chưa cấu hình'}</span></td><td>{(Number(item.estimatedHours || 0) / 8).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td><td className="positive">✓ {item.code || 'Tạo việc mới'}</td><td>{allocation?.employeeName || 'Chưa có người phù hợp'}</td></tr>; })}{!plan?.items?.length && <tr><td colSpan="6">Chưa có dữ liệu hạng mục.</td></tr>}</tbody>{plan && <tfoot><tr><td></td><td><b>Cộng</b></td><td></td><td><b>{totalDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</b></td><td></td><td></td></tr></tfoot>}</table></div><p className="project-import-footnote">Công báo giá → Công dự toán của việc. Ngày từng việc sinh theo phụ thuộc của template và nằm trong khoảng dự án.</p></section>

    <section className="project-import-panel project-create-panel"><header><span className="step-number">4</span><div><b>Tạo dự án</b><small>Tạo một lần · ngân sách và dự án đi qua luồng duyệt hiện có</small></div><div className="project-import-actions"><button disabled={pending} onClick={saveDraft}>Lưu nháp</button><button className="primary" disabled={pending || api.disabled || !plan} onClick={create}>{pending ? 'Đang tạo…' : 'Duyệt & tạo dự án'}</button></div></header><div className="project-create-summary"><span>Máy sẽ tạo:</span><ol><li><b>Tiến độ & Công:</b> {plan?.allocations.length || 0} việc, {totalDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} công kế hoạch, ngày theo phụ thuộc và tự gán người.</li><li><b>Kiểm soát công:</b> công dự toán, thực tế, còn lại, dự báo và chênh lệch trên từng việc.</li><li><b>Tải nhân lực:</b> tự động tính lại; thiếu người hoặc quá tải được đưa sang báo cáo năng lực.</li><li><b>Hồ sơ dự án:</b> ghi nhận tên file báo giá và hợp đồng trong bản nháp nhập dự án.</li></ol></div></section>
  </div>;
}
