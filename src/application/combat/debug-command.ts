import type { CombatOverlayId } from './lifecycle';
import type { EnemyType } from '@domain/index';
import {
  FIXED_STEPS_PER_SECOND,
  type CombatSimulationState,
} from './combat-simulation';
import type { ElitePhase } from './enemies';

/**
 * S13 + V02-WI-04 Debug command boundary (Combat §11.3–11.6; Epic §17,
 * V02-AC-026). Every Debug action is a deterministic application/simulation
 * command; React only relays it to the Combat runtime, which applies the pure
 * transform. The transform reuses existing identity/geometry/content owners and
 * never duplicates spawn, collision, phase, or result logic.
 * V02-WI-07 D01 completes the Combat-owned Epic §17 surface.
 */

/** Approved Set Hull values (Combat §11.3). */
export type CombatDebugHullValue = 25 | 100;

/** The two active Elite phases a Debug action may request (Epic §17). */
export type CombatDebugElitePhase = 'armoured' | 'vulnerable';

export type CombatDebugCommand =
  | { readonly type: 'combat-debug/god-mode'; readonly enabled: boolean }
  | {
      readonly type: 'combat-debug/set-hull';
      readonly hull: CombatDebugHullValue;
    }
  /**
   * Spawns exactly one approved enemy type deterministically through its
   * canonical creation owner (Epic §17, V02-AC-026). Basic and Ranged use the
   * canonical engagement-band-centre Top entry (the Aircraft's initial
   * automatic-fire column); Hunter, which owns no Top-entry state machine,
   * reuses the CURRENT mission's authored Side Placement and stays a strict
   * no-op only for a mission that authors no Hunter; Elite is created at its
   * fixed anchor by `createEliteAtAnchor`, never by the regular-enemy factory.
   *
   * Every spawned enemy receives a stable Debug identity outside the authored
   * member-ordinal range, and each spawned Ranged/Elite additionally owns its
   * own canonical per-enemy RNG stream under that identity, so a Debug spawn
   * can never share, replace, consume, or shift an authored enemy's stream.
   */
  | {
      readonly type: 'combat-debug/spawn-enemy';
      readonly enemyType: EnemyType;
    }
  /** Spawns one approved authored Encounter's Arrival Groups deterministically
   *  (Epic §17; already-spawned encounters are strict no-ops). */
  | {
      readonly type: 'combat-debug/spawn-encounter';
      readonly encounterId: string;
    }
  /**
   * Moves the current Elite to an active phase through the one authoritative
   * phase-transition owner (`enterElitePhase`), activating a not-yet-active
   * Elite at its canonical anchor first. A simulation without an Elite is a
   * strict no-op.
   */
  | {
      readonly type: 'combat-debug/set-elite-phase';
      readonly phase: CombatDebugElitePhase;
    }
  | { readonly type: 'combat-debug/win-mission' }
  | { readonly type: 'combat-debug/lose-mission' }
  /**
   * Forces a successful Evacuation through the same immutable terminal and
   * shared committed-exit owner the natural five-second zero step uses
   * (Epic §17, V02-AC-026). It does not run a second countdown, reimplement
   * economy, or write a result directly.
   */
  | { readonly type: 'combat-debug/evacuate-mission' };

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
 * Current-Elite read model (Epic §17): the authoritative phase of the current
 * Elite and the authoritative elapsed time inside it. `phaseElapsedSeconds` is
 * derived from the fixed `1/60 s` phase steps (`phaseStepsElapsed / 60`) and is
 * `0` while the Elite is still `entering`, i.e. before it owns an active phase.
 */
export interface CombatObservabilityElite {
  readonly phase: ElitePhase;
  readonly phaseElapsedSeconds: number;
}

/**
 * Read-only Debug observability read model (Combat §11.7; Epic §17, V02-WI-04/
 * WI-07): refreshed only on Debug open and accepted Debug actions while paused —
 * never per frame. God Mode is carried for the canonical Checkbox and is not a
 * displayed row.
 */
export interface CombatObservability {
  readonly combatSeed: number;
  readonly missionTimeSeconds: number;
  readonly countdownSeconds: number;
  readonly currentEncounterId: string | null;
  /** Epic §17: the current Elite's phase/phase time, or `null` when this
   *  simulation has no Elite at all. */
  readonly elite: CombatObservabilityElite | null;
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
  /**
   * Epic §17 destruction CAUSE by role: destroyed by the player's projectile.
   * Derived at this read-model owner from the authoritative total and contact
   * accounting (V02-WI-07 D01-C01); the two causes plus contact are exhaustive
   * and never overlap.
   */
  readonly destroyedByProjectileEnemiesByType: Readonly<
    Record<EnemyType, number>
  >;
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
  // The current Elite in stable creation order (the canonical authored mission
  // has exactly one). `null` when the simulation holds no Elite at all.
  let elite: CombatObservabilityElite | null = null;
  for (const enemy of state.enemies) {
    activeEnemiesByType[enemy.type] += 1;
    activeEnemyBounds.push({
      type: enemy.type,
      centerX: enemy.centerX,
      centerY: enemy.centerY,
      width: enemy.width,
      height: enemy.height,
    });
    if (enemy.kind === 'elite' && elite === null) {
      elite = {
        phase: enemy.phase,
        phaseElapsedSeconds: enemy.phaseStepsElapsed / FIXED_STEPS_PER_SECOND,
      };
    }
  }
  return {
    combatSeed: state.missionSeed,
    missionTimeSeconds: state.missionTimeSeconds,
    countdownSeconds: state.countdownSeconds,
    currentEncounterId: state.currentEncounterId,
    elite,
    playerHullIntegrity: state.playerHullIntegrity,
    godModeEnabled: state.godModeEnabled,
    activeEnemiesByType,
    activeEnemyBounds,
    destroyedEnemiesByType: state.destroyedCountByType,
    destroyedByProjectileEnemiesByType: destroyedByProjectileCounts(
      state.destroyedCountByType,
      state.destroyedByContactCountByType,
    ),
    destroyedByContactEnemiesByType: state.destroyedByContactCountByType,
    escapedEnemiesByType: state.escapedCountByType,
    pendingCombatRewards: state.pendingCombatRewards,
    pendingEscapePenalties: state.pendingEscapePenalties,
  };
}

/** The four approved enemy roles (Epic §9), in canonical vocabulary order. */
const ROLE_TYPES: readonly EnemyType[] = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
  'elite-drone',
];

function emptyRoleRecord(): Record<EnemyType, number> {
  return {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  };
}

/**
 * V02-WI-07 D01-C01 exact per-role destruction CAUSE (Epic §17, V02-AC-026).
 *
 * The authoritative simulation accounts every destroyed enemy exactly once in
 * `destroyedCountByType` and the contact-cause subset in
 * `destroyedByContactCountByType` (Hunter kamikaze contact; contact never
 * destroys Basic, Ranged, or the Elite). Player-projectile destruction is
 * therefore the exact per-role remainder. The non-negative domain invariant
 * `contact ≤ total` is ENFORCED here: a contradictory authoritative state
 * throws instead of silently mis-reporting a cause in the development Debug
 * surface, so a future third cause cannot corrupt the read model unnoticed.
 */
function destroyedByProjectileCounts(
  total: Readonly<Record<EnemyType, number>>,
  byContact: Readonly<Record<EnemyType, number>>,
): Record<EnemyType, number> {
  const byProjectile = emptyRoleRecord();
  for (const role of ROLE_TYPES) {
    const totalCount = total[role] ?? 0;
    const contactCount = byContact[role] ?? 0;
    if (contactCount > totalCount) {
      throw new Error(
        `Combat observability invariant violated: ${contactCount} contact-destroyed ${role} exceeds the ${totalCount} total destroyed.`,
      );
    }
    byProjectile[role] = totalCount - contactCount;
  }
  return byProjectile;
}
