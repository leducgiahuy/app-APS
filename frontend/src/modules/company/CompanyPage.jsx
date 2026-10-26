import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Search, Upload } from 'lucide-react';
import { getCurrentUser } from '../auth/authSession';
import { Card, Kpis, OperationsFrame, Table, Tabs, useOperations } from '../operations/OperationsCommon';
import { Matrix, Params } from '../operations/PermissionsPage';
import { commonRules } from '../operations/DictionaryPage';
import { dictionaryMetrics } from '../operations/dictionaryData';
import './CompanyPage.css';

const policies = [
  ['QD-01', 'Quy định thời gian làm việc và chấm công', 'HCNS', '01/10/2026', ['Lịch làm việc chuẩn: Thứ 2–6, 8 giờ/ngày; sáng Thứ 7, 4 giờ.', 'Mỗi dòng giờ công phải gắn với một công việc thực tế.', 'Giờ làm thêm phải có đăng ký và đi đúng luồng duyệt.']],
  ['QD-02', 'Quy định nghỉ phép, nghỉ lễ và vắng mặt', 'HCNS', '01/10/2026', ['Đơn nghỉ phải gửi trước thời điểm nghỉ, trừ trường hợp khẩn cấp.', 'Lịch nghỉ lễ được nhập tập trung và dùng chung cho kế hoạch nguồn lực.']],
  ['QD-03', 'Quy trình giao việc và xác nhận kết quả', 'QL cấp trung', '01/10/2026', ['Công việc phải có người phụ trách, hạn và sản phẩm bàn giao.', 'Mốc từ 60% trở lên cần bằng chứng; người làm không tự xác nhận việc của mình.']],
  ['QD-04', 'Quy trình kiểm tra hồ sơ ba cấp', 'Kỹ thuật', '01/10/2026', ['Hồ sơ chỉ được phát hành sau khi hoàn tất các cấp kiểm tra áp dụng.', 'Mỗi lần phát hành và giao nhận phải có dấu vết.']],
  ['QD-05', 'Quy định quản lý hồ sơ pháp lý', 'Pháp lý', '01/10/2026', ['Theo dõi thủ tục, cơ quan tiếp nhận, ngày nộp và thời hạn xử lý.', 'Hồ sơ chờ nghiệm thu hoặc quá hạn phải được nhắc và báo cáo.']],
  ['QD-06', 'Quy định tiếp nhận góp ý khách hàng', 'QL dự án', '01/10/2026', ['Mỗi góp ý phải ghi nguồn, hạn xử lý, người xử lý và xác nhận đóng.', 'Góp ý ngoài phạm vi hợp đồng phải chuyển thành yêu cầu thay đổi.']],
  ['QD-07', 'Quy trình yêu cầu thay đổi (CR)', 'QL dự án', '01/10/2026', ['CR phải xác định phạm vi, bộ môn, giờ ước tính, giá trị và quyết định.', 'CR thu phí chỉ vào dự toán sau khi được duyệt.']],
  ['QD-08', 'Quy định lập và khóa dự toán công', 'Giám đốc', '01/10/2026', ['Công dự toán là cơ sở phân công, dự báo và kiểm soát chênh lệch.', 'Tỷ trọng được khóa khi ký hợp đồng và chỉ tính lại khi có phụ lục.']],
  ['QD-09', 'Quy định phân công và cân đối tải', 'QL cấp trung', '01/10/2026', ['Ưu tiên đúng vị trí, kinh nghiệm liên quan và người có tải thấp.', 'Trường hợp vượt năng lực phải gắn cờ quá tải do thiếu người.']],
  ['QD-10', 'Quy định nghiệm thu và ghi nhận sản lượng', 'Kỹ thuật', '01/10/2026', ['Sản lượng chỉ ghi nhận theo mức hoàn thành hợp lệ và bằng chứng.', 'Việc làm lại miễn phí có sản lượng bằng 0 nhưng vẫn ghi nhận giờ.']],
  ['QD-11', 'Quy định thu, chi và hồ sơ chứng từ', 'Kế toán', '01/10/2026', ['Khoản thu chi phải gắn dự án, chứng từ và luồng duyệt.', 'Không tự duyệt bản ghi do chính mình lập.']],
  ['QD-12', 'Quy định tạm ứng và hoàn ứng', 'Kế toán', '01/10/2026', ['Khoản tạm ứng có hạn hoàn ứng và người chịu trách nhiệm.', 'Quá hạn được đưa vào Việc của tôi và báo cấp có thẩm quyền.']],
  ['QD-13', 'Quy định bảo mật và phân quyền dữ liệu', 'Quản trị', '01/10/2026', ['Quyền được tính theo vai trò trên từng dự án.', 'Dữ liệu không có quyền xem không được gửi xuống trình duyệt.']],
  ['QD-14', 'Quy định quản lý tài khoản và mật khẩu', 'Quản trị', '01/10/2026', ['Tài khoản cá nhân không dùng chung.', 'Mọi thay đổi quyền phải được lưu nhật ký.']],
  ['QD-15', 'Quy định lưu trữ và đặt tên tài liệu', 'HCNS', '01/10/2026', ['Tài liệu dùng mã dự án, mã hồ sơ, lần phát hành và ngày.', 'Bản chính thức phải có đường dẫn hoặc mã chứng từ truy xuất được.']],
  ['QD-16', 'Quy định quản lý biểu mẫu và phiên bản', 'HCNS', '01/10/2026', ['Biểu mẫu đang hiệu lực phải ghi rõ phiên bản và ngày áp dụng.', 'Phiên bản mới bắt buộc người liên quan xác nhận đọc lại.']],
  ['QD-17', 'Quy định báo cáo và chốt số liệu tháng', 'Giám đốc', '01/10/2026', ['Số liệu chưa khóa được tính lại khi nguồn thay đổi.', 'Tháng đã khóa giữ nguyên ảnh chụp dữ liệu.']],
  ['QD-18', 'Quy tắc sử dụng hệ thống APS', 'Quản trị', '01/10/2026', ['Ngày giờ lưu UTC, hiển thị theo giờ Việt Nam GMT+7.', 'Không nhập trùng dữ liệu; dùng một luồng duyệt chung qua Việc của tôi.']]
].map(([code, title, owner, effective, articles]) => ({ code, title, owner, effective, version: 'Rev01', articles }));

const guideRows = [
  ['6 nhóm chức năng chính', 'Việc của tôi, Tổng quan, Dự án, Con người, Tiền và Công ty.'],
  ['Đăng nhập', 'Dùng tài khoản cá nhân; dữ liệu và thao tác hiển thị theo đúng vai trò.'],
  ['Thanh trên cùng', 'Chọn ngày/tháng, tải lại dữ liệu, xem thử vai trò nếu tài khoản được phép.'],
  ['Bấm vào số', 'Mở chi tiết tạo nên chỉ số để kiểm tra nguồn và cách tính.'],
  ['Chữ gạch chân chấm', 'Có giải thích thuật ngữ hoặc quy tắc khi di chuột/bấm vào.'],
  ['Nhập bằng file', 'Dùng đúng file mẫu; máy kiểm tra cấu trúc trước khi nhận dữ liệu.'],
  ['Quyền', 'Quyền được tính theo vai trò công ty và vai trò trên từng dự án.'],
  ['Hỗ trợ', 'Báo mã dự án, màn hình và thao tác gây lỗi để truy vết nhanh.']
];

const reportDepartments = [
  ['KT · Kiến trúc', '23', '18', '78%', 'Bảng diện tích lệch thuyết minh'],
  ['KC · Kết cấu', '10', '6', '60%', 'Bố trí thép dầm sàn, tải trọng đầu vào'],
  ['MEP · Điện nước', '8', '4', '50%', 'Công suất lệch bảng tính phụ tải'],
  ['PL · Pháp lý', '13', '11', '85%', 'Thiếu bản sao giấy tờ của CĐT']
];

const permitRows = [
  ['Sở TN&MT Trà Vinh', 'ĐTM', '3', '27 / 30', '1', '0'],
  ['Cảnh sát PCCC Bình Dương', 'Thẩm duyệt PCCC', '5', '19 / 15', '4', '2'],
  ['Sở Xây dựng Bình Dương', 'Giấy phép xây dựng', '4', '18 / 20', '2', '1'],
  ['BQL các KCN Bình Dương', 'Giấy phép xây dựng', '6', '12 / 15', '1', '1']
];

const archiveRows = [
  ['Giấy phép xây dựng · Kho lạnh Bình Dương', '03/2026', 'Khởi công trong 12 tháng → hết 03/2027'],
  ['QĐ phê duyệt ĐTM · KCN Tân Uyên', '08/2026', 'Theo dự án'],
  ['Văn bản thẩm duyệt PCCC · KCN Tân Uyên', '10/2026', 'Theo hồ sơ thiết kế']
];

const importTypes = [
  ['personnel', 'Danh sách nhân sự', 'Thông tin nhân sự, vị trí, bộ môn và tài khoản'],
  ['quotation', 'Báo giá đã chốt', 'Hạng mục, công dự toán và mã việc mẫu'],
  ['calendar', 'Lịch làm việc & ngày lễ', 'Lịch chuẩn, ngày nghỉ và giờ làm theo ngày'],
  ['policies', 'Quy định công ty', 'Mã quy định, phiên bản, ngày hiệu lực và nội dung'],
  ['procedures', 'Danh mục thủ tục', 'Cơ quan, thời hạn, lệ phí và giấy tờ CĐT cung cấp']
];

function SubTabs({ items, value, onChange }) {
  return <nav className="company-subtabs" aria-label="Mục con">{items.map(([key, label]) => <button type="button" key={key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{label}</button>)}</nav>;
}

function PolicySection({ api }) {
  const user = getCurrentUser();
  const identity = api.data.viewer.email || user?.email || 'current-user';
  const [subTab, setSubTab] = useState('policies');
  const [search, setSearch] = useState('');
  const filtered = policies.filter(item => `${item.code} ${item.title} ${item.owner}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const readFor = policy => api.data.policyReads?.find(row => row.email === identity && row.code === policy.code && row.version === policy.version);
  const confirmRead = policy => api.run(() => api.mutate('policyRead', { code: policy.code, version: policy.version }));
  const readCount = policies.filter(readFor).length;

  return <>
    <SubTabs value={subTab} onChange={setSubTab} items={[[ 'policies', 'Quy định công ty' ], [ 'guide', 'Hướng dẫn sử dụng' ], [ 'reads', 'Xác nhận đã đọc' ]]}/>
    {subTab === 'policies' && <Card title={`Quy định công ty · ${policies.length} quy định`} subtitle="Có phiên bản, ngày hiệu lực và yêu cầu đọc lại khi ban hành phiên bản mới" actions={<label className="company-search"><Search size={15}/><input type="search" placeholder="Tìm mã hoặc tên quy định" value={search} onChange={event => setSearch(event.target.value)}/></label>}>
      <div className="company-policy-list">{filtered.map(policy => {
        const readAt = readFor(policy)?.readAt;
        return <article className="company-policy" key={policy.code}>
          <header><div><b>{policy.code} · {policy.title}</b><span>{policy.version} · hiệu lực {policy.effective} · phụ trách: {policy.owner}</span></div>{readAt ? <span className="company-read"><CheckCircle2 size={15}/> Đã đọc</span> : <button className="primary" disabled={api.disabled} onClick={() => confirmRead(policy)}>Xác nhận đã đọc</button>}</header>
          <ol>{policy.articles.map(article => <li key={article}>{article}</li>)}</ol>
          {readAt && <small>Xác nhận lúc {new Date(readAt).toLocaleString('vi-VN')}</small>}
        </article>;
      })}</div>
    </Card>}
    {subTab === 'guide' && <><Card title="Hướng dẫn sử dụng chung" subtitle="Các thao tác thống nhất trên toàn bộ webapp"><Table head={['Nội dung', 'Cách sử dụng']}>{guideRows.map(row => <tr key={row[0]}><td><b>{row[0]}</b></td><td>{row[1]}</td></tr>)}</Table></Card><Card title="Lịch làm việc dành cho Leader và Pháp lý"><Table head={['Thời điểm', 'Việc cần làm']}>{[
      ['Mỗi sáng', 'Mở Việc của tôi, xử lý việc đến hạn/quá hạn và các yêu cầu duyệt.'],
      ['Khi có việc mới', 'Kiểm tra người máy tự gán, tải nguồn lực, hạn và sản phẩm bàn giao.'],
      ['Hằng ngày', 'Kiểm tra hồ sơ ba cấp, góp ý khách hàng, CR và hồ sơ xin phép đang chờ.'],
      ['Thứ 5 trước 17:00', 'Duyệt hoặc trả lại giờ công để nhân viên kịp sửa.'],
      ['Thứ 6', 'Xem cảnh báo dự báo, công việc đỏ và kế hoạch tuần tiếp theo.'],
      ['Cuối tháng/quý', 'Đối chiếu công, sản lượng, chất lượng và các chỉ số đánh giá.']
    ].map(row => <tr key={row[0]}><td><b>{row[0]}</b></td><td>{row[1]}</td></tr>)}</Table></Card></>}
    {subTab === 'reads' && <Card title="Xác nhận đã đọc" subtitle={`${user?.name || identity} · ${readCount}/${policies.length} quy định đã xác nhận`}><Table head={['Mã', 'Quy định', 'Phiên bản', 'Hiệu lực', 'Trạng thái', 'Thời điểm xác nhận']}>{policies.map(policy => { const at = readFor(policy)?.readAt; return <tr key={policy.code}><td><b>{policy.code}</b></td><td>{policy.title}</td><td>{policy.version}</td><td>{policy.effective}</td><td>{at ? <span className="company-status ok">Đã đọc</span> : <span className="company-status warn">Chưa đọc</span>}</td><td>{at ? new Date(at).toLocaleString('vi-VN') : '—'}</td></tr>; })}</Table></Card>}
  </>;
}

function ReportsSection() {
  return <>
    <Kpis items={[
      ['Đạt kiểm tra lần đầu', '72%', '39 / 54 lần phát hành · mục tiêu 85%', 'warning'],
      ['Góp ý đo lỗi hình / hồ sơ', '1,6', '38% số góp ý', 'warning'],
      ['Nộp → nghiệm thu', '24 ngày', 'mục tiêu ≤ 15', 'danger'],
      ['Hồ sơ chờ nghiệm thu > 15 ngày', '3', 'nhắc QL mỗi sáng', 'danger']
    ]}/>
    <Card title="Đạt kiểm tra lần đầu theo bộ môn" subtitle="6 tháng · lần phát hành không có lỗi nặng ở cấp 2"><Table head={['Bộ môn', 'Lần phát hành', 'Đạt lần đầu', 'Tỷ lệ', 'Lỗi hay gặp']}>{reportDepartments.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index} className={index === 3 && Number.parseInt(cell) < 70 ? 'danger' : ''}>{index === 0 ? <b>{cell}</b> : cell}</td>)}</tr>)}</Table></Card>
    <Card title="Xin phép theo cơ quan" subtitle="12 tháng · dùng để hứa tiến độ với khách và báo giá dịch vụ xin phép"><Table head={['Cơ quan', 'Thủ tục', 'Hồ sơ', 'Ngày gửi bình quân / thời hạn', 'Lần bị trả', 'Trong đó do lỗi công ty']}>{permitRows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index} className={index === 5 && cell !== '0' ? 'danger' : ''}>{index === 0 ? <b>{cell}</b> : cell}</td>)}</tr>)}</Table></Card>
    <Card title="Kho giấy phép, văn bản chấp thuận" subtitle="Nhắc trước 60 ngày khi có hạn hiệu lực · dùng cho hồ sơ năng lực"><Table head={['Văn bản', 'Ngày', 'Hiệu lực']}>{archiveRows.map(row => <tr key={row[0]}><td><b>{row[0]}</b></td><td>{row[1]}</td><td>{row[2]}</td></tr>)}</Table></Card>
  </>;
}

function ImportPanel({ api }) {
  const imports = Object.fromEntries((api.data.companyImports || []).map(row => [row.type, row]));
  const saveFile = async (type, file) => {
    if (!file) return;
    await api.run(() => api.mutate('companyImport', { type, name: file.name, size: file.size }));
  };
  const downloadTemplate = type => {
    const content = '\uFEFFMã,Tên,Phiên bản,Ngày hiệu lực,Nội dung\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `APS_${type}_mau.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <Card title="Nhập file dùng chung" subtitle="Máy kiểm tra loại file và lưu dấu lần nhập gần nhất; dùng đúng mẫu trước khi nhập">
    <div className="company-imports">{importTypes.map(([type, title, detail]) => { const current = imports[type]; return <article key={type}><FileSpreadsheet size={22}/><div><b>{title}</b><span>{detail}</span>{current && <small>Đã nhận: {current.name} · {new Date(current.updatedAt).toLocaleString('vi-VN')}</small>}</div><div className="company-import-actions"><button onClick={() => downloadTemplate(type)}><Download size={14}/> Tải mẫu</button><label><Upload size={14}/> Nhập file<input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={event => saveFile(type, event.target.files?.[0])}/></label></div></article>; })}</div>
  </Card>;
}

function CalendarPanel() {
  return <><Card title="Lịch & giờ làm việc" subtitle="Nguồn dùng chung để tính ngày công, năng lực tháng và hạn xử lý"><Table head={['Ngày', 'Buổi sáng', 'Buổi chiều', 'Tổng giờ', 'Áp dụng']}>
    <tr><td><b>Thứ 2 – Thứ 6</b></td><td>08:00 – 12:00</td><td>13:00 – 17:00</td><td>8 giờ</td><td>Toàn công ty</td></tr>
    <tr><td><b>Thứ 7</b></td><td>08:00 – 12:00</td><td>Nghỉ</td><td>4 giờ</td><td>Theo lịch công ty</td></tr>
    <tr><td><b>Chủ nhật</b></td><td>Nghỉ</td><td>Nghỉ</td><td>0 giờ</td><td>Toàn công ty</td></tr>
  </Table></Card><Card title="Ngày nghỉ và ngoại lệ năm 2026"><Table head={['Ngày', 'Tên ngày', 'Loại', 'Giờ làm']}>
    <tr><td>01/01/2026</td><td>Tết Dương lịch</td><td>Nghỉ lễ</td><td>0</td></tr>
    <tr><td>30/04/2026</td><td>Ngày Giải phóng miền Nam</td><td>Nghỉ lễ</td><td>0</td></tr>
    <tr><td>01/05/2026</td><td>Quốc tế Lao động</td><td>Nghỉ lễ</td><td>0</td></tr>
    <tr><td>02/09/2026</td><td>Quốc khánh</td><td>Nghỉ lễ</td><td>0</td></tr>
  </Table></Card></>;
}

function DictionaryPanel() {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => dictionaryMetrics.filter(row => `${row.name} ${row.meaning} ${row.formula}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))), [search]);
  return <Card title={`Từ điển & thuật ngữ · ${rows.length} mục`} actions={<label className="company-search"><Search size={15}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm thuật ngữ"/></label>}><Table head={['Thuật ngữ', 'Ý nghĩa', 'Cách tính / quy tắc', 'Nguồn dữ liệu', 'Ai thấy']}>{rows.map(row => <tr key={row.id}><td><b>{row.name}</b><small>{row.category}</small></td><td>{row.meaning}</td><td>{row.formula}</td><td>{row.source}</td><td>{row.audience}</td></tr>)}</Table></Card>;
}

function SettingsSection({ api }) {
  const [subTab, setSubTab] = useState('imports');
  return <>
    <SubTabs value={subTab} onChange={setSubTab} items={[[ 'imports', 'Nhập file' ], [ 'matrix', 'Ma trận quyền' ], [ 'calendar', 'Lịch & giờ làm việc' ], [ 'params', 'Tham số' ], [ 'dictionary', 'Từ điển & thuật ngữ' ], [ 'rules', 'Quy tắc chung' ]]}/>
    {subTab === 'imports' && <ImportPanel api={api}/>}
    {subTab === 'matrix' && <Matrix api={api}/>} 
    {subTab === 'calendar' && <CalendarPanel/>}
    {subTab === 'params' && <Params key={api.mutationVersion} api={api}/>} 
    {subTab === 'dictionary' && <DictionaryPanel/>}
    {subTab === 'rules' && <Card title="Quy tắc chung áp dụng cho mọi màn hình"><Table head={['Quy tắc', 'Nội dung']}>{commonRules.map(([name, detail]) => <tr key={name}><td><b>{name}</b></td><td>{detail}</td></tr>)}</Table></Card>}
  </>;
}

export default function CompanyPage() {
  const [query, setQuery] = useState({});
  const api = useOperations(query);
  const [tab, setTab] = useState('policies');
  return <OperationsFrame className="company-operations-page" api={api} query={query} setQuery={setQuery} project={false} guide="Dữ liệu cấp công ty: quy định có phiên bản, báo cáo chất lượng, cấu hình nhập file, lịch, tham số, từ điển và phân quyền dùng chung." toolbar={<div className="company-main-tabs"><Tabs value={tab} onChange={setTab} items={[[ 'policies', 'Quy định & hướng dẫn' ], [ 'reports', 'Báo cáo' ], [ 'settings', 'Cài đặt & nhập file' ]]}/></div>}>
    <div className="company-page">
      {tab === 'policies' && <PolicySection api={api}/>}
      {tab === 'reports' && <ReportsSection/>}
      {tab === 'settings' && <SettingsSection api={api}/>} 
    </div>
  </OperationsFrame>;
}
