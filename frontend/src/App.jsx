import { useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import { AppProvider, useApp, useLayout } from './context/AppContext';
import { usePageAccess } from './context/PageAccessContext';
import { PAGE_ACCESS_TREE } from './utils/pageAccess';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Toast from './components/layout/Toast';
import WorkHubPage from './modules/work-hub/WorkHubPage';
import DirectorOverviewPage from './modules/director-overview/DirectorOverviewPage';
const TimesheetsPage = lazy(() => import('./modules/operations/PeopleTimesheetsPage'));
const PermissionsPage = lazy(() => import('./modules/operations/PermissionsPage'));
const CompanyPage = lazy(() => import('./modules/company/CompanyPage'));
const GanttPage = lazy(() => import('./modules/gantt/GanttPage'));
import LoginPage from './modules/auth/LoginPage';
import AccountPage from './modules/auth/AccountPage';
import AdminActivityPage from './modules/auth/AdminActivityPage';
import { hasAuthSession } from './modules/auth/authSession';
import { getCurrentUser } from './modules/auth/authSession';
import { placeholderPages } from './components/layout/placeholderPages';

const SIDEBAR_WIDTH_CHANGE = 288 - 80; // lg:w-72 ↔ lg:w-20

// Chỉ cột này đọc trạng thái menu nên trang bên trong (children do MainLayout tạo sẵn) không bị
// vẽ lại khi thu/mở. Lề được đổi ngay một lần, rồi cột trượt bằng transform (card đồ họa xử lý):
// trình duyệt không phải tính lại bố cục bảng/biểu đồ ở từng khung hình nên trang nặng vẫn mượt.
function ContentColumn({ children }) {
  const { sidebarCollapsed } = useLayout();
  const columnRef = useRef(null);
  const previousCollapsed = useRef(sidebarCollapsed);
  useLayoutEffect(() => {
    if (previousCollapsed.current === sidebarCollapsed) return;
    previousCollapsed.current = sidebarCollapsed;
    if (!columnRef.current || !window.matchMedia('(min-width: 1024px)').matches) return;
    const offset = sidebarCollapsed ? SIDEBAR_WIDTH_CHANGE : -SIDEBAR_WIDTH_CHANGE;
    columnRef.current.animate(
      [{ transform: `translateX(${offset}px)` }, { transform: 'translateX(0)' }],
      { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
    );
  }, [sidebarCollapsed]);
  return <div ref={columnRef} className={`app-content-column flex-1 flex flex-col ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}`}>{children}</div>;
}

function MainLayout() {
  const { activeTab, setActiveTab } = useApp();
  const { ready, pageVisible, visiblePages } = usePageAccess();
  // Trang đang mở bị tắt quyền (đổi ma trận / đổi vai trò): chuyển sang trang đầu tiên còn được thấy.
  const pageBlocked = ready && PAGE_ACCESS_TREE.some(page => page.key === activeTab) && !pageVisible(activeTab);
  useEffect(() => {
    if (pageBlocked && visiblePages[0]) setActiveTab(visiblePages[0]);
  }, [pageBlocked, visiblePages, setActiveTab]);
  const placeholderPage = placeholderPages.find(page => page.id === activeTab);
  const fixedControls = Boolean(placeholderPage) || ['work-hub', 'director-overview', 'activity', 'gantt', 'company'].includes(activeTab);
  useEffect(() => {
    if (!fixedControls) return undefined;
    document.documentElement.classList.add('fixed-controls-page');
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove('fixed-controls-page');
  }, [fixedControls]);
  return (
    <div className={`app-shell ${fixedControls ? 'app-fixed-controls' : ''} min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200`}>
      <Sidebar />
      <ContentColumn>
        <Header />
        <main key={activeTab} className={`app-page-scroll ${activeTab === 'gantt' ? 'app-gantt-scroll' : activeTab === 'activity' ? 'app-activity-scroll' : activeTab === 'director-overview' ? 'app-dashboard-scroll' : ''} flex-1 w-full animate-fade-in ${placeholderPage || activeTab === 'work-hub' || activeTab === 'director-overview' || activeTab === 'gantt' || activeTab === 'activity' || activeTab === 'company' ? 'max-w-none mx-0 p-0' : 'p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto'}`}>
          {pageBlocked && !visiblePages.length && <p className="p-6 text-sm text-slate-500">Tài khoản của bạn chưa được cấp quyền xem trang nào. Liên hệ Giám đốc / quản trị để được phân quyền.</p>}
          {!pageBlocked && activeTab === 'work-hub' && <WorkHubPage />}
          {!pageBlocked && activeTab === 'director-overview' && <DirectorOverviewPage />}
          {!pageBlocked && activeTab === 'gantt' && <Suspense fallback={<p className="p-4 text-sm text-slate-500">Đang tải tiến độ…</p>}><GanttPage /></Suspense>}
          {!pageBlocked && activeTab === 'company' && <Suspense fallback={<p className="p-4">Đang tải trang Công ty…</p>}><CompanyPage /></Suspense>}
          {activeTab === 'activity' && getCurrentUser()?.role === 'admin' && <AdminActivityPage />}
          {!pageBlocked && placeholderPage && <Suspense fallback={<p className="p-4">Đang tải…</p>}>{activeTab === 'timesheets' && <TimesheetsPage/>}{activeTab === 'permissions' && <PermissionsPage/>}</Suspense>}
        </main>
      </ContentColumn>
      <Toast />
    </div>
  );
}

export default function App() {
  const isLoginRoute = window.location.pathname === '/login';
  const isAccountRoute = window.location.pathname === '/account';
  const isAuthenticated = hasAuthSession();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', localStorage.getItem('aps_theme') === 'dark');
    if (!isAuthenticated && (!isLoginRoute || isAccountRoute)) window.location.replace('/login');
    if (isAuthenticated && isLoginRoute) window.location.replace('/');
  }, [isAuthenticated, isLoginRoute, isAccountRoute]);

  if (isAccountRoute && isAuthenticated) return <AccountPage />;
  if (isLoginRoute && !isAuthenticated) return <LoginPage />;
  if (!isAuthenticated) return null;
  return <AppProvider><MainLayout /></AppProvider>;
}
