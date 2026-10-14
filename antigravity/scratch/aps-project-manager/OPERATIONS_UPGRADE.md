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

## Kiểm tra

`npm.cmd --prefix backend test` và `npm.cmd --prefix frontend run build`.

Các fixture trình duyệt `frontend/tests/operations.html`, `delivery.html?shell`, `executive.html` dùng dữ liệu giả cô lập trong bộ nhớ để kiểm tra giao diện. Kiểm tra API tạo thư mục dữ liệu tạm trước khi nạp mô-đun DB. Không dùng số liệu mẫu để ghi vào cơ sở dữ liệu đang sử dụng.
