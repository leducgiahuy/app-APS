import { useState } from 'react';
import { useOperations,OperationsFrame,Tabs,Card,Table } from './OperationsCommon';
import DeliveryGuide from '../gantt/DeliveryGuide';
import { dictionaryMetrics } from './dictionaryData';
import { moneyRole } from '../../utils/operationsDefaults';
export const commonRules=[
 ['Q1 · Lịch làm việc','Thứ 2–6: 8 giờ/ngày, sáng Thứ 7: 4 giờ; trừ ngày lễ. Số ngày công việc và năng lực tháng dùng chung lịch này.'],
 ['Q2 · Đơn vị lưu trữ và làm tròn','Giờ theo bước 0,5; tiền lưu đồng nguyên. Chỉ làm tròn khi hiển thị: công và % một chữ số, triệu 0–1 chữ số, tỷ hai chữ số. Phép tính dùng số chưa làm tròn.'],
 ['Q3 · Thời điểm tính','% ghi nhận, sản lượng và cảnh báo tính lại khi có thay đổi. Tháng đã khóa giữ nguyên ảnh chụp số liệu.'],
 ['Q4 · Hạ mức khi mất điều kiện','Gỡ bằng chứng hoặc hủy xác nhận: % ghi nhận về 40% nếu mức từ 60% trở lên; có nhật ký người thao tác.'],
 ['Q5 · Ký phụ lục (CR thu phí)','Thêm phí và công dự toán, sinh việc mới, tính lại tỷ trọng từ ngày ký. Chênh lệch vào tháng ký phụ lục, không sửa tháng đã khóa.'],
 ['Q6 · Việc phê duyệt và việc làm lại','Việc phê duyệt chỉ có 0 hoặc 100%. Việc làm lại có công dự toán, tỷ trọng, % ghi nhận bằng 0; vẫn ghi giờ và chi phí.'],
 ['Q7 · Dòng nhóm','Nhóm không nhập trạng thái và không nhận giờ. Số liệu cộng từ các việc con.'],
 ['Q8 · Không tự duyệt','Không tự duyệt bản ghi mình lập. Khi trùng người duyệt, chuyển lên cấp trên.'],
 ['Q9 · Ẩn dữ liệu','API và báo cáo xuất đều lọc theo vai trò trên dự án; dữ liệu không có quyền xem không gửi xuống trình duyệt.'],
 ['Q10 · Múi giờ','Ngày giờ lưu UTC và hiển thị giờ Việt Nam GMT+7. Hạn nộp so với giờ hiện tại.'],
 ['Q11 · Tự gán người','Khi tạo dự án hoặc thêm đầu việc: gán người cùng vị trí, ít tải nhất; được vượt 8h/ngày và có cờ auto. Tải và tuyển dụng tính lại sau khi sửa.'],
 ['Q12 · Kế hoạch tuyển dụng','Thiếu từ 0,8 người sinh đề xuất; giảm dưới 0,5 trước khi đăng tuyển thì đề nghị hủy. Đợt trễ bắt buộc có phương án tạm.'],
];
export default function DictionaryPage(){
 const [query,setQuery]=useState({}),api=useOperations(query),[tab,setTab]=useState('status'),[search,setSearch]=useState(''),[category,setCategory]=useState('');
 const employee=api.data?.viewer.role==='employee',financial=moneyRole(api.data?.viewer.role);
 const metrics=dictionaryMetrics.filter(row=>(!employee||row.employeeVisible)&&(!category||row.category===category)&&`${row.name} ${row.meaning} ${row.formula}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
 return <OperationsFrame api={api} query={query} setQuery={setQuery} project={false} guide="Nội dung theo Phụ lục A và B. Các chỉ tiêu tài chính được lọc theo vai trò của tài khoản."><p className="operations-notice">Mỗi chỉ tiêu: nghĩa là gì · cách tính · lấy dữ liệu từ đâu · ai thấy · ví dụ minh họa. Ví dụ trong từ điển không phải số liệu của dự án.</p><Tabs value={tab} onChange={setTab} items={[[ 'status','Trạng thái → % ghi nhận'],['metrics','Tất cả chỉ tiêu'],['rules','Quy tắc chung']]}/>
 {tab==='status'&&<Card title="Trạng thái → % ghi nhận → kết quả"><div className="operations-panel-pad"><DeliveryGuide financial={financial}/><h3>Ví dụ đi từ đầu đến cuối</h3><Table head={['Việc','Trạng thái','Bằng chứng','Leader XN','% ghi nhận','Lý do',...(financial?['Sản lượng']:[])]}>{[['A3.1 Lập BCNCKT','60% · Đã gửi','Có','Có','60%','Đủ điều kiện','54 tr'],['A3.1 chưa có xác nhận','60% · Đã gửi','Có','Chưa','40%','Thiếu xác nhận, chỉ ghi nhận 40%','36 tr'],['A3.2b Thuyết minh điện nước','20% · Đang làm','Không cần','Không cần','20%','Mức dưới 60%','7 tr'],['A3.3 CĐT phê duyệt','0% · Chưa duyệt','—','—','0%','Việc phê duyệt chỉ 0 hoặc 100%','0'],['A2.4R Làm lại miễn phí','Làm lại','—','—','0%','Không tạo sản lượng; vẫn ghi giờ','0']].map((row,i)=><tr key={i}>{row.slice(0,financial?7:6).map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</Table></div></Card>}
 {tab==='metrics'&&<Card title={`Từ điển chỉ tiêu (${metrics.length}/${dictionaryMetrics.length})`} actions={<><input type="search" aria-label="Tìm chỉ tiêu" placeholder="Tìm chỉ tiêu, công thức…" value={search} onChange={e=>setSearch(e.target.value)}/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Tất cả nhóm</option>{[...new Set(dictionaryMetrics.map(row=>row.category))].map(value=><option key={value}>{value}</option>)}</select></>}><div className="operations-dictionary"><Table head={['Chỉ tiêu','Nghĩa là gì','Cách tính / Quy tắc','Nguồn dữ liệu','Ai thấy','Ví dụ']} empty={!metrics.length}>{metrics.map(row=><tr key={row.id}><td><b>{row.name}</b><small>{row.category}</small></td><td>{row.meaning}</td><td>{row.formula}</td><td>{row.source}</td><td>{row.audience}</td><td>{row.example}</td></tr>)}</Table></div></Card>}
 {tab==='rules'&&<Card title="Quy tắc chung áp dụng cho mọi màn hình"><Table head={['Quy tắc','Nội dung']}>{commonRules.map(([name,detail])=><tr key={name}><td><b>{name}</b></td><td>{detail}</td></tr>)}</Table></Card>}
 </OperationsFrame>;
}
