# Database storage

## Workforce forecast and recruitment

`workforcePlan` is an optional object saved in the same external database:
`demands` (additional/pipeline hours, dates, position, probability), `settings`
(recruiting lead days per position), `recruitments` (six-stage status, posting/
joining dates, temporary arrangements and notes per position + need month), and
`taskRoles` (position mapping for otherwise unclassified task/Gantt IDs).
Existing installations default to empty lists. Include this object in backups.
Forecast values are derived from current employees, task/Gantt assignments,
progress and the shared Vietnamese calendar; no monthly snapshots are hardcoded.

Use `GET /api/workforce-plan` and `PATCH /api/workforce-plan` to read/change
individual records. Backend validation prevents invalid dates, probabilities,
statuses and negative hours. An additional demand is separate from Gantt work:
remove that demand after scheduling the same work in Gantt to avoid duplication.
Restart the backend after installing this upgrade so the new routes are loaded.

## Assignment calendar choices

Each task/Gantt assignee may store `excludeNonWorkingDays`: `true` means omit
Vietnamese holidays and Sundays from this assignment; `false` means include them.
An absent value preserves the old inclusive schedule. Save and restore this flag
along with the assignee date range. Calendar choices are applied again after date
changes; they do not store a hardcoded list of excluded dates.

`calendarAdjusted` marks task/Gantt records whose derived duration and planned
hours were recalculated. The backend normalizes these values on read/write.
Start/end dates remain the envelope, so a 23–25 range can contain two working
days. Existing work-session history is retained.

## Employee code sequence

`employeeCodeSequence` stores the highest issued employee number in the database.
New employees receive `NV-001`, `NV-002`, etc. from the server, independent of
the current employee count or any client-supplied code. Deletion never reduces
this counter. Keep it when backing up/restoring or transferring the database.

On read/write, duplicate, missing and malformed codes are repaired while valid
unique codes and employee IDs remain unchanged. The older duplicate keeps its
code based on `createdAt`, legacy timestamp IDs, or saved array order when no
timestamp exists. Historical creation order/deleted codes cannot be recovered
if the old data did not retain that information. Repairs use numbers above the
existing maximum. New records save `createdAt` for future ordering.

The backend stores live data outside the Git checkout by default:

```text
%LOCALAPPDATA%\APS Project Manager\db.json
```

On the first backend start after upgrading, it copies `backend/data/db.json` to that location if the external file does not exist. It leaves the original file in place during migration. If there is no existing database, it initializes from `backend/data/seed.json`.

Set `APS_DB_PATH` to an absolute file path to choose another location. The parent folder is created automatically. Keep the database file backed up separately from the source checkout.

`backend/data/db.json` is ignored for new Git checkouts. Since Git already tracks this file in existing checkouts, after confirming the external copy exists, remove it from the Git index once:

```powershell
git rm --cached backend/data/db.json
```

Commit that removal so future pulls stop updating the old in-repository copy. Do not run this step before verifying the external database file.

## Employee assignment synchronization (08/10/2026)

`backend/src/utils/employeeAssignments.js` removes references to missing employees from current task and Gantt assignments. `readDb()` repairs and persists old references; `writeDb()` applies the same cleanup to future writes, including employee deletion. Remaining co-assignees are retained, and legacy primary-assignee fields are updated or cleared. Employee IDs take precedence over names so a new employee with the same name does not inherit an old ID's assignments.

Tasks, project dates, progress, historical work sessions and activity logs are retained. The frontend reloads shared data after deleting an employee so Task and Gantt views update together. Restart the backend and reload the page after updating the code; existing stale assignments are repaired on the next database read.

Regression checks: `cd backend` then `npm.cmd test`. Assignment tests use a temporary database and do not modify the live database.


## Tiến độ và giao hồ sơ (12/10/2026)

`db.delivery.version = 1` là phần bổ sung; các mảng projects/tasks/ganttItems/employees cũ được giữ. `delivery.projects[projectId]` lưu revision, cấu hình hợp đồng/đơn giá, trạng thái task, chứng từ giờ đã duyệt, hồ sơ pháp lý, CR, nhận xét, bằng chứng, mốc thanh toán, tiền thu/chi, lịch sử sản lượng và kỳ chốt. `delivery.templates` chỉ sao chép cấu trúc, liên kết và khoảng ngày, không sao chép nhân sự, tiến độ, bằng chứng hay tiền.

Tệp bằng chứng tối đa 10 MB được lưu dưới `delivery-files` cạnh db.json, tên tệp vật lý là UUID. Sao lưu **cả db.json lẫn thư mục delivery-files**. Việc tải tệp đi qua API có xác thực. JSON chỉ giữ metadata, không chứa tệp base64.

Tài khoản Tiến độ mới nằm trong `delivery.users` (mật khẩu scrypt có salt). Phiên 12 giờ chỉ lưu hash token; quyền được kiểm tra lại ở mỗi request. Tài khoản demo hiện có khởi tạo quản trị lần đầu. Quản trị cấp vai trò/liên kết nhân sự trong **Tiến độ → Cấu hình**; email và mật khẩu phải khớp tài khoản đăng nhập hiện có. Các cơ chế đăng nhập và API cũ vẫn hoạt động như trước; phạm vi xác thực bổ sung này là API `/api/delivery/*`, không thay thế xác thực toàn hệ thống.

Trạng thái báo cáo, % được ghi nhận và giờ thực tế là dữ liệu riêng. Nhật ký giờ cũ nhập vào danh sách chờ duyệt; không tự coi toàn bộ giờ cũ là đã được duyệt. Mức ≥60% thiếu bằng chứng/xác nhận bị giới hạn 40%; việc CĐT phê duyệt chỉ ghi nhận 0/100%; làm lại miễn phí ghi nhận 0%. Trạng thái mới chưa được báo cáo bắt đầu 0%, tự hiển thị 20% khi có giờ đã duyệt. Task cũ đã hoàn thành giữ mức báo cáo 100%, nhưng vẫn phải đáp ứng bằng chứng/xác nhận để được công nhận.

Khi cập nhật workflow, trường `deliveryRecognized`/`deliveryStatusLevel` được đồng bộ sang task và Gantt liên kết. Các bộ tính tiến độ/dự báo nhận trường mới khi có; task chưa dùng workflow mới giữ cách hoạt động cũ. Ghi chú được đồng bộ với ganttNote. Phân công vẫn dùng lịch nghỉ và quy tắc Có/Không đã lưu.

Tỷ trọng khóa khi ký dùng cho % hợp đồng và tiền; đổi phân công không tự thay tỷ trọng. Điều chỉnh phạm vi cần phụ lục và khóa lại có lý do. Công DT nhóm và hiệu suất giờ phản ánh phân công hiện tại. Các kỳ chốt lưu snapshot riêng, chỉ mở lại kèm lý do. Lịch sử tiền bắt đầu khi có lần ghi nhận mới, không dựng ngược số liệu những tháng chưa có dữ liệu.

PATCH có revision chống ghi đè phiên khác (409 giữ bản nháp để người dùng kiểm tra/lưu lại). Có kiểm thử riêng trong backend/tests/delivery.test.js và frontend/tests/delivery.html; fixture trình duyệt giả lập API nên không ghi dữ liệu thật.
