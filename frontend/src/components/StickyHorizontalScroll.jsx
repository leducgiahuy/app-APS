import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './StickyHorizontalScroll.css';

/**
 * Khung cuộn ngang cho bảng rộng, có thanh kéo ngang "dính" ở đáy màn hình:
 * cuộn trang lên xuống trong phạm vi bảng vẫn luôn thấy thanh kéo; qua khỏi bảng thì thanh nằm lại ở đáy bảng.
 * Thanh gốc của khung được ẩn, thanh dính cuộn đồng bộ hai chiều với bảng. Bảng không rộng hơn khung thì không hiện thanh.
 * Lưu ý: các khung cha giữa bảng và vùng cuộn của trang không được đặt overflow: hidden (dùng overflow: clip nếu cần cắt góc).
 */
export default function StickyHorizontalScroll({ className = '', children }) {
  const contentRef = useRef(null);
  const barRef = useRef(null);
  const [size, setSize] = useState({ scroll: 0, client: 0 });

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    const measure = () => setSize(current => current.scroll === content.scrollWidth && current.client === content.clientWidth ? current : { scroll: content.scrollWidth, client: content.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    return () => observer.disconnect();
  }, []);

  // Cuộn một bên thì kéo bên kia theo; bên kia đã đúng vị trí thì thôi (chặn vòng lặp sự kiện scroll qua lại).
  const follow = (from, to) => {
    if (!from || !to || Math.abs(to.scrollLeft - from.scrollLeft) < 1) return;
    to.scrollLeft = from.scrollLeft;
  };
  const overflowing = size.scroll > size.client + 1;
  useEffect(() => { if (overflowing && barRef.current && contentRef.current) barRef.current.scrollLeft = contentRef.current.scrollLeft; }, [overflowing]);

  return <div className={`sticky-hscroll ${className}`.trim()}>
    <div ref={contentRef} className="sticky-hscroll-content" onScroll={() => follow(contentRef.current, barRef.current)}>{children}</div>
    {overflowing && <div ref={barRef} className="sticky-hscroll-bar" aria-hidden="true" onScroll={() => follow(barRef.current, contentRef.current)}>
      <div style={{ width: size.scroll, height: 1 }} />
    </div>}
  </div>;
}
