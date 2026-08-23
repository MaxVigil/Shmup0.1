import { describe, expect, it } from 'vitest';
import { BASIC_DRONE, INTERCEPTION } from '@content/index';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  createCombatSimulation,
  createCombatSimulationRuntime,
  stepCombatSimulation,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import type { CombatSimulationRuntime } from './combat-simulation';
import { resolveGermanFighter } from './combat-session';
import type { CombatEnemy } from './enemies';

const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
const AIRCRAFT_HEIGHT = 48;
const ENEMY_SIZE = 24;

function createRuntime(): CombatSimulationRuntime {
  const aircraft = resolveGermanFighter(CONTENT_CATALOGUE);
  return createCombatSimulationRuntime({
    initialMode: 'mouse',
    viewportWidth: 1280,
    viewportHeight: 600,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon: MACHINE_GUN,
    projectile: PLAYER_PROJECTILE,
    missionSeed: 1234,
    enemy: BASIC_DRONE,
    schedule: INTERCEPTION.schedule,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}

/** An enemy one step away from fully escaping below the viewport bottom. */
function enemyAboutToEscape(id: number): CombatEnemy {
  const speed = 600 * 0.12; // 12% of viewport height per second.
  return {
    id,
    type: 'basic-drone',
    hullIntegrity: 3,
    centerX: 640,
    centerY: 600 + ENEMY_SIZE / 2 + speed * FIXED_STEP_SECONDS,
    entry: 'top',
    waypointX: null,
    waypointY: null,
    waypointReached: false,
    hasEnteredVisibleArea: true,
  };
}

describe('S13 pause freeze and hygiene (Combat §10, AC-020)', () => {
  it('paused runtime never advances: mission time, entities, and terminal stay fixed', () => {
    const runtime = createRuntime();
    const advanced = runtime.advance(1);
    expect(advanced.missionStepCount).toBeGreaterThan(0);

    runtime.setPaused(true);
    const paused = runtime.getState();
    const missionStep = paused.missionStepCount;
    const frozen = runtime.advance(60);
    expect(frozen).toBe(paused);
    expect(frozen.missionStepCount).toBe(missionStep);
    // Mission time, schedule, firing, collisions, feedback, and terminal all
    // freeze together with the state object identity.
    expect(frozen.projectiles).toBe(paused.projectiles);
    expect(frozen.enemies).toBe(paused.enemies);

    runtime.setPaused(false);
    const resumed = runtime.advance(60);
    expect(resumed.missionStepCount).toBeGreaterThan(missionStep);
  });

  it('entering pause clears held-key facts so no latent input survives Resume', () => {
    const runtime = createRuntime();
    runtime.submit({ type: 'combat/set-mode', mode: 'keyboard' });
    runtime.submit({ type: 'combat/keyboard', key: 'right', pressed: true });
    runtime.submit({ type: 'combat/keyboard', key: 'up', pressed: true });
    expect(runtime.getState().keys.right).toBe(true);
    expect(runtime.getState().keys.up).toBe(true);

    runtime.setPaused(true);
    // A missing keyup cannot leave a stale pressed flag behind.
    expect(runtime.getState().keys).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });

    runtime.setPaused(false);
    expect(runtime.getState().keys).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });

  it('entering pause resets the fixed-step accumulator once (no catch-up after Resume)', () => {
    const runtime = createRuntime();
    // 1/3 of a fixed step: the accumulator holds sub-step time.
    runtime.advance(FIXED_STEP_SECONDS / 3);
    runtime.setPaused(true);
    // While paused, even a full-frame delta does not accumulate or advance.
    runtime.advance(60);
    // Resume with a sub-step delta: if the accumulator had survived the pause,
    // this would run a catch-up step; after the reset it must not.
    runtime.setPaused(false);
    const before = runtime.getState();
    const stillSubStep = runtime.advance(FIXED_STEP_SECONDS / 2);
    expect(stillSubStep).toBe(before);
  });

  it('gameplay input commands are rejected while paused; resize and set-mode still work', () => {
    const runtime = createRuntime();
    runtime.setPaused(true);
    const before = runtime.getState();
    runtime.submit({ type: 'combat/toggle-mode' });
    expect(runtime.getState().mode).toBe(before.mode);
    runtime.submit({ type: 'combat/pointer-move', x: 200, y: 200 });
    expect(runtime.getState().mouseTargetActive).toBe(false);

    // Settings-driven control-mode change still applies for use on Resume.
    runtime.submit({ type: 'combat/set-mode', mode: 'keyboard' });
    expect(runtime.getState().mode).toBe('keyboard');

    // An accepted effective resize still reprojects while paused (AC-045).
    runtime.submit({
      type: 'combat/viewport-resize',
      width: 1500,
      height: 800,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
    });
    expect(runtime.getState().viewportWidth).toBe(1500);
  });
});

describe('S13 escaped-enemy observability count (Combat §7.5)', () => {
  it('counts each escaped drone exactly once in the step it is removed', () => {
    const aircraft = resolveGermanFighter(CONTENT_CATALOGUE);
    const base = createCombatSimulation({
      initialMode: 'mouse',
      viewportWidth: 1280,
      viewportHeight: 600,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      weapon: MACHINE_GUN,
      projectile: PLAYER_PROJECTILE,
      missionSeed: 1234,
      enemy: BASIC_DRONE,
      schedule: INTERCEPTION.schedule,
      playerHullIntegrity: 100,
      playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
    });
    const withEscaper = {
      ...base,
      enemies: [enemyAboutToEscape(base.nextEnemyId)],
      spawnPlanIndex: base.spawnPlan.length,
      finalGroupSpawned: true,
    };
    const stepped = stepCombatSimulation(withEscaper, FIXED_STEP_SECONDS);
    expect(stepped.escapedEnemyCount).toBe(1);
    expect(stepped.enemies).toHaveLength(0);
    // The count is cumulative and never decrements.
    const again = stepCombatSimulation(stepped, FIXED_STEP_SECONDS);
    expect(again.escapedEnemyCount).toBe(1);
  });
});
