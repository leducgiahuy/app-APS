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

Moi Gantt item co the luu `parentTaskId` de tao cay task. Lien ket FS thu cong nam trong `dependencies` va `manualDependencies`; cac cap lien ket nguoi dung da xoa bang menu chuot phai nam trong `suppressedDependencies` cua task dich. Khi noi lai cung cap task, backend xoa ID nguon khoi `suppressedDependencies` va dong bo ba truong nay sang task lien ket. Ty trong task cha va cach thay thanh cha/con la du lieu suy ra tu cac task la, khong ghi de so lieu ty trong hoac ngay da luu.

Tệp bằng chứng tối đa 10 MB được lưu dưới `delivery-files` cạnh db.json, tên tệp vật lý là UUID. Sao lưu **cả db.json lẫn thư mục delivery-files**. Việc tải tệp đi qua API có xác thực. JSON chỉ giữ metadata, không chứa tệp base64.

Tài khoản Tiến độ mới nằm trong `delivery.users` (mật khẩu scrypt có salt). Phiên mặc định 8 giờ, có thể đổi bằng `operations.params.sessionHours`, và chỉ lưu hash token; quyền được kiểm tra lại ở mỗi request. Tài khoản demo hiện có khởi tạo quản trị lần đầu. Quản trị cấp vai trò/liên kết nhân sự trong trang **Phân quyền → Vai trò theo dự án**; email và mật khẩu phải khớp tài khoản đăng nhập hiện có. Các cơ chế đăng nhập và API cũ vẫn hoạt động như trước; phạm vi xác thực bổ sung này là API `/api/delivery/*`, không thay thế xác thực toàn hệ thống.

Trạng thái báo cáo, % được ghi nhận và giờ thực tế là dữ liệu riêng. Nhật ký giờ cũ nhập vào danh sách chờ duyệt; không tự coi toàn bộ giờ cũ là đã được duyệt. Mức ≥60% thiếu bằng chứng/xác nhận bị giới hạn 40%; việc CĐT phê duyệt chỉ ghi nhận 0/100%; làm lại miễn phí ghi nhận 0%. Trạng thái mới chưa được báo cáo bắt đầu 0%, tự hiển thị 20% khi có giờ đã duyệt. Task cũ đã hoàn thành giữ mức báo cáo 100%, nhưng vẫn phải đáp ứng bằng chứng/xác nhận để được công nhận.

Khi cập nhật workflow, trường `deliveryRecognized`/`deliveryStatusLevel` được đồng bộ sang task và Gantt liên kết. Các bộ tính tiến độ/dự báo nhận trường mới khi có; task chưa dùng workflow mới giữ cách hoạt động cũ. Ghi chú được đồng bộ với ganttNote. Phân công vẫn dùng lịch nghỉ và quy tắc Có/Không đã lưu.

Tỷ trọng khóa khi ký dùng cho % hợp đồng và tiền; đổi phân công không tự thay tỷ trọng đã khóa. Điều chỉnh phạm vi cần phụ lục và khóa lại có lý do. Công HĐ là số nhập tay độc lập và giữ nguyên dữ liệu đã lưu. Công DT tự tính từ giờ dự kiến/phân công, dùng cho tỷ trọng, công đạt và hiệu suất; dòng nhóm và dự án cộng Công DT của các việc con. Cột Công TT trong bảng tiến độ chỉ lấy `actualWorkHours ÷ 8` sau khi task đã hoàn thành; task chưa hoàn thành để trống, dòng cha/nhóm/dự án cộng các task con đã hoàn thành. Các kỳ chốt lưu snapshot riêng, chỉ mở lại kèm lý do. Lịch sử tiền bắt đầu khi có lần ghi nhận mới, không dựng ngược số liệu những tháng chưa có dữ liệu.

Task ở trạng thái `completed` khóa danh sách người đảm nhận và không nhận thêm task con. Giao diện hiển thị cảnh báo khi người dùng thử thêm/xóa người hoặc tạo task con; API Gantt kiểm tra lại cùng quy tắc trước khi ghi để áp dụng cho cả dữ liệu hiện tại và các yêu cầu gửi về sau. Khi task được mở lại sang trạng thái khác, các thao tác này hoạt động lại theo quyền hiện có.

Mức trạng thái tiến độ được đối chiếu với trạng thái thực thi của task khi lưu. Task `completed` (đúng hạn, sớm hoặc muộn) chỉ nhận mức 40–100%; mức 0% và 20% bị từ chối. Task chưa hoàn thành đã qua hết ngày kết thúc được xem là quá hạn và vẫn nhận đủ sáu mức 0/20/40/60/80/100, kể cả khi quy tắc giờ công thông thường của mức 0% hoặc 20% không thỏa.

Ô chọn mức trạng thái kiểm tra ngay trên giao diện: chỉ lựa chọn không hợp lệ mới hiển thị cảnh báo nguyên nhân và giữ mức cũ; lựa chọn hợp lệ cập nhật bản nháp mà không bật cảnh báo. Sau khi người dùng bấm **Lưu thông tin**, giao diện chỉ gọi `showToast` khi API đã lưu và tải lại dữ liệu xong. Toast được render trực tiếp vào `document.body` với lớp hiển thị cao nhất để luôn nằm trên drawer, dropdown và modal. Với task chưa quá hạn, mức 20% cần `actualHours > 0` từ giờ công đã duyệt, còn mức 0% yêu cầu chưa có giờ được duyệt. API tiếp tục kiểm tra lại các điều kiện này khi lưu.

PATCH có revision chống ghi đè phiên khác (409 giữ bản nháp để người dùng kiểm tra/lưu lại). Có kiểm thử riêng trong backend/tests/delivery.test.js và frontend/tests/delivery.html; fixture trình duyệt giả lập API nên không ghi dữ liệu thật.

## Dữ liệu vận hành: giờ công, tài chính và phân quyền (14/10/2026)

`db.operations` là vùng dữ liệu bổ sung dùng chung cho bốn trang Giờ công, Tài chính, Phân quyền và Từ điển. Khi chưa có, `ensureOperations()` tạo cấu trúc mặc định mà không thay đổi các mảng dự án, task, Gantt, nhân sự hoặc `delivery.projects` cũ.

Các nhóm dữ liệu quan trọng:

- `matrix`: từng dòng chức năng, quyền theo sáu vai trò và ghi chú tối đa 1.000 ký tự.
- `members`: vai trò của tài khoản theo từng dự án và `employeeId` liên kết.
- `params`: hạn mức chi, ngưỡng cảnh báo, hạn hoàn ứng, hạn mức OT, thời gian tuyển, số mẫu kiểm tra và bảng đơn giá chuẩn.
- `attendance`: giờ có mặt nhập từ nguồn chấm công, duy nhất theo nhân sự + ngày.
- `otRequests`, `unlocks`: phiếu OT và yêu cầu mở khóa cùng từng bước duyệt.
- `budgets`, `expenseRequests`, `paymentRequests`, `cashForecasts`: phiên bản ngân sách, đề nghị chi/tạm ứng/thuê ngoài, ĐNTT và dự báo dòng tiền.
- `procedures`: danh mục thủ tục áp dụng cho hồ sơ tạo sau. Mẫu tạo dự án nằm riêng trong `delivery.templates`.
- `notifications`, `syncEvents`, `audit`: hàng đợi nhắc việc, lịch sử nhập nguồn và ảnh trước/sau của mutation.

Giờ công theo tuần được lưu trong `delivery.projects[projectId].timesheets` để cùng revision và cùng nguồn tính với tiến độ. Chỉ dòng `approved` mới đi vào chi phí giờ, hiệu suất và chỉ số giờ đã duyệt. Cột Công TT của bảng tiến độ là chỉ số hoàn thành riêng, lấy giờ thực tế đã chốt trên task khi bấm Hoàn thành. Dữ liệu giờ cũ được đánh dấu nguồn cũ và không tự chuyển thành đã duyệt.

Phiếu thu/chi đã nhập từ kế toán được lưu trong `delivery.projects[projectId].receipts` và `expenses`; hóa đơn được liên kết vào `operations.paymentRequests`. Khóa chống trùng là `kind + projectId + externalId`. Nhập lại cập nhật bản ghi đó; toàn bộ lô được kiểm tra trước khi ghi để tránh lưu nửa lô.

`db.operations.revision` tăng sau mỗi mutation thành công. Client phải tải lại sau xung đột hoặc mutation; không ghi trực tiếp vào db để bỏ qua revision, kiểm tra quyền và audit.

Khi sao lưu hệ thống đang dùng, cần giữ đồng thời:

1. `db.json` bên ngoài Git checkout.
2. Thư mục `delivery-files` cạnh cơ sở dữ liệu.
3. Thư mục `backups` nếu cần khả năng phục hồi các bản sao theo ngày.

Không sao lưu `node_modules`, `frontend/dist` hoặc thư mục `tmp`; các thư mục này có thể cài/tạo lại và không phải dữ liệu nghiệp vụ.
