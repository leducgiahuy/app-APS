import { useEffect, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Toast from './components/layout/Toast';
import HRPage from './modules/hr/HRPage';
import TasksPage from './modules/tasks/TasksPage';
import MyWorkPage from './modules/my-work/MyWorkPage';
import DirectorOverviewPage from './modules/director-overview/DirectorOverviewPage';
const TimesheetsPage = lazy(() => import('./modules/operations/PeopleTimesheetsPage'));
const FinancePage = lazy(() => import('./modules/operations/FinancePage'));
const PermissionsPage = lazy(() => import('./modules/operations/PermissionsPage'));
const CompanyPage = lazy(() => import('./modules/company/CompanyPage'));
const GanttPage = lazy(() => import('./modules/gantt/GanttPage'));
import LoginPage from './modules/auth/LoginPage';
import AccountPage from './modules/auth/AccountPage';
import AdminActivityPage from './modules/auth/AdminActivityPage';
import WorkloadPage from './modules/workload/WorkloadPage';
import { hasAuthSession } from './modules/auth/authSession';
import { getCurrentUser } from './modules/auth/authSession';
import { placeholderPages } from './components/layout/placeholderPages';

function MainLayout() {
  const { activeTab, sidebarCollapsed } = useApp();
  const placeholderPage = placeholderPages.find(page => page.id === activeTab);
  const fixedControls = Boolean(placeholderPage) || ['my-work', 'director-overview', 'hr', 'tasks', 'activity', 'workload', 'gantt', 'company'].includes(activeTab);
  useEffect(() => {
    if (!fixedControls) return undefined;
    document.documentElement.classList.add('fixed-controls-page');
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove('fixed-controls-page');
  }, [fixedControls]);
  return (
    <div className={`app-shell ${fixedControls ? 'app-fixed-controls' : ''} min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200`}>
      <Sidebar />
      <div className={`app-content-column flex-1 flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}`}>
        <Header />
        <main key={activeTab} className={`app-page-scroll ${activeTab === 'gantt' ? 'app-gantt-scroll' : activeTab === 'activity' ? 'app-activity-scroll' : activeTab === 'director-overview' ? 'app-dashboard-scroll' : ''} flex-1 w-full animate-fade-in ${placeholderPage || activeTab === 'my-work' || activeTab === 'director-overview' || activeTab === 'workload' || activeTab === 'gantt' || activeTab === 'tasks' || activeTab === 'hr' || activeTab === 'activity' || activeTab === 'company' ? 'max-w-none mx-0 p-0' : 'p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto'}`}>
          {activeTab === 'my-work' && <MyWorkPage />}
          {activeTab === 'director-overview' && <DirectorOverviewPage />}
          {activeTab === 'hr' && <HRPage />}
          {activeTab === 'workload' && <WorkloadPage />}
          {activeTab === 'tasks' && <TasksPage />}
          {activeTab === 'gantt' && <Suspense fallback={<p className="p-4 text-sm text-slate-500">Đang tải tiến độ…</p>}><GanttPage /></Suspense>}
          {activeTab === 'company' && <Suspense fallback={<p className="p-4">Đang tải trang Công ty…</p>}><CompanyPage /></Suspense>}
          {activeTab === 'activity' && getCurrentUser()?.role === 'admin' && <AdminActivityPage />}
          {placeholderPage && <Suspense fallback={<p className="p-4">Đang tải…</p>}>{activeTab === 'timesheets' && <TimesheetsPage/>}{activeTab === 'finance' && <FinancePage/>}{activeTab === 'permissions' && <PermissionsPage/>}</Suspense>}
        </main>
      </div>
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
