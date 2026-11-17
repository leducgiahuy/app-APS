// Tài khoản admin khởi tạo chỉ dùng cho test (DB tạm, trống). Server thật đặt biến này trên máy chủ.
process.env.APS_ADMIN_EMAIL ||= 'demo@aps.vn';
process.env.APS_ADMIN_PASSWORD ||= 'APS@2026';
