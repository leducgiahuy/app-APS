import { useMemo, useState } from 'react';
import { deliveryApi } from './deliveryApi';
import { positionLookup, quoteItemsToTemplateItems, readQuoteInfo } from './quoteFileReader';
import { useOperations } from '../operations/OperationsCommon';
import { companyAdmin } from '../../utils/operationsDefaults';

const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const validFile = (file, types) => file && types.some(extension => file.name.toLocaleLowerCase('vi').endsWith(extension));
const downloadText = (name, content, type = 'text/csv;charset=utf-8') => { const url = URL.createObjectURL(new Blob(['\ufeff', content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
/** Giá trị đặc biệt của ô "Dạng dự án → template": không dùng template, tạo việc theo bảng hạng mục trong file báo giá. */
const FROM_FILE_TEMPLATE = '__quote_file__';
const XLSX_TYPE ='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const QUOTE_ITEM_ROWS = 30;

/**
 * C\u00e1c \u00f4 c\u1ee7a kh\u1ed1i TH\u00d4NG TIN CHUNG, \u0111\u00fang th\u1ee9 t\u1ef1 b\u01b0\u1edbc 2 tr\u00ean m\u00e0n h\u00ecnh.
 * key = m\u00e3 c\u1ed1 \u0111\u1ecbnh \u1edf c\u1ed9t A (m\u00e1y d\u00f9ng \u0111\u1ec3 \u0111\u1ecdc file sau n\u00e0y, kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ed5i);
 * kind quy\u1ebft \u0111\u1ecbnh \u0111\u1ecbnh d\u1ea1ng v\u00e0 ki\u1ec3m tra d\u1eef li\u1ec7u c\u1ee7a \u00f4 nh\u1eadp: text / number / money / date / template / manager.
 */
const QUOTE_INFO_FIELDS = [
  { key: 'TEN_DU_AN', label: 'T\u00ean d\u1ef1 \u00e1n', kind: 'text', required: true, note: 'B\u1eaft bu\u1ed9c' },
  { key: 'MA_DU_AN', label: 'M\u00e3 d\u1ef1 \u00e1n', kind: 'text', note: 'Kh\u00f4ng tr\u00f9ng v\u1edbi d\u1ef1 \u00e1n \u0111\u00e3 c\u00f3' },
  { key: 'CHU_DAU_TU', label: 'Ch\u1ee7 \u0111\u1ea7u t\u01b0', kind: 'text' },
  { key: 'DANG_DU_AN', label: 'D\u1ea1ng d\u1ef1 \u00e1n \u2192 template', kind: 'template', required: true, note: 'B\u1eaft bu\u1ed9c. Ch\u1ecdn trong danh s\u00e1ch ho\u1eb7c ghi d\u1ea1ng d\u1ef1 \u00e1n m\u1edbi' },
  { key: 'DIEN_TICH_SAN_M2', label: 'Di\u1ec7n t\u00edch s\u00e0n (m\u00b2)', kind: 'number', note: 'Nh\u1eadp s\u1ed1' },
  { key: 'SO_TANG', label: 'S\u1ed1 t\u1ea7ng', kind: 'number', note: 'Nh\u1eadp s\u1ed1' },
  { key: 'NGAY_BAT_DAU', label: 'B\u1eaft \u0111\u1ea7u', kind: 'date', required: true, note: 'B\u1eaft bu\u1ed9c. Ng\u00e0y dd/mm/yyyy' },
  { key: 'NGAY_KET_THUC', label: 'K\u1ebft th\u00fac', kind: 'date', required: true, note: 'B\u1eaft bu\u1ed9c. Kh\u00f4ng tr\u01b0\u1edbc ng\u00e0y b\u1eaft \u0111\u1ea7u' },
  { key: 'GIA_TRI_HD_TRUOC_VAT', label: 'Gi\u00e1 tr\u1ecb H\u0110 tr\u01b0\u1edbc VAT', kind: 'money', note: 'Nh\u1eadp s\u1ed1 (VN\u0110), Excel t\u1ef1 th\u00eam d\u1ea5u ph\u00e2n c\u00e1ch' },
  { key: 'DIA_DIEM', label: '\u0110\u1ecba \u0111i\u1ec3m', kind: 'text' },
  { key: 'QL_LEADER_EMAIL', label: 'QL \u00b7 Leader', kind: 'manager', note: 'Email t\u00e0i kho\u1ea3n qu\u1ea3n l\u00fd; \u0111\u1ec3 tr\u1ed1ng = ng\u01b0\u1eddi l\u1eadp' },
];

/** Danh s\u00e1ch x\u1ed5 xu\u1ed1ng c\u1ee7a Excel gi\u1edbi h\u1ea1n 255 k\u00fd t\u1ef1; d\u00e0i h\u01a1n th\u00ec b\u1ecf danh s\u00e1ch, ch\u1ec9 gi\u1eef ghi ch\u00fa. */
const excelList = values => { const text = values.filter(Boolean).map(value => String(value).replace(/[",]/g, ' ')).join(','); return text && text.length <= 255 ? [`"${text}"`] : null; };

/**
 * T\u1ea1o v\u00e0 t\u1ea3i file "M\u1eabu b\u00e1o gi\u00e1" d\u1ea1ng .xlsx c\u00f3 \u0111\u1ecbnh d\u1ea1ng, 1 sheet g\u1ed3m:
 * - Ti\u00eau \u0111\u1ec1 + h\u01b0\u1edbng d\u1eabn ng\u1eafn (\u00f4 v\u00e0ng l\u00e0 \u00f4 c\u1ea7n \u0111i\u1ec1n).
 * - Kh\u1ed1i 1 TH\u00d4NG TIN CHUNG: c\u1ed9t A m\u00e3 tr\u01b0\u1eddng (MA_TRUONG), B t\u00ean m\u1ee5c, C \u00f4 nh\u1eadp, D ghi ch\u00fa.
 *   D\u1ea1ng d\u1ef1 \u00e1n v\u00e0 QL \u00b7 Leader c\u00f3 danh s\u00e1ch x\u1ed5 xu\u1ed1ng l\u1ea5y t\u1eeb d\u1eef li\u1ec7u h\u1ec7 th\u1ed1ng; \u00f4 ng\u00e0y/s\u1ed1 c\u00f3 ki\u1ec3m tra ki\u1ec3u.
 * - Kh\u1ed1i 2 H\u1ea0NG M\u1ee4C B\u00c1O GI\u00c1: c\u1ed9t MA_HANG_MUC, HANG_MUC, BO_MON, CONG_BAO_GIA, 1 d\u00f2ng v\u00ed d\u1ee5,
 *   s\u1eb5n c\u00e1c d\u00f2ng tr\u1ed1ng \u0111\u1ec3 \u0111i\u1ec1n v\u00e0 d\u00f2ng T\u1ed4NG C\u1ed8NG t\u1ef1 c\u1ed9ng c\u00f4ng.
 * Th\u01b0 vi\u1ec7n exceljs ch\u1ec9 \u0111\u01b0\u1ee3c t\u1ea3i khi b\u1ea5m n\u00fat \u0111\u1ec3 kh\u00f4ng l\u00e0m n\u1eb7ng trang.
 */
async function downloadQuoteTemplate(templates = [], managers = []) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'APS Vi\u1ec7t Nam';
  const sheet = workbook.addWorksheet('Mau bao gia', { views: [{ showGridLines: false }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.columns = [{ width: 24 }, { width: 34 }, { width: 30 }, { width: 46 }];

  const brand = 'FF861B36', border = { style: 'thin', color: { argb: 'FFD9DEE2' } };
  const box = { top: border, left: border, bottom: border, right: border };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const input = cell => { cell.fill = fill('FFFFF8E1'); cell.border = box; };
  const bandRow = (text, color, size) => { const row = sheet.addRow([text]); sheet.mergeCells(row.number, 1, row.number, 4); row.getCell(1).font = { bold: true, size, color: { argb: color } }; return row; };
  const headerRow = values => { const row = sheet.addRow(values); row.height = 22; row.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = fill('FF45545B'); cell.border = box; cell.alignment = { vertical: 'middle' }; }); return row; };

  const title = bandRow('M\u1eaaU B\u00c1O GI\u00c1 \u0110\u00c3 CH\u1ed0T \u00b7 APS VI\u1ec6T NAM', 'FFFFFFFF', 15);
  title.height = 30; title.getCell(1).fill = fill(brand); title.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  const hint = bandRow('Ch\u1ec9 \u0111i\u1ec1n v\u00e0o c\u00e1c \u00f4 m\u00e0u v\u00e0ng. Kh\u00f4ng s\u1eeda c\u1ed9t A v\u00e0 kh\u00f4ng \u0111\u1ed5i th\u1ee9 t\u1ef1 d\u00f2ng \u0111\u1ec3 m\u00e1y \u0111\u1ecdc \u0111\u00fang.', 'FF77858B', 10);
  hint.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF77858B' } };
  sheet.addRow([]);

  bandRow('1. TH\u00d4NG TIN CHUNG', brand, 12);
  headerRow(['MA_TRUONG', 'M\u1ee5c', 'Gi\u00e1 tr\u1ecb (\u0111i\u1ec1n v\u00e0o \u0111\u00e2y)', 'Ghi ch\u00fa']);
  for (const field of QUOTE_INFO_FIELDS) {
    const row = sheet.addRow([field.key, field.required ? `${field.label} *` : field.label, null, field.note || '']);
    row.height = 20;
    row.getCell(1).font = { size: 9, color: { argb: 'FF98A1A1' } };
    row.getCell(2).font = { bold: true, color: { argb: 'FF33434B' } };
    row.getCell(4).font = { italic: true, size: 10, color: { argb: 'FF899599' } };
    row.eachCell({ includeEmpty: true }, cell => { cell.border = box; cell.alignment = { vertical: 'middle', wrapText: true }; });
    const value = row.getCell(3);
    input(value);
    if (field.kind === 'date') { value.numFmt = 'dd/mm/yyyy'; value.dataValidation = { type: 'date', operator: 'greaterThan', formulae: [new Date(2000, 0, 1)], allowBlank: !field.required, showErrorMessage: true, error: 'Nh\u1eadp ng\u00e0y theo d\u1ea1ng dd/mm/yyyy.' }; }
    if (field.kind === 'number' || field.kind === 'money') { value.numFmt = field.kind === 'money' ? '#,##0' : '#,##0.##'; value.dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true, showErrorMessage: true, error: 'Ch\u1ec9 nh\u1eadp s\u1ed1 kh\u00f4ng \u00e2m.' }; }
    const list = field.kind === 'template' ? excelList(templates.map(row => row.name)) : field.kind === 'manager' ? excelList(managers.map(account => account.email)) : null;
    // Danh s\u00e1ch x\u1ed5 xu\u1ed1ng ch\u1ec9 \u0111\u1ec3 g\u1ee3i \u00fd: v\u1eabn cho ghi gi\u00e1 tr\u1ecb ngo\u00e0i danh s\u00e1ch (VD d\u1ea1ng d\u1ef1 \u00e1n m\u1edbi ch\u01b0a c\u00f3 template),
    // Excel ch\u1ec9 hi\u1ec7n th\u00f4ng b\u00e1o nh\u1eafc (ki\u1ec3u "information"), b\u1ea5m OK l\u00e0 gi\u1eef nguy\u00ean gi\u00e1 tr\u1ecb \u0111\u00e3 ghi.
    if (list) value.dataValidation = { type: 'list', formulae: list, allowBlank: !field.required, showErrorMessage: field.kind === 'template', errorStyle: 'information', errorTitle: 'D\u1ea1ng d\u1ef1 \u00e1n m\u1edbi', error: 'Ch\u01b0a c\u00f3 template cho d\u1ea1ng d\u1ef1 \u00e1n n\u00e0y. B\u1ea5m OK \u0111\u1ec3 gi\u1eef; khi t\u1ea3i file l\u00ean, h\u00e3y ch\u1ecdn template g\u1ea7n nh\u1ea5t tr\u00ean form.' };
  }
  sheet.addRow([]);

  bandRow('2. H\u1ea0NG M\u1ee4C B\u00c1O GI\u00c1', brand, 12);
  headerRow(['MA_HANG_MUC', 'HANG_MUC', 'BO_MON', 'CONG_BAO_GIA']);
  const firstItem = sheet.rowCount + 1;
  for (let index = 0; index < QUOTE_ITEM_ROWS; index += 1) {
    const row = sheet.addRow(index === 0 ? ['A1', 'Kh\u1ea3o s\u00e1t nhi\u1ec7m v\u1ee5 thi\u1ebft k\u1ebf', 'KT', 8] : []);
    row.height = 19;
    for (let column = 1; column <= 4; column += 1) input(row.getCell(column));
    row.getCell(4).numFmt = '#,##0.0';
    row.getCell(4).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true, showErrorMessage: true, error: 'C\u00f4ng b\u00e1o gi\u00e1 ph\u1ea3i l\u00e0 s\u1ed1 kh\u00f4ng \u00e2m.' };
  }
  const lastItem = sheet.rowCount;
  const total = sheet.addRow(['', 'T\u1ed4NG C\u1ed8NG', '', { formula: `SUM(D${firstItem}:D${lastItem})` }]);
  total.eachCell({ includeEmpty: true }, cell => { cell.font = { bold: true, color: { argb: brand } }; cell.fill = fill('FFF6F8F8'); cell.border = box; });
  total.getCell(4).numFmt = '#,##0.0';
  sheet.addRow([]);
  const footnote = bandRow('M\u00e3 tr\u00f9ng m\u00e3 vi\u1ec7c c\u1ee7a template s\u1ebd gh\u00e9p vi\u1ec7c; ghi MOI \u0111\u1ec3 t\u1ea1o vi\u1ec7c m\u1edbi. Th\u00eam d\u00f2ng b\u1eb1ng c\u00e1ch ch\u00e8n d\u00f2ng ph\u00eda tr\u00ean d\u00f2ng T\u1ed4NG C\u1ed8NG.', 'FF899599', 9);
  footnote.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF899599' } };
  footnote.getCell(1).alignment = { wrapText: true }; footnote.height = 26;

  const url = URL.createObjectURL(new Blob([await workbook.xlsx.writeBuffer()], { type: XLSX_TYPE }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Mau_bao_gia_APS.xlsx'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProjectImportWorkspace({ onCreated }) {
  const api = useOperations({});
  const [draft, setDraft] = useState({ name: '', code: '', client: '', location: '', startDate: vnToday(), endDate: vnToday(), area: '', floors: '', contractFee: '', managerEmail: '', leaderEmails: [], templateId: '', scope: [] });
  const [quoteFile, setQuoteFile] = useState(null);
  const [contractFile, setContractFile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [importNotice, setImportNotice] = useState('');
  // Bảng hạng mục đọc từ file báo giá; dùng để tạo việc khi chọn "lấy hạng mục từ file" thay cho template.
  const [quoteItems, setQuoteItems] = useState([]);
  const [quoteTypeName, setQuoteTypeName] = useState('');
  // Chỉ Giám đốc/Quản trị được lưu template (máy chủ cũng kiểm tra lại).
  const canSaveTemplate = Boolean(api.data && companyAdmin(api.data.companyRole) && !api.data.readOnly);
  const template = api.data?.templates?.find(row => row.id === draft.templateId);
  const fromFile = draft.templateId === FROM_FILE_TEMPLATE;
  // Dữ liệu gửi lên máy chủ: chế độ "từ file" không gửi templateId mà gửi kèm bảng hạng mục.
  const payload = () => fromFile ? { ...draft, templateId: '', quoteItems } : draft;
  const managerAccounts = api.data?.accounts?.filter(account => ['manager', 'director', 'admin'].includes(account.role)) || [];
  const set = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setPlan(null); };
  const fileError = useMemo(() => quoteFile && !validFile(quoteFile, ['.xlsx', '.xls', '.csv']) ? 'File báo giá phải là Excel hoặc CSV.' : contractFile && !validFile(contractFile, ['.xlsx', '.xls', '.pdf']) ? 'File hợp đồng phải là Excel hoặc PDF.' : '', [contractFile, quoteFile]);
  /**
   * Chọn file báo giá: ghi nhận file, rồi đọc khối THÔNG TIN CHUNG để tự điền bước 2 và đọc bảng hạng mục.
   * Chỉ ô có giá trị trong file mới ghi đè form; đổi template thì xóa phạm vi đã chọn của template cũ.
   * Dạng dự án trong file không trùng template nào → tự chuyển sang "lấy hạng mục từ file" (nếu file có hạng mục).
   * File không theo mẫu (không có mã trường ở cột A) vẫn được nhận, chỉ không điền gì và báo cho người dùng biết.
   */
  const handleQuoteFile = async event => {
    const file = event.target.files?.[0] || null;
    setQuoteFile(file); setQuoteItems([]); setPlan(null); setError(''); setImportNotice('');
    if (!file || !validFile(file, ['.xlsx', '.xls', '.csv'])) return;
    try {
      const { patch, filled, items, typeName, unknownType, warnings } = await readQuoteInfo(file, { templates: api.data?.templates || [], managers: managerAccounts });
      setQuoteItems(items); setQuoteTypeName(typeName);
      if (unknownType) {
        if (items.length) patch.templateId = FROM_FILE_TEMPLATE;
        else warnings.push(`Dạng dự án "${typeName}" chưa có template và file chưa có hạng mục, hãy chọn template gần nhất`);
      }
      if (filled || patch.templateId) setDraft(current => ({ ...current, ...patch, scope: patch.templateId && patch.templateId !== current.templateId ? [] : current.scope }));
      setImportNotice([
        filled ? `Đã điền ${filled} mục Thông tin chung từ file.` : 'File không có khối Thông tin chung theo mẫu, hãy nhập tay ở bước 2.',
        items.length ? `Đọc được ${items.length} hạng mục báo giá.` : '',
        unknownType && items.length ? `Dạng dự án "${typeName}" chưa có template nên sẽ tạo việc theo bảng hạng mục trong file.` : '',
      ].filter(Boolean).join(' '));
      if (warnings.length) setError(`Một số ô trong file chưa dùng được: ${warnings.join('; ')}.`);
    } catch (exception) { setError(exception.message || 'Không đọc được file báo giá.'); }
  };
  /**
   * Lưu bảng hạng mục của file thành template mới (tên mặc định = dạng dự án ghi trong file),
   * rồi chọn luôn template đó cho dự án đang nhập. Lần sau dự án cùng dạng sẽ chọn được trong danh sách.
   * Sửa chi tiết template (ngày, phụ thuộc, vị trí) ở Phân quyền → Mẫu dự án.
   */
  const saveAsTemplate = async () => {
    const name = window.prompt('Tên template mới:', quoteTypeName || draft.name)?.trim();
    if (!name) return;
    setError(''); setImportNotice('');
    try {
      const items = quoteItemsToTemplateItems(quoteItems, positionLookup(api.data?.templates));
      const result = await api.mutate('template', { name, baseArea: 0, items, budgetPercents: Array(9).fill(0), milestones: [], scopeOptions: [] });
      const saved = result.templates.filter(row => row.name === name).at(-1);
      if (saved) { setDraft(current => ({ ...current, templateId: saved.id, scope: [] })); setPlan(null); }
      setImportNotice(`Đã lưu template "${name}" với ${items.length} việc và chọn template này cho dự án.`);
    } catch (exception) { setError(exception.message || 'Không lưu được template.'); }
  };
  const preview = async () => {
    if (fileError) { setError(fileError); return; }
    if (!quoteFile) { setError('Chọn file báo giá đã chốt trước khi đọc dữ liệu.'); return; }
    if (!draft.name || !draft.startDate || !draft.endDate || !draft.templateId) { setError('Nhập tên, thời gian và chọn dạng dự án/template trước khi sinh dữ liệu.'); return; }
    if (fromFile && !quoteItems.length) { setError('File báo giá chưa có hạng mục nào có số công. Điền bảng hạng mục hoặc chọn một template.'); return; }
    setPending(true); setError('');
    try { const response = await deliveryApi.previewProject(payload()); setPlan(response.data); }
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
      const result = await api.mutate('projectCreate', { ...payload(), quoteFileName: quoteFile?.name || '', contractFileName: contractFile?.name || '', budgetLines: plan.lines, milestones: plan.milestones.map(milestone => ({ ...milestone, conditions: (milestone.conditions || []).map(condition => ({ ...condition, taskId: plan.items.find(item => item.id === condition.taskId)?.templateItemId || condition.taskId })) })) });
      localStorage.removeItem('aps_project_import_draft_v1');
      await onCreated(result.createdProjectId);
    } catch (exception) { setError(exception.message); }
    finally { setPending(false); }
  };
  const allocationByTask = new Map((plan?.allocations || []).map(row => [row.taskId, row]));
  const totalDays = plan ? plan.totalHours / 8 : 0;

  return <div className="project-import-workspace">
    {importNotice && <p className="project-import-notice" role="status">{importNotice}</p>}
    {(error || api.error) && <p className={error.startsWith('Đã lưu') ? 'project-import-notice' : 'delivery-error'} role="alert">{error || api.error}</p>}
    <section className="project-import-panel"><header><span className="step-number">1</span><div><b>Tải file</b><small>2 file theo mẫu · máy kiểm tra định dạng trước khi đọc</small></div></header><div className="project-upload-grid">
      <label className={`project-upload-box ${quoteFile && !fileError ? 'valid' : ''}`}><span>File báo giá đã chốt (Excel/CSV)</span><input type="file" accept=".xlsx,.xls,.csv" onChange={handleQuoteFile} /><b>{quoteFile?.name || 'Chọn file báo giá'}</b>{quoteFile && !fileError && <small>✓ Đúng định dạng · Thông tin chung được tự điền từ file</small>}</label>
      <label className={`project-upload-box ${contractFile && !fileError ? 'valid' : ''}`}><span>File hợp đồng đã ký (Excel/PDF)</span><input type="file" accept=".xlsx,.xls,.pdf" onChange={event => { setContractFile(event.target.files?.[0] || null); setError(''); }} /><b>{contractFile?.name || 'Chọn file hợp đồng (không bắt buộc)'}</b><small>{contractFile ? '✓ Đã nhận file hợp đồng' : 'Có thể bổ sung sau nếu chưa ký hợp đồng'}</small></label>
    </div><div className="project-import-actions left"><button onClick={() => downloadQuoteTemplate(api.data?.templates, managerAccounts).catch(() => setError('Không tạo được file mẫu. Vui lòng thử lại.'))}>Tải Mẫu báo giá</button><button onClick={() => downloadText('Huong_dan_Claude_APS.txt', 'Xuất báo giá đã chốt theo file Mau_bao_gia_APS.xlsx, giữ nguyên thứ tự 2 khối:\n1. THÔNG TIN CHUNG: giữ nguyên cột MA_TRUONG và Mục, chỉ điền cột "Giá trị" (tên dự án, mã, chủ đầu tư, dạng dự án/template, diện tích, số tầng, ngày bắt đầu/kết thúc dd/mm/yyyy, giá trị HĐ trước VAT chỉ ghi số, địa điểm, email QL/Leader).\n2. Để 1 dòng trống, sau đó là bảng hạng mục theo các cột: MA_HANG_MUC, HANG_MUC, BO_MON, CONG_BAO_GIA. Mã trùng template sẽ ghép việc; mã MOI sẽ tạo việc mới.', 'text/plain;charset=utf-8')}>Hướng dẫn cho Claude</button></div></section>

    <section className="project-import-panel"><header><span className="step-number">2</span><div><b>Thông tin chung</b><small>Thông tin dùng để tạo dự án, lịch và người phụ trách</small></div></header><div className="project-info-grid">
      <label>Tên dự án<input required value={draft.name} onChange={event => set('name', event.target.value)} /></label><label>Mã dự án<input value={draft.code} onChange={event => set('code', event.target.value)} /></label><label>Chủ đầu tư<input value={draft.client} onChange={event => set('client', event.target.value)} /></label>
      <label>Dạng dự án → template<select required value={draft.templateId} onChange={event => { setDraft(current => ({ ...current, templateId: event.target.value, scope: [] })); setPlan(null); }}><option value="">Chọn template</option>{api.data?.templates?.map(row => <option key={row.id} value={row.id}>{row.name} · {row.count} việc</option>)}<option value={FROM_FILE_TEMPLATE} disabled={!quoteItems.length}>Không dùng template · lấy {quoteItems.length || ''} hạng mục từ file báo giá</option></select></label><label>Diện tích sàn (m²)<input type="number" min="0" value={draft.area} onChange={event => set('area', event.target.value)} /></label><label>Số tầng<input type="number" min="0" value={draft.floors} onChange={event => set('floors', event.target.value)} /></label>
      <label>Bắt đầu<input type="date" required value={draft.startDate} onChange={event => set('startDate', event.target.value)} /></label><label>Kết thúc<input type="date" required min={draft.startDate} value={draft.endDate} onChange={event => set('endDate', event.target.value)} /></label><label>Giá trị HĐ trước VAT<input type="number" min="0" value={draft.contractFee} onChange={event => set('contractFee', event.target.value)} /></label>
      <label>Địa điểm<input value={draft.location} onChange={event => set('location', event.target.value)} /></label><label>QL · Leader<select value={draft.managerEmail} onChange={event => set('managerEmail', event.target.value)}><option value="">Người lập</option>{managerAccounts.map(account => <option key={account.email} value={account.email}>{account.name || account.email}</option>)}</select></label>{template?.scopeOptions?.length > 0 && <div className="project-scope"><span>Phạm vi</span>{template.scopeOptions.map(option => <label key={option.key}><input type="checkbox" checked={draft.scope.includes(option.key)} onChange={event => set('scope', event.target.checked ? [...draft.scope, option.key] : draft.scope.filter(key => key !== option.key))} />{option.label}</label>)}</div>}
    </div><div className="project-import-actions">{fromFile && canSaveTemplate && <button disabled={pending || api.disabled} onClick={saveAsTemplate}>Lưu hạng mục thành template mới</button>}<button className="primary" disabled={pending || api.disabled} onClick={preview}>{pending ? 'Đang đọc…' : 'Đọc file & sinh dữ liệu'}</button></div></section>

    <section className="project-import-panel"><header><span className="step-number">3</span><div><b>Hạng mục báo giá → việc trên tiến độ và số công</b><small>{plan ? `${plan.allocations.length} hạng mục · ${totalDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} công · mã hạng mục ghép với mã việc template` : 'Đọc file và sinh dữ liệu để xem kết quả ghép việc'}</small></div></header><div className="project-import-table"><table><thead><tr><th>Mã hạng mục</th><th>Hạng mục</th><th>Bộ môn / vị trí</th><th>Công (báo giá)</th><th>Ghép việc</th><th>Tự gán</th></tr></thead><tbody>{plan?.items?.filter(item => !item.isGroup).map(item => { const allocation = allocationByTask.get(item.id); return <tr key={item.id}><td>{item.code || 'MỚI'}</td><td><b>{item.title}</b></td><td><span className="project-dept">{item.requiredPosition || item.position || 'Chưa cấu hình'}</span></td><td>{(Number(item.estimatedHours || 0) / 8).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</td><td className="positive">✓ {item.code || 'Tạo việc mới'}</td><td>{allocation?.employeeName || 'Chưa có người phù hợp'}</td></tr>; })}{!plan?.items?.length && <tr><td colSpan="6">Chưa có dữ liệu hạng mục.</td></tr>}</tbody>{plan && <tfoot><tr><td></td><td><b>Cộng</b></td><td></td><td><b>{totalDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</b></td><td></td><td></td></tr></tfoot>}</table></div><p className="project-import-footnote">{fromFile ? 'Không dùng template: việc và số công lấy đúng bảng hạng mục trong file, xếp nối tiếp theo thứ tự trong file, mỗi việc chiếm số ngày tỷ lệ với số công.' : 'Công báo giá → Công dự toán của việc. Ngày từng việc sinh theo phụ thuộc của template và nằm trong khoảng dự án.'}</p></section>

    <section className="project-import-panel project-create-panel"><header><span className="step-number">4</span><div><b>Tạo dự án</b><small>Tạo một lần · ngân sách và dự án đi qua luồng duyệt hiện có</small></div><div className="project-import-actions"><button disabled={pending} onClick={saveDraft}>Lưu nháp</button><button className="primary" disabled={pending || api.disabled || !plan} onClick={create}>{pending ? 'Đang tạo…' : 'Duyệt & tạo dự án'}</button></div></header><div className="project-create-summary"><span>Máy sẽ tạo:</span><ol><li><b>Tiến độ & Công:</b> {plan?.allocations.length || 0} việc, {totalDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} công kế hoạch, ngày theo phụ thuộc và tự gán người.</li><li><b>Kiểm soát công:</b> công dự toán, thực tế, còn lại, dự báo và chênh lệch trên từng việc.</li><li><b>Tải nhân lực:</b> tự động tính lại; thiếu người hoặc quá tải được đưa sang báo cáo năng lực.</li><li><b>Hồ sơ dự án:</b> ghi nhận tên file báo giá và hợp đồng trong bản nháp nhập dự án.</li></ol></div></section>
  </div>;
}
