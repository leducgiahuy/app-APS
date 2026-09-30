import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { authenticateUser, recordActivity, startAuthSession } from './authSession';
import '../../App.css';

const DEMO_EMAIL = 'demo@aps.vn';
const DEMO_PASSWORD = 'APS@2026';

function Brand() {
  return <a className="brand" href="/" aria-label="APS Việt Nam"><img className="aps-full-logo" src="/aps-logo.svg" alt="APS Việt Nam · Project Management | QS" /></a>;
}

function SiteIllustration() {
  return <div className="site-art" aria-hidden="true"><div className="art-sun" /><div className="art-crane"><span /><i /><b /></div><div className="art-building building-back"><i /><i /><i /><i /></div><div className="art-building building-front"><i /><i /><i /><i /><i /><i /></div><div className="art-ground" /><div className="art-label"><span className="live-dot" /> CÔNG TRƯỜNG ĐANG HOẠT ĐỘNG</div></div>;
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const user = authenticateUser(email, password);
    if (user) {
      const remember = new FormData(event.currentTarget).get('remember') === 'on';
      startAuthSession(remember, user.email);
      window.location.assign('/');
      return;
    }
    recordActivity('auth.login.failed', 'Đăng nhập thất bại với email đã nhập.', email);
    setMessage('Thông tin chưa đúng. Hãy dùng tài khoản demo hiển thị bên dưới.');
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="Đăng nhập APS">
        <header className="panel-header"><Brand /><span className="secure-note"><ShieldCheck size={15} /> CỔNG THÔNG TIN NỘI BỘ</span></header>
        <div className="form-wrap">
          <div className="eyebrow"><span /> QUẢN LÝ CÔNG TRƯỜNG</div>
          <h1>Chào mừng<br />bạn trở lại.</h1>
          <p className="form-intro">Đăng nhập để tiếp tục quản lý dự án và đội ngũ của bạn.</p>
          <div className="demo-credentials"><div><span>TÀI KHOẢN DEMO</span><button type="button" onClick={() => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); }}>Điền nhanh</button></div><p><b>Email</b><code>{DEMO_EMAIL}</code></p><p><b>Mật khẩu</b><code>{DEMO_PASSWORD}</code></p><small>Đăng nhập bản xem trước · chưa kết nối xác thực máy chủ</small></div>
          <form onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="email">Email công việc</label>
            <div className="input-wrap"><Mail size={18} aria-hidden="true" /><input id="email" name="email" type="email" placeholder="ten@congty.com" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className="password-heading"><label className="field-label" htmlFor="password">Mật khẩu</label><a href="mailto:hotro@apsvietnam.vn?subject=H%E1%BB%97%20tr%E1%BB%A3%20%C4%91%C4%83ng%20nh%E1%BA%ADp">Quên mật khẩu?</a></div>
            <div className="input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Nhập mật khẩu" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            <label className="remember-row"><input type="checkbox" name="remember" /><span>Ghi nhớ đăng nhập</span></label>
            <button className="submit-button" type="submit">Đăng nhập <ArrowRight size={18} /></button>
            <p className="form-message" role="status" aria-live="polite">{message}</p>
          </form>
          <p className="support-line">Cần hỗ trợ? <a href="mailto:hotro@apsvietnam.vn">Liên hệ bộ phận IT</a></p>
        </div>
        <footer className="panel-footer"><span>© 2026 APS Việt Nam</span><span><i /> Hệ thống quản lý dự án</span></footer>
      </section>
      <aside className="visual-panel" aria-label="Quản lý công trường APS"><div className="visual-top"><span>APS PROJECT MANAGEMENT</span><span>01 — 04</span></div><SiteIllustration /><div className="visual-caption"><p>Mọi công trình<br /><strong>bắt đầu từ một kế hoạch tốt.</strong></p><span>Quản lý tiến độ, nhân sự và nguồn lực<br />trên cùng một nền tảng.</span></div><div className="visual-bottom"><span>THI CÔNG · KẾT NỐI · PHÁT TRIỂN</span><span>10°46' N &nbsp; 106°40' E</span></div></aside>
    </main>
  );
}
