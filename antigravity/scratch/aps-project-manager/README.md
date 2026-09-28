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
