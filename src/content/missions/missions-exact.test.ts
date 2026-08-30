import { describe, expect, it } from 'vitest';
import {
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  MISSIONS,
} from '../index';
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
    entry: { kind: 'unspecified' },
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
    entry: { kind: 'unspecified' },
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
    entry: { kind: 'unspecified' },
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
    entry: { kind: 'unspecified' },
    formation: 'authored-stagger',
  },
  {
    id: 'interception-02-e6',
    timeSeconds: 260,
    composition: [
      { type: 'basic-drone', count: 2 },
      { type: 'hunter-drone', count: 1 },
    ],
    entry: { kind: 'unspecified' },
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
    entry: { kind: 'unspecified' },
    formation: 'hunter-delayed',
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
    entry: { kind: 'unspecified' },
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
