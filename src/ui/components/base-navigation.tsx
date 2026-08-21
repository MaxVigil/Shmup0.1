import type { ReactElement, ReactNode } from 'react';
import { Panel } from '../primitives';

export interface BaseNavigationProps {
  readonly children?: ReactNode;
}

/**
 * Canonical Base Navigation shell (DS §8.6): vertical panel on the left,
 * composed of Navigation Items. Behaviour (active state, transitions) is wired
 * by the Base slices.
 */
export function BaseNavigation({
  children,
}: BaseNavigationProps): ReactElement {
  return (
    <Panel as="nav" className="ds-base-navigation" aria-label="Base Navigation">
      {children}
    </Panel>
  );
}
