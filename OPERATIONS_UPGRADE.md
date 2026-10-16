# Nâng cấp khung nghiệp vụ theo APEX_Giao_dien_Final.pdf

## Phạm vi và dữ liệu

Bốn trang Giờ công, Tài chính, Phân quyền và Từ điển dùng API và dữ liệu lưu bền vững, không phải màn hình mẫu. Phần mở rộng nằm trong `db.operations`; cấu trúc dự án, nhân sự, công việc và `delivery.projects` hiện có được giữ tương thích. Không nạp các số tiền, tên nhân sự, dự án minh họa trong PDF vào dữ liệu sử dụng.

Chức năng kết nối ngoài hiện là **nhập dữ liệu xuất từ hệ thống**. Chưa có tài khoản/API của phần mềm kế toán, máy chấm công, email hoặc Zalo nên không tự đồng bộ với nhà cung cấp và không giả lập kết quả kết nối. Hàng đợi nhắc việc hiển thị trong ứng dụng; trường `externalDelivery: not-configured` thể hiện chưa có bộ gửi ngoài.

## Thiết lập để đưa dữ liệu thật vào

1. Cấp quyền tài khoản ứng dụng tại Phân quyền → Vai trò theo dự án; email/mật khẩu phải khớp tài khoản đăng nhập. Liên kết đúng nhân sự. Một tài khoản có thể có vai trò khác nhau trên từng dự án. Dự án cũ chưa thiết lập thành viên giữ cách truy cập cũ để tránh mất quyền đột ngột.
2. Phân quyền → Tham số: Giám đốc sửa hạn mức A/B, ngưỡng cảnh báo, thời gian tuyển, hạn mức OT. KTT lập đơn giá chuẩn theo cấp bậc và ngày hiệu lực; Giám đốc duyệt. Đơn giá riêng đã lưu ở dự án vẫn được ưu tiên để giữ cách tính dữ liệu cũ.
3. Phân quyền → Mẫu & danh mục: thêm/sửa mẫu dự án và danh mục thủ tục, cơ quan, thời hạn. Có thể tiếp tục lưu cấu trúc dự án hiện có thành mẫu. Mẫu mới nhận `requiredPosition`, lịch tương đối, giờ dự toán, hệ số theo diện tích, phạm vi, tỷ lệ ngân sách và mốc nghiệm thu. Không có mẫu thì vẫn tạo dự án trống.
4. Tạo dự án mới: điền thông tin, chọn mẫu/phạm vi, sinh bản xem trước, rà soát ngân sách 9 nhóm và phân công, gửi duyệt. Xem trước không ghi dữ liệu. Tạo dự án, việc, phân công, ngân sách và mốc cùng một lần lưu. Dự án chờ duyệt vẫn tạo nhu cầu nhân lực.
5. Giờ công: tài khoản đã liên kết nhân sự khai tuần theo task được giao. Nộp → Leader duyệt NV → QL duyệt Leader → Giám đốc duyệt QL. Không tự duyệt, không sửa giờ đã nộp/duyệt. Mở khóa có lý do và người khác duyệt. OT đăng ký trước và có đủ cấp duyệt rồi mới khai.
6. Tài chính: lập ngân sách, đề nghị chi/tạm ứng/thuê ngoài và mốc nghiệm thu; theo dõi từng bước duyệt. Kế toán nhập dữ liệu xuất từ nguồn kế toán để ghi nhận HĐĐT, tiền về và phiếu chi. Dashboard lấy số liệu nguồn; mục tiêu nằm trong Tài chính.

## Định dạng nhập nguồn

Chấm công: CSV, mỗi dòng `employeeCode hoặc employeeId,date,hours`; ví dụ định dạng ngày `YYYY-MM-DD`, giờ không quá 24. Mã nhân viên và ngày trùng được cập nhật thay vì cộng lại. Dữ liệu này là giờ có mặt, không lấy giờ định mức thay thế.

Kế toán: mảng JSON. Mỗi dòng có:

- `kind`: `invoice`, `receipt` hoặc `disbursement`.
- `externalId`: mã duy nhất của chứng từ ở nguồn.
- `projectCode` hoặc `projectId`, `date` dạng `YYYY-MM-DD`.
- `requestCode`: mã ĐNTT cho hóa đơn/tiền về hoặc mã đề nghị chi/tạm ứng cho phiếu chi. Có thể dùng `paymentRequestId` / `expenseRequestId` thay thế.
- Hóa đơn thêm `invoiceNo`; thu/chi thêm `amount` là đồng nguyên, không có dấu phân cách.

Nút **Tải mã liên kết** cung cấp danh sách ID/mã để đối chiếu. Hóa đơn yêu cầu ĐNTT đã được duyệt xuất hóa đơn; phiếu chi yêu cầu luồng duyệt chi đã hoàn tất. Nhập lại cùng `externalId` trong cùng dự án/loại bản ghi cập nhật chứng từ, không cộng đôi. Toàn bộ lô được kiểm tra trước một lần ghi; có dòng sai thì không lưu lô.

## Các phần được nối thêm

- Sáu nhóm bất thường giờ công, đối chiếu chấm công, mẫu kiểm tra tháng ổn định, kết quả kiểm tra và nhật ký mở khóa.
- Ngân sách có phiên bản, thực tế + cam kết, ngưỡng 80% cấu hình được, lãi gộp dự kiến theo hiệu suất. Leader chỉ nhận nhóm 1 bằng giờ, nhóm 2–6 bằng tiền; NV nhận đề nghị của mình.
- Mốc theo điều kiện task, ĐNTT nhiều cấp, HĐĐT và tiền về liên kết, công nợ/tuổi nợ; dự báo dòng tiền 6 tháng do KTT lập và Giám đốc duyệt.
- CR thu phí có thao tác ký phụ lục và sinh việc bổ sung, tăng phí và tính lại tỷ trọng; giữ tháng đã khóa. Thu hồi bằng chứng / xác nhận hạ mức ghi nhận theo quy tắc.
- Tự gán theo vị trí ít tải, cờ auto; đề nghị hủy tuyển khi thiếu dưới 0,5 người và chưa đăng tuyển; đợt tuyển trễ bắt buộc phương án tạm.
- Danh mục thủ tục mới dùng cho thiết lập sau; hồ sơ đã sửa giữ thông tin riêng.
- Nhắc hạn, thiếu bằng chứng, duyệt giờ, ngân sách, duyệt chi, thanh toán, tuyển dụng và rà soát tháng. Tác vụ nền chạy khi backend đang hoạt động; khi mở lại máy chủ dùng lịch sử sự kiện để chụp bổ sung kỳ trước. Ảnh chụp cũ thiếu lịch sử từng task được đánh dấu `legacy-summary`, không tự dựng dữ liệu lịch sử không có.
- Phiên API mặc định 8 giờ; tạm khóa 15 phút sau 5 lần sai. Ghi dữ liệu bằng tệp tạm rồi đổi tên; giữ tối đa 30 bản sao theo ngày trong thư mục dữ liệu `backups`.
- Từ điển 63 chỉ tiêu và 12 quy tắc trong phụ lục; ví dụ được ghi rõ là minh họa.

## Cách hoạt động của từng trang

### Giờ công

- **Khai tuần:** chỉ hiện task có phân công cho nhân sự liên kết với tài khoản. Mỗi ô nhận tối đa 24 giờ, không nhập ngày tương lai. `Lưu nháp` giữ trạng thái sửa được; `Nộp duyệt` chuyển các dòng hợp lệ trong tuần sang hàng chờ duyệt.
- **Duyệt giờ:** người duyệt được xác định từ vai trò dự án và ma trận. Hệ thống từ chối tự duyệt. Dòng được duyệt sẽ khóa và là nguồn của Công TT, chi phí nhân công, hiệu suất và sản lượng; trả lại/từ chối không được tính như giờ duyệt.
- **Mở khóa:** chỉ áp dụng cho dòng đã duyệt, bắt buộc lý do và cần người khác quyết định. Khi được chấp thuận, dòng trở lại trạng thái `returned` để người khai sửa rồi nộp lại; lịch sử cũ vẫn nằm trong audit.
- **OT:** phiếu đi theo chuỗi Nhân viên → Leader → Quản lý; nếu vượt hạn mức tháng thì thêm Giám đốc. Chỉ phiếu đã duyệt mới cho khai giờ làm thêm và đưa vào số thực tế.
- **Chấm công/kiểm tra:** dữ liệu có mặt được nhập theo mã nhân viên + ngày. Kiểm tra tháng so sánh giờ khai với giờ có mặt và các ngưỡng bất thường; nhập lại cùng nhân viên/ngày cập nhật bản ghi thay vì cộng trùng.
- **Phân bổ:** bảng ngày/tháng lấy nhân sự và task thật. Các KPI “nhân viên còn giờ trống”, “giờ đã lên lịch” và “tình trạng phân bổ” được tính lại theo kỳ đang chọn; các dòng diễn giải mẫu đã được bỏ khỏi giao diện.

### Tài chính

- **Ngân sách & chi phí:** ngân sách luôn có 9 nhóm và có phiên bản. Nhóm 1 là giờ nhân công; nhóm 2–9 là tiền. Thực tế + cam kết chạm ngưỡng cấu hình sẽ cảnh báo. Đơn giá chuẩn lấy theo cấp bậc/ngày hiệu lực, không lưu lương thực tế.
- **Đề nghị chi & tạm ứng:** mọi đề nghị phải gắn dự án. Nhân viên chỉ lập công tác phí/tạm ứng nhóm 4; Leader lập nhóm 2–6; các vai trò cao hơn theo quyền ma trận. Vượt ngân sách hoặc hạn mức B sẽ thêm bước Giám đốc. Tạm ứng đã chi phải hoàn ứng bằng chứng từ.
- **Hợp đồng & mốc thanh toán:** mốc có thể phụ thuộc % ghi nhận của task hoặc dự án. Chỉ mốc đạt điều kiện mới lập ĐNTT. ĐNTT đi qua Kế toán trưởng → Giám đốc → Kế toán xuất HĐĐT → Quản lý gửi CĐT; bước gửi bị chặn nếu chưa có số hóa đơn.
- **Công nợ phải thu:** lấy ĐNTT đã gửi, số tiền về đã liên kết và hạn thanh toán để tính còn nợ/tuổi nợ. Tiền về chỉ được tính khi đã có bản ghi nguồn kế toán.
- **Dòng tiền công ty:** Kế toán trưởng lập sáu tháng liên tiếp, Giám đốc duyệt. Thu gồm tiền thật, ĐNTT và mốc dự kiến theo quy tắc; chi gồm chi phí đã duyệt/cam kết và kế hoạch. Thiếu số dư đầu kỳ thì kết quả số dư được để chưa xác định.
- **Sản lượng tháng:** dùng cùng số liệu tiến độ và cơ chế review/chốt của Gantt. Kỳ chốt là snapshot bất biến; mở lại chỉ do Giám đốc và phải ghi lý do.
- **Chỉ tiêu & dữ liệu chuyển tiếp:** giữ hợp đồng/kế hoạch cũ sau nâng cấp. Bản ghi mới phải đi qua luồng đề nghị và nhập kế toán; việc ký ở đây là duyệt nội bộ, không phải chữ ký số pháp lý.

### Phân quyền

- **Ma trận:** mỗi ô chứa tổ hợp có thứ tự của `X`, `L`, `S`, `XN`, `D`; chọn `—` để không truy cập. Khi bấm một ô trong chế độ sửa, bảng giải nghĩa xuất hiện ngay tại ô và cho phép chọn nhiều quyền. Người dùng vẫn có thể nhập phần diễn giải cũ sau ký hiệu nếu dữ liệu hiện hữu cần giữ tương thích.
- **Ghi chú:** mỗi dòng ma trận có textarea riêng, lưu cùng lần với toàn bộ ma trận và giới hạn 1.000 ký tự. Nút Hủy sửa phục hồi dữ liệu đã tải, không ghi bản nháp.
- **Vai trò theo dự án:** tài khoản ứng dụng phải tồn tại, mật khẩu cấp quyền phải khớp tài khoản đăng nhập và có thể liên kết `employeeId`. Vai trò dự án quyết định dữ liệu/thao tác; chức danh dạng chữ của hồ sơ nhân sự không tự cấp quyền.
- **Tham số:** lưu hạn mức duyệt chi, cảnh báo ngân sách, hạn hoàn ứng, OT, thời gian tuyển và các ngưỡng phát hiện bất thường. Kế toán trưởng lập đơn giá chuẩn; Giám đốc/Quản trị duyệt.
- **Mẫu & danh mục:** preview dự án không ghi dữ liệu. Khi tạo thật, dự án, task/Gantt, phân công, ngân sách và mốc được ghi trong một giao dịch logic; dự án chờ duyệt vẫn được đưa vào dự báo nhân lực.
- **Nhật ký:** mỗi mutation ghi người thao tác, thời gian, dự án, hành động và ảnh trước/sau của các bộ sưu tập thay đổi.

### Từ điển

- Dữ liệu định nghĩa nằm trong `frontend/src/modules/operations/dictionaryData.js`; trang chỉ đọc, tìm kiếm và lọc, không sửa dữ liệu dự án.
- Khi đổi công thức nghiệp vụ trong code phải cập nhật cả chỉ tiêu/quy tắc liên quan để người vận hành không đọc công thức cũ.

## Quy tắc dữ liệu dùng chung

- Bộ chọn dự án/tháng và vai trò ở khung `OperationsFrame` quyết định phạm vi truy vấn cho cả bốn trang. Chế độ xem thử vai trò là chỉ đọc và không cấp quyền ghi ở server.
- Các mutation gửi `action`, `projectId`, `id`, `value` và revision. Server kiểm tra vai trò, ma trận, dữ liệu đầu vào rồi mới ghi; ghi thành công mới tăng revision và thêm audit.
- Tiến độ, giờ đã duyệt, ngân sách, đề nghị, hóa đơn, tiền về và dòng tiền liên kết bằng ID/mã. Không nhập lại số tổng ở Dashboard vì Dashboard chỉ tổng hợp từ các nguồn này.
- Tác vụ nhắc việc chạy khi backend hoạt động và bổ sung kỳ bị lỡ khi khởi động lại. Hàng đợi trong ứng dụng không đồng nghĩa email/Zalo đã được gửi khi `externalDelivery` còn `not-configured`.

## Kiểm tra

`npm.cmd --prefix backend test` và `npm.cmd --prefix frontend run build`.

Các fixture trình duyệt `frontend/tests/operations.html`, `delivery.html?shell`, `executive.html` dùng dữ liệu giả cô lập trong bộ nhớ để kiểm tra giao diện. Kiểm tra API tạo thư mục dữ liệu tạm trước khi nạp mô-đun DB. Không dùng số liệu mẫu để ghi vào cơ sở dữ liệu đang sử dụng.
