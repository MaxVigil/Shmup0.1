import { describe, expect, it } from 'vitest';
import { contentCatalogueWith } from '@test-support/content';
import {
  BASIC_DRONE,
  CANNON,
  CONTENT_CATALOGUE,
  GERMAN_FIGHTER,
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  MACHINE_GUN,
  PILOTS,
  PLAYER_PROJECTILE,
} from '../index';
import type { MissionDefinition } from '../missions';
import type { WeaponDefinition } from '../weapons';
import { isContentCatalogue, validateCatalogue } from './validate-catalogue';

describe('validateCatalogue', () => {
  it('accepts the canonical catalogue with no issues', () => {
    expect(validateCatalogue(CONTENT_CATALOGUE)).toEqual([]);
  });

  it('rejects an empty aircraft list', () => {
    const issues = validateCatalogue(contentCatalogueWith({ aircraft: [] }));
    expect(issues.some((issue) => issue.path === 'aircraft')).toBe(true);
  });

  it('rejects a weapon with non-positive damage without repairing it', () => {
    const invalidWeapon: WeaponDefinition = { ...MACHINE_GUN, damage: 0 };
    const issues = validateCatalogue(
      contentCatalogueWith({ weapons: [invalidWeapon] }),
    );
    expect(issues).toEqual([
      {
        path: 'weapons[0].damage',
        message: 'must be a positive integer',
      },
    ]);
  });

  it('rejects a weapon with non-positive fire rate', () => {
    const invalidWeapon: WeaponDefinition = { ...CANNON, fireRate: 0 };
    const issues = validateCatalogue(
      contentCatalogueWith({ weapons: [invalidWeapon] }),
    );
    expect(issues.some((issue) => issue.path === 'weapons[0].fireRate')).toBe(
      true,
    );
  });

  it('rejects duplicate weapon types', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({ weapons: [MACHINE_GUN, { ...MACHINE_GUN }] }),
    );
    expect(issues.some((issue) => issue.path === 'weapons[1].type')).toBe(true);
  });

  it('rejects an aircraft with Hull Integrity above the contract bound', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({
        aircraft: [
          {
            id: GERMAN_FIGHTER.id,
            displayName: GERMAN_FIGHTER.displayName,
            maximumHullIntegrity: 101,
          },
        ],
      }),
    );
    expect(
      issues.some((issue) => issue.path === 'aircraft[0].maximumHullIntegrity'),
    ).toBe(true);
  });

  /** The canonical three-mission registry with one mission replaced by `mission`
   *  at the same registry position, so mutation tests exercise the full
   *  canonical path (V02-WI-03 correction hardening). */
  function registryWith(replaced: MissionDefinition): {
    missions: readonly MissionDefinition[];
  } {
    return { missions: [replaced, INTERCEPTION_02, INTERCEPTION_03] };
  }

  it('rejects encounters not strictly ordered by Mission Clock time', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 1 ? { ...encounter, timeSeconds: 10 } : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'missions[0].encounters[1].timeSeconds',
      ),
    ).toBe(true);
  });

  it('rejects authored totals that do not equal the composition totals', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      totals: { ...INTERCEPTION_01.totals, basic: 13 },
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(issues.some((issue) => issue.path === 'missions[0].totals')).toBe(
      true,
    );
  });

  it('rejects an unlock target that is not present in the registry', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      unlocksMissionId:
        'interception-99' as MissionDefinition['unlocksMissionId'],
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some((issue) => issue.path === 'missions[0].unlocksMissionId'),
    ).toBe(true);
  });

  it('rejects a mission that unlocks itself', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      unlocksMissionId: 'interception-01',
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some((issue) => issue.path === 'missions[0].unlocksMissionId'),
    ).toBe(true);
  });

  it('rejects a composition with a duplicate enemy role', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 0
          ? {
              ...encounter,
              composition: [
                ...encounter.composition,
                { type: 'basic-drone', count: 1 },
              ],
            }
          : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) =>
          issue.path === 'missions[0].encounters[0].composition[1].type',
      ),
    ).toBe(true);
  });

  it('rejects a maximum Success payout inconsistent with its parts', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      maximumSuccessPayout: 31,
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some((issue) => issue.path === 'missions[0].maximumSuccessPayout'),
    ).toBe(true);
  });

  it('rejects a duplicated mission in the registry', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({
        missions: [INTERCEPTION_01, INTERCEPTION_02, INTERCEPTION_01],
      }),
    );
    expect(issues.some((issue) => issue.path === 'missions[2].id')).toBe(true);
  });

  it('rejects an incomplete registry missing one of the three missions', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({
        missions: [INTERCEPTION_01, INTERCEPTION_02],
      }),
    );
    expect(issues.some((issue) => issue.path === 'missions')).toBe(true);
  });

  it('rejects a reordered registry (missions not in canonical authored order)', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({
        missions: [INTERCEPTION_01, INTERCEPTION_03, INTERCEPTION_02],
      }),
    );
    expect(issues.some((issue) => issue.path === 'missions[1].id')).toBe(true);
  });

  it('rejects an encounter id that does not belong to its mission/ordinal', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 1 ? { ...encounter, id: 'interception-01-e9' } : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some((issue) => issue.path === 'missions[0].encounters[1].id'),
    ).toBe(true);
  });

  it('rejects a disconnected unlock mapping (skip to Interception 03)', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      unlocksMissionId: 'interception-03',
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some((issue) => issue.path === 'missions[0].unlocksMissionId'),
    ).toBe(true);
  });

  it('rejects an alternate unlock traversal 01 → 03 → 02 → null even though it visits every mission once (C02)', () => {
    const alternate: readonly MissionDefinition[] = [
      { ...INTERCEPTION_01, unlocksMissionId: 'interception-03' },
      { ...INTERCEPTION_02, unlocksMissionId: null },
      { ...INTERCEPTION_03, unlocksMissionId: 'interception-02' },
    ];
    const issues = validateCatalogue(
      contentCatalogueWith({ missions: alternate }),
    );
    expect(
      issues.some(
        (issue) =>
          issue.path === 'missions[0].unlocksMissionId' ||
          issue.path === 'missions[1].unlocksMissionId' ||
          issue.path === 'missions[2].unlocksMissionId',
      ),
    ).toBe(true);
  });

  it('rejects an unapproved fixed entry region', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 0
          ? {
              ...encounter,
              entry: { kind: 'fixed', region: 'bottom' } as never,
            }
          : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'missions[0].encounters[0].entry.region',
      ),
    ).toBe(true);
  });

  it('rejects an unapproved formation identifier', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 0 ? { ...encounter, formation: 'blob' as never } : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'missions[0].encounters[0].formation',
      ),
    ).toBe(true);
  });

  it('rejects a seeded variant set with fewer than two distinct approved regions', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 2
          ? {
              ...encounter,
              entry: { kind: 'seeded', variants: ['upper-left'] } as never,
            }
          : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'missions[0].encounters[2].entry.variants',
      ),
    ).toBe(true);
  });

  it('rejects a non-positive role-level delay', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 1
          ? {
              ...encounter,
              roleDelays: [{ type: 'ranged-drone', delaySeconds: 0 }],
            }
          : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) =>
          issue.path === 'missions[0].encounters[1].roleDelays[0].delaySeconds',
      ),
    ).toBe(true);
  });

  it('rejects a role delay for a role absent from the encounter composition (C02)', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 1
          ? {
              ...encounter,
              roleDelays: [{ type: 'hunter-drone', delaySeconds: 2 }],
            }
          : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) =>
          issue.path === 'missions[0].encounters[1].roleDelays[0].type',
      ),
    ).toBe(true);
  });

  it('rejects a reversed seeded variant pair (C02)', () => {
    const invalidMission: MissionDefinition = {
      ...INTERCEPTION_01,
      encounters: INTERCEPTION_01.encounters.map((encounter, index) =>
        index === 2
          ? {
              ...encounter,
              entry: {
                kind: 'seeded',
                variants: ['upper-right', 'upper-left'],
              } as never,
            }
          : encounter,
      ),
    };
    const issues = validateCatalogue(
      contentCatalogueWith(registryWith(invalidMission)),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'missions[0].encounters[2].entry.variants',
      ),
    ).toBe(true);
  });

  it('rejects an empty pilot list', () => {
    const issues = validateCatalogue(contentCatalogueWith({ pilots: [] }));
    expect(issues.some((issue) => issue.path === 'pilots')).toBe(true);
  });

  it('rejects duplicate pilot names', () => {
    const duplicated = [...PILOTS.slice(0, 1), ...PILOTS.slice(0, 1)];
    const issues = validateCatalogue(
      contentCatalogueWith({ pilots: duplicated }),
    );
    expect(issues.some((issue) => issue.path === 'pilots[1].name')).toBe(true);
  });

  it('rejects null input without throwing', () => {
    expect(validateCatalogue(null)).toEqual([
      { path: 'catalogue', message: 'must be a non-null object' },
    ]);
  });

  it('rejects primitive input without throwing', () => {
    expect(validateCatalogue(42)).toEqual([
      { path: 'catalogue', message: 'must be a non-null object' },
    ]);
    expect(validateCatalogue('interception')).toEqual([
      { path: 'catalogue', message: 'must be a non-null object' },
    ]);
  });

  it('rejects an array as the catalogue root', () => {
    expect(validateCatalogue([])).toEqual([
      { path: 'catalogue', message: 'must be a non-null object' },
    ]);
  });

  it('rejects a missing top-level collection', () => {
    const input = {
      aircraft: [],
      weapons: [],
      enemies: [],
      missions: [],
      projectile: {},
    };
    const issues = validateCatalogue(input);
    expect(issues.some((issue) => issue.path === 'pilots')).toBe(true);
  });

  it('rejects a top-level collection of the wrong type', () => {
    const input = {
      aircraft: 'german-fighter',
      weapons: [],
      enemies: [],
      missions: [],
      pilots: [],
      projectile: {},
    };
    const issues = validateCatalogue(input);
    expect(issues.some((issue) => issue.path === 'aircraft')).toBe(true);
  });

  it('rejects a malformed nested record without throwing', () => {
    const input = {
      aircraft: [null],
      weapons: [],
      enemies: [],
      missions: [],
      pilots: [],
      projectile: {},
    };
    const issues = validateCatalogue(input);
    expect(issues.some((issue) => issue.path === 'aircraft[0]')).toBe(true);
  });

  it('rejects a missing or non-string display name', () => {
    const input = {
      aircraft: [{ id: 'x', maximumHullIntegrity: 100 }],
      weapons: [],
      enemies: [],
      missions: [],
      pilots: [],
      projectile: {},
    };
    const issues = validateCatalogue(input);
    expect(
      issues.some((issue) => issue.path === 'aircraft[0].displayName'),
    ).toBe(true);
  });

  it('rejects an empty aircraft id', () => {
    const input = {
      aircraft: [{ id: '', displayName: 'Fighter', maximumHullIntegrity: 100 }],
      weapons: [],
      enemies: [],
      missions: [],
      pilots: [],
      projectile: {},
    };
    const issues = validateCatalogue(input);
    expect(issues.some((issue) => issue.path === 'aircraft[0].id')).toBe(true);
  });

  it('rejects an empty pilot id', () => {
    const input = {
      aircraft: [],
      weapons: [],
      enemies: [],
      missions: [],
      pilots: [{ id: '', name: 'Pilot' }],
      projectile: {},
    };
    const issues = validateCatalogue(input);
    expect(issues.some((issue) => issue.path === 'pilots[0].id')).toBe(true);
  });

  it('rejects an invalid enemy movement speed', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({
        enemies: [{ ...BASIC_DRONE, movementSpeedViewportHeightPerSecond: 0 }],
      }),
    );
    expect(
      issues.some(
        (issue) =>
          issue.path === 'enemies[0].movementSpeedViewportHeightPerSecond',
      ),
    ).toBe(true);
  });

  it('rejects an invalid projectile speed', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({
        projectile: { ...PLAYER_PROJECTILE, speedViewportHeightPerSecond: 0 },
      }),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'projectile.speedViewportHeightPerSecond',
      ),
    ).toBe(true);
  });

  it('rejects an invalid projectile lifetime', () => {
    const issues = validateCatalogue(
      contentCatalogueWith({
        projectile: { ...PLAYER_PROJECTILE, maximumLifetimeSeconds: -1 },
      }),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'projectile.maximumLifetimeSeconds',
      ),
    ).toBe(true);
  });

  it('does not mutate the input', () => {
    const input = contentCatalogueWith({});
    const snapshot = JSON.stringify(input);
    deepFreeze(input);
    const issues = validateCatalogue(input);
    expect(issues).toEqual([]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('narrows a fully valid catalogue via isContentCatalogue', () => {
    expect(isContentCatalogue(contentCatalogueWith({}))).toBe(true);
    expect(isContentCatalogue(null)).toBe(false);
    expect(isContentCatalogue(contentCatalogueWith({ weapons: [] }))).toBe(
      false,
    );
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
