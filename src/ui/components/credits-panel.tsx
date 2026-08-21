import type { ReactElement } from 'react';
import { Panel, Text } from '../primitives';

export interface CreditsPanelProps {
  readonly credits: number;
}

/**
 * Canonical Credits Panel (DS §8.9): compact Panel with one primary `text-body`
 * element `Credits: <current value>`. It displays only the current shared
 * session value and has no currency icon or animation.
 */
export function CreditsPanel({ credits }: CreditsPanelProps): ReactElement {
  return (
    <Panel variant="compact" className="ds-credits-panel">
      <Text style="body">Credits: {credits}</Text>
    </Panel>
  );
}
