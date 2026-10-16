import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { HUNTER_DRONE, enemyRenderedBounds } from '@application/content';
import {
  AIRCRAFT_WIDTH,
  AIRCRAFT_HEIGHT,
  TEST_MISSION_SEED,
} from '@test-support/domain';
import {
  createCombatSimulation,
  stepCombatSimulation,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import {
  HUNTER_COMMITTED_STEERING_STEPS,
  hunterHeadingToward,
  hunterMaxTurnPerStep,
  hunterRotatedBounds,
  hunterTravelVector,
  reprojectHunterForViewport,
  spawnBoundsForEntry,
  spawnEnemyFromPlacement,
  stepEnemy,
} from './enemies';
import type { CombatEnemy, EnemyStepInput, HunterEnemyState } from './enemies';

/**
 * V02-WI-04 regular-enemy simulation evidence (Epic §9, V02-AC-006–008,
 * V02-DEC-019/020): the authoritative Basic/Ranged/Hunter states carry their
 * complete rendered bounds (the AABB used for spawn, activation, collision,
 * and escape), the authored-staging spawn places the nearest edge exactly on
 * the boundary, Ranged activates and counts its first shot from full-bounds
 * entry, and the Hunter Side Entry → Approach → Commitment machine is exact.
 */

const VIEWPORT = { width: 1280, height: 600 };

function createState(): CombatSimulationState {
  const aircraft = CONTENT_CATALOGUE.aircraft[0]!;
  return createCombatSimulation({
    initialMode: 'mouse',
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon: CONTENT_CATALOGUE.weapons[0]!,
    projectile: CONTENT_CATALOGUE.projectile,
    missionSeed: TEST_MISSION_SEED,
    mission: CONTENT_CATALOGUE.missions[0]!,
    enemies: CONTENT_CATALOGUE.enemies,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}

function step(
  state: CombatSimulationState,
  seconds: number,
): CombatSimulationState {
  let current = state;
  const steps = Math.round(seconds / FIXED_STEP_SECONDS);
  for (let index = 0; index < steps; index += 1) {
    current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
  }
  return current;
}

function stepInput(overrides: Partial<EnemyStepInput> = {}): EnemyStepInput {
  return {
    movementSpeedPx: 600 * 0.12,
    committedSpeedPx: 600 * 0.26,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    stepSeconds: FIXED_STEP_SECONDS,
    aircraftCenterX: 640,
    aircraftCenterY: 480,
    ...overrides,
  };
}

function enemyDef(type: 'basic-drone' | 'ranged-drone' | 'hunter-drone') {
  const definition = CONTENT_CATALOGUE.enemies.find(
    (enemy) => enemy.type === type,
  );
  if (definition === undefined) {
    throw new Error(`Missing definition for ${type}`);
  }
  return definition;
}

describe('authored-staging spawn (V02-DEC-018)', () => {
  it('places a Top entry fully above with its bottom edge touching the top boundary', () => {
    const def = enemyDef('basic-drone');
    const bounds = createState().enemyBoundsByType['basic-drone'];
    const enemy = spawnEnemyFromPlacement({
      id: 0,
      type: 'basic-drone',
      hullIntegrity: def.maximumHullIntegrity,
      width: bounds.width,
      height: bounds.height,
      placement: { kind: 'top', engagementBandFraction: 0.5 },
      boundsMinX: 10,
      boundsMaxX: 1270,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      ordinal: 0,
    });
    expect(enemy.centerY + bounds.height / 2).toBeCloseTo(0, 6);
    expect(enemy.centerX).toBeGreaterThan(10);
    expect(enemy.centerX).toBeLessThan(1270);
    expect(enemy.activated).toBe(false);
    expect(enemy.hasEnteredVisibleArea).toBe(false);
  });

  it('places a seeded upper-left Hunter outside the left boundary at 20% VH', () => {
    const def = enemyDef('hunter-drone');
    const bounds = createState().enemyBoundsByType['hunter-drone'];
    const enemy = spawnEnemyFromPlacement({
      id: 0,
      type: 'hunter-drone',
      hullIntegrity: def.maximumHullIntegrity,
      width: bounds.width,
      height: bounds.height,
      placement: { kind: 'side', side: 'upper-left', yViewportFraction: 0.2 },
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      ordinal: 0,
    });
    if (enemy.kind !== 'hunter') {
      throw new Error('Expected a Hunter enemy from the Hunter placement.');
    }
    // V021-WI-03 (patch §3): the configured rendered bounds stay the visual
    // rectangle, the injected entry heading is nose-right, and the AABB that
    // touches the boundary is their enclosing rotated rectangle (the swapped
    // envelope) — the same rectangle the simulation moves and collides.
    expect(enemy.visualWidth).toBeCloseTo(bounds.width, 9);
    expect(enemy.visualHeight).toBeCloseTo(bounds.height, 9);
    expect(enemy.width).toBeCloseTo(bounds.height, 9);
    expect(enemy.height).toBeCloseTo(bounds.width, 9);
    expect(enemy.headingRadians).toBeCloseTo(-Math.PI / 2, 12);
    expect(enemy.centerX + enemy.width / 2).toBeCloseTo(0, 6);
    expect(enemy.centerY).toBeCloseTo(0.2 * VIEWPORT.height, 6);
    expect(enemy.phase).toBe('entering');
  });
});

describe('Basic Drone (Epic §9.1)', () => {
  it('travels straight down at 12% VH/s and escapes only after entering', () => {
    let enemy = spawnEnemyFromPlacement({
      id: 0,
      type: 'basic-drone',
      hullIntegrity: 3,
      width: 24,
      height: 24,
      placement: { kind: 'top', engagementBandFraction: 0.5 },
      boundsMinX: 10,
      boundsMaxX: 1270,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      ordinal: 0,
    });
    const input = stepInput();
    const moved = stepEnemy(enemy, input);
    enemy = moved.enemy as CombatEnemy;
    expect(enemy.centerY).toBeCloseTo(-12 + 72 / 60, 1);
    expect(enemy.hasEnteredVisibleArea).toBe(false);
    let escaped = false;
    for (let index = 0; index < 600; index += 1) {
      const result = stepEnemy(enemy, input);
      if (result.enemy === null) {
        escaped = true;
        break;
      }
      enemy = result.enemy;
    }
    expect(escaped).toBe(true);
  });
});

describe('Ranged Drone (Epic §9.2, V02-AC-006)', () => {
  it('becomes authoritative and starts its 180-step first-shot timer on full-bounds entry', () => {
    const def = enemyDef('ranged-drone');
    let enemy = spawnEnemyFromPlacement({
      id: 0,
      type: 'ranged-drone',
      hullIntegrity: def.maximumHullIntegrity,
      width: 30,
      height: 30,
      placement: { kind: 'top', engagementBandFraction: 0.5 },
      boundsMinX: 10,
      boundsMaxX: 1270,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      ordinal: 6,
    });
    expect(enemy.activated).toBe(false);
    const input = stepInput({ movementSpeedPx: 600 * 0.09 });
    let newlyActivated = false;
    for (let index = 0; index < 120; index += 1) {
      const result = stepEnemy(enemy, input);
      if (result.newlyActivated) {
        newlyActivated = true;
      }
      enemy = result.enemy as CombatEnemy;
      if (enemy.activated) {
        break;
      }
    }
    expect(newlyActivated).toBe(true);
    expect(enemy.activated).toBe(true);
    if (enemy.kind === 'ranged') {
      expect(enemy.firingStepsRemaining).toBe(180);
    }
  });

  it('fires the first projectile at the mission level after 180 running fixed steps', () => {
    let state = createState();
    state = step(state, 57); // mission time 57 s: the e2 Ranged has spawned
    const ranged = state.enemies.find((enemy) => enemy.kind === 'ranged');
    expect(ranged).toBeDefined();
    let current: CombatSimulationState = {
      ...state,
      // Clear the player's automatic projectiles so the teleported Ranged is
      // not destroyed before its first shot, and offset it from the aircraft
      // firing line so the timer is the only variable under test.
      projectiles: [],
      enemies: state.enemies.map((enemy) =>
        enemy.kind === 'ranged'
          ? {
              ...enemy,
              centerX: 200,
              centerY: 300,
              activated: false,
              hasEnteredVisibleArea: true,
            }
          : enemy,
      ),
    };
    let firstShotStep: number | null = null;
    for (let index = 0; index < 260; index += 1) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
      if (current.enemyProjectiles.length > 0) {
        firstShotStep = current.missionStepCount;
        break;
      }
    }
    expect(firstShotStep).not.toBeNull();
    // Activation on the step after teleport (3420+1); the first shot is
    // exactly 180 running fixed steps later.
    expect(firstShotStep).toBe(3421 + 180);
  });

  it('creates one independent ranged-fire stream per authored Ranged member ordinal', () => {
    const state = createState();
    // Derived from the resolved Mission 01 §2.1 arrivals: every authored Ranged
    // member ordinal of e2 (`BR12` rows at 00:55/01:03/01:11/01:19/01:35), e3
    // (`BRH14`/`BR18`/`BR12` rows at 01:40–02:12), e4 (`BR12`/`BRH14`/`BR18`
    // rows at 02:20–03:02) and e5 (`BRH14` at 03:08.70) — never a second
    // ordinal authority.
    const authoredOrdinals = state.arrivalGroups
      .flatMap((group) => group.members)
      .filter((member) => member.type === 'ranged-drone')
      .map((member) => member.ordinal)
      .sort((a, b) => a - b);
    expect(authoredOrdinals).toEqual([
      101, 102, 113, 114, 125, 126, 137, 138, 161, 162, 174, 175, 176, 177, 191,
      192, 193, 194, 205, 206, 218, 219, 220, 221, 231, 232, 243, 244, 256, 257,
      258, 259, 273, 274, 275, 276, 287, 288, 300, 301, 302, 303, 317, 318, 319,
      320, 331, 332, 344, 345, 346, 347,
    ]);
    const ordinals = Object.keys(state.rangedFireStreams)
      .map(Number)
      .sort((a, b) => a - b);
    expect(ordinals).toEqual(authoredOrdinals);
    for (const ordinal of authoredOrdinals) {
      expect(state.rangedFireStreams[ordinal]).toBeDefined();
    }
  });

  it('keeps the fired projectile collision-active in the same step (V02-WI-04 C01: muzzle top edge)', () => {
    const state = createState();
    // The Aircraft collision hitbox is 70% of the rendered height (v0.1
    // Combat §7.4): top = 480 - (48 × 0.7) / 2 = 463.2 at 1280x600. Place the
    // Ranged so that after its 0.9 px descent its bottom edge is 1.1 px above
    // the hitbox top: the corrected muzzle (top edge at the Ranged bottom)
    // reaches into the hitbox this step, while the previous sign (bottom edge
    // at the Ranged bottom) stays entirely above it.
    const hitboxTop = 480 - (AIRCRAFT_HEIGHT * 0.7) / 2;
    const rangedHeight = 30;
    const ranged: CombatEnemy = {
      id: 900,
      kind: 'ranged',
      type: 'ranged-drone',
      hullIntegrity: 4,
      centerX: 640,
      centerY: hitboxTop - 2 - rangedHeight / 2,
      entry: 'top',
      hasEnteredVisibleArea: true,
      activated: true,
      ordinal: 101, // e2 00:55 BR12: the first authored Ranged member ordinal
      width: 30,
      height: rangedHeight,
      firingStepsRemaining: 1,
    };
    const current: CombatSimulationState = {
      ...state,
      projectiles: [],
      enemyProjectiles: [],
      enemies: [ranged],
      firingStepsRemaining: 999, // the player must not fire this step
      playerHullIntegrity: 100,
    };
    const stepped = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    // The projectile spawns with its TOP edge exactly at the Ranged bottom
    // edge (here 1.1 px above the Aircraft hitbox top), so it overlaps the
    // Aircraft, deals 12 damage, and is consumed by that first valid hit in
    // the SAME step it is fired. The previous muzzle sign (bottom edge at the
    // Ranged bottom) left the projectile entirely above the hitbox: no damage,
    // no consumption — this counter-regression fails for that defect.
    expect(stepped.playerHullIntegrity).toBe(88);
    expect(stepped.aircraftDangerFlashStepsRemaining).toBeGreaterThan(0);
    expect(stepped.enemyProjectiles).toHaveLength(0);
  });
});

describe('Hunter Drone (Epic §9.3, V02-AC-007)', () => {
  it('enters horizontally without targeting, then commits on vertical distance or 2.0 s', () => {
    const def = enemyDef('hunter-drone');
    let enemy = spawnEnemyFromPlacement({
      id: 0,
      type: 'hunter-drone',
      hullIntegrity: def.maximumHullIntegrity,
      width: 20,
      height: 20,
      placement: { kind: 'side', side: 'upper-left', yViewportFraction: 0.2 },
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      ordinal: 7,
    });
    const input = stepInput({
      movementSpeedPx: 600 * 0.18,
      committedSpeedPx: 600 * 0.26,
      aircraftCenterX: 900,
      aircraftCenterY: 300,
    });
    // Horizontal entry: X increases toward the centre; Approach begins only
    // when the complete bounds are fully inside (V02-DEC-020).
    for (let index = 0; index < 200; index += 1) {
      const result = stepEnemy(enemy, input);
      enemy = result.enemy as CombatEnemy;
      if (enemy.kind === 'hunter' && enemy.phase === 'approach') {
        break;
      }
    }
    expect(enemy.kind).toBe('hunter');
    if (enemy.kind !== 'hunter') {
      throw new Error('Expected the Hunter to enter Approach.');
    }
    expect(enemy.phase).toBe('approach');
    // During Approach the Hunter steers directly toward the Aircraft centre.
    const startX = enemy.centerX;
    const result = stepEnemy(enemy, input);
    enemy = result.enemy as CombatEnemy;
    expect(enemy.centerX).toBeGreaterThan(startX);
    // The vertical-distance commit condition is reached when close enough.
    let committed = false;
    for (let index = 0; index < 400; index += 1) {
      const step = stepEnemy(enemy, input);
      enemy = step.enemy as CombatEnemy;
      if (enemy.kind === 'hunter' && enemy.phase === 'committed') {
        committed = true;
        break;
      }
    }
    expect(committed).toBe(true);
    if (enemy.kind !== 'hunter') {
      throw new Error('Expected the Hunter to commit.');
    }
    expect(enemy.phase).toBe('committed');
    // V021-WI-03 (patch §3, V021-AC-003): the committed run is owned by the
    // heading, and inside its 60-executed-step window it steers at most 25°/s
    // toward the Aircraft's CURRENT centre — never an instant re-aim.
    const locked = { ...enemy };
    const awayInput = { ...input, aircraftCenterX: 200, aircraftCenterY: 500 };
    const after = stepEnemy(enemy, awayInput).enemy as CombatEnemy;
    if (after.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    expect(after.committedStepsExecuted).toBe(
      locked.committedStepsExecuted + 1,
    );
    expect(
      Math.abs(after.headingRadians - locked.headingRadians),
    ).toBeLessThanOrEqual(hunterMaxTurnPerStep(FIXED_STEP_SECONDS) + 1e-9);
    const travel = hunterTravelVector(after.headingRadians);
    expect(after.centerX - locked.centerX).toBeCloseTo(
      travel.x * input.committedSpeedPx * FIXED_STEP_SECONDS,
      9,
    );
    expect(after.centerY - locked.centerY).toBeCloseTo(
      travel.y * input.committedSpeedPx * FIXED_STEP_SECONDS,
      9,
    );
  });

  it('begins Approach on the exact step the moved complete bounds become fully inside (V02-WI-04 C01)', () => {
    const def = enemyDef('hunter-drone');
    let enemy = spawnEnemyFromPlacement({
      id: 0,
      type: 'hunter-drone',
      hullIntegrity: def.maximumHullIntegrity,
      width: 20,
      height: 20,
      placement: { kind: 'side', side: 'upper-left', yViewportFraction: 0.2 },
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      ordinal: 7,
    });
    // Place the Hunter just outside the left boundary so its next 18% VH/s
    // inward move crosses fully inside ON THIS STEP.
    enemy = { ...enemy, centerX: 9.5, centerY: 120 };
    const input = stepInput({
      movementSpeedPx: 600 * 0.18,
      committedSpeedPx: 600 * 0.26,
      aircraftCenterX: 900,
      aircraftCenterY: 300,
    });
    const result = stepEnemy(enemy, input);
    if (result.enemy?.kind !== 'hunter') {
      throw new Error('Expected the Hunter to remain after the step.');
    }
    // No one-step entering stall: Approach, targeting, and the 2.0 s timer
    // begin on the same authoritative step the moved bounds became fully
    // inside (the previous code stayed in `entering` for one more step).
    expect(result.enemy.phase).toBe('approach');
    expect(result.enemy.approachStepsElapsed).toBe(0);
  });

  it('applies the locked 26% committed speed on the first commitment step (V02-WI-04 C01)', () => {
    const def = enemyDef('hunter-drone');
    const hunter: CombatEnemy = {
      id: 0,
      kind: 'hunter',
      type: 'hunter-drone',
      hullIntegrity: def.maximumHullIntegrity,
      centerX: 640,
      centerY: 200,
      entry: 'upper-left',
      hasEnteredVisibleArea: true,
      activated: true,
      ordinal: 7,
      width: 20,
      height: 20,
      phase: 'approach',
      // V021-WI-03 (patch §3): the injected Side Entry heading (nose right) and
      // the configured rendered bounds; Approach re-derives its own heading
      // toward the Aircraft on every executed step.
      headingRadians: -Math.PI / 2,
      visualWidth: 20,
      visualHeight: 20,
      committedStepsExecuted: 0,
      steeringEnded: false,
      // One step from the 2.0 s commitment timer expiring.
      approachStepsElapsed: 119,
    };
    const input = stepInput({
      movementSpeedPx: 600 * 0.18, // 108 px/s
      committedSpeedPx: 600 * 0.26, // 156 px/s
      aircraftCenterX: 640, // directly below: straight-down commit direction
      aircraftCenterY: 300,
    });
    const result = stepEnemy(hunter, input);
    if (result.enemy?.kind !== 'hunter' || result.enemy.phase !== 'committed') {
      throw new Error('Expected the Hunter to commit on this step.');
    }
    // The first commitment step moves at 26% VH/s (156 px/s → 2.6 px), not the
    // 18% approach speed (1.8 px) the previous code applied for one extra step.
    expect(result.enemy.centerY).toBeCloseTo(200 + 156 / 60, 6);
    expect(result.enemy.centerX).toBe(640);
    // V021-WI-03 (patch §3): commitment points the authoritative heading at the
    // Aircraft's current centre (straight down here) and opens the 60-step
    // steering window at step 1.
    expect(result.enemy.headingRadians).toBeCloseTo(0, 9);
    expect(result.enemy.committedStepsExecuted).toBe(1);
    expect(result.enemy.steeringEnded).toBe(false);
  });
});

describe('Hunter heading ownership and bounded committed steering (V021-WI-03 patch §3, V021-AC-003)', () => {
  const HUNTER_VISUAL = { width: 30, height: 10 };

  /**
   * One committed Hunter whose `headingRadians` is the ONLY direction owner and
   * whose authoritative AABB is the enclosing rectangle of its configured
   * rendered bounds at that heading.
   */
  function committedHunter(
    overrides: Partial<HunterEnemyState> = {},
  ): HunterEnemyState {
    const headingRadians = overrides.headingRadians ?? 0;
    const envelope = hunterRotatedBounds({
      width: HUNTER_VISUAL.width,
      height: HUNTER_VISUAL.height,
      headingRadians,
    });
    return {
      id: 0,
      kind: 'hunter',
      type: 'hunter-drone',
      hullIntegrity: enemyDef('hunter-drone').maximumHullIntegrity,
      centerX: 640,
      centerY: 300,
      entry: 'top',
      hasEnteredVisibleArea: true,
      activated: true,
      ordinal: 7,
      width: envelope.width,
      height: envelope.height,
      phase: 'committed',
      headingRadians,
      visualWidth: HUNTER_VISUAL.width,
      visualHeight: HUNTER_VISUAL.height,
      committedStepsExecuted: 0,
      steeringEnded: false,
      approachStepsElapsed: 121,
      ...overrides,
    };
  }

  it('injects each Side Entry heading so the nose already points along the entry movement', () => {
    const cases = [
      { entry: 'upper-left' as const, heading: -Math.PI / 2, dx: 1 },
      { entry: 'upper-right' as const, heading: Math.PI / 2, dx: -1 },
    ];
    for (const testCase of cases) {
      const enemy = spawnEnemyFromPlacement({
        id: 0,
        type: 'hunter-drone',
        hullIntegrity: enemyDef('hunter-drone').maximumHullIntegrity,
        width: HUNTER_VISUAL.width,
        height: HUNTER_VISUAL.height,
        placement: {
          kind: 'side',
          side: testCase.entry,
          yViewportFraction: 0.2,
        },
        viewportWidth: VIEWPORT.width,
        viewportHeight: VIEWPORT.height,
        ordinal: 7,
      });
      if (enemy.kind !== 'hunter') {
        throw new Error('Expected a Hunter from the Hunter placement.');
      }
      const placed = spawnBoundsForEntry({
        type: 'hunter-drone',
        width: HUNTER_VISUAL.width,
        height: HUNTER_VISUAL.height,
        entry: testCase.entry,
      });
      expect(enemy.headingRadians).toBe(testCase.heading);
      expect(enemy.visualWidth).toBe(HUNTER_VISUAL.width);
      expect(enemy.visualHeight).toBe(HUNTER_VISUAL.height);
      expect(enemy.width).toBeCloseTo(placed.width, 9);
      expect(enemy.height).toBeCloseTo(placed.height, 9);
      // The AABB that touches the entry boundary is the ENCLOSING rectangle of
      // the rotated visual, not the configured rectangle.
      expect(enemy.width).toBeCloseTo(HUNTER_VISUAL.height, 9);
      expect(enemy.height).toBeCloseTo(HUNTER_VISUAL.width, 9);
      expect(enemy.centerX + (testCase.dx * enemy.width) / 2).toBeCloseTo(
        testCase.dx > 0 ? 0 : VIEWPORT.width,
        9,
      );
      // The injected heading IS the entry movement vector: the first entering
      // step travels along it at the unchanged 18% VH/s approach speed.
      const input = stepInput({
        movementSpeedPx: 600 * 0.18,
        committedSpeedPx: 600 * 0.26,
        aircraftCenterX: 640,
        aircraftCenterY: 480,
      });
      const stepped = stepEnemy(enemy, input).enemy;
      if (stepped?.kind !== 'hunter') {
        throw new Error('Expected the entering Hunter after the step.');
      }
      const travel = hunterTravelVector(enemy.headingRadians);
      const entryStep = 600 * 0.18 * FIXED_STEP_SECONDS;
      expect(travel.y).toBeCloseTo(0, 9);
      expect(stepped.centerX - enemy.centerX).toBeCloseTo(
        travel.x * entryStep,
        9,
      );
      expect(stepped.centerY - enemy.centerY).toBeCloseTo(0, 9);
      expect(stepped.headingRadians).toBe(testCase.heading);
      expect(stepped.phase).toBe('entering');
    }
  });

  it('steers at most 25°/s along the shortest signed turn toward the current Aircraft centre', () => {
    const maxTurn = hunterMaxTurnPerStep(FIXED_STEP_SECONDS);
    expect(maxTurn).toBeCloseTo((25 * Math.PI) / 180 / 60, 12);
    // Nose down while the Aircraft sits 400 px right and 100 px below: the
    // shortest signed turn is -76°, far beyond the cap, so the step advances
    // exactly `maxTurn` (and the target is still ahead, so steering is live).
    const enemy = committedHunter({
      headingRadians: 0,
      centerX: 640,
      centerY: 300,
    });
    const input = stepInput({
      committedSpeedPx: 600 * 0.26,
      aircraftCenterX: 1040,
      aircraftCenterY: 400,
    });
    const stepped = stepEnemy(enemy, input).enemy;
    if (stepped?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    expect(stepped.headingRadians).toBeCloseTo(-maxTurn, 12);
    expect(stepped.committedStepsExecuted).toBe(1);
    expect(stepped.steeringEnded).toBe(false);
    // The same step moves along the heading it owns at the 26% VH/s committed
    // speed and re-derives its AABB from that heading.
    const travel = hunterTravelVector(stepped.headingRadians);
    const committedStep = 600 * 0.26 * FIXED_STEP_SECONDS;
    expect(stepped.centerX - enemy.centerX).toBeCloseTo(
      travel.x * committedStep,
      9,
    );
    expect(stepped.centerY - enemy.centerY).toBeCloseTo(
      travel.y * committedStep,
      9,
    );
    const envelope = hunterRotatedBounds({
      width: HUNTER_VISUAL.width,
      height: HUNTER_VISUAL.height,
      headingRadians: stepped.headingRadians,
    });
    expect(stepped.width).toBeCloseTo(envelope.width, 9);
    expect(stepped.height).toBeCloseTo(envelope.height, 9);
  });

  it('locks the heading from the 61st executed committed step', () => {
    const maxTurn = hunterMaxTurnPerStep(FIXED_STEP_SECONDS);
    const input = stepInput({
      committedSpeedPx: 600 * 0.26,
      aircraftCenterX: 1040,
      aircraftCenterY: 400,
    });
    // Step 60 is the LAST step of the steering window and still steers.
    const last = stepEnemy(
      committedHunter({
        headingRadians: 0,
        committedStepsExecuted: HUNTER_COMMITTED_STEERING_STEPS - 1,
      }),
      input,
    ).enemy;
    if (last?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after step 60.');
    }
    expect(last.committedStepsExecuted).toBe(HUNTER_COMMITTED_STEERING_STEPS);
    expect(last.headingRadians).toBeCloseTo(-maxTurn, 12);
    // Step 61 is outside the window: the run keeps its locked heading even
    // though the Aircraft needs a 90° turn.
    const locked = stepEnemy(
      committedHunter({
        headingRadians: 0,
        committedStepsExecuted: HUNTER_COMMITTED_STEERING_STEPS,
      }),
      input,
    ).enemy;
    if (locked?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after step 61.');
    }
    expect(locked.committedStepsExecuted).toBe(
      HUNTER_COMMITTED_STEERING_STEPS + 1,
    );
    expect(locked.headingRadians).toBe(0);
    expect(locked.steeringEnded).toBe(false);
    expect(locked.centerX).toBeCloseTo(640, 9);
    expect(locked.centerY).toBeCloseTo(300 + (600 * 0.26) / 60, 9);
    expect(locked.width).toBeCloseTo(HUNTER_VISUAL.width, 9);
    expect(locked.height).toBeCloseTo(HUNTER_VISUAL.height, 9);
  });

  it('permanently ends steering when the Aircraft centre is behind, without reversal or reacquisition', () => {
    const committedStep = (600 * 0.26) / 60;
    // Travel is straight down and the Aircraft is 200 px ABOVE the centre, so
    // the dot product is negative: steering ends on this step.
    const behind = stepEnemy(
      committedHunter({ headingRadians: 0, centerX: 640, centerY: 300 }),
      stepInput({ aircraftCenterX: 640, aircraftCenterY: 100 }),
    ).enemy;
    if (behind?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    expect(behind.steeringEnded).toBe(true);
    expect(behind.headingRadians).toBe(0);
    expect(behind.centerX).toBeCloseTo(640, 9);
    expect(behind.centerY).toBeCloseTo(300 + committedStep, 9);
    // A later Aircraft position squarely AHEAD inside the window cannot
    // reacquire steering: the latch is permanent and never reverses.
    const ahead = stepEnemy(
      behind,
      stepInput({ aircraftCenterX: 640, aircraftCenterY: 5000 }),
    ).enemy;
    if (ahead?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the second step.');
    }
    expect(ahead.steeringEnded).toBe(true);
    expect(ahead.headingRadians).toBe(0);
    expect(ahead.committedStepsExecuted).toBe(2);
    expect(ahead.centerX).toBeCloseTo(640, 9);
    expect(ahead.centerY).toBeCloseTo(300 + 2 * committedStep, 9);
  });

  it('retains the heading at exactly zero centre distance without latching', () => {
    const maxTurn = hunterMaxTurnPerStep(FIXED_STEP_SECONDS);
    const zero = stepEnemy(
      committedHunter({ headingRadians: 0.5, centerX: 640, centerY: 300 }),
      stepInput({ aircraftCenterX: 640, aircraftCenterY: 300 }),
    ).enemy;
    if (zero?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    // Exactly zero distance: the heading is retained for the step and the
    // window stays open.
    expect(zero.headingRadians).toBe(0.5);
    expect(zero.steeringEnded).toBe(false);
    expect(zero.committedStepsExecuted).toBe(1);
    // A genuinely ahead, off-axis target inside the window still steers, so the
    // zero-distance step consumed no eligibility.
    const aheadHeading = 0.5 + 0.2;
    const ahead = stepEnemy(
      zero,
      stepInput({
        aircraftCenterX: zero.centerX - 100 * Math.sin(aheadHeading),
        aircraftCenterY: zero.centerY + 100 * Math.cos(aheadHeading),
      }),
    ).enemy;
    if (ahead?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the second step.');
    }
    expect(ahead.steeringEnded).toBe(false);
    expect(ahead.headingRadians).toBeCloseTo(0.5 + maxTurn, 12);
  });

  it('never authorizes a U-turn from an exactly opposite heading', () => {
    // The Aircraft sits exactly 200 px BEHIND the nose-down travel vector, the
    // one case where the naive desired heading is exactly π away: the shortest
    // signed turn would be ±180°, so an unlatched stepper would U-turn. The
    // behind rule must win and the Hunter must keep its heading.
    const enemy = committedHunter({
      headingRadians: 0,
      centerX: 640,
      centerY: 300,
    });
    const input = stepInput({
      aircraftCenterX: 640,
      aircraftCenterY: 100,
    });
    // The naive desired heading is exactly π away (the reported sign is
    // immaterial: the behind rule decides before any turn is applied).
    expect(Math.abs(hunterHeadingToward(0, -200))).toBeCloseTo(Math.PI, 9);
    const stepped = stepEnemy(enemy, input).enemy;
    if (stepped?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    expect(stepped.headingRadians).toBe(0);
    expect(stepped.steeringEnded).toBe(true);
    // Reversed exactly: the closest reachable heading is still the retained one.
    expect(Math.abs(stepped.headingRadians - Math.PI)).toBeCloseTo(Math.PI, 9);
  });

  it('derives full-bounds activation from the rotated envelope, not the configured rectangle', () => {
    // Configured 30 × 10 rotated by 0.5 rad ⇒ envelope 31.11 × 23.16. At
    // `centerY = 7` the CONFIGURED rectangle (top edge at 2 px) is already fully
    // inside the viewport while the ENVELOPE top edge is still 2.30 px above it
    // after this step's own movement, so activation must not fire yet.
    const heading = 0.5;
    const envelope = hunterRotatedBounds({
      width: HUNTER_VISUAL.width,
      height: HUNTER_VISUAL.height,
      headingRadians: heading,
    });
    expect(envelope.height).toBeGreaterThan(HUNTER_VISUAL.height);
    const configuredTopInside = 7 - HUNTER_VISUAL.height / 2;
    expect(configuredTopInside).toBeGreaterThan(0);
    const notInsideYet = stepEnemy(
      committedHunter({
        headingRadians: heading,
        centerX: 640,
        centerY: 7,
        activated: false,
      }),
      stepInput({ aircraftCenterX: 640, aircraftCenterY: 590 }),
    );
    expect(notInsideYet.newlyActivated).toBe(false);
    const stillOutside = notInsideYet.enemy;
    if (stillOutside?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    expect(stillOutside.activated).toBe(false);
    // The same step's own movement still leaves the envelope's top edge above
    // the viewport top, which is the only reason activation is withheld.
    expect(stillOutside.centerY - stillOutside.height / 2).toBeLessThan(0);

    // Once the complete rotated envelope is inside, the latch fires on that
    // exact step and is permanent.
    const activated = stepEnemy(
      committedHunter({
        headingRadians: heading,
        centerX: 640,
        centerY: 30,
        activated: false,
      }),
      stepInput({ aircraftCenterX: 640, aircraftCenterY: 590 }),
    );
    expect(activated.newlyActivated).toBe(true);
    const inside = activated.enemy;
    if (inside?.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    expect(inside.activated).toBe(true);
    expect(inside.centerY - inside.height / 2).toBeGreaterThanOrEqual(0);
  });

  it('escapes only when the complete rotated envelope leaves the viewport', () => {
    // Configured 30 × 10 rotated by 0.5 rad ⇒ half-height 11.58 > 5, so the
    // envelope keeps the Hunter alive past the point where the superseded
    // configured rectangle would already report an escape.
    const heading = 0.5;
    const envelope = hunterRotatedBounds({
      width: HUNTER_VISUAL.width,
      height: HUNTER_VISUAL.height,
      headingRadians: heading,
    });
    const committedStep = (600 * 0.26) / 60;
    const stepY = Math.cos(heading) * committedStep;
    // The configured rectangle is ALREADY fully below the viewport here, so a
    // superseded-rectangle implementation would report an escape on this step.
    const centerY = 600 + HUNTER_VISUAL.height / 2 + 1;
    expect(centerY - HUNTER_VISUAL.height / 2).toBeGreaterThan(600);
    const stepped = stepEnemy(
      committedHunter({ headingRadians: heading, centerX: 640, centerY }),
      stepInput({ aircraftCenterX: 640, aircraftCenterY: 120 }),
    );
    const survivor = stepped.enemy;
    if (survivor?.kind !== 'hunter') {
      throw new Error(
        'Expected the Hunter to survive on its rotated envelope.',
      );
    }
    expect(survivor.centerY - envelope.height / 2).toBeLessThan(600);

    // Fully beyond the bottom on the ENVELOPE: removed as Escaped exactly then.
    const escaping = stepEnemy(
      committedHunter({
        headingRadians: heading,
        centerX: 640,
        centerY: 600 + envelope.height / 2 - stepY + 0.25,
      }),
      stepInput({ aircraftCenterX: 640, aircraftCenterY: 120 }),
    );
    expect(escaping.enemy).toBeNull();
  });

  it('re-resolves the configured bounds on a viewport resize without touching the heading or the run', () => {
    const shortSidePx = 600;
    const configured = enemyRenderedBounds(HUNTER_DRONE, shortSidePx);
    const headingRadians = 0.25;
    const resized = reprojectHunterForViewport(
      committedHunter({
        headingRadians,
        committedStepsExecuted: 12,
        steeringEnded: true,
      }),
      { centerX: 200, centerY: 100, shortSidePx },
    );
    expect(resized.visualWidth).toBeCloseTo(configured.widthPx, 9);
    expect(resized.visualHeight).toBeCloseTo(configured.heightPx, 9);
    const envelope = hunterRotatedBounds({
      width: configured.widthPx,
      height: configured.heightPx,
      headingRadians,
    });
    expect(resized.width).toBeCloseTo(envelope.width, 9);
    expect(resized.height).toBeCloseTo(envelope.height, 9);
    // Resize never re-aims, restarts, or re-latches the run.
    expect(resized.headingRadians).toBe(headingRadians);
    expect(resized.phase).toBe('committed');
    expect(resized.committedStepsExecuted).toBe(12);
    expect(resized.steeringEnded).toBe(true);
    expect(resized.centerX).toBe(200);
    expect(resized.centerY).toBe(100);
    // The configured Hunter rectangle is not square, so the authoritative AABB
    // is genuinely the rotated envelope rather than the configured bounds.
    expect(envelope.width).not.toBeCloseTo(configured.widthPx, 6);
  });
});
