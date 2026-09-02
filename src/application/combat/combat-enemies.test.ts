import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@test-support/content';
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
import { spawnEnemyFromPlacement, stepEnemy } from './enemies';
import type { CombatEnemy, EnemyStepInput } from './enemies';

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
    expect(enemy.centerX + bounds.width / 2).toBeCloseTo(0, 6);
    expect(enemy.centerY).toBeCloseTo(0.2 * VIEWPORT.height, 6);
    if (enemy.kind !== 'hunter') {
      throw new Error('Expected a Hunter enemy from the Hunter placement.');
    }
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
    const ordinals = Object.keys(state.rangedFireStreams)
      .map(Number)
      .sort((a, b) => a - b);
    expect(ordinals).toEqual([6, 13]);
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
      ordinal: 6, // an authored Ranged ordinal with a seeded stream
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
    // The committed direction is locked: the Aircraft moving away does not
    // bend the attack run (Epic §9.3).
    const locked = { ...enemy };
    const awayInput = { ...input, aircraftCenterX: 200, aircraftCenterY: 500 };
    const after = stepEnemy(enemy, awayInput).enemy as CombatEnemy;
    if (after.kind !== 'hunter') {
      throw new Error('Expected the committed Hunter after the step.');
    }
    expect(after.committedVx).toBe(locked.committedVx);
    expect(after.committedVy).toBe(locked.committedVy);
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
      committedVx: 0,
      committedVy: 0,
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
  });
});
