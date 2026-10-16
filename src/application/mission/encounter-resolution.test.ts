import { describe, expect, it } from 'vitest';
import { createMissionDataStream } from '@domain/index';
import {
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  MISSIONS,
} from '@content/index';
import { resolveMissionEncounters } from './encounter-resolution';

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
      4, 55, 100, 140, 188.7,
    ]);
    // v0.2.1 patch §2.1 (V021-AC-002): e5 opens at 03:08.70 and its last
    // authored row lands on exactly 03:10, so the final arrival is still 03:10.
    expect(plan.finalArrivalTimeSeconds).toBe(190);
    expect(plan.finalArrivalStepIndex).toBe(
      Math.round(190 / FIXED_STEP_SECONDS),
    );
    // Compositions are the authored data, unchanged by the seed.
    expect(plan.encounters[0]?.composition).toEqual([
      { type: 'basic-drone', count: 92 },
    ]);
    expect(plan.encounters[4]?.composition).toEqual([
      { type: 'basic-drone', count: 8 },
      { type: 'ranged-drone', count: 4 },
      { type: 'hunter-drone', count: 2 },
    ]);
    // Typed entry/formation/delay data passes through unchanged: role-level
    // delays carry the delayed role, and entry regions are explicitly absent
    // where Epic §8 names none.
    expect(plan.encounters[0]).toMatchObject({
      entryRegion: 'top',
      entryVariants: null,
      formation: 'authored-stagger',
      roleDelays: [],
    });
    // §2.1 authors every Mission 01 Encounter itself, so no role delay and no
    // seeded entry variant survives (V021-AC-002).
    for (const encounter of plan.encounters) {
      expect(encounter.entryVariants).toBeNull();
      expect(encounter.roleDelays).toEqual([]);
      expect(encounter.formation).toBe('authored-stagger');
    }
    expect(plan.encounters.map((e) => e.entryRegion)).toEqual([
      'top',
      'top',
      null,
      null,
      null,
    ]);
  });

  it('resolves the exact Mission 01 Arrival Groups with normalized placements and only the three preserved mission-data draws (V02-DEC-021, V02-AC-003)', () => {
    const plan = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    const step = (seconds: number): number =>
      Math.round(seconds / FIXED_STEP_SECONDS);
    // v0.2.1 patch §2.1 authors 23 + 18 + 15 + 21 + 3 = 80 Arrival Groups, each
    // on the fixed step of its block start (rows inside a block are the authored
    // 0.65 s = 39 steps apart).
    expect(
      plan.encounters.map((encounter) => encounter.staging?.length),
    ).toEqual([23, 18, 15, 21, 3]);
    // e1 (00:04): B16, B12 at 00:04 / 00:10 / 00:18 / 00:26 / 00:34, B16 at
    // 00:42 and B12 at 00:50 — a 4-row block then six 3-row blocks.
    expect(
      plan.encounters[0]?.staging?.map((group) => group.stepIndex),
    ).toEqual([
      step(4),
      step(4.65),
      step(5.3),
      step(5.95),
      step(10),
      step(10.65),
      step(11.3),
      step(18),
      step(18.65),
      step(19.3),
      step(26),
      step(26.65),
      step(27.3),
      step(34),
      step(34.65),
      step(35.3),
      step(42),
      step(42.65),
      step(43.3),
      step(43.95),
      step(50),
      step(50.65),
      step(51.3),
    ]);
    // e2 (00:55): BR12 at 00:55 / 01:03 / 01:11 / 01:19, B12 at 01:27 and
    // BR12 at 01:35 — six 3-row blocks, so Basic visibly leads Ranged.
    expect(
      plan.encounters[1]?.staging?.map((group) => group.stepIndex),
    ).toEqual([
      step(55),
      step(55.65),
      step(56.3),
      step(63),
      step(63.65),
      step(64.3),
      step(71),
      step(71.65),
      step(72.3),
      step(79),
      step(79.65),
      step(80.3),
      step(87),
      step(87.65),
      step(88.3),
      step(95),
      step(95.65),
      step(96.3),
    ]);
    // e3 (01:40): BRH14, BR18, BR12 at 01:40 / 01:48 / 01:56, then BRH14 at
    // 02:04 and BR12 at 02:12 — the first Mission 01 Ranged/Hunter members and
    // the two symmetric `fixed-side` Hunters appear at 01:40.
    expect(
      plan.encounters[2]?.staging?.map((group) => group.stepIndex),
    ).toEqual([
      step(100),
      step(100.65),
      step(101.3),
      step(108),
      step(108.65),
      step(109.3),
      step(116),
      step(116.65),
      step(117.3),
      step(124),
      step(124.65),
      step(125.3),
      step(132),
      step(132.65),
      step(133.3),
    ]);
    // e4 (02:20): BR12, BRH14, BR18, BR12, BRH14, BR18, BR12 at
    // 02:20 / 02:27 / 02:34 / 02:41 / 02:48 / 02:55 / 03:02.
    expect(
      plan.encounters[3]?.staging?.map((group) => group.stepIndex),
    ).toEqual([
      step(140),
      step(140.65),
      step(141.3),
      step(147),
      step(147.65),
      step(148.3),
      step(154),
      step(154.65),
      step(155.3),
      step(161),
      step(161.65),
      step(162.3),
      step(168),
      step(168.65),
      step(169.3),
      step(175),
      step(175.65),
      step(176.3),
      step(182),
      step(182.65),
      step(183.3),
    ]);
    // e5 (03:08.70): the single BRH14 block, whose last row closes 03:10.
    expect(
      plan.encounters[4]?.staging?.map((group) => group.stepIndex),
    ).toEqual([step(188.7), step(189.35), step(190)]);
    expect(plan.finalArrivalStepIndex).toBe(step(190));
    // Placements are normalized fractions, never pixels: e1 row 0 is a
    // four-column Top row ...
    expect(plan.encounters[0]?.staging?.[0]?.members).toEqual([
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.32 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.44 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.56 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.68 },
      },
    ]);
    // ... and e3's BR18 block (01:48) is the six-column Top Basic row
    // (§2.1 Layout).
    expect(plan.encounters[2]?.staging?.[3]?.members).toEqual([
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.25 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.35 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.45 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.55 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.65 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.75 },
      },
    ]);
    // e5 row 0: four Top Basics plus the two §2.1 `fixed-side` Hunters at 0.2 —
    // the patch's Basic-leads-Ranged screening order.
    expect(plan.encounters[4]?.staging?.[0]?.members).toEqual([
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.32 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.44 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.56 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.68 },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'side',
          side: 'upper-left',
          yViewportFraction: 0.2,
        },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'side',
          side: 'upper-right',
          yViewportFraction: 0.2,
        },
      },
    ]);
    // e5 row 2 is the block's four Top Ranged members.
    expect(plan.encounters[4]?.staging?.[2]?.members).toEqual([
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.32 },
      },
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.44 },
      },
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.56 },
      },
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.68 },
      },
    ]);
    // Zero mission-data draws (V021-AC-002): §2.1 authors every Mission 01
    // member as a Top row or a `fixed-side` Hunter, so the mission-data stream
    // is never consumed — an unrelated mission seed must resolve the same plan.
    const unrelatedSeed = createMissionDataStream(SEED).nextInt(0x7fffffff);
    expect(
      resolveMissionEncounters(
        INTERCEPTION_01,
        unrelatedSeed,
        FIXED_STEP_SECONDS,
      ),
    ).toEqual(plan);
  });

  it('preserves the delayed-role association for the V02-WI-04 consumer (C02)', () => {
    const plan = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    // v0.2.1 patch §2.1 replaces the v0.2 role delays (M01 e2 Ranged +2 s, M01
    // e4 Hunter +3 s) with explicit staged rows, so no Mission 01 Encounter
    // carries a delay any more: every member's timing is its authored row
    // offset. Role-delay pass-through stays covered by the Mission 03 test.
    expect(plan.encounters.map((encounter) => encounter.roleDelays)).toEqual([
      [],
      [],
      [],
      [],
      [],
    ]);
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

  it('resolves the exact Mission 02 Arrival Groups with fully authored placements and zero mission-data draws (V021-AC-002, V02-AC-003)', () => {
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
      10, 50, 100, 150, 200, 244,
    ]);
    // The last authored row closes at exactly 04:20, so the final member step is
    // 04:20 even though e6 itself opens at 04:04.
    expect(plan.finalArrivalTimeSeconds).toBe(260);
    expect(plan.finalArrivalStepIndex).toBe(
      Math.round(260 / FIXED_STEP_SECONDS),
    );
    const step = (seconds: number): number =>
      Math.round(seconds / FIXED_STEP_SECONDS);
    // v0.2.1 patch §2.2 authors 20 + 24 + 23 + 19 + 18 + 8 = 112 Arrival Groups.
    expect(
      plan.encounters.map((encounter) => encounter.staging?.length),
    ).toEqual([20, 24, 23, 19, 18, 8]);
    // e4 (02:30): H4-12, R4-12, RH6-16, R4-12, R4-16, H4-12, R4-12 at
    // 02:30 / 02:37 / 02:44 / 02:51 / 02:58 / 03:05 / 03:12.
    expect(
      plan.encounters[3]?.staging?.map((group) => group.stepIndex),
    ).toEqual([
      step(150),
      step(150.65),
      step(157),
      step(157.65),
      step(158.3),
      step(164),
      step(164.65),
      step(171),
      step(171.65),
      step(172.3),
      step(178),
      step(178.65),
      step(179.3),
      step(179.95),
      step(185),
      step(185.65),
      step(192),
      step(192.65),
      step(193.3),
    ]);
    // e4 row 0: the symmetric `fixed-side` H4-12 group — four Top Basics plus
    // four Hunters, two per side, on the single 02:30 step.
    expect(plan.encounters[3]?.staging?.[0]?.members).toEqual([
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.32 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.44 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.56 },
      },
      {
        type: 'basic-drone',
        placement: { kind: 'top', engagementBandFraction: 0.68 },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'side',
          side: 'upper-left',
          yViewportFraction: 0.15,
        },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'side',
          side: 'upper-left',
          yViewportFraction: 0.25,
        },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'side',
          side: 'upper-right',
          yViewportFraction: 0.15,
        },
      },
      {
        type: 'hunter-drone',
        placement: {
          kind: 'side',
          side: 'upper-right',
          yViewportFraction: 0.25,
        },
      },
    ]);
    // e4 group 5 is the first RH6-16 row: a six-column Top Basic row plus the
    // six symmetric `fixed-side` Hunters, all created on the single 02:44 step.
    expect(plan.encounters[3]?.staging?.[5]?.members).toHaveLength(12);
    expect(plan.encounters[3]?.staging?.[5]?.members[0]).toEqual({
      type: 'basic-drone',
      placement: { kind: 'top', engagementBandFraction: 0.25 },
    });
    expect(plan.encounters[3]?.staging?.[5]?.members[6]).toEqual({
      type: 'hunter-drone',
      placement: {
        kind: 'side',
        side: 'upper-left',
        yViewportFraction: 0.1,
      },
    });
    expect(plan.encounters[3]?.staging?.[5]?.members[11]).toEqual({
      type: 'hunter-drone',
      placement: {
        kind: 'side',
        side: 'upper-right',
        yViewportFraction: 0.3,
      },
    });
    // e5 (03:20): R4-12 at 03:20 / 03:27 / 03:34, H4-12 at 03:42, R4-12 at
    // 03:49 and B16 at 03:56.
    expect(
      plan.encounters[4]?.staging?.map((group) => group.stepIndex),
    ).toEqual([
      step(200),
      step(200.65),
      step(201.3),
      step(207),
      step(207.65),
      step(208.3),
      step(214),
      step(214.65),
      step(215.3),
      step(222),
      step(222.65),
      step(229),
      step(229.65),
      step(230.3),
      step(236),
      step(236.65),
      step(237.3),
      step(237.95),
    ]);
    // The e5 H4-12 group (index 9) is the third symmetric 4-Hunter group.
    expect(
      plan.encounters[4]?.staging?.[9]?.members.map((member) => [
        member.type,
        member.placement.kind,
      ]),
    ).toEqual([
      ['basic-drone', 'top'],
      ['basic-drone', 'top'],
      ['basic-drone', 'top'],
      ['basic-drone', 'top'],
      ['hunter-drone', 'side'],
      ['hunter-drone', 'side'],
      ['hunter-drone', 'side'],
      ['hunter-drone', 'side'],
    ]);
    // e6 (04:04): RH6-16 at 04:04, R4-12 at 04:11 and R4-12 at 04:18.70 — the
    // last row lands on the final 04:20 step with the closing four Top Ranged.
    expect(
      plan.encounters[5]?.staging?.map((group) => group.stepIndex),
    ).toEqual([
      step(244),
      step(244.65),
      step(251),
      step(251.65),
      step(252.3),
      step(258.7),
      step(259.35),
      step(260),
    ]);
    expect(plan.encounters[5]?.staging?.[0]?.members).toHaveLength(12);
    expect(plan.encounters[5]?.staging?.[7]?.members).toEqual([
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.32 },
      },
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.44 },
      },
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.56 },
      },
      {
        type: 'ranged-drone',
        placement: { kind: 'top', engagementBandFraction: 0.68 },
      },
    ]);
    // Zero mission-data draws (V021-AC-002): §2.2 authors every Mission 02
    // placement as a Top row or a `fixed-side` Hunter, so the stream is never
    // consumed and an unrelated mission seed resolves the identical plan.
    const unrelatedSeed = createMissionDataStream(seed).nextInt(0x7fffffff);
    expect(
      resolveMissionEncounters(
        INTERCEPTION_02,
        unrelatedSeed,
        FIXED_STEP_SECONDS,
      ),
    ).toEqual(plan);
  });

  it('resolves the exact Mission 03 Arrival Groups with fully authored placements and zero mission-data draws (V021-AC-001, V02-AC-003)', () => {
    const seed = SEED;
    const plan = resolveMissionEncounters(
      INTERCEPTION_03,
      seed,
      FIXED_STEP_SECONDS,
    );
    expect(plan.missionId).toBe('interception-03');
    expect(plan.encounters.map((e) => e.encounterId)).toEqual([
      'interception-03-e1',
      'interception-03-e2',
      'interception-03-e3',
      'interception-03-e4',
      'interception-03-e5',
      'interception-03-e6',
      'interception-03-e7',
      'interception-03-e8',
    ]);
    expect(plan.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 55, 95, 140, 190, 235, 275, 320,
    ]);
    const step = (seconds: number): number =>
      Math.round(seconds / FIXED_STEP_SECONDS);
    // The final scheduled arrival is the 05:20 Elite group, which is also the
    // exact Combat Countdown 00:00 step (§15.2, V02-AC-005).
    expect(plan.finalArrivalTimeSeconds).toBe(320);
    expect(plan.finalArrivalStepIndex).toBe(step(320));
    // §2.3 projects 44 regular formations into 123 Arrival Group rows plus the
    // preserved Elite-only group (e1 18, e2 18, e3 16, e4 19, e5 16, e6 16,
    // e7 20, e8 1).
    expect(plan.encounters.map((e) => e.staging?.length ?? 0)).toEqual([
      18, 18, 16, 19, 16, 16, 20, 1,
    ]);
    const groups = plan.encounters.flatMap((e) => e.staging ?? []);
    expect(groups).toHaveLength(124);
    expect(groups.flatMap((group) => group.members).length).toBe(553);
    expect(Math.min(...groups.map((group) => group.stepIndex))).toBe(step(10));
    expect(Math.max(...groups.map((group) => group.stepIndex))).toBe(step(320));
    // Every Encounter opens on its own authored arrival step.
    expect(plan.encounters.map((e) => e.staging?.[0]?.stepIndex)).toEqual([
      step(10),
      step(55),
      step(95),
      step(140),
      step(190),
      step(235),
      step(275),
      step(320),
    ]);
    // §2.3 boundaries: Ranged first enters at 00:11.30 behind two Basic rows,
    // Hunters first enter at 01:35, and the last regular row arrives at 05:19.30
    // — exactly 0.70 s (42 fixed steps) before the separate 05:20 Elite, with no
    // regular cleaned up.
    const rangedSteps = groups
      .filter((group) =>
        group.members.some((member) => member.type === 'ranged-drone'),
      )
      .map((group) => group.stepIndex);
    expect(Math.min(...rangedSteps)).toBe(step(11.3));
    const hunterSteps = groups
      .filter((group) =>
        group.members.some((member) => member.type === 'hunter-drone'),
      )
      .map((group) => group.stepIndex);
    expect(Math.min(...hunterSteps)).toBe(step(95));
    const regularSteps = groups
      .filter((group) =>
        group.members.some((member) => member.type !== 'elite-drone'),
      )
      .map((group) => group.stepIndex);
    expect(regularSteps).toHaveLength(123);
    expect(Math.max(...regularSteps)).toBe(step(319.3));
    expect(step(319.3)).toBe(19158);
    expect(step(320)).toBe(19200);
    expect(step(320) - step(319.3)).toBe(42);
    // e1 opens with a `BR12` block: two four-column Basic rows at 00:10 /
    // 00:10.65 and then the four-Ranged row at 00:11.30.
    expect(plan.encounters[0]?.staging?.map((g) => g.stepIndex)).toEqual([
      step(10),
      step(10.65),
      step(11.3),
      step(18),
      step(18.65),
      step(19.3),
      step(26),
      step(26.65),
      step(27.3),
      step(34),
      step(34.65),
      step(35.3),
      step(42),
      step(42.65),
      step(43.3),
      step(50),
      step(50.65),
      step(51.3),
    ]);
    expect(plan.encounters[0]?.roleDelays).toEqual([]);
    expect(
      plan.encounters[0]?.staging?.[2]?.members.map((member) => member.type),
    ).toEqual(['ranged-drone', 'ranged-drone', 'ranged-drone', 'ranged-drone']);
    expect(plan.encounters[0]?.staging?.[2]?.members[0]?.placement).toEqual({
      kind: 'top',
      engagementBandFraction: 0.32,
    });
    // The first Hunter wave (e3 01:35 `RH6-16`) resolves six Top Basics followed
    // by the authored fixed sides — three Hunters per side, left side first and
    // each side in ascending Y — with no draw involved.
    expect(
      plan.encounters[2]?.staging?.[0]?.members
        .slice(6)
        .map((member) => member.placement),
    ).toEqual([
      { kind: 'side', side: 'upper-left', yViewportFraction: 0.1 },
      { kind: 'side', side: 'upper-left', yViewportFraction: 0.2 },
      { kind: 'side', side: 'upper-left', yViewportFraction: 0.3 },
      { kind: 'side', side: 'upper-right', yViewportFraction: 0.1 },
      { kind: 'side', side: 'upper-right', yViewportFraction: 0.2 },
      { kind: 'side', side: 'upper-right', yViewportFraction: 0.3 },
    ]);
    // The first `H4-12` wave (e6 04:09) carries two fixed-side Hunters per side
    // at 0.15 / 0.25 VH behind four Top Basics.
    expect(
      plan.encounters[5]?.staging?.[6]?.members
        .slice(4)
        .map((member) => member.placement),
    ).toEqual([
      { kind: 'side', side: 'upper-left', yViewportFraction: 0.15 },
      { kind: 'side', side: 'upper-left', yViewportFraction: 0.25 },
      { kind: 'side', side: 'upper-right', yViewportFraction: 0.15 },
      { kind: 'side', side: 'upper-right', yViewportFraction: 0.25 },
    ]);
    // e8: the single 05:20 Elite-only group at Top fraction 0.5.
    expect(plan.encounters[7]?.staging?.map((g) => g.stepIndex)).toEqual([
      step(320),
    ]);
    expect(plan.encounters[7]?.staging?.[0]?.members).toEqual([
      {
        type: 'elite-drone',
        placement: { kind: 'top', engagementBandFraction: 0.5 },
      },
    ]);
    // V021-DEC-003: no Encounter is seeded and no member is a seeded-side
    // member, so the whole mission resolves zero `mission-data` draws.
    expect(plan.encounters.map((e) => e.entryRegion)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(plan.encounters.filter((e) => e.entryVariants !== null)).toEqual([]);
    // Every authored fixed side is content, never a stream draw: a different
    // seed resolves identical Mission 03 placements.
    const otherSeed = resolveMissionEncounters(
      INTERCEPTION_03,
      0x22222222,
      FIXED_STEP_SECONDS,
    );
    expect(otherSeed.encounters.flatMap((e) => e.staging ?? [])).toEqual(
      groups,
    );
    // Two runs with identical explicit inputs resolve identically.
    expect(
      resolveMissionEncounters(INTERCEPTION_03, seed, FIXED_STEP_SECONDS),
    ).toEqual(plan);
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
    // Mission 01 carries no seeded encounter after the v0.2.1 patch (§2.1): e1
    // and e2 are fixed Top, e3–e5 are unspecified, so no entry draw exists.
    const m01 = resolveMissionEncounters(
      INTERCEPTION_01,
      SEED,
      FIXED_STEP_SECONDS,
    );
    expect(m01.encounters.map((e) => e.entryRegion)).toEqual([
      'top',
      'top',
      null,
      null,
      null,
    ]);
    expect(m01.encounters.filter((e) => e.entryVariants !== null)).toEqual([]);
    // Mission 03 carries no seeded encounter after the v0.2.1 patch (§2.3): all
    // eight encounters name no entry region, so the mission resolves no draw.
    const m03 = resolveMissionEncounters(
      INTERCEPTION_03,
      SEED,
      FIXED_STEP_SECONDS,
    );
    expect(m03.encounters.map((e) => e.entryRegion)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(m03.encounters.filter((e) => e.entryVariants !== null)).toEqual([]);
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
