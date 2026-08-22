import type {
  ContentCatalogue,
  EnemyDefinition,
  EnemyGroupSchedule,
  PlayerProjectileConfig,
  WeaponDefinition,
} from '../content';
import { BASIC_DRONE, INTERCEPTION, MACHINE_GUN } from '../content';
import type { MissionSnapshot } from '../mission/snapshot';
import type { AssetPreloadResult } from '../ports';
import type { SessionAction } from '../session';
import type { CombatControlMode } from './input-command';
import type { WeaponType } from '@domain/index';

export interface CombatSession {
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
 * Resolves the validated Interception enemy-group schedule (S10). The MVP has
 * exactly one mission; the fallback is defensive and never reached in a
 * validated build.
 */
export function resolveMissionSchedule(
  catalogue: ContentCatalogue,
): EnemyGroupSchedule {
  return catalogue.missions[0]?.schedule ?? INTERCEPTION.schedule;
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
