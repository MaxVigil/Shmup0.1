import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE, PILOTS } from '@content/index';
import { contentCatalogueWith } from '@test-support/content';
import { initializeSession } from './initialize-session';

describe('initializeSession', () => {
  it('creates the approved initial shared state', () => {
    const session = initializeSession(3735928559, CONTENT_CATALOGUE);
    expect(session.currentScreen).toBe('operations');
    expect(session.credits).toBe(1);
    expect(session.hullIntegrity).toBe(100);
    expect(session.equippedWeapon).toBe('machine-gun');
    expect(session.mouseMovementEnabled).toBe(true);
    expect(session.missionAvailable).toBe(true);
    expect(session.activeMission).toBe('none');
    expect(session.aircraftId).toBe('german-fighter');
  });

  it('selects a Pilot deterministically from the approved list', () => {
    const session = initializeSession(3735928559, CONTENT_CATALOGUE);
    expect(PILOTS.some((pilot) => pilot.name === session.pilot.name)).toBe(
      true,
    );
    // Fixed vector: seed 3735928559 → pilot-selection stream index 3.
    expect(session.pilot.name).toBe('Андрій Шевченко');
    expect(initializeSession(3735928559, CONTENT_CATALOGUE).pilot.name).toBe(
      'Андрій Шевченко',
    );
  });

  it('can select a different Pilot for a different seed', () => {
    expect(
      initializeSession(3735928559, CONTENT_CATALOGUE).pilot.name,
    ).not.toBe(initializeSession(123456789, CONTENT_CATALOGUE).pilot.name);
  });

  it('throws when the canonical content is incomplete', () => {
    expect(() =>
      initializeSession(3735928559, contentCatalogueWith({ aircraft: [] })),
    ).toThrow();
  });
});
