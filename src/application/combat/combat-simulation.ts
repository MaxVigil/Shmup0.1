import type {
  WeaponDefinition,
  PlayerProjectileConfig,
  EnemyDefinition,
  EnemyGroupSchedule,
} from '@application/content';
import type { EnemyType, WeaponType } from '@domain/index';
import { Mulberry32 } from '@domain/random';
import type { CombatInputCommand, CombatControlMode } from './input-command';
import { isPointerInsideViewport } from './input-command';
import type { MovementConfig } from './movement-config';
import { resolveMovementConfig, brakingDistance } from './movement-config';
import {
  advanceProjectile,
  isProjectileRemoved,
  projectileGeometry,
  projectileSpeedPxPerSecond,
  resolveWeaponFireProfile,
  spawnProjectile,
  type CombatProjectile,
} from './projectiles';
import { moveEnemy, type CombatEnemy } from './enemies';
import {
  planEnemyGroups,
  spawnGroupDrones,
  type PlannedEnemyGroup,
} from './spawn-schedule';
import type { CombatTerminalResult } from '../mission';
import {
  resolveAircraftContacts,
  resolveProjectileCollisions,
  type DestroyedEnemyFlash,
} from './collision';

/**
 * Application-owned deterministic Combat simulation (Repository Architecture
 * §5.2, S08). Authoritative movement advances only at the fixed `1/60 s`
 * step; at most `MAX_STEPS_PER_FRAME` steps run per rendered frame and excess
 * elapsed time is discarded. Phaser never mutates this state — it submits
 * semantic commands and renders the authoritative snapshot.
 */

export const FIXED_STEP_SECONDS = 1 / 60;
export const MAX_STEPS_PER_FRAME = 4;

export interface CombatPoint {
  readonly x: number;
  readonly y: number;
}

export interface CombatAircraftState {
  readonly centerX: number;
  readonly centerY: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

export interface CombatBounds {
  /** Smallest centre x/y keeping the complete sprite inside the margin. */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

type CombatMovementKeyLike = 'up' | 'down' | 'left' | 'right';

export interface CombatSimulationState {
  readonly mode: CombatControlMode;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly aircraftWidth: number;
  readonly aircraftHeight: number;
  readonly aircraft: CombatAircraftState;
  readonly mouseTarget: CombatPoint;
  /** False until the first pointer move inside the viewport (AC-071). */
  readonly mouseTargetActive: boolean;
  readonly keys: Record<CombatMovementKeyLike, boolean>;
  readonly config: MovementConfig;
  readonly bounds: CombatBounds;
  /** Selected weapon captured from the Mission Snapshot (S09, AC-019). */
  readonly equippedWeaponType: WeaponType;
  /** Damage copied to every spawned projectile (Combat §8.1). */
  readonly weaponDamage: number;
  /** Canonical shots per second from the selected weapon. */
  readonly weaponFireRate: number;
  /** Exact fixed-step spacing between shots (Combat §8.2). */
  readonly stepsPerShot: number;
  /** Steps until the next projectile; never advances outside stepping. */
  readonly firingStepsRemaining: number;
  /** Shared player-projectile lifetime (Combat §8.1 `2 s`). */
  readonly projectileMaxLifetimeSeconds: number;
  readonly projectileSpeedPxPerSecond: number;
  /** Viewport-short-side-derived rendered/hitbox bounds (Combat §8.3). */
  readonly projectileWidth: number;
  readonly projectileHeight: number;
  /** Authoritative active projectiles in stable deterministic order. */
  readonly projectiles: readonly CombatProjectile[];
  /** Stable monotonic id source for projectile identity. */
  readonly nextProjectileId: number;
  // S10 enemy groups and movement (Combat §7).
  /** Fixed-step mission clock (authoritative integer; exact spawn scheduling). */
  readonly missionStepCount: number;
  /** Derived mission time in seconds (`missionStepCount × FIXED_STEP_SECONDS`). */
  readonly missionTimeSeconds: number;
  /** The already-derived mission stream seed (never re-derived, §8). */
  readonly missionSeed: number;
  /** Basic Drone rendered/hitbox square side: `4%` of viewport short side. */
  readonly enemySize: number;
  /** `12%` of viewport height per second (constant, Combat §7.2). */
  readonly enemySpeedPxPerSecond: number;
  readonly enemyType: EnemyType;
  /** Enemy Hull Integrity initialization (AC-014; unchanged in S10). */
  readonly enemyHullIntegrity: number;
  /** Full mission spawn plan (`0 s` … `110 s`), planned once from the RNG. */
  readonly spawnPlan: readonly PlannedEnemyGroup[];
  /** Index of the next not-yet-spawned planned group. */
  readonly spawnPlanIndex: number;
  /** Authoritative active Basic Drones in stable deterministic order. */
  readonly enemies: readonly CombatEnemy[];
  /** Stable monotonic id source for enemy identity. */
  readonly nextEnemyId: number;
  /** True once the `110 s` final group has spawned (AC-016/028). */
  readonly finalGroupSpawned: boolean;
  // S11 collision, damage and destruction (Combat §7.1, §8.4–8.5).
  /** Authoritative player Hull Integrity (initialized from the snapshot). */
  readonly playerHullIntegrity: number;
  /** Validated German Fighter maximum Hull (content input, not a magic number). */
  readonly playerMaximumHullIntegrity: number;
  /** Idempotent defeat-trigger seam (S11 sets; S12 owns result resolution). */
  readonly playerDefeated: boolean;
  /** Canonical S13 God Mode seam, default off (no Debug command/UI in S11). */
  readonly godModeEnabled: boolean;
  /** Steps until the player is next eligible for contact damage (0 = eligible). */
  readonly contactCooldownStepsRemaining: number;
  /** Destroyed Basic Drones counted exactly once. */
  readonly destroyedEnemyCount: number;
  /** Active-enemy 50 ms white-flash counters keyed by enemy id. */
  readonly activeEnemyFlashStepsRemaining: Readonly<Record<number, number>>;
  /** Hitbox-free stationary destroyed-enemy 100 ms white flashes. */
  readonly destroyedEnemyFlashes: readonly DestroyedEnemyFlash[];
  /** Player aircraft 100 ms danger flash after valid contact damage. */
  readonly aircraftDangerFlashStepsRemaining: number;
  /** Authoritative terminal trigger emitted by the simulation (S12): `null`
   *  until Defeat or Success is resolved, then the simulation freezes. */
  readonly terminalResult: CombatTerminalResult | null;
}

export interface CombatSimulationInput {
  readonly initialMode: CombatControlMode;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Rendered aircraft size (px) — derived by the presentation from Combat §4.4. */
  readonly aircraftWidth: number;
  readonly aircraftHeight: number;
  /** Selected weapon definition (read-only content input, S09). */
  readonly weapon: WeaponDefinition;
  /** Shared player-projectile configuration (read-only content input, S09). */
  readonly projectile: PlayerProjectileConfig;
  /** Already-derived mission RNG seed (Snapshot `combatMissionSeed`, S10). */
  readonly missionSeed: number;
  /** Basic Drone definition (read-only content input, S10). */
  readonly enemy: EnemyDefinition;
  /** Interception enemy-group schedule (read-only content input, S10). */
  readonly schedule: EnemyGroupSchedule;
  /** Player Hull Integrity captured from the Mission Snapshot (S11). */
  readonly playerHullIntegrity: number;
  /** Validated German Fighter maximum Hull (content input, S11). */
  readonly playerMaximumHullIntegrity: number;
}

export interface SimulationFrameResult {
  readonly state: CombatSimulationState;
  readonly accumulatorSeconds: number;
}

export function createCombatSimulation(
  input: CombatSimulationInput,
): CombatSimulationState {
  // Construction-boundary invariants (S08-WI01, S09, S10): invalid geometry,
  // weapon, projectile, mission seed, enemy definition, or schedule cannot
  // proceed safely, so initialization fails explicitly rather than silently
  // retaining NaN/Infinity or invalid spawn data in authoritative state.
  assertPositiveFinite(input.viewportWidth, 'viewportWidth');
  assertPositiveFinite(input.viewportHeight, 'viewportHeight');
  assertPositiveFinite(input.aircraftWidth, 'aircraftWidth');
  assertPositiveFinite(input.aircraftHeight, 'aircraftHeight');
  assertValidWeapon(input.weapon);
  assertValidProjectile(input.projectile);
  assertValidMissionSeed(input.missionSeed);
  assertValidEnemy(input.enemy);
  assertValidSchedule(input.schedule);
  assertValidPlayerHull(
    input.playerHullIntegrity,
    input.playerMaximumHullIntegrity,
  );
  const shortSide = Math.min(input.viewportWidth, input.viewportHeight);
  const config = resolveMovementConfig(shortSide);
  const bounds = computeBounds(
    input.viewportWidth,
    input.viewportHeight,
    input.aircraftWidth,
    input.aircraftHeight,
    config.movementMargin,
  );
  const centerX = clamp(input.viewportWidth * 0.5, bounds.minX, bounds.maxX);
  const centerY = clamp(input.viewportHeight * 0.8, bounds.minY, bounds.maxY);
  const geometry = projectileGeometry(shortSide);
  const profile = resolveWeaponFireProfile(input.weapon, FIXED_STEP_SECONDS);
  // AC-019: the first projectile is created immediately when active Combat
  // begins, then deterministic fixed-step scheduling fires one projectile
  // every `stepsPerShot` steps (Machine Gun 6/s, Cannon 2/s).
  const firstProjectile = spawnProjectile(
    0,
    profile.damage,
    centerX,
    centerY - input.aircraftHeight / 2,
    geometry,
  );
  // S10: exactly one mission-owned Mulberry32 sequence is created from the
  // already-derived snapshot seed and consumed once to plan every group
  // (0 s … 110 s). The 0 s regular group spawns as part of active Combat
  // initialization (AC-015); later groups spawn when the fixed-step clock
  // reaches their exact integer spawn index.
  const enemySize = shortSide * 0.04;
  const rng = new Mulberry32(input.missionSeed);
  const spawnPlan = planEnemyGroups(input.schedule, rng, FIXED_STEP_SECONDS);
  const initialGroup = spawnPlan[0];
  const initialEnemies =
    initialGroup === undefined
      ? []
      : spawnGroupDrones(
          initialGroup,
          0,
          input.enemy.type,
          input.enemy.maximumHullIntegrity,
          input.viewportWidth,
          input.viewportHeight,
          enemySize,
        );
  return {
    mode: input.initialMode,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    aircraftWidth: input.aircraftWidth,
    aircraftHeight: input.aircraftHeight,
    aircraft: { centerX, centerY, velocityX: 0, velocityY: 0 },
    mouseTarget: { x: centerX, y: centerY },
    mouseTargetActive: false,
    keys: { up: false, down: false, left: false, right: false },
    config,
    bounds,
    equippedWeaponType: input.weapon.type,
    weaponDamage: profile.damage,
    weaponFireRate: profile.fireRate,
    stepsPerShot: profile.stepsPerShot,
    firingStepsRemaining: profile.stepsPerShot,
    projectileMaxLifetimeSeconds: input.projectile.maximumLifetimeSeconds,
    projectileSpeedPxPerSecond: projectileSpeedPxPerSecond(
      input.viewportHeight,
      input.projectile,
    ),
    projectileWidth: geometry.width,
    projectileHeight: geometry.height,
    projectiles: [firstProjectile],
    nextProjectileId: 1,
    missionStepCount: 0,
    missionTimeSeconds: 0,
    missionSeed: input.missionSeed,
    enemySize,
    enemySpeedPxPerSecond:
      input.viewportHeight * input.enemy.movementSpeedViewportHeightPerSecond,
    enemyType: input.enemy.type,
    enemyHullIntegrity: input.enemy.maximumHullIntegrity,
    spawnPlan,
    spawnPlanIndex: initialEnemies.length > 0 ? 1 : 0,
    enemies: initialEnemies,
    nextEnemyId: initialEnemies.length,
    finalGroupSpawned: false,
    playerHullIntegrity: input.playerHullIntegrity,
    playerMaximumHullIntegrity: input.playerMaximumHullIntegrity,
    playerDefeated: false,
    godModeEnabled: false,
    contactCooldownStepsRemaining: 0,
    destroyedEnemyCount: 0,
    activeEnemyFlashStepsRemaining: {},
    destroyedEnemyFlashes: [],
    aircraftDangerFlashStepsRemaining: 0,
    terminalResult: null,
  };
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid combat simulation geometry: ${name} must be a positive finite number (received ${value}).`,
    );
  }
}

function assertValidWeapon(weapon: WeaponDefinition): void {
  if (
    !Number.isFinite(weapon.damage) ||
    weapon.damage < 0 ||
    !Number.isFinite(weapon.fireRate) ||
    weapon.fireRate <= 0
  ) {
    throw new Error(
      'Invalid combat simulation weapon: damage must be finite and non-negative and fireRate finite and positive.',
    );
  }
}

function assertValidProjectile(config: PlayerProjectileConfig): void {
  if (
    !Number.isFinite(config.speedViewportHeightPerSecond) ||
    config.speedViewportHeightPerSecond <= 0 ||
    !Number.isFinite(config.maximumLifetimeSeconds) ||
    config.maximumLifetimeSeconds <= 0
  ) {
    throw new Error(
      'Invalid combat simulation projectile: speed and lifetime must be finite and positive.',
    );
  }
}

function assertValidMissionSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(
      `Invalid combat simulation mission seed: must be an unsigned 32-bit integer (received ${seed}).`,
    );
  }
}

function assertValidEnemy(enemy: EnemyDefinition): void {
  if (
    !Number.isFinite(enemy.maximumHullIntegrity) ||
    enemy.maximumHullIntegrity < 0 ||
    !Number.isFinite(enemy.movementSpeedViewportHeightPerSecond) ||
    enemy.movementSpeedViewportHeightPerSecond <= 0
  ) {
    throw new Error(
      'Invalid combat simulation enemy: maximumHullIntegrity must be finite and non-negative and movement speed finite and positive.',
    );
  }
}

function assertValidSchedule(schedule: EnemyGroupSchedule): void {
  const { regular, final } = schedule;
  const valid =
    Number.isFinite(regular.startTimeSeconds) &&
    regular.startTimeSeconds >= 0 &&
    Number.isFinite(regular.intervalSeconds) &&
    regular.intervalSeconds > 0 &&
    Number.isInteger(regular.groupCount) &&
    regular.groupCount >= 1 &&
    Number.isInteger(regular.dronesPerGroup) &&
    regular.dronesPerGroup >= 1 &&
    Number.isFinite(final.timeSeconds) &&
    final.timeSeconds > 0 &&
    Number.isInteger(final.dronesPerGroup) &&
    final.dronesPerGroup >= 1;
  if (!valid) {
    throw new Error(
      'Invalid combat simulation enemy schedule: regular groups need a non-negative start, positive interval, and positive integer counts; the final group needs a positive time and drone count.',
    );
  }
}

function assertValidPlayerHull(
  hullIntegrity: number,
  maximumHullIntegrity: number,
): void {
  if (!Number.isFinite(maximumHullIntegrity) || maximumHullIntegrity <= 0) {
    throw new Error(
      'Invalid combat simulation player Hull: maximum must be a positive finite number.',
    );
  }
  if (
    !Number.isFinite(hullIntegrity) ||
    hullIntegrity < 0 ||
    hullIntegrity > maximumHullIntegrity
  ) {
    throw new Error(
      `Invalid combat simulation player Hull: current must be finite within [0, ${maximumHullIntegrity}].`,
    );
  }
}

export function submitCombatCommand(
  state: CombatSimulationState,
  command: CombatInputCommand,
): CombatSimulationState {
  switch (command.type) {
    case 'combat/toggle-mode': {
      // AC-006 / AC-064: F flips the active mode. A full mode toggle clears
      // inactive held-key state so an ignored key event can never leave a
      // stale pressed flag for the next mode (S08-WI01). Entering Mouse
      // Movement without an activated pointer target puts the aircraft
      // internally at rest (no latent velocity to resume); an existing valid
      // mouse target is preserved.
      const nextMode = state.mode === 'mouse' ? 'keyboard' : 'mouse';
      const keys = { up: false, down: false, left: false, right: false };
      if (nextMode === 'mouse' && !state.mouseTargetActive) {
        return {
          ...state,
          mode: nextMode,
          keys,
          aircraft: { ...state.aircraft, velocityX: 0, velocityY: 0 },
        };
      }
      return { ...state, mode: nextMode, keys };
    }
    case 'combat/pointer-move': {
      // AC-006: inactive-mode input is ignored. AC-071: pointer moves outside
      // the viewport do not create or update the target.
      if (state.mode !== 'mouse') {
        return state;
      }
      if (
        !isPointerInsideViewport(
          command.x,
          command.y,
          state.viewportWidth,
          state.viewportHeight,
        )
      ) {
        return state;
      }
      // The target is clamped to the reachable movement bounds so the aircraft
      // can always come to a stop at it (AC-005); the cursor still drives the
      // aircraft toward the clamped point deterministically.
      const target = clampPoint({ x: command.x, y: command.y }, state.bounds);
      return { ...state, mouseTarget: target, mouseTargetActive: true };
    }
    case 'combat/keyboard': {
      if (state.mode !== 'keyboard') {
        return state;
      }
      if (state.keys[command.key] === command.pressed) {
        return state;
      }
      return {
        ...state,
        keys: { ...state.keys, [command.key]: command.pressed },
      };
    }
    case 'combat/viewport-resize': {
      // Invalid geometry is a deterministic no-op (never poisons the state).
      if (
        !Number.isFinite(command.width) ||
        command.width <= 0 ||
        !Number.isFinite(command.height) ||
        command.height <= 0 ||
        !Number.isFinite(command.aircraftWidth) ||
        command.aircraftWidth <= 0 ||
        !Number.isFinite(command.aircraftHeight) ||
        command.aircraftHeight <= 0
      ) {
        return state;
      }
      // Idempotent for repeated identical dimensions (Combat §12.3).
      if (
        command.width === state.viewportWidth &&
        command.height === state.viewportHeight
      ) {
        return state;
      }
      return resizeSimulation(state, command);
    }
  }
}

export function stepCombatSimulation(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  // Invalid elapsed time (NaN, ±Infinity, non-positive) is a deterministic
  // no-op — it must never poison the simulation state (S08-WI01).
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    return state;
  }
  // S12 terminal freeze: once Success or Defeat is resolved the simulation
  // stops immediately (the runtime is disposed by the application without
  // waiting for damage feedback); Defeat is the S11 player-defeat state.
  if (state.terminalResult !== null) {
    return state;
  }
  // S11: feedback and the contact cooldown decrement once at the beginning of
  // each executed step, so feedback created during the collision phase exposes
  // its full duration in the post-hit snapshot.
  const begun = beginStepCounters(state);
  const moved =
    begun.mode === 'keyboard'
      ? stepKeyboard(begun, stepSeconds)
      : stepMouse(begun, stepSeconds);
  // Mission time advances only through executed fixed steps; due groups spawn
  // at their exact mission-time instant, then pre-existing enemies move
  // (newly spawned drones begin entering on their first positive movement
  // update), and player firing advances one fixed step (S09).
  const withMission = stepMission(moved, stepSeconds);
  // S11: one explicit post-integration collision phase — projectile-to-enemy
  // first, then aircraft-to-surviving-enemy contacts (player-readable tie-break).
  const withCollisions = resolveCollisions(withMission);
  // S12: evaluate the terminal state after the collision/defeat phase and the
  // enemy escape/removal work of the same step.
  return evaluateTerminalResult(withCollisions);
}

/**
 * S12 terminal evaluation (Combat §9.4–9.5, AC-031): Defeat has unconditional
 * priority when player Hull is 0, including a step that also resolves the final
 * enemy. Otherwise Success occurs immediately when the final group has spawned,
 * no future group remains scheduled, and no active enemy remains (every spawned
 * enemy is Destroyed or Escaped). No fixed 120 s end condition is used.
 */
function evaluateTerminalResult(
  state: CombatSimulationState,
): CombatSimulationState {
  if (state.terminalResult !== null) {
    return state;
  }
  if (state.playerDefeated) {
    return { ...state, terminalResult: { kind: 'defeat' } };
  }
  if (
    state.finalGroupSpawned &&
    state.spawnPlanIndex >= state.spawnPlan.length &&
    state.enemies.length === 0
  ) {
    return { ...state, terminalResult: { kind: 'success' } };
  }
  return state;
}

/** Decrements every existing feedback counter and the contact cooldown once. */
function beginStepCounters(
  state: CombatSimulationState,
): CombatSimulationState {
  const activeEnemyFlashStepsRemaining: Record<number, number> = {};
  for (const [id, steps] of Object.entries(
    state.activeEnemyFlashStepsRemaining,
  )) {
    const next = steps - 1;
    if (next > 0) {
      activeEnemyFlashStepsRemaining[Number(id)] = next;
    }
  }
  const destroyedEnemyFlashes = state.destroyedEnemyFlashes
    .map((flash) => ({ ...flash, stepsRemaining: flash.stepsRemaining - 1 }))
    .filter((flash) => flash.stepsRemaining > 0);
  return {
    ...state,
    activeEnemyFlashStepsRemaining,
    destroyedEnemyFlashes,
    aircraftDangerFlashStepsRemaining: Math.max(
      0,
      state.aircraftDangerFlashStepsRemaining - 1,
    ),
    contactCooldownStepsRemaining: Math.max(
      0,
      state.contactCooldownStepsRemaining - 1,
    ),
  };
}

/**
 * S11 collision phase orchestration: projectile-to-enemy pairs first, then
 * aircraft-to-surviving-enemy contacts. Player Hull, defeat, cooldown, enemy
 * destruction, and the destruction count are all updated atomically; feedback
 * is presentation-only and never delays gameplay transitions.
 */
function resolveCollisions(
  state: CombatSimulationState,
): CombatSimulationState {
  if (state.playerDefeated) {
    return state;
  }
  const projectileResult = resolveProjectileCollisions({
    projectiles: state.projectiles,
    enemies: state.enemies,
    projectileWidth: state.projectileWidth,
    projectileHeight: state.projectileHeight,
    enemySize: state.enemySize,
    existingFlashes: state.activeEnemyFlashStepsRemaining,
  });
  const contactResult = resolveAircraftContacts({
    enemies: projectileResult.enemies,
    enemySize: state.enemySize,
    aircraftCenterX: state.aircraft.centerX,
    aircraftCenterY: state.aircraft.centerY,
    aircraftWidth: state.aircraftWidth,
    aircraftHeight: state.aircraftHeight,
    playerHullIntegrity: state.playerHullIntegrity,
    playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
    contactCooldownStepsRemaining: state.contactCooldownStepsRemaining,
    aircraftDangerFlashStepsRemaining: state.aircraftDangerFlashStepsRemaining,
    godModeEnabled: state.godModeEnabled,
    playerDefeated: state.playerDefeated,
  });
  // The active-enemy flash record contains only surviving active enemies.
  const activeEnemyFlashStepsRemaining: Record<number, number> = {};
  for (const enemy of contactResult.enemies) {
    const steps = projectileResult.flashes[enemy.id];
    if (steps !== undefined && steps > 0) {
      activeEnemyFlashStepsRemaining[enemy.id] = steps;
    }
  }
  return {
    ...state,
    projectiles: projectileResult.projectiles,
    enemies: contactResult.enemies,
    playerHullIntegrity: contactResult.playerHullIntegrity,
    playerDefeated: contactResult.playerDefeated,
    contactCooldownStepsRemaining: contactResult.contactCooldownStepsRemaining,
    aircraftDangerFlashStepsRemaining:
      contactResult.aircraftDangerFlashStepsRemaining,
    destroyedEnemyCount:
      state.destroyedEnemyCount +
      projectileResult.destroyedEnemyCount +
      contactResult.destroyedEnemyCount,
    activeEnemyFlashStepsRemaining,
    destroyedEnemyFlashes: [
      ...state.destroyedEnemyFlashes,
      ...projectileResult.destroyedEnemyFlashes,
      ...contactResult.destroyedEnemyFlashes,
    ],
  };
}

/**
 * Advances mission time by one fixed step, spawns every group whose planned
 * instant has been reached (S10, Combat §7.3), moves pre-existing enemies, and
 * then runs the player firing/projectile step. The long-frame accumulator cap
 * (≤ 4 steps/frame) means a stalled frame never produces catch-up spawn bursts.
 */
function stepMission(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  // The fixed-step clock is the authoritative integer mission clock: exactly
  // one step per executed fixed step, no float accumulation drift at spawn
  // boundaries (10 s → step 600, 110 s → step 6600).
  const missionStepCount = state.missionStepCount + 1;
  const missionTimeSeconds = missionStepCount * FIXED_STEP_SECONDS;
  const spawns = collectDueSpawns(state, missionStepCount);
  const enemies = stepActiveEnemies(state, stepSeconds);
  const next = {
    ...state,
    missionStepCount,
    missionTimeSeconds,
    spawnPlanIndex: spawns.spawnPlanIndex,
    nextEnemyId: spawns.nextEnemyId,
    finalGroupSpawned: spawns.finalGroupSpawned,
    enemies: [...enemies, ...spawns.spawned],
  };
  return stepProjectiles(next, stepSeconds);
}

/**
 * Collects every planned group whose exact step index has been reached. Group
 * step indices are `600` apart, so production stepping spawns at most one
 * group per step; the loop keeps direct large-step calls deterministic and
 * complete. The long-frame accumulator cap (≤ 4 steps/frame) means a stalled
 * frame never produces catch-up spawn bursts.
 */
function collectDueSpawns(
  state: CombatSimulationState,
  missionStepCount: number,
): {
  readonly spawned: readonly CombatEnemy[];
  readonly spawnPlanIndex: number;
  readonly nextEnemyId: number;
  readonly finalGroupSpawned: boolean;
} {
  let spawnPlanIndex = state.spawnPlanIndex;
  let nextEnemyId = state.nextEnemyId;
  let finalGroupSpawned = state.finalGroupSpawned;
  const spawned: CombatEnemy[] = [];
  while (spawnPlanIndex < state.spawnPlan.length) {
    const group = state.spawnPlan[spawnPlanIndex];
    if (group === undefined || group.stepIndex > missionStepCount) {
      break;
    }
    spawned.push(
      ...spawnGroupDrones(
        group,
        nextEnemyId,
        state.enemyType,
        state.enemyHullIntegrity,
        state.viewportWidth,
        state.viewportHeight,
        state.enemySize,
      ),
    );
    nextEnemyId += group.drones.length;
    if (group.final) {
      finalGroupSpawned = true;
    }
    spawnPlanIndex += 1;
  }
  return { spawned, spawnPlanIndex, nextEnemyId, finalGroupSpawned };
}

/** Moves pre-existing active enemies and removes escaped drones (Combat §7.5). */
function stepActiveEnemies(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatEnemy[] {
  const kept: CombatEnemy[] = [];
  for (const enemy of state.enemies) {
    const next = moveEnemy(
      enemy,
      state.enemySpeedPxPerSecond,
      stepSeconds,
      state.viewportWidth,
      state.viewportHeight,
      state.enemySize,
    );
    if (next !== null) {
      kept.push(next);
    }
  }
  return kept;
}

/**
 * Player-weapon scheduling and projectile integration (Combat §8, S09): the
 * firing countdown advances exactly one step per fixed step and resets when a
 * shot is due, then every active projectile moves upward at constant speed and
 * ages. Removal applies on the first S09-owned condition — full-bounds
 * viewport exit or lifetime `2 s` — after the step. Newly spawned projectiles
 * are placed ahead of older ones so the array order is deterministic and
 * stable across removal.
 */
function stepProjectiles(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  const remaining = state.firingStepsRemaining - 1;
  let nextProjectileId = state.nextProjectileId;
  let spawned: CombatProjectile[] = [];
  if (remaining <= 0) {
    spawned = [
      spawnProjectile(
        nextProjectileId,
        state.weaponDamage,
        state.aircraft.centerX,
        state.aircraft.centerY - state.aircraftHeight / 2,
        { width: state.projectileWidth, height: state.projectileHeight },
      ),
    ];
    nextProjectileId += 1;
  }
  const geometry = {
    width: state.projectileWidth,
    height: state.projectileHeight,
  };
  const kept: CombatProjectile[] = [];
  for (const projectile of [...spawned, ...state.projectiles]) {
    const advanced = advanceProjectile(
      projectile,
      state.projectileSpeedPxPerSecond,
      stepSeconds,
    );
    if (
      !isProjectileRemoved(
        advanced,
        state.viewportWidth,
        state.viewportHeight,
        state.projectileMaxLifetimeSeconds,
        geometry,
      )
    ) {
      kept.push(advanced);
    }
  }
  return {
    ...state,
    firingStepsRemaining: remaining <= 0 ? state.stepsPerShot : remaining,
    projectiles: kept,
    nextProjectileId,
  };
}

/**
 * Fixed-step driver (S08): accumulates the frame delta, advances authoritative
 * movement in `1/60 s` steps, runs at most `maxSteps` per frame, and discards
 * any excess elapsed time once the cap is reached.
 */
export function advanceSimulationFrames(
  state: CombatSimulationState,
  frameDeltaSeconds: number,
  accumulatorSeconds: number,
  stepSeconds: number = FIXED_STEP_SECONDS,
  maxSteps: number = MAX_STEPS_PER_FRAME,
): SimulationFrameResult {
  // Invalid runtime elapsed time (NaN, ±Infinity, negative) is sanitised to a
  // deterministic no-op — the accumulator never retains NaN/Infinity
  // (S08-WI01).
  const frame =
    Number.isFinite(frameDeltaSeconds) && frameDeltaSeconds >= 0
      ? frameDeltaSeconds
      : 0;
  const accumulated =
    Number.isFinite(accumulatorSeconds) && accumulatorSeconds >= 0
      ? accumulatorSeconds
      : 0;
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    return { state, accumulatorSeconds: accumulated };
  }
  if (!Number.isFinite(maxSteps) || maxSteps <= 0) {
    return { state, accumulatorSeconds: accumulated };
  }
  let accumulator = accumulated + frame;
  let current = state;
  let steps = 0;
  while (accumulator >= stepSeconds && steps < maxSteps) {
    current = stepCombatSimulation(current, stepSeconds);
    accumulator -= stepSeconds;
    steps += 1;
  }
  if (steps === maxSteps) {
    accumulator = 0;
  }
  return { state: current, accumulatorSeconds: accumulator };
}

function stepKeyboard(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  const { aircraft, config, bounds, keys } = state;
  const directionX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const directionY = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const directionLength = Math.hypot(directionX, directionY);
  let velocityX = aircraft.velocityX;
  let velocityY = aircraft.velocityY;
  if (directionLength > 0) {
    // Accelerate along the (normalized) commanded direction.
    const nx = directionX / directionLength;
    const ny = directionY / directionLength;
    velocityX += nx * config.acceleration * stepSeconds;
    velocityY += ny * config.acceleration * stepSeconds;
    const speed = Math.hypot(velocityX, velocityY);
    if (speed > config.maximumSpeed) {
      const scale = config.maximumSpeed / speed;
      velocityX *= scale;
      velocityY *= scale;
    }
  } else if (aircraft.velocityX === 0 && aircraft.velocityY === 0) {
    // Already at rest: no change.
    return state;
  } else {
    // Decelerate to a stop when no movement is commanded (Combat §5.3).
    const speed = Math.hypot(velocityX, velocityY);
    const nextSpeed = Math.max(0, speed - config.deceleration * stepSeconds);
    const scale = nextSpeed / speed;
    velocityX *= scale;
    velocityY *= scale;
  }
  return {
    ...state,
    aircraft: {
      centerX: clamp(
        aircraft.centerX + velocityX * stepSeconds,
        bounds.minX,
        bounds.maxX,
      ),
      centerY: clamp(
        aircraft.centerY + velocityY * stepSeconds,
        bounds.minY,
        bounds.maxY,
      ),
      velocityX,
      velocityY,
    },
  };
}

function stepMouse(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  const { aircraft, config, bounds, mouseTarget, mouseTargetActive } = state;
  // AC-071: rest until the first pointer move inside the viewport.
  if (!mouseTargetActive) {
    return state;
  }
  const dx = mouseTarget.x - aircraft.centerX;
  const dy = mouseTarget.y - aircraft.centerY;
  const distance = Math.hypot(dx, dy);
  if (distance <= config.targetTolerance) {
    if (aircraft.velocityX === 0 && aircraft.velocityY === 0) {
      return state;
    }
    // Residual resolution inside targetTolerance is not teleportation (AC-005).
    return {
      ...state,
      aircraft: {
        centerX: mouseTarget.x,
        centerY: mouseTarget.y,
        velocityX: 0,
        velocityY: 0,
      },
    };
  }
  const nx = dx / distance;
  const ny = dy / distance;
  const speed = Math.hypot(aircraft.velocityX, aircraft.velocityY);
  // Combat §6: accelerate outside brakingDistance, decelerate inside it.
  const nextSpeed =
    distance > brakingDistance(speed, config)
      ? Math.min(config.maximumSpeed, speed + config.acceleration * stepSeconds)
      : Math.max(0, speed - config.deceleration * stepSeconds);
  const velocityX = nx * nextSpeed;
  const velocityY = ny * nextSpeed;
  return {
    ...state,
    aircraft: {
      centerX: clamp(
        aircraft.centerX + velocityX * stepSeconds,
        bounds.minX,
        bounds.maxX,
      ),
      centerY: clamp(
        aircraft.centerY + velocityY * stepSeconds,
        bounds.minY,
        bounds.maxY,
      ),
      velocityX,
      velocityY,
    },
  };
}

function resizeSimulation(
  state: CombatSimulationState,
  command: Extract<CombatInputCommand, { type: 'combat/viewport-resize' }>,
): CombatSimulationState {
  const shortSide = Math.min(command.width, command.height);
  const config = resolveMovementConfig(shortSide);
  const bounds = computeBounds(
    command.width,
    command.height,
    command.aircraftWidth,
    command.aircraftHeight,
    config.movementMargin,
  );
  const ratioX = command.width / state.viewportWidth;
  const ratioY = command.height / state.viewportHeight;
  const geometry = projectileGeometry(shortSide);
  // S09 resize contract (AC-053/057/081, MASTER-AC-010): active projectile
  // positions reproject proportionally and viewport-derived geometry/speed
  // recalculate; no entities are duplicated or re-fetched.
  const projectiles = state.projectiles.map((projectile) => ({
    ...projectile,
    centerX: projectile.centerX * ratioX,
    centerY: projectile.centerY * ratioY,
  }));
  // S10 resize contract: active drone positions and side waypoints reproject
  // proportionally; short-side size and viewport-height speed recalculate;
  // planned fractions are viewport-independent so no future spawns are
  // duplicated or re-rolled.
  const enemies = state.enemies.map((enemy) => ({
    ...enemy,
    centerX: enemy.centerX * ratioX,
    centerY: enemy.centerY * ratioY,
    waypointX: enemy.waypointX === null ? null : enemy.waypointX * ratioX,
    waypointY: enemy.waypointY === null ? null : enemy.waypointY * ratioY,
  }));
  // S11 resize contract: destroyed-enemy feedback stays hitbox-free but its
  // presentation reprojects with the viewport; feedback step counters are
  // unaffected by geometry.
  const destroyedEnemyFlashes = state.destroyedEnemyFlashes.map((flash) => ({
    ...flash,
    centerX: flash.centerX * ratioX,
    centerY: flash.centerY * ratioY,
    size: shortSide * 0.04,
  }));
  return {
    ...state,
    viewportWidth: command.width,
    viewportHeight: command.height,
    aircraftWidth: command.aircraftWidth,
    aircraftHeight: command.aircraftHeight,
    config,
    bounds,
    mouseTarget: clampPoint(
      {
        x: state.mouseTarget.x * ratioX,
        y: state.mouseTarget.y * ratioY,
      },
      bounds,
    ),
    aircraft: {
      ...state.aircraft,
      // Proportional reprojection, then clamping of the complete sprite.
      centerX: clamp(state.aircraft.centerX * ratioX, bounds.minX, bounds.maxX),
      centerY: clamp(state.aircraft.centerY * ratioY, bounds.minY, bounds.maxY),
    },
    projectileWidth: geometry.width,
    projectileHeight: geometry.height,
    projectileSpeedPxPerSecond:
      state.projectileSpeedPxPerSecond *
      (command.height / state.viewportHeight),
    projectiles,
    enemySize: shortSide * 0.04,
    enemySpeedPxPerSecond:
      state.enemySpeedPxPerSecond * (command.height / state.viewportHeight),
    enemies,
    destroyedEnemyFlashes,
  };
}

/**
 * Minimal S13 seam to force the final group (Combat §11.5 "Spawn Final Group",
 * additive behaviour): keeps existing enemies, spawns the planned final group
 * at the current mission time, cancels every remaining scheduled spawn, and
 * marks the final group spawned exactly once. S10 does not implement the Debug
 * command — S13 wires it.
 */
export function forceFinalGroupSpawn(
  state: CombatSimulationState,
): CombatSimulationState {
  if (state.finalGroupSpawned) {
    return state;
  }
  const finalIndex = state.spawnPlan.findIndex((group) => group.final);
  if (finalIndex === -1) {
    return state;
  }
  const finalGroup = state.spawnPlan[finalIndex];
  if (finalGroup === undefined) {
    return state;
  }
  const spawned = spawnGroupDrones(
    finalGroup,
    state.nextEnemyId,
    state.enemyType,
    state.enemyHullIntegrity,
    state.viewportWidth,
    state.viewportHeight,
    state.enemySize,
  );
  return {
    ...state,
    enemies: [...state.enemies, ...spawned],
    nextEnemyId: state.nextEnemyId + spawned.length,
    // AC-042: forcing the final group cancels all future regular/final spawns
    // without mutating mission time or removing already active enemies.
    spawnPlanIndex: state.spawnPlan.length,
    finalGroupSpawned: true,
  };
}

/**
 * S11 collision-consumption seam: removes a projectile consumed by a valid
 * hit. A missing id is a deterministic no-op. S09 never fabricates enemies,
 * hits, damage application, penetration, or destruction — this pure function
 * exists so S11 can consume projectiles without owning their state.
 */
export function removeProjectileById(
  state: CombatSimulationState,
  projectileId: number,
): CombatSimulationState {
  const projectiles = state.projectiles.filter(
    (projectile) => projectile.id !== projectileId,
  );
  if (projectiles.length === state.projectiles.length) {
    return state;
  }
  return { ...state, projectiles };
}

function computeBounds(
  viewportWidth: number,
  viewportHeight: number,
  aircraftWidth: number,
  aircraftHeight: number,
  movementMargin: number,
): CombatBounds {
  return {
    minX: movementMargin + aircraftWidth / 2,
    minY: movementMargin + aircraftHeight / 2,
    maxX: viewportWidth - movementMargin - aircraftWidth / 2,
    maxY: viewportHeight - movementMargin - aircraftHeight / 2,
  };
}

function clampPoint(point: CombatPoint, bounds: CombatBounds): CombatPoint {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface CombatSimulationRuntime {
  readonly getState: () => CombatSimulationState;
  readonly submit: (command: CombatInputCommand) => void;
  readonly advance: (frameDeltaSeconds: number) => CombatSimulationState;
  /** Cleanup contract (S08): after dispose, submit/advance are inert. */
  readonly dispose: () => void;
}

/**
 * Presentation-facing runtime for the deterministic simulation. It owns the
 * authoritative state, the fixed-step accumulator, and the disposal contract.
 * Phaser calls `submit` for semantic input commands and `advance` once per
 * rendered frame; `dispose` makes every subsequent call inert so no leftover
 * handler can mutate or read destroyed state.
 */
export function createCombatSimulationRuntime(
  input: CombatSimulationInput,
): CombatSimulationRuntime {
  let state = createCombatSimulation(input);
  let accumulatorSeconds = 0;
  let disposed = false;
  return {
    getState: () => state,
    submit(command) {
      if (disposed) {
        return;
      }
      const before = state;
      state = submitCombatCommand(state, command);
      if (
        command.type === 'combat/viewport-resize' &&
        (state.viewportWidth !== before.viewportWidth ||
          state.viewportHeight !== before.viewportHeight)
      ) {
        // An accepted effective-dimension change is an approved
        // browser-lifecycle boundary: the fixed-step accumulator is reset
        // exactly once so no pre-resize sub-step time carries over (S08-WI01).
        // Repeated identical dimensions remain a strict no-op above.
        accumulatorSeconds = 0;
      }
    },
    advance(frameDeltaSeconds) {
      if (disposed) {
        return state;
      }
      const result = advanceSimulationFrames(
        state,
        frameDeltaSeconds,
        accumulatorSeconds,
      );
      state = result.state;
      accumulatorSeconds = result.accumulatorSeconds;
      return state;
    },
    dispose() {
      disposed = true;
    },
  };
}
