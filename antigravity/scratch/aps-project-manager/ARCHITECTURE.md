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
3. **Mạng nội bộ công trường (LAN/Wi-Fi):** Cả máy chủ Backend và Frontend đều đã đ

## 6. CẬP NHẬT GIAO DIỆN & HÀNH VI MODAL / GANTT

### 6.1 Modal overlay và nền mờ
- Modal được thiết kế để phủ lên nền mà không tạo cảm giác xám đen quá nặng.
- Mục tiêu là giữ lại tầm nhìn tổng quát của màn hình, nhưng vẫn nhấn mạnh khung modal đang hoạt động.
- Khi mở modal, body scroll bị khóa để không xuất hiện phần cuộn ngang nền hay layout bị lệch khi thao tác ở paging area.

### 6.2 Gantt dependency route
- Các liên kết Finish-to-Start (FS) trong Gantt được vẽ theo style mềm, cong và đi lệch trái, không chạy cắt thẳng qua nội dung task.
- Nền đường phụ thuộc được giữ tối thiểu để không chen vào các bar và chữ trên task.
- Mũi tên được đặt sát cạnh task đích, không nằm trong ô task để tránh che chữ hoặc làm rối nhận diện.

### 6.3 Hover highlight và mapping task
- Khi user hover vào một dependency line, hàm `onMouseEnter`/`onMouseLeave` sẽ đánh dấu đường đó là `hoveredDependencyKey`.
- Task nguồn và task đích tương ứng sẽ được highlight bằng đường viền đỏ để trực quan hóa đúng đường nối nào liên kết hai task.
- Cơ chế này giúp người quản lý nhìn ra ngay mối quan hệ ưu tiên / phụ thuộc trong tiến độ công trình.

### 6.4 Kết luận UI
- Bản thân Gantt không chỉ là biểu đồ thời gian, mà còn là hệ thống “thông tin phụ thuộc” giữa các task.
- Vì vậy việc nhìn sạch, không chồng lấn và có highlight khi hover rất quan trọng để tăng độ tin cậy cho người dùng khi điều phối công việc thực tế.
ược mở cờ `--host` (`host: true`), các đồng nghiệp cùng bắt mạng Wi-Fi tại công trường có thể nhập trực tiếp địa chỉ IP của máy bạn (ví dụ: `http://192.168.100.81:3000`) để truy cập ngay lập tức!

---

## 6. QUY TẮC NGHIỆP VỤ VÀ ĐỒNG BỘ DỮ LIỆU

### Dự án, task và Gantt

- Dự án có `startDate` và `endDate`. Khi tạo hoặc sửa ngày task, cả giao diện và `projectController.js` kiểm tra task nằm trong khoảng ngày của dự án. Backend là lớp kiểm tra cuối cùng; khi sai khoảng, API trả lỗi và không lưu task.
- Một task được tạo từ Gantt được ghi thành hai bản ghi: `ganttItems[]` để vẽ biểu đồ và `tasks[]` để phân công, chấm công và theo dõi tiến độ. Hai bản ghi nối nhau bằng `ganttId` (ID của Gantt item). Khi không có liên kết ID ở dữ liệu cũ, một số luồng còn đối chiếu tên task và dự án.
- `estimatedDays`/`days` là số ngày lịch, tính bao gồm cả ngày đầu và ngày cuối. `estimatedHoursPerDay` là số giờ dự kiến làm trong mỗi ngày; `estimatedHours` là tổng giờ dự kiến = số ngày × giờ/ngày. Ví dụ 02/10–05/10 và 5 giờ/ngày tương ứng 4 ngày, 20 giờ tổng.
- Khi sửa thời gian task trong Gantt, `PATCH /api/gantt/:id` cập nhật ngày và giờ/ngày ở bản ghi Gantt, tính lại tổng giờ, đồng bộ task được giao, rồi ghi `backend/data/db.json`. API chỉ trả thành công sau khi ghi file thành công. `getGanttItems` và `GET /api/tasks` là các nguồn tải lại dữ liệu cho biểu đồ và danh sách phân công.
- Các task tiếp theo cùng dự án có thể được dịch ngày khi ngày kết thúc task hiện tại thay đổi để giữ khoảng cách trong kế hoạch; task có quan hệ phụ thuộc FS cũng được dịch theo. Khi thay đổi lịch, giờ tổng của từng task phụ thuộc vào giờ/ngày đã lưu và số ngày mới.
- Thanh tiến độ task được tính từ các phiên làm việc thực tế, không chỉ từ ngày tạo task. Việc chấm dứt ca/hoàn tất task được ghi về `tasks[]` và đồng bộ tiến độ sang Gantt item liên kết.

### Ca làm, tạm nghỉ và tiến độ theo nhân sự

- Trạng thái ca của nhân sự nằm trên bản ghi employee: `isOnSite`, `checkInAt`, `isOnBreak`, `breakStartedAt`, `totalBreakMs`, `activeTaskId` và `workSessionStartedAt`.
- Nhấn **Vào công trường** tạo thời điểm bắt đầu ca. Nhân sự chọn task đang làm bằng `activeTaskId`; thời gian tiến độ chỉ cộng vào task đang chọn và chỉ khi nhân sự đang ở công trường, không tạm nghỉ, task còn hiệu lực trong ngày.
- Chuyển sang task khác đóng phiên làm việc của task trước và mở phiên cho task mới. Vì vậy, một nhân sự không cộng thời gian đồng thời vào nhiều task.
- **Tạm nghỉ** chốt phiên task đang chạy và bắt đầu tính khoảng nghỉ. **Tiếp tục** cộng khoảng nghỉ vào `totalBreakMs`, rồi mở phiên mới cho task đang chọn. Khi rời công trường, phiên đang chạy được chốt và trạng thái ca được đóng.
- `actualWorkHours` lưu tổng thời gian làm thực tế cho task. Phần trăm tiến độ dựa trên giờ thực tế so với `estimatedHours`; do mỗi nhân sự/task có giờ dự kiến và thời điểm vào ca riêng, tiến độ của các task có thể khác nhau dù cùng ngày giao.
- Khi hoàn tất task, tiến độ đặt thành 100% và nhãn sớm/đúng hạn/trễ được xác định theo thời điểm hoàn tất so với hạn dự kiến. Thẻ task trong danh sách được giao hiển thị giờ/ngày và tổng giờ từ dữ liệu task.

### File thường cần xem khi thay đổi nghiệp vụ

| Nội dung | File chính |
| --- | --- |
| Form, thanh tiến độ, trạng thái hoàn thành và lọc task | `frontend/src/modules/tasks/TasksPage.jsx` |
| Gantt, form giờ/ngày, ngày dự án, thu gọn dự án và chỉnh thời gian task | `frontend/src/modules/gantt/GanttPage.jsx` |
| Thẻ nhân sự, vào/rời công trường, chọn task và tạm nghỉ | `frontend/src/modules/hr/HRPage.jsx` |
| Quy tắc ca, phiên làm việc, nghỉ và thời gian thực tế | `backend/src/controllers/hrController.js`, `backend/src/controllers/taskController.js` |
| Tạo/sửa dự án, task Gantt và đồng bộ sang task được giao | `backend/src/controllers/projectController.js` |
| Đọc/ghi dữ liệu JSON | `backend/src/models/db.js`, `backend/data/db.json` |
| Endpoint API | `backend/src/routes/api.js`; client gọi API ở `frontend/src/api.js` |

### Trạng thái trễ và thời lượng dự án trên Gantt

- Task hoàn thành lưu `completedAt`, `actualWorkHours`, `delayHours` và `speedStatus`; các giá trị liên quan được ghi sang Gantt item có cùng `ganttId`.
- `delayHours` là số trễ lớn hơn giữa (a) giờ làm thực tế vượt tổng `estimatedHours` và (b) số giờ kể từ 00:00 ngày sau `endDate` đến lúc hoàn tất. Với task chưa hoàn tất, phần này được tính động từ giờ làm đã ghi + phiên hiện tại hoặc số giờ sau hạn. Vì vậy, vượt quỹ giờ trước hạn hiển thị **Chậm trễ**; qua ngày kết thúc hiển thị **Quá hạn**.
- Hàm dùng chung `taskDelayHours` và `formatDelayHours` ở `frontend/src/utils/date.js` cung cấp cùng cách tính/định dạng cho Gantt, trang phân công và dashboard. Gantt hiển thị nhãn giờ trễ sát tên người đảm nhận; task đã hoàn tất giữ số giờ trễ đã lưu để không thay đổi theo thời gian.
- Bảng thông tin bên trái Gantt có thêm cột **Thời gian dự án** (số ngày lịch tính cả hai đầu mút ngày) trên hàng tiêu đề dự án và cột **Trạng thái** trên từng task. Task hoàn thành màu xanh, đang chậm nhưng chưa qua ngày hạn màu vàng, quá hạn màu đỏ. Nhóm WBS và ngày nghỉ không nhận nhãn trạng thái task.
- Khi đổi ngày/giờ dự kiến, nhớ đồng bộ task và Gantt trong `projectController.js`; khi thay đổi cách ghi nhận phiên làm hoặc hoàn thành, đồng bộ metadata ở `taskController.js` và các route chấm công trong `hrController.js`. Tránh tạo cách tính delay riêng từng trang.
- Đường phụ thuộc FS được dựng trong `GanttPage.jsx` từ cuối thanh task trước đến đầu thanh task sau. Các task kế tiếp dùng chung thân dọc, rồi nhánh cong có mũi tên vào từng thanh; đường có viền sáng, đi qua khoảng trống cạnh hàng task và được vẽ dưới thanh/nhãn để tránh đè nội dung.
- Hàng tên dự án trên bảng trái hiển thị tổng ngày lịch của dự án ở cột **Ngày** và tổng `estimatedHours` của task dự án ở cột **Thời gian**; từng hàng task hiển thị tổng giờ của riêng task. Hạng mục Gantt không có task liên kết được cộng bổ sung, còn nhóm WBS/ngày nghỉ không tính vào tổng giờ.
- Task hoàn tất muộn được phân biệt với task đang trễ: trạng thái là **Hoàn thành muộn** màu vàng và dùng `delayHours` đã lưu. Ví dụ dự kiến 15h, thực tế 16.5h thì hiển thị **Trễ 1h30**. Nhãn và badge dùng chung `formatDelayHours` để giữ định dạng nhất quán giữa Gantt, phân công và dashboard.
- Task hoàn tất sớm lưu `earlyHours` cùng `speedStatus: 'early'` trên task và Gantt item. `earlyHours` được tính bằng `estimatedHours - actualWorkHours` khi đã ghi nhận giờ làm thực tế và task không bị trễ; Gantt, bảng phân công và dashboard dùng chung cách định dạng giờ để hiển thị **Hoàn thành sớm · Sớm 1h30**. Thời gian làm thực tế được cộng từ các phiên chọn task tại công trường và dừng khi tạm nghỉ, đổi task hoặc checkout.
- Phần đã làm của thanh Gantt chuyển màu xanh lá trong khi phần nền vẫn thể hiện lịch dự kiến; độ dài phần xanh theo phần trăm tiến độ và có chuyển động CSS. Task hoàn thành đúng hạn/sớm dùng xanh lá; hoàn thành muộn/chậm dùng vàng; quá hạn dùng đỏ.
- Thanh task trên Gantt dùng cùng màu với trạng thái: xanh dương đang làm, đỏ quá hạn, xanh lá hoàn thành, vàng hoàn thành muộn/chậm trễ, xám chưa bắt đầu.

### Thanh thao tác và vùng cuộn cố định

- Trang Phân công ghép tab, ô tìm task và nút tạo task vào một thanh sticky ngay dưới Header, kéo hết chiều ngang vùng nội dung. Thanh ngoài bỏ bo góc; ô tìm kiếm giữ bo góc riêng để dễ nhận diện.
- Footer bản quyền được gỡ khỏi layout dùng chung trong App.jsx nên không còn hiện trên các trang.
- Gantt dùng vùng cuộn nội bộ cao theo viewport. Header cột sticky bên trong vùng này; cột trái đóng băng khi cuộn ngang, còn bảng và biểu đồ cuộn dọc/ngang cùng nhau.
