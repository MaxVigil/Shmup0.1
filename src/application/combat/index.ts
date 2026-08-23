export {
  loadCombatSession,
  resolveBasicDrone,
  resolveEquippedWeapon,
  resolveGermanFighter,
  resolveMissionSchedule,
  synchronizeSharedModeAfterToggle,
} from './combat-session';
export type { CombatSession, CombatSessionInput } from './combat-session';
export {
  createCombatSimulation,
  createCombatSimulationRuntime,
  stepCombatSimulation,
  submitCombatCommand,
  advanceSimulationFrames,
  removeProjectileById,
  forceFinalGroupSpawn,
  FIXED_STEP_SECONDS,
  MAX_STEPS_PER_FRAME,
} from './combat-simulation';
export type {
  CombatSimulationState,
  CombatSimulationInput,
  CombatSimulationRuntime,
  CombatAircraftState,
  CombatBounds,
  CombatPoint,
  SimulationFrameResult,
} from './combat-simulation';
export {
  advanceProjectile,
  isProjectileOutsideViewport,
  isProjectileRemoved,
  projectileGeometry,
  projectileSpeedPxPerSecond,
  resolveWeaponFireProfile,
  spawnProjectile,
  stepsPerShotFor,
  PROJECTILE_HEIGHT_RATIO,
  PROJECTILE_WIDTH_RATIO,
} from './projectiles';
export type {
  CombatProjectile,
  ProjectileGeometry,
  WeaponFireProfile,
} from './projectiles';
export {
  isEnemyAnyPortionVisible,
  isEnemyFullyOutsideViewport,
  moveEnemy,
  selectEnemyEntryRegion,
  spawnAxisFraction,
  spawnEnemy,
  waypointXFraction,
  waypointYFraction,
} from './enemies';
export type { CombatEnemy, EnemyEntryRegion } from './enemies';
export { planEnemyGroups, spawnGroupDrones } from './spawn-schedule';
export type { PlannedEnemy, PlannedEnemyGroup } from './spawn-schedule';
export {
  aircraftCollisionAabb,
  droneCollisionAabb,
  projectileCollisionAabb,
  AIRCRAFT_HITBOX_HEIGHT_RATIO,
  AIRCRAFT_HITBOX_WIDTH_RATIO,
} from './collision-geometry';
export {
  resolveAircraftContacts,
  resolveProjectileCollisions,
  CONTACT_COOLDOWN_STEPS,
  CONTACT_DAMAGE,
  AIRCRAFT_DAMAGE_FLASH_STEPS,
  DESTROYED_ENEMY_FLASH_STEPS,
  ENEMY_HIT_FLASH_STEPS,
} from './collision';
export type {
  ContactCollisionInput,
  ContactCollisionResult,
  DestroyedEnemyFlash,
  ProjectileCollisionInput,
  ProjectileCollisionResult,
} from './collision';
export {
  resolveMovementConfig,
  brakingDistance,
  MOVEMENT_RATIOS,
  MOVEMENT_TIMING_SECONDS,
} from './movement-config';
export type { MovementConfig } from './movement-config';
export { isPointerInsideViewport } from './input-command';
export {
  routeKeyInput,
  shouldForwardPointerMove,
  KEY_BINDING_TABLE,
} from './input-routing';
export type {
  CombatInputContext,
  CombatKeyBinding,
  RoutedKeyIntent,
} from './input-routing';
export type {
  CombatInputCommand,
  CombatControlMode,
  CombatMovementKey,
} from './input-command';
