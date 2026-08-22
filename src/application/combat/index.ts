export {
  loadCombatSession,
  resolveEquippedWeapon,
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
