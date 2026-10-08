import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ModalOverlay({ children }) {
  useLayoutEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverflowX = body.style.overflowX;

    body.style.overflow = 'hidden';
    body.style.overflowX = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overflowX = previousOverflowX;
    };
  }, []);

  // Render fixed overlays at the document root so app-shell transforms and
  // horizontal scrolling cannot shift the dialog away from the viewport center.
  const portalRoot = document.body;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto p-4">
      {children}
    </div>,
    portalRoot
  );
}
