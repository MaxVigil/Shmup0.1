import { describe, expect, it } from 'vitest';
import { contentCatalogueWith } from '@test-support/content';
import {
  BASIC_DRONE,
  CANNON,
  CONTENT_CATALOGUE,
  GERMAN_FIGHTER,
  INTERCEPTION,
  MACHINE_GUN,
  PILOTS,
  PLAYER_PROJECTILE,
} from '../index';
import type { EnemyGroupSchedule } from '../missions';
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

  it('rejects an invalid regular group schedule', () => {
    const invalidSchedule: EnemyGroupSchedule = {
      regular: {
        startTimeSeconds: 0,
        intervalSeconds: -10,
        groupCount: 11,
        dronesPerGroup: 3,
      },
      final: { timeSeconds: 110, dronesPerGroup: 5 },
    };
    const issues = validateCatalogue(
      contentCatalogueWith({
        missions: [{ ...INTERCEPTION, schedule: invalidSchedule }],
      }),
    );
    expect(
      issues.some(
        (issue) =>
          issue.path === 'missions[0].schedule.regular.intervalSeconds',
      ),
    ).toBe(true);
  });

  it('rejects a final group scheduled before the last regular group', () => {
    const invalidSchedule: EnemyGroupSchedule = {
      regular: {
        startTimeSeconds: 0,
        intervalSeconds: 10,
        groupCount: 11,
        dronesPerGroup: 3,
      },
      final: { timeSeconds: 50, dronesPerGroup: 5 },
    };
    const issues = validateCatalogue(
      contentCatalogueWith({
        missions: [{ ...INTERCEPTION, schedule: invalidSchedule }],
      }),
    );
    expect(
      issues.some(
        (issue) => issue.path === 'missions[0].schedule.final.timeSeconds',
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
