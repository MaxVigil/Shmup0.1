import { useRef } from 'react';
import type { ReactElement } from 'react';
import { useScreenHeadingFocus } from '../hooks';
import { Text } from '../primitives';

// S04 minimum Hangar destination shell on the Design System screen shell.
// DS-AC-015 / Base AC-052: programmatic focus moves to the Screen heading
// (tabindex="-1") after navigation; Hangar content composition arrives in S06.
export function HangarScreen(): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScreenHeadingFocus(headingRef);
  return (
    <main data-testid="hangar-screen" className="ds-screen">
      <Text as="h1" ref={headingRef} tabIndex={-1} style="heading">
        Hangar
      </Text>
    </main>
  );
}
