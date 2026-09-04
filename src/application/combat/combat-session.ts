import type {
  AircraftDefinition,
  ContentCatalogue,
  EnemyDefinition,
  MissionDefinition,
  PlayerProjectileConfig,
  WeaponDefinition,
} from '../content';
import { GERMAN_FIGHTER, MACHINE_GUN } from '../content';
import type { CombatTerminalResult, MissionResult } from '../mission';
import type { MissionSnapshot } from '../mission/snapshot';
import type { AssetPreloadResult } from '../ports';
import type { SessionAction, SessionStore } from '../session';
import type { CombatControlMode } from './input-command';
import type { CombatDebugCommand, CombatObservability } from './debug-command';
import type { SuccessEconomyRelay } from '../mission/commit-mission-result';
import type { WeaponType } from '@domain/index';

export interface CombatSession {
  /**
   * S13 Return to Base seam: resolves the active mission as Aborted through the
   * S12 application seam with the originating `missionInstanceOrdinal` and the
   * current authoritative Combat Hull, then discards the Combat runtime. No
   * reward, recovery, or Mission Result Overlay is produced; Operations opens
   * directly. Retained unexpanded until V02-WI-05 removes the v0.1 seam.
   * V02-WI-05 C03: once the authoritative terminal result exists or its
   * persistence is pending/held/frozen, this seam is blocked — it can never
   * bypass a committed Defeat/Game Over or its Resume-only recovery.
   */
  readonly requestReturnToBase: () => void;
  /**
   * S13 settings-driven control-mode seam: applies the mutually exclusive
   * movement mode selected by the single shared `Mouse Movement Enabled` value
   * for use on Resume (AC-038).
   */
  readonly setControlMode: (mode: CombatControlMode) => void;
  /** S13 Debug command seam: relays one deterministic application command. */
  readonly submitDebugCommand: (command: CombatDebugCommand) => void;
  /**
   * V02-WI-04 C02 Save Error recovery: retries the SAME immutable frozen
   * terminal payload and originating attempt/instance through the idempotent
   * application command. Single-flight: a retry already in flight is a no-op.
   */
  readonly retryTerminalSave: () => void;
  /**
   * V02-WI-04 C02 Save Conflict recovery: the only continuation is Reload,
   * performing browser navigation without any local reward, result, campaign
   * mutation, or exit animation.
   */
  readonly reloadForSaveConflict: () => void;
  /** S13 read-only Debug observability snapshot (Combat §11.7). */
  readonly getObservability: () => CombatObservability;
  readonly dispose: () => void;
}

/**
 * Resolves the immutable Mission Snapshot's `equippedWeapon` against the
 * validated catalogue (Base §9.4, S09). The catalogue guarantees both MVP
 * weapons, so the Machine Gun fallback is defensive and never reached in a
 * validated build.
 */
export function resolveEquippedWeapon(
  catalogue: ContentCatalogue,
  type: WeaponType,
): WeaponDefinition {
  return (
    catalogue.weapons.find((weapon) => weapon.type === type) ?? MACHINE_GUN
  );
}

/**
 * Resolves the validated German Fighter definition (S11) so the player's
 * maximum Hull Integrity comes from the content catalogue, never a duplicated
 * magic number. The MVP has exactly one aircraft; the fallback is defensive.
 */
export function resolveGermanFighter(
  catalogue: ContentCatalogue,
): AircraftDefinition {
  return (
    catalogue.aircraft.find((aircraft) => aircraft.id === 'german-fighter') ??
    catalogue.aircraft[0] ??
    GERMAN_FIGHTER
  );
}

/** Resolves the authored mission the snapshot started (V02-WI-04). The
 *  validated registry guarantees the mission; the fallback is defensive. */
export function resolveMission(
  catalogue: ContentCatalogue,
  missionId: string,
): MissionDefinition | undefined {
  return catalogue.missions.find((mission) => mission.id === missionId);
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

/**
 * V02-WI-04 C02 typed terminal-persistence completion contract. The campaign
 * transaction resolves to exactly one of these outcomes; only `committed`
 * carries the pre-committed MissionResult and may authorize the deterministic
 * Success exit. `failed`/`rejected` open Save Error (Retry Save); `inert` opens
 * Save Conflict (Reload). A rejected Promise is caught and never surfaces as an
 * unhandled rejection.
 */
export type TerminalCommitOutcome =
  | { readonly status: 'committed'; readonly result: MissionResult }
  | { readonly status: 'inert' }
  | { readonly status: 'failed' }
  | { readonly status: 'rejected'; readonly error: unknown };

export interface CombatSessionInput {
  readonly snapshot: MissionSnapshot;
  readonly preparedAssets: AssetPreloadResult;
  readonly container: HTMLElement;
  /** Selected weapon definition resolved from the snapshot (S09, AC-019). */
  readonly weapon: WeaponDefinition;
  /** Shared player-projectile configuration (S09). */
  readonly projectile: PlayerProjectileConfig;
  /** Authored mission definition resolved from the catalogue (V02-WI-04). */
  readonly mission: MissionDefinition;
  /** v0.2 regular-enemy definitions resolved from the catalogue (V02-WI-04). */
  readonly enemies: readonly EnemyDefinition[];
  /** Validated German Fighter maximum Hull (S11, from the content seam). */
  readonly playerMaximumHullIntegrity: number;
  /**
   * The one application-owned Session Store (S08, S13): the Combat session
   * synchronises the single `Mouse Movement Enabled` value through its
   * dispatch, relays terminal/lifecycle/browser-safety commands, derives the
   * authoritative paused/running lifecycle by subscription, and invokes the
   * S12 abortMission seam. The store remains the single source of truth.
   */
  readonly store: SessionStore;
  /**
   * S13-WI01: build-time DEV_MODE capability passed into the lazy Combat
   * boundary. The runtime accepts Debug commands only when this is true and
   * the authoritative lifecycle is exactly the Debug Overlay for the matching
   * Mission Instance; it is never read from query strings, storage, or
   * mutable globals.
   */
  readonly debugMode: boolean;
  /**
   * WI-02 + V02-WI-04 application command port bound at the composition root
   * to the canonical persisted campaign transaction. Combat relays the
   * authoritative terminal trigger + final Combat Hull + (on Success) the
   * pending-economy relay; the command persists the coherent before/after state
   * first and then reports one typed `TerminalCommitOutcome` through
   * `onComplete`. Phaser never calculates a result, mutates Credits/Hull, or
   * touches persistence directly (Epic §13, V02-AC-020). On a committed Success
   * the entry defers the session dispatch until the deterministic exit sequence
   * completes; a committed Defeat/Game Over is dispatched by the entry's
   * lifecycle boundary — immediately when no browser-safety latch is set, or
   * held behind the explicit Resume-only continuation when the write committed
   * while the tab was hidden or focus was lost (V02-WI-05 C03, Epic §13.7).
   */
  readonly commitTerminalResult: (
    terminal: CombatTerminalResult,
    combatHullIntegrity: number,
    missionAttemptId: number,
    missionInstanceOrdinal: number,
    successEconomy?: SuccessEconomyRelay,
    onComplete?: (outcome: TerminalCommitOutcome) => void,
  ) => void;
  /** Bound Aborted (Return to Base) application command through the seam. */
  readonly abortMission: (
    combatHullIntegrity: number,
    missionAttemptId: number,
    missionInstanceOrdinal: number,
  ) => void;
}

/**
 * Returns `true` only while the caller still owns the originating Active
 * Mission and may create its Combat presentation. The guard is evaluated
 * after the lazy module import and immediately before synchronous owner
 * creation, so an aborted mission never creates a late runtime, canvas, or
 * listener in a detached container (S13-WI01).
 */
export type CombatSessionCreationGuard = () => boolean;

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
  mayCreate: CombatSessionCreationGuard = () => true,
): Promise<CombatSession | null> {
  const entry = await import('@combat-presentation/entry');
  if (!mayCreate()) {
    return null;
  }
  return entry.createCombatSession(input);
}
