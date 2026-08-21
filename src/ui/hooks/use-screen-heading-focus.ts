import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Screen-transition focus foundation (DS §10.4, DS-AC-015): when a Base Screen
 * opens, programmatic focus moves to the new Screen heading (which carries
 * `tabIndex={-1}` and is therefore not part of sequential Tab order).
 */
export function useScreenHeadingFocus(
  headingRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
}
