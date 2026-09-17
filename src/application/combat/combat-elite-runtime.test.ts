import { describe, expect, it } from 'vitest';
import { createEliteMovementStream } from '@domain/random';
import type { Mulberry32 } from '@domain/random';
import {
  ELITE_DRONE,
  MISSIONS,
  enemyRenderedBounds,
} from '@application/content';
import { createTestCombatState, TEST_MISSION_SEED } from '@test-support/domain';
import {
  activateElite,
  createEliteForEntry,
  isEliteContactActive,
  isEliteProjectileTargetEligible,
  stepEnemy,
  ELITE_ANCHOR_VIEWPORT_FRACTION_X,
  ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
  ELITE_ARMOURED_PHASE_STEPS,
  ELITE_CANNON_INTERVAL_STEPS,
  ELITE_CORE_INTERVAL_STEPS,
  ELITE_ENTRY_SPEED_VIEWPORT_HEIGHT_PER_SECOND,
  ELITE_HORIZONTAL_SPEED_VIEWPORT_WIDTH_PER_SECOND,
  ELITE_MOVEMENT_INTERVAL_DRAW_RANGE,
  ELITE_MOVEMENT_MIN_INTERVAL_STEPS,
  ELITE_VULNERABLE_PHASE_STEPS,
} from './enemies';
import type { CombatEnemy, EliteEnemyState, EnemyStepInput } from './enemies';
import {
  advanceEliteCannonProjectile,
  advanceEliteHomingCore,
  eliteCannonProjectileGeometry,
  eliteCannonSpeedPxPerSecond,
  eliteCoreProjectileGeometry,
  eliteCoreSpeedPxPerSecond,
  isEliteHomingCoreRemoved,
  isEnemyProjectileOutsideViewport,
  spawnEliteCannonProjectile,
  spawnEliteHomingCore,
  shortestHeadingTurnRadians,
  ELITE_CANNON_DAMAGE,
  ELITE_CANNON_TILT_RADIANS,
  ELITE_CORE_DAMAGE,
  ELITE_CORE_LIFETIME_STEPS,
  ELITE_CORE_TURN_RADIANS_PER_STEP,
} from './projectiles';
import type { EnemyProjectileInstance } from './projectiles';
import { resolveEnemyProjectileCollisions } from './collision';
import {
  stepCombatSimulation,
  submitCombatCommand,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';

/**
 * V02-WI-06 E02 — Elite deterministic movement and attacks (Epic §9.4, §10–§11,
 * V02-AC-009–011, V02-DEC-033).
 *
 * The Elite remains unreachable from the player-facing product in E02: every
 * test constructs the one authored Elite through its explicit factory and
 * injects it into the real fixed-step pipeline. Coverage: the dedicated
 * `elite-movement` stream (exact fixed vector, draw order, identity stability,
 * interval bounds), the Top-entry contract, horizontal movement and boundary
 * behaviour, phase-geometry and resize clamping, the Armoured cannon pair and
 * the Vulnerable homing Core (cadence, geometry, turning, cap, lifetime),
 * canonical step ordering, active contact, cleanup, fixed-step repeatability,
 * and the unchanged regular-enemy stream isolation.
 */

const VIEWPORT = { width: 1280, height: 600 };
const SHORT_SIDE = Math.min(VIEWPORT.width, VIEWPORT.height);
const ELITE_ID = 21;
const ELITE_ORDINAL = 0;
const AIRCRAFT_HOLD = { x: VIEWPORT.width * 0.5, y: VIEWPORT.height * 0.8 };

const ARMOURED_BOUNDS = enemyRenderedBounds(
  ELITE_DRONE.armouredVisualGeometry,
  SHORT_SIDE,
);
const VULNERABLE_BOUNDS = enemyRenderedBounds(
  ELITE_DRONE.vulnerableVisualGeometry,
  SHORT_SIDE,
);

/**
 * Exact `elite-movement` vectors for `TEST_MISSION_SEED`, reproduced with the
 * independent FNV-1a encoder + Mulberry32 reference sequence: ordinal `0` draws
 * `1 → 172`, `1 → 126`, `1 → 144`, `1 → 116`; ordinal `1` draws `1 → 98`;
 * ordinal `7` draws `0 → 181`. A reversed draw order would give ordinal `0`
 * an interval of `90 + 45 = 135` and then direction `0` (left) instead.
 */
const ORDINAL_0_FIRST_DECISION = [1, 172] as const;
const ORDINAL_0_SECOND_DECISION = [1, 126] as const;
const ORDINAL_0_LAST_DECISION = [1, 116] as const;
const ORDINAL_0_DECISIONS: readonly (readonly [1 | -1, number])[] = [
  ORDINAL_0_FIRST_DECISION,
  ORDINAL_0_SECOND_DECISION,
  [1, 144],
  ORDINAL_0_LAST_DECISION,
];
const ORDINAL_1_FIRST_DECISION = [1, 98] as const;
const ORDINAL_7_FIRST_DECISION = [-1, 181] as const;
const REVERSED_ORDER_INTERVAL = 135;
const REVERSED_ORDER_DIRECTION = -1;

function movementStream(
  ordinal = ELITE_ORDINAL,
  missionSeed = TEST_MISSION_SEED,
): Mulberry32 {
  return createEliteMovementStream(missionSeed, ordinal);
}

function entryElite(ordinal = ELITE_ORDINAL): EliteEnemyState {
  return createEliteForEntry({
    id: ELITE_ID,
    ordinal,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
  });
}

function eliteFrom(enemies: readonly CombatEnemy[]): EliteEnemyState {
  for (const enemy of enemies) {
    if (enemy.kind === 'elite') {
      return enemy;
    }
  }
  throw new Error('expected an active Elite');
}

function stepInput(overrides: Partial<EnemyStepInput> = {}): EnemyStepInput {
  return {
    movementSpeedPx: 0,
    committedSpeedPx: 0,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    stepSeconds: FIXED_STEP_SECONDS,
    aircraftCenterX: AIRCRAFT_HOLD.x,
    aircraftCenterY: AIRCRAFT_HOLD.y,
    ...overrides,
  };
}

function stepEliteExact(
  elite: EliteEnemyState,
  steps: number,
  input: EnemyStepInput = stepInput(),
): EliteEnemyState {
  let current = elite;
  for (let index = 0; index < steps; index += 1) {
    const result = stepEnemy(current, input);
    if (result.enemy === null || result.enemy.kind !== 'elite') {
      throw new Error('the Elite must never escape or change kind');
    }
    current = result.enemy;
  }
  return current;
}

/** The exact executed-step count from the entry creation position to the
 *  anchor-reaching activation step (Epic §9.4 `12% VH/s`). */
function entryStepsToAnchor(): number {
  const elite = entryElite();
  const anchorY = VIEWPORT.height * ELITE_ANCHOR_VIEWPORT_FRACTION_Y;
  const perStep =
    ELITE_ENTRY_SPEED_VIEWPORT_HEIGHT_PER_SECOND *
    VIEWPORT.height *
    FIXED_STEP_SECONDS;
  return Math.ceil((anchorY - elite.centerY) / perStep);
}

/** Activates a fresh entry Elite through the real movement owner with its
 *  dedicated stream, consuming exactly the activation decision pair. */
function activatedElite(
  stream: Mulberry32 = movementStream(),
  ordinal = ELITE_ORDINAL,
): EliteEnemyState {
  const result = stepEliteExact(
    entryElite(ordinal),
    entryStepsToAnchor(),
    stepInput({ eliteMovementStream: stream }),
  );
  if (!result.activated) {
    throw new Error('expected the Elite to activate at its anchor');
  }
  return result;
}

/** Runs the real fixed-step pipeline with one injected Elite and (optionally)
 *  its dedicated movement stream. */
function pipelineState(
  elite: EliteEnemyState,
  stream: Mulberry32 | null = null,
  overrides: Partial<CombatSimulationState> = {},
): CombatSimulationState {
  const base = createTestCombatState();
  return {
    ...base,
    ...overrides,
    enemies: [elite],
    arrivalGroups: [],
    arrivalGroupIndex: 0,
    finalArrivalTimeSeconds: 0,
    countdownSeconds: 0,
    eliteMovementStreams: stream === null ? {} : { [elite.ordinal]: stream },
  };
}

/** Pins the Aircraft and its mouse target so movement never disturbs a test. */
function pinnedAircraft(
  centerX: number,
  centerY: number,
): Partial<CombatSimulationState> {
  return {
    aircraft: { centerX, centerY, velocityX: 0, velocityY: 0 },
    mouseTarget: { x: centerX, y: centerY },
  };
}

function stepPipeline(
  state: CombatSimulationState,
  steps: number,
): CombatSimulationState {
  let current = state;
  for (let index = 0; index < steps; index += 1) {
    current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
  }
  return current;
}

function projectilesOfKind(
  state: CombatSimulationState,
  kind: EnemyProjectileInstance['kind'],
): readonly EnemyProjectileInstance[] {
  return state.enemyProjectiles.filter(
    (projectile) => projectile.kind === kind,
  );
}

/** A canonical activated Elite already inside the Vulnerable phase with its
 *  full Core timer, ready for Core cadence/cap/lifetime coverage. */
function vulnerableElite(
  stream: Mulberry32 = movementStream(),
): EliteEnemyState {
  return {
    ...activatedElite(stream),
    phase: 'vulnerable',
    phaseStepsElapsed: 1,
    phaseStepsRemaining: ELITE_VULNERABLE_PHASE_STEPS - 1,
    attackStepsRemaining: ELITE_CORE_INTERVAL_STEPS,
    width: VULNERABLE_BOUNDS.widthPx,
    height: VULNERABLE_BOUNDS.heightPx,
  };
}

describe('elite-movement stream: draw order and identity (Epic §9.4, V02-DEC-033)', () => {
  it('draws direction first and then the interval for the exact fixed vector', () => {
    const elite = activatedElite(movementStream());
    expect([
      elite.horizontalDirection,
      elite.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_0_FIRST_DECISION]);
    // Counter-case: the reversed draw order (interval first, direction second)
    // would produce this pair instead, so the assertion above is order-exact.
    const reversed = movementStream();
    const reversedInterval =
      ELITE_MOVEMENT_MIN_INTERVAL_STEPS +
      reversed.nextInt(ELITE_MOVEMENT_INTERVAL_DRAW_RANGE);
    const reversedDirection = reversed.nextInt(2) === 0 ? -1 : 1;
    expect(reversedInterval).toBe(REVERSED_ORDER_INTERVAL);
    expect(reversedDirection).toBe(REVERSED_ORDER_DIRECTION);
    expect(elite.movementDecisionStepsRemaining).not.toBe(reversedInterval);
    expect(elite.horizontalDirection).not.toBe(reversedDirection);
  });

  it('consumes the same ordered pair on every scheduled decision at the exact interval', () => {
    const stream = movementStream();
    let elite = activatedElite(stream);
    for (const [direction, interval] of ORDINAL_0_DECISIONS.slice(0, -1)) {
      expect(elite.horizontalDirection).toBe(direction);
      expect(elite.movementDecisionStepsRemaining).toBe(interval);
      // The decision is drawn on the step the running timer reaches 1, i.e.
      // exactly `interval` executed steps after the previous decision.
      elite = stepEliteExact(
        elite,
        interval,
        stepInput({ eliteMovementStream: stream }),
      );
    }
    const [lastDirection, lastInterval] = ORDINAL_0_LAST_DECISION;
    expect(elite.horizontalDirection).toBe(lastDirection);
    expect(elite.movementDecisionStepsRemaining).toBe(lastInterval);
  });

  it('uses the stable authored member ordinal as its stream identity', () => {
    const ordinal0 = activatedElite(movementStream(0), 0);
    const ordinal1 = activatedElite(movementStream(1), 1);
    const ordinal7 = activatedElite(movementStream(7), 7);
    expect([
      ordinal1.horizontalDirection,
      ordinal1.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_1_FIRST_DECISION]);
    expect([
      ordinal7.horizontalDirection,
      ordinal7.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_7_FIRST_DECISION]);
    expect(ordinal1.movementDecisionStepsRemaining).not.toBe(
      ordinal0.movementDecisionStepsRemaining,
    );
    // A different derived mission seed produces a different sequence.
    const otherSeed = activatedElite(movementStream(0, 1), 0);
    expect([
      otherSeed.horizontalDirection,
      otherSeed.movementDecisionStepsRemaining,
    ]).toEqual([1, 174]);
  });

  it('keeps every scheduled interval inside the inclusive 90–210 step bounds', () => {
    const stream = movementStream(3);
    let elite = activatedElite(stream, 3);
    const observed: number[] = [];
    for (let decision = 0; decision < 12; decision += 1) {
      const interval = elite.movementDecisionStepsRemaining;
      expect(interval).toBeGreaterThanOrEqual(
        ELITE_MOVEMENT_MIN_INTERVAL_STEPS,
      );
      expect(interval).toBeLessThanOrEqual(
        ELITE_MOVEMENT_MIN_INTERVAL_STEPS +
          ELITE_MOVEMENT_INTERVAL_DRAW_RANGE -
          1,
      );
      observed.push(interval);
      elite = stepEliteExact(
        elite,
        interval,
        stepInput({ eliteMovementStream: stream }),
      );
    }
    // Every interval is a real decision draw, never the un-drawn boundary value.
    expect(new Set(observed).size).toBeGreaterThan(1);
    expect(Math.min(...observed)).toBeGreaterThanOrEqual(90);
    expect(Math.max(...observed)).toBeLessThanOrEqual(210);
  });

  it('selects the stream by the Elite authored ordinal, never by identity or order', () => {
    const elite: EliteEnemyState = {
      ...entryElite(5),
      activated: true,
      phase: 'armoured',
      centerX: VIEWPORT.width * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
      centerY: VIEWPORT.height * ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
      hasEnteredVisibleArea: true,
      phaseStepsElapsed: 1,
      phaseStepsRemaining: ELITE_ARMOURED_PHASE_STEPS - 1,
      attackStepsRemaining: ELITE_CANNON_INTERVAL_STEPS,
      horizontalDirection: null,
      movementDecisionStepsRemaining: 0,
    };
    // Independent reference draws for ordinal `5` in the canonical order.
    const reference = movementStream(5);
    const referenceDirection = reference.nextInt(2) === 0 ? -1 : 1;
    const referenceInterval =
      ELITE_MOVEMENT_MIN_INTERVAL_STEPS +
      reference.nextInt(ELITE_MOVEMENT_INTERVAL_DRAW_RANGE);
    // The map is keyed by the Elite's own stable ordinal: the decision is drawn
    // on this step and the Elite moves exactly one horizontal step.
    const moved = stepPipeline(
      {
        ...pipelineState(elite, null),
        eliteMovementStreams: { 5: movementStream(5) },
      },
      1,
    );
    const movedElite = eliteFrom(moved.enemies);
    expect(movedElite.horizontalDirection).toBe(referenceDirection);
    expect(movedElite.movementDecisionStepsRemaining).toBe(referenceInterval);
    expect(
      movedElite.centerX - VIEWPORT.width * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
    ).toBeCloseTo(
      referenceDirection *
        ELITE_HORIZONTAL_SPEED_VIEWPORT_WIDTH_PER_SECOND *
        VIEWPORT.width *
        FIXED_STEP_SECONDS,
      9,
    );
    // A map keyed by another ordinal provides no stream: no draw happens and
    // the Elite has no horizontal movement at all.
    const withoutStream = stepPipeline(
      {
        ...pipelineState(elite, null),
        eliteMovementStreams: { 0: movementStream(0) },
      },
      1,
    );
    const stillElite = eliteFrom(withoutStream.enemies);
    expect(stillElite.horizontalDirection).toBeNull();
    expect(stillElite.movementDecisionStepsRemaining).toBe(0);
    expect(stillElite.centerX).toBe(
      VIEWPORT.width * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
    );
  });
});

describe('Elite Top entry contract in the fixed-step pipeline (Epic §9.4, V02-DEC-033)', () => {
  it('is not projectile-targetable, contact-active, or attack-active during entry', () => {
    // The Elite is above its anchor (still entering) and overlaps the Aircraft.
    const entering: EliteEnemyState = {
      ...entryElite(),
      centerX: AIRCRAFT_HOLD.x,
      centerY: VIEWPORT.height * 0.1,
    };
    expect(isEliteProjectileTargetEligible(entering)).toBe(false);
    expect(isEliteContactActive(entering)).toBe(false);
    const injected = {
      id: 900,
      damage: 1,
      centerX: entering.centerX,
      centerY: entering.centerY,
      ageSeconds: 0,
    };
    const after = stepPipeline(
      pipelineState(entering, movementStream(), {
        ...pinnedAircraft(AIRCRAFT_HOLD.x, VIEWPORT.height * 0.1),
        projectiles: [injected],
      }),
      1,
    );
    // The projectile passes through: no damage, no consumption, no feedback.
    expect(after.projectiles.some((projectile) => projectile.id === 900)).toBe(
      true,
    );
    expect(eliteFrom(after.enemies).hullIntegrity).toBe(60);
    expect(after.eliteDeflectionFeedbacks).toEqual({});
    expect(after.activeEnemyFlashStepsRemaining[ELITE_ID]).toBeUndefined();
    // Contact is inactive and no attack runs.
    expect(after.playerHullIntegrity).toBe(100);
    expect(after.pairContactCooldownSteps).toEqual({});
    expect(after.enemyProjectiles).toHaveLength(0);
    const elite = eliteFrom(after.enemies);
    expect(elite.phase).toBe('entering');
    expect(elite.phaseStepsElapsed).toBe(0);
    expect(elite.phaseStepsRemaining).toBe(0);
    expect(elite.attackStepsRemaining).toBe(0);
    expect(elite.horizontalDirection).toBeNull();
  });

  it('clamps exactly to the anchor and activates with undecremented timers on the reaching step', () => {
    const stream = movementStream();
    const state = pipelineState(
      entryElite(),
      stream,
      pinnedAircraft(AIRCRAFT_HOLD.x, AIRCRAFT_HOLD.y),
    );
    const steps = entryStepsToAnchor();
    const before = stepPipeline(state, steps - 1);
    const entering = eliteFrom(before.enemies);
    expect(entering.activated).toBe(false);
    expect(entering.phase).toBe('entering');
    expect(entering.phaseStepsRemaining).toBe(0);
    expect(entering.attackStepsRemaining).toBe(0);
    expect(entering.centerY).toBeLessThan(
      VIEWPORT.height * ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
    );

    const activatedState = stepPipeline(state, steps);
    const elite = eliteFrom(activatedState.enemies);
    expect(elite.activated).toBe(true);
    expect(elite.phase).toBe('armoured');
    expect(elite.centerX).toBeCloseTo(
      VIEWPORT.width * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
      9,
    );
    expect(elite.centerY).toBeCloseTo(
      VIEWPORT.height * ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
      9,
    );
    // Every timer is initialized from its full value on this step and the
    // initial movement decision is drawn here.
    expect(elite.phaseStepsRemaining).toBe(ELITE_ARMOURED_PHASE_STEPS);
    expect(elite.attackStepsRemaining).toBe(ELITE_CANNON_INTERVAL_STEPS);
    expect([
      elite.horizontalDirection,
      elite.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_0_FIRST_DECISION]);
    // No attack fires on the activation step.
    expect(activatedState.enemyProjectiles).toHaveLength(0);

    // The following executed step is the first decrement of every timer.
    const decremented = eliteFrom(stepPipeline(activatedState, 1).enemies);
    expect(decremented.phaseStepsRemaining).toBe(
      ELITE_ARMOURED_PHASE_STEPS - 1,
    );
    expect(decremented.attackStepsRemaining).toBe(
      ELITE_CANNON_INTERVAL_STEPS - 1,
    );
    expect(decremented.movementDecisionStepsRemaining).toBe(
      ORDINAL_0_FIRST_DECISION[1] - 1,
    );
  });
});

describe('Elite horizontal movement, boundaries, and geometry clamping (Epic §9.4)', () => {
  const perStepX =
    ELITE_HORIZONTAL_SPEED_VIEWPORT_WIDTH_PER_SECOND *
    VIEWPORT.width *
    FIXED_STEP_SECONDS;

  it('moves at exactly 12% VW/s with a constant vertical centre and consumes no draw before a decision', () => {
    const stream = movementStream();
    const elite = activatedElite(stream);
    const afterTen = stepEliteExact(
      elite,
      10,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(afterTen.centerX).toBeCloseTo(elite.centerX + 10 * perStepX, 9);
    expect(afterTen.centerY).toBeCloseTo(elite.centerY, 9);
    expect(afterTen.movementDecisionStepsRemaining).toBe(
      ORDINAL_0_FIRST_DECISION[1] - 10,
    );
    // The scheduled decision still consumes exactly the same second pair, so no
    // draw happened during the ten interior steps.
    const decided = stepEliteExact(
      elite,
      ORDINAL_0_FIRST_DECISION[1],
      stepInput({ eliteMovementStream: stream }),
    );
    expect([
      decided.horizontalDirection,
      decided.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_0_SECOND_DECISION]);
  });

  it('clamps at the right boundary and forces the direction inward without a draw or timer reset', () => {
    const stream = movementStream();
    const elite = activatedElite(stream);
    const maxX = VIEWPORT.width - elite.width / 2;
    const nearRight: EliteEnemyState = { ...elite, centerX: maxX - 5 };
    const atBoundary = stepEliteExact(
      nearRight,
      2,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(atBoundary.centerX).toBeCloseTo(maxX, 9);
    expect(atBoundary.centerX + atBoundary.width / 2).toBeLessThanOrEqual(
      VIEWPORT.width,
    );
    expect(atBoundary.horizontalDirection).toBe(-1);
    // The scheduled decision timer kept decrementing: no reset and no draw.
    expect(atBoundary.movementDecisionStepsRemaining).toBe(
      ORDINAL_0_FIRST_DECISION[1] - 2,
    );
    const inward = stepEliteExact(
      atBoundary,
      1,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(inward.centerX).toBeCloseTo(maxX - perStepX, 9);
    // The next scheduled decision still follows the identical sequence.
    const decided = stepEliteExact(
      inward,
      ORDINAL_0_FIRST_DECISION[1] - 3,
      stepInput({ eliteMovementStream: stream }),
    );
    expect([
      decided.horizontalDirection,
      decided.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_0_SECOND_DECISION]);
  });

  it('clamps at the left boundary and forces the direction inward', () => {
    const stream = movementStream(7);
    const elite = activatedElite(stream, 7);
    expect([
      elite.horizontalDirection,
      elite.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_7_FIRST_DECISION]);
    const minX = elite.width / 2;
    const nearLeft: EliteEnemyState = { ...elite, centerX: minX + 5 };
    const atBoundary = stepEliteExact(
      nearLeft,
      2,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(atBoundary.centerX).toBeCloseTo(minX, 9);
    expect(atBoundary.centerX - atBoundary.width / 2).toBeGreaterThanOrEqual(0);
    expect(atBoundary.horizontalDirection).toBe(1);
    const inward = stepEliteExact(
      atBoundary,
      1,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(inward.centerX).toBeCloseTo(minX + perStepX, 9);
  });
});

describe('Elite phase-geometry and resize reprojection (Epic §9.4)', () => {
  const perStepX =
    ELITE_HORIZONTAL_SPEED_VIEWPORT_WIDTH_PER_SECOND *
    VIEWPORT.width *
    FIXED_STEP_SECONDS;

  it('clamps a new phase geometry inside the viewport while preserving the decision timer and RNG', () => {
    const stream = movementStream();
    const armoured = activatedElite(stream);
    const armouredMaxX = VIEWPORT.width - armoured.width / 2;
    const boundary: EliteEnemyState = {
      ...armoured,
      centerX: armouredMaxX,
      phaseStepsRemaining: 1,
    };
    const transitioned = stepEliteExact(
      boundary,
      1,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(transitioned.phase).toBe('vulnerable');
    expect(transitioned.width).toBeCloseTo(VULNERABLE_BOUNDS.widthPx, 9);
    const vulnerableMaxX = VIEWPORT.width - transitioned.width / 2;
    expect(vulnerableMaxX).toBeLessThan(armouredMaxX);
    expect(transitioned.centerX).toBeCloseTo(vulnerableMaxX, 9);
    expect(transitioned.horizontalDirection).toBe(-1);
    // The decision timer extended into the new phase without a reset.
    expect(transitioned.movementDecisionStepsRemaining).toBe(
      ORDINAL_0_FIRST_DECISION[1] - 1,
    );
    expect(transitioned.attackStepsRemaining).toBe(ELITE_CORE_INTERVAL_STEPS);
    // The preserved stream still yields the identical next decision.
    const decided = stepEliteExact(
      transitioned,
      ORDINAL_0_FIRST_DECISION[1] - 1,
      stepInput({ eliteMovementStream: stream }),
    );
    expect([
      decided.horizontalDirection,
      decided.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_0_SECOND_DECISION]);
  });

  it('reprojects proportionally on resize and preserves the phase, timers, direction, and stream', () => {
    const stream = movementStream();
    const elite = activatedElite(stream);
    const state = pipelineState(
      elite,
      stream,
      pinnedAircraft(AIRCRAFT_HOLD.x, AIRCRAFT_HOLD.y),
    );
    const resized = submitCombatCommand(state, {
      type: 'combat/viewport-resize',
      width: 1600,
      height: 900,
      aircraftWidth: 900 * 0.08 * (1278 / 1231),
      aircraftHeight: 900 * 0.08,
    });
    const after = eliteFrom(resized.enemies);
    expect(after.centerX).toBeCloseTo(
      elite.centerX * (1600 / VIEWPORT.width),
      9,
    );
    expect(after.centerY).toBeCloseTo(
      elite.centerY * (900 / VIEWPORT.height),
      9,
    );
    expect(after.width).toBeCloseTo(
      enemyRenderedBounds(ELITE_DRONE.armouredVisualGeometry, 900).widthPx,
      9,
    );
    expect(after.phase).toBe(elite.phase);
    expect(after.phaseStepsRemaining).toBe(elite.phaseStepsRemaining);
    expect(after.attackStepsRemaining).toBe(elite.attackStepsRemaining);
    expect(after.movementDecisionStepsRemaining).toBe(
      elite.movementDecisionStepsRemaining,
    );
    expect(after.horizontalDirection).toBe(elite.horizontalDirection);
    const decided = eliteFrom(
      stepPipeline(resized, elite.movementDecisionStepsRemaining).enemies,
    );
    expect([
      decided.horizontalDirection,
      decided.movementDecisionStepsRemaining,
    ]).toEqual([...ORDINAL_0_SECOND_DECISION]);
  });

  it('clamps a resize that would leave the complete bounds outside and forces the direction inward', () => {
    const stream = movementStream();
    const elite = activatedElite(stream);
    const nearRight: EliteEnemyState = {
      ...elite,
      centerX: VIEWPORT.width - elite.width / 2 - 1,
    };
    expect(nearRight.horizontalDirection).toBe(1);
    const narrow = submitCombatCommand(
      {
        ...pipelineState(nearRight, stream),
        aircraft: { centerX: 400, centerY: 400, velocityX: 0, velocityY: 0 },
      },
      {
        type: 'combat/viewport-resize',
        width: 900,
        height: 600,
        aircraftWidth: 48,
        aircraftHeight: 48,
      },
    );
    const clamped = eliteFrom(narrow.enemies);
    expect(clamped.centerX).toBeCloseTo(900 - clamped.width / 2, 9);
    expect(clamped.centerX + clamped.width / 2).toBeLessThanOrEqual(900);
    expect(clamped.horizontalDirection).toBe(-1);
    // The clamp consumed no draw and did not reset the scheduled timer.
    expect(clamped.movementDecisionStepsRemaining).toBe(
      nearRight.movementDecisionStepsRemaining,
    );
    const inward = eliteFrom(stepPipeline(narrow, 1).enemies);
    expect(inward.centerX).toBeCloseTo(
      900 - clamped.width / 2 - perStepX * (900 / VIEWPORT.width),
      9,
    );
  });
});

describe('Elite Armoured cannon pair (Epic §9.4, V02-AC-010, V02-DEC-033)', () => {
  it('fires both cannons exactly 90 steps after activation from the exact ±6° muzzles', () => {
    const stream = movementStream();
    const state = pipelineState(
      activatedElite(stream),
      stream,
      pinnedAircraft(AIRCRAFT_HOLD.x, AIRCRAFT_HOLD.y),
    );
    const before = stepPipeline(state, ELITE_CANNON_INTERVAL_STEPS - 1);
    expect(projectilesOfKind(before, 'elite-cannon')).toHaveLength(0);
    const fired = stepPipeline(before, 1);
    const cannons = projectilesOfKind(fired, 'elite-cannon');
    expect(cannons).toHaveLength(2);
    const elite = eliteFrom(fired.enemies);
    const geometry = eliteCannonProjectileGeometry(SHORT_SIDE);
    const speed = eliteCannonSpeedPxPerSecond(VIEWPORT.height);
    expect(geometry.width).toBeCloseTo(SHORT_SIDE * 0.006, 9);
    expect(geometry.height).toBeCloseTo(SHORT_SIDE * 0.012, 9);
    expect(speed).toBeCloseTo(VIEWPORT.height * 0.2, 9);
    const left = cannons[0];
    const right = cannons[1];
    // Ascending identities in muzzle order (left, then right).
    expect(left?.id).toBe(0);
    expect(right?.id).toBe(1);
    expect(left?.kind).toBe('elite-cannon');
    expect(right?.kind).toBe('elite-cannon');
    const muzzleY = elite.centerY - elite.height * 0.18;
    // The spawn owner guarantees the exact muzzle rule: the projectile's top
    // edge touches its muzzle point.
    const spawnedLeft = spawnEliteCannonProjectile(
      99,
      elite.centerX,
      elite.centerY,
      elite.width,
      elite.height,
      'left',
      speed,
      geometry,
    );
    expect(spawnedLeft.centerX).toBeCloseTo(
      elite.centerX - elite.width * 0.31,
      9,
    );
    expect(spawnedLeft.centerY - spawnedLeft.height / 2).toBeCloseTo(
      muzzleY,
      9,
    );
    const expectations = [
      { projectile: left, side: -1 as const },
      { projectile: right, side: 1 as const },
    ];
    for (const { projectile, side } of expectations) {
      if (projectile === undefined || projectile.kind !== 'elite-cannon') {
        throw new Error('expected one Elite cannon projectile per muzzle');
      }
      expect(projectile.damage).toBe(ELITE_CANNON_DAMAGE);
      expect(ELITE_CANNON_DAMAGE).toBe(10);
      expect(projectile.width).toBeCloseTo(geometry.width, 9);
      expect(projectile.height).toBeCloseTo(geometry.height, 9);
      // Exact `−6°` (left) / `+6°` (right) headings at `20% VH/s`.
      const heading = side * ELITE_CANNON_TILT_RADIANS;
      const velocityX = Math.sin(heading) * speed;
      const velocityY = Math.cos(heading) * speed;
      expect(projectile.velocityX).toBeCloseTo(velocityX, 9);
      expect(projectile.velocityY).toBeCloseTo(velocityY, 9);
      // Launched on its muzzle and then advanced by the shared movement phase
      // of the same fixed step.
      expect(projectile.centerX).toBeCloseTo(
        elite.centerX +
          side * elite.width * 0.31 +
          velocityX * FIXED_STEP_SECONDS,
        9,
      );
      expect(projectile.centerY).toBeCloseTo(
        muzzleY + geometry.height / 2 + velocityY * FIXED_STEP_SECONDS,
        9,
      );
    }
    // The pair resets the complete 90-step cadence.
    expect(elite.attackStepsRemaining).toBe(ELITE_CANNON_INTERVAL_STEPS);
    const nextPair = stepPipeline(fired, ELITE_CANNON_INTERVAL_STEPS);
    expect(projectilesOfKind(nextPair, 'elite-cannon')).toHaveLength(4);
  });

  it('has no lifetime and is removed only on a valid Aircraft hit or complete viewport exit', () => {
    const geometry = eliteCannonProjectileGeometry(SHORT_SIDE);
    const projectile = spawnEliteCannonProjectile(
      7,
      640,
      300,
      0,
      0,
      'left',
      eliteCannonSpeedPxPerSecond(VIEWPORT.height),
      geometry,
    );
    expect(projectile).not.toHaveProperty('remainingLifetimeSteps');
    expect(projectile.damage).toBe(10);
    // A partially visible projectile at the bottom edge stays active.
    const partial: EnemyProjectileInstance = {
      ...projectile,
      centerY: VIEWPORT.height + geometry.height / 2 - 1,
    };
    expect(isEnemyProjectileOutsideViewport(partial, VIEWPORT.width, 600)).toBe(
      false,
    );
    // Complete viewport exit removes it.
    const beyond = advanceEliteCannonProjectile(partial, 60);
    expect(isEnemyProjectileOutsideViewport(beyond, VIEWPORT.width, 600)).toBe(
      true,
    );
    // A valid Aircraft hit consumes exactly that projectile for 10 damage.
    const hit = resolveEnemyProjectileCollisions({
      projectiles: [projectile],
      aircraftCenterX: 640,
      aircraftCenterY: 300,
      aircraftWidth: 48,
      aircraftHeight: 48,
      playerHullIntegrity: 100,
      playerMaximumHullIntegrity: 100,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(hit.projectiles).toHaveLength(0);
    expect(hit.playerHullIntegrity).toBe(90);
    expect(hit.hitCount).toBe(1);
  });
});

describe('Elite Vulnerable homing Core (Epic §9.4, V02-AC-010, V02-DEC-033)', () => {
  const coreSpeed = () => eliteCoreSpeedPxPerSecond(VIEWPORT.height);

  it('turns at most 1° (60°/s) per later step, keeps the launch aim, and snaps inside the limit', () => {
    const geometry = eliteCoreProjectileGeometry(SHORT_SIDE);
    const core = spawnEliteHomingCore(
      0,
      640,
      120,
      ARMOURED_BOUNDS.heightPx,
      640,
      480,
      coreSpeed(),
      geometry,
    );
    expect(core.headingRadians).toBeCloseTo(0, 12);
    const launchStep = advanceEliteHomingCore(
      core,
      900,
      480,
      FIXED_STEP_SECONDS,
    );
    expect(launchStep.headingRadians).toBe(0);
    expect(launchStep.centerX).toBeCloseTo(core.centerX, 9);
    expect(launchStep.centerY).toBeCloseTo(
      core.centerY + coreSpeed() * FIXED_STEP_SECONDS,
      9,
    );
    expect(launchStep.remainingLifetimeSteps).toBe(
      ELITE_CORE_LIFETIME_STEPS - 1,
    );
    // The first later step turns by exactly the maximum one-degree step.
    const turned = advanceEliteHomingCore(
      launchStep,
      900,
      480,
      FIXED_STEP_SECONDS,
    );
    expect(turned.headingRadians - launchStep.headingRadians).toBeCloseTo(
      ELITE_CORE_TURN_RADIANS_PER_STEP,
      12,
    );
    expect(ELITE_CORE_TURN_RADIANS_PER_STEP / FIXED_STEP_SECONDS).toBeCloseTo(
      Math.PI / 3,
      12,
    );
    // A target inside the limit snaps exactly onto its heading.
    const nearlyStraight = spawnEliteHomingCore(
      1,
      640,
      120,
      ARMOURED_BOUNDS.heightPx,
      640.5,
      960,
      coreSpeed(),
      geometry,
    );
    const afterLaunch = advanceEliteHomingCore(
      nearlyStraight,
      640.5,
      960,
      FIXED_STEP_SECONDS,
    );
    const snapped = advanceEliteHomingCore(
      afterLaunch,
      640.5,
      960,
      FIXED_STEP_SECONDS,
    );
    const desired = Math.atan2(
      640.5 - afterLaunch.centerX,
      960 - afterLaunch.centerY,
    );
    expect(
      Math.abs(shortestHeadingTurnRadians(afterLaunch.headingRadians, desired)),
    ).toBeLessThanOrEqual(ELITE_CORE_TURN_RADIANS_PER_STEP);
    expect(snapped.headingRadians).toBeCloseTo(desired, 12);
  });

  it('chooses the clockwise turn for an exactly opposite heading', () => {
    const geometry = eliteCoreProjectileGeometry(SHORT_SIDE);
    const core = spawnEliteHomingCore(
      0,
      640,
      480,
      ARMOURED_BOUNDS.heightPx,
      640,
      960,
      coreSpeed(),
      geometry,
    );
    expect(core.headingRadians).toBeCloseTo(0, 12);
    const launchStep = advanceEliteHomingCore(
      core,
      640,
      960,
      FIXED_STEP_SECONDS,
    );
    // The Aircraft is exactly opposite (directly above the Core centre): the
    // canonical tie-break is clockwise, i.e. a decreasing signed heading.
    const opposite = advanceEliteHomingCore(
      launchStep,
      launchStep.centerX,
      launchStep.centerY - 100,
      FIXED_STEP_SECONDS,
    );
    expect(opposite.headingRadians).toBeCloseTo(
      -ELITE_CORE_TURN_RADIANS_PER_STEP,
      12,
    );
    expect(Math.sin(opposite.headingRadians)).toBeLessThan(0);
    // Counter-case: the counterclockwise choice would carry a positive
    // (screen-right) x-component.
    expect(Math.sin(ELITE_CORE_TURN_RADIANS_PER_STEP)).toBeGreaterThan(0);
  });

  it('preserves the prior heading for a zero-distance target', () => {
    const geometry = eliteCoreProjectileGeometry(SHORT_SIDE);
    const core = spawnEliteHomingCore(
      0,
      640,
      120,
      ARMOURED_BOUNDS.heightPx,
      900,
      480,
      coreSpeed(),
      geometry,
    );
    const launchStep = advanceEliteHomingCore(
      core,
      900,
      480,
      FIXED_STEP_SECONDS,
    );
    const heading = launchStep.headingRadians;
    const sameSpot = advanceEliteHomingCore(
      launchStep,
      launchStep.centerX,
      launchStep.centerY,
      FIXED_STEP_SECONDS,
    );
    expect(sameSpot.headingRadians).toBe(heading);
    expect(sameSpot.centerX).toBeCloseTo(
      launchStep.centerX + Math.sin(heading) * coreSpeed() * FIXED_STEP_SECONDS,
      9,
    );
    expect(sameSpot.centerY).toBeCloseTo(
      launchStep.centerY + Math.cos(heading) * coreSpeed() * FIXED_STEP_SECONDS,
      9,
    );
  });

  it('is removed by a valid Aircraft hit for exactly 20 damage', () => {
    const geometry = eliteCoreProjectileGeometry(SHORT_SIDE);
    const core = spawnEliteHomingCore(
      3,
      640,
      300,
      0,
      640,
      300,
      coreSpeed(),
      geometry,
    );
    // A live Core inside the viewport with its full lifetime is not removed.
    expect(
      isEliteHomingCoreRemoved(core, VIEWPORT.width, VIEWPORT.height),
    ).toBe(false);
    const hit = resolveEnemyProjectileCollisions({
      projectiles: [core],
      aircraftCenterX: 640,
      aircraftCenterY: 300,
      aircraftWidth: 48,
      aircraftHeight: 48,
      playerHullIntegrity: 100,
      playerMaximumHullIntegrity: 100,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(hit.projectiles).toHaveLength(0);
    expect(hit.playerHullIntegrity).toBe(80);
    expect(hit.hitCount).toBe(1);
  });

  it('launches the first Core only after the complete 150-step interval from the exact muzzle', () => {
    const stream = movementStream();
    const aircraft = { x: 900, y: 480 };
    const state = pipelineState(
      vulnerableElite(stream),
      stream,
      pinnedAircraft(aircraft.x, aircraft.y),
    );
    const before = stepPipeline(state, ELITE_CORE_INTERVAL_STEPS - 1);
    expect(projectilesOfKind(before, 'elite-core')).toHaveLength(0);
    const fired = stepPipeline(before, 1);
    const cores = projectilesOfKind(fired, 'elite-core');
    expect(cores).toHaveLength(1);
    const core = cores[0];
    if (core?.kind !== 'elite-core') {
      throw new Error('expected one Elite homing Core');
    }
    const elite = eliteFrom(fired.enemies);
    const geometry = eliteCoreProjectileGeometry(SHORT_SIDE);
    expect(geometry.width).toBeCloseTo(SHORT_SIDE * 0.012, 9);
    expect(geometry.height).toBeCloseTo(SHORT_SIDE * 0.012, 9);
    expect(core.width).toBeCloseTo(geometry.width, 9);
    expect(core.height).toBeCloseTo(geometry.height, 9);
    expect(core.damage).toBe(ELITE_CORE_DAMAGE);
    expect(ELITE_CORE_DAMAGE).toBe(20);
    expect(core.speedPxPerSecond).toBeCloseTo(coreSpeed(), 9);
    expect(core.speedPxPerSecond).toBeCloseTo(VIEWPORT.height * 0.12, 9);
    // Muzzle: Elite centre x, centre y − 2% of the current Elite height; the
    // Core begins at that local point and may overlap the craft.
    const muzzleX = elite.centerX;
    const muzzleY = elite.centerY - elite.height * 0.02;
    // The launch step aims at the Aircraft and performs no turn; the shared
    // movement phase then advances it exactly one step.
    const aim = Math.atan2(aircraft.x - muzzleX, aircraft.y - muzzleY);
    expect(core.headingRadians).toBeCloseTo(aim, 12);
    expect(core.centerX).toBeCloseTo(
      muzzleX + Math.sin(aim) * core.speedPxPerSecond * FIXED_STEP_SECONDS,
      9,
    );
    expect(core.centerY).toBeCloseTo(
      muzzleY + Math.cos(aim) * core.speedPxPerSecond * FIXED_STEP_SECONDS,
      9,
    );
    expect(core.remainingLifetimeSteps).toBe(ELITE_CORE_LIFETIME_STEPS - 1);
    expect(ELITE_CORE_LIFETIME_STEPS).toBe(360);
    // The launch resets the complete 150-step Core timer.
    expect(elite.attackStepsRemaining).toBe(ELITE_CORE_INTERVAL_STEPS);
  });
});

describe('Elite attack ordering, Core cap, lifetime, and cleanup (Epic §9.4)', () => {
  it('suppresses an old-phase shot due on the phase-boundary step and keeps the new timer full', () => {
    const stream = movementStream();
    const dueArmoured: EliteEnemyState = {
      ...activatedElite(stream),
      attackStepsRemaining: 1,
      phaseStepsRemaining: 1,
    };
    const transitioned = stepEliteExact(
      dueArmoured,
      1,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(transitioned.phase).toBe('vulnerable');
    expect(transitioned.phaseStepsElapsed).toBe(0);
    expect(transitioned.phaseStepsRemaining).toBe(ELITE_VULNERABLE_PHASE_STEPS);
    expect(transitioned.attackStepsRemaining).toBe(ELITE_CORE_INTERVAL_STEPS);
    // In the real pipeline the next executed step is the new timer's first
    // decrement and still fires nothing; the boundary step fired nothing.
    const transitionedState = stepPipeline(
      pipelineState(
        dueArmoured,
        stream,
        pinnedAircraft(AIRCRAFT_HOLD.x, AIRCRAFT_HOLD.y),
      ),
      1,
    );
    expect(eliteFrom(transitionedState.enemies).phase).toBe('vulnerable');
    expect(eliteFrom(transitionedState.enemies).attackStepsRemaining).toBe(
      ELITE_CORE_INTERVAL_STEPS,
    );
    expect(projectilesOfKind(transitionedState, 'elite-core')).toHaveLength(0);
    const afterOne = stepPipeline(transitionedState, 1);
    expect(eliteFrom(afterOne.enemies).attackStepsRemaining).toBe(
      ELITE_CORE_INTERVAL_STEPS - 1,
    );
    expect(projectilesOfKind(afterOne, 'elite-core')).toHaveLength(0);

    // Mirror case: a Vulnerable Core due on its boundary step is suppressed and
    // the new Armoured phase keeps its complete cannon timer.
    const dueVulnerable: EliteEnemyState = {
      ...vulnerableElite(stream),
      attackStepsRemaining: 1,
      phaseStepsRemaining: 1,
    };
    const toArmoured = stepEliteExact(
      dueVulnerable,
      1,
      stepInput({ eliteMovementStream: stream }),
    );
    expect(toArmoured.phase).toBe('armoured');
    expect(toArmoured.phaseStepsElapsed).toBe(0);
    expect(toArmoured.attackStepsRemaining).toBe(ELITE_CANNON_INTERVAL_STEPS);
  });

  it('advances only the owning phase weapon and keeps launched projectiles across a phase change', () => {
    const stream = movementStream();
    const cannon = spawnEliteCannonProjectile(
      50,
      640,
      120,
      ARMOURED_BOUNDS.widthPx,
      ARMOURED_BOUNDS.heightPx,
      'left',
      eliteCannonSpeedPxPerSecond(VIEWPORT.height),
      eliteCannonProjectileGeometry(SHORT_SIDE),
    );
    const state = pipelineState(
      {
        ...activatedElite(stream),
        attackStepsRemaining: 1,
        phaseStepsRemaining: 1,
      },
      stream,
      { ...pinnedAircraft(900, 480), enemyProjectiles: [cannon] },
    );
    const transitioned = stepPipeline(state, 1);
    const elite = eliteFrom(transitioned.enemies);
    expect(elite.phase).toBe('vulnerable');
    expect(elite.attackStepsRemaining).toBe(ELITE_CORE_INTERVAL_STEPS);
    // The already launched cannon survives the boundary untouched and advances
    // exactly one step along its fixed trajectory.
    const kept = projectilesOfKind(transitioned, 'elite-cannon');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toEqual(
      advanceEliteCannonProjectile(cannon, FIXED_STEP_SECONDS),
    );
    // The suppressed boundary fired no new projectile.
    expect(projectilesOfKind(transitioned, 'elite-core')).toHaveLength(0);
  });

  it('holds a due Core launch at zero while two Cores are active and releases it with capacity', () => {
    const stream = movementStream();
    const geometry = eliteCoreProjectileGeometry(SHORT_SIDE);
    const expiring: readonly EnemyProjectileInstance[] = [
      {
        ...spawnEliteHomingCore(100, 200, 80, 40, 1200, 560, 72, geometry),
        remainingLifetimeSteps: 1,
      },
      {
        ...spawnEliteHomingCore(101, 200, 80, 40, 1200, 560, 72, geometry),
        remainingLifetimeSteps: 1,
      },
    ];
    const state = pipelineState(
      { ...vulnerableElite(stream), attackStepsRemaining: 1 },
      stream,
      { ...pinnedAircraft(900, 480), enemyProjectiles: [...expiring] },
    );
    // The launch is due, the cap holds it at zero, and no third Core exists;
    // the two expired Cores leave the viewport-free state in this same step.
    const held = stepPipeline(state, 1);
    expect(projectilesOfKind(held, 'elite-core')).toHaveLength(0);
    expect(eliteFrom(held.enemies).attackStepsRemaining).toBe(0);
    // The first later Vulnerable step with capacity launches one Core and
    // resets the complete 150-step timer.
    const released = stepPipeline(held, 1);
    expect(projectilesOfKind(released, 'elite-core')).toHaveLength(1);
    expect(eliteFrom(released.enemies).attackStepsRemaining).toBe(
      ELITE_CORE_INTERVAL_STEPS,
    );
  });

  it('leaves no Elite entity, local record, reward, or projectile behind after destruction and cleanup', () => {
    const geometry = eliteCannonProjectileGeometry(SHORT_SIDE);
    const cannons: readonly EnemyProjectileInstance[] = [
      spawnEliteCannonProjectile(
        70,
        640,
        120,
        ARMOURED_BOUNDS.widthPx,
        ARMOURED_BOUNDS.heightPx,
        'left',
        eliteCannonSpeedPxPerSecond(VIEWPORT.height),
        geometry,
      ),
      spawnEliteCannonProjectile(
        71,
        640,
        120,
        ARMOURED_BOUNDS.widthPx,
        ARMOURED_BOUNDS.heightPx,
        'right',
        eliteCannonSpeedPxPerSecond(VIEWPORT.height),
        geometry,
      ),
    ];
    const state: CombatSimulationState = {
      ...pipelineState(
        {
          ...vulnerableElite(movementStream()),
          hullIntegrity: 1,
          // Keep the Elite stationary under the Aircraft's firing column so the
          // player's automatic fire destroys it.
          horizontalDirection: null,
          movementDecisionStepsRemaining: 0,
        },
        null,
        { ...pinnedAircraft(640, 480), enemyProjectiles: [...cannons] },
      ),
      // Hold the runtime open so no terminal result freezes the cleanup check.
      arrivalGroups: [
        {
          encounterId: 'e2-hold',
          timeSeconds: 100000,
          stepIndex: 6000000,
          offsetSeconds: 0,
          members: [],
        },
      ],
    };
    // The player's automatic fire destroys the 1-Hull Elite.
    const destroyed = stepPipeline(state, 90);
    expect(destroyed.enemies).toHaveLength(0);
    expect(destroyed.eliteDeflectionFeedbacks).toEqual({});
    expect(destroyed.destroyedCountByType['elite-drone']).toBe(1);
    // V02-WI-06 E03: one player-projectile Elite destruction grants exactly the
    // canonical `+8` pending Credits and still no escape penalty.
    expect(destroyed.pendingCombatRewards).toBe(8);
    expect(destroyed.pendingEscapePenalties).toBe(0);
    // Already launched cannons keep their own lifecycle and leave no residue.
    expect(
      destroyed.enemyProjectiles.filter(
        (projectile) => projectile.kind === 'elite-cannon',
      ),
    ).toHaveLength(2);
    const settled = stepPipeline(destroyed, 300);
    expect(
      settled.enemyProjectiles.filter(
        (projectile) => projectile.kind !== 'ranged',
      ),
    ).toHaveLength(0);
    expect(settled.eliteDeflectionFeedbacks).toEqual({});
  });

  it('expires a Core after exactly 360 executed steps without damage', () => {
    const stream = movementStream();
    const state = pipelineState(
      {
        ...vulnerableElite(stream),
        attackStepsRemaining: 1,
        phaseStepsRemaining: 3,
      },
      stream,
      // The Aircraft is far below the muzzle, so the Core expires before it can
      // reach it (360 × 1.2 px = 432 px of travel).
      pinnedAircraft(640, 590),
    );
    const launched = stepPipeline(state, 1);
    const initial = projectilesOfKind(launched, 'elite-core')[0];
    if (initial?.kind !== 'elite-core') {
      throw new Error('expected one launched Core');
    }
    expect(initial.remainingLifetimeSteps).toBe(ELITE_CORE_LIFETIME_STEPS - 1);
    let current = launched;
    let aliveSteps = 1;
    while (
      projectilesOfKind(current, 'elite-core').length > 0 &&
      aliveSteps <= ELITE_CORE_LIFETIME_STEPS + 1
    ) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
      aliveSteps += 1;
    }
    // Expiry happens on exactly the 360th executed step and deals no damage.
    expect(aliveSteps).toBe(ELITE_CORE_LIFETIME_STEPS);
    expect(projectilesOfKind(current, 'elite-core')).toHaveLength(0);
    expect(current.playerHullIntegrity).toBe(100);
    expect(current.aircraftDangerFlashStepsRemaining).toBe(0);
  });
});

describe('Elite determinism, production boundary, and regular-enemy isolation (V02-DEC-033)', () => {
  it('produces identical Elite state across two identical fixed-step runs', () => {
    const run = (): CombatSimulationState => {
      const state = pipelineState(
        activatedElite(movementStream()),
        movementStream(),
        pinnedAircraft(900, 480),
      );
      return stepPipeline(state, 420);
    };
    const first = run();
    const second = run();
    expect(first.enemies).toEqual(second.enemies);
    expect(first.enemyProjectiles).toEqual(second.enemyProjectiles);
    expect(first.eliteMovementStreams[ELITE_ORDINAL]?.nextUint32()).toBe(
      second.eliteMovementStreams[ELITE_ORDINAL]?.nextUint32(),
    );
  });

  it('is reachable only through the canonical Mission 03 plan: exactly one authored Elite member at 05:20 with its own stream', () => {
    const state = createTestCombatState();
    expect(state.eliteMovementStreams).toEqual({});
    expect(state.enemies).toHaveLength(0);
    // V02-WI-06 E03: the authored Mission 03 e8 group is the ONLY production
    // Elite member, and its 05:20 fixed step is also the Countdown zero step.
    const eliteMembers = MISSIONS.flatMap((mission) =>
      mission.encounters.flatMap((encounter) =>
        (encounter.staging ?? []).flatMap((group) =>
          group.members
            .filter((member) => member.type === 'elite-drone')
            .map(() => ({
              missionId: mission.id,
              encounterId: encounter.id,
            })),
        ),
      ),
    );
    expect(eliteMembers).toEqual([
      { missionId: 'interception-03', encounterId: 'interception-03-e8' },
    ]);
    expect(MISSIONS[2]?.encounters[7]?.timeSeconds).toBe(320);
  });

  it('does not shift the accepted regular-enemy streams (Ranged cadence isolation)', () => {
    // A stationary Elite off the playfield: its attacks never touch the
    // Aircraft column, so only the RNG isolation is under test.
    const controlElite: EliteEnemyState = {
      ...activateElite(
        createEliteForEntry({
          id: 99,
          ordinal: 99,
          viewportWidth: VIEWPORT.width,
          viewportHeight: VIEWPORT.height,
        }),
      ),
      centerX: 100,
      centerY: -200,
    };
    const observe = (withElite: boolean) => {
      const base = createTestCombatState({ missionId: 'interception-02' });
      const state: CombatSimulationState = withElite
        ? { ...base, enemies: [controlElite], eliteMovementStreams: {} }
        : base;
      const observations: string[] = [];
      let current = state;
      for (let step = 0; step < 600; step += 1) {
        current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
        const rangedProjectiles = current.enemyProjectiles.filter(
          (projectile) => projectile.kind === 'ranged',
        ).length;
        const rangedEnemies = current.enemies
          .filter((enemy) => enemy.kind === 'ranged')
          .map(
            (enemy) =>
              `${enemy.id}:${enemy.kind === 'ranged' ? enemy.firingStepsRemaining : -1}`,
          )
          .join(',');
        observations.push(`${step}|${rangedProjectiles}|${rangedEnemies}`);
      }
      return { current, observations };
    };
    const withoutElite = observe(false);
    const withElite = observe(true);
    expect(withElite.observations).toEqual(withoutElite.observations);
    // The Mission 02 runtime is otherwise unchanged by the Elite owner.
    expect(withElite.current.currentEncounterId).toBe(
      withoutElite.current.currentEncounterId,
    );
    expect(withElite.current.pendingEscapePenalties).toBe(
      withoutElite.current.pendingEscapePenalties,
    );
  });
});
