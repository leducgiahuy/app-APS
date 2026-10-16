# Frontend APS Project Manager

Frontend dùng React và Vite, chạy mặc định tại `http://localhost:3000`. Backend API chạy tại `http://localhost:5000/api`.

## Lệnh thường dùng

```powershell
npm install
npm run dev
npm run build
npm run lint
```

`npm run build` tạo `dist`; `node_modules` và `dist` không phải dữ liệu nghiệp vụ và không đưa lên Git.

## Điểm vào và cấu trúc trang

- `src/App.jsx`: kiểm tra phiên giao diện, dựng layout và lazy-load Gantt cùng bốn trang vận hành.
- `src/context/AppContext.jsx`: tải dữ liệu dùng chung của các API cũ và giữ tab/dự án đang chọn.
- `src/components/layout`: Header, Sidebar, modal và toast dùng chung.
- `src/modules/gantt`: Tiến độ compact, hồ sơ pháp lý, yêu cầu thay đổi, chốt sản lượng và drawer chi tiết.
- `src/modules/dashboard`: Dashboard theo vai trò và báo cáo mỗi dự án một dòng.
- `src/modules/operations`: Giờ công, Tài chính, Phân quyền, Từ điển cùng khung `OperationsCommon`.
- `src/modules/workload`: phân bổ nhân sự theo ngày/tháng/năm và dự báo sáu tháng/tuyển dụng.
- `src/styles/typography.css`: Be Vietnam Pro và token cỡ chữ dùng chung.

## Quyền và dữ liệu

Phiên giao diện cũ quyết định việc vào ứng dụng. Các module Gantt nâng cấp, Dashboard điều hành và Operations còn dùng phiên delivery để gọi `/api/delivery/*`; backend mới là nơi quyết định quyền ghi và lọc trường tài chính. “Xem thử vai trò” chỉ để kiểm tra giao diện, luôn chỉ đọc và không thay quyền thật.

Không ghi số tổng trực tiếp trong component. Các trang phải lấy dữ liệu từ API: giờ đã duyệt, % ghi nhận, ngân sách, chứng từ và tiền về được tổng hợp ở backend. Khi mutation trả lỗi revision/xung đột, giữ nội dung người dùng đang nhập và tải lại dữ liệu trước khi lưu tiếp.

## Cuộn và bố cục

Trang Gantt có vùng cuộn dọc riêng và thanh cuộn ngang cố định ở đáy. Header tháng, header cột và thân bảng phải dùng cùng cấu hình chiều rộng. Các trang Giờ công, Tài chính, Phân quyền và Từ điển dùng `OperationsPage.css`; tránh tạo bộ font/cỡ chữ riêng ngoài token dùng chung.

Kiểm thử giao diện cô lập nằm trong `frontend/tests`. Các fixture dùng dữ liệu giả trong bộ nhớ và không được gọi API hoặc ghi cơ sở dữ liệu thật.
