import { useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Camera, KeyRound, LockKeyhole, LogOut, Trash2, UserRound, UserRoundPlus, UsersRound } from 'lucide-react';
import { adminUpdateUserProfile, endAuthSession, getCurrentUser, getUsers, processAvatarFile, resetUserPassword, updateUserPassword, updateUserProfile } from './authSession';
import { ACCOUNT_LEVELS, DEFAULT_LEVEL, DEPARTMENTS, SPECIALTIES, getLevelLabel } from './accountOptions';
import { createUserWithEmployee, deleteUserWithEmployee, syncEmployeeForUser } from './accountEmployeeSync';
import './AccountPage.css';

/** Trang tài khoản tách riêng: user quản lý hồ sơ/mật khẩu; admin có thêm tác vụ quản trị user. */
export default function AccountPage() {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const [activeSection, setActiveSection] = useState('profile');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [profileAvatar, setProfileAvatar] = useState(currentUser?.avatarData || '');
  const [managedEmail, setManagedEmail] = useState('');
  const [managedAvatar, setManagedAvatar] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const userAccounts = isAdmin ? getUsers().filter((user) => user.role === 'user') : [];
  const managedUser = userAccounts.find((user) => user.email === managedEmail) || userAccounts[0] || null;

  /** Đọc ảnh được chọn, thu nhỏ trước khi lưu và báo lỗi định dạng/dung lượng. */
  async function handleAvatarFile(event, setAvatar) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      setAvatar(await processAvatarFile(file));
      setNotice({ type: '', text: '' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không đọc được ảnh đã chọn.' });
    }
  }

  /** Đẩy hồ sơ tài khoản vừa lưu sang nhân sự liên kết; báo lỗi nếu backend chưa nhận được. */
  async function syncLinkedEmployee(email, successText) {
    try {
      await syncEmployeeForUser(email);
      setNotice({ type: 'success', text: successText });
    } catch (error) {
      setNotice({ type: 'error', text: `${successText} Nhưng chưa đồng bộ được sang trang Thành viên (${error.message}). Hãy lưu lại khi máy chủ hoạt động.` });
    }
  }

  /** Admin tạo tài khoản user kèm cấp bậc/phòng ban/chuyên môn; đồng thời tạo hồ sơ nhân sự liên kết. */
  async function handleCreateUser(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get('newPassword'));
    if (password.length < 8) return setNotice({ type: 'error', text: 'Mật khẩu tạm cần có ít nhất 8 ký tự.' });
    if (password !== String(form.get('confirmPassword'))) return setNotice({ type: 'error', text: 'Mật khẩu xác nhận chưa khớp.' });

    setCreating(true);
    const result = await createUserWithEmployee({
      name: String(form.get('name')),
      email: String(form.get('email')),
      company: String(form.get('company')),
      phone: String(form.get('phone')),
      password,
      ...readOrgFields(form),
    }, currentUser.email);
    setCreating(false);
    if (result.error) return setNotice({ type: 'error', text: result.error });
    formElement.reset();
    setNotice({ type: 'success', text: `Đã tạo user ${result.user.email} (${getLevelLabel(result.user.level)} · ${result.user.department}) và hồ sơ nhân sự ${result.employee.code || ''} trên trang Thành viên. Gửi thông tin đăng nhập ban đầu cho người dùng.` });
  }

  /** Admin cấp mật khẩu mới cho một user được chọn trong danh sách. */
  function handleResetPassword(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('newPassword'));
    if (password.length < 8) return setNotice({ type: 'error', text: 'Mật khẩu mới cần có ít nhất 8 ký tự.' });
    if (password !== String(form.get('confirmPassword'))) return setNotice({ type: 'error', text: 'Mật khẩu xác nhận chưa khớp.' });
    const result = resetUserPassword(String(form.get('targetEmail')), password, currentUser.email);
    if (result.error) return setNotice({ type: 'error', text: result.error });
    event.currentTarget.reset();
    setNotice({ type: 'success', text: 'Đã cấp mật khẩu mới. Hãy chuyển mật khẩu này cho user qua kênh riêng.' });
  }

  /** User chỉ cập nhật hồ sơ của chính tài khoản đang đăng nhập. */
  function handleUpdateProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = updateUserProfile(currentUser.email, {
      name: String(form.get('name')),
      company: String(form.get('company')),
      phone: String(form.get('phone')),
      avatarData: profileAvatar,
    }, currentUser.email);
    if (!saved) return setNotice({ type: 'error', text: 'Không tìm thấy tài khoản. Vui lòng đăng nhập lại.' });
    syncLinkedEmployee(currentUser.email, 'Thông tin cá nhân đã được cập nhật.');
  }

  /** Admin cập nhật hồ sơ user được chọn, gồm ảnh đại diện và cấp bậc/phòng ban/chuyên môn. */
  function handleAdminUpdateUser(event) {
    event.preventDefault();
    if (!managedUser) return;
    const form = new FormData(event.currentTarget);
    const saved = adminUpdateUserProfile(currentUser.email, managedUser.email, {
      name: String(form.get('name')),
      company: String(form.get('company')),
      phone: String(form.get('phone')),
      avatarData: managedAvatar ?? managedUser.avatarData ?? '',
      ...readOrgFields(form),
    });
    if (!saved) return setNotice({ type: 'error', text: 'Không thể cập nhật hồ sơ user này.' });
    syncLinkedEmployee(managedUser.email, `Đã lưu hồ sơ của ${managedUser.email}.`);
  }

  /** Admin xóa user đang chọn cùng hồ sơ nhân sự liên kết, sau khi xác nhận. */
  async function handleDeleteUser() {
    if (!managedUser) return;
    if (!window.confirm(`Xóa tài khoản ${managedUser.email}?\nHồ sơ nhân sự "${managedUser.name}" trên trang Thành viên cũng bị xóa. Không thể hoàn tác.`)) return;
    setDeleting(true);
    const result = await deleteUserWithEmployee(managedUser.email, currentUser.email);
    setDeleting(false);
    if (result.error) return setNotice({ type: 'error', text: result.error });
    setManagedEmail('');
    setManagedAvatar(null);
    setNotice({ type: 'success', text: `Đã xóa tài khoản ${result.user.email} và hồ sơ nhân sự liên kết.` });
  }

  /** User đổi mật khẩu của chính mình sau khi nhập mật khẩu hiện tại đúng. */
  function handleChangePassword(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword'));
    if (newPassword.length < 8) return setNotice({ type: 'error', text: 'Mật khẩu mới cần có ít nhất 8 ký tự.' });
    if (newPassword !== String(form.get('confirmPassword'))) return setNotice({ type: 'error', text: 'Mật khẩu xác nhận chưa khớp.' });
    const changed = updateUserPassword(currentUser.email, String(form.get('currentPassword')), newPassword, currentUser.email);
    if (!changed) return setNotice({ type: 'error', text: 'Mật khẩu hiện tại chưa chính xác.' });
    event.currentTarget.reset();
    setNotice({ type: 'success', text: 'Mật khẩu đã được đổi thành công.' });
  }

  /** Kết thúc phiên hiện tại và quay về trang đăng nhập. */
  function handleLogout() {
    endAuthSession();
    window.location.assign('/login');
  }

  /** Chuyển tab và xóa thông báo cũ để tác vụ mới bắt đầu ở trạng thái sạch. */
  function selectSection(section) {
    setActiveSection(section);
    setNotice({ type: '', text: '' });
  }

  return (
    <main className="account-page">
      <header className="account-header">
        <a className="account-brand" href="/" aria-label="APS Việt Nam"><img src="/aps-logo.svg" alt="APS Việt Nam · Project Management | QS" /></a>
        <div className="account-header-actions"><a className="account-back" href="/"><ArrowLeft size={16} /> Về trang quản lý</a><button className="account-logout" type="button" onClick={handleLogout}><LogOut size={16} /> Đăng xuất</button></div>
      </header>

      <section className="account-card">
        <div className="account-heading"><span className="account-heading-icon"><UserRound size={21} /></span><div><p>QUẢN LÝ TÀI KHOẢN</p><h1>Tài khoản của tôi</h1><span>{currentUser.name} · {isAdmin ? 'Quản trị viên' : getLevelLabel(currentUser.level)}{currentUser.department && ` · ${currentUser.department}`}</span></div></div>

        <nav className="account-tabs" aria-label="Tác vụ tài khoản">
          <button type="button" className={activeSection === 'profile' ? 'active' : ''} onClick={() => selectSection('profile')}><UserRound size={16} /> Hồ sơ cá nhân</button>
          <button type="button" className={activeSection === 'password' ? 'active' : ''} onClick={() => selectSection('password')}><LockKeyhole size={16} /> Đổi mật khẩu</button>
          {isAdmin && <button type="button" className={activeSection === 'users' ? 'active' : ''} onClick={() => selectSection('users')}><UsersRound size={16} /> Quản lý user</button>}
        </nav>

        {notice.text && <div className={`account-notice ${notice.type}`} role="status" aria-live="polite">{notice.text}</div>}

        {activeSection === 'profile' && <form className="account-form" onSubmit={handleUpdateProfile}>
          <div className="account-photo-row"><AvatarPreview avatar={profileAvatar} name={currentUser.name} /><div className="account-photo-controls"><b>Ảnh đại diện</b><span>Ảnh vuông, tự căn giữa và thu nhỏ.</span><label className="account-photo-button"><Camera size={15} /> Chọn ảnh<input type="file" accept="image/*" onChange={(event) => handleAvatarFile(event, setProfileAvatar)} /></label>{profileAvatar && <button className="account-photo-remove" type="button" onClick={() => setProfileAvatar('')}>Xóa ảnh</button>}</div></div>
          <div className="account-form-grid">
            <label>Họ và tên<input name="name" autoComplete="name" defaultValue={currentUser.name} required /></label>
            <label>Email đăng nhập<input type="email" value={currentUser.email} readOnly /></label>
            <label>Công ty<input name="company" autoComplete="organization" defaultValue={currentUser.company} required /></label>
            <label>Số điện thoại<input name="phone" type="tel" autoComplete="tel" defaultValue={currentUser.phone || ''} placeholder="090 123 4567" /></label>
          </div>
          <button className="account-primary" type="submit">Lưu thông tin</button>
        </form>}

        {isAdmin && activeSection === 'users' && <div className="account-form">
          <div className="account-section-title"><UsersRound size={18} /><div><b>Quản lý tài khoản user</b><span>Tạo tài khoản, cập nhật hồ sơ/ảnh hoặc cấp lại mật khẩu.</span></div></div>
          <div className="account-admin-actions">
            <button className="account-admin-action" type="button" onClick={() => selectSection('create')}><UserRoundPlus size={17} /> Tạo tài khoản user</button>
            <button className="account-admin-action" type="button" onClick={() => selectSection('reset')}><KeyRound size={17} /> Cấp lại mật khẩu</button>
          </div>
          {managedUser ? <form key={managedUser.email} className="account-admin-profile" onSubmit={handleAdminUpdateUser}>
            <label>User cần chỉnh sửa<select value={managedUser.email} onChange={(event) => { setManagedEmail(event.target.value); setManagedAvatar(null); }}>
              {userAccounts.map((user) => <option key={user.email} value={user.email}>{user.name} · {getLevelLabel(user.level)} · {user.email}</option>)}
            </select></label>
            <div className="account-photo-row"><AvatarPreview avatar={managedAvatar ?? managedUser.avatarData ?? ''} name={managedUser.name} /><div className="account-photo-controls"><b>Ảnh đại diện user</b><span>Admin có thể cập nhật ảnh thay user.</span><label className="account-photo-button"><Camera size={15} /> Chọn ảnh<input type="file" accept="image/*" onChange={(event) => handleAvatarFile(event, setManagedAvatar)} /></label>{(managedAvatar ?? managedUser.avatarData) && <button className="account-photo-remove" type="button" onClick={() => setManagedAvatar('')}>Xóa ảnh</button>}</div></div>
            <div className="account-form-grid"><label>Họ và tên<input name="name" defaultValue={managedUser.name} required /></label><label>Email đăng nhập<input value={managedUser.email} readOnly /></label><label>Công ty<input name="company" defaultValue={managedUser.company} required /></label><label>Số điện thoại<input name="phone" defaultValue={managedUser.phone || ''} /></label></div>
            <OrgFields idPrefix="edit" user={managedUser} />
            <div className="account-admin-buttons">
              <button className="account-primary" type="submit">Lưu hồ sơ user</button>
              <button className="account-danger" type="button" disabled={deleting} onClick={handleDeleteUser}><Trash2 size={16} /> {deleting ? 'Đang xóa…' : 'Xóa tài khoản'}</button>
            </div>
          </form> : <p className="account-empty">Chưa có tài khoản user. Tạo user để bắt đầu quản lý.</p>}
        </div>}

        {activeSection === 'password' && <form className="account-form password-form" onSubmit={handleChangePassword}>
          <label>Mật khẩu hiện tại<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <div className="account-form-grid"><label>Mật khẩu mới<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label><label>Xác nhận mật khẩu mới<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label></div>
          <p className="account-help">Mật khẩu mới cần có ít nhất 8 ký tự.</p>
          <button className="account-primary" type="submit"><LockKeyhole size={17} /> Cập nhật mật khẩu</button>
        </form>}

        {isAdmin && activeSection === 'create' && <form className="account-form" onSubmit={handleCreateUser}>
          <div className="account-section-title"><UsersRound size={18} /><div><b>Tạo tài khoản user</b><span>Tài khoản mới mặc định có quyền user. Chọn cấp bậc, phòng ban và chuyên môn bên dưới.</span></div></div>
          <div className="account-form-grid">
            <label>Họ và tên<input name="name" autoComplete="name" placeholder="Nguyễn Văn An" required /></label>
            <label>Email đăng nhập<input name="email" type="email" autoComplete="email" placeholder="ten@congty.com" required /></label>
            <label>Công ty<input name="company" autoComplete="organization" placeholder="Tên công ty" required /></label>
            <label>Số điện thoại<input name="phone" type="tel" autoComplete="tel" placeholder="090 123 4567" /></label>
          </div>
          <OrgFields idPrefix="create" />
          <div className="account-form-grid account-form-grid-spaced">
            <label>Mật khẩu ban đầu<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>Xác nhận mật khẩu<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          </div>
          <p className="account-help">Hồ sơ nhân sự trên trang Thành viên được tạo cùng lúc (phòng ban → ban/đội, chuyên môn → chức danh). Gửi email và mật khẩu ban đầu cho user qua kênh riêng.</p>
          <button className="account-primary" type="submit" disabled={creating}><UserRoundPlus size={17} /> {creating ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
        </form>}

        {isAdmin && activeSection === 'reset' && <form className="account-form password-form" onSubmit={handleResetPassword}>
          <div className="account-section-title"><KeyRound size={18} /><div><b>Cấp lại mật khẩu cho user</b><span>Chọn tài khoản và đặt mật khẩu mới thay cho user.</span></div></div>
          {userAccounts.length ? <>
            <label>Tài khoản user<select name="targetEmail" defaultValue={userAccounts[0].email} required>{userAccounts.map((user) => <option key={user.email} value={user.email}>{user.name} · {user.email}</option>)}</select></label>
            <div className="account-form-grid"><label>Mật khẩu mới<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label><label>Xác nhận mật khẩu mới<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label></div>
            <p className="account-help">User cần dùng mật khẩu mới ở lần đăng nhập tiếp theo.</p>
            <button className="account-primary" type="submit"><KeyRound size={17} /> Cấp lại mật khẩu</button>
          </> : <p className="account-empty">Chưa có tài khoản user. Tạo user trước ở mục “Tạo user”.</p>}
        </form>}

        <footer className="account-footer">APS Việt Nam <span>·</span> Quản lý dự án xây dựng</footer>
      </section>
    </main>
  );
}

/** Lấy 3 trường cấp bậc/phòng ban/chuyên môn từ FormData để gửi cho createUser/adminUpdateUserProfile. */
function readOrgFields(form) {
  return {
    level: String(form.get('level') || DEFAULT_LEVEL),
    department: String(form.get('department') || ''),
    specialty: String(form.get('specialty') || ''),
  };
}

/**
 * Khối "Cấp bậc & phòng ban" dùng chung cho form tạo user và form admin sửa user.
 * - Cấp bậc: chọn 1 trong 4 (Nhân viên, Leader, Quản lý, Giám đốc), bắt buộc.
 * - Phòng ban: bắt buộc; gõ tự do hoặc chọn từ danh sách gợi ý (datalist).
 * - Chuyên môn: không bắt buộc; gõ tự do hoặc chọn từ danh sách gợi ý.
 * `idPrefix` giúp id của datalist không trùng khi có nhiều form trên trang.
 */
function OrgFields({ idPrefix, user }) {
  return <fieldset className="account-org-fields">
    <legend><BriefcaseBusiness size={15} /> Cấp bậc &amp; phòng ban</legend>
    <div className="account-form-grid account-form-grid-3">
      <label>Cấp bậc<select name="level" defaultValue={user?.level || DEFAULT_LEVEL} required>
        {ACCOUNT_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
      </select></label>
      <label>Phòng ban<input name="department" list={`${idPrefix}-departments`} defaultValue={user?.department || ''} placeholder="Chọn hoặc nhập phòng ban" required /></label>
      <label>Chuyên môn<input name="specialty" list={`${idPrefix}-specialties`} defaultValue={user?.specialty || ''} placeholder="VD: Kết cấu" /></label>
    </div>
    <datalist id={`${idPrefix}-departments`}>{DEPARTMENTS.map((name) => <option key={name} value={name} />)}</datalist>
    <datalist id={`${idPrefix}-specialties`}>{SPECIALTIES.map((name) => <option key={name} value={name} />)}</datalist>
  </fieldset>;
}

/** Hiển thị ảnh đã tải lên hoặc chữ cái đầu của tên nếu user chưa có ảnh. */
function AvatarPreview({ avatar, name }) {
  const initials = name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
  return <div className="account-avatar-preview">{avatar ? <img src={avatar} alt={`Ảnh đại diện ${name}`} /> : <span>{initials}</span>}</div>;
}

