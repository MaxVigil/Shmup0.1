import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** The one canonical selector for elements that may receive sequential or
 *  programmatic focus inside a blocking Overlay (DS §8.5, §10.3–10.4). */
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
  /**
   * V02-WI-05 E04: the explicit still-existing opening control when the DOM
   * cannot identify it at open time. A real browser blurs a control that the
   * same commit disables (e.g. the Combat `Evacuate` affordance is
   * visible-but-disabled while its confirmation is open), so
   * `document.activeElement` no longer names the opener when this effect runs.
   * Supplying the opener explicitly keeps DS §8.5/DS-AC-005 restoration exact.
   */
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose?: () => void;
}

/**
 * Overlay focus foundation (DS §8.5, §10.4, DS-AC-005/014): when the overlay
 * opens, focus moves to the explicitly approved initial control (or the first
 * focusable element), `Tab`/`Shift+Tab` stay trapped inside the overlay,
 * closing restores focus to the still-existing opening control, and a focus
 * loss caused by an inert Scrim or static-content pointer interaction is
 * repaired back inside the Surface without cancelling any native pointer
 * default (V02-WI-05 E04 C01).
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
  // V02-WI-05 E04 C01: the current `open` value is tracked during render so the
  // containment handlers can tell an ordinary focus loss from the teardown of a
  // closing Overlay, which commits before the effect cleanup runs.
  const openRef = useRef(options.open);
  openRef.current = options.open;

  useEffect(() => {
    if (!options.open) {
      return;
    }
    const container = options.containerRef.current;
    if (container === null) {
      return;
    }
    const previouslyFocused =
      options.restoreFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const initialTarget = options.initialFocusRef?.current;
    const target = initialTarget ?? firstFocusable(container);
    target?.focus();
    let lastFocusedInside: HTMLElement | null =
      target !== null && container.contains(target) ? target : null;

    // V02-WI-05 E04 C01 containment (DS §8.5, DS-AC-005/014): an inert Scrim or
    // static-content pointer interaction must not leave a blocking Overlay
    // without usable keyboard focus. A real browser blurs to `<body>` on a
    // mousedown over non-focusable content, which would drop `Esc` handling and
    // `Tab` containment. Focus is repaired by returning it to the last control
    // that lived inside the Surface. The repair never calls `preventDefault`,
    // so native content defaults (text selection, scrollbar dragging) are
    // preserved, and it waits for the pointer gesture to end so a drag is never
    // interrupted.
    let pointerGestureActive = false;
    let restorePending = false;
    const restoreContainment = (): void => {
      if (
        !openRef.current ||
        !container.isConnected ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLElement && container.contains(active)) {
        return;
      }
      const restore =
        lastFocusedInside !== null && container.contains(lastFocusedInside)
          ? lastFocusedInside
          : firstFocusable(container);
      if (restore === null || !restore.isConnected) {
        return;
      }
      restore.focus();
    };
    const handleFocusIn = (event: FocusEvent): void => {
      const next = event.target;
      if (next instanceof HTMLElement && container.contains(next)) {
        lastFocusedInside = next;
      }
    };
    const handleFocusOut = (event: FocusEvent): void => {
      // A closing Overlay removes its focused control: the browser reports that
      // focus loss while the Surface is still being torn down, and repairing
      // focus into the doomed subtree would leave the document with no usable
      // focus target (swallowing every later key event). Containment therefore
      // applies only while the Overlay is still open and the control that lost
      // focus is still mounted.
      const lost = event.target;
      if (!openRef.current || !(lost instanceof Node) || !lost.isConnected) {
        return;
      }
      const next = event.relatedTarget;
      if (next instanceof Node && container.contains(next)) {
        return;
      }
      if (pointerGestureActive) {
        restorePending = true;
        return;
      }
      restoreContainment();
    };
    const handlePointerDown = (): void => {
      pointerGestureActive = true;
      restorePending = false;
    };
    const handlePointerEnd = (): void => {
      pointerGestureActive = false;
      if (restorePending) {
        restorePending = false;
        restoreContainment();
      }
    };

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
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', handlePointerEnd, true);
    document.addEventListener('pointercancel', handlePointerEnd, true);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', handlePointerEnd, true);
      document.removeEventListener('pointercancel', handlePointerEnd, true);
      previouslyFocused?.focus();
    };
  }, [
    options.open,
    options.containerRef,
    options.initialFocusRef,
    options.restoreFocusRef,
  ]);
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
