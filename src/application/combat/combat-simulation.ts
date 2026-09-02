import type {
  EnemyDefinition,
  MissionDefinition,
  PlayerProjectileConfig,
  WeaponDefinition,
} from '@application/content';
import type { EnemyType } from '@domain/index';
import { createRangedFireStream } from '@domain/random';
import type { Mulberry32 } from '@domain/random';
import type { CombatInputCommand, CombatControlMode } from './input-command';
import { isPointerInsideViewport } from './input-command';
import type { MovementConfig } from './movement-config';
import { resolveMovementConfig, brakingDistance } from './movement-config';
import {
  advanceEnemyProjectile,
  advanceProjectile,
  isEnemyProjectileOutsideViewport,
  isProjectileRemoved,
  projectileGeometry,
  projectileSpeedPxPerSecond,
  rangedProjectileGeometry,
  rangedProjectileSpeedPxPerSecond,
  resolveWeaponFireProfile,
  spawnProjectile,
  spawnRangedProjectile,
  type CombatProjectile,
  type EnemyProjectile,
  type ProjectileGeometry,
} from './projectiles';
import {
  spawnEnemyFromPlacement,
  stepEnemy,
  type CombatEnemy,
} from './enemies';
import {
  resolveAircraftContacts,
  resolveEnemyProjectileCollisions,
  resolveProjectileCollisions,
  type DestroyedEnemyFlash,
  type DestroyedEnemyInfo,
} from './collision';
import { enemyRenderedBounds } from '../content';
import type { CombatDebugCommand } from './debug-command';
import type { CombatTerminalResult } from '../mission';
import {
  resolveMissionEncounters,
  type MissionEncounterPlan,
  type ResolvedArrivalGroup,
  type ResolvedSpawnPlacement,
} from '../mission/encounter-resolution';
import {
  EVIDENCE_COUNTERS_ENABLED,
  EVIDENCE_SCENARIOS_ENABLED,
  createCollisionEvidenceSink,
  createCombatEvidenceAccumulator,
} from './evidence';
import type {
  CombatEvidenceAccumulator,
  CollisionEvidenceSink,
} from './evidence';

/**
 * Application-owned deterministic Combat simulation (Repository Architecture
 * §5.2, S08; v0.2 Tactical Combat Foundation, V02-WI-04). Authoritative
 * movement advances only at the fixed `1/60 s` step; at most
 * `MAX_STEPS_PER_FRAME` steps run per rendered frame and excess elapsed time
 * is discarded. Phaser never mutates this state — it submits semantic commands
 * and renders the authoritative snapshot.
 *
 * V02-WI-04 replaces the v0.1 Basic-only seam with the approved authored
 * staging: the simulation resolves the Mission 01 encounter plan (typed
 * Arrival Groups and normalized Spawn Placements) exactly once at creation,
 * spawns each group at its exact fixed-step time in stable authored member
 * order, and advances Basic/Ranged/Hunter role states with their complete
 * rendered-bounds AABBs, the Ranged independent `ranged-fire` cadence, the
 * Hunter Approach/commit machine, pending combat economy, the Combat
 * Countdown, the one-shot Critical Hull latch, and the deterministic two-phase
 * Success exit sequence.
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

/** One runtime Arrival Group flattened in authored member order with the
 *  stable zero-based mission-member ordinals precomputed (Epic §9.2). */
export interface RuntimeArrivalGroup extends ResolvedArrivalGroup {
  readonly encounterId: string;
  readonly members: readonly {
    readonly type: EnemyType;
    readonly placement: ResolvedSpawnPlacement;
    readonly ordinal: number;
  }[];
}

const CRITICAL_HULL_MESSAGE_STEPS = Math.round(2.0 / FIXED_STEP_SECONDS);
const SUCCESS_CENTRE_STEPS = Math.round(0.5 / FIXED_STEP_SECONDS);
const HUNTER_CONTACT_DAMAGE = 35;
const RANGED_FIRST_SHOT_STEPS = 180;
const RANGED_MIN_INTERVAL_STEPS = 60;
const RANGED_MAX_INTERVAL_STEPS = 180;

const REGULAR_TYPES: readonly EnemyType[] = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
];

export interface CombatSimulationState {
  readonly mode: CombatControlMode;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly aircraftWidth: number;
  readonly aircraftHeight: number;
  readonly aircraft: CombatAircraftState;
  readonly mouseTarget: CombatPoint;
  readonly mouseTargetActive: boolean;
  readonly keys: Record<CombatMovementKeyLike, boolean>;
  readonly config: MovementConfig;
  readonly bounds: CombatBounds;
  readonly equippedWeaponType: WeaponDefinition['type'];
  readonly weaponDamage: number;
  readonly weaponFireRate: number;
  readonly stepsPerShot: number;
  readonly firingStepsRemaining: number;
  readonly projectileMaxLifetimeSeconds: number;
  readonly projectileSpeedPxPerSecond: number;
  readonly projectileWidth: number;
  readonly projectileHeight: number;
  readonly projectiles: readonly CombatProjectile[];
  readonly nextProjectileId: number;
  readonly missionStepCount: number;
  readonly missionTimeSeconds: number;
  readonly missionSeed: number;
  // --- v0.2 regular-enemy runtime (V02-WI-04) ---
  readonly enemyDefsByType: Readonly<Record<EnemyType, EnemyDefinition>>;
  /** Complete rendered bounds per role at the current short side (V02-DEC-019). */
  readonly enemyBoundsByType: Readonly<Record<EnemyType, CombatBoundsSize>>;
  /** Role movement (downward/approach) speeds in px/s at the current height. */
  readonly movementSpeedPxByType: Readonly<Record<EnemyType, number>>;
  /** Role committed-attack speeds in px/s at the current height. */
  readonly committedSpeedPxByType: Readonly<Record<EnemyType, number>>;
  readonly enemyPlan: MissionEncounterPlan;
  readonly arrivalGroups: readonly RuntimeArrivalGroup[];
  readonly arrivalGroupIndex: number;
  readonly currentEncounterId: string | null;
  readonly enemies: readonly CombatEnemy[];
  readonly nextEnemyId: number;
  readonly enemyProjectiles: readonly EnemyProjectile[];
  readonly nextEnemyProjectileId: number;
  readonly rangedProjectileGeometry: ProjectileGeometry;
  readonly rangedProjectileSpeedPxPerSecond: number;
  /** Per-Ranged independent `ranged-fire` streams keyed by member ordinal. */
  readonly rangedFireStreams: Readonly<Record<number, Mulberry32>>;
  readonly finalArrivalTimeSeconds: number;
  /** Ceiling-formula Combat Countdown display value (v0.2 §15.2). */
  readonly countdownSeconds: number;
  readonly pendingCombatRewards: number;
  readonly pendingEscapePenalties: number;
  readonly destroyedCountByType: Readonly<Record<EnemyType, number>>;
  readonly escapedCountByType: Readonly<Record<EnemyType, number>>;
  readonly destroyedByContactCountByType: Readonly<Record<EnemyType, number>>;
  readonly pairContactCooldownSteps: Readonly<Record<number, number>>;
  // --- player ---
  readonly playerHullIntegrity: number;
  readonly playerMaximumHullIntegrity: number;
  readonly playerDefeated: boolean;
  readonly godModeEnabled: boolean;
  // --- feedback ---
  readonly activeEnemyFlashStepsRemaining: Readonly<Record<number, number>>;
  readonly destroyedEnemyFlashes: readonly DestroyedEnemyFlash[];
  readonly aircraftDangerFlashStepsRemaining: number;
  // --- Critical Hull (v0.2 §15.3) ---
  readonly criticalHullMessageTriggered: boolean;
  readonly criticalHullMessageStepsRemaining: number;
  // --- terminal / Success exit (Epic §13.3) ---
  readonly terminalResult: CombatTerminalResult | null;
  readonly successExitPhase: 'none' | 'centre' | 'fly-up' | 'complete';
  readonly exitCentreStepsRemaining: number;
  /** V02-WI-04 C01: the deterministic exit advances only after the campaign
   *  transaction has committed Success (set through the runtime seam). */
  readonly successExitAuthorized: boolean;
  /** V02-WI-04 C03 evidence-only observed per-step maxima (Pass A). `null`
   *  (and the entire field) is compile-time absent from the ordinary build. */
  readonly evidence: CombatEvidenceAccumulator | null;
}

export interface CombatBoundsSize {
  readonly width: number;
  readonly height: number;
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
  /** Authored mission definition (read-only content input, V02-WI-04). */
  readonly mission: MissionDefinition;
  /** v0.2 regular-enemy definitions (read-only content input, V02-WI-04). */
  readonly enemies: readonly EnemyDefinition[];
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
  assertPositiveFinite(input.viewportWidth, 'viewportWidth');
  assertPositiveFinite(input.viewportHeight, 'viewportHeight');
  assertPositiveFinite(input.aircraftWidth, 'aircraftWidth');
  assertPositiveFinite(input.aircraftHeight, 'aircraftHeight');
  assertValidWeapon(input.weapon);
  assertValidProjectile(input.projectile);
  assertValidMissionSeed(input.missionSeed);
  assertValidPlayerHull(
    input.playerHullIntegrity,
    input.playerMaximumHullIntegrity,
  );
  const defs = resolveEnemyDefs(input.enemies);
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
  const firstProjectile = spawnProjectile(
    0,
    profile.damage,
    centerX,
    centerY - input.aircraftHeight / 2,
    geometry,
  );

  // V02-WI-04: resolve the authored encounter plan exactly once at creation.
  // The plan consumes the `mission-data` stream (the three Mission 01 Hunter
  // draws in e3 → e4 → e5 order; Top placements consume zero draws) and never
  // reads Aircraft/Hull/performance state (V02-AC-003/004).
  const enemyPlan = resolveMissionEncounters(
    input.mission,
    input.missionSeed,
    FIXED_STEP_SECONDS,
  );
  const arrivalGroups = flattenArrivalGroups(enemyPlan);
  if (arrivalGroups.length === 0) {
    throw new Error(
      'Combat simulation failed: the mission has no authored runtime Arrival Groups.',
    );
  }
  const rangedOrdinals = new Set<number>();
  for (const group of arrivalGroups) {
    for (const member of group.members) {
      if (member.type === 'ranged-drone') {
        rangedOrdinals.add(member.ordinal);
      }
    }
  }
  const rangedFireStreams: Record<number, Mulberry32> = {};
  for (const ordinal of rangedOrdinals) {
    rangedFireStreams[ordinal] = createRangedFireStream(
      input.missionSeed,
      ordinal,
    );
  }

  const enemyBoundsByType = boundsByType(defs, shortSide);
  const movementSpeedPxByType = speedMap(
    defs,
    input.viewportHeight,
    (definition) => definition.movementSpeedViewportHeightPerSecond,
  );
  const committedSpeedPxByType = speedMap(
    defs,
    input.viewportHeight,
    (definition) => definition.committedAttackSpeedViewportHeightPerSecond,
  );

  const criticalTriggered = input.playerHullIntegrity < 25;
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
      input.weapon,
    ),
    projectileWidth: geometry.width,
    projectileHeight: geometry.height,
    projectiles: [firstProjectile],
    nextProjectileId: 1,
    missionStepCount: 0,
    missionTimeSeconds: 0,
    missionSeed: input.missionSeed,
    enemyDefsByType: defs,
    enemyBoundsByType,
    movementSpeedPxByType,
    committedSpeedPxByType,
    enemyPlan,
    arrivalGroups,
    arrivalGroupIndex: 0,
    currentEncounterId: null,
    enemies: [],
    nextEnemyId: 0,
    enemyProjectiles: [],
    nextEnemyProjectileId: 0,
    rangedProjectileGeometry: rangedProjectileGeometry(shortSide),
    rangedProjectileSpeedPxPerSecond: rangedProjectileSpeedPxPerSecond(
      input.viewportHeight,
    ),
    rangedFireStreams,
    finalArrivalTimeSeconds: enemyPlan.finalArrivalTimeSeconds,
    countdownSeconds: computeCountdown(enemyPlan.finalArrivalTimeSeconds, 0),
    pendingCombatRewards: 0,
    pendingEscapePenalties: 0,
    destroyedCountByType: emptyCounts(),
    escapedCountByType: emptyCounts(),
    destroyedByContactCountByType: emptyCounts(),
    pairContactCooldownSteps: {},
    playerHullIntegrity: input.playerHullIntegrity,
    playerMaximumHullIntegrity: input.playerMaximumHullIntegrity,
    playerDefeated: false,
    godModeEnabled: false,
    activeEnemyFlashStepsRemaining: {},
    destroyedEnemyFlashes: [],
    aircraftDangerFlashStepsRemaining: 0,
    criticalHullMessageTriggered: criticalTriggered,
    criticalHullMessageStepsRemaining: criticalTriggered
      ? CRITICAL_HULL_MESSAGE_STEPS
      : 0,
    terminalResult: null,
    successExitPhase: 'none',
    exitCentreStepsRemaining: 0,
    successExitAuthorized: false,
    // V02-WI-04 C03/C04: the observed per-step maxima accumulator exists only
    // in builds with the counters capability enabled; other builds carry
    // `null` (no instrumentation).
    evidence: EVIDENCE_COUNTERS_ENABLED
      ? createCombatEvidenceAccumulator(input.missionSeed)
      : null,
  };
}

/** Flattens the resolved plan into absolute-step runtime Arrival Groups in
 *  strict authored member order, assigning each member its stable zero-based
 *  mission ordinal (Epic §9.2, V02-AC-006). */
function flattenArrivalGroups(
  plan: MissionEncounterPlan,
): readonly RuntimeArrivalGroup[] {
  let ordinal = 0;
  return plan.encounters.flatMap((encounter) =>
    (encounter.staging ?? []).map((group) => ({
      encounterId: encounter.encounterId,
      timeSeconds: group.timeSeconds,
      stepIndex: group.stepIndex,
      offsetSeconds: group.offsetSeconds,
      members: group.members.map((member) => ({
        type: member.type,
        placement: member.placement,
        ordinal: ordinal++,
      })),
    })),
  );
}

function resolveEnemyDefs(
  enemies: readonly EnemyDefinition[],
): Record<EnemyType, EnemyDefinition> {
  const defs: Partial<Record<EnemyType, EnemyDefinition>> = {};
  for (const definition of enemies) {
    defs[definition.type] = definition;
  }
  for (const type of REGULAR_TYPES) {
    const definition = defs[type];
    if (definition === undefined) {
      throw new Error(
        `Combat simulation failed: the regular-enemy definition for ${type} is missing.`,
      );
    }
  }
  return defs as Record<EnemyType, EnemyDefinition>;
}

function boundsByType(
  defs: Record<EnemyType, EnemyDefinition>,
  shortSide: number,
): Record<EnemyType, CombatBoundsSize> {
  const result = {} as Record<EnemyType, CombatBoundsSize>;
  for (const type of REGULAR_TYPES) {
    const bounds = enemyRenderedBounds(defs[type], shortSide);
    result[type] = { width: bounds.widthPx, height: bounds.heightPx };
  }
  return result;
}

function speedMap(
  defs: Record<EnemyType, EnemyDefinition>,
  viewportHeight: number,
  select: (definition: EnemyDefinition) => number,
): Record<EnemyType, number> {
  const result = {} as Record<EnemyType, number>;
  for (const type of REGULAR_TYPES) {
    result[type] = viewportHeight * select(defs[type]);
  }
  return result;
}

function emptyCounts(): Record<EnemyType, number> {
  return {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  };
}

function computeCountdown(
  finalArrivalTimeSeconds: number,
  missionTimeSeconds: number,
): number {
  return Math.ceil(Math.max(0, finalArrivalTimeSeconds - missionTimeSeconds));
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
    weapon.fireRate <= 0 ||
    !Number.isFinite(weapon.projectileSpeedViewportHeightPerSecond) ||
    weapon.projectileSpeedViewportHeightPerSecond <= 0
  ) {
    throw new Error(
      'Invalid combat simulation weapon: damage finite non-negative, fireRate and projectile speed finite positive.',
    );
  }
}

function assertValidProjectile(config: PlayerProjectileConfig): void {
  if (
    !Number.isFinite(config.maximumLifetimeSeconds) ||
    config.maximumLifetimeSeconds <= 0
  ) {
    throw new Error(
      'Invalid combat simulation projectile: lifetime must be finite and positive.',
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
  // Epic §13.3: after a terminal result, gameplay input is disabled. Only the
  // viewport-resize reprojection remains so the Success exit geometry (and the
  // frozen Defeat state) survive resize deterministically.
  if (
    state.terminalResult !== null &&
    command.type !== 'combat/viewport-resize'
  ) {
    return state;
  }
  switch (command.type) {
    case 'combat/toggle-mode': {
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
    case 'combat/set-mode': {
      if (state.mode === command.mode) {
        return state;
      }
      const keys = { up: false, down: false, left: false, right: false };
      if (command.mode === 'mouse' && !state.mouseTargetActive) {
        return {
          ...state,
          mode: command.mode,
          keys,
          aircraft: { ...state.aircraft, velocityX: 0, velocityY: 0 },
        };
      }
      return { ...state, mode: command.mode, keys };
    }
    case 'combat/pointer-move': {
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

function addRoleCounts(
  current: Readonly<Record<EnemyType, number>>,
  types: readonly EnemyType[],
): Record<EnemyType, number> {
  const next = { ...current };
  for (const type of types) {
    next[type] += 1;
  }
  return next;
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
  if (state.terminalResult !== null) {
    // Epic §13.3: after a terminal result, gameplay stops. A Success continues
    // only its immutable deterministic centre-and-up exit sequence; Defeat
    // freezes (the v0.1 seam dispatches the result immediately).
    return state.terminalResult.kind === 'success'
      ? stepSuccessExit(state, stepSeconds)
      : state;
  }
  // V02-WI-04 C03/C04: one fresh evidence sink per executed step, present only
  // in builds with the counters capability enabled (Pass A). The whole branch
  // is dead code and eliminated in every other production build.
  const evidenceSink = EVIDENCE_COUNTERS_ENABLED
    ? createCollisionEvidenceSink()
    : null;
  const begun = beginStepCounters(state);
  const moved =
    begun.mode === 'keyboard'
      ? stepKeyboard(begun, stepSeconds)
      : stepMouse(begun, stepSeconds);
  const withMission = stepMission(moved, stepSeconds);
  const withCollisions = resolveCollisions(withMission, evidenceSink);
  const stepped = evaluateTerminalResult(withCollisions);
  if (EVIDENCE_COUNTERS_ENABLED && evidenceSink !== null) {
    // Observed workload maxima after the collision phase (surviving entities).
    stepped.evidence?.recordStep(
      stepped.enemies,
      stepped.projectiles.length,
      stepped.enemyProjectiles.length,
      evidenceSink,
    );
  }
  return stepped;
}

/** Decrements every existing feedback counter, the per-pair contact cooldowns,
 *  and the Critical Hull message timer once per executed step. */
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
  const pairContactCooldownSteps: Record<number, number> = {};
  for (const [id, steps] of Object.entries(state.pairContactCooldownSteps)) {
    const next = steps - 1;
    if (next > 0) {
      pairContactCooldownSteps[Number(id)] = next;
    }
  }
  return {
    ...state,
    activeEnemyFlashStepsRemaining,
    destroyedEnemyFlashes,
    aircraftDangerFlashStepsRemaining: Math.max(
      0,
      state.aircraftDangerFlashStepsRemaining - 1,
    ),
    pairContactCooldownSteps,
    criticalHullMessageStepsRemaining: Math.max(
      0,
      state.criticalHullMessageStepsRemaining - 1,
    ),
  };
}

/** Immutable deterministic two-phase Success exit (Epic §13.3, V02-AC-023):
 *  over exactly `0.5 s` the Aircraft centre X moves linearly to `50% VW` with
 *  Y fixed, then the Aircraft flies straight up at `60% VH/s` with no control.
 *  Once its complete rendered bounds leave the upper viewport boundary the
 *  phase becomes `complete` (the entry opens the committed Result Overlay).
 *  Resize reprojects the current geometry without restarting either phase.
 */
function stepSuccessExit(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  // V02-WI-04 C01: the exit sequence advances only after the campaign
  // transaction has successfully committed Success; a failed or inert commit
  // leaves the Aircraft frozen at the terminal position and never animates it
  // out or strands the session (Epic §13.3 order: freeze → commit → exit).
  if (!state.successExitAuthorized) {
    return state;
  }
  if (state.successExitPhase === 'complete') {
    return state;
  }
  if (state.successExitPhase === 'centre') {
    if (state.exitCentreStepsRemaining > 0) {
      const targetX = state.viewportWidth * 0.5;
      const centerX =
        state.aircraft.centerX +
        (targetX - state.aircraft.centerX) / state.exitCentreStepsRemaining;
      return {
        ...state,
        aircraft: { ...state.aircraft, centerX },
        exitCentreStepsRemaining: state.exitCentreStepsRemaining - 1,
      };
    }
    // The centre phase has run its exact 30 fixed steps; fall through so the
    // first upward movement happens on this same step (no extra idle step).
  }
  const stepUp = 0.6 * state.viewportHeight * stepSeconds;
  const centerY = state.aircraft.centerY - stepUp;
  const complete = centerY + state.aircraftHeight / 2 <= 0;
  return {
    ...state,
    aircraft: { ...state.aircraft, centerY },
    successExitPhase: complete ? 'complete' : 'fly-up',
  };
}

/**
 * Advances mission time by one fixed step, spawns every authored Arrival Group
 * whose exact step index has been reached, moves pre-existing enemies (with
 * activation/escape accounting), advances Ranged firing and all enemy
 * projectiles, and then runs the player firing/projectile step.
 */
function stepMission(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  const missionStepCount = state.missionStepCount + 1;
  const missionTimeSeconds = missionStepCount * FIXED_STEP_SECONDS;
  const spawns = collectDueSpawns(state, missionStepCount);
  const movement = stepActiveEnemies(state, stepSeconds);
  const afterEnemies: CombatSimulationState = {
    ...state,
    missionStepCount,
    missionTimeSeconds,
    countdownSeconds: computeCountdown(
      state.finalArrivalTimeSeconds,
      missionTimeSeconds,
    ),
    arrivalGroupIndex: spawns.arrivalGroupIndex,
    nextEnemyId: spawns.nextEnemyId,
    currentEncounterId: spawns.currentEncounterId,
    enemies: [...movement.kept, ...spawns.spawned],
    escapedCountByType: addRoleCounts(
      state.escapedCountByType,
      movement.escapedTypes,
    ),
    pendingEscapePenalties:
      state.pendingEscapePenalties + movement.escapedPenalties,
  };
  const withRangedFiring = stepRangedFiring(
    afterEnemies,
    movement.newlyActivatedIds,
  );
  const withEnemyProjectiles = stepEnemyProjectiles(
    withRangedFiring,
    stepSeconds,
  );
  return stepPlayerProjectiles(withEnemyProjectiles, stepSeconds);
}

/** Collects every authored Arrival Group whose exact step index has been
 *  reached, spawning its ordered members against the current viewport and
 *  engagement band. Member order and placements are the authored data
 *  (V02-AC-003/004); overlap is allowed and never re-rolled. */
function collectDueSpawns(
  state: CombatSimulationState,
  missionStepCount: number,
): {
  readonly spawned: readonly CombatEnemy[];
  readonly arrivalGroupIndex: number;
  readonly nextEnemyId: number;
  readonly currentEncounterId: string | null;
} {
  let arrivalGroupIndex = state.arrivalGroupIndex;
  let nextEnemyId = state.nextEnemyId;
  let currentEncounterId = state.currentEncounterId;
  const spawned: CombatEnemy[] = [];
  while (arrivalGroupIndex < state.arrivalGroups.length) {
    const group = state.arrivalGroups[arrivalGroupIndex];
    if (group === undefined || group.stepIndex > missionStepCount) {
      break;
    }
    for (const member of group.members) {
      spawned.push(
        spawnEnemyFromPlacement({
          id: nextEnemyId,
          type: member.type,
          hullIntegrity:
            state.enemyDefsByType[member.type].maximumHullIntegrity,
          width: state.enemyBoundsByType[member.type].width,
          height: state.enemyBoundsByType[member.type].height,
          placement: member.placement,
          boundsMinX: state.bounds.minX,
          boundsMaxX: state.bounds.maxX,
          viewportWidth: state.viewportWidth,
          viewportHeight: state.viewportHeight,
          ordinal: member.ordinal,
        }),
      );
      nextEnemyId += 1;
    }
    currentEncounterId = group.encounterId;
    arrivalGroupIndex += 1;
  }
  return { spawned, arrivalGroupIndex, nextEnemyId, currentEncounterId };
}

/** Moves pre-existing active enemies (per-role state machines) and removes
 *  escaped enemies, applying per-type escape penalties exactly once. */
function stepActiveEnemies(
  state: CombatSimulationState,
  stepSeconds: number,
): {
  readonly kept: readonly CombatEnemy[];
  readonly escapedTypes: readonly EnemyType[];
  readonly escapedPenalties: number;
  readonly newlyActivatedIds: ReadonlySet<number>;
} {
  const kept: CombatEnemy[] = [];
  const escapedTypes: EnemyType[] = [];
  let escapedPenalties = 0;
  const newlyActivatedIds = new Set<number>();
  for (const enemy of state.enemies) {
    const result = stepEnemy(enemy, {
      movementSpeedPx: state.movementSpeedPxByType[enemy.type] ?? 0,
      committedSpeedPx: state.committedSpeedPxByType[enemy.type] ?? 0,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
      stepSeconds,
      aircraftCenterX: state.aircraft.centerX,
      aircraftCenterY: state.aircraft.centerY,
    });
    if (result.newlyActivated) {
      newlyActivatedIds.add(enemy.id);
    }
    if (result.enemy === null) {
      escapedTypes.push(enemy.type);
      escapedPenalties += state.enemyDefsByType[enemy.type]?.escapePenalty ?? 0;
    } else {
      kept.push(result.enemy);
    }
  }
  return { kept, escapedTypes, escapedPenalties, newlyActivatedIds };
}

/**
 * Ranged firing (Epic §9.2, V02-AC-006): the first shot occurs after exactly
 * `180` running fixed steps from full-bounds activation (the timer is set on
 * the activation step and counted down on every later running step); after
 * each actual shot the next interval is `60 + rangedFireStream.nextInt(121)`
 * from that Ranged's independent stream. A Ranged destroyed before its next
 * shot consumes no further draw; the Aircraft aim is captured at the
 * authoritative firing instant.
 */
function stepRangedFiring(
  state: CombatSimulationState,
  newlyActivatedIds: ReadonlySet<number>,
): CombatSimulationState {
  let nextEnemyProjectileId = state.nextEnemyProjectileId;
  const spawnedProjectiles: EnemyProjectile[] = [];
  const enemies = state.enemies.map((enemy) => {
    if (enemy.kind !== 'ranged') {
      return enemy;
    }
    if (!enemy.activated) {
      // The first-shot timer only runs from full-bounds activation; a Ranged
      // that has not fully entered never fires (Epic §9.2, V02-AC-006).
      return enemy;
    }
    if (newlyActivatedIds.has(enemy.id)) {
      // Activation step: the 180-step first-shot timer begins without firing.
      return { ...enemy, firingStepsRemaining: RANGED_FIRST_SHOT_STEPS };
    }
    if (enemy.firingStepsRemaining > 1) {
      return {
        ...enemy,
        firingStepsRemaining: enemy.firingStepsRemaining - 1,
      };
    }
    // Timer reached its firing step: one projectile from the central lower
    // muzzle, aimed at the Aircraft position at this firing instant.
    const stream = state.rangedFireStreams[enemy.ordinal];
    if (stream === undefined) {
      // Defensive: the ordinal stream is created for every authored Ranged.
      return { ...enemy, firingStepsRemaining: RANGED_MIN_INTERVAL_STEPS };
    }
    spawnedProjectiles.push(
      spawnRangedProjectile(
        nextEnemyProjectileId,
        enemy.centerX,
        enemy.centerY + enemy.height / 2,
        state.aircraft.centerX,
        state.aircraft.centerY,
        state.rangedProjectileSpeedPxPerSecond,
        state.rangedProjectileGeometry,
      ),
    );
    nextEnemyProjectileId += 1;
    const interval =
      RANGED_MIN_INTERVAL_STEPS +
      stream.nextInt(RANGED_MAX_INTERVAL_STEPS - RANGED_MIN_INTERVAL_STEPS + 1);
    return { ...enemy, firingStepsRemaining: interval };
  });
  return {
    ...state,
    enemies,
    enemyProjectiles: [...state.enemyProjectiles, ...spawnedProjectiles],
    nextEnemyProjectileId,
  };
}

/** Advances every enemy projectile along its fixed trajectory and removes it
 *  when its complete bounds leave the viewport (v0.2 §9.2: no lifetime). */
function stepEnemyProjectiles(
  state: CombatSimulationState,
  stepSeconds: number,
): CombatSimulationState {
  const kept: EnemyProjectile[] = [];
  for (const projectile of state.enemyProjectiles) {
    const advanced = advanceEnemyProjectile(projectile, stepSeconds);
    if (
      !isEnemyProjectileOutsideViewport(
        advanced,
        state.viewportWidth,
        state.viewportHeight,
      )
    ) {
      kept.push(advanced);
    }
  }
  return { ...state, enemyProjectiles: kept };
}

/** Player automatic firing and projectile advance (S09; v0.2 §10 tuning). */
function stepPlayerProjectiles(
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
 * Collision phase orchestration (Epic §11): player-projectile → enemies first,
 * then enemy-projectile → Aircraft, then Aircraft → surviving-enemy contacts.
 * Player Hull, defeat, per-pair cooldowns, rewards, per-type counts, and the
 * one-shot Critical Hull latch are updated atomically; feedback is
 * presentation-only and never delays gameplay transitions.
 */
function resolveCollisions(
  state: CombatSimulationState,
  evidence?: CollisionEvidenceSink | null,
): CombatSimulationState {
  if (state.playerDefeated) {
    return state;
  }
  const projectileEvidence =
    evidence === undefined || evidence === null ? {} : { evidence };
  const projectileResult = resolveProjectileCollisions({
    projectiles: state.projectiles,
    enemies: state.enemies,
    projectileWidth: state.projectileWidth,
    projectileHeight: state.projectileHeight,
    existingFlashes: state.activeEnemyFlashStepsRemaining,
    ...projectileEvidence,
  });
  const enemyProjectileResult = resolveEnemyProjectileCollisions({
    projectiles: state.enemyProjectiles,
    aircraftCenterX: state.aircraft.centerX,
    aircraftCenterY: state.aircraft.centerY,
    aircraftWidth: state.aircraftWidth,
    aircraftHeight: state.aircraftHeight,
    playerHullIntegrity: state.playerHullIntegrity,
    playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
    godModeEnabled: state.godModeEnabled,
    playerDefeated: state.playerDefeated,
    ...projectileEvidence,
  });
  const contactResult = resolveAircraftContacts({
    enemies: projectileResult.enemies,
    aircraftCenterX: state.aircraft.centerX,
    aircraftCenterY: state.aircraft.centerY,
    aircraftWidth: state.aircraftWidth,
    aircraftHeight: state.aircraftHeight,
    playerHullIntegrity: enemyProjectileResult.playerHullIntegrity,
    playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
    pairContactCooldownSteps: state.pairContactCooldownSteps,
    contactDamageByType: contactDamageByType(state.enemyDefsByType),
    aircraftDangerFlashStepsRemaining: Math.max(
      state.aircraftDangerFlashStepsRemaining,
      enemyProjectileResult.aircraftDangerFlashStepsRemaining,
    ),
    godModeEnabled: state.godModeEnabled,
    playerDefeated: enemyProjectileResult.playerDefeated,
    ...projectileEvidence,
  });
  const accounting = applyDestroyedAccounting(state, {
    destroyed: [
      ...projectileResult.destroyedEnemies,
      ...contactResult.destroyedByContact,
    ],
    destroyedByContact: contactResult.destroyedByContact,
  });
  const activeEnemyFlashStepsRemaining: Record<number, number> = {};
  for (const enemy of contactResult.enemies) {
    const steps = projectileResult.flashes[enemy.id];
    if (steps !== undefined && steps > 0) {
      activeEnemyFlashStepsRemaining[enemy.id] = steps;
    }
  }
  const criticalHull = applyCriticalHullLatch(
    state.criticalHullMessageTriggered,
    contactResult.playerHullIntegrity,
    state.criticalHullMessageStepsRemaining,
  );
  return {
    ...state,
    projectiles: projectileResult.projectiles,
    enemyProjectiles: enemyProjectileResult.projectiles,
    enemies: contactResult.enemies,
    playerHullIntegrity: contactResult.playerHullIntegrity,
    playerDefeated: contactResult.playerDefeated,
    pairContactCooldownSteps: contactResult.pairContactCooldownSteps,
    aircraftDangerFlashStepsRemaining:
      contactResult.aircraftDangerFlashStepsRemaining,
    destroyedCountByType: accounting.destroyedCountByType,
    destroyedByContactCountByType: accounting.destroyedByContactCountByType,
    pendingCombatRewards: accounting.pendingCombatRewards,
    activeEnemyFlashStepsRemaining,
    destroyedEnemyFlashes: [
      ...state.destroyedEnemyFlashes,
      ...projectileResult.destroyedEnemyFlashes,
      ...contactResult.destroyedEnemyFlashes,
    ],
    criticalHullMessageTriggered: criticalHull.triggered,
    criticalHullMessageStepsRemaining: criticalHull.stepsRemaining,
  };
}

/** Applies destroyed-enemy reward and per-type count accounting exactly once
 *  per enemy (player-projectile destruction rewards the role value; Hunter
 *  kamikaze contact destroys with zero reward, Epic §9.3/§11.2/§12). */
function applyDestroyedAccounting(
  state: CombatSimulationState,
  input: {
    readonly destroyed: readonly DestroyedEnemyInfo[];
    readonly destroyedByContact: readonly DestroyedEnemyInfo[];
  },
): {
  readonly destroyedCountByType: Record<EnemyType, number>;
  readonly destroyedByContactCountByType: Record<EnemyType, number>;
  readonly pendingCombatRewards: number;
} {
  const destroyedCountByType = { ...state.destroyedCountByType };
  const destroyedByContactCountByType = {
    ...state.destroyedByContactCountByType,
  };
  let pendingCombatRewards = state.pendingCombatRewards;
  // V02-WI-04 C01: the total-Destroyed and contact-destruction tallies are
  // deduplicated independently — the previous shared `seen` set let the total
  // pass consume a contact-destroyed Hunter's id, so the contact count never
  // incremented for it.
  const destroyedSeen = new Set<number>();
  for (const info of input.destroyed) {
    if (destroyedSeen.has(info.id)) {
      continue;
    }
    destroyedSeen.add(info.id);
    destroyedCountByType[info.type] += 1;
  }
  const contactSeen = new Set<number>();
  for (const info of input.destroyedByContact) {
    if (contactSeen.has(info.id)) {
      continue;
    }
    contactSeen.add(info.id);
    destroyedByContactCountByType[info.type] += 1;
  }
  // Rewards are granted only for player-projectile destruction. Hunter
  // kamikaze contact grants zero; contact never destroys Basic/Ranged.
  const rewarded = input.destroyed.filter(
    (info) =>
      !input.destroyedByContact.some((contact) => contact.id === info.id),
  );
  for (const info of rewarded) {
    pendingCombatRewards +=
      state.enemyDefsByType[info.type]?.playerDestructionReward ?? 0;
  }
  return {
    destroyedCountByType,
    destroyedByContactCountByType,
    pendingCombatRewards,
  };
}

/** Critical Hull one-shot latch (v0.2 §15.3): appears immediately on Combat
 *  entry when the starting Hull is below 25, otherwise on the first transition
 *  from `≥ 25` to `< 25`, for exactly 2.0 s once per Mission Instance. */
function applyCriticalHullLatch(
  alreadyTriggered: boolean,
  hull: number,
  currentStepsRemaining: number,
): { readonly triggered: boolean; readonly stepsRemaining: number } {
  if (alreadyTriggered) {
    // V02-WI-04: the running 2 s timer is preserved — a later collision pass
    // must never reset the already-active once-per-Mission-Instance message.
    return { triggered: true, stepsRemaining: currentStepsRemaining };
  }
  if (hull >= 25) {
    return { triggered: false, stepsRemaining: 0 };
  }
  return { triggered: true, stepsRemaining: CRITICAL_HULL_MESSAGE_STEPS };
}

function contactDamageByType(
  defs: Readonly<Record<EnemyType, EnemyDefinition>>,
): Record<EnemyType, number> {
  return {
    'basic-drone': defs['basic-drone']?.contactDamage ?? 15,
    'ranged-drone': defs['ranged-drone']?.contactDamage ?? 15,
    'hunter-drone': HUNTER_CONTACT_DAMAGE,
    'elite-drone': 0,
  };
}

/**
 * Terminal evaluation (Epic §7.3, V02-AC-005/023): Defeat has unconditional
 * priority when player Hull is 0. Otherwise Success occurs when the final
 * scheduled Arrival Group has spawned, no scheduled encounter remains, and no
 * active enemy remains (every spawned regular enemy is Destroyed or Escaped)
 * with Hull above 0. The Combat Countdown reaching `00:00` does not itself
 * grant Success.
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
  const allSpawned = state.arrivalGroupIndex >= state.arrivalGroups.length;
  if (allSpawned && state.enemies.length === 0) {
    return {
      ...state,
      terminalResult: { kind: 'success' },
      successExitPhase: 'centre',
      exitCentreStepsRemaining: SUCCESS_CENTRE_STEPS,
    };
  }
  return state;
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
    return state;
  } else {
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

/**
 * Effective resize reprojection (Combat §12.3, V02-DEC-018): normalized Top
 * fractions and Side `Y` fractions are preserved without rerolling entry data;
 * current geometry reprojects proportionally and is clamped to the new bounds.
 * Per-role speeds and complete rendered bounds are recomputed from the new
 * viewport so gameplay AABBs always equal the presentation's rendered bounds.
 */
function resizeSimulation(
  state: CombatSimulationState,
  command: Extract<
    CombatInputCommand,
    { readonly type: 'combat/viewport-resize' }
  >,
): CombatSimulationState {
  const ratioX = command.width / state.viewportWidth;
  const ratioY = command.height / state.viewportHeight;
  const shortSide = Math.min(command.width, command.height);
  const config = resolveMovementConfig(shortSide);
  const bounds = computeBounds(
    command.width,
    command.height,
    command.aircraftWidth,
    command.aircraftHeight,
    config.movementMargin,
  );
  const geometry = projectileGeometry(shortSide);
  const rangedGeometry = rangedProjectileGeometry(shortSide);
  const enemyBoundsByType = boundsByType(state.enemyDefsByType, shortSide);
  const movementSpeedPxByType = speedMap(
    state.enemyDefsByType,
    command.height,
    (definition) => definition.movementSpeedViewportHeightPerSecond,
  );
  const committedSpeedPxByType = speedMap(
    state.enemyDefsByType,
    command.height,
    (definition) => definition.committedAttackSpeedViewportHeightPerSecond,
  );
  const enemies = state.enemies.map((enemy) => ({
    ...enemy,
    width: enemyBoundsByType[enemy.type].width,
    height: enemyBoundsByType[enemy.type].height,
    centerX:
      enemy.entry === 'top'
        ? reprojectEngagementBandX(enemy.centerX, state.bounds, bounds)
        : enemy.centerX * ratioX,
    centerY: enemy.centerY * ratioY,
  }));
  const enemyProjectiles = state.enemyProjectiles.map((projectile) => ({
    ...projectile,
    centerX: projectile.centerX * ratioX,
    centerY: projectile.centerY * ratioY,
    width: rangedGeometry.width,
    height: rangedGeometry.height,
    velocityX: projectile.velocityX * ratioX,
    velocityY: projectile.velocityY * ratioY,
  }));
  const projectiles = state.projectiles.map((projectile) => ({
    ...projectile,
    centerX: projectile.centerX * ratioX,
    centerY: projectile.centerY * ratioY,
  }));
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
      centerX: clamp(state.aircraft.centerX * ratioX, bounds.minX, bounds.maxX),
      centerY: clamp(state.aircraft.centerY * ratioY, bounds.minY, bounds.maxY),
    },
    projectileWidth: geometry.width,
    projectileHeight: geometry.height,
    projectileSpeedPxPerSecond: state.projectileSpeedPxPerSecond * ratioY,
    enemies,
    enemyProjectiles,
    projectiles,
    destroyedEnemyFlashes,
    enemyBoundsByType,
    movementSpeedPxByType,
    committedSpeedPxByType,
    rangedProjectileGeometry: rangedGeometry,
    rangedProjectileSpeedPxPerSecond: rangedProjectileSpeedPxPerSecond(
      command.height,
    ),
  };
}

/**
 * V02-WI-04 deterministic Debug command transform (Epic §17, V02-AC-026).
 * Reuses existing identity/geometry/content owners and never duplicates spawn,
 * collision, or result logic. Commands are strict no-ops after the terminal
 * result freeze; forced Success/Defeat enter the existing terminal-result
 * relay through `evaluateTerminalResult` (the runtime/entry relays once).
 */
export function applyDebugCommand(
  state: CombatSimulationState,
  command: CombatDebugCommand,
): CombatSimulationState {
  if (state.terminalResult !== null) {
    return state;
  }
  switch (command.type) {
    case 'combat-debug/god-mode':
      return command.enabled
        ? {
            ...state,
            godModeEnabled: true,
            playerHullIntegrity: state.playerMaximumHullIntegrity,
            aircraftDangerFlashStepsRemaining: 0,
          }
        : { ...state, godModeEnabled: false };
    case 'combat-debug/set-hull':
      if (state.godModeEnabled) {
        return state;
      }
      return { ...state, playerHullIntegrity: command.hull };
    case 'combat-debug/spawn-standard-enemy': {
      // Exactly one Basic Drone at the fixed valid top-edge band position
      // through the authored-staging spawn owner (no RNG consumed).
      const enemy = spawnEnemyFromPlacement({
        id: state.nextEnemyId,
        type: 'basic-drone',
        hullIntegrity:
          state.enemyDefsByType['basic-drone'].maximumHullIntegrity,
        width: state.enemyBoundsByType['basic-drone'].width,
        height: state.enemyBoundsByType['basic-drone'].height,
        placement: {
          kind: 'top',
          engagementBandFraction: 0.5,
        },
        boundsMinX: state.bounds.minX,
        boundsMaxX: state.bounds.maxX,
        viewportWidth: state.viewportWidth,
        viewportHeight: state.viewportHeight,
        ordinal: 0,
      });
      return {
        ...state,
        enemies: [...state.enemies, enemy],
        nextEnemyId: state.nextEnemyId + 1,
      };
    }
    case 'combat-debug/spawn-encounter': {
      // Spawns one approved authored Encounter's Arrival Groups deterministically
      // at the current mission time and marks those groups as spawned (no
      // re-roll, no reactive adaptation). Already-spawned encounters are no-ops.
      return spawnEncounterForDebug(state, command.encounterId);
    }
    case 'combat-debug/win-mission':
      // Normal Success even if enemies remain: mark every Arrival Group
      // spawned and resolve active enemies, then evaluate the terminal state
      // through the same Success path. The deterministic centre-and-up exit is
      // NOT completed here (V02-WI-04 C01): the Debug pause is closed through
      // the authoritative lifecycle so forced Success runs the same committed
      // exit sequence as natural Success before result presentation.
      return evaluateTerminalResult({
        ...state,
        arrivalGroupIndex: state.arrivalGroups.length,
        enemies: [],
      });
    case 'combat-debug/lose-mission':
      return evaluateTerminalResult({
        ...state,
        godModeEnabled: false,
        playerHullIntegrity: 0,
        playerDefeated: true,
      });
  }
}

/** Deterministic Debug encounter spawn (Epic §17): every Arrival Group of the
 *  named encounter — including out-of-order encounters — is materialized at
 *  its authored placements against the current viewport/engagement band and
 *  REMOVED from the remaining plan so the natural schedule never duplicates an
 *  authored group. V02-WI-04 C03: the previous implementation only spawned the
 *  encounter at the plan cursor (a `Spawn E5` while e1–e4 were still pending
 *  silently did nothing — the root cause of the C01 false-green evidence). An
 *  unknown encounter id remains a strict no-op. */
function spawnEncounterForDebug(
  state: CombatSimulationState,
  encounterId: string,
): CombatSimulationState {
  let nextEnemyId = state.nextEnemyId;
  let currentEncounterId = state.currentEncounterId;
  const spawned: CombatEnemy[] = [];
  const remaining: RuntimeArrivalGroup[] = [];
  let matchedAny = false;
  for (const group of state.arrivalGroups) {
    if (group.encounterId !== encounterId) {
      remaining.push(group);
      continue;
    }
    matchedAny = true;
    currentEncounterId = group.encounterId;
    for (const member of group.members) {
      spawned.push(
        spawnEnemyFromPlacement({
          id: nextEnemyId,
          type: member.type,
          hullIntegrity:
            state.enemyDefsByType[member.type].maximumHullIntegrity,
          width: state.enemyBoundsByType[member.type].width,
          height: state.enemyBoundsByType[member.type].height,
          placement: member.placement,
          boundsMinX: state.bounds.minX,
          boundsMaxX: state.bounds.maxX,
          viewportWidth: state.viewportWidth,
          viewportHeight: state.viewportHeight,
          ordinal: member.ordinal,
        }),
      );
      nextEnemyId += 1;
    }
  }
  if (!matchedAny) {
    return state;
  }
  return {
    ...state,
    enemies: [...state.enemies, ...spawned],
    nextEnemyId,
    // The spawned groups are consumed by removal; the cursor points at the
    // first still-scheduled group so the natural schedule continues correctly.
    arrivalGroups: remaining,
    arrivalGroupIndex: Math.min(state.arrivalGroupIndex, remaining.length),
    currentEncounterId,
  };
}

/**
 * V02-WI-04 C03 evidence-only legacy five-Basic benchmark spawn (Epic §20.1):
 * five Basic Drones across the current engagement band through the authored
 * staging spawn owner (V02-DEC-018 normalized Top fractions). It reproduces
 * the accepted v0.1 final-group entity workload for the pre/post-integration
 * proxy comparison and is compile-time absent from the ordinary build.
 */
function spawnLegacyFiveBasicBenchmark(
  state: CombatSimulationState,
): CombatSimulationState {
  const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
  const enemies = fractions.map((fraction, index) =>
    spawnEnemyFromPlacement({
      id: state.nextEnemyId + index,
      type: 'basic-drone',
      hullIntegrity: state.enemyDefsByType['basic-drone'].maximumHullIntegrity,
      width: state.enemyBoundsByType['basic-drone'].width,
      height: state.enemyBoundsByType['basic-drone'].height,
      placement: { kind: 'top', engagementBandFraction: fraction },
      boundsMinX: state.bounds.minX,
      boundsMaxX: state.bounds.maxX,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
      ordinal: index,
    }),
  );
  return {
    ...state,
    enemies: [...state.enemies, ...enemies],
    nextEnemyId: state.nextEnemyId + enemies.length,
  };
}

export interface CombatSimulationRuntime {
  readonly getState: () => CombatSimulationState;
  readonly submit: (command: CombatInputCommand) => void;
  readonly advance: (frameDeltaSeconds: number) => CombatSimulationState;
  readonly setPaused: (paused: boolean) => void;
  readonly submitDebug: (command: CombatDebugCommand) => void;
  /** V02-WI-04 C01: authorises the deterministic centre-and-up Success exit
   *  after the campaign transaction has committed Success (Epic §13.3). */
  readonly authorizeSuccessExit: () => void;
  /** V02-WI-04 C03/C04 evidence-only benchmark scenarios (Epic §20.1). Present
   *  only in scenario-bearing builds (compile-time absent from the ordinary
   *  production artifact). `legacy-five-basic` reproduces the accepted v0.1
   *  final group; `m01-e5` materialises the authored Mission 01 e5 Encounter
   *  through the deterministic debug spawn (V02-WI-04 C04). */
  readonly submitEvidenceBenchmark?: (
    scenario: 'legacy-five-basic' | 'm01-e5',
  ) => void;
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
  let isPaused = false;
  return {
    getState: () => state,
    submit(command) {
      if (disposed) {
        return;
      }
      if (
        isPaused &&
        (command.type === 'combat/pointer-move' ||
          command.type === 'combat/keyboard' ||
          command.type === 'combat/toggle-mode')
      ) {
        return;
      }
      const before = state;
      state = submitCombatCommand(state, command);
      if (
        command.type === 'combat/viewport-resize' &&
        (state.viewportWidth !== before.viewportWidth ||
          state.viewportHeight !== before.viewportHeight)
      ) {
        accumulatorSeconds = 0;
      }
    },
    advance(frameDeltaSeconds) {
      if (disposed || isPaused) {
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
    setPaused(paused) {
      if (disposed || paused === isPaused) {
        return;
      }
      isPaused = paused;
      if (paused) {
        state = {
          ...state,
          keys: { up: false, down: false, left: false, right: false },
        };
        accumulatorSeconds = 0;
      }
    },
    submitDebug(command) {
      if (disposed) {
        return;
      }
      state = applyDebugCommand(state, command);
    },
    authorizeSuccessExit() {
      if (disposed || state.successExitAuthorized) {
        return;
      }
      state = { ...state, successExitAuthorized: true };
    },
    // V02-WI-04 C03/C04 evidence-only benchmark scenarios (Epic §20.1 legacy
    // proxy + exact e5 materialization). The method is compile-time absent
    // from the ordinary production artifact through the scenarios gate.
    ...(EVIDENCE_SCENARIOS_ENABLED
      ? {
          submitEvidenceBenchmark(
            scenario: 'legacy-five-basic' | 'm01-e5',
          ): void {
            if (disposed) {
              return;
            }
            if (scenario === 'legacy-five-basic') {
              state = spawnLegacyFiveBasicBenchmark(state);
            } else if (scenario === 'm01-e5') {
              state = spawnEncounterForDebug(state, 'interception-01-e5');
            }
          },
        }
      : {}),
    dispose() {
      disposed = true;
    },
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

/** Preserves a Top Entry's normalized location inside the firing band. */
function reprojectEngagementBandX(
  centerX: number,
  previous: CombatBounds,
  next: CombatBounds,
): number {
  return remapClamped(
    centerX,
    previous.minX,
    previous.maxX,
    next.minX,
    next.maxX,
  );
}

function remapClamped(
  value: number,
  sourceMin: number,
  sourceMax: number,
  targetMin: number,
  targetMax: number,
): number {
  const sourceSpan = sourceMax - sourceMin;
  if (sourceSpan <= 0) {
    return (targetMin + targetMax) / 2;
  }
  const fraction = clamp((value - sourceMin) / sourceSpan, 0, 1);
  return targetMin + fraction * (targetMax - targetMin);
}

function computeBounds(
  viewportWidth: number,
  viewportHeight: number,
  aircraftWidth: number,
  aircraftHeight: number,
  margin: number,
): CombatBounds {
  return {
    minX: margin + aircraftWidth / 2,
    minY: margin + aircraftHeight / 2,
    maxX: viewportWidth - margin - aircraftWidth / 2,
    maxY: viewportHeight - margin - aircraftHeight / 2,
  };
}

function clampPoint(point: CombatPoint, bounds: CombatBounds): CombatPoint {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
