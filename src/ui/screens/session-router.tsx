import type { ReactElement } from 'react';
import { useSessionState } from '../hooks';
import { BaseShell } from './base-shell';
import { CombatScreen } from './combat-screen';
import { GameOverScreen } from './game-over-screen';

/**
 * Routes the ready application on the authoritative session state (WI-02):
 * while the persisted run is `game-over`, the terminal Game Over Screen is
 * shown; while an active Mission Snapshot exists, Combat is shown and Base is
 * closed (Base §9.4, AC-013); otherwise Base.
 */
export function SessionRouter(): ReactElement {
  const session = useSessionState();
  if (session.runStatus === 'game-over') {
    return <GameOverScreen />;
  }
  return session.activeMission === 'none' ? <BaseShell /> : <CombatScreen />;
}
