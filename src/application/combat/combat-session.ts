import type { MissionSnapshot } from '../mission/snapshot';
import type { AssetPreloadResult } from '../ports';
import type { SessionAction } from '../session';
import type { CombatControlMode } from './input-command';

export interface CombatSession {
  readonly dispose: () => void;
}

/**
 * AC-064 shared-setting synchronization: after an accepted `F` toggle that
 * actually changed the active mode, the single shared-session `Mouse Movement
 * Enabled` value is dispatched exactly once to match. An unchanged mode (e.g.
 * an F that was rejected while input routing is blocked) never dispatches.
 */
export function synchronizeSharedModeAfterToggle(
  before: CombatControlMode,
  after: CombatControlMode,
  dispatch: (action: SessionAction) => void,
): void {
  if (after === before) {
    return;
  }
  dispatch({
    type: 'session/set-mouse-movement-enabled',
    enabled: after === 'mouse',
  });
}

export interface CombatSessionInput {
  readonly snapshot: MissionSnapshot;
  readonly preparedAssets: AssetPreloadResult;
  readonly container: HTMLElement;
  /**
   * Shared-session dispatch (S08, AC-064): the Combat session synchronises the
   * single `Mouse Movement Enabled` value exactly once per accepted `F`
   * toggle through this action dispatch.
   */
  readonly dispatch: (action: SessionAction) => void;
}

/**
 * Lazy Combat boundary (Repository Architecture §9, S07–S08): entering Combat
 * dynamically imports the Combat presentation entry — Phaser and the
 * `combat-presentation` module are never statically reachable from Boot/Base
 * and are code-split into a separate chunk by Vite. The application prepares
 * the immutable Mission Snapshot before this import. The returned session
 * owns the deterministic simulation runtime, the Phaser Game/Scene, the HUD
 * bridge, and its disposal contract.
 */
export async function loadCombatSession(
  input: CombatSessionInput,
): Promise<CombatSession> {
  const entry = await import('@combat-presentation/entry');
  return entry.createCombatSession(input);
}
