import type { CombatOverlayId } from './lifecycle';
import type { CombatSimulationState } from './combat-simulation';

/**
 * S13 Debug command boundary (Combat §11.3–11.6, AC-039–043/061). Every Debug
 * action is a deterministic application/simulation command; React only relays
 * it to the Combat runtime, which applies the pure transform. The transform
 * reuses existing identity/geometry/content owners and never duplicates spawn,
 * collision, or result logic.
 */

/** Approved Set Hull values (Combat §11.3). */
export type CombatDebugHullValue = 25 | 100;

export type CombatDebugCommand =
  | { readonly type: 'combat-debug/god-mode'; readonly enabled: boolean }
  | {
      readonly type: 'combat-debug/set-hull';
      readonly hull: CombatDebugHullValue;
    }
  | { readonly type: 'combat-debug/spawn-standard-enemy' }
  | { readonly type: 'combat-debug/spawn-final-group' }
  | { readonly type: 'combat-debug/win-mission' }
  | { readonly type: 'combat-debug/lose-mission' };

/** Debug eligibility context read from the one authoritative Session Store. */
export interface DebugEligibilityContext {
  /** The Active Mission ordinal, or `null` when no mission is active. */
  readonly activeMissionOrdinal: number | null;
  /** The authoritative Combat lifecycle Overlay. */
  readonly overlay: CombatOverlayId;
  /** Build-time capability passed into the lazy Combat boundary. */
  readonly debugMode: boolean;
}

/**
 * S13-WI01: Debug eligibility enforced at the session/runtime command boundary
 * as well as the UI. A Debug action is accepted only for the matching Active
 * Mission while the authoritative lifecycle Overlay is exactly Debug (the
 * runtime is paused) and build-time DEV_MODE is enabled. Commands issued while
 * running, paused in Pause/Settings, after resolution, from a stale mission,
 * or in production are strict no-ops. The capability is passed in — never read
 * from query strings, storage, or mutable globals.
 */
export function isDebugCommandEligible(
  context: DebugEligibilityContext,
  snapshotMissionInstanceOrdinal: number,
): boolean {
  return (
    context.debugMode &&
    context.activeMissionOrdinal !== null &&
    context.activeMissionOrdinal === snapshotMissionInstanceOrdinal &&
    context.overlay === 'debug'
  );
}

/**
 * Read-only Debug observability read model (Combat §11.7): refreshed only on
 * Debug open and accepted Debug actions while paused — never per frame. God
 * Mode is carried for the canonical Checkbox and is not a displayed row.
 */
export interface CombatObservability {
  readonly missionTimeSeconds: number;
  readonly playerHullIntegrity: number;
  readonly godModeEnabled: boolean;
  readonly activeEnemies: number;
  readonly destroyedEnemies: number;
  readonly escapedEnemies: number;
  readonly finalGroupSpawned: boolean;
}

export function buildCombatObservability(
  state: CombatSimulationState,
): CombatObservability {
  return {
    missionTimeSeconds: state.missionTimeSeconds,
    playerHullIntegrity: state.playerHullIntegrity,
    godModeEnabled: state.godModeEnabled,
    activeEnemies: state.enemies.length,
    destroyedEnemies: state.destroyedEnemyCount,
    escapedEnemies: state.escapedEnemyCount,
    finalGroupSpawned: state.finalGroupSpawned,
  };
}
