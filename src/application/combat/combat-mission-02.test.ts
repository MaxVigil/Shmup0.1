import { describe, expect, it } from 'vitest';
import { INTERCEPTION_02 } from '@content/index';
import { CANNON } from '@content/weapons';
import { createMissionDataStream } from '@domain/index';
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
import type { CombatEnemy } from './enemies';

/**
 * V02-WI-05 M02-R01 Mission 02 runtime-consumption evidence (Epic §8.2–8.2.1,
 * §13, §15.2, V02-DEC-018/026, V02-AC-003/005/006/023).
 *
 * The exhaustive Mission 02 authored content and its deterministic resolution
 * are owned by `src/content/missions/missions-exact.test.ts` and
 * `src/application/mission/encounter-resolution.test.ts`. This file adds only
 * the missing boundary evidence: the GENERIC Combat runtime materializes that
 * validated plan verbatim, creates all six Encounters and all ten Arrival
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
      committedVx: 0,
      committedVy: 1,
      approachStepsElapsed: 120,
    };
  }
  return { ...common, kind: 'basic' };
}

describe('Mission 02 runtime consumption (Epic §8.2–8.2.1, V02-DEC-018/026, V02-WI-05 M02-R01)', () => {
  it('materializes the validated Mission 02 plan verbatim: six Encounters, ten Arrival Groups and 21 ordered members', () => {
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
      10, 50, 100, 150, 200, 260,
    ]);
    expect(state.enemyPlan.finalArrivalTimeSeconds).toBe(260);
    expect(state.enemyPlan.finalArrivalStepIndex).toBe(stepIndexFor(260));

    const groups = flatGroups(plan);
    expect(groups).toHaveLength(10);
    // The runtime materializes every resolved group exactly once, in authored
    // order, with the plan's own steps, offsets, members, placements and
    // assigned member ordinals — a verbatim consumption boundary.
    expect(state.arrivalGroups).toEqual(groups);
    expect(state.arrivalGroups.map((group) => group.encounterId)).toEqual([
      'interception-02-e1',
      'interception-02-e2',
      'interception-02-e2',
      'interception-02-e3',
      'interception-02-e4',
      'interception-02-e4',
      'interception-02-e5',
      'interception-02-e5',
      'interception-02-e5',
      'interception-02-e6',
    ]);
    expect(state.arrivalGroups.map((group) => group.offsetSeconds)).toEqual([
      0, 0, 2, 0, 0, 2, 0, 1, 2, 0,
    ]);
    expect(state.arrivalGroups.map((group) => group.stepIndex)).toEqual([
      600, 3000, 3120, 6000, 9000, 9120, 12000, 12060, 12120, 15600,
    ]);
    const members = state.arrivalGroups.flatMap((group) => group.members);
    expect(members).toHaveLength(21);
    const countByType = (type: EnemyType): number =>
      members.filter((member) => member.type === type).length;
    expect(countByType('basic-drone')).toBe(15);
    expect(countByType('ranged-drone')).toBe(4);
    expect(countByType('hunter-drone')).toBe(2);
    expect(countByType('elite-drone')).toBe(0);
    // Stable zero-based mission ordinals in authored order: the per-member
    // `ranged-fire` RNG identity and presentation key never shift.
    expect(members.map((member) => member.ordinal)).toEqual(
      Array.from({ length: 21 }, (_, index) => index),
    );

    expect(state.arrivalGroupIndex).toBe(0);
    expect(state.currentEncounterId).toBeNull();
    expect(state.enemies).toEqual([]);
    expect(state.nextEnemyId).toBe(0);
    expect(state.finalArrivalTimeSeconds).toBe(260);
    expect(state.countdownSeconds).toBe(260);
  });

  it('creates all ten Arrival Groups on their exact fixed steps with ordered members, stable ordinals and engagement-band placements', () => {
    const runtime = createTestCombatRuntime({ missionId: MISSION_02 });
    // God Mode keeps the Aircraft operational across the complete 04:20
    // schedule so every authored creation step is observed; it never changes
    // spawning, placements, member order, or RNG consumption.
    runtime.submitDebug({ type: 'combat-debug/god-mode', enabled: true });
    const groups = flatGroups(missionPlan());
    const draws = createMissionDataStream(TEST_MISSION_SEED);
    const expectedSides = [
      draws.nextInt(2) === 0 ? 'upper-left' : 'upper-right',
      draws.nextInt(2) === 0 ? 'upper-left' : 'upper-right',
      draws.nextInt(2) === 0 ? 'upper-left' : 'upper-right',
    ];
    const seededSides: string[] = [];
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
      expect(created.missionTimeSeconds).toBe(group.timeSeconds);
      expect(created.countdownSeconds).toBe(260 - group.timeSeconds);
      expect(created.arrivalGroupIndex).toBe(groupIndex + 1);
      expect(created.currentEncounterId).toBe(group.encounterId);
      // Exactly-once creation: the monotonic enemy id advances by exactly this
      // group's authored member count, so a delayed group can never duplicate.
      expect(created.nextEnemyId).toBe(
        expectedNextEnemyId + group.members.length,
      );

      const ids = group.members.map((_, index) => expectedNextEnemyId + index);
      const spawned = created.enemies.filter((enemy) => ids.includes(enemy.id));
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
          // Seeded Side member: the authored viewport-height fraction and the
          // resolved approved side, with the complete bounds exactly outside
          // the selected boundary.
          const side = member.placement.side;
          seededSides.push(side);
          expect(enemy.entry).toBe(side);
          expect(enemy.centerX).toBe(
            side === 'upper-left'
              ? -bounds.width / 2
              : created.viewportWidth + bounds.width / 2,
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

    // The three Mission 02 seeded-side members consumed exactly the three
    // `mission-data` draws in e4 delayed Basic → e5 Hunter → e6 Hunter order;
    // every Top member consumed zero draws (any extra draw would shift this
    // mapping).
    expect(seededSides).toEqual(expectedSides);
    const finalState = runtime.getState();
    expect(expectedNextEnemyId).toBe(21);
    expect(finalState.nextEnemyId).toBe(21);
    expect(finalState.arrivalGroupIndex).toBe(10);
    expect(finalState.terminalResult).toBeNull();
  });

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
    expect(created.enemies).toHaveLength(3);
    const band = created.bounds;
    const authoredFractions = [0.15, 0.45, 0.75];
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

  it('holds the Countdown at 00:00 on the single 04:20 step, creates the complete e6 group once and grants no Success while a regular enemy remains', () => {
    const fresh = createTestCombatState({ missionId: MISSION_02 });
    const groups = flatGroups(missionPlan());
    const finalGroup = groups[9];
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
    // The crafted cursor starts at the final group, so exactly the three e6
    // members receive identities 0-2.
    expect(atFinalStep.nextEnemyId).toBe(3);
    // The Countdown reaches exactly 00:00 on this single step.
    expect(atFinalStep.countdownSeconds).toBe(0);
    // The complete e6 group (2 Basic + 1 Hunter) was created on this step.
    expect(atFinalStep.currentEncounterId).toBe('interception-02-e6');
    expect(atFinalStep.enemies.map((enemy) => enemy.type)).toEqual([
      'basic-drone',
      'basic-drone',
      'hunter-drone',
    ]);
    expect(atFinalStep.arrivalGroupIndex).toBe(groups.length);
    // Reaching 00:00 alone does not grant Success while regular enemies remain.
    expect(atFinalStep.terminalResult).toBeNull();

    // No later scheduled spawn exists and the Countdown stays at 00:00.
    let later = atFinalStep;
    for (let index = 0; index < 60; index += 1) {
      later = stepCombatSimulation(later, FIXED_STEP_SECONDS);
      expect(later.nextEnemyId).toBe(3);
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
    // Per-member `ranged-fire` streams are keyed exactly by the authored
    // Mission 02 Ranged ordinals (e2 delayed Ranged 6, e3 Ranged 8/9, e5
    // delayed Ranged 16) — the shared owner, not a Mission 02 fork.
    expect(
      Object.keys(streams.getState().rangedFireStreams)
        .map(Number)
        .sort((left, right) => left - right),
    ).toEqual([6, 8, 9, 16]);

    const groups = flatGroups(missionPlan());
    const rangedGroup = groups[7];
    const hunterGroup = groups[8];
    if (rangedGroup === undefined || hunterGroup === undefined) {
      throw new Error('Mission 02 runtime evidence: missing e5 groups.');
    }

    // The e5 delayed Ranged (member ordinal 16) begins its full-bounds
    // activation timer and fires its first shot exactly 180 steps later
    // through the shared cadence, with the shared ranged projectile geometry.
    const rangedRuntime = createTestCombatRuntime({ missionId: MISSION_02 });
    const rangedCreated = stepCombatSimulation(
      {
        ...rangedRuntime.getState(),
        missionStepCount: rangedGroup.stepIndex - 1,
        missionTimeSeconds: (rangedGroup.stepIndex - 1) * FIXED_STEP_SECONDS,
        arrivalGroupIndex: 7,
      },
      FIXED_STEP_SECONDS,
    );
    const rangedMember = rangedCreated.enemies.find(
      (enemy) => enemy.type === 'ranged-drone',
    );
    expect(rangedMember?.ordinal).toBe(16);
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
    expect(fired.state.enemyProjectiles).toHaveLength(1);
    expect(fired.state.enemyProjectiles[0]!.width).toBe(
      fired.state.rangedProjectileGeometry.width,
    );
    expect(fired.state.enemyProjectiles[0]!.height).toBe(
      fired.state.rangedProjectileGeometry.height,
    );

    // The e5 delayed Hunter (member ordinal 17) uses the shared entry machine:
    // it enters horizontally from its resolved authored side, begins Approach
    // on the exact step its complete bounds are inside, then commits with a
    // locked direction that does not bend when the Aircraft later moves.
    const hunterRuntime = createTestCombatRuntime({ missionId: MISSION_02 });
    const hunterCreated = stepCombatSimulation(
      {
        ...hunterRuntime.getState(),
        missionStepCount: hunterGroup.stepIndex - 1,
        missionTimeSeconds: (hunterGroup.stepIndex - 1) * FIXED_STEP_SECONDS,
        arrivalGroupIndex: 8,
      },
      FIXED_STEP_SECONDS,
    );
    expect(hunterCreated.currentEncounterId).toBe('interception-02-e5');
    const hunter = hunterCreated.enemies.find(
      (enemy) => enemy.type === 'hunter-drone',
    );
    if (hunter?.kind !== 'hunter') {
      throw new Error('Mission 02 runtime evidence: hunter state missing.');
    }
    expect(hunter.ordinal).toBe(17);
    expect(['upper-left', 'upper-right']).toContain(hunter.entry);
    expect(hunter.phase).toBe('entering');
    expect(hunter.activated).toBe(false);
    const hunterId = hunter.id;
    expect(hunter.centerX).toBe(
      hunter.entry === 'upper-left'
        ? -hunter.width / 2
        : hunterCreated.viewportWidth + hunter.width / 2,
    );
    expect(hunter.centerY).toBe(0.2 * hunterCreated.viewportHeight);

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
      committedHunter.committedVx ** 2 + committedHunter.committedVy ** 2,
    ).toBeCloseTo(1, 9);
    const lockedVx = committedHunter.committedVx;
    const lockedVy = committedHunter.committedVy;
    const lockedX = committedHunter.centerX;
    const lockedY = committedHunter.centerY;

    // Move the Aircraft after the commit: the locked run must not bend.
    const moved = submitCombatCommand(committedRun.state, {
      type: 'combat/pointer-move',
      x: 160,
      y: 120,
    });
    const afterMove = stepCombatSimulation(moved, FIXED_STEP_SECONDS);
    const bent = enemyById(afterMove, hunterId);
    if (bent?.kind !== 'hunter') {
      throw new Error('Mission 02 runtime evidence: committed run missing.');
    }
    expect(bent.committedVx).toBe(lockedVx);
    expect(bent.committedVy).toBe(lockedVy);
    expect(bent.phase).toBe('committed');
    const committedStep = 0.26 * afterMove.viewportHeight * FIXED_STEP_SECONDS;
    expect(bent.centerX - lockedX).toBeCloseTo(lockedVx * committedStep, 9);
    expect(bent.centerY - lockedY).toBeCloseTo(lockedVy * committedStep, 9);
  });
});
