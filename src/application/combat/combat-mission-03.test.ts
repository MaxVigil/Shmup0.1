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
  createTestCombatRuntime,
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
import type { CombatEnemy, EliteEnemyState } from './enemies';
import { resolveMissionEncounters } from '../mission';
import type { MissionEncounterPlan, ResolvedEncounter } from '../mission';

/** One resolved Arrival Group of a mission's encounter plan. */
type PlanArrivalGroup = NonNullable<ResolvedEncounter['staging']>[number];

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
 * `736`/`752` maximums, generic Success after the final group resolves, and
 * same-step Defeat priority. The `god-mode` Debug command is consumed as an
 * existing development-only test seam so the run reaches 05:20 without the
 * player dying to unauthored autopilot behaviour; it changes no Elite,
 * economy, terminal, or presentation rule.
 */

/**
 * V021-PATCH-DEP-01-C01: explicit, bounded per-test allowance for this file's
 * heavy Mission 03 Elite tests. Each drives the real fixed-step pipeline through
 * tens of thousands of steps to the authored 05:20 Elite (0.4–0.6 s alone; the
 * measured worst single phase is 1 562 ms for 57 750 steps), while Vitest's
 * default `5_000 ms` test budget measures wall clock. Under the complete
 * 102-file parallel run the measured per-test wall clock inflates (5 500 ms for
 * one of these tests here at eight-times CPU oversubscription), so they failed
 * the aggregate gate with spurious `Test timed out in 5000ms` results while every
 * assertion held. The allowance is file-local and bounded: no global
 * timeout/worker setting, assertion, fixture or authored-content claim changes,
 * and the value still expires, so a genuinely hanging test can never be masked.
 * The multiplier follows the bounded-allowance convention the real-Phaser suites
 * already use for their bootstrap hook.
 */
const AGGREGATE_LOAD_TEST_TIMEOUT_MS = 30_000;

/** 552 §2.3 regular members precede the one Elite (zero-based ordinal 552). */
const ELITE_ORDINAL = 552;
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
    // The flattened authored runtime plan: 44 §2.3 regular formations expanded
    // into 123 Arrival Group rows plus the preserved Elite-only `05:20` group.
    expect(state.arrivalGroups).toHaveLength(124);
    expect(
      state.arrivalGroups.reduce(
        (total, group) => total + group.members.length,
        0,
      ),
    ).toBe(553);
    const groupsByEncounter = new Map<string, number[]>();
    for (const group of state.arrivalGroups) {
      const steps = groupsByEncounter.get(group.encounterId) ?? [];
      steps.push(group.stepIndex);
      groupsByEncounter.set(group.encounterId, steps);
    }
    expect(
      [...groupsByEncounter].map(([id, steps]) => [id, steps.length]),
    ).toEqual([
      ['interception-03-e1', 18],
      ['interception-03-e2', 18],
      ['interception-03-e3', 16],
      ['interception-03-e4', 19],
      ['interception-03-e5', 16],
      ['interception-03-e6', 16],
      ['interception-03-e7', 20],
      ['interception-03-e8', 1],
    ]);
    // The first regular row enters at 00:10 and the final authored group is the
    // untouched Elite-only `05:20` group.
    expect(state.arrivalGroups[0]).toMatchObject({
      encounterId: 'interception-03-e1',
      stepIndex: 10 * FIXED_STEPS_PER_SECOND,
    });
    const lastGroup = state.arrivalGroups[state.arrivalGroups.length - 1]!;
    expect(lastGroup.encounterId).toBe('interception-03-e8');
    expect(lastGroup.stepIndex).toBe(ELITE_CREATION_STEP);
    expect(lastGroup.members).toEqual([
      {
        type: 'elite-drone',
        placement: { kind: 'top', engagementBandFraction: 0.5 },
        ordinal: ELITE_ORDINAL,
      },
    ]);
    // Stable zero-based authored mission-member ordinals: 552 regulars precede
    // the one Elite, so only ordinal 552 owns an `elite-movement` stream.
    const ordinals = state.arrivalGroups.flatMap((group) =>
      group.members.map((member) => [member.type, member.ordinal] as const),
    );
    expect(ordinals).toHaveLength(553);
    expect(ordinals[0]).toEqual(['basic-drone', 0]);
    expect(ordinals[ELITE_ORDINAL]).toEqual(['elite-drone', ELITE_ORDINAL]);
    expect(ordinals.filter(([, ordinal]) => ordinal === ELITE_ORDINAL)).toEqual(
      [['elite-drone', ELITE_ORDINAL]],
    );
    expect(state.eliteMovementStreams).toHaveProperty('552');
    expect(Object.keys(state.eliteMovementStreams)).toEqual(['552']);
    // The 128 authored Ranged members keep their own independent fire streams.
    const rangedOrdinals = ordinals
      .filter(([type]) => type === 'ranged-drone')
      .map(([, ordinal]) => ordinal);
    expect(rangedOrdinals).toHaveLength(128);
    expect(
      Object.keys(state.rangedFireStreams)
        .map((key) => Number(key))
        .sort((a, b) => a - b),
    ).toEqual(rangedOrdinals);
    // The Countdown starts at the authored 05:20 final arrival.
    expect(state.countdownSeconds).toBe(320);
  });

  it(
    'creates the one authored Elite only on the exact 05:20 step, at its Top Entry position, with its ordinal and stream',
    () => {
      const before = runSteps(createMission03State(), ELITE_CREATION_STEP - 1);
      expect(eliteIn(before)).toBeNull();
      // The Countdown reaches exactly 1 on the step before the final group and is
      // still counting down: the Elite has not been created yet.
      expect(before.countdownSeconds).toBe(1);
      expect(before.arrivalGroupIndex).toBe(123);

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
    },
    AGGREGATE_LOAD_TEST_TIMEOUT_MS,
  );

  it(
    'awards exactly +8 for one player-projectile Elite destruction and resolves generic Mission 03 Success with the canonical 35/51 maximums (V02-AC-009/013)',
    () => {
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
      // The canonical maximum combat reward 736: the Elite's +8 plus the 728
      // Credits of the 552 regular members (376 Basic × 1 + 128 Ranged × 2 +
      // 48 Hunter × 2). Destroyed rewards and escape penalties are equal per
      // regular role, and a Hunter destroyed by kamikaze contact contributes zero
      // of both — so the three terms below always reconstruct exactly 736.
      const contactHunterLoss =
        after.destroyedByContactCountByType['hunter-drone'] *
        HUNTER_DRONE.playerDestructionReward;
      expect(
        expectedRewards + after.pendingEscapePenalties + contactHunterLoss,
      ).toBe(736);
      expect(INTERCEPTION_03.maximumCombatReward).toBe(736);
      expect(INTERCEPTION_03.maximumSuccessPayout).toBe(752);
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
    },
    AGGREGATE_LOAD_TEST_TIMEOUT_MS,
  );

  it(
    'same-step Defeat retains unconditional priority over the resolved Elite Success (Epic §11.4, V02-AC-013)',
    () => {
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
    },
    AGGREGATE_LOAD_TEST_TIMEOUT_MS,
  );

  it(
    'materializes the exact §2.3 plan through the real runtime: 124 groups, 553 ordered members, zero draws, and representative fixed-side Hunter geometry at 1280×600 (V021-AC-001)',
    () => {
      const runtime = createTestCombatRuntime({ missionId: 'interception-03' });
      // God Mode keeps the Aircraft operational across the complete 05:20 schedule
      // so every authored creation step is observed; it changes no spawn,
      // placement, member order, or RNG consumption.
      runtime.submitDebug({ type: 'combat-debug/god-mode', enabled: true });
      const plan: MissionEncounterPlan = resolveMissionEncounters(
        INTERCEPTION_03,
        TEST_MISSION_SEED,
        FIXED_STEP_SECONDS,
      );
      const groups: {
        readonly encounterId: string;
        readonly group: PlanArrivalGroup;
        readonly firstOrdinal: number;
      }[] = [];
      let ordinal = 0;
      for (const encounter of plan.encounters) {
        for (const group of encounter.staging ?? []) {
          groups.push({
            encounterId: encounter.encounterId,
            group,
            firstOrdinal: ordinal,
          });
          ordinal += group.members.length;
        }
      }
      expect(groups).toHaveLength(124);
      expect(ordinal).toBe(553);
      expect(runtime.getState().viewportWidth).toBe(1280);
      expect(runtime.getState().viewportHeight).toBe(600);

      /** The first authored Hunter wave (e3 01:35 `RH6-16`) at its creation. */
      let firstHunterWave: readonly CombatEnemy[] | null = null;
      let state = runtime.getState();
      for (const [groupIndex, entry] of groups.entries()) {
        // Advance the real fixed clock to the step immediately before this
        // group's authored creation step.
        while (state.missionStepCount < entry.group.stepIndex - 1) {
          state = runtime.advance(FIXED_STEP_SECONDS);
        }
        expect(state.arrivalGroupIndex).toBe(groupIndex);
        const created = runtime.advance(FIXED_STEP_SECONDS);
        expect(created.missionStepCount).toBe(entry.group.stepIndex);
        expect(created.missionTimeSeconds).toBeCloseTo(
          entry.group.timeSeconds,
          9,
        );
        expect(created.countdownSeconds).toBe(
          Math.ceil(320 - entry.group.timeSeconds),
        );
        expect(created.arrivalGroupIndex).toBe(groupIndex + 1);
        expect(created.currentEncounterId).toBe(entry.encounterId);
        const ids = entry.group.members.map(
          (_, index) => entry.firstOrdinal + index,
        );
        expect(created.nextEnemyId).toBe(
          entry.firstOrdinal + entry.group.members.length,
        );
        const spawned = created.enemies.filter((enemy) =>
          ids.includes(enemy.id),
        );
        expect(spawned.map((enemy) => enemy.id)).toEqual(ids);
        expect(spawned.map((enemy) => enemy.type)).toEqual(
          entry.group.members.map((member) => member.type),
        );
        expect(spawned.map((enemy) => enemy.ordinal)).toEqual(ids);
        for (const [memberIndex, member] of entry.group.members.entries()) {
          const enemy = spawned[memberIndex];
          if (enemy === undefined) {
            throw new Error('Mission 03 runtime evidence: missing member.');
          }
          if (member.type === 'elite-drone') {
            // The Elite owns its own Armoured entry geometry (Epic §9.4) and is not
            // part of the regular bounds table; its authored `0.50` Top arrival is
            // the mission's final member.
            const armoured = enemyRenderedBounds(
              ELITE_DRONE.armouredVisualGeometry,
              Math.min(created.viewportWidth, created.viewportHeight),
            );
            expect(enemy.entry).toBe('top');
            expect(enemy.width).toBeCloseTo(armoured.widthPx, 10);
            expect(enemy.height).toBeCloseTo(armoured.heightPx, 10);
            expect(enemy.centerY).toBeCloseTo(-armoured.heightPx / 2, 10);
            expect(enemy.centerX).toBeCloseTo(created.viewportWidth * 0.5, 10);
            continue;
          }
          const bounds = created.enemyBoundsByType[member.type];
          if (member.placement.kind === 'top') {
            const band = created.bounds;
            expect(enemy.entry).toBe('top');
            expect(enemy.centerY).toBe(-bounds.height / 2);
            const fraction =
              (enemy.centerX - band.minX) / (band.maxX - band.minX);
            expect(fraction).toBeCloseTo(
              member.placement.engagementBandFraction,
              9,
            );
          } else {
            const side = member.placement.side;
            expect(enemy.entry).toBe(side);
            // A Hunter's per-step AABB is the enclosing rectangle of the
            // configured rectangle at its side-entry heading (patch §3), so the
            // AABB keeps width = configured height and height = configured width.
            if (enemy.kind === 'hunter') {
              expect(enemy.width).toBeCloseTo(bounds.height, 9);
              expect(enemy.height).toBeCloseTo(bounds.width, 9);
            } else {
              expect(enemy.width).toBe(bounds.width);
              expect(enemy.height).toBe(bounds.height);
            }
            expect(enemy.centerX).toBe(
              side === 'upper-left'
                ? -enemy.width / 2
                : created.viewportWidth + enemy.width / 2,
            );
            expect(enemy.centerY).toBe(
              member.placement.yViewportFraction * created.viewportHeight,
            );
          }
          expect(enemy.hullIntegrity).toBe(
            created.enemyDefsByType[member.type].maximumHullIntegrity,
          );
        }
        if (
          firstHunterWave === null &&
          spawned.some((e) => e.kind === 'hunter')
        ) {
          firstHunterWave = spawned;
        }
        state = created;
      }
      expect(state.nextEnemyId).toBe(553);
      expect(state.arrivalGroupIndex).toBe(124);

      // Representative fixed-side Hunter evidence at 1280×600 (patch §2.3): the
      // first authored wave is e3's 01:35 `RH6-16` — six Top Basics followed by
      // three Hunters per side (left side first, each side in ascending Y), each
      // centre just outside its own boundary and its centre Y at `fraction × 600`.
      if (firstHunterWave === null) {
        throw new Error(
          'Mission 03 runtime evidence: no Hunter wave captured.',
        );
      }
      const hunters = firstHunterWave.filter(
        (enemy) => enemy.kind === 'hunter',
      );
      expect(hunters).toHaveLength(6);
      expect(hunters.map((enemy) => enemy.entry)).toEqual([
        'upper-left',
        'upper-left',
        'upper-left',
        'upper-right',
        'upper-right',
        'upper-right',
      ]);
      expect(hunters.map((enemy) => enemy.centerY)).toEqual([
        0.1 * 600,
        0.2 * 600,
        0.3 * 600,
        0.1 * 600,
        0.2 * 600,
        0.3 * 600,
      ]);
      expect(hunters.slice(0, 3).map((enemy) => enemy.centerX)).toEqual(
        hunters.slice(0, 3).map((enemy) => -enemy.width / 2),
      );
      expect(hunters.slice(3).map((enemy) => enemy.centerX)).toEqual(
        hunters.slice(3).map((enemy) => 1280 + enemy.width / 2),
      );

      // Mission 03 authors every regular member as a Top row or a fixed-side
      // Hunter, so resolution consumes ZERO `mission-data` draws: an unrelated
      // mission seed materializes the identical authored plan.
      const otherSeed = createTestCombatRuntime({
        missionId: 'interception-03',
        missionSeed: 0x11111111,
      });
      expect(
        otherSeed.getState().arrivalGroups.map((group) => group.members),
      ).toEqual(runtime.getState().arrivalGroups.map((group) => group.members));
      expect(otherSeed.getState().enemyPlan).toEqual(
        runtime.getState().enemyPlan,
      );
    },
    AGGREGATE_LOAD_TEST_TIMEOUT_MS,
  );
});
