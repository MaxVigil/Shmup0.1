import { describe, expect, it } from 'vitest';
import { BASIC_DRONE, INTERCEPTION } from '@content/index';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import type { WeaponDefinition } from '@content/weapons';
import {
  advanceSimulationFrames,
  createCombatSimulation,
  createCombatSimulationRuntime,
  FIXED_STEP_SECONDS,
  MAX_STEPS_PER_FRAME,
  stepCombatSimulation,
  submitCombatCommand,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import type { CombatInputCommand } from './input-command';
import { brakingDistance, resolveMovementConfig } from './movement-config';
import { isPointerInsideViewport } from './input-command';

// 1280x600: short side 600 → aircraft height 48, width 48 * 1278/1231 ≈ 49.83.
const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
const AIRCRAFT_HEIGHT = 48;
const MISSION_SEED = 3735928559;

function createState(
  mode: 'mouse' | 'keyboard' = 'mouse',
  weapon: WeaponDefinition = MACHINE_GUN,
): CombatSimulationState {
  return createCombatSimulation({
    initialMode: mode,
    viewportWidth: 1280,
    viewportHeight: 600,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon,
    projectile: PLAYER_PROJECTILE,
    missionSeed: MISSION_SEED,
    enemy: BASIC_DRONE,
    schedule: INTERCEPTION.schedule,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: 100,
  });
}

function submit(
  state: CombatSimulationState,
  command: CombatInputCommand,
): CombatSimulationState {
  return submitCombatCommand(state, command);
}

function stepSeconds(
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

const speed = (state: CombatSimulationState): number =>
  Math.hypot(state.aircraft.velocityX, state.aircraft.velocityY);

describe('resolveMovementConfig (Combat §6)', () => {
  it('derives the approved px values from the viewport short side', () => {
    const config = resolveMovementConfig(600);
    expect(config.maximumSpeed).toBeCloseTo(270, 6);
    expect(config.acceleration).toBeCloseTo(1080, 6);
    expect(config.deceleration).toBeCloseTo(1350, 6);
    expect(config.targetTolerance).toBeCloseTo(3, 6);
    expect(config.movementMargin).toBeCloseTo(18, 6);
  });

  it('exposes brakingDistance from the current speed', () => {
    const config = resolveMovementConfig(600);
    expect(brakingDistance(270, config)).toBeCloseTo(27, 6);
  });

  it('recalculates all values for a different short side without logic change', () => {
    const config = resolveMovementConfig(800);
    expect(config.maximumSpeed).toBeCloseTo(360, 6);
    expect(config.acceleration).toBeCloseTo(1440, 6);
    expect(config.deceleration).toBeCloseTo(1800, 6);
    expect(config.targetTolerance).toBeCloseTo(4, 6);
    expect(config.movementMargin).toBeCloseTo(24, 6);
  });
});

describe('createCombatSimulation (AC-070)', () => {
  it('initializes at 50% x 80% with zero velocity, target equal to centre, at rest', () => {
    const state = createState('mouse');
    expect(state.aircraft.centerX).toBeCloseTo(640, 6);
    expect(state.aircraft.centerY).toBeCloseTo(480, 6);
    expect(state.aircraft.velocityX).toBe(0);
    expect(state.aircraft.velocityY).toBe(0);
    expect(state.mouseTarget.x).toBeCloseTo(640, 6);
    expect(state.mouseTarget.y).toBeCloseTo(480, 6);
    expect(state.mouseTargetActive).toBe(false);
    expect(state.keys).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
    // Complete sprite inside Movement Bounds with the 3% margin on every edge.
    expect(state.aircraft.centerX - AIRCRAFT_WIDTH / 2).toBeGreaterThanOrEqual(
      18,
    );
    expect(state.aircraft.centerX + AIRCRAFT_WIDTH / 2).toBeLessThanOrEqual(
      1280 - 18,
    );
    expect(state.aircraft.centerY - AIRCRAFT_HEIGHT / 2).toBeGreaterThanOrEqual(
      18,
    );
    expect(state.aircraft.centerY + AIRCRAFT_HEIGHT / 2).toBeLessThanOrEqual(
      600 - 18,
    );
  });
});

describe('initial rest and pointer target (AC-071)', () => {
  it('keeps the aircraft at rest until the first pointer move inside the viewport', () => {
    const atRest = stepSeconds(createState('mouse'), 1);
    expect(atRest.aircraft.centerX).toBeCloseTo(640, 6);
    expect(atRest.aircraft.centerY).toBeCloseTo(480, 6);
    expect(speed(atRest)).toBe(0);
  });

  it('activates the target on an inside pointer move and clamps it to the bounds', () => {
    const state = submit(createState('mouse'), {
      type: 'combat/pointer-move',
      x: 640,
      y: 200,
    });
    expect(state.mouseTargetActive).toBe(true);
    expect(state.mouseTarget.x).toBeCloseTo(640, 6);
    expect(state.mouseTarget.y).toBeCloseTo(200, 6);

    // A pointer in the top margin zone is clamped to the reachable bounds.
    const clamped = submit(createState('mouse'), {
      type: 'combat/pointer-move',
      x: 640,
      y: 5,
    });
    expect(clamped.mouseTarget.y).toBeCloseTo(clamped.bounds.minY, 6);
  });

  it('rejects pointer moves outside the viewport (no target update)', () => {
    const state = createState('mouse');
    const unchanged = submit(state, {
      type: 'combat/pointer-move',
      x: 2000,
      y: 400,
    });
    expect(unchanged).toBe(state);
    expect(isPointerInsideViewport(2000, 400, 1280, 600)).toBe(false);
    expect(isPointerInsideViewport(640, 300, 1280, 600)).toBe(true);
  });
});

describe('Mouse Movement (AC-004, AC-005)', () => {
  it('accelerates toward the target without teleporting and caps at maximumSpeed', () => {
    let state = submit(createState('mouse'), {
      type: 'combat/pointer-move',
      x: 640,
      y: 200,
    });
    const startX = state.aircraft.centerX;
    const startY = state.aircraft.centerY;
    state = stepSeconds(state, 0.25);
    // Moved upward continuously (no teleport) and is accelerating.
    expect(state.aircraft.centerY).toBeLessThan(startY);
    expect(state.aircraft.centerY).toBeGreaterThan(200);
    expect(Math.abs(state.aircraft.centerX - startX)).toBeLessThan(1);
    expect(state.aircraft.velocityY).toBeLessThan(0);
    // Reaches the maximum speed after the approved time-to-max.
    expect(speed(state)).toBeCloseTo(270, 0);
    expect(speed(state)).toBeLessThanOrEqual(270 + 0.001);
  });

  it('decelerates inside the braking distance and stops at the target', () => {
    let state = submit(createState('mouse'), {
      type: 'combat/pointer-move',
      x: 640,
      y: 300,
    });
    state = stepSeconds(state, 1.5);
    expect(state.aircraft.centerX).toBeCloseTo(640, 0);
    expect(state.aircraft.centerY).toBeCloseTo(300, 0);
    expect(speed(state)).toBe(0);
  });
});

describe('Keyboard Movement (AC-006, AC-007)', () => {
  it('accelerates while commanded and caps at maximumSpeed (W/A/S/D semantics)', () => {
    let state = submit(createState('keyboard'), {
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    state = stepSeconds(state, 0.25);
    expect(state.aircraft.velocityX).toBe(0);
    expect(state.aircraft.velocityY).toBeCloseTo(-270, 0);
    expect(speed(state)).toBeLessThanOrEqual(270 + 0.001);
  });

  it('supports Arrow-key aliases through the same semantic axis', () => {
    // Arrow Up maps to the same 'up' axis: identical movement.
    const viaW = stepSeconds(
      submit(createState('keyboard'), {
        type: 'combat/keyboard',
        key: 'up',
        pressed: true,
      }),
      0.2,
    );
    const viaArrow = stepSeconds(
      submit(createState('keyboard'), {
        type: 'combat/keyboard',
        key: 'up',
        pressed: true,
      }),
      0.2,
    );
    expect(viaW.aircraft.centerY).toBeCloseTo(viaArrow.aircraft.centerY, 6);
  });

  it('decelerates to a stop when released', () => {
    let state = submit(createState('keyboard'), {
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    state = stepSeconds(state, 0.25);
    expect(speed(state)).toBeCloseTo(270, 0);
    state = submit(state, {
      type: 'combat/keyboard',
      key: 'up',
      pressed: false,
    });
    state = stepSeconds(state, 0.2);
    expect(speed(state)).toBe(0);
  });

  it('normalizes diagonal input so speed never exceeds the configured maximum (AC-007)', () => {
    let state = submit(createState('keyboard'), {
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    state = submit(state, {
      type: 'combat/keyboard',
      key: 'right',
      pressed: true,
    });
    state = stepSeconds(state, 0.5);
    expect(Math.abs(state.aircraft.velocityX)).toBeCloseTo(
      Math.abs(state.aircraft.velocityY),
      1,
    );
    expect(speed(state)).toBeLessThanOrEqual(270 + 0.001);
  });
});

describe('mode exclusivity (AC-006)', () => {
  it('ignores keyboard input while Mouse Movement is active', () => {
    const state = createState('mouse');
    const unchanged = submit(state, {
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    expect(unchanged).toBe(state);
  });

  it('ignores pointer input while Keyboard Movement is active', () => {
    const state = createState('keyboard');
    const unchanged = submit(state, {
      type: 'combat/pointer-move',
      x: 640,
      y: 200,
    });
    expect(unchanged).toBe(state);
  });

  describe('movement bounds at every edge (AC-008)', () => {
    it('keeps the complete sprite inside the 3% margin on all four edges', () => {
      const atEdge = (key: 'up' | 'down' | 'left' | 'right') => {
        let state = createState('keyboard');
        state = submit(state, { type: 'combat/keyboard', key, pressed: true });
        // Long enough to cross the whole viewport at maximum speed and pin.
        return stepSeconds(state, 4);
      };
      const top = atEdge('up');
      expect(top.aircraft.centerY).toBeCloseTo(top.bounds.minY, 3);
      expect(top.aircraft.centerY - AIRCRAFT_HEIGHT / 2).toBeGreaterThanOrEqual(
        18,
      );
      const bottom = atEdge('down');
      expect(bottom.aircraft.centerY).toBeCloseTo(bottom.bounds.maxY, 3);
      expect(bottom.aircraft.centerY + AIRCRAFT_HEIGHT / 2).toBeLessThanOrEqual(
        600 - 18,
      );
      const left = atEdge('left');
      expect(left.aircraft.centerX).toBeCloseTo(left.bounds.minX, 3);
      expect(left.aircraft.centerX - AIRCRAFT_WIDTH / 2).toBeGreaterThanOrEqual(
        18,
      );
      const right = atEdge('right');
      expect(right.aircraft.centerX).toBeCloseTo(right.bounds.maxX, 3);
      expect(right.aircraft.centerX + AIRCRAFT_WIDTH / 2).toBeLessThanOrEqual(
        1280 - 18,
      );
    });
  });

  describe('fixed-step limits (S08)', () => {
    it('advances at most MAX_STEPS_PER_FRAME per rendered frame and discards excess', () => {
      const state = submit(createState('keyboard'), {
        type: 'combat/keyboard',
        key: 'up',
        pressed: true,
      });
      const result = advanceSimulationFrames(state, 0.5, 0);
      expect(result.state).not.toBe(state);
      // Four steps at maximum acceleration produce the exact step distance;
      // a five-step run would move further, so the cap is exactly four.
      const fourSteps = stepCombatSimulation(
        stepCombatSimulation(
          stepCombatSimulation(
            stepCombatSimulation(state, FIXED_STEP_SECONDS),
            FIXED_STEP_SECONDS,
          ),
          FIXED_STEP_SECONDS,
        ),
        FIXED_STEP_SECONDS,
      );
      expect(result.state.aircraft.centerY).toBeCloseTo(
        fourSteps.aircraft.centerY,
        6,
      );
      // Excess elapsed time is discarded once the cap is reached.
      expect(result.accumulatorSeconds).toBe(0);
    });

    it('accumulates sub-step frame time and advances exactly when a step is due', () => {
      let state = createState('keyboard');
      state = submit(state, {
        type: 'combat/keyboard',
        key: 'up',
        pressed: true,
      });
      const first = advanceSimulationFrames(state, 0.01, 0);
      expect(first.state).toBe(state);
      expect(first.accumulatorSeconds).toBeCloseTo(0.01, 6);
      // 0.01 + 0.01 = 0.02s crosses the 1/60 step: exactly one step runs and
      // the remainder stays in the accumulator.
      const second = advanceSimulationFrames(
        first.state,
        0.01,
        first.accumulatorSeconds,
      );
      expect(second.state).not.toBe(state);
      expect(second.accumulatorSeconds).toBeCloseTo(
        0.02 - FIXED_STEP_SECONDS,
        6,
      );
    });

    it('caps the maximum number of steps at MAX_STEPS_PER_FRAME even for huge deltas', () => {
      const state = createState('keyboard');
      const result = advanceSimulationFrames(state, 10, 0);
      expect(result.accumulatorSeconds).toBe(0);
      const steps = 10 / FIXED_STEP_SECONDS;
      expect(steps).toBeGreaterThan(MAX_STEPS_PER_FRAME);
    });
  });

  describe('viewport resize (Combat §12.3, S08)', () => {
    const resize = (
      state: CombatSimulationState,
      width: number,
      height: number,
    ) =>
      submit(state, {
        type: 'combat/viewport-resize',
        width,
        height,
        aircraftWidth: Math.min(width, height) * 0.08 * (1278 / 1231),
        aircraftHeight: Math.min(width, height) * 0.08,
      });

    it('is idempotent for repeated identical dimensions', () => {
      const state = createState('keyboard');
      const resized = resize(state, 1280, 600);
      expect(resized).toBe(state);
    });

    it('reprojects position and target proportionally and recalculates values/bounds', () => {
      let state = submit(createState('keyboard'), {
        type: 'combat/keyboard',
        key: 'right',
        pressed: true,
      });
      state = stepSeconds(state, 0.5);
      const beforeX = state.aircraft.centerX;
      const resized = resize(state, 1500, 800);
      expect(resized.viewportWidth).toBe(1500);
      expect(resized.viewportHeight).toBe(800);
      // Proportional reprojection of the position.
      expect(resized.aircraft.centerX).toBeCloseTo(beforeX * (1500 / 1280), 6);
      // Movement values follow the new short side (800).
      expect(resized.config.maximumSpeed).toBeCloseTo(360, 6);
      expect(resized.config.movementMargin).toBeCloseTo(24, 6);
      // Complete sprite inside the new bounds.
      expect(
        resized.aircraft.centerX - resized.aircraftWidth / 2,
      ).toBeGreaterThanOrEqual(24);
      expect(
        resized.aircraft.centerX + resized.aircraftWidth / 2,
      ).toBeLessThanOrEqual(1500 - 24);
    });

    it('clamps the reprojected aircraft when the new viewport cannot hold the position', () => {
      // Move right to a position that, after a much narrower reprojection,
      // would violate the new bounds; the complete sprite must be clamped inside.
      let state = submit(createState('keyboard'), {
        type: 'combat/keyboard',
        key: 'right',
        pressed: true,
      });
      state = stepSeconds(state, 1);
      const resized = resize(state, 640, 600);
      expect(resized.aircraft.centerX).toBeLessThanOrEqual(resized.bounds.maxX);
      expect(
        resized.aircraft.centerX + resized.aircraftWidth / 2,
      ).toBeLessThanOrEqual(640 - 18);
    });
  });

  describe('runtime cleanup (S08)', () => {
    it('makes submit and advance inert after dispose', () => {
      const runtime = createCombatSimulationRuntime({
        initialMode: 'keyboard',
        viewportWidth: 1280,
        viewportHeight: 600,
        aircraftWidth: AIRCRAFT_WIDTH,
        aircraftHeight: AIRCRAFT_HEIGHT,
        weapon: MACHINE_GUN,
        projectile: PLAYER_PROJECTILE,
        missionSeed: MISSION_SEED,
        enemy: BASIC_DRONE,
        schedule: INTERCEPTION.schedule,
        playerHullIntegrity: 100,
        playerMaximumHullIntegrity: 100,
      });
      runtime.submit({ type: 'combat/keyboard', key: 'up', pressed: true });
      runtime.advance(0.5);
      const moved = runtime.getState();
      runtime.dispose();
      runtime.submit({ type: 'combat/keyboard', key: 'right', pressed: true });
      runtime.advance(1);
      expect(runtime.getState()).toBe(moved);
    });
  });

  it('toggles the active mode exactly per F command', () => {
    const mouse = createState('mouse');
    const keyboard = submit(mouse, { type: 'combat/toggle-mode' });
    expect(keyboard.mode).toBe('keyboard');
    const back = submit(keyboard, { type: 'combat/toggle-mode' });
    expect(back.mode).toBe('mouse');
  });
});

describe('latent input across mode transitions (S08-WI01)', () => {
  it('clears held-key state on a full toggle so no stale key resumes movement', () => {
    // Keyboard mode, hold a movement key.
    let state = submit(createState('keyboard'), {
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    state = stepSeconds(state, 0.2);
    expect(state.aircraft.velocityY).toBeLessThan(0);
    // Toggle to Mouse while the key is held, then release it while Keyboard
    // input is inactive (the release is ignored).
    state = submit(state, { type: 'combat/toggle-mode' });
    expect(state.mode).toBe('mouse');
    expect(state.keys.up).toBe(false);
    state = submit(state, {
      type: 'combat/keyboard',
      key: 'up',
      pressed: false,
    });
    // Toggle back to Keyboard: no movement resumes without a new keydown.
    state = submit(state, { type: 'combat/toggle-mode' });
    expect(state.mode).toBe('keyboard');
    const before = state;
    state = stepSeconds(state, 0.5);
    expect(state.aircraft.centerY).toBeCloseTo(before.aircraft.centerY, 6);
    expect(state.aircraft.velocityY).toBe(0);
    // A fresh accepted keydown moves again.
    state = submit(state, {
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    state = stepSeconds(state, 0.2);
    expect(state.aircraft.velocityY).toBeLessThan(0);
  });

  it('entering Mouse mode without an activated target zeroes latent velocity', () => {
    // Build keyboard velocity, then toggle to Mouse with no pointer target.
    let state = submit(createState('keyboard'), {
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    state = stepSeconds(state, 0.25);
    expect(state.aircraft.velocityY).toBeLessThan(0);
    state = submit(state, { type: 'combat/toggle-mode' });
    expect(state.mode).toBe('mouse');
    expect(state.aircraft.velocityX).toBe(0);
    expect(state.aircraft.velocityY).toBe(0);
    // The aircraft is internally at rest (no latent velocity to resume).
    const before = state;
    state = stepSeconds(state, 0.5);
    expect(state.aircraft).toEqual(before.aircraft);
  });

  it('preserves an existing valid mouse target and velocity when toggling to Mouse', () => {
    let state = createState('mouse');
    state = submit(state, { type: 'combat/pointer-move', x: 640, y: 300 });
    expect(state.mouseTargetActive).toBe(true);
    state = stepSeconds(state, 0.3);
    expect(state.aircraft.velocityY).toBeLessThan(0);
    const targetBefore = state.mouseTarget;
    const velocityBefore = state.aircraft;
    state = submit(state, { type: 'combat/toggle-mode' }); // → keyboard
    state = submit(state, { type: 'combat/toggle-mode' }); // → mouse again
    expect(state.mouseTargetActive).toBe(true);
    expect(state.mouseTarget).toEqual(targetBefore);
    expect(state.aircraft.velocityX).toBe(velocityBefore.velocityX);
    expect(state.aircraft.velocityY).toBe(velocityBefore.velocityY);
  });
});

describe('fixed-step/runtime boundary hardening (S08-WI01)', () => {
  it('sanitises invalid frame deltas and accumulators to deterministic no-ops', () => {
    const state = createState('keyboard');
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
    ]) {
      const frameResult = advanceSimulationFrames(state, bad, 0);
      expect(frameResult.state).toBe(state);
      expect(Number.isFinite(frameResult.accumulatorSeconds)).toBe(true);
      const accResult = advanceSimulationFrames(state, 0.01, bad);
      expect(Number.isFinite(accResult.accumulatorSeconds)).toBe(true);
    }
  });

  it('rejects invalid step seconds without poisoning state', () => {
    const state = createState('keyboard');
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(stepCombatSimulation(state, bad)).toBe(state);
    }
  });

  it('rejects invalid resize geometry as a no-op', () => {
    const state = createState('keyboard');
    for (const width of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      const resized = submit(state, {
        type: 'combat/viewport-resize',
        width,
        height: 600,
        aircraftWidth: 49.83,
        aircraftHeight: 48,
      });
      expect(resized).toBe(state);
    }
  });

  it('fails explicitly at construction for invalid geometry', () => {
    for (const viewportWidth of [Number.NaN, 0, -100]) {
      expect(() =>
        createCombatSimulation({
          initialMode: 'mouse',
          viewportWidth,
          viewportHeight: 600,
          aircraftWidth: 49.83,
          aircraftHeight: 48,
          weapon: MACHINE_GUN,
          projectile: PLAYER_PROJECTILE,
          missionSeed: MISSION_SEED,
          enemy: BASIC_DRONE,
          schedule: INTERCEPTION.schedule,
          playerHullIntegrity: 100,
          playerMaximumHullIntegrity: 100,
        }),
      ).toThrow(/positive finite/);
    }
  });
});

describe('fixed-step accumulator reset on accepted resize (S08-WI01)', () => {
  it('resets the accumulator exactly once per accepted effective-dimension change', () => {
    const runtime = createCombatSimulationRuntime({
      initialMode: 'keyboard',
      viewportWidth: 1280,
      viewportHeight: 600,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      weapon: MACHINE_GUN,
      projectile: PLAYER_PROJECTILE,
      missionSeed: MISSION_SEED,
      enemy: BASIC_DRONE,
      schedule: INTERCEPTION.schedule,
      playerHullIntegrity: 100,
      playerMaximumHullIntegrity: 100,
    });
    runtime.submit({
      type: 'combat/keyboard',
      key: 'up',
      pressed: true,
    });
    runtime.advance(0.01);
    // Repeated identical dimensions are a strict no-op: no reprojection and no
    // accumulator reset.
    runtime.submit({
      type: 'combat/viewport-resize',
      width: 1280,
      height: 600,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
    });
    const beforeIdenticalResize = runtime.getState();
    runtime.advance(0.01);
    expect(runtime.getState().aircraft.centerY).toBeLessThan(
      beforeIdenticalResize.aircraft.centerY,
    );

    // An accepted dimension change resets the accumulator.
    runtime.submit({
      type: 'combat/viewport-resize',
      width: 1500,
      height: 800,
      aircraftWidth: 64 * (1278 / 1231),
      aircraftHeight: 64,
    });
    const afterAcceptedResize = runtime.getState();
    expect(afterAcceptedResize.viewportWidth).toBe(1500);
    // A subsequent tiny frame does not immediately consume a stale pre-resize
    // accumulator: it starts from 0.
    const afterFirstTinyFrame = runtime.advance(0.01);
    expect(afterFirstTinyFrame.aircraft.centerY).toBe(
      afterAcceptedResize.aircraft.centerY,
    );
    // A second tiny frame crosses one fresh fixed-step boundary, proving the
    // first frame was accumulated rather than silently discarded.
    const afterSecondTinyFrame = runtime.advance(0.01);
    expect(afterSecondTinyFrame.aircraft.centerY).toBeLessThan(
      afterFirstTinyFrame.aircraft.centerY,
    );
  });
});
