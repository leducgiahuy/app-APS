# TÀI LIỆU KIẾN TRÚC MÃ NGUỒN (ARCHITECTURE GUIDE)
### DÀNH CHO IT NỘI BỘ - CÔNG TY APS VIỆT NAM

Tài liệu này được tạo ra để giúp bạn (chuyên viên IT phần cứng) có thể hiểu ngay cấu trúc mã nguồn, vị trí các file điều khiển từng phần trên giao diện web mà **không cần mất thời gian rà soát từng dòng code**.

---

## 📁 1. SƠ ĐỒ THƯ MỤC TỔNG THỂ & VỊ TRÍ GIAO DIỆN

```text
aps-project-manager/
├── backend/                              # [MÁY CHỦ DỮ LIỆU & API]
│   ├── data/
│   │   └── db.json                       # ⭐ Nơi lưu trữ dữ liệu (Dự án, Nhân sự, Task, Gantt, OT)
│   ├── src/
│   │   ├── controllers/                  # Bộ xử lý nghiệp vụ cho từng phân hệ
│   │   │   ├── hrController.js           # -> Xử lý điểm danh, thêm/xóa nhân sự, đếm task
│   │   │   ├── taskController.js         # -> Xử lý phân công task & duyệt ca tăng ca (OT)
│   │   │   ├── projectController.js      # -> Xử lý tạo dự án & các thanh tiến độ Gantt
│   │   │   └── statsController.js        # -> Tính toán KPI & báo cáo hiệu suất
│   │   ├── models/
│   │   │   └── db.js                     # -> Đọc và ghi file db.json an toàn
│   │   ├── routes/
│   │   │   └── api.js                    # -> Định tuyến toàn bộ API endpoints
│   │   └── server.js                     # -> File khởi động máy chủ Express (Port 5000)
│   └── package.json
│
├── frontend/                             # [GIAO DIỆN NGƯỜI DÙNG WEB]
│   ├── src/
│   │   ├── components/layout/            # Các khối khung giao diện chung
│   │   │   ├── Sidebar.jsx               # -> Thanh menu bên trái (Logo APS, menu 4 trang, nút thu gọn)
│   │   │   ├── Header.jsx                # -> Thanh trên cùng (Đồng hồ số real-time, chọn ngày, đổi Dark/Light mode)
│   │   │   └── Toast.jsx                 # -> Khung pop-up thông báo thành công / lỗi
│   │   │
│   │   ├── modules/                      # ⭐ CÁC TRANG NỘI DUNG CHÍNH (THEO YÊU CẦU CỦA BẠN)
│   │   │   ├── hr/
│   │   │   │   └── HRPage.jsx            # -> TRANG 1: Quản lý nhân sự, On-site, số task dưới tên, giờ chuẩn
│   │   │   ├── tasks/
│   │   │   │   └── TasksPage.jsx         # -> TRANG 2: Phân công công việc & Đăng ký tăng ca (2 mục rõ rệt)
│   │   │   ├── gantt/
│   │   │   │   └── GanttPage.jsx         # -> TRANG 3: Biểu đồ Gantt thực tế (Cột đóng băng, mũi tên FS, dải nghỉ lễ)
│   │   │   └── dashboard/
│   │   │       └── DashboardPage.jsx     # -> TRANG 4: Bảng thống kê chi tiết các công việc trong 1 dự án
│   │   │
│   │   ├── context/
│   │   │   └── AppContext.jsx            # -> Bộ quản lý trạng thái chung (đồng hồ, theme, gọi API)
│   │   ├── api.js                        # -> Hàm kết nối từ Frontend gọi sang Backend
│   │   ├── App.jsx                       # -> Lắp ghép khung giao diện chính
│   │   ├── index.css                     # -> Bộ style Tailwind CSS và thanh cuộn mượt
│   │   └── main.jsx                      # -> Entry point React
│   ├── tailwind.config.js                # -> Cấu hình màu sắc thương hiệu APS & Dark mode
│   └── vite.config.js                    # -> Cấu hình cổng chạy (Port 3000)
│
├── start-all.bat                         # ⭐ File kích hoạt 1-click cả Frontend và Backend trên Windows
├── ARCHITECTURE.md                       # File tài liệu này
└── README.md                             # Hướng dẫn chạy và tổng quan tính năng
```

---

## 🧭 2. BẢN ĐỒ: "MUỐN SỬA PHẦN NÀO TRÊN GIAO DIỆN THÌ SỬA Ở ĐÂU?"

| Bạn muốn thay đổi hoặc sửa... | Vào file này để chỉnh sửa |
| :--- | :--- |
| **Đổi Logo, màu menu, thêm tab mới** | `frontend/src/components/layout/Sidebar.jsx` |
| **Đồng hồ số real-time, tiêu đề trang, nút Dark/Light mode** | `frontend/src/components/layout/Header.jsx` |
| **Trang Nhân sự:** Thẻ nhân viên, số task dưới tên, định mức 8h, nút vào/ra công trường | `frontend/src/modules/hr/HRPage.jsx` |
| **Trang Phân công:** Form tạo task, mục tăng ca (OT), đánh giá sớm/chậm | `frontend/src/modules/tasks/TasksPage.jsx` |
| **Trang Tiến độ & Gantt:** Mũi tên liên kết FS, các giai đoạn Thiết kế/Pháp lý/Nghỉ lễ/Đấu thầu | `frontend/src/modules/gantt/GanttPage.jsx` |
| **Trang Thống kê:** Bảng liệt kê dự án, công việc, nhân viên, thời gian hoàn thành | `frontend/src/modules/dashboard/DashboardPage.jsx` |
| **Thêm trực tiếp dữ liệu mẫu:** Thêm nhân viên, dự án mới bằng tay | `backend/data/db.json` |

---

## 🔄 3. SƠ ĐỒ LUỒNG DỮ LIỆU (DATA FLOW)

```mermaid
flowchart TD
    User["Người dùng tại công trường APS"] -->|Tương tác trên giao diện| UI["React Components (HR, Tasks, Gantt, Dashboard)"]
    UI -->|Gửi yêu cầu hành động| Ctx["AppContext.jsx (Quản lý State & Real-time Clock)"]
    Ctx -->|Gọi API RESTful| ApiClient["api.js (HTTP Fetch)"]
    ApiClient -->|Port 5000 /api| BackendRouter["routes/api.js (Express Server)"]
    BackendRouter --> Controllers["Controllers (hr, task, project, stats)"]
    Controllers --> Storage[("backend/data/db.json\nLưu trữ dữ liệu bền vững")]
    Storage -->|Phản hồi JSON| UI
```

---

## 📋 4. DANH SÁCH ENDPOINTS CỦA BACKEND

| Phương thức | Đường dẫn API | Mô tả nghiệp vụ |
| :--- | :--- | :--- |
| `GET` | `/api/employees` | Lấy danh sách nhân sự + số task đang nhận + số giờ OT |
| `POST` | `/api/employees` | Thêm nhân sự mới (họ tên, chức danh, ca chuẩn 8h) |
| `PATCH` | `/api/employees/:id/toggle-onsite` | Bật/tắt trạng thái có mặt tại công trường (On-site) |
| `DELETE` | `/api/employees/:id` | Xóa nhân sự |
| `GET` | `/api/tasks` | Lấy danh sách phân công công việc & danh sách tăng ca |
| `POST` | `/api/tasks` | Phân công task mới cho nhân viên trong dự án |
| `PATCH` | `/api/tasks/:id` | Cập nhật tiến độ %, tình trạng làm sớm hay chậm |
| `DELETE` | `/api/tasks/:id` | Xóa công việc khỏi danh sách |
| `POST` | `/api/overtimes` | Đăng ký ca làm việc tăng ca (OT) cho công việc gấp |
| `GET` | `/api/gantt` | Lấy danh sách WBS và các thanh tiến độ Gantt |
| `POST` | `/api/gantt` | Thêm công việc vào tiến độ dự án (tự động phân cấp WBS như A1.3 sau A1.2) |
| `PATCH` | `/api/gantt/:id/move` | Di chuyển vị trí công việc lên trên (up) hoặc xuống dưới (down) |
| `DELETE` | `/api/gantt/:id` | Xóa công việc khỏi biểu đồ Gantt |
| `GET` | `/api/projects` | Lấy danh sách dự án xây dựng |
| `POST` | `/api/projects` | Tạo dự án mới |
| `GET` | `/api/stats` | Tổng hợp thống kê chi tiết toàn bộ dự án |

---

## 🛠️ 5. GHI CHÚ BẢO TRÌ DÀNH CHO IT NỘI BỘ
1. **Dữ liệu được lưu ở đâu?** Toàn bộ dữ liệu nằm gọn trong file `backend/data/db.json`. Khi cần sao lưu hoặc chuyển đổi sang máy khác, bạn chỉ cần copy file này.
2. **Nâng cấp Cơ sở dữ liệu sau này:** Nếu công ty muốn chuyển sang dùng SQL Server, PostgreSQL hoặc MySQL, bạn chỉ cần thay thế hàm đọc/ghi trong file `backend/src/models/db.js`, còn toàn bộ giao diện Frontend giữ nguyên 100%.
3. **Mạng nội bộ công trường (LAN/Wi-Fi):** Cả máy chủ Backend và Frontend đều đã được mở cờ `--host` (`host: true`), các đồng nghiệp cùng bắt mạng Wi-Fi tại công trường có thể nhập trực tiếp địa chỉ IP của máy bạn (ví dụ: `http://192.168.100.81:3000`) để truy cập ngay lập tức!
