import type {
  WeaponDefinition,
  PlayerProjectileConfig,
} from '@application/content';
import type { WeaponType } from '@domain/index';
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
}

export interface SimulationFrameResult {
  readonly state: CombatSimulationState;
  readonly accumulatorSeconds: number;
}

export function createCombatSimulation(
  input: CombatSimulationInput,
): CombatSimulationState {
  // Construction-boundary invariants (S08-WI01, S09): invalid or non-positive
  // geometry, a missing/zero-rate weapon, or an invalid projectile config
  // cannot proceed safely, so initialization fails explicitly rather than
  // silently retaining NaN/Infinity in authoritative state.
  assertPositiveFinite(input.viewportWidth, 'viewportWidth');
  assertPositiveFinite(input.viewportHeight, 'viewportHeight');
  assertPositiveFinite(input.aircraftWidth, 'aircraftWidth');
  assertPositiveFinite(input.aircraftHeight, 'aircraftHeight');
  assertValidWeapon(input.weapon);
  assertValidProjectile(input.projectile);
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
  const moved =
    state.mode === 'keyboard'
      ? stepKeyboard(state, stepSeconds)
      : stepMouse(state, stepSeconds);
  // Player firing advances exactly one fixed step per step in both modes;
  // no wall-clock authority, delayed catch-up, or firing input (AC-019).
  return stepProjectiles(moved, stepSeconds);
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
