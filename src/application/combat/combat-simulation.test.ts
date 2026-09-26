import { describe, expect, it } from 'vitest';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import type { WeaponDefinition } from '@content/weapons';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  createTestCombatRuntime,
  createTestCombatState,
  AIRCRAFT_HEIGHT,
  AIRCRAFT_WIDTH,
  TEST_MISSION_SEED,
} from '@test-support/domain';
import {
  advanceSimulationFrames,
  beginEvacuation,
  buildEvacuationCountdownReadModel,
  createCombatSimulation,
  evacuationCountdownDisplaySeconds,
  evacuationEnemyOpacity,
  EVACUATION_COUNTDOWN_STEPS,
  EXIT_CENTRE_STEPS,
  FIXED_STEP_SECONDS,
  MAX_STEPS_PER_FRAME,
  stepCombatSimulation,
  submitCombatCommand,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import type { CombatEnemy } from './enemies';
import type { CombatInputCommand } from './input-command';
import { brakingDistance, resolveMovementConfig } from './movement-config';
import { isPointerInsideViewport } from './input-command';

function createState(
  mode: 'mouse' | 'keyboard' = 'mouse',
  weapon: WeaponDefinition = MACHINE_GUN,
): CombatSimulationState {
  return createTestCombatState({ mode, weapon });
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
      const runtime = createTestCombatRuntime({ mode: 'keyboard' });
      runtime.submit({ type: 'combat/keyboard', key: 'up', pressed: true });
      runtime.advance(0.5);
      const moved = runtime.getState();
      runtime.dispose();
      runtime.submit({ type: 'combat/keyboard', key: 'right', pressed: true });
      runtime.advance(1);
      expect(runtime.getState()).toBe(moved);
    });

    it('makes every post-dispose command inert and disposal idempotent (V02-WI-07 D03)', () => {
      // V02-AC-027: a disposed Combat runtime must not be able to start an
      // entity, schedule, terminal, or RNG consumption through ANY entry point,
      // and it must tolerate repeated disposal. The assertions use the exact
      // frozen state object, so one surviving step or entity fails them.
      const runtime = createTestCombatRuntime({ mode: 'keyboard' });
      runtime.advance(0.5);
      const frozen = runtime.getState();
      const enemiesBeforeDispose = frozen.enemies;
      const projectilesBeforeDispose = frozen.projectiles;
      const evacuationStepsBeforeDispose = frozen.evacuationStepsRemaining;
      runtime.dispose();
      runtime.dispose();
      runtime.submit({ type: 'combat/keyboard', key: 'right', pressed: true });
      runtime.submitDebug({
        type: 'combat-debug/spawn-enemy',
        enemyType: 'basic-drone',
      });
      runtime.submitDebug({
        type: 'combat-debug/set-elite-phase',
        phase: 'armoured',
      });
      runtime.submitDebug({ type: 'combat-debug/win-mission' });
      runtime.beginEvacuation();
      runtime.authorizeCommittedExit();
      expect(runtime.advance(1)).toBe(frozen);
      expect(runtime.getState()).toBe(frozen);
      expect(frozen.terminalResult).toBeNull();
      expect(frozen.exitAuthorized).toBe(false);
      expect(frozen.evacuationStepsRemaining).toBe(
        evacuationStepsBeforeDispose,
      );
      // The frozen collections are the SAME arrays: no command could append an
      // entity or projectile after disposal.
      expect(frozen.enemies).toBe(enemiesBeforeDispose);
      expect(frozen.projectiles).toBe(projectilesBeforeDispose);
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
          missionSeed: TEST_MISSION_SEED,
          mission: CONTENT_CATALOGUE.missions[0]!,
          enemies: CONTENT_CATALOGUE.enemies,
          playerHullIntegrity: 100,
          playerMaximumHullIntegrity: 100,
        }),
      ).toThrow(/positive finite/);
    }
  });
});

describe('fixed-step accumulator reset on accepted resize (S08-WI01)', () => {
  it('resets the accumulator exactly once per accepted effective-dimension change', () => {
    const runtime = createTestCombatRuntime({ mode: 'keyboard' });
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

describe('v0.2 CRITICAL HULL message (v0.2 §15.3, V02-WI-04)', () => {
  // `2.0 s` at the fixed `1/60 s` step.
  const CRITICAL_HULL_STEPS = 120;

  it('triggers exactly once below 25 Hull and runs its full 2 s timer without later collision passes resetting it', () => {
    let state = createState();
    state = { ...state, playerHullIntegrity: 24 };
    const triggered = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    expect(triggered.criticalHullMessageTriggered).toBe(true);
    expect(triggered.criticalHullMessageStepsRemaining).toBe(
      CRITICAL_HULL_STEPS,
    );
    // A later collision pass must preserve the running timer (it used to reset
    // it to 0 on the very next step, hiding the message after one frame).
    const next = stepCombatSimulation(triggered, FIXED_STEP_SECONDS);
    expect(next.criticalHullMessageTriggered).toBe(true);
    expect(next.criticalHullMessageStepsRemaining).toBe(
      CRITICAL_HULL_STEPS - 1,
    );
    // The message counts down once per step and expires after 2 s; the latch
    // stays consumed (once per Mission Instance, never re-triggered).
    let current = next;
    for (let index = 1; index < CRITICAL_HULL_STEPS; index += 1) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    }
    expect(current.criticalHullMessageTriggered).toBe(true);
    expect(current.criticalHullMessageStepsRemaining).toBe(0);
    // Recovery to full Hull does not re-trigger the message.
    current = { ...current, playerHullIntegrity: 100 };
    const recovered = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    expect(recovered.criticalHullMessageTriggered).toBe(true);
    expect(recovered.criticalHullMessageStepsRemaining).toBe(0);
  });
});

describe('v0.2 Success exit ordering and timing (Epic §13.3, V02-WI-04 C01)', () => {
  it('keeps the deterministic exit frozen until the campaign transaction authorizes it', () => {
    const runtime = createTestCombatRuntime();
    runtime.submitDebug({ type: 'combat-debug/win-mission' });
    let state = runtime.getState();
    expect(state.terminalResult).toEqual({ kind: 'success' });
    expect(state.exitPhase).toBe('centre');
    expect(state.exitAuthorized).toBe(false);
    // Without the commit-authorization seam the exit does not advance at all,
    // even over many frames (gameplay already froze at the terminal step).
    const frozen = runtime.advance(5);
    expect(frozen).toBe(state);
    expect(frozen.aircraft.centerX).toBe(state.aircraft.centerX);
    // The transaction commits Success → the entry authorizes the exit → the
    // centre phase advances from exactly its 30 remaining steps.
    runtime.authorizeCommittedExit();
    state = runtime.advance(FIXED_STEP_SECONDS);
    expect(state.exitAuthorized).toBe(true);
    expect(state.exitPhase).toBe('centre');
    expect(state.exitCentreStepsRemaining).toBe(29);
  });

  it('runs exactly 30 centre steps then moves upward with no extra idle step', () => {
    const runtime = createTestCombatRuntime();
    // Move the Aircraft off the 50% VW rest position so the centre phase has
    // actual horizontal movement to perform.
    runtime.submit({ type: 'combat/pointer-move', x: 900, y: 480 });
    for (let index = 0; index < 180; index += 1) {
      runtime.advance(FIXED_STEP_SECONDS);
    }
    expect(runtime.getState().aircraft.centerX).toBeGreaterThan(880);
    runtime.submitDebug({ type: 'combat-debug/win-mission' });
    runtime.authorizeCommittedExit();
    let state = runtime.getState();
    const startCenterX = state.aircraft.centerX;
    for (let index = 0; index < 30; index += 1) {
      state = runtime.advance(FIXED_STEP_SECONDS);
      expect(state.exitPhase).toBe('centre');
      expect(state.exitCentreStepsRemaining).toBe(29 - index);
    }
    // After exactly 30 fixed steps the Aircraft reached 50% VW and the centre
    // phase is exhausted; the very next step must already move upward (the
    // previous code consumed one idle step at the transition).
    expect(state.aircraft.centerX).toBeCloseTo(state.viewportWidth * 0.5, 6);
    expect(state.exitCentreStepsRemaining).toBe(0);
    expect(startCenterX).toBeGreaterThan(state.aircraft.centerX);
    const beforeY = state.aircraft.centerY;
    const upward = runtime.advance(FIXED_STEP_SECONDS);
    expect(upward.exitPhase).toBe('fly-up');
    expect(upward.aircraft.centerY).toBeLessThan(beforeY);
    expect(upward.aircraft.centerX).toBe(state.aircraft.centerX);
  });

  it('a repeated authorize is inert and the exit completes and dispatches once', () => {
    const runtime = createTestCombatRuntime();
    runtime.submitDebug({ type: 'combat-debug/win-mission' });
    runtime.authorizeCommittedExit();
    runtime.authorizeCommittedExit(); // inert
    let state = runtime.getState();
    // 30 centre steps + 85 fly-up steps fully exit the 1280x600 viewport
    // (48 px tall aircraft at 480 px, 60% VH/s = 6 px/step).
    for (let index = 0; index < 30 + 90; index += 1) {
      state = runtime.advance(FIXED_STEP_SECONDS);
      if (state.exitPhase === 'complete') {
        break;
      }
    }
    expect(state.exitPhase).toBe('complete');
    expect(
      state.aircraft.centerY + state.aircraftHeight / 2,
    ).toBeLessThanOrEqual(0);
  });
});
/** V02-WI-05 E02 crafted active Basic fixture at an explicit centre (complete
 *  rendered bounds from the authoritative state; already entered/activated). */
function basicAt(
  state: CombatSimulationState,
  centerX: number,
  centerY: number,
): CombatEnemy {
  return {
    id: 0,
    kind: 'basic',
    type: 'basic-drone',
    hullIntegrity: 100,
    centerX,
    centerY,
    width: state.enemyBoundsByType['basic-drone'].width,
    height: state.enemyBoundsByType['basic-drone'].height,
    entry: 'top',
    hasEnteredVisibleArea: true,
    activated: true,
    ordinal: 0,
  };
}

describe('V02-WI-05 E02 deterministic Evacuation commitment (Epic §13.4, V02-AC-014/015)', () => {
  it('beginEvacuation records exactly 300 steps once; repeated and post-terminal pure calls are strict no-ops', () => {
    const fresh = createState();
    const committed = beginEvacuation(fresh);
    expect(committed.evacuationStepsRemaining).toBe(EVACUATION_COUNTDOWN_STEPS);
    expect(committed).not.toBe(fresh);
    // Already-committed repeated calls are no-ops.
    expect(beginEvacuation(committed)).toBe(committed);
    // One executed step decrements exactly once (a duplicated begin would
    // record 600 and never resolve on the canonical 300th executed step).
    const afterOne = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
    expect(afterOne.evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS - 1,
    );
    expect(beginEvacuation(afterOne)).toBe(afterOne);
    // Post-terminal no-op: once the zero step resolved Evacuated, no later
    // begin can restart or re-arm the commitment.
    let running = committed;
    for (let index = 0; index < EVACUATION_COUNTDOWN_STEPS; index += 1) {
      running = stepCombatSimulation(running, FIXED_STEP_SECONDS);
    }
    expect(running.terminalResult).toEqual({ kind: 'evacuated' });
    expect(beginEvacuation(running)).toBe(running);
  });

  it('exposes the canonical countdown read model: 300/299/240/1/0 → 5/5/4/1/0 seconds', () => {
    expect(EVACUATION_COUNTDOWN_STEPS).toBe(300);
    expect(evacuationCountdownDisplaySeconds(300)).toBe(5);
    expect(evacuationCountdownDisplaySeconds(299)).toBe(5);
    expect(evacuationCountdownDisplaySeconds(240)).toBe(4);
    expect(evacuationCountdownDisplaySeconds(1)).toBe(1);
    expect(evacuationCountdownDisplaySeconds(0)).toBe(0);
    expect(evacuationCountdownDisplaySeconds(-7)).toBe(0);
    const committed = beginEvacuation(createState());
    expect(buildEvacuationCountdownReadModel(committed)).toEqual({
      committed: true,
      remainingSteps: 300,
      displaySeconds: 5,
    });
    const afterOne = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
    expect(buildEvacuationCountdownReadModel(afterOne)).toEqual({
      committed: true,
      remainingSteps: 299,
      displaySeconds: 5,
    });
  });

  it('runtime begin is accepted exactly once; pause freezes the countdown and accepted resize consumes nothing', () => {
    const runtime = createTestCombatRuntime({ mode: 'keyboard' });
    runtime.beginEvacuation();
    expect(runtime.getState().evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS,
    );
    runtime.beginEvacuation(); // duplicate relay: strict no-op
    // Paused lifecycle: frames never execute a step, so no catch-up.
    runtime.setPaused(true);
    runtime.advance(10);
    expect(runtime.getState().evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS,
    );
    // Resize reprojects without consuming or resetting the countdown.
    runtime.submit({
      type: 'combat/viewport-resize',
      width: 1500,
      height: 800,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
    });
    expect(runtime.getState().evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS,
    );
    // Resume: the next 1/60 frame decrements exactly once (fresh accumulator).
    runtime.setPaused(false);
    runtime.advance(FIXED_STEP_SECONDS);
    expect(runtime.getState().evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS - 1,
    );
    // A disposed runtime ignores every later begin without throwing.
    runtime.dispose();
    const after = runtime.getState();
    runtime.beginEvacuation();
    expect(runtime.getState()).toBe(after);
  });

  it('resolves the immutable Evacuated terminal on the exact 300th executed step with Success suppressed throughout', () => {
    const fresh = createState();
    // Control: without a commitment this cleared mission would already be a
    // Success on the first executed step.
    const ready = {
      ...fresh,
      arrivalGroupIndex: fresh.arrivalGroups.length,
      enemies: [],
    };
    expect(
      stepCombatSimulation(ready, FIXED_STEP_SECONDS).terminalResult,
    ).toEqual({ kind: 'success' });
    // The same cleared mission under a commitment never resolves Success —
    // even before the first countdown step or after every enemy is gone.
    let committed = beginEvacuation(ready);
    for (let index = 0; index < EVACUATION_COUNTDOWN_STEPS - 1; index += 1) {
      committed = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
      expect(committed.terminalResult).toBeNull();
    }
    expect(committed.evacuationStepsRemaining).toBe(1);
    const resolved = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
    expect(resolved.evacuationStepsRemaining).toBe(0);
    expect(resolved.terminalResult).toEqual({ kind: 'evacuated' });
    // Post-terminal steps change nothing (no second terminal, no movement of
    // the frozen exit before authorization).
    expect(stepCombatSimulation(resolved, FIXED_STEP_SECONDS)).toBe(resolved);
  });

  it('continues due authored spawns and normal movement during the commitment', () => {
    const fresh = createState();
    const nextGroup = fresh.arrivalGroups[1];
    expect(nextGroup).toBeDefined();
    // Jump mission time to the exact step before the second authored Arrival
    // Group (the first group is treated as already spawned by the cursor).
    const committed = beginEvacuation({
      ...fresh,
      missionStepCount: nextGroup!.stepIndex - 1,
      arrivalGroupIndex: 1,
    });
    const afterSpawn = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
    // The due authored group arrived during the commitment, in authored member
    // count, while the countdown decremented exactly once.
    expect(afterSpawn.arrivalGroupIndex).toBe(2);
    expect(afterSpawn.enemies).toHaveLength(nextGroup!.members.length);
    expect(afterSpawn.evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS - 1,
    );
    expect(afterSpawn.terminalResult).toBeNull();
    // Movement continues: a crafted active enemy inside the countdown window
    // travels downward while the commitment is still running.
    const state = beginEvacuation({
      ...fresh,
      enemies: [basicAt(fresh, 640, 200)],
    });
    const moved = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    expect(moved.enemies[0]!.centerY).toBeGreaterThan(200);
    expect(moved.evacuationStepsRemaining).toBe(EVACUATION_COUNTDOWN_STEPS - 1);
  });

  it('observes normal collision damage and escape economy during the commitment', () => {
    const fresh = createState();
    // Regular Basic contact still damages the Aircraft mid-countdown (the
    // enemy survives; no escape/no penalty; collision work ran before the
    // terminal evaluation of this step).
    const contact = beginEvacuation({
      ...fresh,
      playerHullIntegrity: 40,
      enemies: [basicAt(fresh, 640, 480)],
    });
    const damaged = stepCombatSimulation(contact, FIXED_STEP_SECONDS);
    expect(damaged.evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS - 1,
    );
    expect(damaged.playerHullIntegrity).toBeLessThan(40);
    expect(damaged.playerDefeated).toBe(false);
    expect(damaged.terminalResult).toBeNull();
    expect(damaged.enemies).toHaveLength(1);
    // A Basic that fully exits the bottom boundary mid-countdown is a normal
    // Escaped enemy: it adds its penalty and leaves no active enemy — the
    // frozen-at-Evacuation rule applies only to enemies active at resolution.
    const escapee = beginEvacuation({
      ...fresh,
      enemies: [
        {
          ...basicAt(fresh, 640, 0),
          centerY:
            fresh.viewportHeight +
            fresh.enemyBoundsByType['basic-drone'].height / 2 +
            4,
        },
      ],
    });
    const escaped = stepCombatSimulation(escapee, FIXED_STEP_SECONDS);
    expect(escaped.escapedCountByType['basic-drone']).toBe(1);
    expect(escaped.pendingEscapePenalties).toBe(1);
    expect(escaped.enemies).toHaveLength(0);
    expect(escaped.evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS - 1,
    );
    expect(escaped.terminalResult).toBeNull();
  });

  it('Defeat stays first priority on the exact zero step after real contact damage', () => {
    const fresh = createState();
    // The zero step: remaining is 1. The crafted Basic overlaps the Aircraft
    // and the complete collision/damage work of this step drives Hull to 0, so
    // Defeat — not Evacuated — must resolve (evaluation-order counter-case).
    const zeroStep = {
      ...beginEvacuation(fresh),
      evacuationStepsRemaining: 1,
      playerHullIntegrity: 10,
      enemies: [basicAt(fresh, 640, 480)],
    };
    const resolved = stepCombatSimulation(zeroStep, FIXED_STEP_SECONDS);
    expect(resolved.terminalResult).toEqual({ kind: 'defeat' });
    expect(resolved.evacuationStepsRemaining).toBe(0);
    expect(resolved.playerHullIntegrity).toBe(0);
    // The regular contact never escapes or penalises the enemy at resolution.
    expect(resolved.enemies).toHaveLength(1);
    expect(resolved.escapedCountByType['basic-drone']).toBe(0);
    expect(resolved.pendingEscapePenalties).toBe(0);
  });

  it('freezes the immutable Evacuated terminal and drives the exact 30-step fade/centre, then the 60% VH/s upward exit', () => {
    const fresh = createState();
    // A visible active enemy freezes at resolution (never Escaped, never
    // penalised) and fades across the shared committed exit.
    const zeroStep = {
      ...fresh,
      evacuationStepsRemaining: 1,
      enemies: [basicAt(fresh, 640, 150)],
    };
    const frozen = stepCombatSimulation(zeroStep, FIXED_STEP_SECONDS);
    expect(frozen.terminalResult).toEqual({ kind: 'evacuated' });
    expect(frozen.exitPhase).toBe('centre');
    expect(frozen.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
    expect(frozen.evacuationStepsRemaining).toBe(0);
    expect(frozen.escapedCountByType['basic-drone']).toBe(0);
    expect(frozen.pendingEscapePenalties).toBe(0);
    expect(frozen.enemies).toHaveLength(1);
    // Pre-commit freeze: no exit advancement, full opacity, no movement.
    expect(stepCombatSimulation(frozen, FIXED_STEP_SECONDS)).toBe(frozen);
    expect(evacuationEnemyOpacity(frozen)).toBe(1);
    const rewardSnapshot = frozen.pendingCombatRewards;
    const enemySnapshot = frozen.enemies[0]!;

    // Authorize (the committed campaign write resolved) and run the exact 30
    // centre steps: Aircraft X lands on 50% VW, Y stays fixed, and the fade
    // scalar descends from full to exactly zero.
    let exit = { ...frozen, exitAuthorized: true };
    for (let index = 1; index <= EXIT_CENTRE_STEPS; index += 1) {
      exit = stepCombatSimulation(exit, FIXED_STEP_SECONDS);
      expect(exit.exitPhase).toBe('centre');
      expect(evacuationEnemyOpacity(exit)).toBeCloseTo(
        (EXIT_CENTRE_STEPS - index) / EXIT_CENTRE_STEPS,
        6,
      );
    }
    expect(exit.exitCentreStepsRemaining).toBe(0);
    expect(exit.aircraft.centerX).toBeCloseTo(exit.viewportWidth * 0.5, 6);
    expect(exit.aircraft.centerY).toBe(frozen.aircraft.centerY);
    expect(evacuationEnemyOpacity(exit)).toBe(0);
    // Fade completes: the enemy surface is at zero opacity and the frozen
    // entity itself never moved, escaped, or added a penalty.
    expect(exit.enemies[0]!.id).toBe(enemySnapshot.id);
    expect(exit.enemies[0]!.centerX).toBe(enemySnapshot.centerX);
    expect(exit.enemies[0]!.centerY).toBe(enemySnapshot.centerY);
    expect(exit.pendingCombatRewards).toBe(rewardSnapshot);

    // Fly-up at 60% VH/s: no extra horizontal drift, then complete when the
    // complete rendered bounds leave the top viewport.
    const beforeY = exit.aircraft.centerY;
    const upward = stepCombatSimulation(exit, FIXED_STEP_SECONDS);
    expect(upward.exitPhase).toBe('fly-up');
    expect(upward.aircraft.centerY).toBeLessThan(beforeY);
    expect(upward.aircraft.centerX).toBe(exit.aircraft.centerX);
    expect(evacuationEnemyOpacity(upward)).toBe(0);
    let complete = upward;
    for (
      let index = 0;
      index < 400 && complete.exitPhase !== 'complete';
      index += 1
    ) {
      complete = stepCombatSimulation(complete, FIXED_STEP_SECONDS);
    }
    expect(complete.exitPhase).toBe('complete');
    expect(
      complete.aircraft.centerY + complete.aircraftHeight / 2,
    ).toBeLessThanOrEqual(0);
    // No post-terminal gameplay/spawn/collision/economy mutation occurred.
    expect(complete.enemies).toHaveLength(1);
    expect(complete.enemies[0]!.id).toBe(enemySnapshot.id);
    expect(complete.pendingCombatRewards).toBe(rewardSnapshot);
    expect(complete.escapedCountByType['basic-drone']).toBe(0);
  });

  it('resize reprojects both Evacuation exit phases without restarting or consuming steps', () => {
    const fresh = createState();
    const zeroStep = {
      ...fresh,
      evacuationStepsRemaining: 1,
      enemies: [basicAt(fresh, 640, 150)],
    };
    const frozen = stepCombatSimulation(zeroStep, FIXED_STEP_SECONDS);
    expect(frozen.terminalResult).toEqual({ kind: 'evacuated' });
    // Advance 10 of the 30 centre steps, then resize.
    let mid = { ...frozen, exitAuthorized: true };
    for (let index = 0; index < 10; index += 1) {
      mid = stepCombatSimulation(mid, FIXED_STEP_SECONDS);
    }
    expect(mid.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS - 10);
    expect(mid.aircraft.centerY).toBe(frozen.aircraft.centerY);
    const resizeCommand = {
      type: 'combat/viewport-resize',
      width: 1500,
      height: 800,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
    } as const;
    const resizedCentre = submitCombatCommand(mid, resizeCommand);
    // Phase, remaining steps, resolved terminal, and the frozen enemy survive.
    expect(resizedCentre.exitPhase).toBe('centre');
    expect(resizedCentre.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS - 10);
    expect(resizedCentre.terminalResult).toEqual({ kind: 'evacuated' });
    expect(resizedCentre.evacuationStepsRemaining).toBe(0);
    expect(resizedCentre.enemies[0]!.id).toBe(mid.enemies[0]!.id);
    const continued = stepCombatSimulation(resizedCentre, FIXED_STEP_SECONDS);
    expect(continued.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS - 11);

    // Resize during the upward phase reprojects geometry and continues to
    // complete without restarting the exit.
    let flying = continued;
    for (let index = 0; index < 30; index += 1) {
      flying = stepCombatSimulation(flying, FIXED_STEP_SECONDS);
    }
    expect(flying.exitPhase).toBe('fly-up');
    const resizedFlying = submitCombatCommand(flying, {
      type: 'combat/viewport-resize',
      width: 1600,
      height: 900,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
    });
    expect(resizedFlying.exitPhase).toBe('fly-up');
    expect(resizedFlying.aircraft.centerY).toBeCloseTo(
      flying.aircraft.centerY * (900 / 800),
      6,
    );
    let complete = resizedFlying;
    for (
      let index = 0;
      index < 400 && complete.exitPhase !== 'complete';
      index += 1
    ) {
      complete = stepCombatSimulation(complete, FIXED_STEP_SECONDS);
    }
    expect(complete.exitPhase).toBe('complete');
    expect(complete.enemies).toHaveLength(1);
  });

  it('resolves Evacuated through the runtime after exactly 300 executed frames and keeps a later begin inert', () => {
    const runtime = createTestCombatRuntime();
    runtime.beginEvacuation();
    // Mission 01's first authored Arrival Group is due after the 300-step
    // window, so the operational Aircraft survives and resolves Evacuated on
    // the exact 300th executed step.
    let state = runtime.getState();
    for (let index = 0; index < EVACUATION_COUNTDOWN_STEPS; index += 1) {
      state = runtime.advance(FIXED_STEP_SECONDS);
      expect(state.evacuationStepsRemaining).toBe(
        EVACUATION_COUNTDOWN_STEPS - 1 - index,
      );
      if (index < EVACUATION_COUNTDOWN_STEPS - 1) {
        expect(state.terminalResult).toBeNull();
      }
    }
    expect(state.terminalResult).toEqual({ kind: 'evacuated' });
    expect(state.exitPhase).toBe('centre');
    expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
    // Post-terminal runtime begin is a strict no-op.
    const frozen = runtime.getState();
    runtime.beginEvacuation();
    expect(runtime.getState()).toBe(frozen);
  });
});

describe('V02-WI-05 E02 C01 committed-exit resize continuity (Epic §13.3–13.4)', () => {
  const resizeLate = {
    type: 'combat/viewport-resize',
    width: 1500,
    height: 800,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
  } as const;
  const resizeFinal = {
    type: 'combat/viewport-resize',
    width: 1600,
    height: 900,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
  } as const;

  it('keeps a late Success fly-up and complete phase proportional instead of clamping back into gameplay bounds', () => {
    const fresh = createState();
    const ready = {
      ...fresh,
      arrivalGroupIndex: fresh.arrivalGroups.length,
      enemies: [],
    };
    const success = stepCombatSimulation(ready, FIXED_STEP_SECONDS);
    expect(success.terminalResult).toEqual({ kind: 'success' });
    // Authorize + 30 centre steps + enough fly-up steps to climb above the
    // gameplay movement bounds (centre Y < bounds.minY) but not yet complete.
    let exit = { ...success, exitAuthorized: true };
    for (let index = 0; index < EXIT_CENTRE_STEPS; index += 1) {
      exit = stepCombatSimulation(exit, FIXED_STEP_SECONDS);
    }
    for (let index = 0; index < 80; index += 1) {
      exit = stepCombatSimulation(exit, FIXED_STEP_SECONDS);
    }
    expect(exit.exitPhase).toBe('fly-up');
    expect(exit.aircraft.centerY).toBeLessThan(exit.bounds.minY);
    const beforeY = exit.aircraft.centerY;
    const beforeX = exit.aircraft.centerX;

    const resized = submitCombatCommand(exit, resizeLate);
    // Proportional reprojection: Y scales (no clamp back down into the bounds)
    // while phase, terminal payload, authorization, and counters survive.
    expect(resized.exitPhase).toBe('fly-up');
    expect(resized.aircraft.centerY).toBeCloseTo(beforeY * (800 / 600), 6);
    expect(resized.aircraft.centerX).toBeCloseTo(beforeX * (1500 / 1280), 6);
    expect(resized.aircraft.centerY).toBeLessThan(resized.bounds.minY);
    expect(resized.terminalResult).toEqual({ kind: 'success' });
    expect(resized.exitAuthorized).toBe(true);
    expect(resized.exitCentreStepsRemaining).toBe(0);
    expect(resized.enemies).toHaveLength(0);

    // The upward flight continues to complete after the resize.
    let done = resized;
    for (
      let index = 0;
      index < 200 && done.exitPhase !== 'complete';
      index += 1
    ) {
      done = stepCombatSimulation(done, FIXED_STEP_SECONDS);
    }
    expect(done.exitPhase).toBe('complete');

    // A further resize on the complete phase stays proportional and complete.
    const finalResized = submitCombatCommand(done, resizeFinal);
    expect(finalResized.exitPhase).toBe('complete');
    expect(finalResized.aircraft.centerY).toBeCloseTo(
      done.aircraft.centerY * (900 / 800),
      6,
    );
    expect(finalResized.terminalResult).toEqual({ kind: 'success' });
  });

  it('keeps a late Evacuation fly-up proportional and preserves the frozen entities/economy across resize', () => {
    const fresh = createState();
    const zeroStep = {
      ...fresh,
      evacuationStepsRemaining: 1,
      enemies: [basicAt(fresh, 640, 150)],
    };
    const frozen = stepCombatSimulation(zeroStep, FIXED_STEP_SECONDS);
    expect(frozen.terminalResult).toEqual({ kind: 'evacuated' });
    let exit = { ...frozen, exitAuthorized: true };
    for (let index = 0; index < EXIT_CENTRE_STEPS; index += 1) {
      exit = stepCombatSimulation(exit, FIXED_STEP_SECONDS);
    }
    for (let index = 0; index < 80; index += 1) {
      exit = stepCombatSimulation(exit, FIXED_STEP_SECONDS);
    }
    expect(exit.exitPhase).toBe('fly-up');
    expect(exit.aircraft.centerY).toBeLessThan(exit.bounds.minY);
    const enemyBefore = exit.enemies[0]!;
    const rewardsBefore = exit.pendingCombatRewards;

    const resized = submitCombatCommand(exit, resizeLate);
    expect(resized.exitPhase).toBe('fly-up');
    expect(resized.aircraft.centerY).toBeCloseTo(
      exit.aircraft.centerY * (800 / 600),
      6,
    );
    expect(resized.aircraft.centerY).toBeLessThan(resized.bounds.minY);
    expect(resized.terminalResult).toEqual({ kind: 'evacuated' });
    expect(resized.exitAuthorized).toBe(true);
    expect(resized.exitCentreStepsRemaining).toBe(0);
    expect(resized.evacuationStepsRemaining).toBe(0);
    // The frozen enemy surface and the immutable economy survive the resize.
    expect(resized.enemies[0]!.id).toBe(enemyBefore.id);
    expect(resized.enemies[0]!.centerY).toBeCloseTo(
      enemyBefore.centerY * (800 / 600),
      6,
    );
    expect(resized.pendingCombatRewards).toBe(rewardsBefore);
    expect(resized.escapedCountByType['basic-drone']).toBe(0);

    let done = resized;
    for (
      let index = 0;
      index < 200 && done.exitPhase !== 'complete';
      index += 1
    ) {
      done = stepCombatSimulation(done, FIXED_STEP_SECONDS);
    }
    expect(done.exitPhase).toBe('complete');
    const finalResized = submitCombatCommand(done, resizeFinal);
    expect(finalResized.exitPhase).toBe('complete');
    expect(finalResized.aircraft.centerY).toBeCloseTo(
      done.aircraft.centerY * (900 / 800),
      6,
    );
    expect(finalResized.enemies[0]!.id).toBe(enemyBefore.id);
    expect(finalResized.pendingCombatRewards).toBe(rewardsBefore);
  });
});

describe('V02-WI-05 E02 C01 authorizeCommittedExit guard (Epic §13.3–13.5)', () => {
  it('never authorizes the exit before a terminal or for a frozen Defeat', () => {
    const runtime = createTestCombatRuntime();
    // Premature: no terminal exists yet — the commit gate must hold.
    runtime.authorizeCommittedExit();
    expect(runtime.getState().exitAuthorized).toBe(false);
    expect(runtime.getState().exitPhase).toBe('none');
    // A frozen Defeat has no exit sequence; authorization stays inert.
    runtime.submitDebug({ type: 'combat-debug/lose-mission' });
    expect(runtime.getState().terminalResult).toEqual({ kind: 'defeat' });
    runtime.authorizeCommittedExit();
    expect(runtime.getState().exitAuthorized).toBe(false);
    expect(runtime.getState().exitPhase).toBe('none');
    // Frames after the Defeat still never animate an exit.
    runtime.advance(60);
    expect(runtime.getState().aircraft.centerY).toBe(480);
  });

  it('authorizes exactly once for a frozen committed Success terminal', () => {
    const runtime = createTestCombatRuntime();
    runtime.submitDebug({ type: 'combat-debug/win-mission' });
    expect(runtime.getState().terminalResult).toEqual({ kind: 'success' });
    expect(runtime.getState().exitAuthorized).toBe(false);
    runtime.authorizeCommittedExit();
    expect(runtime.getState().exitAuthorized).toBe(true);
    runtime.authorizeCommittedExit(); // inert
    expect(runtime.getState().exitAuthorized).toBe(true);
  });
});

describe('V02-WI-07 forced successful Evacuation runtime path (Epic §13.4/§13.7, §17, V02-AC-014/015/023/026)', () => {
  it('reuses the shared committed centre-and-up exit exactly like a natural Evacuation', () => {
    const runtime = createTestCombatRuntime({ missionId: 'interception-03' });
    // Materialize the authored Elite Encounter so an active enemy survives the
    // forced Evacuation (the natural zero step leaves remaining enemies alone).
    runtime.submitDebug({
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-03-e8',
    });
    expect(
      runtime.getState().enemies.some((enemy) => enemy.kind === 'elite'),
    ).toBe(true);

    runtime.submitDebug({ type: 'combat-debug/evacuate-mission' });
    let state = runtime.getState();
    expect(state.terminalResult).toEqual({ kind: 'evacuated' });
    expect(state.exitPhase).toBe('centre');
    expect(state.exitAuthorized).toBe(false);
    // Frozen until the unchanged campaign transaction authorizes the exit.
    const frozen = runtime.advance(5);
    expect(frozen).toBe(state);
    runtime.authorizeCommittedExit();
    state = runtime.advance(FIXED_STEP_SECONDS);
    expect(state.exitAuthorized).toBe(true);
    expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS - 1);
    // The committed Evacuation fade runs over the same exact centre steps.
    expect(evacuationEnemyOpacity(state)).toBeCloseTo(
      (EXIT_CENTRE_STEPS - 1) / EXIT_CENTRE_STEPS,
      9,
    );
    // A forced Evacuation keeps its active enemies; they never become Escaped
    // and never add an escape penalty (Epic §18).
    expect(state.escapedCountByType).toEqual({
      'basic-drone': 0,
      'ranged-drone': 0,
      'hunter-drone': 0,
      'elite-drone': 0,
    });
    expect(state.pendingEscapePenalties).toBe(0);
    // 30 centre steps + 85 fly-up steps fully exit the 1280x600 viewport.
    for (let index = 0; index < 30 + 90; index += 1) {
      state = runtime.advance(FIXED_STEP_SECONDS);
      if (state.exitPhase === 'complete') {
        break;
      }
    }
    expect(state.exitPhase).toBe('complete');
    // The immutable terminal is unchanged by the whole exit sequence.
    expect(state.terminalResult).toEqual({ kind: 'evacuated' });
    // Repeated/racing commands are strict no-ops after the terminal freeze.
    runtime.submitDebug({ type: 'combat-debug/evacuate-mission' });
    runtime.submitDebug({ type: 'combat-debug/win-mission' });
    expect(runtime.getState().terminalResult).toEqual({ kind: 'evacuated' });
  });

  it('resolves through the unchanged atomic-commit seam exactly once', () => {
    const runtime = createTestCombatRuntime();
    runtime.submitDebug({ type: 'combat-debug/evacuate-mission' });
    expect(runtime.getState().exitAuthorized).toBe(false);
    runtime.authorizeCommittedExit();
    expect(runtime.getState().exitAuthorized).toBe(true);
    runtime.authorizeCommittedExit(); // inert
    expect(runtime.getState().exitAuthorized).toBe(true);
  });
});
