import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ViewportMenu({ anchorRef, panelRef, children, className = '' }) {
  const localRef = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const reposition = () => {
      const anchor = anchorRef.current;
      const panel = localRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const gap = 4;
      const width = Math.min(240, window.innerWidth - margin * 2);
      const below = Math.max(0, window.innerHeight - rect.bottom - margin - gap);
      const above = Math.max(0, rect.top - margin - gap);
      const desiredHeight = panel.scrollHeight + 2;
      const upward = below < desiredHeight && above > below;
      const maxHeight = Math.max(0, Math.min(desiredHeight, upward ? above : below, window.innerHeight - margin * 2));
      const top = upward ? rect.top - gap - maxHeight : rect.bottom + gap;
      setPosition({ width, maxHeight, left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)), top: Math.max(margin, Math.min(top, window.innerHeight - maxHeight - margin)) });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const observer = new ResizeObserver(reposition);
    if (anchorRef.current) observer.observe(anchorRef.current);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      observer.disconnect();
    };
  }, [anchorRef]);

  return createPortal(
    <div role="menu" ref={node => { localRef.current = node; if (panelRef) panelRef.current = node; }}
      style={{ ...position, position: 'fixed', zIndex: 1200, visibility: position ? 'visible' : 'hidden', overflowY: 'auto', overscrollBehavior: 'contain' }}
      className={`box-border rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      {children}
    </div>, document.body
  );
}
