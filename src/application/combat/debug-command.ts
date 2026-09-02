import type { CombatOverlayId } from './lifecycle';
import type { EnemyType } from '@domain/index';
import type { CombatSimulationState } from './combat-simulation';

/**
 * S13 + V02-WI-04 Debug command boundary (Combat §11.3–11.6; Epic §17,
 * V02-AC-026). Every Debug action is a deterministic application/simulation
 * command; React only relays it to the Combat runtime, which applies the pure
 * transform. The transform reuses existing identity/geometry/content owners and
 * never duplicates spawn, collision, or result logic.
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
  /** Spawns one approved authored Encounter's Arrival Groups deterministically
   *  (Epic §17; already-spawned encounters are strict no-ops). */
  | {
      readonly type: 'combat-debug/spawn-encounter';
      readonly encounterId: string;
    }
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
 * Read-only Debug observability read model (Combat §11.7; Epic §17, V02-WI-04):
 * refreshed only on Debug open and accepted Debug actions while paused — never
 * per frame. God Mode is carried for the canonical Checkbox and is not a
 * displayed row.
 */
export interface CombatObservability {
  readonly combatSeed: number;
  readonly missionTimeSeconds: number;
  readonly countdownSeconds: number;
  readonly currentEncounterId: string | null;
  readonly playerHullIntegrity: number;
  readonly godModeEnabled: boolean;
  readonly activeEnemiesByType: Readonly<Record<EnemyType, number>>;
  /**
   * V02-WI-04 C03: complete rendered bounds of every active enemy (read-only).
   * Used by development observability to prove the authored regular mix is
   * active with all bounds inside the gameplay viewport; it never drives
   * gameplay, mutation, or collision.
   */
  readonly activeEnemyBounds: readonly {
    readonly type: EnemyType;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly destroyedEnemiesByType: Readonly<Record<EnemyType, number>>;
  readonly destroyedByContactEnemiesByType: Readonly<Record<EnemyType, number>>;
  readonly escapedEnemiesByType: Readonly<Record<EnemyType, number>>;
  readonly pendingCombatRewards: number;
  readonly pendingEscapePenalties: number;
}

export function buildCombatObservability(
  state: CombatSimulationState,
): CombatObservability {
  const activeEnemiesByType = emptyRoleRecord();
  const activeEnemyBounds: {
    readonly type: EnemyType;
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
  }[] = [];
  for (const enemy of state.enemies) {
    activeEnemiesByType[enemy.type] += 1;
    activeEnemyBounds.push({
      type: enemy.type,
      centerX: enemy.centerX,
      centerY: enemy.centerY,
      width: enemy.width,
      height: enemy.height,
    });
  }
  return {
    combatSeed: state.missionSeed,
    missionTimeSeconds: state.missionTimeSeconds,
    countdownSeconds: state.countdownSeconds,
    currentEncounterId: state.currentEncounterId,
    playerHullIntegrity: state.playerHullIntegrity,
    godModeEnabled: state.godModeEnabled,
    activeEnemiesByType,
    activeEnemyBounds,
    destroyedEnemiesByType: state.destroyedCountByType,
    destroyedByContactEnemiesByType: state.destroyedByContactCountByType,
    escapedEnemiesByType: state.escapedCountByType,
    pendingCombatRewards: state.pendingCombatRewards,
    pendingEscapePenalties: state.pendingEscapePenalties,
  };
}

function emptyRoleRecord(): Record<EnemyType, number> {
  return {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  };
}
