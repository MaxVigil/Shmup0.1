export {
  loadCombatSession,
  resolveEquippedWeapon,
  resolveGermanFighter,
  resolveMission,
  synchronizeSharedModeAfterToggle,
} from './combat-session';
export type {
  CombatSession,
  CombatSessionCreationGuard,
  CombatSessionInput,
  TerminalCommitOutcome,
} from './combat-session';
export {
  createCombatSimulation,
  createCombatSimulationRuntime,
  stepCombatSimulation,
  submitCombatCommand,
  advanceSimulationFrames,
  applyDebugCommand,
  FIXED_STEP_SECONDS,
  MAX_STEPS_PER_FRAME,
} from './combat-simulation';
export type {
  CombatSimulationState,
  CombatSimulationInput,
  CombatSimulationRuntime,
  CombatAircraftState,
  CombatBounds,
  CombatBoundsSize,
  CombatPoint,
  SimulationFrameResult,
} from './combat-simulation';
export {
  combatLifecycleReducer,
  IDLE_COMBAT_LIFECYCLE,
  RUNNING_COMBAT_LIFECYCLE,
} from './lifecycle';
export type {
  CombatLifecycleAction,
  CombatLifecycleState,
  CombatOverlayId,
  DebugRestoreOrigin,
} from './lifecycle';
export {
  EVIDENCE_MODE,
  EVIDENCE_SCENARIOS_ENABLED,
  EVIDENCE_COUNTERS_ENABLED,
  createCollisionEvidenceSink,
  createCombatEvidenceAccumulator,
} from './evidence';
export type {
  CollisionEvidenceSink,
  CollisionWorkTotals,
  CombatEvidenceAccumulator,
  CombatEvidenceRecord,
  CombatEvidenceWindow,
  LegacyBenchmarkIdentityWindow,
} from './evidence';
export {
  buildCombatObservability,
  isDebugCommandEligible,
} from './debug-command';
export type {
  CombatDebugCommand,
  CombatDebugHullValue,
  CombatObservability,
  DebugEligibilityContext,
} from './debug-command';
export {
  advanceEnemyProjectile,
  advanceProjectile,
  isEnemyProjectileOutsideViewport,
  isProjectileOutsideViewport,
  isProjectileRemoved,
  projectileGeometry,
  projectileSpeedPxPerSecond,
  rangedProjectileGeometry,
  rangedProjectileSpeedPxPerSecond,
  resolveWeaponFireProfile,
  spawnProjectile,
  spawnRangedProjectile,
  stepsPerShotFor,
  PROJECTILE_HEIGHT_RATIO,
  PROJECTILE_WIDTH_RATIO,
  RANGED_PROJECTILE_DAMAGE,
  RANGED_PROJECTILE_HEIGHT_RATIO,
  RANGED_PROJECTILE_SPEED_VIEWPORT_HEIGHTS_PER_SECOND,
  RANGED_PROJECTILE_WIDTH_RATIO,
} from './projectiles';
export type {
  CombatProjectile,
  EnemyProjectile,
  ProjectileGeometry,
  WeaponFireProfile,
} from './projectiles';
export {
  isEnemyAnyPortionVisible,
  isEnemyFullyInsideViewport,
  isEnemyFullyOutsideViewport,
  spawnEnemyFromPlacement,
  stepEnemy,
} from './enemies';
export type {
  BasicEnemyState,
  CombatEnemy,
  EnemyEntryRegion,
  EnemyStepInput,
  EnemyStepResult,
  HunterEnemyState,
  RangedEnemyState,
} from './enemies';
export {
  aircraftCollisionAabb,
  enemyCollisionAabb,
  enemyProjectileCollisionAabb,
  projectileCollisionAabb,
  AIRCRAFT_HITBOX_HEIGHT_RATIO,
  AIRCRAFT_HITBOX_WIDTH_RATIO,
} from './collision-geometry';
export {
  resolveAircraftContacts,
  resolveEnemyProjectileCollisions,
  resolveProjectileCollisions,
  AIRCRAFT_DAMAGE_FLASH_STEPS,
  DESTROYED_ENEMY_FLASH_STEPS,
  ENEMY_HIT_FLASH_STEPS,
  PAIR_CONTACT_COOLDOWN_STEPS,
} from './collision';
export type {
  ContactCollisionInput,
  ContactCollisionResult,
  DestroyedEnemyFlash,
  DestroyedEnemyInfo,
  EnemyProjectileCollisionInput,
  EnemyProjectileCollisionResult,
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
