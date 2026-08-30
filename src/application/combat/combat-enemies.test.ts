import { describe, expect, it } from 'vitest';
import { BASIC_DRONE, MVP_ENEMY_GROUP_SCHEDULE } from '@content/index';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  advanceSimulationFrames,
  createCombatSimulation,
  createCombatSimulationRuntime,
  forceFinalGroupSpawn,
  stepCombatSimulation,
  submitCombatCommand,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import { resolveBasicDrone, resolveMissionSchedule } from './combat-session';
import { aircraftCollisionAabb } from './collision-geometry';
import { moveEnemy, spawnEnemy } from './enemies';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';

// 1280x600: short side 600 → aircraft 48 high; drone square 24; drone speed 72 px/s.
const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
const AIRCRAFT_HEIGHT = 48;
const VIEWPORT = { width: 1280, height: 600 };
const SEED = 1234;
const SPEED_PER_STEP = 72 * FIXED_STEP_SECONDS; // 1.2 px/step

function createState(
  missionSeed: number = SEED,
  viewport: { width: number; height: number } = VIEWPORT,
): CombatSimulationState {
  return createCombatSimulation({
    initialMode: 'mouse',
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon: MACHINE_GUN,
    projectile: PLAYER_PROJECTILE,
    missionSeed,
    enemy: BASIC_DRONE,
    schedule: MVP_ENEMY_GROUP_SCHEDULE,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: 100,
  });
}

function stepCount(
  state: CombatSimulationState,
  count: number,
): CombatSimulationState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
  }
  return current;
}

function stepSeconds(
  state: CombatSimulationState,
  seconds: number,
): CombatSimulationState {
  return stepCount(state, Math.round(seconds / FIXED_STEP_SECONDS));
}

function submit(
  state: CombatSimulationState,
  command: Parameters<typeof submitCombatCommand>[1],
): CombatSimulationState {
  return submitCombatCommand(state, command);
}

describe('S10 initialization and schedule', () => {
  it('spawns the 0 s regular group as part of Combat initialization (AC-015, AC-074)', () => {
    const state = createState();
    expect(state.missionTimeSeconds).toBe(0);
    expect(state.enemySize).toBe(24);
    expect(state.enemySpeedPxPerSecond).toBeCloseTo(72, 6);
    expect(state.enemyType).toBe('basic-drone');
    expect(state.enemyHullIntegrity).toBe(3);
    expect(state.enemies).toHaveLength(3);
    expect(state.enemies.map((enemy) => enemy.id)).toEqual([0, 1, 2]);
    for (const enemy of state.enemies) {
      expect(enemy.hullIntegrity).toBe(3);
      expect(enemy.hasEnteredVisibleArea).toBe(false);
    }
    expect(state.spawnPlanIndex).toBe(1);
    expect(state.nextEnemyId).toBe(3);
    expect(state.finalGroupSpawned).toBe(false);
  });

  it('keeps extreme Top Entry positions inside the reachable firing band (AC-083)', () => {
    // These deterministic seeds put the first planned Top Entry respectively
    // near the raw full-viewport left and right extremes. The same RNG draw is
    // remapped into the aircraft's reachable centre range.
    const left = createState(77379);
    const right = createState(27233);
    const leftTop = left.enemies[0]!;
    const rightTop = right.enemies[0]!;
    expect(leftTop.entry).toBe('top');
    expect(rightTop.entry).toBe('top');
    expect(leftTop.centerX).toBeGreaterThanOrEqual(left.bounds.minX);
    expect(leftTop.centerX).toBeLessThanOrEqual(left.bounds.maxX);
    expect(rightTop.centerX).toBeGreaterThanOrEqual(right.bounds.minX);
    expect(rightTop.centerX).toBeLessThanOrEqual(right.bounds.maxX);
    expect(leftTop.centerX).toBeCloseTo(left.bounds.minX, 1);
    expect(rightTop.centerX).toBeCloseTo(right.bounds.maxX, 0);
  });

  it('advances mission time only through executed fixed steps', () => {
    let state = createState();
    state = stepCount(state, 1);
    expect(state.missionTimeSeconds).toBeCloseTo(1 / 60, 12);
    state = stepCount(state, 1);
    expect(state.missionTimeSeconds).toBeCloseTo(2 / 60, 12);
    // Input commands never advance mission time.
    const moved = submit(state, {
      type: 'combat/pointer-move',
      x: 700,
      y: 300,
    });
    expect(moved.missionTimeSeconds).toBe(state.missionTimeSeconds);
  });

  it('spawns each 10 s group at its exact mission-time instant with all members together (AC-015, AC-074)', () => {
    const before = stepCount(createState(), 599); // mission time 9.98333… s
    expect(before.nextEnemyId).toBe(3);
    const atTen = stepCount(before, 1); // mission time reaches exactly 10 s
    expect(atTen.missionTimeSeconds).toBeCloseTo(10, 10);
    expect(atTen.nextEnemyId).toBe(6); // exactly one group of 3 in one step
    expect(atTen.enemies.length).toBe(before.enemies.length + 3);
  });

  it('spawns all 33 regular drones by 100 s and the 5 final drones at 110 s (AC-016, AC-028)', () => {
    const atHundred = stepSeconds(createState(), 100);
    expect(atHundred.nextEnemyId).toBe(33);
    expect(atHundred.finalGroupSpawned).toBe(false);
    const atFinal = stepSeconds(createState(), 110);
    expect(atFinal.nextEnemyId).toBe(38);
    expect(atFinal.finalGroupSpawned).toBe(true);
    // No later schedule remains.
    const later = stepSeconds(atFinal, 10);
    expect(later.nextEnemyId).toBe(38);
    expect(later.spawnPlanIndex).toBe(later.spawnPlan.length);
  });

  it('continues beyond 120 s while active enemies remain (AC-030)', () => {
    const state = stepSeconds(createState(), 120);
    expect(state.finalGroupSpawned).toBe(true);
    expect(state.spawnPlanIndex).toBe(state.spawnPlan.length);
    expect(state.enemies.length).toBeGreaterThan(0);
    const moved = stepSeconds(state, 1);
    // Remaining active enemies keep moving deterministically.
    expect(moved.enemies.length).toBeGreaterThan(0);
    expect(moved.enemies[0]!.centerY).toBeGreaterThan(
      state.enemies[0]!.centerY,
    );
  });

  it('keeps the active enemy collection bounded across the whole schedule (performance)', () => {
    // The per-frame enemy collection and stable-ID visual map are linear in
    // the active count; drones live ~9-13 s so at most a few groups overlap.
    let state = createState();
    let peak = 0;
    for (let index = 0; index <= 6600; index += 60) {
      state = stepCount(state, 60);
      peak = Math.max(peak, state.enemies.length);
    }
    expect(peak).toBeGreaterThan(3);
    expect(peak).toBeLessThanOrEqual(20);
  });

  it('never bursts groups on a long frame (fixed-step cap, AC-015)', () => {
    // mission time 9.98333… s: the 10 s group is the only one due in 4 steps.
    const state = stepCount(createState(), 599);
    const result = advanceSimulationFrames(state, 2, 0);
    expect(result.accumulatorSeconds).toBe(0);
    expect(result.state.nextEnemyId).toBe(6); // exactly one group, no burst
  });
});

describe('S10 drone movement, entry, and escape', () => {
  it('flips the permanent entered latch when any hitbox portion becomes visible (AC-075)', () => {
    const created = createState();
    // Fully outside at creation: no portion visible.
    expect(created.enemies.every((enemy) => !enemy.hasEnteredVisibleArea)).toBe(
      true,
    );
    const entered = stepCount(created, 1);
    expect(entered.enemies.every((enemy) => enemy.hasEnteredVisibleArea)).toBe(
      true,
    );
  });

  it('moves top entries straight down at constant speed with a fixed x (AC-009)', () => {
    let state = stepCount(createState(), 1);
    const top = state.enemies.find((enemy) => enemy.entry === 'top')!;
    const startX = top.centerX;
    const startY = top.centerY;
    state = stepCount(state, 1);
    const movedTop = state.enemies.find((enemy) => enemy.id === top.id)!;
    expect(movedTop.centerX).toBe(startX);
    expect(movedTop.centerY - startY).toBeCloseTo(SPEED_PER_STEP, 12);
  });

  it('resolves the side waypoint without overshoot or oscillation, then descends (AC-017)', () => {
    const state = stepCount(createState(), 1);
    const side = state.enemies.find((enemy) => enemy.entry === 'upper-right')!;
    const waypointX = side.waypointX!;
    const waypointY = side.waypointY!;
    const distance = Math.hypot(
      waypointX - side.centerX,
      waypointY - side.centerY,
    );
    const arrivalSteps = Math.ceil(distance / SPEED_PER_STEP);
    const beforeArrival = stepCount(state, arrivalSteps - 1);
    const before = beforeArrival.enemies.find((enemy) => enemy.id === side.id)!;
    expect(before.waypointReached).toBe(false);
    // The drone never overshoots or oscillates: it stays on the entry axis
    // side until the arrival step, then descends straight down.
    const atArrival = stepCount(beforeArrival, 1);
    const arrived = atArrival.enemies.find((enemy) => enemy.id === side.id)!;
    expect(arrived.waypointReached).toBe(true);
    expect(arrived.centerX).toBeCloseTo(waypointX, 6);
    const distanceToWaypoint = Math.hypot(
      waypointX - before.centerX,
      waypointY - before.centerY,
    );
    const remainingTravel = SPEED_PER_STEP - distanceToWaypoint;
    expect(remainingTravel).toBeGreaterThanOrEqual(0);
    expect(arrived.centerY).toBeCloseTo(waypointY + remainingTravel, 6);
    const descending = stepCount(atArrival, 5);
    const descended = descending.enemies.find((enemy) => enemy.id === side.id)!;
    expect(descended.centerX).toBeCloseTo(waypointX, 6);
    expect(descended.centerY).toBeCloseTo(
      arrived.centerY + 5 * SPEED_PER_STEP,
      6,
    );
  });

  it('removes a drone as Escaped once its full bounds exit the bottom (AC-018, AC-029)', () => {
    const partiallyInside = stepCount(createState(), 519);
    expect(partiallyInside.enemies.some((enemy) => enemy.id === 0)).toBe(true);
    const escaped = stepCount(createState(), 520);
    expect(escaped.enemies.some((enemy) => enemy.id === 0)).toBe(false);
  });

  it('never lets a drone escape during initial entry', () => {
    const state = stepCount(createState(), 20);
    expect(state.enemies).toHaveLength(3); // no 0s-group member removed early
  });

  it('removes an entered drone after complete exit through any viewport boundary', () => {
    const base = {
      ...spawnEnemy(
        100,
        'basic-drone',
        3,
        'top',
        0.5,
        null,
        null,
        1280,
        600,
        24,
      ),
      waypointReached: true,
      hasEnteredVisibleArea: true,
    };
    const fullyOutside = [
      { ...base, centerX: -12, centerY: 300 },
      { ...base, centerX: 1292, centerY: 300 },
      { ...base, centerX: 640, centerY: -13.2 },
      { ...base, centerX: 640, centerY: 612 },
    ];
    for (const enemy of fullyOutside) {
      expect(
        moveEnemy(enemy, 72, FIXED_STEP_SECONDS, 1280, 600, 24),
      ).toBeNull();
    }
  });

  it('lets overlapping drones coexist without separation or trajectory change (AC-051)', () => {
    const one = spawnEnemy(
      0,
      'basic-drone',
      3,
      'top',
      0.5,
      null,
      null,
      1280,
      600,
      24,
    );
    const two = spawnEnemy(
      1,
      'basic-drone',
      3,
      'top',
      0.5,
      null,
      null,
      1280,
      600,
      24,
    );
    const movedOne = moveEnemy(one, 72, FIXED_STEP_SECONDS, 1280, 600, 24)!;
    const movedTwo = moveEnemy(two, 72, FIXED_STEP_SECONDS, 1280, 600, 24)!;
    expect(movedTwo.centerX).toBe(movedOne.centerX);
    expect(movedTwo.centerY).toBe(movedOne.centerY);
  });
});

describe('S10 resize, seams, and hardening', () => {
  it('proportionally reprojects active drones and waypoints and recalculates geometry/speed on resize', () => {
    const before = stepCount(createState(), 200);
    const resized = submit(before, {
      type: 'combat/viewport-resize',
      width: 800,
      height: 400,
      aircraftWidth: 32 * (1278 / 1231),
      aircraftHeight: 32,
    });
    expect(resized.enemySize).toBeCloseTo(16, 6);
    expect(resized.enemySpeedPxPerSecond).toBeCloseTo(48, 6);
    expect(resized.enemies).toHaveLength(before.enemies.length);
    for (let index = 0; index < before.enemies.length; index += 1) {
      const oldEnemy = before.enemies[index];
      const newEnemy = resized.enemies[index];
      expect(newEnemy!.id).toBe(oldEnemy!.id);
      if (oldEnemy!.entry === 'top') {
        const oldFraction =
          (oldEnemy!.centerX - before.bounds.minX) /
          (before.bounds.maxX - before.bounds.minX);
        const newFraction =
          (newEnemy!.centerX - resized.bounds.minX) /
          (resized.bounds.maxX - resized.bounds.minX);
        expect(newFraction).toBeCloseTo(oldFraction, 6);
        expect(newEnemy!.centerX).toBeGreaterThanOrEqual(resized.bounds.minX);
        expect(newEnemy!.centerX).toBeLessThanOrEqual(resized.bounds.maxX);
      } else {
        expect(newEnemy!.centerX).toBeCloseTo(oldEnemy!.centerX * 0.625, 6);
      }
      expect(newEnemy!.centerY).toBeCloseTo(oldEnemy!.centerY * (2 / 3), 6);
      expect(newEnemy!.waypointX).toBe(
        oldEnemy!.waypointX === null ? null : oldEnemy!.waypointX * 0.625,
      );
    }
  });

  it('keeps a left-edge Top Entry reachable after an aspect-ratio resize (AC-083)', () => {
    const before = createState(77379);
    const topBefore = before.enemies[0]!;
    expect(topBefore.entry).toBe('top');

    const resized = submit(before, {
      type: 'combat/viewport-resize',
      width: 1500,
      height: 800,
      aircraftWidth: 64 * (1278 / 1231),
      aircraftHeight: 64,
    });
    const topAfter = resized.enemies.find(
      (enemy) => enemy.id === topBefore.id,
    )!;

    // A plain width ratio would put this enemy left of the new aircraft bound.
    expect(topBefore.centerX * (1500 / 1280)).toBeLessThan(resized.bounds.minX);
    expect(topAfter.centerX).toBeGreaterThanOrEqual(resized.bounds.minX);
    expect(topAfter.centerX).toBeLessThanOrEqual(resized.bounds.maxX);
    expect(topAfter.centerX).toBeCloseTo(resized.bounds.minX, 1);
  });

  it('forceFinalGroupSpawn is additive, cancels future spawns, and runs exactly once (S13 seam)', () => {
    const forced = forceFinalGroupSpawn(createState());
    expect(forced.finalGroupSpawned).toBe(true);
    expect(forced.enemies).toHaveLength(8); // 3 regular + 5 final
    expect(forced.enemies.slice(3).map((enemy) => enemy.id)).toEqual([
      3, 4, 5, 6, 7,
    ]);
    // AC-042: existing enemies remain, while every future scheduled spawn is
    // cancelled without changing the mission clock.
    expect(forced.missionStepCount).toBe(0);
    expect(forced.spawnPlanIndex).toBe(forced.spawnPlan.length);
    // Idempotent: a second force is a strict no-op.
    expect(forceFinalGroupSpawn(forced)).toBe(forced);
    // Neither regular nor final groups spawn later: only the initial three and
    // the five forced drones have ever been assigned ids.
    const later = stepSeconds(forced, 120);
    expect(later.nextEnemyId).toBe(8);
  });

  it('hardens the construction boundary against invalid seed/enemy/schedule input', () => {
    for (const missionSeed of [
      Number.NaN,
      -1,
      1.5,
      0x100000000,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => createState(missionSeed)).toThrow(/seed/);
    }
    const badEnemy = {
      ...BASIC_DRONE,
      movementSpeedViewportHeightPerSecond: 0,
    };
    expect(() =>
      createCombatSimulation({
        initialMode: 'mouse',
        viewportWidth: 1280,
        viewportHeight: 600,
        aircraftWidth: AIRCRAFT_WIDTH,
        aircraftHeight: AIRCRAFT_HEIGHT,
        weapon: MACHINE_GUN,
        projectile: PLAYER_PROJECTILE,
        missionSeed: SEED,
        enemy: badEnemy,
        schedule: MVP_ENEMY_GROUP_SCHEDULE,
        playerHullIntegrity: 100,
        playerMaximumHullIntegrity: 100,
      }),
    ).toThrow(/enemy/);
    const badSchedule = {
      ...MVP_ENEMY_GROUP_SCHEDULE,
      final: { timeSeconds: -5, dronesPerGroup: 5 },
    };
    expect(() =>
      createCombatSimulation({
        initialMode: 'mouse',
        viewportWidth: 1280,
        viewportHeight: 600,
        aircraftWidth: AIRCRAFT_WIDTH,
        aircraftHeight: AIRCRAFT_HEIGHT,
        weapon: MACHINE_GUN,
        projectile: PLAYER_PROJECTILE,
        missionSeed: SEED,
        enemy: BASIC_DRONE,
        schedule: badSchedule,
        playerHullIntegrity: 100,
        playerMaximumHullIntegrity: 100,
      }),
    ).toThrow(/schedule/);
  });

  it('exposes the approved centred aircraft hitbox geometry (AC-049, §8.6)', () => {
    const box = aircraftCollisionAabb(
      640,
      480,
      AIRCRAFT_WIDTH,
      AIRCRAFT_HEIGHT,
    );
    expect(box.width).toBeCloseTo(AIRCRAFT_WIDTH * 0.6, 6);
    expect(box.height).toBeCloseTo(AIRCRAFT_HEIGHT * 0.7, 6);
    expect(box.x).toBeCloseTo(640 - (AIRCRAFT_WIDTH * 0.6) / 2, 6);
    expect(box.y).toBeCloseTo(480 - (AIRCRAFT_HEIGHT * 0.7) / 2, 6);
  });

  it('freezes enemies after runtime disposal (cleanup contract)', () => {
    const runtime = createCombatSimulationRuntime({
      initialMode: 'mouse',
      viewportWidth: 1280,
      viewportHeight: 600,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      weapon: MACHINE_GUN,
      projectile: PLAYER_PROJECTILE,
      missionSeed: SEED,
      enemy: BASIC_DRONE,
      schedule: MVP_ENEMY_GROUP_SCHEDULE,
      playerHullIntegrity: 100,
      playerMaximumHullIntegrity: 100,
    });
    runtime.advance(0.1);
    const before = runtime.getState();
    runtime.dispose();
    const after = runtime.advance(1);
    expect(after).toBe(before);
    expect(after.enemies).toBe(before.enemies);
  });
});

describe('S10 content seam resolvers', () => {
  it('resolves the Basic Drone and the temporary seam schedule', () => {
    expect(resolveBasicDrone(CONTENT_CATALOGUE)).toBe(BASIC_DRONE);
    expect(resolveMissionSchedule()).toBe(MVP_ENEMY_GROUP_SCHEDULE);
  });
});
