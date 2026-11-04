import { createContext, useContext } from 'react';
import { usePageAccess } from '../context/PageAccessContext';
import './AccessScope.css';

/**
 * Vùng quyền theo ma trận "Trang & mục": S = xem và thao tác, X = chỉ xem.
 *
 * Chỉ xem thì vùng mang lớp `access-view-only`:
 * - mọi nút đang bị khóa (disabled) trong vùng bị ẩn hẳn;
 * - mọi phần tử đánh dấu `data-edit-only` (form thêm / sửa, ô nhập liệu…) bị ẩn.
 * Nút xem (chuyển tab, lọc, mở chi tiết) không bị khóa nên vẫn hiện; ô thông tin bị khóa (select / input) vẫn hiện để đọc.
 *
 * Cách dùng cho trang mới: bọc phần nội dung của mục bằng <AccessScope item="khóa-mục">, cho nút thao tác
 * `disabled={!editable}` (lấy từ useScopeEditable() hoặc useCanEdit) — thế là X tự ẩn nút, S hiện bình thường.
 * Máy chủ vẫn tự chặn mọi thao tác không có S (403), phần này để giao diện đúng nghĩa "chỉ được xem".
 */
const ScopeContext = createContext(true);

/** Vai trò hiện tại có S ở mục (một hoặc nhiều mục: chỉ cần một mục có S). */
export function useCanEdit(item) {
  const { canEdit } = usePageAccess();
  return (Array.isArray(item) ? item : [item]).some(key => canEdit(key));
}

/** Vùng gần nhất có cho thao tác không (true nếu không nằm trong vùng nào). */
export const useScopeEditable = () => useContext(ScopeContext);

export default function AccessScope({ item, editable: forced, as: Tag = 'div', className = '', children, ...rest }) {
  const allowed = useCanEdit(item);
  const parent = useScopeEditable();
  const editable = parent && allowed && forced !== false;
  return (
    <ScopeContext.Provider value={editable}>
      <Tag {...rest} style={className || rest.style ? rest.style : { display: 'contents' }} className={`${className}${editable ? '' : ' access-view-only'}`.trim() || undefined} data-access-item={Array.isArray(item) ? item.join(' ') : item}>
        {children}
      </Tag>
    </ScopeContext.Provider>
  );
}
