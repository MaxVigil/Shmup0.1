import type { ReactElement, ReactNode, Ref } from 'react';

export interface BaseNavigationProps {
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLElement>;
}

/**
 * Canonical Base Navigation shell (DS §8.6, Base §3.2): a transparent,
 * borderless vertical layer on the left, composed of individually opaque
 * Navigation Items. Behaviour (active state, screen-transition focus) is wired
 * by the Base slices.
 */
export function BaseNavigation({
  children,
  ref,
}: BaseNavigationProps): ReactElement {
  return (
    <nav ref={ref} className="ds-base-navigation" aria-label="Base Navigation">
      {children}
    </nav>
  );
}
