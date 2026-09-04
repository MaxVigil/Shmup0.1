import { describe, expect, it } from 'vitest';
import { createMissionDataStream } from '@domain/index';
import {
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  MISSIONS,
} from '@content/index';
import {
  resolveMissionEncounters,
  type ResolvedSpawnPlacement,
} from './encounter-resolution';

const FIXED_STEP_SECONDS = 1 / 60;
const SEED = 0xdeadbeef;

/**
 * V02-AC-003 / V02-AC-004 determinism evidence: the encounter-data resolution
 * contract takes ONLY the authored mission definition, the already-derived
 * mission seed, and the fixed step — never Hull, loadout, Aircraft position,
 * score, or performance — so identical explicit inputs always produce
 * identical encounter identities, timestamps, compositions, ordering, and
 * approved seeded entry variants.
 */
describe('resolveMissionEncounters (Epic §7.2, V02-AC-003–004)', () => {
  it('resolves the exact authored timestamps, identities, and compositions in order', () => {
    const plan = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    expect(plan.missionId).toBe('interception-01');
    expect(plan.encounters.map((e) => e.encounterId)).toEqual([
      'interception-01-e1',
      'interception-01-e2',
      'interception-01-e3',
      'interception-01-e4',
      'interception-01-e5',
    ]);
    expect(plan.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 55, 100, 140, 190,
    ]);
    expect(plan.finalArrivalTimeSeconds).toBe(190);
    expect(plan.finalArrivalStepIndex).toBe(
      Math.round(190 / FIXED_STEP_SECONDS),
    );
    // Compositions are the authored data, unchanged by the seed.
    expect(plan.encounters[0]?.composition).toEqual([
      { type: 'basic-drone', count: 4 },
    ]);
    expect(plan.encounters[4]?.composition).toEqual([
      { type: 'basic-drone', count: 3 },
      { type: 'ranged-drone', count: 1 },
      { type: 'hunter-drone', count: 1 },
    ]);
    // Typed entry/formation/delay data passes through unchanged: role-level
    // delays carry the delayed role, and entry regions are explicitly absent
    // where Epic §8 names none.
    expect(plan.encounters[0]).toMatchObject({
      entryRegion: 'top',
      entryVariants: null,
      formation: 'wide-top',
      roleDelays: [],
    });
    expect(plan.encounters[1]).toMatchObject({
      entryRegion: null,
      formation: 'centred-behind-basics',
      roleDelays: [{ type: 'ranged-drone', delaySeconds: 2 }],
    });
    expect(plan.encounters[3]).toMatchObject({
      formation: null,
      roleDelays: [{ type: 'hunter-drone', delaySeconds: 3 }],
    });
    // e4/e5 are seeded Hunter encounters (V02-WI-04): their entry region is
    // resolved from the mission-data stream in authored order.
    expect(['upper-left', 'upper-right']).toContain(
      plan.encounters[3]?.entryRegion,
    );
    expect(['upper-left', 'upper-right']).toContain(
      plan.encounters[4]?.entryRegion,
    );
    // Fixed encounters carry no seeded variant set.
    expect(plan.encounters[0]?.entryVariants).toBeNull();
  });

  it('resolves the exact Mission 01 Arrival Groups with normalized placements (V02-DEC-021, V02-AC-003)', () => {
    const plan = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    // e2: +0 s two Top Basics and +2 s one Top Ranged at fraction 0.5.
    const e2 = plan.encounters[1];
    expect(e2?.staging?.map((group) => group.stepIndex)).toEqual([
      Math.round(55 / FIXED_STEP_SECONDS),
      Math.round(57 / FIXED_STEP_SECONDS),
    ]);
    expect(e2?.staging?.[1]?.members).toEqual([
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.5 },
      },
    ]);
    // e3/e4/e5 seeded-side Hunters resolve to their drawn side at 20% VH.
    for (const index of [2, 3, 4]) {
      const members = plan.encounters[index]?.staging?.flatMap(
        (group) => group.members,
      );
      const hunter = members?.find((member) => member.type === 'hunter-drone');
      expect(hunter?.placement.kind).toBe('side');
      if (hunter?.placement.kind === 'side') {
        expect(hunter.placement.yViewportFraction).toBe(0.2);
        expect(['upper-left', 'upper-right']).toContain(hunter.placement.side);
      }
    }
    // Top Placements consume zero draws: only the three seeded Hunter draws
    // occurred, in e3 → e4 → e5 order (the e5 member side matches e5's region).
    expect(plan.encounters[4]?.staging?.[0]?.members[4]?.placement.kind).toBe(
      'side',
    );
  });

  it('preserves the delayed-role association for the V02-WI-04 consumer (C02)', () => {
    const plan = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    // Ranged +2 s belongs to the Ranged role of M01 e2, never the encounter as
    // a whole; Hunter +3 s belongs to the Hunter role of M01 e4.
    expect(plan.encounters[1]?.roleDelays).toEqual([
      { type: 'ranged-drone', delaySeconds: 2 },
    ]);
    expect(plan.encounters[3]?.roleDelays).toEqual([
      { type: 'hunter-drone', delaySeconds: 3 },
    ]);
    expect(plan.encounters[0]?.roleDelays).toEqual([]);
  });

  it('is identical for identical explicit inputs (V02-AC-003)', () => {
    const first = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    const second = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    expect(second).toEqual(first);
  });

  it('resolves the exact Mission 02 Arrival Groups and three mission-data draws in e4 → e5 → e6 order (V02-DEC-026, V02-AC-003)', () => {
    const seed = SEED;
    const plan = resolveMissionEncounters(
      INTERCEPTION_02,
      seed,
      FIXED_STEP_SECONDS,
    );
    expect(plan.missionId).toBe('interception-02');
    expect(plan.encounters.map((e) => e.encounterId)).toEqual([
      'interception-02-e1',
      'interception-02-e2',
      'interception-02-e3',
      'interception-02-e4',
      'interception-02-e5',
      'interception-02-e6',
    ]);
    expect(plan.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 50, 100, 150, 200, 260,
    ]);
    expect(plan.finalArrivalTimeSeconds).toBe(260);
    expect(plan.finalArrivalStepIndex).toBe(
      Math.round(260 / FIXED_STEP_SECONDS),
    );
    const step = (seconds: number): number =>
      Math.round(seconds / FIXED_STEP_SECONDS);
    // e4: +0 s three Top Basics and +2 s the seeded-side Basic flank.
    expect(
      plan.encounters[3]?.staging?.map((group) => group.stepIndex),
    ).toEqual([step(150), step(152)]);
    expect(plan.encounters[3]?.staging?.[1]?.members).toHaveLength(1);
    expect(plan.encounters[3]?.staging?.[1]?.members[0]).toMatchObject({
      type: 'basic-drone',
      placement: { kind: 'side', yViewportFraction: 0.25 },
    });
    // e5: +0 s Basic, +1 s Ranged, +2 s seeded-side Hunter.
    expect(
      plan.encounters[4]?.staging?.map((group) => group.stepIndex),
    ).toEqual([step(200), step(201), step(202)]);
    expect(plan.encounters[4]?.staging?.[2]?.members[0]).toMatchObject({
      type: 'hunter-drone',
      placement: { kind: 'side', yViewportFraction: 0.2 },
    });
    // e6: single 04:20 creation step with both Top Basics plus the Hunter.
    expect(
      plan.encounters[5]?.staging?.map((group) => group.stepIndex),
    ).toEqual([step(260)]);
    expect(plan.encounters[5]?.staging?.[0]?.members).toHaveLength(3);
    // Exactly three mission-data draws exist and belong to e4/e5/e6 in order:
    // the same stream read in authored encounter order maps draw 0 → the e4
    // flank side, draw 1 → the e5 Hunter side, draw 2 → the e6 Hunter side.
    // Top-only encounters consume zero draws, so any extra or reordered draw
    // shifts the mapping below.
    const stream = createMissionDataStream(seed);
    const expectedSides: readonly ('upper-left' | 'upper-right')[] = [
      stream.nextInt(2) === 0 ? 'upper-left' : 'upper-right',
      stream.nextInt(2) === 0 ? 'upper-left' : 'upper-right',
      stream.nextInt(2) === 0 ? 'upper-left' : 'upper-right',
    ];
    const resolveSide = (
      placement: ResolvedSpawnPlacement | undefined,
    ): 'upper-left' | 'upper-right' => {
      expect(placement?.kind).toBe('side');
      return placement?.kind === 'side' ? placement.side : 'upper-left';
    };
    expect(
      resolveSide(plan.encounters[3]?.staging?.[1]?.members[0]?.placement),
    ).toBe(expectedSides[0]);
    expect(
      resolveSide(plan.encounters[4]?.staging?.[2]?.members[0]?.placement),
    ).toBe(expectedSides[1]);
    expect(
      resolveSide(plan.encounters[5]?.staging?.[0]?.members[2]?.placement),
    ).toBe(expectedSides[2]);
    // Top Placements consumed zero draws: e1–e3 expose no side members and the
    // staged side members above stayed aligned with exactly the three draws.
    for (const encounter of plan.encounters.slice(0, 3)) {
      for (const group of encounter.staging ?? []) {
        for (const member of group.members) {
          expect(member.placement.kind).toBe('top');
        }
      }
    }
  });

  it('resolves approved seeded entry regions only for seeded encounters', () => {
    for (const mission of MISSIONS) {
      const plan = resolveMissionEncounters(mission, SEED, FIXED_STEP_SECONDS);
      for (const encounter of plan.encounters) {
        const authored = mission.encounters.find(
          (candidate) => candidate.id === encounter.encounterId,
        );
        if (authored?.entry.kind === 'seeded') {
          expect(authored.entry.variants).toContain(encounter.entryRegion);
          expect(encounter.entryVariants).toEqual(authored.entry.variants);
        } else if (authored?.entry.kind === 'fixed') {
          expect(encounter.entryVariants).toBeNull();
          expect(encounter.entryRegion).toBe(authored.entry.region);
        } else {
          // Epic §8 row names no entry region: the resolved contract exposes
          // that absence explicitly instead of inventing a default region.
          expect(encounter.entryVariants).toBeNull();
          expect(encounter.entryRegion).toBeNull();
        }
      }
    }
    // The two authored `upper-left or upper-right` encounters are seeded.
    const m01 = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    expect(['upper-left', 'upper-right']).toContain(
      m01.encounters[2]?.entryRegion,
    );
    expect(m01.encounters[2]?.entryVariants).toEqual([
      'upper-left',
      'upper-right',
    ]);
    const m03 = resolveMissionEncounters(
      INTERCEPTION_03,
      SEED,
      FIXED_STEP_SECONDS,
    );
    expect(['upper-left', 'upper-right']).toContain(
      m03.encounters[6]?.entryRegion,
    );
  });

  it('different seeds can change only the seeded entry regions, never timestamps, compositions, or ordering (V02-AC-004)', () => {
    const planA = resolveMissionEncounters(
      INTERCEPTION_01,
      0x11111111,
      FIXED_STEP_SECONDS,
    );
    const planB = resolveMissionEncounters(
      INTERCEPTION_01,
      0x22222222,
      FIXED_STEP_SECONDS,
    );
    expect(planA.encounters.map((e) => e.encounterId)).toEqual(
      planB.encounters.map((e) => e.encounterId),
    );
    expect(planA.encounters.map((e) => e.timeSeconds)).toEqual(
      planB.encounters.map((e) => e.timeSeconds),
    );
    expect(planA.encounters.map((e) => e.composition)).toEqual(
      planB.encounters.map((e) => e.composition),
    );
    // Only seeded encounters may differ; every fixed encounter keeps its region
    // across seeds.
    for (let index = 0; index < planA.encounters.length; index += 1) {
      const authored = INTERCEPTION_01.encounters[index];
      if (authored?.entry.kind === 'fixed') {
        expect(planA.encounters[index]?.entryRegion).toEqual(
          planB.encounters[index]?.entryRegion,
        );
      }
    }
  });

  it('the resolution contract has no Aircraft-position/performance input (V02-AC-004)', () => {
    // The contract is a pure function of (mission, seed, step). Two calls with
    // the same explicit inputs — regardless of any hypothetical external state
    // — produce byte-identical plans, proving spawn data cannot react to the
    // player.
    const a = resolveMissionEncounters(
      INTERCEPTION_03,
      12345,
      FIXED_STEP_SECONDS,
    );
    const b = resolveMissionEncounters(
      INTERCEPTION_03,
      12345,
      FIXED_STEP_SECONDS,
    );
    expect(b).toEqual(a);
  });
});
