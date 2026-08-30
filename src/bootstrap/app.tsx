import type { ReactElement } from 'react';
import {
  BootView,
  FatalStartupView,
  SaveDataErrorScreen,
  SessionRouter,
} from '@ui/screens';

export type AppPhase = 'boot' | 'ready' | 'save-data-error' | 'fatal';

export interface AppProps {
  readonly phase: AppPhase;
  readonly onReload: () => void;
  /** Called after a confirmed New Game replaces an unreadable campaign. */
  readonly onSaveDataResolved: () => void;
}

export function App({
  phase,
  onReload,
  onSaveDataResolved,
}: AppProps): ReactElement {
  if (phase === 'boot') {
    return <BootView />;
  }
  if (phase === 'fatal') {
    return <FatalStartupView onReload={onReload} />;
  }
  if (phase === 'save-data-error') {
    // The campaign could not be validated or migrated (V02-AC-021); the
    // unreadable data stays untouched until a confirmed New Game replaces it.
    return <SaveDataErrorScreen onResolved={onSaveDataResolved} />;
  }
  return <SessionRouter />;
}
