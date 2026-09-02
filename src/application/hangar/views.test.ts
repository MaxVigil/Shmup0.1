import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { aircraftId } from '@domain/index';
import { contentCatalogueWith } from '@test-support/content';
import { aircraftDisplayName, weaponOptions } from './views';

describe('weaponOptions', () => {
  it('derives the two approved weapons with canonical values (Base §7.2, DS §8.14)', () => {
    const options = weaponOptions(CONTENT_CATALOGUE);
    expect(options).toHaveLength(2);
    const machineGun = options.find((option) => option.type === 'machine-gun');
    const cannon = options.find((option) => option.type === 'cannon');
    expect(machineGun).toMatchObject({
      displayName: 'Machine Gun',
      damage: 1,
      fireRate: 5,
      basicDroneHits: 3,
    });
    expect(cannon).toMatchObject({
      displayName: 'Cannon',
      damage: 3,
      fireRate: 1.5,
      basicDroneHits: 1,
    });
  });

  it('throws when the canonical Basic Drone content is missing', () => {
    expect(() => weaponOptions(contentCatalogueWith({ enemies: [] }))).toThrow(
      'Basic Drone',
    );
  });
});

describe('aircraftDisplayName', () => {
  it('returns the canonical aircraft name', () => {
    expect(
      aircraftDisplayName(CONTENT_CATALOGUE, aircraftId('german-fighter')),
    ).toBe('German Fighter');
  });

  it('throws when the session aircraft is missing', () => {
    expect(() =>
      aircraftDisplayName(
        contentCatalogueWith({ aircraft: [] }),
        aircraftId('german-fighter'),
      ),
    ).toThrow('aircraft');
  });
});
