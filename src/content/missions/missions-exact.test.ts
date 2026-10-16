import { describe, expect, it } from 'vitest';
import {
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  MISSIONS,
} from '../index';
import {
  BASIC_DRONE,
  ELITE_DRONE,
  HUNTER_DRONE,
  RANGED_DRONE,
} from '../enemies';
import { isContentCatalogue, validateCatalogue } from '../validation';
import type { ContentValidationIssue } from '../validation';
import { contentCatalogueWith } from '@test-support/content';
import type { EncounterDefinition, MissionDefinition } from '../missions';

/**
 * V021-WI-01-C02 evidence: exhaustive exact-content assertions for every ordered
 * encounter in Interception 01–03 (id, timestamp, composition, typed
 * entry/formation/delay data with the delayed role, explicit absence of
 * unspecified entry regions, and the exact seeded pair) plus mutation-style
 * regressions that fail when a composition, role delay, encounter id, mission
 * order, registry member, seeded-pair order, or variant contract changes while
 * the aggregate totals remain unchanged. Interception 01 carries the v0.2.1
 * patch §2.1 authored staging (V021-AC-001): fixed Top entries, all five
 * `authored-stagger` formations, no role-level delay, 286/52/10 totals and the
 * `03:10` final member step. Interception 02 carries §2.2 (V021-AC-001):
 * 352/100/28 totals, fixed symmetric 4/6-Hunter side waves, no seeded side, and
 * the `04:20` final member step. Interception 03 carries §2.3 (V021-AC-001,
 * V021-DEC-003): 376/128/48/1 totals, 44 `authored-stagger` regular formations
 * with fixed symmetric Hunter waves only, no seeded entry, the preserved
 * Elite-only `05:20` group as the final arrival, and the `736`/`752` reward
 * arithmetic.
 */

/** Compact view of the authored encounter fields under test. */
type EncounterEvidence = Pick<
  EncounterDefinition,
  'id' | 'timeSeconds' | 'composition' | 'entry' | 'formation' | 'roleDelays'
>;

function evidence(encounter: EncounterDefinition): EncounterEvidence {
  return {
    id: encounter.id,
    timeSeconds: encounter.timeSeconds,
    composition: encounter.composition,
    entry: encounter.entry,
    formation: encounter.formation,
    ...(encounter.roleDelays === undefined
      ? {}
      : { roleDelays: encounter.roleDelays }),
  };
}

const MISSION_01_ENCOUNTERS: readonly EncounterEvidence[] = [
  {
    id: 'interception-01-e1',
    timeSeconds: 4,
    composition: [{ type: 'basic-drone', count: 92 }],
    entry: { kind: 'fixed', region: 'top' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-01-e2',
    timeSeconds: 55,
    composition: [
      { type: 'basic-drone', count: 62 },
      { type: 'ranged-drone', count: 10 },
    ],
    entry: { kind: 'fixed', region: 'top' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-01-e3',
    timeSeconds: 100,
    composition: [
      { type: 'basic-drone', count: 50 },
      { type: 'ranged-drone', count: 16 },
      { type: 'hunter-drone', count: 4 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-01-e4',
    timeSeconds: 140,
    composition: [
      { type: 'basic-drone', count: 74 },
      { type: 'ranged-drone', count: 22 },
      { type: 'hunter-drone', count: 4 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-01-e5',
    timeSeconds: 188.7,
    composition: [
      { type: 'basic-drone', count: 8 },
      { type: 'ranged-drone', count: 4 },
      { type: 'hunter-drone', count: 2 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
];

const MISSION_02_ENCOUNTERS: readonly EncounterEvidence[] = [
  {
    id: 'interception-02-e1',
    timeSeconds: 10,
    composition: [{ type: 'basic-drone', count: 80 }],
    entry: { kind: 'fixed', region: 'top' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-02-e2',
    timeSeconds: 50,
    composition: [
      { type: 'basic-drone', count: 68 },
      { type: 'ranged-drone', count: 28 },
    ],
    entry: { kind: 'fixed', region: 'top' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-02-e3',
    timeSeconds: 100,
    composition: [
      { type: 'basic-drone', count: 68 },
      { type: 'ranged-drone', count: 24 },
      { type: 'hunter-drone', count: 4 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-02-e4',
    timeSeconds: 150,
    composition: [
      { type: 'basic-drone', count: 58 },
      { type: 'ranged-drone', count: 20 },
      { type: 'hunter-drone', count: 14 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-02-e5',
    timeSeconds: 200,
    composition: [
      { type: 'basic-drone', count: 56 },
      { type: 'ranged-drone', count: 16 },
      { type: 'hunter-drone', count: 4 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-02-e6',
    timeSeconds: 244,
    composition: [
      { type: 'basic-drone', count: 22 },
      { type: 'ranged-drone', count: 12 },
      { type: 'hunter-drone', count: 6 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
];

const MISSION_03_ENCOUNTERS: readonly EncounterEvidence[] = [
  {
    id: 'interception-03-e1',
    timeSeconds: 10,
    composition: [
      { type: 'basic-drone', count: 60 },
      { type: 'ranged-drone', count: 12 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-03-e2',
    timeSeconds: 55,
    composition: [
      { type: 'basic-drone', count: 52 },
      { type: 'ranged-drone', count: 20 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-03-e3',
    timeSeconds: 95,
    composition: [
      { type: 'basic-drone', count: 50 },
      { type: 'ranged-drone', count: 16 },
      { type: 'hunter-drone', count: 10 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-03-e4',
    timeSeconds: 140,
    composition: [
      { type: 'basic-drone', count: 58 },
      { type: 'ranged-drone', count: 20 },
      { type: 'hunter-drone', count: 10 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-03-e5',
    timeSeconds: 190,
    composition: [
      { type: 'basic-drone', count: 48 },
      { type: 'ranged-drone', count: 20 },
      { type: 'hunter-drone', count: 12 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-03-e6',
    timeSeconds: 235,
    composition: [
      { type: 'basic-drone', count: 50 },
      { type: 'ranged-drone', count: 16 },
      { type: 'hunter-drone', count: 10 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-03-e7',
    timeSeconds: 275,
    composition: [
      { type: 'basic-drone', count: 58 },
      { type: 'ranged-drone', count: 24 },
      { type: 'hunter-drone', count: 6 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-03-e8',
    timeSeconds: 320,
    composition: [{ type: 'elite-drone', count: 1 }],
    entry: { kind: 'unspecified' },
    formation: 'upper-combat-zone',
  },
];
const EXPECTED_ENCOUNTERS = [
  MISSION_01_ENCOUNTERS,
  MISSION_02_ENCOUNTERS,
  MISSION_03_ENCOUNTERS,
];

function expectCanonicalRegistry(registry: readonly MissionDefinition[]): void {
  expect(registry.map((mission) => mission.id)).toEqual([
    'interception-01',
    'interception-02',
    'interception-03',
  ]);
  expect(registry.map((mission) => mission.displayName)).toEqual([
    'Interception 01',
    'Interception 02',
    'Interception 03',
  ]);
  expect(registry.map((mission) => mission.completionReward)).toEqual([
    8, 12, 16,
  ]);
  expect(registry.map((mission) => mission.unlocksMissionId)).toEqual([
    'interception-02',
    'interception-03',
    null,
  ]);
  expect(registry.map((mission) => mission.maximumCombatReward)).toEqual([
    410, 608, 736,
  ]);
  expect(registry.map((mission) => mission.maximumSuccessPayout)).toEqual([
    418, 620, 752,
  ]);
  expect(registry.map((mission) => mission.encounters.map(evidence))).toEqual(
    EXPECTED_ENCOUNTERS,
  );
}

/** Mutates every encounter of one canonical mission through `mutate`. */
function mutateEncounter(
  mission: MissionDefinition,
  mutate: (
    encounter: EncounterDefinition,
    index: number,
  ) => EncounterDefinition,
): MissionDefinition {
  return {
    ...mission,
    encounters: mission.encounters.map(mutate),
  };
}
describe('exact authored mission content (Epic §8.1–8.3, C02)', () => {
  it('matches the exhaustive canonical data for every ordered encounter', () => {
    expectCanonicalRegistry(MISSIONS);
    expect(MISSIONS[0]?.encounters).toHaveLength(5);
    expect(MISSIONS[1]?.encounters).toHaveLength(6);
    expect(MISSIONS[2]?.encounters).toHaveLength(8);
  });

  it('fails when a composition changes while the aggregate totals stay identical', () => {
    // Move one Basic from e1 to e5: per-encounter composition changes, totals
    // remain 286/52/10.
    const mutated = mutateEncounter(INTERCEPTION_01, (encounter, index) => {
      if (index === 0) {
        return {
          ...encounter,
          composition: [{ type: 'basic-drone', count: 91 }],
        };
      }
      if (index === 4) {
        return {
          ...encounter,
          composition: [
            { type: 'basic-drone', count: 9 },
            { type: 'ranged-drone', count: 4 },
            { type: 'hunter-drone', count: 2 },
          ],
        };
      }
      return encounter;
    });
    expect(() =>
      expectCanonicalRegistry([mutated, INTERCEPTION_02, INTERCEPTION_03]),
    ).toThrow();
  });

  it('fails when a role-level delay changes or moves to another role', () => {
    // v0.2.1 patch §2.1 authors no role-level delay on Mission 01; introducing
    // one for any role drifts from the canonical content.
    const mutated = mutateEncounter(INTERCEPTION_01, (encounter, index) =>
      index === 1
        ? {
            ...encounter,
            roleDelays: [{ type: 'hunter-drone', delaySeconds: 2 }],
          }
        : encounter,
    );
    expect(() =>
      expectCanonicalRegistry([mutated, INTERCEPTION_02, INTERCEPTION_03]),
    ).toThrow();
  });

  it('fails when an encounter id changes', () => {
    const mutated = mutateEncounter(INTERCEPTION_01, (encounter, index) =>
      index === 1 ? { ...encounter, id: 'interception-01-e9' } : encounter,
    );
    expect(() =>
      expectCanonicalRegistry([mutated, INTERCEPTION_02, INTERCEPTION_03]),
    ).toThrow();
  });

  it('fails when an unspecified entry region is invented as top', () => {
    // v0.2.1 patch §2.1 names no entry region for e3–e5; assigning top to e3
    // must fail.
    const mutated = mutateEncounter(INTERCEPTION_01, (encounter, index) =>
      index === 2
        ? { ...encounter, entry: { kind: 'fixed', region: 'top' } }
        : encounter,
    );
    expect(() =>
      expectCanonicalRegistry([mutated, INTERCEPTION_02, INTERCEPTION_03]),
    ).toThrow();
  });

  it('fails when the subject-specific qualitative formation is genericized', () => {
    // M03 e3 `Hunter delayed` must stay `hunter-delayed`, not generic `delayed`.
    const mutated = mutateEncounter(INTERCEPTION_03, (encounter, index) =>
      index === 2 ? { ...encounter, formation: 'delayed' as never } : encounter,
    );
    expect(() =>
      expectCanonicalRegistry([mutated, INTERCEPTION_01, INTERCEPTION_02]),
    ).toThrow();
  });

  it('fails when the seeded pair is reversed or changed', () => {
    // Mission 03 keeps the only remaining seeded-side pair; reversing its
    // canonical `upper-left`/`upper-right` order must fail.
    const reversed = mutateEncounter(INTERCEPTION_03, (encounter, index) =>
      index === 2
        ? {
            ...encounter,
            entry: {
              kind: 'seeded',
              variants: ['upper-right', 'upper-left'],
            } as never,
          }
        : encounter,
    );
    expect(() =>
      expectCanonicalRegistry([INTERCEPTION_01, INTERCEPTION_02, reversed]),
    ).toThrow();
  });

  it('fails when the mission order changes', () => {
    expect(() =>
      expectCanonicalRegistry([
        INTERCEPTION_01,
        INTERCEPTION_03,
        INTERCEPTION_02,
      ]),
    ).toThrow();
  });

  it('fails when a registry member is missing', () => {
    expect(() =>
      expectCanonicalRegistry([INTERCEPTION_01, INTERCEPTION_02]),
    ).toThrow();
  });
});

describe('exhaustive Mission 01 Arrival Group evidence (Epic §8.1.1, V02-DEC-021, V02-WI-04 C01)', () => {
  interface StagingGroupEvidence {
    readonly offsetSeconds: number;
    readonly members: readonly {
      readonly type: string;
      readonly placement: unknown;
    }[];
  }
  /** The exact authored v0.2.1 patch §2.1 staging for every Interception
   *  01 encounter: 26 formations projected into 80 Arrival Group rows (e1 23,
   *  e2 18, e3 15, e4 21, e5 3), every row at the fixed 0.65 s (39-step)
   *  interval, and the two opposite-side Hunters of every mixed block at
   *  Y = 0.20. The table is a direct transcription of the §2.1 template and
   *  formation-start tables expanded at that canonical row spacing. */
  const MISSION_01_STAGING: readonly (readonly StagingGroupEvidence[])[] = [
    // interception-01-e1
    [
      // block @ 00:04.00 row 1 (B16)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:04.00 row 2 (B16)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:04.00 row 3 (B16)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:04.00 row 4 (B16)
      {
        offsetSeconds: 1.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 1 (B12)
      {
        offsetSeconds: 6,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 2 (B12)
      {
        offsetSeconds: 6.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 3 (B12)
      {
        offsetSeconds: 7.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 1 (B12)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 2 (B12)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 3 (B12)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 1 (B12)
      {
        offsetSeconds: 22,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 2 (B12)
      {
        offsetSeconds: 22.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 3 (B12)
      {
        offsetSeconds: 23.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 1 (B12)
      {
        offsetSeconds: 30,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 2 (B12)
      {
        offsetSeconds: 30.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 3 (B12)
      {
        offsetSeconds: 31.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 1 (B16)
      {
        offsetSeconds: 38,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 2 (B16)
      {
        offsetSeconds: 38.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 3 (B16)
      {
        offsetSeconds: 39.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 4 (B16)
      {
        offsetSeconds: 39.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 1 (B12)
      {
        offsetSeconds: 46,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 2 (B12)
      {
        offsetSeconds: 46.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 3 (B12)
      {
        offsetSeconds: 47.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-01-e2
    [
      // block @ 00:55.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:55.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:55.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:03.00 row 1 (BR12)
      {
        offsetSeconds: 8,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:03.00 row 2 (BR12)
      {
        offsetSeconds: 8.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:03.00 row 3 (BR12)
      {
        offsetSeconds: 9.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:11.00 row 1 (BR12)
      {
        offsetSeconds: 16,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:11.00 row 2 (BR12)
      {
        offsetSeconds: 16.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:11.00 row 3 (BR12)
      {
        offsetSeconds: 17.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:19.00 row 1 (BR12)
      {
        offsetSeconds: 24,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:19.00 row 2 (BR12)
      {
        offsetSeconds: 24.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:19.00 row 3 (BR12)
      {
        offsetSeconds: 25.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:27.00 row 1 (B12)
      {
        offsetSeconds: 32,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:27.00 row 2 (B12)
      {
        offsetSeconds: 32.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:27.00 row 3 (B12)
      {
        offsetSeconds: 33.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:35.00 row 1 (BR12)
      {
        offsetSeconds: 40,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:35.00 row 2 (BR12)
      {
        offsetSeconds: 40.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:35.00 row 3 (BR12)
      {
        offsetSeconds: 41.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-01-e3
    [
      // block @ 01:40.00 row 1 (BRH14)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
        ],
      },
      // block @ 01:40.00 row 2 (BRH14)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:40.00 row 3 (BRH14)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:48.00 row 1 (BR18)
      {
        offsetSeconds: 8,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 01:48.00 row 2 (BR18)
      {
        offsetSeconds: 8.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 01:48.00 row 3 (BR18)
      {
        offsetSeconds: 9.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 01:56.00 row 1 (BR12)
      {
        offsetSeconds: 16,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:56.00 row 2 (BR12)
      {
        offsetSeconds: 16.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:56.00 row 3 (BR12)
      {
        offsetSeconds: 17.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:04.00 row 1 (BRH14)
      {
        offsetSeconds: 24,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
        ],
      },
      // block @ 02:04.00 row 2 (BRH14)
      {
        offsetSeconds: 24.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:04.00 row 3 (BRH14)
      {
        offsetSeconds: 25.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:12.00 row 1 (BR12)
      {
        offsetSeconds: 32,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:12.00 row 2 (BR12)
      {
        offsetSeconds: 32.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:12.00 row 3 (BR12)
      {
        offsetSeconds: 33.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-01-e4
    [
      // block @ 02:20.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:20.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:20.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:27.00 row 1 (BRH14)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
        ],
      },
      // block @ 02:27.00 row 2 (BRH14)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:27.00 row 3 (BRH14)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:34.00 row 1 (BR18)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 02:34.00 row 2 (BR18)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 02:34.00 row 3 (BR18)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 02:41.00 row 1 (BR12)
      {
        offsetSeconds: 21,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:41.00 row 2 (BR12)
      {
        offsetSeconds: 21.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:41.00 row 3 (BR12)
      {
        offsetSeconds: 22.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:48.00 row 1 (BRH14)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
        ],
      },
      // block @ 02:48.00 row 2 (BRH14)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:48.00 row 3 (BRH14)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:55.00 row 1 (BR18)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 02:55.00 row 2 (BR18)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 02:55.00 row 3 (BR18)
      {
        offsetSeconds: 36.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      // block @ 03:02.00 row 1 (BR12)
      {
        offsetSeconds: 42,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:02.00 row 2 (BR12)
      {
        offsetSeconds: 42.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:02.00 row 3 (BR12)
      {
        offsetSeconds: 43.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-01-e5
    [
      // block @ 03:08.70 row 1 (BRH14)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
        ],
      },
      // block @ 03:08.70 row 2 (BRH14)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:08.70 row 3 (BRH14)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
  ];

  function expectCanonicalStaging(
    registry: readonly MissionDefinition[],
  ): void {
    expect(
      registry[0]?.encounters.map((encounter) => encounter.staging),
    ).toStrictEqual(MISSION_01_STAGING);
  }

  function mutateStaging(
    mission: MissionDefinition,
    mutate: (staging: EncounterDefinition['staging'], index: number) => unknown,
  ): MissionDefinition {
    return {
      ...mission,
      encounters: mission.encounters.map((encounter, index) => ({
        ...encounter,
        ...(encounter.staging === undefined
          ? {}
          : {
              staging: mutate(
                encounter.staging,
                index,
              ) as typeof encounter.staging,
            }),
      })),
    };
  }

  /** Builds a full catalogue with a mutated Mission 01 at registry position 0. */
  function registryWithMission01(mutated: MissionDefinition): {
    missions: readonly MissionDefinition[];
  } {
    return { missions: [mutated, INTERCEPTION_02, INTERCEPTION_03] };
  }

  /** Asserts the production validator rejects the mutated catalogue with a
   *  path-qualified issue under the staged Mission 01 encounter. */
  function expectProductionValidatorRejects(
    mutated: MissionDefinition,
    expectedPathPrefix: string,
  ): void {
    const catalogue = contentCatalogueWith(registryWithMission01(mutated));
    expect(isContentCatalogue(catalogue)).toBe(false);
    const issues = validateCatalogue(catalogue);
    const matching = issues.filter((issue) =>
      issue.path.startsWith(expectedPathPrefix),
    );
    expect(matching.length).toBeGreaterThan(0);
  }

  it('matches the exhaustive Mission 01 Arrival Groups exactly (offsets, member order, roles, placements, fractions, Side Y)', () => {
    // Supplementary exact-content evidence only: the production validator is
    // the acceptance owner (every mutation below calls validateCatalogue /
    // isContentCatalogue).
    expectCanonicalStaging(MISSIONS);
  });

  it('V02-WI-04 C03: the production validator rejects a Mission 01 encounter losing its staging', () => {
    const mutated: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 2
          ? ({
              ...encounter,
              staging: undefined,
            } as unknown as EncounterDefinition)
          : encounter,
      ),
    };
    expectProductionValidatorRejects(mutated, 'missions[0].encounters');
  });

  it('V02-WI-04 C03: the production validator rejects an Arrival Group count change', () => {
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 1 && staging !== undefined
        ? [staging[0]!] // keep only the first §2.1 row
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[1].staging',
    );
  });

  it('V02-WI-04 C03: the production validator rejects an Arrival Group order swap', () => {
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 1 && staging !== undefined
        ? [staging[1]!, staging[0]!]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[1].staging[0].offsetSeconds',
    );
  });

  it('V02-WI-04 C03: the production validator rejects an Arrival Group offset change', () => {
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 1 && staging !== undefined
        ? staging.map((group, groupIndex) =>
            groupIndex === 1 ? { ...group, offsetSeconds: 3 } : group,
          )
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[1].staging[1].offsetSeconds',
    );
  });

  it('V02-WI-04 C03: the production validator rejects a member count change', () => {
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 4 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: staging[0]!.members.slice(0, 4), // drop the two Hunters
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[4].staging[0].members',
    );
  });

  it('V02-WI-04 C03: the production validator rejects member order changes', () => {
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 0 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                staging[0]!.members[1]!,
                staging[0]!.members[0]!,
                staging[0]!.members[2]!,
                staging[0]!.members[3]!,
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[0].staging[0].members[0].placement.fraction',
    );
  });

  it('V02-WI-04 C03: the production validator rejects a member role change', () => {
    // v0.2.1 patch §2.1: the Row-0 members 4/5 of the e3 `BRH14` block are the
    // authored Hunters; re-typing one as a Basic is a member role drift.
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 2 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                ...staging[0]!.members.slice(0, 4),
                { ...staging[0]!.members[4]!, type: 'basic-drone' },
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[2].staging[0].members[4].type',
    );
  });

  it('V02-WI-04 C03: the production validator rejects a placement kind change', () => {
    // v0.2.1 patch §2.1: the Row-0 `fixed-side` Hunter of e3 must keep its
    // authored kind; turning it into a Top member is a placement drift.
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 2 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: staging[0]!.members.map((member, memberIndex) =>
                memberIndex === 4
                  ? {
                      ...member,
                      placement: { kind: 'top', fraction: 0.5 },
                    }
                  : member,
              ),
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[2].staging[0].members[4].placement.kind',
    );
  });

  it('V02-WI-04 C03: the production validator rejects a Top placement fraction change', () => {
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 4 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                {
                  ...staging[0]!.members[0]!,
                  placement: { kind: 'top', fraction: 0.3 },
                },
                ...staging[0]!.members.slice(1),
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[4].staging[0].members[0].placement.fraction',
    );
  });

  it('V02-WI-04 C03: the production validator rejects a Side Y fraction change', () => {
    // v0.2.1 patch §2.1: the authored `fixed-side` Hunter Y is exactly 0.20.
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 2 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: staging[0]!.members.map((member, memberIndex) =>
                memberIndex === 4
                  ? {
                      ...member,
                      placement: {
                        kind: 'fixed-side',
                        side: 'upper-left',
                        yViewportFraction: 0.25,
                      },
                    }
                  : member,
              ),
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[2].staging[0].members[4].placement.yViewportFraction',
    );
  });

  it('V02-WI-06 E03: Mission 03 must carry its exact authored Arrival Groups on every encounter', () => {
    const missing: MissionDefinition = {
      ...INTERCEPTION_03,
      encounters: INTERCEPTION_03.encounters.map((encounter, index) =>
        index === 3
          ? ({
              ...encounter,
              staging: undefined,
            } as unknown as EncounterDefinition)
          : encounter,
      ),
    };
    const catalogue = contentCatalogueWith({
      missions: [INTERCEPTION_01, INTERCEPTION_02, missing],
    });
    expect(isContentCatalogue(catalogue)).toBe(false);
    const issues = validateCatalogue(catalogue);
    expect(
      issues.some(
        (issue: ContentValidationIssue) =>
          issue.path === 'missions[2].encounters' &&
          /every Interception 03 encounter/.test(issue.message),
      ),
    ).toBe(true);
  });
});

/**
 * V02-WI-05 exact Mission 02 Arrival Group evidence (Epic §8.2.1,
 * V02-DEC-026): the exhaustive authored staging for every Interception 02
 * encounter and the path-qualified production-validator regressions that
 * reject any drift from the canonical projection.
 */
describe('exhaustive Mission 02 Arrival Group evidence (Epic §8.2.1, V02-DEC-026, V02-WI-05)', () => {
  interface StagingGroupEvidence {
    readonly offsetSeconds: number;
    readonly members: readonly {
      readonly type: string;
      readonly placement: unknown;
    }[];
  }
  /** The exact authored v0.2.1 patch §2.2 staging for every Interception 02
   *  encounter: 35 formations projected into 112 Arrival Group rows (e1 20,
   *  e2 24, e3 23, e4 19, e5 18, e6 8) at the canonical 0.65 s (39-step) row
   *  spacing, with fixed symmetric 4/6-Hunter side waves and no seeded side.
   *  The table transcribes the §2.2 template and formation-start tables. */
  const MISSION_02_STAGING: readonly (readonly StagingGroupEvidence[])[] = [
    // interception-02-e1
    [
      // block @ 00:10.00 row 1 (B16)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 2 (B16)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 3 (B16)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 4 (B16)
      {
        offsetSeconds: 1.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 1 (B16)
      {
        offsetSeconds: 8,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 2 (B16)
      {
        offsetSeconds: 8.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 3 (B16)
      {
        offsetSeconds: 9.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 4 (B16)
      {
        offsetSeconds: 9.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 1 (B16)
      {
        offsetSeconds: 16,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 2 (B16)
      {
        offsetSeconds: 16.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 3 (B16)
      {
        offsetSeconds: 17.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 4 (B16)
      {
        offsetSeconds: 17.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 1 (B16)
      {
        offsetSeconds: 24,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 2 (B16)
      {
        offsetSeconds: 24.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 3 (B16)
      {
        offsetSeconds: 25.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 4 (B16)
      {
        offsetSeconds: 25.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 1 (B16)
      {
        offsetSeconds: 32,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 2 (B16)
      {
        offsetSeconds: 32.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 3 (B16)
      {
        offsetSeconds: 33.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 4 (B16)
      {
        offsetSeconds: 33.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-02-e2
    [
      // block @ 00:50.00 row 1 (R4-12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 2 (R4-12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 3 (R4-12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:57.00 row 1 (R4-16)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:57.00 row 2 (R4-16)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:57.00 row 3 (R4-16)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:57.00 row 4 (R4-16)
      {
        offsetSeconds: 8.95,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:04.00 row 1 (R4-12)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:04.00 row 2 (R4-12)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:04.00 row 3 (R4-12)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:11.00 row 1 (R4-16)
      {
        offsetSeconds: 21,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:11.00 row 2 (R4-16)
      {
        offsetSeconds: 21.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:11.00 row 3 (R4-16)
      {
        offsetSeconds: 22.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:11.00 row 4 (R4-16)
      {
        offsetSeconds: 22.95,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:18.00 row 1 (R4-12)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:18.00 row 2 (R4-12)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:18.00 row 3 (R4-12)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:25.00 row 1 (R4-16)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:25.00 row 2 (R4-16)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:25.00 row 3 (R4-16)
      {
        offsetSeconds: 36.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:25.00 row 4 (R4-16)
      {
        offsetSeconds: 36.95,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:32.00 row 1 (R4-12)
      {
        offsetSeconds: 42,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:32.00 row 2 (R4-12)
      {
        offsetSeconds: 42.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:32.00 row 3 (R4-12)
      {
        offsetSeconds: 43.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-02-e3
    [
      // block @ 01:40.00 row 1 (R4-16)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:40.00 row 2 (R4-16)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:40.00 row 3 (R4-16)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:40.00 row 4 (R4-16)
      {
        offsetSeconds: 1.95,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:47.00 row 1 (R4-12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:47.00 row 2 (R4-12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:47.00 row 3 (R4-12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:54.00 row 1 (R4-16)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:54.00 row 2 (R4-16)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:54.00 row 3 (R4-16)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:54.00 row 4 (R4-16)
      {
        offsetSeconds: 15.95,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:00.00 row 1 (H4-12)
      {
        offsetSeconds: 20,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.25,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.25,
            },
          },
        ],
      },
      // block @ 02:00.00 row 2 (H4-12)
      {
        offsetSeconds: 20.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:08.00 row 1 (R4-12)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:08.00 row 2 (R4-12)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:08.00 row 3 (R4-12)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:15.00 row 1 (R4-16)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:15.00 row 2 (R4-16)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:15.00 row 3 (R4-16)
      {
        offsetSeconds: 36.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:15.00 row 4 (R4-16)
      {
        offsetSeconds: 36.95,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:22.00 row 1 (R4-12)
      {
        offsetSeconds: 42,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:22.00 row 2 (R4-12)
      {
        offsetSeconds: 42.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:22.00 row 3 (R4-12)
      {
        offsetSeconds: 43.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-02-e4
    [
      // block @ 02:30.00 row 1 (H4-12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.25,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.25,
            },
          },
        ],
      },
      // block @ 02:30.00 row 2 (H4-12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:37.00 row 1 (R4-12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:37.00 row 2 (R4-12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:37.00 row 3 (R4-12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:44.00 row 1 (RH6-16)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 02:44.00 row 2 (RH6-16)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:51.00 row 1 (R4-12)
      {
        offsetSeconds: 21,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:51.00 row 2 (R4-12)
      {
        offsetSeconds: 21.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:51.00 row 3 (R4-12)
      {
        offsetSeconds: 22.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:58.00 row 1 (R4-16)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:58.00 row 2 (R4-16)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:58.00 row 3 (R4-16)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:58.00 row 4 (R4-16)
      {
        offsetSeconds: 29.95,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:05.00 row 1 (H4-12)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.25,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.25,
            },
          },
        ],
      },
      // block @ 03:05.00 row 2 (H4-12)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:12.00 row 1 (R4-12)
      {
        offsetSeconds: 42,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:12.00 row 2 (R4-12)
      {
        offsetSeconds: 42.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:12.00 row 3 (R4-12)
      {
        offsetSeconds: 43.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-02-e5
    [
      // block @ 03:20.00 row 1 (R4-12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:20.00 row 2 (R4-12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:20.00 row 3 (R4-12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:27.00 row 1 (R4-12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:27.00 row 2 (R4-12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:27.00 row 3 (R4-12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:34.00 row 1 (R4-12)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:34.00 row 2 (R4-12)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:34.00 row 3 (R4-12)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:42.00 row 1 (H4-12)
      {
        offsetSeconds: 22,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.25,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.25,
            },
          },
        ],
      },
      // block @ 03:42.00 row 2 (H4-12)
      {
        offsetSeconds: 22.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:49.00 row 1 (R4-12)
      {
        offsetSeconds: 29,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:49.00 row 2 (R4-12)
      {
        offsetSeconds: 29.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:49.00 row 3 (R4-12)
      {
        offsetSeconds: 30.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:56.00 row 1 (B16)
      {
        offsetSeconds: 36,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:56.00 row 2 (B16)
      {
        offsetSeconds: 36.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:56.00 row 3 (B16)
      {
        offsetSeconds: 37.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:56.00 row 4 (B16)
      {
        offsetSeconds: 37.95,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-02-e6
    [
      // block @ 04:04.00 row 1 (RH6-16)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 04:04.00 row 2 (RH6-16)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:11.00 row 1 (R4-12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:11.00 row 2 (R4-12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:11.00 row 3 (R4-12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:18.70 row 1 (R4-12)
      {
        offsetSeconds: 14.7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:18.70 row 2 (R4-12)
      {
        offsetSeconds: 15.35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:18.70 row 3 (R4-12)
      {
        offsetSeconds: 16,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
  ];

  it('matches the exhaustive Mission 02 Arrival Groups exactly (offsets, member order, roles, placements, fractions, Side Y)', () => {
    expect(
      MISSIONS[1]?.encounters.map((encounter) => encounter.staging),
    ).toStrictEqual(MISSION_02_STAGING);
  });

  function mutateStaging(
    mission: MissionDefinition,
    mutate: (staging: EncounterDefinition['staging'], index: number) => unknown,
  ): MissionDefinition {
    return {
      ...mission,
      encounters: mission.encounters.map((encounter, index) => ({
        ...encounter,
        ...(encounter.staging === undefined
          ? {}
          : {
              staging: mutate(
                encounter.staging,
                index,
              ) as typeof encounter.staging,
            }),
      })),
    };
  }

  function expectProductionValidatorRejects(
    mutated: MissionDefinition,
    expectedPathPrefix: string,
  ): void {
    const catalogue = contentCatalogueWith({
      missions: [INTERCEPTION_01, mutated, INTERCEPTION_03],
    });
    expect(isContentCatalogue(catalogue)).toBe(false);
    const issues = validateCatalogue(catalogue);
    const matching = issues.filter((issue) =>
      issue.path.startsWith(expectedPathPrefix),
    );
    expect(matching.length).toBeGreaterThan(0);
  }

  it('V02-WI-05: the production validator rejects a Mission 02 encounter losing its staging', () => {
    const mutated: MissionDefinition = {
      ...INTERCEPTION_02,
      encounters: INTERCEPTION_02.encounters.map((encounter, index) =>
        index === 3
          ? encounter.staging === undefined
            ? encounter
            : ({
                ...encounter,
                staging: undefined,
              } as unknown as EncounterDefinition)
          : encounter,
      ),
    };
    expectProductionValidatorRejects(mutated, 'missions[1].encounters');
  });

  it('V02-WI-05: the production validator rejects a Mission 02 Arrival Group count change', () => {
    const mutated = mutateStaging(INTERCEPTION_02, (staging, index) =>
      index === 3 && staging !== undefined
        ? [staging[0]!] // keep only the first fixed-side 4-Hunter wave row
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[1].encounters[3].staging',
    );
  });

  it('V02-WI-05: the production validator rejects a Mission 02 offset change', () => {
    const mutated = mutateStaging(INTERCEPTION_02, (staging, index) =>
      index === 4 && staging !== undefined
        ? staging.map((group, groupIndex) =>
            groupIndex === 2 ? { ...group, offsetSeconds: 3 } : group,
          )
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[1].encounters[4].staging[2].offsetSeconds',
    );
  });

  it('V02-WI-05: the production validator rejects a Mission 02 Top fraction change', () => {
    const mutated = mutateStaging(INTERCEPTION_02, (staging, index) =>
      index === 5 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                {
                  ...staging[0]!.members[0]!,
                  placement: { kind: 'top', fraction: 0.4 },
                },
                ...staging[0]!.members.slice(1),
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[1].encounters[5].staging[0].members[0].placement.fraction',
    );
  });

  it('V02-WI-05: the production validator rejects a Mission 02 Side Y fraction change', () => {
    // v0.2.1 patch §2.2: every authored fixed-side Hunter Y is exact.
    const mutated = mutateStaging(INTERCEPTION_02, (staging, index) =>
      index === 5 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: staging[0]!.members.map((member, memberIndex) =>
                memberIndex === 6
                  ? {
                      ...member,
                      placement: {
                        kind: 'fixed-side',
                        side: 'upper-left',
                        yViewportFraction: 0.35,
                      },
                    }
                  : member,
              ),
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[1].encounters[5].staging[0].members[6].placement.yViewportFraction',
    );
  });

  it('V02-WI-05: the production validator rejects a Mission 02 seeded-side member replacing an authored fixed-side Hunter', () => {
    // v0.2.1 patch §2.2 consumes no seeded-side draw in Mission 02, so a
    // `seeded-side` placement must be rejected. e4's `RH6-16` row is group 5.
    const mutated = mutateStaging(INTERCEPTION_02, (staging, index) =>
      index === 3 && staging !== undefined
        ? staging.map((group, groupIndex) =>
            groupIndex === 5
              ? {
                  ...group,
                  members: group.members.map((member, memberIndex) =>
                    memberIndex === 6
                      ? {
                          ...member,
                          placement: {
                            kind: 'seeded-side',
                            yViewportFraction: 0.1,
                          },
                        }
                      : member,
                  ),
                }
              : group,
          )
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[1].encounters[3].staging[5].members[6].placement.kind',
    );
  });
});

/**
 * V021-WI-02 exhaustive Mission 03 Arrival Group evidence (Epic §8.3.1,
 * V021-DEC-003): the exact authored staging for every Interception 03 encounter,
 * no `mission-data` draw at all, the derived `736` maximum combat reward and
 * `752` maximum Success payout, and the path-qualified
 * production-validator regressions that
 * reject any missing, reordered, substituted, duplicated, retimed, or
 * geometrically altered Mission 03 fact while every aggregate total stays
 * valid.
 */
describe('exhaustive Mission 03 Arrival Group evidence (Epic §8.3.1, V021-DEC-003, V02-WI-06 E03)', () => {
  interface StagingGroupEvidence {
    readonly offsetSeconds: number;
    readonly members: readonly {
      readonly type: string;
      readonly placement: unknown;
    }[];
  }
  /** The exact authored v0.2.1 patch §2.3 staging for every Interception 03
   *  encounter (V021-DEC-003): 44 regular formations projected into 123 Arrival
   *  Group rows (e1 18, e2 18, e3 16, e4 19, e5 16, e6 16, e7 20) at the fixed
   *  0.65 s (39-step) row interval, plus the preserved Elite-only `05:20`
   *  group. The table is a direct transcription of the §2.3 template and
   *  formation-start tables expanded at that canonical row spacing. */
  const MISSION_03_STAGING: readonly (readonly StagingGroupEvidence[])[] = [
    // interception-03-e1
    [
      // block @ 00:10.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:10.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 1 (B12)
      {
        offsetSeconds: 8,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 2 (B12)
      {
        offsetSeconds: 8.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:18.00 row 3 (B12)
      {
        offsetSeconds: 9.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 1 (BR12)
      {
        offsetSeconds: 16,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 2 (BR12)
      {
        offsetSeconds: 16.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:26.00 row 3 (BR12)
      {
        offsetSeconds: 17.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 1 (B12)
      {
        offsetSeconds: 24,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 2 (B12)
      {
        offsetSeconds: 24.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:34.00 row 3 (B12)
      {
        offsetSeconds: 25.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 1 (BR12)
      {
        offsetSeconds: 32,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 2 (BR12)
      {
        offsetSeconds: 32.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:42.00 row 3 (BR12)
      {
        offsetSeconds: 33.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 1 (B12)
      {
        offsetSeconds: 40,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 2 (B12)
      {
        offsetSeconds: 40.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:50.00 row 3 (B12)
      {
        offsetSeconds: 41.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-03-e2
    [
      // block @ 00:55.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:55.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 00:55.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:02.00 row 1 (BR12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:02.00 row 2 (BR12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:02.00 row 3 (BR12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:09.00 row 1 (BR12)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:09.00 row 2 (BR12)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:09.00 row 3 (BR12)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:16.00 row 1 (BR12)
      {
        offsetSeconds: 21,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:16.00 row 2 (BR12)
      {
        offsetSeconds: 21.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:16.00 row 3 (BR12)
      {
        offsetSeconds: 22.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:23.00 row 1 (BR12)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:23.00 row 2 (BR12)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:23.00 row 3 (BR12)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:30.00 row 1 (B12)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:30.00 row 2 (B12)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:30.00 row 3 (B12)
      {
        offsetSeconds: 36.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-03-e3
    [
      // block @ 01:35.00 row 1 (RH6-16)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 01:35.00 row 2 (RH6-16)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:43.00 row 1 (BR12)
      {
        offsetSeconds: 8,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:43.00 row 2 (BR12)
      {
        offsetSeconds: 8.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:43.00 row 3 (BR12)
      {
        offsetSeconds: 9.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:51.00 row 1 (BR12)
      {
        offsetSeconds: 16,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:51.00 row 2 (BR12)
      {
        offsetSeconds: 16.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:51.00 row 3 (BR12)
      {
        offsetSeconds: 17.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:59.00 row 1 (BR12)
      {
        offsetSeconds: 24,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:59.00 row 2 (BR12)
      {
        offsetSeconds: 24.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 01:59.00 row 3 (BR12)
      {
        offsetSeconds: 25.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:07.00 row 1 (H4-12)
      {
        offsetSeconds: 32,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.25,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.25,
            },
          },
        ],
      },
      // block @ 02:07.00 row 2 (H4-12)
      {
        offsetSeconds: 32.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:15.00 row 1 (B12)
      {
        offsetSeconds: 40,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:15.00 row 2 (B12)
      {
        offsetSeconds: 40.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:15.00 row 3 (B12)
      {
        offsetSeconds: 41.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-03-e4
    [
      // block @ 02:20.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:20.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:20.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:27.00 row 1 (BR12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:27.00 row 2 (BR12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:27.00 row 3 (BR12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:34.00 row 1 (B12)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:34.00 row 2 (B12)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:34.00 row 3 (B12)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:41.00 row 1 (H4-12)
      {
        offsetSeconds: 21,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.25,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.25,
            },
          },
        ],
      },
      // block @ 02:41.00 row 2 (H4-12)
      {
        offsetSeconds: 21.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:48.00 row 1 (BR12)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:48.00 row 2 (BR12)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:48.00 row 3 (BR12)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:55.00 row 1 (BR12)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:55.00 row 2 (BR12)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 02:55.00 row 3 (BR12)
      {
        offsetSeconds: 36.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:02.00 row 1 (RH6-16)
      {
        offsetSeconds: 42,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 03:02.00 row 2 (RH6-16)
      {
        offsetSeconds: 42.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-03-e5
    [
      // block @ 03:10.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:10.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:10.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:18.00 row 1 (B12)
      {
        offsetSeconds: 8,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:18.00 row 2 (B12)
      {
        offsetSeconds: 8.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:18.00 row 3 (B12)
      {
        offsetSeconds: 9.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:26.00 row 1 (RH6-16)
      {
        offsetSeconds: 16,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 03:26.00 row 2 (RH6-16)
      {
        offsetSeconds: 16.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:34.00 row 1 (BR12)
      {
        offsetSeconds: 24,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:34.00 row 2 (BR12)
      {
        offsetSeconds: 24.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:34.00 row 3 (BR12)
      {
        offsetSeconds: 25.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:42.00 row 1 (BR12)
      {
        offsetSeconds: 32,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:42.00 row 2 (BR12)
      {
        offsetSeconds: 32.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:42.00 row 3 (BR12)
      {
        offsetSeconds: 33.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:50.00 row 1 (RH6-16)
      {
        offsetSeconds: 40,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 03:50.00 row 2 (RH6-16)
      {
        offsetSeconds: 40.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-03-e6
    [
      // block @ 03:55.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:55.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 03:55.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:02.00 row 1 (B12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:02.00 row 2 (B12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:02.00 row 3 (B12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:09.00 row 1 (H4-12)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.25,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.15,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.25,
            },
          },
        ],
      },
      // block @ 04:09.00 row 2 (H4-12)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:16.00 row 1 (BR12)
      {
        offsetSeconds: 21,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:16.00 row 2 (BR12)
      {
        offsetSeconds: 21.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:16.00 row 3 (BR12)
      {
        offsetSeconds: 22.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:23.00 row 1 (BR12)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:23.00 row 2 (BR12)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:23.00 row 3 (BR12)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:30.00 row 1 (RH6-16)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 04:30.00 row 2 (RH6-16)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-03-e7
    [
      // block @ 04:35.00 row 1 (BR12)
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:35.00 row 2 (BR12)
      {
        offsetSeconds: 0.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:35.00 row 3 (BR12)
      {
        offsetSeconds: 1.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:42.00 row 1 (B12)
      {
        offsetSeconds: 7,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:42.00 row 2 (B12)
      {
        offsetSeconds: 7.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:42.00 row 3 (B12)
      {
        offsetSeconds: 8.3,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:49.00 row 1 (BR12)
      {
        offsetSeconds: 14,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:49.00 row 2 (BR12)
      {
        offsetSeconds: 14.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:49.00 row 3 (BR12)
      {
        offsetSeconds: 15.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:56.00 row 1 (BR12)
      {
        offsetSeconds: 21,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:56.00 row 2 (BR12)
      {
        offsetSeconds: 21.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 04:56.00 row 3 (BR12)
      {
        offsetSeconds: 22.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 05:03.00 row 1 (BR12)
      {
        offsetSeconds: 28,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 05:03.00 row 2 (BR12)
      {
        offsetSeconds: 28.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 05:03.00 row 3 (BR12)
      {
        offsetSeconds: 29.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 05:10.00 row 1 (RH6-16)
      {
        offsetSeconds: 35,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.55 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-left',
              yViewportFraction: 0.3,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.1,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.2,
            },
          },
          {
            type: 'hunter-drone',
            placement: {
              kind: 'fixed-side',
              side: 'upper-right',
              yViewportFraction: 0.3,
            },
          },
        ],
      },
      // block @ 05:10.00 row 2 (RH6-16)
      {
        offsetSeconds: 35.65,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 05:18.00 row 1 (BR12)
      {
        offsetSeconds: 43,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 05:18.00 row 2 (BR12)
      {
        offsetSeconds: 43.65,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
      // block @ 05:18.00 row 3 (BR12)
      {
        offsetSeconds: 44.3,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.32 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.44 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.56 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.68 } },
        ],
      },
    ],
    // interception-03-e8
    [
      // the preserved Elite-only `05:20` group
      {
        offsetSeconds: 0,
        members: [
          { type: 'elite-drone', placement: { kind: 'top', fraction: 0.5 } },
        ],
      },
    ],
  ];

  function expectCanonicalStaging(
    registry: readonly MissionDefinition[],
  ): void {
    expect(
      registry[2]?.encounters.map((encounter) => encounter.staging),
    ).toStrictEqual(MISSION_03_STAGING);
  }

  function mutateStaging(
    mission: MissionDefinition,
    mutate: (staging: EncounterDefinition['staging'], index: number) => unknown,
  ): MissionDefinition {
    return {
      ...mission,
      encounters: mission.encounters.map((encounter, index) => ({
        ...encounter,
        ...(encounter.staging === undefined
          ? {}
          : {
              staging: mutate(
                encounter.staging,
                index,
              ) as typeof encounter.staging,
            }),
      })),
    };
  }

  /** Builds a full catalogue with a mutated Mission 03 at registry position 2. */
  function registryWithMission03(mutated: MissionDefinition): {
    missions: readonly MissionDefinition[];
  } {
    return { missions: [INTERCEPTION_01, INTERCEPTION_02, mutated] };
  }

  /** Asserts the production validator rejects the mutated catalogue with a
   *  path-qualified issue under the staged Mission 03 encounter. */
  function expectProductionValidatorRejects(
    mutated: MissionDefinition,
    expectedPathPrefix: string,
  ): void {
    const catalogue = contentCatalogueWith(registryWithMission03(mutated));
    expect(isContentCatalogue(catalogue)).toBe(false);
    const issues = validateCatalogue(catalogue);
    const matching = issues.filter((issue) =>
      issue.path.startsWith(expectedPathPrefix),
    );
    expect(matching.length).toBeGreaterThan(0);
  }

  it('matches the exhaustive Mission 03 Arrival Groups exactly (offsets, member order, roles, placements, fractions, Side Y)', () => {
    expectCanonicalStaging(MISSIONS);
  });

  it('derives the canonical maximum combat reward 736 and maximum Success payout 752 from the authored staging and content rewards', () => {
    const mission = INTERCEPTION_03;
    const rewardByType: Readonly<Record<string, number>> = {
      'basic-drone': BASIC_DRONE.playerDestructionReward,
      'ranged-drone': RANGED_DRONE.playerDestructionReward,
      'hunter-drone': HUNTER_DRONE.playerDestructionReward,
      'elite-drone': ELITE_DRONE.playerDestructionReward,
    };
    const stagedTotals = { basic: 0, ranged: 0, hunter: 0, elite: 0 };
    let derivedCombatReward = 0;
    for (const encounter of mission.encounters) {
      for (const group of encounter.staging ?? []) {
        for (const member of group.members) {
          const reward = rewardByType[member.type];
          expect(reward).toBeDefined();
          derivedCombatReward += reward ?? 0;
          if (member.type === 'basic-drone') {
            stagedTotals.basic += 1;
          } else if (member.type === 'ranged-drone') {
            stagedTotals.ranged += 1;
          } else if (member.type === 'hunter-drone') {
            stagedTotals.hunter += 1;
          } else {
            stagedTotals.elite += 1;
          }
        }
      }
    }
    expect(stagedTotals).toEqual(mission.totals);
    expect(stagedTotals).toEqual({
      basic: 376,
      ranged: 128,
      hunter: 48,
      elite: 1,
    });
    expect(derivedCombatReward).toBe(736);
    expect(mission.maximumCombatReward).toBe(736);
    expect(mission.maximumSuccessPayout).toBe(752);
    expect(mission.maximumSuccessPayout).toBe(
      derivedCombatReward + mission.completionReward,
    );
    expect(mission.completionReward).toBe(16);
    expect(ELITE_DRONE.playerDestructionReward).toBe(8);
  });

  it('consumes zero mission-data draws: no seeded entry and no seeded-side member survives in Mission 03', () => {
    // V021-DEC-003: the three seeded Hunter side draws of the superseded
    // schedule are gone. The authored fixed symmetric side waves are content,
    // not stream draws, so no Encounter resolves a `mission-data` draw at all.
    const seededEncounters = INTERCEPTION_03.encounters.filter(
      (encounter) => encounter.entry.kind === 'seeded',
    );
    expect(seededEncounters).toEqual([]);
    let topMembers = 0;
    let fixedSideMembers = 0;
    for (const encounter of INTERCEPTION_03.encounters) {
      for (const group of encounter.staging ?? []) {
        for (const member of group.members) {
          if (member.placement.kind === 'top') {
            topMembers += 1;
          } else {
            expect(member.placement.kind).toBe('fixed-side');
            fixedSideMembers += 1;
          }
        }
      }
    }
    // 376 Basic + 128 Ranged + 48 Hunter + 1 Elite = 553 members. The 48 Hunters
    // are the only fixed-side members; the remaining 505 Top members — including
    // the preserved Elite — consume no draw either.
    expect(topMembers).toBe(505);
    expect(fixedSideMembers).toBe(48);
    expect(topMembers + fixedSideMembers).toBe(553);
    expect(INTERCEPTION_03.encounters[7]?.staging?.[0]?.members).toEqual([
      { type: 'elite-drone', placement: { kind: 'top', fraction: 0.5 } },
    ]);
  });

  it('V02-WI-06 E03: the production validator rejects a Mission 03 Arrival Group count change', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 0 && staging !== undefined
        ? [staging[0]!] // drop the delayed e1 Ranged group
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[0].staging',
    );
  });

  it('V02-WI-06 E03: the production validator rejects a Mission 03 Arrival Group order swap', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 0 && staging !== undefined
        ? [staging[1]!, staging[0]!]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[0].staging[0].offsetSeconds',
    );
  });

  it('V02-WI-06 E03: the production validator rejects a retimed Mission 03 Arrival Group offset', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 2 && staging !== undefined
        ? staging.map((group, groupIndex) =>
            groupIndex === 1 ? { ...group, offsetSeconds: 3 } : group,
          )
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[2].staging[1].offsetSeconds',
    );
  });

  it('V02-WI-06 E03: the production validator rejects a substituted Mission 03 member role', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 6 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [{ ...staging[0]!.members[0]!, type: 'hunter-drone' }],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[6].staging[0].members[0].type',
    );
  });

  it('V02-WI-06 E03: the production validator rejects a substituted Mission 03 Elite group member', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 7 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [{ ...staging[0]!.members[0]!, type: 'hunter-drone' }],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[7].staging[0].members[0].type',
    );
  });

  it('V02-WI-06 E03: the production validator rejects a duplicated Mission 03 member', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 5 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                staging[0]!.members[0]!,
                staging[0]!.members[0]!,
                staging[0]!.members[1]!,
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[5].staging[0].members',
    );
  });

  it('V02-WI-06 E03: the production validator rejects an altered Mission 03 Top fraction', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 1 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                staging[0]!.members[0]!,
                {
                  ...staging[0]!.members[1]!,
                  placement: { kind: 'top', fraction: 0.55 },
                },
                staging[0]!.members[2]!,
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[1].staging[0].members[1].placement.fraction',
    );
  });

  it('V02-WI-06 E03: the production validator rejects an altered Mission 03 Elite geometry', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 7 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                {
                  ...staging[0]!.members[0]!,
                  placement: { kind: 'top', fraction: 0.4 },
                },
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[7].staging[0].members[0].placement.fraction',
    );
  });

  it('V02-WI-06 E03: the production validator rejects an altered Mission 03 Side Y fraction', () => {
    // e5's third formation is the 03:26 `RH6-16` wave at group index 6 (the
    // 03:10 `BR12` owns groups 0–2 and the 03:18 `B12` groups 3–5): six Top
    // Basics followed by three fixed-side Hunters per side. Member 6 is the
    // first left-side Hunter at Y = 0.10 VH.
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 4 && staging !== undefined
        ? staging.map((group, groupIndex) =>
            groupIndex === 6
              ? {
                  ...group,
                  members: [
                    ...group.members.slice(0, 6),
                    {
                      ...group.members[6]!,
                      placement: {
                        kind: 'fixed-side',
                        side: 'upper-left',
                        yViewportFraction: 0.25,
                      },
                    },
                    ...group.members.slice(7),
                  ],
                }
              : group,
          )
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[4].staging[6].members[6].placement.yViewportFraction',
    );
  });

  it('V02-WI-06 E03: the production validator rejects a Mission 03 encounter inventing an unused seeded entry (phantom mission-data draw)', () => {
    const mutated: MissionDefinition = {
      ...INTERCEPTION_03,
      encounters: INTERCEPTION_03.encounters.map((encounter, index) =>
        index === 2
          ? {
              ...encounter,
              entry: {
                kind: 'seeded',
                variants: ['upper-left', 'upper-right'],
              },
            }
          : encounter,
      ),
    };
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[2].staging',
    );
  });

  it('V02-WI-06 E03: the production validator rejects an incomplete Mission 03 staging (some encounters only)', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 7 ? [] : staging,
    );
    expectProductionValidatorRejects(mutated, 'missions[2].encounters');
  });
});
