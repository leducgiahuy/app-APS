import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { deliveryApi } from '../modules/gantt/deliveryApi';
import { pageAccessAllows, pageVisible, PAGE_ACCESS_TREE } from '../utils/pageAccess';

// Quyền xem trang / mục của người đang đăng nhập theo ma trận "Trang & mục".
// Lấy lại mỗi 10 giây, khi quay lại cửa sổ và ngay khi ma trận vừa được lưu, nên Giám đốc đổi quyền
// hay đổi vai trò của một người thì giao diện của người đó đổi theo mà không cần đăng nhập lại.
// Máy chủ vẫn tự kiểm tra từng yêu cầu; phần này chỉ để ẩn / hiện cho đúng.
const POLL_MS = 10000;
const CHANGED_EVENT = 'aps:page-access-changed';

const ALLOW_ALL = { ready: false, role: '', canSee: () => true, canEdit: () => true, pageVisible: () => true, visiblePages: PAGE_ACCESS_TREE.map(page => page.key), refresh: () => {} };
const PageAccessContext = createContext(null);

/** Báo cho giao diện tải lại quyền ngay (gọi sau khi lưu ma trận). */
export const notifyPageAccessChanged = () => window.dispatchEvent(new Event(CHANGED_EVENT));

export function PageAccessProvider({ children }) {
  const [state, setState] = useState({ ready: false, role: '', access: null });
  const load = useCallback(async () => {
    try {
      const response = await deliveryApi.pageAccess();
      const next = { ready: true, role: response.data?.role || '', access: response.data?.access || null };
      setState(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    } catch {
      // Mất kết nối tạm thời: giữ quyền đã biết; máy chủ vẫn chặn yêu cầu không hợp lệ.
    }
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    const reload = () => load();
    window.addEventListener('focus', reload);
    window.addEventListener(CHANGED_EVENT, reload);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', reload); window.removeEventListener(CHANGED_EVENT, reload); };
  }, [load]);
  const value = useMemo(() => {
    // Chưa tải xong (hoặc Admin): không ẩn gì để tránh màn hình trống; máy chủ vẫn kiểm tra.
    if (!state.ready || state.role === 'admin') return { ...ALLOW_ALL, ready: state.ready, role: state.role, refresh: load };
    const canSee = key => pageAccessAllows(state.access, key, state.role);
    const canEdit = key => pageAccessAllows(state.access, key, state.role, 'write');
    const isVisible = key => pageVisible(state.access, key, state.role);
    return { ready: true, role: state.role, access: state.access, canSee, canEdit, pageVisible: isVisible, visiblePages: PAGE_ACCESS_TREE.map(page => page.key).filter(isVisible), refresh: load };
  }, [state, load]);
  return <PageAccessContext.Provider value={value}>{children}</PageAccessContext.Provider>;
}

/** Ngoài Provider (trang thử nghiệm riêng lẻ) thì không ẩn gì. */
export function usePageAccess() {
  return useContext(PageAccessContext) || ALLOW_ALL;
}

/** Lọc danh sách tab [key, label] theo quyền xem; keyFor đổi khóa tab sang khóa trong ma trận. */
export function useVisibleTabs(tabs, keyFor) {
  const { canSee } = usePageAccess();
  return tabs.filter(tab => canSee(keyFor(tab[0])));
}

/** Tab đang hiển thị: lựa chọn của người dùng nếu còn được thấy, nếu không thì tab đầu tiên còn lại. */
export function useAccessTabs(tabs, choice, keyFor) {
  const visible = useVisibleTabs(tabs, keyFor);
  return [visible, visible.some(([key]) => key === choice) ? choice : visible[0]?.[0]];
}
