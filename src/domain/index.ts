/**
 * Narrow public entry for the framework-independent Domain.
 *
 * Domain never imports content, application, UI, platform or test-support; it
 * receives content definitions and random streams through typed parameters.
 */
export { aircraftId, pilotId } from './identifiers';
export type { AircraftId, PilotId } from './identifiers';
export {
  ENEMY_TYPES,
  HULL_INTEGRITY_MAX,
  HULL_INTEGRITY_MIN,
  MISSION_IDS,
  MISSION_TYPES,
  WEAPON_TYPES,
  isCredits,
  isDamage,
  isEnemyType,
  isFireRate,
  isHullIntegrity,
  isMissionId,
  isMissionType,
  isPositiveFinite,
  isSeconds,
  isWeaponType,
} from './model';
export type { EnemyType, MissionId, MissionType, WeaponType } from './model';
export * from './persistence';
export { createAabb, isSeparated, overlaps } from './geometry';
export type { Aabb } from './geometry';
export {
  COMBAT_MISSION_STREAM,
  PILOT_SELECTION_ORDINAL,
  PILOT_SELECTION_STREAM,
  RNG_INPUT_VERSION,
  Mulberry32,
  createCombatMissionStream,
  createPilotSelectionStream,
  createStream,
  deriveStreamSeed,
  fnv1a32,
} from './random';
