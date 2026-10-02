# HỆ THỐNG QUẢN LÝ DỰ ÁN XÂY DỰNG & NHÂN SỰ CÔNG TRƯỜNG - APS VIỆT NAM

> **Dự án phát triển cho:** Công ty Giải Pháp Châu Á Thái Bình Dương Việt Nam (APS Việt Nam)  
> **Người phụ trách:** Chuyên viên IT Nội Bộ (Phần Cứng & Hạ Tầng)  
> **Phiên bản:** 1.0.0 Production Ready  
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

### 4. Phân hệ Thống Kê & Báo Cáo Hiệu Suất (`/dashboard`)
- Thống kê tỷ lệ hoàn thành dự án, công việc quá hạn/chậm trễ.
- Bảng tổng hợp chi tiết: Tên dự án, công việc trong dự án, nhân viên đảm nhận, thời gian hoàn thành.
- Bảng xếp hạng năng suất và giờ cống hiến của từng nhân sự.

---

## 🎨 THIẾT KẾ GIAO DIỆN (UI/UX)
- Hỗ trợ **Light Mode & Dark Mode** (nút bật tắt Mặt Trời / Mặt Trăng ở Header, tự lưu vào bộ nhớ máy).
- Thiết kế bo tròn hiện đại `border-radius: 12px - 16px`, hiệu ứng bóng mờ cao cấp.
- Sidebar tự thu gọn (Collapse) dạng icon trên Desktop và mở dạng Drawer trượt trên Mobile/Tablet.

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
- Footer bản quyền được bỏ khỏi giao diện dùng chung.
- Gantt giữ header cột trong vùng cuộn nội bộ, có cột trái đóng băng; chiều cao vùng biểu đồ căn theo viewport để header cột luôn hiện khi xem danh sách task.
