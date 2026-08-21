import { useRef } from 'react';
import type { ReactElement } from 'react';
import { useScreenHeadingFocus } from '../hooks';
import { Text } from '../primitives';

// Minimum S02 destination shell, now on the Design System shell (S03).
// DS-AC-015: programmatic focus moves to the Screen heading (tabindex="-1").
export function OperationsScreen(): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScreenHeadingFocus(headingRef);
  return (
    <main data-testid="operations-screen" className="ds-screen">
      <Text as="h1" ref={headingRef} tabIndex={-1} style="heading">
        Operations
      </Text>
    </main>
  );
}
