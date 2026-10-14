export const OP_ROLES = ['employee', 'leader', 'manager', 'accountant', 'chiefAccountant', 'director'];
export const OP_ROLE_NAMES = { employee:'Nhân viên', leader:'Leader', manager:'QL cấp trung', accountant:'Kế toán viên / HCNS', chiefAccountant:'Kế toán trưởng', director:'Giám đốc', admin:'Quản trị' };
export const BUDGET_GROUPS = ['Nhân công nội bộ','Thuê ngoài (khảo sát, phối cảnh, bộ môn)','In ấn, scan, đóng quyển','Đi lại, công tác','Chuyển phát hồ sơ','Tiếp khách, hội họp','Phí, lệ phí (thẩm tra, thẩm định, xin phép)','Phần mềm, thiết bị, bảo hiểm','Chi phí chung phân bổ & dự phòng'];
const row = (section,key,label,values,note='') => ({section,key,label,values:Object.fromEntries(OP_ROLES.map((role,index)=>[role,values[index] || '—'])),note});
export const DEFAULT_MATRIX = [
 row('A. Thông tin dự án','projectInfo','Thông tin (tên, địa điểm, CĐT, quy mô)',['X','X','X/S','X','X','X/S']),
 row('A. Thông tin dự án','scope','Phạm vi công việc, sản phẩm phải giao',['X','X','L/S','—','X','D']),
 row('A. Thông tin dự án','hdValue','Giá trị hợp đồng, phụ lục, điều khoản thanh toán',['—','—','X','X','X','L/D']),
 row('B. Tiến độ & công việc','progress','Tiến độ tổng thể dự án',['X','L/S','D','—','—','X']),
 row('B. Tiến độ & công việc','assign','Phân công task cho nhân viên',['X (của mình)','L/S','X','—','—','X']),
 row('B. Tiến độ & công việc','editStatus','Cập nhật % hoàn thành task',['L (của mình)','L/S','X','—','—','X']),
 row('B. Tiến độ & công việc','confirmStatus','Xác nhận trạng thái / bằng chứng',['—','XN','XN','—','—','XN'],'Không tự xác nhận việc của mình'),
 row('C. Giờ công','tsSubmit','Khai timesheet',['L (của mình)','L (của mình)','L (của mình)','—','—','—'],'Mỗi dòng giờ phải gắn một task thực tế'),
 row('C. Giờ công','tsApproveStaff','Duyệt timesheet nhân viên',['—','D','Kiểm tra ngẫu nhiên','—','—','X'],'Leader chỉ duyệt / trả lại, không sửa'),
 row('C. Giờ công','tsApproveLeader','Duyệt timesheet Leader',['—','—','D','—','—','X']),
 row('C. Giờ công','tsApproveManager','Duyệt timesheet QL cấp trung',['—','—','—','—','—','D']),
 row('C. Giờ công','otRegister','Đăng ký làm thêm giờ',['L','Đề xuất','D','X','X','D (vượt hạn mức)']),
 row('C. Giờ công','attendance','Đối chiếu timesheet với chấm công',['—','—','X','L/S','X','X']),
 row('C. Giờ công','anomalies','Báo cáo bất thường giờ công',['—','—','X','X','X','X']),
 row('C. Giờ công','unlock','Mở khóa, sửa timesheet đã duyệt',['—','Đề xuất','D','—','—','D'],'Bắt buộc lý do, lưu nhật ký'),
 row('C. Giờ công','hours','Giờ định mức / đã dùng (theo task)',['X (của mình)','X','X','X','X','X']),
 row('C. Giờ công','laborMoney','Chi phí nhân công bằng tiền',['—','—','X','X','X','X']),
 row('C. Giờ công','rateCard','Đơn giá giờ công chuẩn theo cấp bậc',['—','—','X','X','L/S','D']),
 row('C. Giờ công','salary','Lương thực tế từng người',['—','—','—','—','X/S','X'],'Bảo mật; không dùng để tính chi phí chuẩn'),
 row('D. Ngân sách dự án','budgetLabor','Ngân sách giờ công',['—','X','L/S','X','X','D']),
 row('D. Ngân sách dự án','budgetDirect','Ngân sách chi phí trực tiếp (nhóm 2–6)',['—','X','L/S','X','X','D']),
 row('D. Ngân sách dự án','budgetFees','Ngân sách phí, phần mềm, bảo hiểm (nhóm 7–8)',['—','—','L/S','X','X','D']),
 row('D. Ngân sách dự án','budgetOverhead','Chi phí chung phân bổ, dự phòng (nhóm 9)',['—','—','X','X','L/S','D']),
 row('D. Ngân sách dự án','budget','Điều chỉnh ngân sách',['—','Đề xuất','L','X','XN','D']),
 row('E. Chi phí trực tiếp phát sinh','travel','Công tác phí bản thân',['L','XN','D (trong hạn mức)','Kiểm tra chứng từ','X','D (vượt hạn mức)']),
 row('E. Chi phí trực tiếp phát sinh','printing','In ấn, scan, đóng quyển hồ sơ',['Đề xuất','L','D','Kiểm tra chứng từ','X','X']),
 row('E. Chi phí trực tiếp phát sinh','courier','Chuyển phát hồ sơ',['Đề xuất','L','D','Kiểm tra chứng từ','X','X']),
 row('E. Chi phí trực tiếp phát sinh','survey','Đi khảo sát, giám sát tác giả (đoàn)',['—','L','D','Kiểm tra chứng từ','X','X']),
 row('E. Chi phí trực tiếp phát sinh','hospitality','Tiếp khách, hội họp',['—','L','D (trong hạn mức)','Kiểm tra chứng từ','X','D (vượt hạn mức)']),
 row('E. Chi phí trực tiếp phát sinh','outsource','Thuê ngoài (khảo sát, phối cảnh, bộ môn)',['—','Đề xuất phạm vi','L hợp đồng','X','XN','D']),
 row('E. Chi phí trực tiếp phát sinh','fees','Phí thẩm tra, thẩm định, lệ phí',['—','—','L','X','XN','D']),
 row('F. Tạm ứng & thanh toán','advance','Đề nghị tạm ứng',['L (công tác)','L','L','—','XN','D']),
 row('F. Tạm ứng & thanh toán','settlement','Hoàn ứng, quyết toán tạm ứng',['L','L','XN','Kiểm tra','D','X']),
 row('F. Tạm ứng & thanh toán','disbursement','Lập phiếu chi, chuyển khoản',['—','—','—','L','D','D (vượt hạn mức)']),
 row('G. Theo dõi chi phí dự án','costDirect','Chi phí trực tiếp thực tế so với ngân sách (nhóm 2–6)',['—','X','X','X','X','X']),
 row('G. Theo dõi chi phí dự án','costTotal','Tổng chi phí thực tế so với dự toán được duyệt',['—','—','X','X','X','X']),
 row('G. Theo dõi chi phí dự án','margin','Lãi gộp dự án',['—','—','X','X','X','X']),
 row('H. Doanh thu & công nợ','milestones','Đợt nghiệm thu hồ sơ (mốc thanh toán)',['—','X','L','X','X','D']),
 row('H. Doanh thu & công nợ','payment','Đề nghị thanh toán của CĐT',['—','—','L','X','XN','D']),
 row('H. Doanh thu & công nợ','receivables','Công nợ phải thu theo dự án',['—','—','X','L/S','X','X']),
 row('I. Tài chính công ty','cashCompany','Dòng tiền thu – chi toàn công ty',['—','—','—','X','L/S','X/D']),
 row('I. Tài chính công ty','reports','Báo cáo lãi lỗ toàn công ty, tất cả dự án',['—','—','—','X','X','X']),
 row('J. Hồ sơ kỹ thuật','technical','Bản vẽ, thuyết minh',['L/S','X/S','X','—','—','X']),
 row('J. Hồ sơ kỹ thuật','quality','Kiểm tra (KCS), phát hành hồ sơ',['—','XN','X','—','—','D']),
 row('K. Quản trị','newProject','Tạo dự án từ template',['—','—','L','—','—','D']),
 row('K. Quản trị','perms','Ma trận phân quyền, vai trò theo dự án',['X','X','X','X','X','L/S']),
 row('K. Quản trị','params','Tham số công ty',['X','X','X','X','L/S (đơn giá)','L/S']),
];
export const DEFAULT_PARAMS = { limitA:2000000, limitB:10000000, budgetWarning:80, advanceDays:7, otLimit:40, identicalDays:5, overtimeSpike:150, exactEstimate:90, hoursUsed:80, completionLow:50, randomChecks:2, sessionHours:8, leadDays:45, rateCard:[] };
export const companyAdmin = role => ['admin','director'].includes(role);
export const moneyRole = role => ['manager','accountant','chiefAccountant','director','admin'].includes(role);
export function matrixAllows(matrix,key,role,mode='read') {
 if(role==='admin')return true;
 const cell=(matrix || DEFAULT_MATRIX).find(row=>row.key===key)?.values?.[role] || '—';
 return mode==='read' ? cell!=='—' : /L|S|D|XN|Đề xuất/.test(cell);
}
