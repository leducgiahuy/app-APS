import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ModalOverlay({ children }) {
  useLayoutEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverflowX = body.style.overflowX;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    body.style.overflowX = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overflowX = previousOverflowX;
      body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  const portalRoot = document.querySelector('.app-shell') || document.body;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto p-4 bg-slate-950/10 dark:bg-slate-950/30 backdrop-blur-sm">
      {children}
    </div>,
    portalRoot
  );
}
