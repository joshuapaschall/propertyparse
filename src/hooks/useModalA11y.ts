import { useEffect, useRef } from 'react';

/**
 * Modal accessibility primitive. Call once inside any modal component
 * with `open` and `onClose`.
 *
 * Provides:
 *  - Escape key closes the modal (when open) — bound to the dialog
 *    container, so nested modals work correctly: the innermost modal's
 *    handler fires first (DOM bubble) and can stopPropagation before
 *    a parent modal's handler sees the event.
 *  - Body scroll lock while open (restored on close).
 *  - Focus trap: Tab/Shift+Tab cycles inside the dialog — also bound
 *    to the container, for the same nested-modal reason.
 *  - Initial focus on first focusable element after open (or the
 *    container itself if none found).
 *  - Restores focus to the previously-focused element on close.
 *
 * Returns a ref that MUST be attached to the modal's outermost
 * `<div role="dialog">` element. The ref drives focus trap, initial
 * focus, AND the keydown listeners — none of those work without it.
 *
 * Closes B49.
 */
export function useModalA11y<TElement extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
) {
  const containerRef = useRef<TElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const firstFocusable = container.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        container.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return containerRef;
}
