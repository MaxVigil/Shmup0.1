import type { ReactElement } from 'react';

export interface FatalStartupViewProps {
  readonly onReload: () => void;
}

export function FatalStartupView({
  onReload,
}: FatalStartupViewProps): ReactElement {
  return (
    <main data-testid="fatal-startup-view">
      <p>Unable to start game.</p>
      <button type="button" onClick={onReload}>
        Reload
      </button>
    </main>
  );
}
