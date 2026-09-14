import { useRef } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { useOverlayFocus } from '../hooks';

export interface OverlayProps {
  readonly open: boolean;
  /** id of the heading element that names the dialog (aria-labelledby). */
  readonly labelledBy: string;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * V02-WI-05 E04: the explicit still-existing control that opened this
   * Overlay, used only when the browser has already blurred it at open time
   * (a control disabled by the same commit cannot keep focus). Omit it when the
   * ordinary `document.activeElement` opener capture is reliable.
   */
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly header?: ReactNode;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Canonical Overlay primitive (DS §8.5, DS-AC-005/006/014): Scrim + Overlay
 * Surface (Header / Content / Actions), initial focus, focus trap, Esc close
 * and focus restoration to the still-existing opener.
 *
 * V02-WI-05 E04 C01: this primitive deliberately touches no pointer event. An
 * inert Scrim or static-content click keeps its native defaults (text
 * selection, scrollbar dragging) and containment is owned by the canonical
 * overlay focus hook instead.
 */
export function Overlay({
  open,
  labelledBy,
  initialFocusRef,
  restoreFocusRef,
  onClose,
  header,
  actions,
  children,
  className,
}: OverlayProps): ReactElement | null {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useOverlayFocus({
    open,
    containerRef: surfaceRef,
    ...(initialFocusRef === undefined ? {} : { initialFocusRef }),
    ...(restoreFocusRef === undefined ? {} : { restoreFocusRef }),
    onClose,
  });
  if (!open) {
    return null;
  }
  const surfaceClass =
    className === undefined
      ? 'ds-overlay__surface'
      : `ds-overlay__surface ${className}`;
  return (
    <div className="ds-overlay">
      <div className="ds-overlay__scrim" aria-hidden="true" />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={surfaceClass}
      >
        {header === undefined ? null : (
          <div className="ds-overlay__header">{header}</div>
        )}
        <div className="ds-overlay__content">{children}</div>
        {actions === undefined ? null : (
          <div className="ds-overlay__actions">{actions}</div>
        )}
      </div>
    </div>
  );
}
