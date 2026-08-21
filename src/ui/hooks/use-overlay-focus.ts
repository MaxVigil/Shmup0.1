import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface OverlayFocusOptions {
  readonly open: boolean;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose?: () => void;
}

/**
 * Overlay focus foundation (DS §8.5, §10.4, DS-AC-005/014): when the overlay
 * opens, focus moves to the explicitly approved initial control (or the first
 * focusable element), `Tab`/`Shift+Tab` stay trapped inside the overlay, and
 * closing restores focus to the still-existing opening control.
 *
 * Focus ownership is stable across ordinary rerenders while open (S03-WI01):
 * changing callback identity or controlled content must not restore the opener
 * focus or reset the initial focus until the Overlay actually closes. The
 * latest `onClose` is read through a ref so the effect only reacts to the
 * `open` transition and container/initial-focus identity.
 */
export function useOverlayFocus(options: OverlayFocusOptions): void {
  const onCloseRef = useRef(options.onClose);
  onCloseRef.current = options.onClose;

  useEffect(() => {
    if (!options.open) {
      return;
    }
    const container = options.containerRef.current;
    if (container === null) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const initialTarget = options.initialFocusRef?.current;
    const target = initialTarget ?? firstFocusable(container);
    target?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key === 'Tab') {
        trapTab(container, event);
      }
    };
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [options.open, options.containerRef, options.initialFocusRef]);
}

function firstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

function trapTab(container: HTMLElement, event: KeyboardEvent): void {
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  if (focusables.length === 0) {
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
