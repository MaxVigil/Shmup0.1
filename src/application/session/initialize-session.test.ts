import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE, PILOTS } from '@content/index';
import { contentCatalogueWith } from '@test-support/content';
import { V02_STARTING_CREDITS } from '@domain/index';
import { initializeSession } from './initialize-session';

describe('initializeSession', () => {
  it('creates the approved v0.2 initial shared state', () => {
    const session = initializeSession(3735928559, CONTENT_CATALOGUE);
    expect(session.currentScreen).toBe('operations');
    expect(session.credits).toBe(V02_STARTING_CREDITS);
    expect(session.hullIntegrity).toBe(100);
    expect(session.equippedWeapon).toBe('machine-gun');
    expect(session.mouseMovementEnabled).toBe(true);
    expect(session.runStatus).toBe('active');
    expect(session.missionAvailable).toBe(true);
    expect(session.activeMission).toBe('none');
    expect(session.missionInstanceCount).toBe(0);
    expect(session.missionStartFailed).toBe(false);
    expect(session.sessionSeed).toBe(3735928559);
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

  it('applies a provided persisted Settings value instead of the default', () => {
    const session = initializeSession(3735928559, CONTENT_CATALOGUE, {
      mouseMovementEnabled: false,
    });
    expect(session.mouseMovementEnabled).toBe(false);
  });

  it('throws when the canonical content is incomplete', () => {
    expect(() =>
      initializeSession(3735928559, contentCatalogueWith({ aircraft: [] })),
    ).toThrow();
  });
});
