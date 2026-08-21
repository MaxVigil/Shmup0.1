import type { ReactElement } from 'react';
import { Button, Text } from '../primitives';

export interface FatalStartupViewProps {
  readonly onReload: () => void;
}

export function FatalStartupView({
  onReload,
}: FatalStartupViewProps): ReactElement {
  return (
    <main data-testid="fatal-startup-view" className="ds-screen">
      <Text as="p" style="body">
        Unable to start game.
      </Text>
      <Button variant="secondary" onClick={onReload}>
        Reload
      </Button>
    </main>
  );
}
