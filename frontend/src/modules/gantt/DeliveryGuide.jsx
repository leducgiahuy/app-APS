export default function DeliveryGuide({ financial = false }) {
  return <section className="delivery-guide"><h2>Cách đọc bảng tiến độ</h2><div className="delivery-guide-steps"><article><h3>① Trạng thái (mức %)</h3><p>Người làm báo việc đang ở giai đoạn nào: 0 · 20 · 40 · 60 · 80 · 100%. Đây là báo cáo của người làm.</p></article><article><h3>② % ghi nhận</h3><p>Từ 60% cần đúng loại bằng chứng và người có quyền xác nhận. Thiếu một điều kiện: công nhận 40%. Việc CĐT phê duyệt chỉ ghi nhận 0% hoặc 100%; làm lại miễn phí luôn 0%.</p></article>{financial && <article><h3>③ Sản lượng (tiền)</h3><p>Phí hợp đồng × tỷ trọng × % ghi nhận. Chỉ quản lý cấp trung, kế toán, giám đốc và quản trị được xem tiền.</p></article>}</div>
    <div className="delivery-overflow"><table><thead><tr><th>Mức</th><th>Việc thiết kế</th><th>Việc pháp lý</th><th>Điều kiện / bằng chứng</th></tr></thead><tbody>{[
      ['0%', 'Chưa bắt đầu', 'Chưa bắt đầu', 'Chưa có giờ công được duyệt'],
      ['20%', 'Đang làm', 'Đang chuẩn bị hồ sơ', 'Đã có giờ chấm công đã duyệt vào việc'],
      ['40%', 'Chờ kiểm tra', 'Chờ CĐT ký', 'Xong bản của người làm, chuyển kiểm tra / gửi ký đóng dấu'],
      ['60%', 'Đã gửi', 'Đã nộp, có biên nhận', 'Email/biên bản giao; pháp lý cần biên nhận hoặc mã hồ sơ dịch vụ công'],
      ['80%', 'Đã sửa', 'Đã bổ sung theo ý kiến', 'Văn bản góp ý / yêu cầu bổ sung và nội dung nộp lại'],
      ['100%', 'Phê duyệt', 'Có kết quả', 'Văn bản/email chấp thuận; pháp lý là quyết định/giấy phép/thông báo kết quả'],
    ].map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>
    <p>Công HĐ là số nhập tay độc lập. Công DT = tổng giờ phân công Gantt ÷ 8; khi chưa giao người thì dùng tổng giờ dự toán hoặc lịch dự kiến. Công TT chỉ xuất hiện khi task đã bấm Hoàn thành và bằng tổng giờ làm thực tế được chốt ÷ 8; task chưa hoàn thành để trống, còn dòng cha/nhóm/dự án cộng Công TT của các task con. Công đạt = Công DT × % ghi nhận. Dòng nhóm = tổng công đạt của việc con ÷ tổng Công DT con; không nhập trạng thái nhóm.</p>
    <p>Task đã hoàn thành, hoàn thành sớm hoặc hoàn thành muộn chỉ được chọn mức trạng thái từ 40% đến 100%; chọn 0% hoặc 20% sẽ bị cảnh báo và không lưu. Task quá hạn nhưng chưa hoàn thành vẫn được chọn đủ các mức 0%, 20%, 40%, 60%, 80% và 100%.</p>
    <p>% hoàn thành hợp đồng = tổng công đạt ÷ tổng Công DT. Kế hoạch = ngày làm việc đã qua ÷ ngày làm việc dự án (Thứ 7 nửa ngày; Chủ nhật/ngày lễ nghỉ). Hiệu suất = công đạt ÷ Công TT; ≥1 xanh, 0,85–1 vàng, &lt;0,85 đỏ. Tùy chọn loại giờ làm lại chỉ thay mẫu số.</p>
    {financial && <p>Khi ký và khóa tỷ trọng, % hoàn thành hợp đồng dùng tổng (tỷ trọng đã khóa × % ghi nhận); sản lượng = phí hợp đồng × % hoàn thành. Điều chỉnh người hoặc giờ phân công không tự đổi tỷ trọng đã khóa. Thay đổi phạm vi có phí cần phụ lục và khóa lại. Dòng nhóm và hiệu suất giờ vẫn phản ánh Công DT hiện tại.</p>}
    <p>Cảnh báo: hạn nộp còn dưới 72 giờ hoặc quá hạn mà chưa gửi, mức ≥60% thiếu bằng chứng/xác nhận, mức 80% đứng quá 30 ngày. Không cho người làm tự xác nhận việc của mình; Leader phải nhờ quản lý xác nhận. Hồ sơ, nhận xét và các số giờ cũ vẫn được giữ; giờ lịch sử chưa có duyệt sẽ nằm trong danh sách chờ duyệt.</p>
  </section>;
}
