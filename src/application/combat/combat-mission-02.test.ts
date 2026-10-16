import { describe, expect, it } from 'vitest';
import { INTERCEPTION_02 } from '@content/index';
import { CANNON } from '@content/weapons';
import type { EnemyType } from '@domain/index';
import {
  createTestCombatRuntime,
  createTestCombatState,
  TEST_MISSION_SEED,
} from '@test-support/domain';
import type { CombatSimulationRuntime } from '@application/combat';
import { resolveMissionEncounters } from '../mission';
import type { MissionEncounterPlan } from '../mission';
import {
  FIXED_STEP_SECONDS,
  stepCombatSimulation,
  submitCombatCommand,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import { hunterMaxTurnPerStep, hunterTravelVector } from './enemies';
import type { CombatEnemy } from './enemies';

/**
 * V02-WI-05 M02-R01 Mission 02 runtime-consumption evidence (Epic §8.2–8.2.1,
 * §13, §15.2, V02-DEC-018/026, V02-AC-003/005/006/023).
 *
 * The exhaustive Mission 02 authored content and its deterministic resolution
 * are owned by `src/content/missions/missions-exact.test.ts` and
 * `src/application/mission/encounter-resolution.test.ts`. This file adds only
 * the missing boundary evidence: the GENERIC Combat runtime materializes that
 * validated plan verbatim, creates all six Encounters and all 112 Arrival
 * Groups on their exact fixed steps with the authored ordered members,
 * offsets, normalized placements and stable ordinals, projects Top members
 * inside the current engagement band without consuming RNG, keeps the plan
 * immune to Aircraft/Hull/loadout state, holds the Countdown at `00:00` after
 * the single `04:20` step, and freezes the exact terminal payload.
 *
 * No mission-specific schedule, simulation, formation, RNG, or collision owner
 * is introduced: every assertion runs the same runtime path that owns Mission
 * 01 with the Mission 02 read-only content input.
 */
/**
 * V021-PATCH-DEP-01-C01: explicit, bounded per-test allowance for this file's
 * heavy Mission 02 runtime test. It resolves and replays all 112 authored
 * Arrival Groups through the real pipeline, so its own wall clock is already
 * ~0.85 s alone, while Vitest's default `5_000 ms` test budget measures wall
 * clock. Under the complete 102-file parallel run the measured per-test wall
 * clock inflates (this test reached 5 057 ms here at eight-times CPU
 * oversubscription, and the parent gate recorded the same class at host load
 * 10.39), so it failed the aggregate gate with a spurious
 * `Test timed out in 5000ms` while every assertion held. The allowance is
 * file-local and bounded: no global timeout/worker setting, assertion, fixture
 * or authored-content claim changes, and the value still expires, so a genuinely
 * hanging test can never be masked. The multiplier follows the bounded-allowance
 * convention the real-Phaser suites already use for their bootstrap hook.
 */
const AGGREGATE_LOAD_TEST_TIMEOUT_MS = 30_000;

const MISSION_02 = 'interception-02';

const stepIndexFor = (seconds: number): number =>
  Math.round(seconds / FIXED_STEP_SECONDS);

type PlacementEvidence =
  | { readonly kind: 'top'; readonly engagementBandFraction: number }
  | {
      readonly kind: 'side';
      readonly side: 'upper-left' | 'upper-right';
      readonly yViewportFraction: number;
    };

interface FlatGroupEvidence {
  readonly encounterId: string;
  readonly stepIndex: number;
  readonly timeSeconds: number;
  readonly offsetSeconds: number;
  readonly members: readonly {
    readonly type: EnemyType;
    readonly placement: PlacementEvidence;
    readonly ordinal: number;
  }[];
}

/** The public flattening contract of the runtime's authored arrival plan. */
function flatGroups(plan: MissionEncounterPlan): readonly FlatGroupEvidence[] {
  let ordinal = 0;
  return plan.encounters.flatMap((encounter) =>
    (encounter.staging ?? []).map((group) => ({
      encounterId: encounter.encounterId,
      stepIndex: group.stepIndex,
      timeSeconds: group.timeSeconds,
      offsetSeconds: group.offsetSeconds,
      members: group.members.map((member) => ({
        type: member.type,
        placement: member.placement,
        ordinal: ordinal++,
      })),
    })),
  );
}

/** Zero-based global member ordinal of `members[memberIndex]` in `groups`. */
function memberOrdinalAt(
  groups: readonly FlatGroupEvidence[],
  groupIndex: number,
  memberIndex: number,
): number {
  let ordinal = 0;
  for (let index = 0; index < groupIndex; index += 1) {
    ordinal += groups[index]?.members.length ?? 0;
  }
  return ordinal + memberIndex;
}

function missionPlan(): MissionEncounterPlan {
  return resolveMissionEncounters(
    INTERCEPTION_02,
    TEST_MISSION_SEED,
    FIXED_STEP_SECONDS,
  );
}

/** Runs exactly one authoritative fixed step through the runtime. */
function stepRuntime(runtime: CombatSimulationRuntime): CombatSimulationState {
  return runtime.advance(FIXED_STEP_SECONDS);
}

function advanceToStep(
  runtime: CombatSimulationRuntime,
  missionStepCount: number,
): CombatSimulationState {
  let state = runtime.getState();
  while (state.missionStepCount < missionStepCount) {
    state = stepRuntime(runtime);
  }
  return state;
}

/**
 * Steps a crafted authoritative state until the predicate holds, returning the
 * matching state and the number of executed steps. Throws when the bound is
 * exceeded so a broken runtime fails loudly instead of looping.
 */
function stepStateUntil(
  state: CombatSimulationState,
  maximumSteps: number,
  predicate: (state: CombatSimulationState) => boolean,
): { readonly state: CombatSimulationState; readonly steps: number } {
  let current = state;
  for (let steps = 1; steps <= maximumSteps; steps += 1) {
    current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    if (predicate(current)) {
      return { state: current, steps };
    }
  }
  throw new Error(
    `Mission 02 runtime evidence: predicate did not hold within ${maximumSteps} steps.`,
  );
}

function enemyById(
  state: CombatSimulationState,
  id: number,
): CombatEnemy | undefined {
  return state.enemies.find((enemy) => enemy.id === id);
}

/**
 * Crafted authoritative enemy fixture at an explicit complete-bounds centre
 * (the existing E02 evidence pattern): used only for a same-step terminal
 * priority and frozen-payload fixture, never as a gameplay path.
 */
function forgedEnemy(
  state: CombatSimulationState,
  type: EnemyType,
  centerX: number,
  centerY: number,
): CombatEnemy {
  const bounds = state.enemyBoundsByType[type];
  const common = {
    id: 900,
    type,
    hullIntegrity: 1,
    centerX,
    centerY,
    width: bounds.width,
    height: bounds.height,
    entry: 'top' as const,
    hasEnteredVisibleArea: true,
    activated: true,
    ordinal: 0,
  };
  if (type === 'ranged-drone') {
    return { ...common, kind: 'ranged', firingStepsRemaining: 180 };
  }
  if (type === 'hunter-drone') {
    return {
      ...common,
      kind: 'hunter',
      phase: 'committed',
      // V021-WI-03 (patch §3): the heading is the single owner of the committed
      // travel vector and of the rendered rotation; `0` is nose-down.
      headingRadians: 0,
      visualWidth: bounds.width,
      visualHeight: bounds.height,
      committedStepsExecuted: 0,
      steeringEnded: false,
      approachStepsElapsed: 120,
    };
  }
  return { ...common, kind: 'basic' };
}

describe('Mission 02 runtime consumption (Epic §8.2–8.2.1, V02-DEC-018/026, V02-WI-05 M02-R01)', () => {
  it('materializes the validated Mission 02 plan verbatim: six Encounters, 112 Arrival Groups and 480 ordered members', () => {
    const runtime = createTestCombatRuntime({ missionId: MISSION_02 });
    const state = runtime.getState();
    const plan = missionPlan();

    expect(state.enemyPlan.missionId).toBe(MISSION_02);
    expect(
      state.enemyPlan.encounters.map((entry) => entry.encounterId),
    ).toEqual([
      'interception-02-e1',
      'interception-02-e2',
      'interception-02-e3',
      'interception-02-e4',
      'interception-02-e5',
      'interception-02-e6',
    ]);
    expect(plan.encounters.map((entry) => entry.timeSeconds)).toEqual([
      10, 50, 100, 150, 200, 244,
    ]);
    // The single authored final member lands on 04:20 exactly.
    expect(state.enemyPlan.finalArrivalTimeSeconds).toBe(260);
    expect(state.enemyPlan.finalArrivalStepIndex).toBe(stepIndexFor(260));

    const groups = flatGroups(plan);
    expect(groups).toHaveLength(112);
    // The runtime materializes every resolved group exactly once, in authored
    // order, with the plan's own steps, offsets, members, placements and
    // assigned member ordinals — a verbatim consumption boundary.
    expect(state.arrivalGroups).toEqual(groups);
    expect(
      plan.encounters.map((encounter) => encounter.staging?.length),
    ).toEqual([20, 24, 23, 19, 18, 8]);
    expect([
      ...new Set(state.arrivalGroups.map((group) => group.encounterId)),
    ]).toEqual([
      'interception-02-e1',
      'interception-02-e2',
      'interception-02-e3',
      'interception-02-e4',
      'interception-02-e5',
      'interception-02-e6',
    ]);
    // Every Encounter opens on its authored start step.
    expect(
      groups
        .filter((group) => group.offsetSeconds === 0)
        .map((group) => group.stepIndex),
    ).toEqual([
      stepIndexFor(10),
      stepIndexFor(50),
      stepIndexFor(100),
      stepIndexFor(150),
      stepIndexFor(200),
      stepIndexFor(244),
    ]);
    // Authored density contract (patch §2.2, V021-AC-001): every creation event
    // carries at least four members, 77 of the 111 consecutive gaps are exactly
    // one authored `0.65 s` / 39-step formation row, and every remaining gap is
    // a transition between the 35 formations (including the five Encounter
    // boundaries) that is larger than one row and stays inside the patch's
    // maximum `8 s` start gap.
    const groupSteps = groups.map((group) => group.stepIndex);
    const consecutiveSteps = groupSteps
      .slice(1)
      .map((step, index) => step - (groupSteps[index] as number));
    const rowOffsetSteps = stepIndexFor(0.65);
    expect(consecutiveSteps).toHaveLength(111);
    expect(
      consecutiveSteps.filter((step) => step === rowOffsetSteps),
    ).toHaveLength(112 - 35);
    expect(
      consecutiveSteps
        .filter((step) => step !== rowOffsetSteps)
        .every((step) => step > rowOffsetSteps && step <= stepIndexFor(8)),
    ).toBe(true);
    for (const group of groups) {
      expect(group.members.length).toBeGreaterThanOrEqual(4);
    }

    const members = state.arrivalGroups.flatMap((group) => group.members);
    expect(members).toHaveLength(480);
    const countByType = (type: EnemyType): number =>
      members.filter((member) => member.type === type).length;
    expect(countByType('basic-drone')).toBe(352);
    expect(countByType('ranged-drone')).toBe(100);
    expect(countByType('hunter-drone')).toBe(28);
    expect(countByType('elite-drone')).toBe(0);
    // Authored screening order: Basic opens 00:10, the first Ranged arrives
    // 00:51.30 and the first fixed-side Hunter 02:00 — through authored row
    // order only, never a runtime formation generator.
    const firstStepOfRole = (type: EnemyType): number =>
      groups.find((group) =>
        group.members.some((member) => member.type === type),
      )?.stepIndex ?? -1;
    expect(firstStepOfRole('basic-drone')).toBe(stepIndexFor(10));
    expect(firstStepOfRole('ranged-drone')).toBe(stepIndexFor(51.3));
    expect(firstStepOfRole('hunter-drone')).toBe(stepIndexFor(120));
    // Stable zero-based mission ordinals in authored order: the per-member
    // `ranged-fire` RNG identity and presentation key never shift.
    expect(members.map((member) => member.ordinal)).toEqual(
      Array.from({ length: 480 }, (_, index) => index),
    );

    expect(state.arrivalGroupIndex).toBe(0);
    expect(state.currentEncounterId).toBeNull();
    expect(state.enemies).toEqual([]);
    expect(state.nextEnemyId).toBe(0);
    expect(state.finalArrivalTimeSeconds).toBe(260);
    expect(state.countdownSeconds).toBe(260);
  });

  it(
    'creates all 112 Arrival Groups on their exact fixed steps with ordered members, stable ordinals and engagement-band placements',
    () => {
      const runtime = createTestCombatRuntime({ missionId: MISSION_02 });
      // God Mode keeps the Aircraft operational across the complete 04:20
      // schedule so every authored creation step is observed; it never changes
      // spawning, placements, member order, or RNG consumption.
      runtime.submitDebug({ type: 'combat-debug/god-mode', enabled: true });
      const groups = flatGroups(missionPlan());
      let expectedNextEnemyId = 0;

      for (const [groupIndex, group] of groups.entries()) {
        const before = advanceToStep(runtime, group.stepIndex - 1);
        // Nothing from this group exists on the preceding step, and no scheduled
        // group beyond it has been created yet.
        expect(before.arrivalGroupIndex).toBe(groupIndex);
        expect(
          before.enemies.some((enemy) => enemy.id >= expectedNextEnemyId),
        ).toBe(false);

        const created = stepRuntime(runtime);
        expect(created.missionStepCount).toBe(group.stepIndex);
        // The authored fractional row time and the fixed-step clock may differ by
        // one floating-point unit; the Countdown stays the ceiling of the
        // remaining authored time.
        expect(created.missionTimeSeconds).toBeCloseTo(group.timeSeconds, 9);
        expect(created.countdownSeconds).toBe(
          Math.ceil(260 - group.timeSeconds),
        );
        expect(created.arrivalGroupIndex).toBe(groupIndex + 1);
        expect(created.currentEncounterId).toBe(group.encounterId);
        // Exactly-once creation: the monotonic enemy id advances by exactly this
        // group's authored member count, so a delayed group can never duplicate.
        expect(created.nextEnemyId).toBe(
          expectedNextEnemyId + group.members.length,
        );

        const ids = group.members.map(
          (_, index) => expectedNextEnemyId + index,
        );
        const spawned = created.enemies.filter((enemy) =>
          ids.includes(enemy.id),
        );
        // Simultaneous members keep their authored order and stable identity.
        expect(spawned.map((enemy) => enemy.id)).toEqual(ids);
        expect(spawned.map((enemy) => enemy.type)).toEqual(
          group.members.map((member) => member.type),
        );
        expect(spawned.map((enemy) => enemy.ordinal)).toEqual(
          group.members.map((member) => member.ordinal),
        );

        for (const [memberIndex, member] of group.members.entries()) {
          const enemy = spawned[memberIndex];
          if (enemy === undefined) {
            throw new Error('Mission 02 runtime evidence: missing member.');
          }
          const bounds = created.enemyBoundsByType[member.type];
          if (member.placement.kind === 'top') {
            // Top projection: the authored normalized fraction is measured inside
            // the CURRENT Aircraft horizontal engagement band, the complete
            // bounds start exactly on the upper boundary, and the complete bounds
            // stay inside the band (no invented geometry, no hidden offset).
            const band = created.bounds;
            expect(enemy.entry).toBe('top');
            expect(enemy.centerY).toBe(-bounds.height / 2);
            const fraction =
              (enemy.centerX - band.minX) / (band.maxX - band.minX);
            expect(fraction).toBeCloseTo(
              member.placement.engagementBandFraction,
              9,
            );
            expect(enemy.centerX - bounds.width / 2).toBeGreaterThanOrEqual(
              band.minX,
            );
            expect(enemy.centerX + bounds.width / 2).toBeLessThanOrEqual(
              band.maxX,
            );
          } else {
            // Fixed-side Hunter member: the authored viewport-height fraction and
            // the authored side, with the complete bounds exactly outside the
            // selected boundary (no seeded draw is consumed).
            const side = member.placement.side;
            expect(enemy.entry).toBe(side);
            // The per-step AABB is authoritative: the configured rectangle for a
            // level member, and the ENCLOSING rectangle of the configured
            // rectangle at the injected side-entry heading for the Hunter
            // (V021-WI-03 patch §3), so the AABB width is the configured height.
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

        expectedNextEnemyId = created.nextEnemyId;
      }

      const finalState = runtime.getState();
      expect(expectedNextEnemyId).toBe(480);
      expect(finalState.nextEnemyId).toBe(480);
      expect(finalState.arrivalGroupIndex).toBe(112);
      expect(finalState.terminalResult).toBeNull();

      // Mission 02 authors every regular member as a Top row or a fixed-side
      // Hunter, so resolution consumes ZERO `mission-data` draws and an unrelated
      // mission seed materializes the identical authored plan (a stray
      // seeded-side draw would shift a placement).
      const otherSeed = createTestCombatRuntime({
        missionId: MISSION_02,
        missionSeed: 0x11111111,
      });
      expect(otherSeed.getState().arrivalGroups).toEqual(groups);
      expect(otherSeed.getState().enemyPlan).toEqual(
        runtime.getState().enemyPlan,
      );
    },
    AGGREGATE_LOAD_TEST_TIMEOUT_MS,
  );

  it('keeps the resolved plan immutable across Aircraft, Hull and loadout state', () => {
    const baseline = createTestCombatRuntime({ missionId: MISSION_02 });
    const differing = createTestCombatRuntime({
      missionId: MISSION_02,
      hull: 40,
      weapon: CANNON,
    });
    // A different Aircraft position, Hull and loadout must not change the
    // resolved plan or the authored creations (no Reactive Spawn).
    differing.submit({ type: 'combat/pointer-move', x: 100, y: 100 });

    const baselineState = advanceToStep(baseline, 599);
    const movedState = advanceToStep(differing, 599);
    expect(movedState.aircraft.centerX).toBeLessThan(
      baselineState.aircraft.centerX,
    );
    expect(movedState.enemyPlan).toEqual(baselineState.enemyPlan);
    expect(movedState.arrivalGroups).toEqual(baselineState.arrivalGroups);

    const baselineCreated = stepRuntime(baseline);
    const movedCreated = stepRuntime(differing);
    expect(movedCreated.currentEncounterId).toBe(
      baselineCreated.currentEncounterId,
    );
    const spawnSignature = (state: CombatSimulationState): unknown =>
      state.enemies.map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        centerX: enemy.centerX,
        centerY: enemy.centerY,
        ordinal: enemy.ordinal,
      }));
    expect(spawnSignature(movedCreated)).toEqual(
      spawnSignature(baselineCreated),
    );
  });

  it('preserves the resolved normalized placement across an accepted resize and projects later groups inside the NEW engagement band', () => {
    const runtime = createTestCombatRuntime({ missionId: MISSION_02 });
    const before = advanceToStep(runtime, 599);
    runtime.submit({
      type: 'combat/viewport-resize',
      width: 1600,
      height: 900,
      aircraftWidth: 48 * (1278 / 1231) * 1.5,
      aircraftHeight: 72,
    });
    const resized = runtime.getState();
    expect(resized.viewportWidth).toBe(1600);
    expect(resized.viewportHeight).toBe(900);
    // The resolved plan stays the same immutable instance: an accepted resize
    // never rerolls entry data, re-resolves encounters, or consumes RNG.
    expect(resized.enemyPlan).toBe(before.enemyPlan);
    expect(resized.arrivalGroups).toBe(before.arrivalGroups);

    const created = stepRuntime(runtime);
    expect(created.missionStepCount).toBe(600);
    // e1's opening row: four Basics on the authored engagement-band fractions.
    expect(created.enemies).toHaveLength(4);
    const band = created.bounds;
    const authoredFractions = [0.32, 0.44, 0.56, 0.68];
    for (const [index, enemy] of created.enemies.entries()) {
      const bounds = created.enemyBoundsByType[enemy.type];
      expect(enemy.centerY).toBe(-bounds.height / 2);
      const fraction = (enemy.centerX - band.minX) / (band.maxX - band.minX);
      expect(fraction).toBeCloseTo(authoredFractions[index] ?? -1, 9);
    }
    expect(created.enemies[0]!.centerX).not.toBe(
      before.bounds.minX +
        authoredFractions[0]! * (before.bounds.maxX - before.bounds.minX),
    );
  });

  it('holds the Countdown at 00:00 on the single 04:20 step, creates the complete final e6 group once and grants no Success while a regular enemy remains', () => {
    const fresh = createTestCombatState({ missionId: MISSION_02 });
    const groups = flatGroups(missionPlan());
    const finalGroup = groups[groups.length - 1];
    if (finalGroup === undefined) {
      throw new Error('Mission 02 runtime evidence: missing final group.');
    }
    const crafted: CombatSimulationState = {
      ...fresh,
      missionStepCount: finalGroup.stepIndex - 1,
      missionTimeSeconds: (finalGroup.stepIndex - 1) * FIXED_STEP_SECONDS,
      countdownSeconds: 1,
      arrivalGroupIndex: groups.length - 1,
    };

    const atFinalStep = stepCombatSimulation(crafted, FIXED_STEP_SECONDS);
    expect(atFinalStep.missionStepCount).toBe(15600);
    expect(atFinalStep.missionTimeSeconds).toBe(260);
    // The crafted cursor starts at the final group, so exactly this group's
    // four e6 Ranged members receive identities 0-3.
    expect(finalGroup.members).toHaveLength(4);
    expect(finalGroup.members.map((member) => member.type)).toEqual([
      'ranged-drone',
      'ranged-drone',
      'ranged-drone',
      'ranged-drone',
    ]);
    expect(atFinalStep.nextEnemyId).toBe(4);
    // The Countdown reaches exactly 00:00 on this single step.
    expect(atFinalStep.countdownSeconds).toBe(0);
    expect(atFinalStep.currentEncounterId).toBe('interception-02-e6');
    expect(atFinalStep.enemies.map((enemy) => enemy.type)).toEqual(
      finalGroup.members.map((member) => member.type),
    );
    expect(atFinalStep.arrivalGroupIndex).toBe(groups.length);
    // Reaching 00:00 alone does not grant Success while regular enemies remain.
    expect(atFinalStep.terminalResult).toBeNull();

    // No later scheduled spawn exists and the Countdown stays at 00:00.
    let later = atFinalStep;
    for (let index = 0; index < 60; index += 1) {
      later = stepCombatSimulation(later, FIXED_STEP_SECONDS);
      expect(later.nextEnemyId).toBe(4);
      expect(later.arrivalGroupIndex).toBe(groups.length);
      expect(later.countdownSeconds).toBe(0);
      expect(later.currentEncounterId).toBe('interception-02-e6');
    }
    expect(later.missionStepCount).toBe(15660);
  });

  it('gives Defeat priority over a same-step satisfied Success condition', () => {
    const fresh = createTestCombatState({ missionId: MISSION_02 });
    const groups = flatGroups(missionPlan());
    const allSpawned: CombatSimulationState = {
      ...fresh,
      missionStepCount: 15600,
      missionTimeSeconds: 260,
      countdownSeconds: 0,
      arrivalGroupIndex: groups.length,
    };
    const lethalHunter = forgedEnemy(
      fresh,
      'hunter-drone',
      fresh.aircraft.centerX,
      fresh.aircraft.centerY,
    );

    // Control: the kamikaze contact resolves on this step and leaves no active
    // enemy, so the same state resolves as the normal Success.
    const success = stepCombatSimulation(
      { ...allSpawned, playerHullIntegrity: 100, enemies: [lethalHunter] },
      FIXED_STEP_SECONDS,
    );
    expect(success.terminalResult).toEqual({ kind: 'success' });
    expect(success.arrivalGroupIndex).toBe(groups.length);
    expect(success.enemies).toEqual([]);

    // Counter-case: the same contact drives Hull to 0 while the complete
    // spawn/no-enemy Success condition is satisfied in the same step.
    const defeat = stepCombatSimulation(
      { ...allSpawned, playerHullIntegrity: 35, enemies: [lethalHunter] },
      FIXED_STEP_SECONDS,
    );
    expect(defeat.terminalResult).toEqual({ kind: 'defeat' });
    expect(defeat.playerHullIntegrity).toBe(0);
    expect(defeat.arrivalGroupIndex).toBe(groups.length);
    expect(defeat.enemies).toEqual([]);
  });

  it('freezes the exact destroyed/escaped/reward/penalty/Hull payload at Success', () => {
    const fresh = createTestCombatState({ missionId: MISSION_02 });
    const groups = flatGroups(missionPlan());
    const ready: CombatSimulationState = {
      ...fresh,
      missionStepCount: 15600,
      missionTimeSeconds: 260,
      countdownSeconds: 0,
      arrivalGroupIndex: groups.length,
      pendingCombatRewards: 11,
      pendingEscapePenalties: 3,
      playerHullIntegrity: 62,
      destroyedCountByType: {
        'basic-drone': 5,
        'ranged-drone': 2,
        'hunter-drone': 1,
        'elite-drone': 0,
      },
      escapedCountByType: {
        'basic-drone': 2,
        'ranged-drone': 1,
        'hunter-drone': 0,
        'elite-drone': 0,
      },
    };
    const committed = stepCombatSimulation(ready, FIXED_STEP_SECONDS);
    expect(committed.terminalResult).toEqual({ kind: 'success' });
    expect(committed.exitPhase).toBe('centre');

    const frozen = {
      rewards: committed.pendingCombatRewards,
      penalties: committed.pendingEscapePenalties,
      hull: committed.playerHullIntegrity,
      destroyed: { ...committed.destroyedCountByType },
      escaped: { ...committed.escapedCountByType },
      enemies: committed.enemies.length,
    };
    // Before the campaign transaction authorizes the exit the state is frozen.
    expect(stepCombatSimulation(committed, FIXED_STEP_SECONDS)).toBe(committed);

    let exit = { ...committed, exitAuthorized: true };
    for (let index = 0; index < 200; index += 1) {
      exit = stepCombatSimulation(exit, FIXED_STEP_SECONDS);
    }
    expect(exit.exitPhase).toBe('complete');
    expect(exit.pendingCombatRewards).toBe(frozen.rewards);
    expect(exit.pendingEscapePenalties).toBe(frozen.penalties);
    expect(exit.playerHullIntegrity).toBe(frozen.hull);
    expect(exit.destroyedCountByType).toEqual(frozen.destroyed);
    expect(exit.escapedCountByType).toEqual(frozen.escaped);
    expect(exit.enemies).toHaveLength(frozen.enemies);
    expect(exit.arrivalGroupIndex).toBe(groups.length);
    // No authored group was materialized in this crafted cursor and the frozen
    // terminal never creates one afterwards.
    expect(exit.nextEnemyId).toBe(0);
  });

  it('drives the Mission 02 Ranged and Hunter instances through the shared per-member behaviour owners', () => {
    const streams = createTestCombatRuntime({ missionId: MISSION_02 });
    const groups = flatGroups(missionPlan());
    // Every authored Ranged member owns exactly one independent `ranged-fire`
    // stream keyed by its stable member ordinal — the shared owner, not a
    // Mission 02 fork. All 100 authored Ranged streams exist from creation.
    const planRangedOrdinals = groups
      .flatMap((group) => group.members)
      .filter((member) => member.type === 'ranged-drone')
      .map((member) => member.ordinal);
    expect(planRangedOrdinals).toHaveLength(100);
    expect(
      Object.keys(streams.getState().rangedFireStreams)
        .map(Number)
        .sort((left, right) => left - right),
    ).toEqual(planRangedOrdinals);

    // e2's opening Ranged row (the first authored Ranged) begins its
    // full-bounds activation timer and fires its first shot exactly 180 steps
    // later through the shared cadence, with the shared projectile geometry.
    const rangedGroupIndex = groups.findIndex((group) =>
      group.members.some((member) => member.type === 'ranged-drone'),
    );
    const rangedGroup = groups[rangedGroupIndex];
    if (rangedGroup === undefined) {
      throw new Error(
        'Mission 02 runtime evidence: missing first Ranged group.',
      );
    }
    const rangedRuntime = createTestCombatRuntime({ missionId: MISSION_02 });
    const rangedCreated = stepCombatSimulation(
      {
        ...rangedRuntime.getState(),
        missionStepCount: rangedGroup.stepIndex - 1,
        missionTimeSeconds: (rangedGroup.stepIndex - 1) * FIXED_STEP_SECONDS,
        arrivalGroupIndex: rangedGroupIndex,
      },
      FIXED_STEP_SECONDS,
    );
    const rangedMember = rangedCreated.enemies.find(
      (enemy) => enemy.type === 'ranged-drone',
    );
    expect(rangedMember?.ordinal).toBe(
      memberOrdinalAt(groups, rangedGroupIndex, 0),
    );
    expect(rangedMember?.entry).toBe('top');
    if (rangedMember === undefined) {
      throw new Error('Mission 02 runtime evidence: ranged instance missing.');
    }
    // The crafted cursor assigns runtime identities from 0; the stable authored
    // member ordinal 16 is the stream/presentation identity.
    const rangedId = rangedMember.id;

    const activated = stepStateUntil(
      rangedCreated,
      600,
      (state) => enemyById(state, rangedId)?.activated === true,
    );
    const activatedRanged = enemyById(activated.state, rangedId);
    expect(activatedRanged?.hullIntegrity).toBe(4);
    if (activatedRanged?.kind !== 'ranged') {
      throw new Error('Mission 02 runtime evidence: ranged state missing.');
    }
    expect(activatedRanged.firingStepsRemaining).toBe(180);

    const fired = stepStateUntil(
      activated.state,
      200,
      (state) => state.enemyProjectiles.length > 0,
    );
    expect(fired.steps).toBe(180);
    // The authored `4R` row creates four simultaneous Ranged members, so all
    // four independent streams fire on the same cadence step, each with the
    // shared projectile geometry.
    expect(fired.state.enemyProjectiles).toHaveLength(
      rangedGroup.members.length,
    );
    for (const projectile of fired.state.enemyProjectiles) {
      expect(projectile.width).toBe(fired.state.rangedProjectileGeometry.width);
      expect(projectile.height).toBe(
        fired.state.rangedProjectileGeometry.height,
      );
    }

    // The first authored Hunter row (e3's `H4-12` template) uses the shared
    // entry machine: each Hunter enters horizontally from its authored fixed
    // side, begins Approach on the exact step its complete bounds are inside,
    // then commits at 26% VH/s with a heading-owned direction that steers
    // toward the moving Aircraft only within the bounded 25°/s window
    // (V021-WI-03 patch §3).
    const hunterGroupIndex = groups.findIndex((group) =>
      group.members.some((member) => member.type === 'hunter-drone'),
    );
    const hunterGroup = groups[hunterGroupIndex];
    if (hunterGroup === undefined) {
      throw new Error('Mission 02 runtime evidence: missing first Hunter row.');
    }
    const hunterMemberIndex = hunterGroup.members.findIndex(
      (member) => member.type === 'hunter-drone',
    );
    const hunterPlacement = hunterGroup.members[hunterMemberIndex]?.placement;
    if (hunterPlacement?.kind !== 'side') {
      throw new Error(
        'Mission 02 runtime evidence: authored Hunter side missing.',
      );
    }
    const hunterRuntime = createTestCombatRuntime({ missionId: MISSION_02 });
    const hunterCreated = stepCombatSimulation(
      {
        ...hunterRuntime.getState(),
        missionStepCount: hunterGroup.stepIndex - 1,
        missionTimeSeconds: (hunterGroup.stepIndex - 1) * FIXED_STEP_SECONDS,
        arrivalGroupIndex: hunterGroupIndex,
      },
      FIXED_STEP_SECONDS,
    );
    expect(hunterCreated.currentEncounterId).toBe('interception-02-e3');
    const hunter = hunterCreated.enemies.find(
      (enemy) => enemy.type === 'hunter-drone',
    );
    if (hunter?.kind !== 'hunter') {
      throw new Error('Mission 02 runtime evidence: hunter state missing.');
    }
    expect(hunter.ordinal).toBe(
      memberOrdinalAt(groups, hunterGroupIndex, hunterMemberIndex),
    );
    // The authored fixed side is content: no `mission-data` draw is consumed.
    expect(hunter.entry).toBe(hunterPlacement.side);
    expect(hunter.phase).toBe('entering');
    expect(hunter.activated).toBe(false);
    const hunterId = hunter.id;
    expect(hunter.centerX).toBe(
      hunter.entry === 'upper-left'
        ? -hunter.width / 2
        : hunterCreated.viewportWidth + hunter.width / 2,
    );
    expect(hunter.centerY).toBe(
      hunterPlacement.yViewportFraction * hunterCreated.viewportHeight,
    );

    const approached = stepStateUntil(
      hunterCreated,
      600,
      (state) => enemyById(state, hunterId)?.activated === true,
    );
    const approaching = enemyById(approached.state, hunterId);
    if (approaching?.kind !== 'hunter') {
      throw new Error('Mission 02 runtime evidence: hunter approach missing.');
    }
    expect(approaching.phase).toBe('approach');
    expect(approaching.approachStepsElapsed).toBe(0);

    const committedRun = stepStateUntil(approached.state, 600, (state) => {
      const current = enemyById(state, hunterId);
      return current?.kind === 'hunter' && current.phase === 'committed';
    });
    const committedHunter = enemyById(committedRun.state, hunterId);
    if (committedHunter?.kind !== 'hunter') {
      throw new Error('Mission 02 runtime evidence: hunter commit missing.');
    }
    expect(
      Math.hypot(
        hunterTravelVector(committedHunter.headingRadians).x,
        hunterTravelVector(committedHunter.headingRadians).y,
      ),
    ).toBeCloseTo(1, 9);
    const lockedHeading = committedHunter.headingRadians;
    const lockedX = committedHunter.centerX;
    const lockedY = committedHunter.centerY;

    // V021-WI-03 (patch §3, V021-AC-003): the committed run no longer locks a
    // direction instantly — inside its 60-executed-step window it may steer
    // toward the Aircraft's CURRENT centre by at most 25°/s along the shortest
    // signed turn, and it always travels at the 26% VH/s committed speed.
    const moved = submitCombatCommand(committedRun.state, {
      type: 'combat/pointer-move',
      x: 160,
      y: 120,
    });
    const afterMove = stepCombatSimulation(moved, FIXED_STEP_SECONDS);
    const steered = enemyById(afterMove, hunterId);
    if (steered?.kind !== 'hunter') {
      throw new Error('Mission 02 runtime evidence: committed run missing.');
    }
    expect(steered.phase).toBe('committed');
    // The commit step itself is the first executed committed step, so this
    // step is the second executed one.
    expect(committedHunter.committedStepsExecuted).toBe(1);
    expect(steered.committedStepsExecuted).toBe(
      committedHunter.committedStepsExecuted + 1,
    );
    expect(
      Math.abs(steered.headingRadians - lockedHeading),
    ).toBeLessThanOrEqual(hunterMaxTurnPerStep(FIXED_STEP_SECONDS) + 1e-9);
    const committedStep = 0.26 * afterMove.viewportHeight * FIXED_STEP_SECONDS;
    expect(
      Math.hypot(steered.centerX - lockedX, steered.centerY - lockedY),
    ).toBeCloseTo(committedStep, 9);
    const steeredTravel = hunterTravelVector(steered.headingRadians);
    expect(
      steered.centerX - lockedX - steeredTravel.x * committedStep,
    ).toBeCloseTo(0, 9);
    expect(
      steered.centerY - lockedY - steeredTravel.y * committedStep,
    ).toBeCloseTo(0, 9);
  });
});
