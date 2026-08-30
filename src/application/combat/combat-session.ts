import type {
  AircraftDefinition,
  ContentCatalogue,
  EnemyDefinition,
  EnemyGroupSchedule,
  PlayerProjectileConfig,
  WeaponDefinition,
} from '../content';
import {
  BASIC_DRONE,
  GERMAN_FIGHTER,
  MACHINE_GUN,
  MVP_ENEMY_GROUP_SCHEDULE,
} from '../content';
import type { CombatTerminalResult } from '../mission';
import type { MissionSnapshot } from '../mission/snapshot';
import type { AssetPreloadResult } from '../ports';
import type { SessionAction, SessionStore } from '../session';
import type { CombatControlMode } from './input-command';
import type { CombatDebugCommand, CombatObservability } from './debug-command';
import type { WeaponType } from '@domain/index';

export interface CombatSession {
  /**
   * S13 Return to Base seam: resolves the active mission as Aborted through the
   * S12 application seam with the originating `missionInstanceOrdinal` and the
   * current authoritative Combat Hull, then discards the Combat runtime. No
   * reward, recovery, or Mission Result Overlay is produced; Operations opens
   * directly.
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
 * Resolves the validated Basic Drone definition (S10). The catalogue
 * guarantees the single MVP enemy, so the fallback is defensive.
 */
export function resolveBasicDrone(
  catalogue: ContentCatalogue,
): EnemyDefinition {
  return (
    catalogue.enemies.find((enemy) => enemy.type === 'basic-drone') ??
    catalogue.enemies[0] ??
    BASIC_DRONE
  );
}

/**
 * Resolves the temporary v0.1 enemy-group schedule used by the Combat
 * compatibility seam (S10): the accepted legacy single-Interception schedule,
 * consumed until V02-WI-04 routes Combat onto the v0.2 mission registry. It is
 * the single retained seam schedule and never a second mission authority.
 */
export function resolveMissionSchedule(): EnemyGroupSchedule {
  return MVP_ENEMY_GROUP_SCHEDULE;
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
  /** Selected weapon definition resolved from the snapshot (S09, AC-019). */
  readonly weapon: WeaponDefinition;
  /** Shared player-projectile configuration (S09). */
  readonly projectile: PlayerProjectileConfig;
  /** Basic Drone definition resolved from the catalogue (S10). */
  readonly enemy: EnemyDefinition;
  /** Interception enemy-group schedule resolved from the catalogue (S10). */
  readonly schedule: EnemyGroupSchedule;
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
   * WI-02 application command ports: bound at the composition root to the
   * canonical persisted campaign transaction. Combat relays the authoritative
   * terminal trigger + final Combat Hull; the command persists the coherent
   * before/after state first and only then updates the Session Store. Phaser
   * never calculates a result, mutates Credits/Hull, or touches persistence
   * directly (Epic §13, V02-AC-020).
   */
  readonly commitTerminalResult: (
    terminal: CombatTerminalResult,
    combatHullIntegrity: number,
    missionAttemptId: number,
    missionInstanceOrdinal: number,
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
