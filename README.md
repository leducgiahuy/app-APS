# HỆ THỐNG QUẢN LÝ DỰ ÁN XÂY DỰNG & NHÂN SỰ CÔNG TRƯỜNG - APS VIỆT NAM

> **Dự án phát triển cho:** Công ty Giải Pháp Châu Á Thái Bình Dương Việt Nam (APS Việt Nam)  
> **Người phụ trách:** Chuyên viên IT Nội Bộ (Phần Cứng & Hạ Tầng)  
> **Phiên bản:** 1.0.0 (bản xem trước nội bộ)
> **Kiến trúc:** Clean Modular FullStack (Frontend React + Backend Node Express riêng biệt)

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY NHANH (QUICK START)

Ứng dụng hiện đang được cấu hình và chạy sẵn trên máy tính của bạn tại:
- **Giao diện Web (Frontend):** [http://localhost:3000](http://localhost:3000)
- **Máy chủ dữ liệu (Backend API):** [http://localhost:5000/api](http://localhost:5000/api)

### Cách khởi động lại sau này (Dành cho IT Phần cứng):

#### Cách 1: Chạy bằng file 1-Click (Khuyên dùng)
Chỉ cần nhấp đúp chuột vào file:
```text
C:\Users\GiaWyy\.gemini\antigravity\scratch\aps-project-manager\start-all.bat
```

#### Cách 2: Chạy thủ công qua 2 cửa sổ Terminal
**Cửa sổ 1: Khởi động Backend**
```powershell
cd C:\Users\GiaWyy\.gemini\antigravity\scratch\aps-project-manager\backend
npm start
```
*(Backend sẽ lắng nghe tại cổng `http://localhost:5000`)*

**Cửa sổ 2: Khởi động Frontend**
```powershell
cd C:\Users\GiaWyy\.gemini\antigravity\scratch\aps-project-manager\frontend
npm run dev
```
*(Mở trình duyệt truy cập `http://localhost:3000`)*

---

## 🌟 CÁC PHÂN HỆ CHỨC NĂNG CHÍNH

### 1. Phân hệ Nhân Sự & Điểm Danh Công Trường (`/hr`)
- **Đồng hồ số thời gian thực (Real-time Clock):** Cập nhật từng giây (Giờ : Phút : Giây).
- **Bộ điều hướng ngày:** Xem lại lịch sử hôm trước, hôm nay, hôm sau.
- **Thẻ KPI:** Đếm tổng nhân sự, số người đang có mặt tại công trường (On-site / In Shift), định mức ca chuẩn (8h/ngày), tổng giờ tăng ca (OT).
- **Thẻ nhân sự cá nhân:**
  + Tên, mã nhân viên, chức danh, ban/đội, số điện thoại.
  + **Huy hiệu số task đang đảm nhận ngay bên dưới tên** kèm danh sách công việc chi tiết.
  + Giờ làm việc: 8h chuẩn/ngày + số giờ OT tích lũy.
  + Nút chuyển trạng thái nhanh: Vào công trường (Check-in) / Rời công trường (Check-out).
  + Nút xóa hoặc thêm nhân sự mới qua popup modal.

### 2. Phân hệ Phân Công & Tăng Ca (`/tasks`)
- **Mục 1 - Phân công công việc (Task Assignment):**
  + Giao việc theo: Dự án, Giai đoạn (Thiết kế, Pháp lý, Nghỉ lễ, Đấu thầu...), Tên công việc cụ thể.
  + Chọn người đảm nhận (tự động hiển thị thời gian làm việc chuẩn 8h/ngày của nhân sự đó).
  + Thời gian dự kiến: Ngày bắt đầu, Ngày kết thúc, Ước tính số ngày (ngày x 8h).
  + Đánh giá tốc độ thực hiện: **Hoàn thành sớm / Đúng hạn / Chậm trễ**.
  + Thanh kéo cập nhật tiến độ từ 0% đến 100%.
- **Mục 2 - Đăng ký ca Tăng Ca (Overtime - OT):**
  + Tạo ca tăng ca cho công việc cần gấp.
  + Ghi nhận số giờ làm thêm (1h, 2h, 4h...), lý do tăng ca, người phê duyệt.
  + Bảng thống kê tổng hợp giờ OT đã duyệt cho toàn công trường.

### 3. Phân hệ Tiến Độ Dự Án & Biểu Đồ Gantt Thực Tế (`/gantt`)
*(Mô phỏng 100% theo mẫu biểu tiến độ công trình thực tế có ảnh đính kèm)*
- **Bên trái (Cột trời đóng băng - Freeze Pane):**
  + Cây phân rã công việc (WBS): Nhóm A (Thiết kế), Nhóm L (Nghỉ lễ Việt Nam), Nhóm B (Xin phép/Pháp lý), Nhóm C (Mời thầu thi công).
  + Các cột thông tin: STT (A, A1, A1.1...), Tên công việc, ĐV (TK, CDT, PL, NT, VN), Ngày bắt đầu, Ngày kết thúc, Số ngày, Ghi chú / GATE kiểm soát.
  + Nút thêm công việc mới vào dự án hoặc xóa bỏ khi tạo xong.
  + Nút khởi tạo dự án xây dựng mới.
- **Bên phải (Biểu đồ Gantt SVG tương tác):**
  + Trục thời gian hiển thị Tháng (T11/26, T12/26, T1/27, T2/27, T3/27, T4/27...) và tuần.
  + Thanh Bar tiến độ phân biệt màu theo từng giai đoạn.
  + **Đường mũi tên liên kết phụ thuộc Finish-to-Start (FS)** kẻ nối từ đuôi công việc trước sang đầu công việc tiếp theo.
  + Dải ruy-băng nền vàng đánh dấu **NGHỈ LỄ VIỆT NAM** (Tết Dương lịch, Tết Nguyên Đán, Giỗ Tổ, 30/4...) kéo dài ngang qua biểu đồ.
  + Hiển thị nhãn: Người đảm nhận, số ngày, huy hiệu làm sớm/chậm, và số giờ OT (+x h OT).
  + Chế độ thu phóng (Zoom): Xem theo Tháng, Tuần, hoặc Chi tiết từng ngày.
- Task trong các trang liên quan hiển thị tên nhóm công việc nếu task thuộc nhóm; nếu không có nhóm thì dùng tên dự án, không dùng nhãn phase cũ.
- Menu ba chấm trên nhóm Gantt cho phép đổi tên hoặc xóa nhóm; khi xóa nhóm, các task con được giữ lại và bỏ liên kết nhóm.

### 4. Phân hệ Thống Kê & Báo Cáo Hiệu Suất (`/dashboard`)
- Giao diện thay đổi theo vai trò. Nhân viên/Leader chỉ nhận phần vận hành được phép xem; tiền được loại khỏi phản hồi API. Quản lý chỉ xem tài chính của dự án mình quản lý; Giám đốc/Quản trị có sáu KPI điều hành, danh sách việc cần xử lý và số dư 6 tháng.
- Báo cáo dự án dùng mỗi dự án một dòng, gồm % ghi nhận, chênh kế hoạch, hiệu suất giờ, hạn nộp gấp, lãi gộp và công nợ theo quyền.
- Sản lượng tháng dùng snapshot đã khóa; lũy kế năm tài chính tính từ tháng 10 đến tháng 9 và chỉ cộng các kỳ đã chốt.

### 5. Phân hệ Theo Dõi Giờ & Công Việc (`workload`)
- Xem phân bổ công việc theo ngày, tháng hoặc năm; admin có thể tìm nhân viên và xem giờ đã lên lịch, giờ trống hoặc phần vượt định mức.
- User xem lịch cá nhân sau khi tài khoản được ghép với hồ sơ nhân sự theo `employeeId`, email hoặc tên.
- Ngày làm việc tính Thứ 2–6 đủ định mức, Thứ 7 nửa định mức, Chủ nhật không tính.
- Chế độ ngày hiển thị task và nhật ký giờ thực tế, gồm phiên đang chạy; chế độ tháng/năm tổng hợp tiến độ và giờ theo công trình.
- Khung lịch và thanh chọn ngày/tháng được giữ ổn định khi chuyển kỳ; trang có thanh cuộn dọc kể cả khi nội dung ngắn.

### 6. Đăng Nhập, Tài Khoản & Nhật Ký Quản Trị (`/login`, `/account`)
- Có màn hình đăng nhập, ghi nhớ phiên đăng nhập, đăng xuất, trang hồ sơ, đổi mật khẩu và cập nhật ảnh đại diện.
- Admin có thể tạo tài khoản user, chỉnh hồ sơ/ảnh và cấp lại mật khẩu. User không tự cấp quyền admin.
- Admin có trang nhật ký thay đổi dữ liệu quan trọng như thêm/xóa nhân sự, công việc, tăng ca, dự án và cập nhật hạng mục tiến độ; hỗ trợ tìm kiếm, lọc theo loại dữ liệu/người dùng, phân trang và xuất CSV. Sự kiện chuyển trang, đăng nhập, hồ sơ và thao tác không trọng yếu không hiển thị trong danh sách này. Nhật ký dùng backend để chia sẻ giữa trình duyệt, tối đa 1.000 sự kiện gần nhất; backend tắt thì dùng bản cục bộ.
- Tài khoản demo trên màn hình đăng nhập: `demo@aps.vn` / `APS@2026`.
- Phiên đăng nhập giao diện cũ vẫn được dùng để vào ứng dụng. Riêng các API nghiệp vụ mới dưới `/api/delivery/*` dùng phiên phía server, mật khẩu băm `scrypt`, phiên mặc định 8 giờ (có thể cấu hình) và kiểm tra lại vai trò ở mỗi request. Dữ liệu tiền được lọc ở backend trước khi trả về.
- **Giới hạn cần biết:** các API cũ ngoài `/api/delivery/*` chưa được đưa hết vào cùng cơ chế xác thực mới. Không công khai backend ra Internet hoặc dùng dữ liệu nhạy cảm thực tế trước khi hoàn tất xác thực/ủy quyền cho toàn bộ API.

### 7. Giờ công (`timesheets`)
- Nhân sự đã liên kết tài khoản khai giờ theo tuần và chỉ chọn các task đang được giao. Mỗi dòng luôn gắn với một task; không có dòng “việc chung”.
- Có thể lưu nháp, chép tuần trước hoặc nộp duyệt. Dòng đã nộp, duyệt hay khóa chỉ sửa lại sau khi được trả về hoặc được duyệt mở khóa.
- Luồng duyệt không cho tự duyệt: Leader duyệt nhân viên, Quản lý cấp trung duyệt Leader, Giám đốc duyệt Quản lý. Giờ OT chỉ được khai khi có phiếu OT đã duyệt.
- Trang có đối chiếu giờ khai với dữ liệu chấm công nhập từ nguồn, kiểm tra bất thường, lịch sử mở khóa và bảng phân bổ giờ theo kỳ.

### 8. Tài chính (`finance`)
- Gồm các tab Ngân sách & chi phí, Đề nghị chi & tạm ứng, Hợp đồng & mốc thanh toán, Công nợ phải thu, Dòng tiền công ty, Sản lượng tháng và Chỉ tiêu & dữ liệu chuyển tiếp.
- Ngân sách có phiên bản và đủ 9 nhóm; luồng QL lập → Kế toán trưởng xác nhận → Giám đốc duyệt. Chi phí thực tế và đã cam kết được so với ngưỡng cảnh báo đã cấu hình.
- Đề nghị chi, tạm ứng và thuê ngoài đi qua luồng duyệt theo vai trò, hạn mức và ngân sách còn lại. Phiếu chi, hóa đơn điện tử và tiền về được nhập từ dữ liệu xuất của phần mềm kế toán; cùng `externalId` sẽ cập nhật bản ghi cũ thay vì cộng đôi.
- Mốc thanh toán chỉ cho lập ĐNTT khi đạt điều kiện từ tiến độ. Công nợ, tuổi nợ và dự báo dòng tiền 6 tháng lấy từ các bản ghi đã liên kết; không tự tạo số tiền mẫu.

### 9. Phân quyền (`permissions`)
- Vai trò được gán theo từng dự án: Nhân viên, Leader, Quản lý cấp trung, Kế toán viên/HCNS, Kế toán trưởng và Giám đốc. Một tài khoản có thể mang vai trò khác nhau ở các dự án khác nhau.
- Ma trận dùng các ký hiệu `X` (Xem), `L` (Lập/đề xuất), `S` (Sửa), `XN` (Xác nhận), `D` (Duyệt), `—` (Không truy cập). Khi sửa, bấm vào ô để chọn một hoặc nhiều quyền; cột Ghi chú cho phép nhập tối đa 1.000 ký tự cho từng dòng.
- Chỉ Giám đốc/Quản trị được sửa ma trận, gán vai trò dự án và cấu hình tham số chung. Chế độ “Xem thử vai trò” chỉ thay đổi cách hiển thị và luôn ở trạng thái chỉ đọc.
- Các tab còn lại quản lý hạn mức/ngưỡng cảnh báo, đơn giá chuẩn, mẫu dự án, danh mục thủ tục và nhật ký thay đổi trước/sau.

### 10. Từ điển (`dictionary`)
- Trình bày 63 chỉ tiêu và 12 quy tắc nghiệp vụ dùng chung cho tiến độ, giờ công, tài chính và nhân lực.
- Có tìm kiếm/lọc để tra tên, ý nghĩa, công thức, nguồn dữ liệu và vai trò được xem. Các ví dụ trong từ điển chỉ minh họa cách tính, không ghi vào dữ liệu dự án.

---

## 🎨 THIẾT KẾ GIAO DIỆN (UI/UX)
- Hỗ trợ **Light Mode & Dark Mode** (nút bật tắt Mặt Trời / Mặt Trăng ở Header, tự lưu vào bộ nhớ máy).
- Thiết kế bo tròn hiện đại `border-radius: 12px - 16px`, hiệu ứng bóng mờ cao cấp.
- Sidebar tự thu gọn (Collapse) dạng icon trên Desktop và mở dạng Drawer trượt trên Mobile/Tablet.
- Logo APS được dùng thống nhất ở màn hình đăng nhập, sidebar và trang tài khoản; màn hình đăng nhập có bố cục riêng cho cổng nội bộ.

---

## GHI CHÚ VẬN HÀNH: GIỜ DỰ KIẾN VÀ TIẾN ĐỘ TASK

- Trường **Giờ/ngày dự kiến** là số giờ dự kiến làm trong từng ngày của task. Tổng thời gian dự kiến hiển thị = số ngày lịch × giờ/ngày. Ví dụ task 4 ngày, 5 giờ/ngày sẽ hiện 20 giờ tổng.
- Có thể sửa ngày bắt đầu, ngày kết thúc, số ngày và giờ/ngày trong cửa sổ **Chỉnh thời gian công việc** trên trang Gantt. Ngày của task phải nằm trong thời gian dự án.
- Sau khi lưu, Gantt và task được giao được đồng bộ qua API. Nếu giao diện báo lưu thành công nhưng số giờ chưa đổi, tải lại trang để lấy dữ liệu mới; nếu vừa cập nhật mã backend, khởi động lại backend để Node nạp mã mới.
- Tiến độ tính theo giờ làm thực tế của nhân sự trên task đang chọn. Nhân sự cần vào công trường và chọn task để bắt đầu ghi thời gian; nút **Tạm nghỉ** dừng tính giờ task đến khi nhấn **Tiếp tục**. Khi chuyển sang task khác, thời gian được ghi cho task đang chọn, không chạy đồng thời trên các task còn lại.
- Khi xóa dự án, các task và hạng mục Gantt thuộc dự án bị xóa theo; các số liệu tổng quan được tính lại từ dữ liệu dự án/task hiện có.

Chi tiết luồng dữ liệu, tên trường lưu và vị trí mã nguồn được ghi trong [ARCHITECTURE.md](ARCHITECTURE.md), mục **Quy tắc nghiệp vụ và đồng bộ dữ liệu**.

### Theo dõi số giờ chậm

- Khi task dùng quá tổng số giờ dự kiến, nhãn Gantt và task hiển thị **Chậm trễ** cùng số giờ vượt.
- Sau ngày kết thúc dự kiến, nhãn chuyển thành **Quá hạn** và số giờ tính từ 00:00 ngày tiếp theo. Khi hoàn thành task, thời điểm hoàn tất và tổng giờ trễ được lưu để các trang tiếp tục hiển thị cùng kết quả.
- Bảng Gantt bên trái hiển thị tổng số ngày dự án ở hàng tên dự án; trạng thái task dùng xanh lá cho hoàn thành, vàng cho chậm trễ và đỏ cho quá hạn.
- Đường liên kết FS trên Gantt có nhánh cong và mũi tên chỉ vào task kế tiếp; các task cùng phụ thuộc vào một task trước dùng chung trục rồi tách nhánh trong khoảng trống cạnh các hàng.
- Đường được đặt sát mép thanh và chữ nhãn có viền màu nền để đường phụ thuộc không làm mất độ rõ của tên task/người nhận việc.

### GHI CHÚ CẬP NHẬT GIAO DIỆN & GANTT (UI/UX LÀM SẠCH HƠN)

- Khi bật popup như tạo task, tạo dự án, đăng ký OT, cửa sổ modal hiển thị trên nền mờ nhẹ để không tạo cảm giác “màn xám phủ kín” quá nặng.
- Tất cả modal đều khóa scroll của body khi mở để tránh nền phía sau bị cuộn ngang hoặc tạo khoảng trắng/line kẻ không cần thiết.
- Đường liên kết phụ thuộc trên Gantt đã được tối ưu để đi mềm, rõ ràng và có nhánh lệch trái theo kiểu ma trận dự án thực tế. Không còn đường đè lên task bar quá mức.
- Mũi tên dependency được đặt sát mép ô đích, không chui vào bên trong bar task. Điều này giúp dễ nhìn và tránh che chữ / màu của task.
- Khi rê chuột vào đường phụ thuộc, đường và mũi tên đổi màu đỏ, đồng thời task nguồn và task đích liên quan cũng sáng đỏ để người dùng biết rõ “nối tới task nào”.
- Mục tiêu của việc chỉnh này là làm Gantt trở nên dễ đọc hơn cho người quản lý, không rối mắt như các đường phụ thuộc minh họa cũ.n có viền màu nền để đường phụ thuộc không làm mất độ rõ của tên task/người nhận việc.- Ở hàng dự án, cột **Ngày** là tổng ngày của dự án và cột **Thời gian** là tổng giờ dự kiến của các task; mỗi hàng task hiển thị giờ dự kiến riêng.
- Task hoàn tất trễ có trạng thái vàng **Hoàn thành muộn**. Nhãn Gantt và các trang liên quan ghi độ trễ như `Trễ 1h30` (ví dụ dự kiến 15h, thực tế 16h30).
- Task hoàn tất sớm lưu `earlyHours` trên task và Gantt item. Khi có thời gian làm thực tế, các trang Gantt, Phân công và Dashboard hiển thị **Hoàn thành sớm · Sớm 1h30** theo số giờ dự kiến trừ số giờ đã ghi nhận. Giờ thực tế lấy từ phiên làm task tại công trường; nghỉ, chuyển task và checkout sẽ đóng phiên hiện tại.
- Phần tiến độ đã thực hiện trên thanh Gantt có màu xanh lá và tăng theo phần trăm; màu trạng thái xanh/vàng/đỏ/xám vẫn phân biệt hoàn thành đúng hạn hoặc sớm, trễ, quá hạn và chưa bắt đầu.

### Thanh thao tác và vùng cuộn cố định

- Trang Phân công gộp tab, tìm task và nút tạo task trên một thanh sticky toàn chiều ngang bên dưới header; thanh ngoài phẳng, riêng ô tìm kiếm có bo góc.
- Footer bản quyền được hiển thị ở cuối khung ứng dụng dùng chung.
- Gantt giữ header cột trong vùng cuộn nội bộ, có cột trái đóng băng; chiều cao vùng biểu đồ căn theo viewport để header cột luôn hiện khi xem danh sách task.

### Cập nhật giao diện và nhật ký dữ liệu

- Trên trang Phân công, thao tác điều hướng sang phân hệ tiến độ dự án mở trang Gantt; nút tạo task riêng trên thanh công cụ đã được bỏ, việc tạo/chỉnh sửa task tiếp tục thực hiện ở các luồng hiện có.
- Các bộ chọn ngày/tháng và khung lịch được cố định kích thước để không co giãn khi đổi ngày hoặc tháng. Thanh cuộn dọc của trang luôn được giữ ổn định.
- Trang Nhật ký hoạt động chỉ trình bày các sự kiện dữ liệu quan trọng, phân trang 50 sự kiện mỗi trang; bộ lọc tác động lên toàn bộ dữ liệu phù hợp và CSV xuất toàn bộ kết quả lọc. Dữ liệu nhật ký cũ không bị tự động xóa; các sự kiện ngoài danh sách quan trọng chỉ được ẩn khỏi giao diện.
- `backend/data/seed.json` được giữ lại làm dữ liệu fallback khi khởi tạo/khôi phục cơ sở dữ liệu; không xóa file seed khi dọn dữ liệu đang chạy.
- Các trường phase cũ không còn dùng đã được gỡ khỏi một số task trong `backend/data/db.json` theo xác nhận; không áp dụng việc dọn này lên `seed.json`.

### Ca chuẩn và tăng ca trên thẻ nhân sự

- Bấm **Ca chuẩn** hoặc **Tăng ca (OT)** để xem task của đúng nhân sự và ngày đang chọn. Task tăng ca lấy từ các phiếu OT đã duyệt; cùng một task có thể xuất hiện ở cả hai ca nếu được phân công và đăng ký OT.
- Chọn task rồi bấm **Vào công trường** cho ca chuẩn hoặc **Tăng ca** (nút vàng) cho ca OT. OT chỉ bắt đầu từ **18:00 thứ Hai–thứ Sáu**, **13:30 thứ Bảy**, theo giờ Việt Nam; bấm sớm sẽ báo chưa tới giờ. Chủ nhật chưa mở ca OT.
- **Tạm nghỉ / Tiếp tục** dừng và tiếp tục ghi giờ task. **Rời văn phòng** kết thúc ca OT và cảnh báo nếu chưa đủ số giờ OT đã duyệt, đã trừ thời gian nghỉ. Ca chuẩn dùng định mức giờ/ngày riêng của nhân sự.
- Xem ngày trước/sau chỉ đổi danh sách task; vào ca và chọn task áp dụng cho hôm nay. Muốn làm ca khác cần kết thúc ca hiện tại. Backend cũng kiểm tra loại ca và mốc giờ.
- Giờ task được đồng bộ sang Gantt, lưu loại ca trong từng đoạn giờ làm; dữ liệu liên quan được tải lại sau thao tác ca. Kiểm thử bằng `cd backend` rồi `npm.cmd test` (dùng dữ liệu giả trong bộ nhớ).
- Khi cập nhật mã, khởi động lại backend đang chạy từ `start-all.bat`, rồi tải lại trang web.

## Ghi chu cap nhat Gantt (tong hop thay doi 06-07/10/2026)

- Bang Gantt co bo loc an/hien cot, cot ngay tao chi hien ngay thang nam, cac cot duoc can thang hang va co the thu hep vung bang de mo rong bieu do.
- Cac cot Cong HD, Cong TT va Ghi chu duoc luu theo hang; Cong TT tong hop tu cac task con va khong tinh lap task cha.
- Tong cong du kien tren trang chi tiet du an lay theo tong cong tren hang du an Gantt; so nguoi tham gia chi tinh nhan su dang duoc gan cho du an, khong tinh nguoi da xoa.
- Co the tao task nhanh tu o STT. Task con nam long trong task cha, co the thu gon/mo rong; toan bo chu tren hang task con va nhan ben thanh Gantt hien mau cam dam. Ty trong task con duoc phan bo theo cong du kien va lam tron 0,1% sao cho tong hien thi bang ty trong task cha; hang cha luon hien tong nay.
- Khi task cha dang mo, chi ve cac thanh Gantt cua task con; khi thu gon, cac thanh con duoc thay bang mot thanh tong cua task cha. Lien ket FS da gan voi task cha duoc chuyen diem hien thi sang task con dau/cuoi trong luc mo va tro lai thanh cha khi thu gon, khong doi du lieu lien ket.
- Khi thu gon giai doan, thanh Gantt tong bao phu khoang ngay cua cac task con va tien do duoc ghep theo tung ngay; lien ket FS van tro toi thanh tong dang hien.
- Menu ba cham cua muc cong viec co chuc nang tao muc moi ngay sau muc dang chon, giu nguyen du an/giai doan va cac hang con cua muc cu.
- O ngay bat dau va ngay ket thuc trong form tao task/muc duoc chinh doc lap; so ngay cap nhat theo hai moc va form kiem tra khoang ngay truoc khi luu.
- Modal khong lam toi hoac lam mo nen trang; thao tac modal van khoa cuon body trong khi mo.
- Modal Gantt duoc portal truc tiep vao `document.body` de vi tri giua man hinh khong bi anh huong boi transform/cuon ngang cua `.app-shell`; body van duoc khoa cuon khi modal mo.
- Cot Ghi chu cho phep sua tren task, giai doan va muc cong viec. Ghi chu cua hang giai doan/muc duoc luu tren Gantt item qua `updateGanttItem` va tai lai tu API.
- Khi co task chen giua hai task cung cap co cung ngay bat dau/ket thuc, bieu do van hien lien ket truc tiep giua hai task ngoai, dong thoi giu cac lien ket FS tuan tu qua task chen giua.
- Duong FS co the tao bang cach keo cham tron. Nhan chuot phai vao duong va chon Xoa lien ket se luu `suppressedDependencies` tren task dich de ca lien ket thu cong va lien ket tu sinh khong xuat hien lai; keo noi lai se bo trang thai an cua cap task do.
- O trang Gantt, an thanh cuon doc cua trang khi Gantt dang mo de chi con mot thanh cuon doc ben trong bang/timeline; tu dong khoi phuc thanh cuon trang khi roi Gantt.
- Trang thai tich/bo tich tung cot trong bo loc Gantt duoc luu vao `localStorage` va nap lai khi quay ve trang.
- Phan cong Gantt cho phep cung mot nhan su co nhieu khoang dam nhan; backend doc/luu rieng tung lan theo thu tu. O Chinh thoi gian cong viec co them truong sua ten task va dong bo ten sang task lien ket.
- Cong TT tren Gantt tinh theo gio phan cong chia cho 8 gio/cong, bao gom ca cong tong tren hang nhom va du an; vi du 4 gio/ngay duoc tinh la 0.5 cong/ngay.
