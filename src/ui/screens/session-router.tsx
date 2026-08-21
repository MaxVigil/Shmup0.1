import type { ReactElement } from 'react';
import { useSessionState } from '../hooks';
import { BaseShell } from './base-shell';
import { CombatScreen } from './combat-screen';

/**
 * Routes the ready application between the Base shell and the Combat Screen on
 * the authoritative session state: while an active Mission Snapshot exists,
 * Combat is shown and Base is closed (Base §9.4, AC-013); otherwise Base.
 */
export function SessionRouter(): ReactElement {
  const session = useSessionState();
  return session.activeMission === 'none' ? <BaseShell /> : <CombatScreen />;
}
