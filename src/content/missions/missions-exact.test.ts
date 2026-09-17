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
 * V02-WI-03 correction C02 evidence: exhaustive exact-content assertions for
 * every ordered encounter in Interception 01–03 (id, timestamp, composition,
 * typed entry/formation/delay data with the delayed role, explicit absence of
 * unspecified entry regions, and the exact seeded pair) plus mutation-style
 * regressions that fail when a composition, role delay, encounter id, mission
 * order, registry member, seeded-pair order, or variant contract changes while
 * the aggregate totals remain unchanged.
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
    timeSeconds: 10,
    composition: [{ type: 'basic-drone', count: 4 }],
    entry: { kind: 'fixed', region: 'top' },
    formation: 'wide-top',
  },
  {
    id: 'interception-01-e2',
    timeSeconds: 55,
    composition: [
      { type: 'basic-drone', count: 2 },
      { type: 'ranged-drone', count: 1 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'centred-behind-basics',
    roleDelays: [{ type: 'ranged-drone', delaySeconds: 2 }],
  },
  {
    id: 'interception-01-e3',
    timeSeconds: 100,
    composition: [{ type: 'hunter-drone', count: 1 }],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: null,
  },
  {
    id: 'interception-01-e4',
    timeSeconds: 140,
    composition: [
      { type: 'basic-drone', count: 3 },
      { type: 'hunter-drone', count: 1 },
    ],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: null,
    roleDelays: [{ type: 'hunter-drone', delaySeconds: 3 }],
  },
  {
    id: 'interception-01-e5',
    timeSeconds: 190,
    composition: [
      { type: 'basic-drone', count: 3 },
      { type: 'ranged-drone', count: 1 },
      { type: 'hunter-drone', count: 1 },
    ],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: 'authored-stagger',
  },
];

const MISSION_02_ENCOUNTERS: readonly EncounterEvidence[] = [
  {
    id: 'interception-02-e1',
    timeSeconds: 10,
    composition: [{ type: 'basic-drone', count: 3 }],
    entry: { kind: 'fixed', region: 'top' },
    formation: 'offset-top',
  },
  {
    id: 'interception-02-e2',
    timeSeconds: 50,
    composition: [
      { type: 'basic-drone', count: 3 },
      { type: 'ranged-drone', count: 1 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'screened',
  },
  {
    id: 'interception-02-e3',
    timeSeconds: 100,
    composition: [
      { type: 'basic-drone', count: 2 },
      { type: 'ranged-drone', count: 2 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'separated-firing-lanes',
  },
  {
    id: 'interception-02-e4',
    timeSeconds: 150,
    composition: [{ type: 'basic-drone', count: 4 }],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: 'front-group-plus-delayed-flank',
  },
  {
    id: 'interception-02-e5',
    timeSeconds: 200,
    composition: [
      { type: 'basic-drone', count: 1 },
      { type: 'ranged-drone', count: 1 },
      { type: 'hunter-drone', count: 1 },
    ],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-02-e6',
    timeSeconds: 260,
    composition: [
      { type: 'basic-drone', count: 2 },
      { type: 'hunter-drone', count: 1 },
    ],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: 'asymmetric',
  },
];

const MISSION_03_ENCOUNTERS: readonly EncounterEvidence[] = [
  {
    id: 'interception-03-e1',
    timeSeconds: 10,
    composition: [
      { type: 'basic-drone', count: 3 },
      { type: 'ranged-drone', count: 1 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'screened',
    roleDelays: [{ type: 'ranged-drone', delaySeconds: 2 }],
  },
  {
    id: 'interception-03-e2',
    timeSeconds: 55,
    composition: [{ type: 'basic-drone', count: 3 }],
    entry: { kind: 'unspecified' },
    formation: 'flank-oriented',
  },
  {
    id: 'interception-03-e3',
    timeSeconds: 95,
    composition: [
      { type: 'basic-drone', count: 2 },
      { type: 'ranged-drone', count: 1 },
      { type: 'hunter-drone', count: 1 },
    ],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: 'hunter-delayed',
    roleDelays: [{ type: 'hunter-drone', delaySeconds: 2 }],
  },
  {
    id: 'interception-03-e4',
    timeSeconds: 140,
    composition: [
      { type: 'basic-drone', count: 2 },
      { type: 'ranged-drone', count: 2 },
    ],
    entry: { kind: 'unspecified' },
    formation: 'split-firing-lanes',
  },
  {
    id: 'interception-03-e5',
    timeSeconds: 190,
    composition: [
      { type: 'basic-drone', count: 1 },
      { type: 'hunter-drone', count: 1 },
    ],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: 'aggressive-interruption',
  },
  {
    id: 'interception-03-e6',
    timeSeconds: 235,
    composition: [{ type: 'basic-drone', count: 2 }],
    entry: { kind: 'unspecified' },
    formation: 'simple',
  },
  {
    id: 'interception-03-e7',
    timeSeconds: 275,
    composition: [{ type: 'hunter-drone', count: 1 }],
    entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
    formation: null,
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
    22, 27, 35,
  ]);
  expect(registry.map((mission) => mission.maximumSuccessPayout)).toEqual([
    30, 39, 51,
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
    // remain 12/2/3.
    const mutated = mutateEncounter(INTERCEPTION_01, (encounter, index) => {
      if (index === 0) {
        return {
          ...encounter,
          composition: [{ type: 'basic-drone', count: 3 }],
        };
      }
      if (index === 4) {
        return {
          ...encounter,
          composition: [
            { type: 'basic-drone', count: 4 },
            { type: 'ranged-drone', count: 1 },
            { type: 'hunter-drone', count: 1 },
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
    // M01 e2: Ranged +2 s must stay with the Ranged role.
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
    // M01 e2 Epic §8 names no entry region; assigning top must fail.
    const mutated = mutateEncounter(INTERCEPTION_01, (encounter, index) =>
      index === 1
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
    const reversed = mutateEncounter(INTERCEPTION_01, (encounter, index) =>
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
      expectCanonicalRegistry([reversed, INTERCEPTION_02, INTERCEPTION_03]),
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
  /** The exact authored staging for every Interception 01 encounter. */
  const MISSION_01_STAGING: readonly (readonly StagingGroupEvidence[])[] = [
    [
      // e1: +0 s wide-top 4 Basics at 0.2/0.4/0.6/0.8.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.2 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.4 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.6 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.8 } },
        ],
      },
    ],
    [
      // e2: +0 s two centred Basics, +2 s the Ranged at 0.5.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.4 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.6 } },
        ],
      },
      {
        offsetSeconds: 2,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.5 } },
        ],
      },
    ],
    [
      // e3: one seeded-side Hunter at 20% VH.
      {
        offsetSeconds: 0,
        members: [
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
        ],
      },
    ],
    [
      // e4: +0 s three Basics, +3 s the seeded-side Hunter at 20% VH.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.5 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      {
        offsetSeconds: 3,
        members: [
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
        ],
      },
    ],
    [
      // e5: one simultaneous spatial-stagger group
      // (Basic 0.2, Ranged 0.4, Basic 0.6, Basic 0.8, Hunter seeded-side).
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.2 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.4 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.6 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.8 } },
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
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
        ? [staging[0]!] // drop the second (Ranged) Arrival Group
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
              members: staging[0]!.members.slice(0, 4), // drop the Hunter
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
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 2 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [{ ...staging[0]!.members[0]!, type: 'basic-drone' }],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[2].staging[0].members[0].type',
    );
  });

  it('V02-WI-04 C03: the production validator rejects a placement kind change', () => {
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 2 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                {
                  ...staging[0]!.members[0]!,
                  placement: { kind: 'top', fraction: 0.5 },
                },
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[2].staging[0].members[0].placement.kind',
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
    const mutated = mutateStaging(INTERCEPTION_01, (staging, index) =>
      index === 2 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                {
                  ...staging[0]!.members[0]!,
                  placement: { kind: 'seeded-side', yViewportFraction: 0.25 },
                },
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[0].encounters[2].staging[0].members[0].placement.yViewportFraction',
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
  /** The exact authored staging for every Interception 02 encounter. */
  const MISSION_02_STAGING: readonly (readonly StagingGroupEvidence[])[] = [
    [
      // e1 (+0 s): 3 offset-Top Basics at 0.15/0.45/0.75.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.15 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.45 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
    ],
    [
      // e2: +0 s three Basics (0.25/0.5/0.75), +2 s the Ranged at 0.5.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.5 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      {
        offsetSeconds: 2,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.5 } },
        ],
      },
    ],
    [
      // e3 (+0 s): Basic 0.2, Ranged 0.3, Ranged 0.7, Basic 0.8.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.2 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.3 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.7 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.8 } },
        ],
      },
    ],
    [
      // e4: +0 s three Basics (0.25/0.5/0.75), +2 s the seeded-side Basic
      // flank at 25% VH (mission-data draw 0 of Mission 02).
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.5 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      {
        offsetSeconds: 2,
        members: [
          {
            type: 'basic-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.25 },
          },
        ],
      },
    ],
    [
      // e5: +0 s Basic 0.25, +1 s Ranged 0.55, +2 s seeded-side Hunter at
      // 20% VH (mission-data draw 1).
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
        ],
      },
      {
        offsetSeconds: 1,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.55 } },
        ],
      },
      {
        offsetSeconds: 2,
        members: [
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
        ],
      },
    ],
    [
      // e6 (+0 s, the single 04:20 creation step): Basic 0.35, Basic 0.65,
      // seeded-side Hunter at 20% VH (mission-data draw 2).
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
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
        ? [staging[0]!] // drop the delayed seeded-side Basic flank
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
    const mutated = mutateStaging(INTERCEPTION_02, (staging, index) =>
      index === 5 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                ...staging[0]!.members.slice(0, 2),
                {
                  ...staging[0]!.members[2]!,
                  placement: { kind: 'seeded-side', yViewportFraction: 0.3 },
                },
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[1].encounters[5].staging[0].members[2].placement.yViewportFraction',
    );
  });

  it('V02-WI-05: the production validator rejects a Mission 02 seeded-side member losing its seeded encounter entry', () => {
    const mutated: MissionDefinition = {
      ...INTERCEPTION_02,
      encounters: INTERCEPTION_02.encounters.map((encounter, index) =>
        index === 3
          ? { ...encounter, entry: { kind: 'unspecified' } }
          : encounter,
      ),
    };
    expectProductionValidatorRejects(
      mutated,
      'missions[1].encounters[3].staging[1].members[0].placement',
    );
  });
});

/**
 * V02-WI-06 E03 exhaustive Mission 03 Arrival Group evidence (Epic §8.3.1,
 * V02-DEC-032): the exact authored staging for every Interception 03 encounter,
 * the three `mission-data` side draws in `e3 delayed Hunter → e5 Hunter → e7
 * Hunter` order, the derived `35` maximum combat reward and `51` maximum
 * Success payout, and the path-qualified production-validator regressions that
 * reject any missing, reordered, substituted, duplicated, retimed, or
 * geometrically altered Mission 03 fact while every aggregate total stays
 * valid.
 */
describe('exhaustive Mission 03 Arrival Group evidence (Epic §8.3.1, V02-DEC-032, V02-WI-06 E03)', () => {
  interface StagingGroupEvidence {
    readonly offsetSeconds: number;
    readonly members: readonly {
      readonly type: string;
      readonly placement: unknown;
    }[];
  }
  /** The exact authored staging for every Interception 03 encounter. */
  const MISSION_03_STAGING: readonly (readonly StagingGroupEvidence[])[] = [
    [
      // e1: +0 s screened Basics at 0.25/0.5/0.75, +2 s the single Ranged.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.25 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.5 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.75 } },
        ],
      },
      {
        offsetSeconds: 2,
        members: [
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.5 } },
        ],
      },
    ],
    [
      // e2 (+0 s): flank-oriented Basics at 0.15/0.5/0.85.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.15 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.5 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.85 } },
        ],
      },
    ],
    [
      // e3: +0 s Basic 0.3, Ranged 0.5, Basic 0.7; +2 s the seeded-side Hunter
      // at 20% VH (the first mission-data draw).
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.3 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.5 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.7 } },
        ],
      },
      {
        offsetSeconds: 2,
        members: [
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
        ],
      },
    ],
    [
      // e4 (+0 s): split firing lanes, Basic 0.2, Ranged 0.3, Ranged 0.7,
      // Basic 0.8.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.2 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.3 } },
          { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.7 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.8 } },
        ],
      },
    ],

    [
      // e5 (+0 s): Basic 0.5 and the seeded-side Hunter at 20% VH arrive on the
      // same step (the second mission-data draw).
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.5 } },
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
        ],
      },
    ],
    [
      // e6 (+0 s): the recovery-window Basics at 0.35/0.65.
      {
        offsetSeconds: 0,
        members: [
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.35 } },
          { type: 'basic-drone', placement: { kind: 'top', fraction: 0.65 } },
        ],
      },
    ],
    [
      // e7 (+0 s): the pre-Elite seeded-side Hunter at 20% VH (the third
      // mission-data draw).
      {
        offsetSeconds: 0,
        members: [
          {
            type: 'hunter-drone',
            placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
          },
        ],
      },
    ],
    [
      // e8 (+0 s, the single 05:20 creation step): the Elite-only group at Top
      // fraction 0.5, consuming no mission-data draw.
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

  it('derives the canonical maximum combat reward 35 and maximum Success payout 51 from the authored staging and content rewards', () => {
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
      basic: 13,
      ranged: 4,
      hunter: 3,
      elite: 1,
    });
    expect(derivedCombatReward).toBe(35);
    expect(mission.maximumCombatReward).toBe(35);
    expect(mission.maximumSuccessPayout).toBe(51);
    expect(mission.maximumSuccessPayout).toBe(
      derivedCombatReward + mission.completionReward,
    );
    expect(mission.completionReward).toBe(16);
    expect(ELITE_DRONE.playerDestructionReward).toBe(8);
  });

  it('consumes exactly three mission-data draws in e3 delayed Hunter → e5 Hunter → e7 Hunter order and no draw for any Top member', () => {
    // The authored seeded encounter entries are the ONLY mission-data draw
    // consumers: exactly one binary side draw, in authored encounter order.
    const seededEncounters = INTERCEPTION_03.encounters.filter(
      (encounter) => encounter.entry.kind === 'seeded',
    );
    expect(seededEncounters.map((encounter) => encounter.id)).toEqual([
      'interception-03-e3',
      'interception-03-e5',
      'interception-03-e7',
    ]);
    const seededSideEncounters: string[] = [];
    let topMembers = 0;
    let seededSideMembers = 0;
    for (const encounter of INTERCEPTION_03.encounters) {
      for (const group of encounter.staging ?? []) {
        for (const member of group.members) {
          if (member.placement.kind === 'top') {
            topMembers += 1;
          } else {
            seededSideMembers += 1;
            if (!seededSideEncounters.includes(encounter.id)) {
              seededSideEncounters.push(encounter.id);
            }
          }
        }
      }
    }
    // 13 Basic + 4 Ranged + 3 Hunter + 1 Elite = 21 members, of which exactly
    // three are the seeded-side Hunters; the remaining 18 Top members —
    // including the Elite — consume no draw (V02-DEC-032).
    expect(topMembers).toBe(18);
    expect(seededSideMembers).toBe(3);
    expect(topMembers + seededSideMembers).toBe(21);
    expect(seededSideEncounters).toEqual([
      'interception-03-e3',
      'interception-03-e5',
      'interception-03-e7',
    ]);
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
              members: [{ ...staging[0]!.members[0]!, type: 'basic-drone' }],
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
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 4 && staging !== undefined
        ? [
            {
              ...staging[0]!,
              members: [
                staging[0]!.members[0]!,
                {
                  ...staging[0]!.members[1]!,
                  placement: { kind: 'seeded-side', yViewportFraction: 0.25 },
                },
              ],
            },
          ]
        : staging,
    );
    expectProductionValidatorRejects(
      mutated,
      'missions[2].encounters[4].staging[0].members[1].placement.yViewportFraction',
    );
  });

  it('V02-WI-06 E03: the production validator rejects a Mission 03 seeded-side member losing its seeded encounter entry', () => {
    const mutated: MissionDefinition = {
      ...INTERCEPTION_03,
      encounters: INTERCEPTION_03.encounters.map((encounter, index) =>
        index === 2
          ? { ...encounter, entry: { kind: 'unspecified' } }
          : encounter,
      ),
    };
    expectProductionValidatorRejects(mutated, 'missions[2].encounters[2]');
  });

  it('V02-WI-06 E03: the production validator rejects an incomplete Mission 03 staging (some encounters only)', () => {
    const mutated = mutateStaging(INTERCEPTION_03, (staging, index) =>
      index === 7 ? [] : staging,
    );
    expectProductionValidatorRejects(mutated, 'missions[2].encounters');
  });
});
