import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  ELITE_DRONE,
  HUNTER_DRONE,
  INTERCEPTION_03,
  RANGED_DRONE,
  enemyRenderedBounds,
} from '@application/content';
import { createEliteMovementStream } from '@domain/random';
import {
  TEST_MISSION_SEED,
  TEST_VIEWPORT,
  createTestCombatState,
} from '@test-support/domain';
import {
  EXIT_CENTRE_STEPS,
  FIXED_STEP_SECONDS,
  FIXED_STEPS_PER_SECOND,
  applyDebugCommand,
  stepCombatSimulation,
  submitCombatCommand,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import { drawEliteMovementDecision } from './enemies';
import type { EliteEnemyState } from './enemies';

/**
 * V02-WI-06 E03 — the production Mission 03 Elite vertical (Epic §8.3–8.3.1,
 * §9.4, §11.3, §12, §13.3, V02-AC-005/009/010/013, V02-DEC-032/033).
 *
 * Every assertion runs the REAL fixed-step pipeline over the REAL validated
 * Mission 03 content: the authored eight-Encounter staging, the 05:20 Elite
 * creation step, the Elite's stable authored mission-member ordinal and
 * `elite-movement` stream, the Countdown reaching `00:00` on exactly that step,
 * active Combat continuing while the Elite lives, the `+8` player-projectile
 * reward with no contact reward and no duplicate accounting, the canonical
 * `35`/`51` maximums, generic Success after the final group resolves, and
 * same-step Defeat priority. The `god-mode` Debug command is consumed as an
 * existing development-only test seam so the run reaches 05:20 without the
 * player dying to unauthored autopilot behaviour; it changes no Elite,
 * economy, terminal, or presentation rule.
 */

/** 13 Basic + 4 Ranged + 3 Hunter members precede the one Elite. */
const ELITE_ORDINAL = 20;
/** The final authored group's exact `05:20` fixed step (Epic §8.3.1). */
const ELITE_CREATION_STEP = 320 * FIXED_STEPS_PER_SECOND;

function eliteIn(state: CombatSimulationState): EliteEnemyState | null {
  const elite = state.enemies.find((enemy) => enemy.kind === 'elite');
  return elite === undefined ? null : elite;
}

/** One deterministic test-side player step applied before the fixed step. */
type PlayerStepper = (state: CombatSimulationState) => CombatSimulationState;

/**
 * Deterministic test-side autopilot: aims the Aircraft at the Elite's current
 * centre X plus its measured per-step horizontal velocity times the player
 * projectile's flight steps, so automatic fire leads the moving Elite. The
 * Aircraft keeps its current Y and no gameplay value is written: the only
 * simulation input is the same `combat/pointer-move` command a player produces.
 */
function createEliteTrackingStepper(): PlayerStepper {
  let previousEliteX: number | null = null;
  return (state) => {
    const elite = eliteIn(state);
    if (elite === null) {
      previousEliteX = null;
      return state;
    }
    const velocityPerStep =
      previousEliteX === null ? 0 : elite.centerX - previousEliteX;
    previousEliteX = elite.centerX;
    const distance = Math.max(0, state.aircraft.centerY - elite.centerY);
    const flightSteps =
      distance / (0.55 * state.viewportHeight * FIXED_STEP_SECONDS);
    const targetX = elite.centerX + velocityPerStep * flightSteps;
    return submitCombatCommand(state, {
      type: 'combat/pointer-move',
      x: Math.min(Math.max(targetX, 0), state.viewportWidth),
      y: state.aircraft.centerY,
    });
  };
}

/**
 * One real fixed step preceded by the optional test-side player stepper.
 */
function stepTrackedElite(
  state: CombatSimulationState,
  stepper: PlayerStepper | null,
): CombatSimulationState {
  const prepared = stepper === null ? state : stepper(state);
  return stepCombatSimulation(prepared, FIXED_STEP_SECONDS);
}

/**
 * Advances the real pipeline by `steps` fixed steps (with God Mode already
 * enabled by the caller) under the optional test-side player stepper.
 */
function runSteps(
  state: CombatSimulationState,
  steps: number,
  stepper: PlayerStepper | null = null,
): CombatSimulationState {
  let current = state;
  for (let step = 0; step < steps; step += 1) {
    current = stepTrackedElite(current, stepper);
  }
  return current;
}

/**
 * Steps the real pipeline until `predicate` holds or the bounded budget is
 * exhausted, returning the state BEFORE the resolving step and the resolving
 * state itself.
 */
function runUntil(
  state: CombatSimulationState,
  predicate: (state: CombatSimulationState) => boolean,
  maxSteps: number,
  stepper: PlayerStepper | null = null,
): {
  readonly previous: CombatSimulationState;
  readonly current: CombatSimulationState;
  readonly steps: number;
} {
  let current = state;
  let previous = state;
  let steps = 0;
  while (steps < maxSteps && !predicate(current)) {
    previous = current;
    current = stepTrackedElite(current, stepper);
    steps += 1;
  }
  return { previous, current, steps };
}

function createMission03State(): CombatSimulationState {
  return applyDebugCommand(
    createTestCombatState({ missionId: 'interception-03' }),
    { type: 'combat-debug/god-mode', enabled: true },
  );
}

describe('Mission 03 production Elite vertical (Epic §8.3.1, §9.4, V02-WI-06 E03)', () => {
  it('resolves the exact authored Mission 03 Arrival Groups, member ordinals, and Countdown from the production catalogue', () => {
    const state = createTestCombatState({ missionId: 'interception-03' });
    expect(state.enemyPlan.missionId).toBe('interception-03');
    expect(state.finalArrivalTimeSeconds).toBe(320);
    // The flattened authored runtime plan: encounter id + exact fixed step.
    expect(
      state.arrivalGroups.map((group) => [
        group.encounterId,
        group.stepIndex,
        group.members.length,
      ]),
    ).toEqual([
      ['interception-03-e1', 10 * FIXED_STEPS_PER_SECOND, 3],
      ['interception-03-e1', 12 * FIXED_STEPS_PER_SECOND, 1],
      ['interception-03-e2', 55 * FIXED_STEPS_PER_SECOND, 3],
      ['interception-03-e3', 95 * FIXED_STEPS_PER_SECOND, 3],
      ['interception-03-e3', 97 * FIXED_STEPS_PER_SECOND, 1],
      ['interception-03-e4', 140 * FIXED_STEPS_PER_SECOND, 4],
      ['interception-03-e5', 190 * FIXED_STEPS_PER_SECOND, 2],
      ['interception-03-e6', 235 * FIXED_STEPS_PER_SECOND, 2],
      ['interception-03-e7', 275 * FIXED_STEPS_PER_SECOND, 1],
      ['interception-03-e8', ELITE_CREATION_STEP, 1],
    ]);
    // Stable zero-based authored mission-member ordinals: the one Elite is the
    // LAST authored member, so only ordinal 20 owns an `elite-movement` stream.
    const ordinals = state.arrivalGroups.flatMap((group) =>
      group.members.map((member) => [member.type, member.ordinal]),
    );
    expect(ordinals).toHaveLength(21);
    expect(ordinals.filter(([, ordinal]) => ordinal === ELITE_ORDINAL)).toEqual(
      [['elite-drone', ELITE_ORDINAL]],
    );
    expect(state.eliteMovementStreams).toHaveProperty('20');
    expect(Object.keys(state.eliteMovementStreams)).toEqual(['20']);
    // The four authored Ranged members keep their own independent fire streams.
    expect(Object.keys(state.rangedFireStreams).sort()).toEqual([
      '12',
      '13',
      '3',
      '8',
    ]);
    // The Countdown starts at the authored 05:20 final arrival.
    expect(state.countdownSeconds).toBe(320);
  });

  it('creates the one authored Elite only on the exact 05:20 step, at its Top Entry position, with its ordinal and stream', () => {
    const before = runSteps(createMission03State(), ELITE_CREATION_STEP - 1);
    expect(eliteIn(before)).toBeNull();
    // The Countdown reaches exactly 1 on the step before the final group and is
    // still counting down: the Elite has not been created yet.
    expect(before.countdownSeconds).toBe(1);
    expect(before.arrivalGroupIndex).toBe(9);

    const created = runSteps(before, 1);
    expect(created.missionStepCount).toBe(ELITE_CREATION_STEP);
    // The Countdown reaches `00:00` on exactly the Elite creation step (§15.2).
    expect(created.countdownSeconds).toBe(0);
    const elite = eliteIn(created);
    if (elite === null) {
      throw new Error('Mission 03 must create its Elite on the 05:20 step.');
    }
    expect(elite.ordinal).toBe(ELITE_ORDINAL);
    expect(elite.phase).toBe('entering');
    expect(elite.activated).toBe(false);
    expect(elite.hullIntegrity).toBe(ELITE_DRONE.maximumHullIntegrity);
    expect(elite.phaseStepsElapsed).toBe(0);
    expect(elite.attackStepsRemaining).toBe(0);
    expect(elite.horizontalDirection).toBeNull();
    // Fully above the Top boundary with the nearest complete-bounds edge
    // touching it, centred on the authored 50% VW anchor X (§9.4).
    const armouredBounds = enemyRenderedBounds(
      ELITE_DRONE.armouredVisualGeometry,
      Math.min(TEST_VIEWPORT.width, TEST_VIEWPORT.height),
    );
    expect(elite.width).toBeCloseTo(armouredBounds.widthPx, 10);
    expect(elite.height).toBeCloseTo(armouredBounds.heightPx, 10);
    expect(elite.centerX).toBeCloseTo(TEST_VIEWPORT.width * 0.5, 10);
    expect(elite.centerY).toBeCloseTo(-armouredBounds.heightPx / 2, 10);
    // Creation consumes no `elite-movement` draw: activation owns it.
    expect(elite.movementDecisionStepsRemaining).toBe(0);

    // The Elite then descends and activates at the fixed anchor, consuming the
    // ordinal-20 `elite-movement` stream in the canonical draw order.
    const activated = runUntil(
      created,
      (state) => eliteIn(state)?.activated === true,
      400,
    );
    expect(activated.steps).toBeGreaterThan(0);
    const active = eliteIn(activated.current);
    expect(active?.activated).toBe(true);
    expect(active?.phase).toBe('armoured');
    expect(active?.centerX).toBeCloseTo(TEST_VIEWPORT.width * 0.5, 10);
    expect(active?.centerY).toBeCloseTo(TEST_VIEWPORT.height * 0.2, 10);
    // The first decision is exactly the ordinal-20 stream's direction + interval.
    const expectedFirst = drawEliteMovementDecision(
      createEliteMovementStream(TEST_MISSION_SEED, ELITE_ORDINAL),
    );
    expect(active?.horizontalDirection).toBe(expectedFirst.direction);
    expect(active?.movementDecisionStepsRemaining).toBe(
      expectedFirst.intervalSteps,
    );
    // Active Combat continues and the Countdown stays at `00:00`.
    expect(activated.current.countdownSeconds).toBe(0);
    expect(activated.current.terminalResult).toBeNull();
  });

  it('awards exactly +8 for one player-projectile Elite destruction and resolves generic Mission 03 Success with the canonical 35/51 maximums (V02-AC-009/013)', () => {
    const created = runSteps(createMission03State(), ELITE_CREATION_STEP);
    expect(eliteIn(created)).not.toBeNull();
    const resolved = runUntil(
      created,
      (state) => state.destroyedCountByType['elite-drone'] === 1,
      18000,
      createEliteTrackingStepper(),
    );
    expect(resolved.steps).toBeLessThan(18000);
    const after = resolved.current;
    expect(eliteIn(after)).toBeNull();
    expect(after.destroyedCountByType['elite-drone']).toBe(1);
    // Contact never damages or destroys the Elite and grants no reward (§11.3).
    expect(after.destroyedByContactCountByType['elite-drone']).toBe(0);
    expect(after.escapedCountByType['elite-drone']).toBe(0);
    expect(after.eliteDeflectionFeedbacks).toEqual({});
    // Every authored group was spawned and every required enemy resolved, so the
    // generic Success condition (§7.3) holds without any Mission 03 special case.
    expect(after.arrivalGroupIndex).toBe(after.arrivalGroups.length);
    expect(after.enemies).toHaveLength(0);
    // Economy: rewards are exactly the content per-role values for the members
    // destroyed by player projectiles; the one Elite contributes exactly +8 and
    // no contact destruction (the Hunter kamikaze exception) is ever rewarded.
    const expectedRewards =
      after.destroyedCountByType['basic-drone'] *
        BASIC_DRONE.playerDestructionReward +
      after.destroyedCountByType['ranged-drone'] *
        RANGED_DRONE.playerDestructionReward +
      (after.destroyedCountByType['hunter-drone'] -
        after.destroyedByContactCountByType['hunter-drone']) *
        HUNTER_DRONE.playerDestructionReward +
      after.destroyedCountByType['elite-drone'] *
        ELITE_DRONE.playerDestructionReward;
    expect(ELITE_DRONE.playerDestructionReward).toBe(8);
    expect(after.pendingCombatRewards).toBe(expectedRewards);
    expect(after.pendingCombatRewards).toBeGreaterThanOrEqual(8);
    // The canonical maximum combat reward 35: the Elite's +8 plus the 27 Credits
    // of the 20 regular members. Destroyed rewards and escape penalties are equal
    // per regular role, and a Hunter destroyed by kamikaze contact contributes
    // zero of both — so the three terms below always reconstruct exactly 35.
    const contactHunterLoss =
      after.destroyedByContactCountByType['hunter-drone'] *
      HUNTER_DRONE.playerDestructionReward;
    expect(
      expectedRewards + after.pendingEscapePenalties + contactHunterLoss,
    ).toBe(35);
    expect(INTERCEPTION_03.maximumCombatReward).toBe(35);
    expect(INTERCEPTION_03.maximumSuccessPayout).toBe(51);
    expect(INTERCEPTION_03.maximumSuccessPayout).toBe(
      INTERCEPTION_03.maximumCombatReward + INTERCEPTION_03.completionReward,
    );
    // Generic committed Success with the shared 0.5 s centre exit phase; the
    // campaign transaction owns the +16 completion reward and persistence.
    expect(after.terminalResult).toEqual({ kind: 'success' });
    expect(after.exitPhase).toBe('centre');
    expect(after.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);

    // Exactly-once: no later step may duplicate reward, count, or terminal.
    const settled = runSteps(after, EXIT_CENTRE_STEPS + 120);
    expect(settled.pendingCombatRewards).toBe(after.pendingCombatRewards);
    expect(settled.pendingEscapePenalties).toBe(after.pendingEscapePenalties);
    expect(settled.destroyedCountByType).toEqual(after.destroyedCountByType);
    expect(settled.terminalResult).toEqual({ kind: 'success' });
    expect(eliteIn(settled)).toBeNull();
  });

  it('same-step Defeat retains unconditional priority over the resolved Elite Success (Epic §11.4, V02-AC-013)', () => {
    const created = runSteps(createMission03State(), ELITE_CREATION_STEP);
    const resolved = runUntil(
      created,
      (state) => state.destroyedCountByType['elite-drone'] === 1,
      18000,
      createEliteTrackingStepper(),
    );
    const success = resolved.current;
    expect(success.terminalResult).toEqual({ kind: 'success' });
    expect(success.enemies).toHaveLength(0);
    // The SAME authoritative post-collision step with the Aircraft defeated by
    // that step's damage pass: every Success condition is satisfied, and Defeat
    // still wins because it is evaluated first (§11.4).
    const tied: CombatSimulationState = {
      ...success,
      terminalResult: null,
      exitPhase: 'none',
      exitCentreStepsRemaining: 0,
      exitAuthorized: false,
      playerDefeated: true,
      playerHullIntegrity: 0,
    };
    const resolvedDefeat = stepCombatSimulation(tied, FIXED_STEP_SECONDS);
    expect(resolvedDefeat.terminalResult).toEqual({ kind: 'defeat' });
    // The Elite stays destroyed exactly once; no reward or count is duplicated.
    expect(resolvedDefeat.destroyedCountByType['elite-drone']).toBe(1);
    expect(resolvedDefeat.pendingCombatRewards).toBe(
      success.pendingCombatRewards,
    );
  });
});
