import type { ReactElement } from 'react';
import { BootView, FatalStartupView, SessionRouter } from '@ui/screens';

export type AppPhase = 'boot' | 'ready' | 'fatal';

export interface AppProps {
  readonly phase: AppPhase;
  readonly onReload: () => void;
}

export function App({ phase, onReload }: AppProps): ReactElement {
  if (phase === 'boot') {
    return <BootView />;
  }
  if (phase === 'fatal') {
    return <FatalStartupView onReload={onReload} />;
  }
  return <SessionRouter />;
}
