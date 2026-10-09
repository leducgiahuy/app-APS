import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ModalOverlay({ children, allowBackgroundScroll = false }) {
  const overlayRef = useRef(null);
  useLayoutEffect(() => {
    if (allowBackgroundScroll) {
      const overlay = overlayRef.current;
      const canScroll = element => {
        const overflow = getComputedStyle(element).overflowY;
        return /auto|scroll/.test(overflow) && element.scrollHeight > element.clientHeight;
      };
      const scrollBackground = event => {
        if (!event.deltaY) return;
        // Keep scrolling long dialogs inside the dialog before moving the page.
        for (let element = event.target; element instanceof HTMLElement && overlay.contains(element); element = element.parentElement) {
          if (canScroll(element) && (event.deltaY < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1)) return;
        }
        let target;
        for (const underlying of document.elementsFromPoint(event.clientX, event.clientY)) {
          if (overlay.contains(underlying)) continue;
          for (let element = underlying; element instanceof HTMLElement; element = element.parentElement) {
            if (canScroll(element)) { target = element; break; }
          }
          if (target) break;
        }
        target ||= document.querySelector('[data-modal-background-scroll]') || document.scrollingElement;
        if (target) {
          event.preventDefault();
          const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1;
          target.scrollTop += event.deltaY * factor;
        }
      };
      overlay.addEventListener('wheel', scrollBackground, { passive: false });
      return () => overlay.removeEventListener('wheel', scrollBackground);
    }
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverflowX = body.style.overflowX;

    body.style.overflow = 'hidden';
    body.style.overflowX = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overflowX = previousOverflowX;
    };
  }, [allowBackgroundScroll]);

  // Render fixed overlays at the document root so app-shell transforms and
  // horizontal scrolling cannot shift the dialog away from the viewport center.
  const portalRoot = document.body;

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto p-4">
      {children}
    </div>,
    portalRoot
  );
}
