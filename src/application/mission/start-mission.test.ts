import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { COMBAT_MISSION_STREAM, deriveStreamSeed } from '@domain/index';
import { createSessionStore, initializeSession } from '../session';
import type { SessionStore } from '../session';
import { startMission } from './start-mission';

function initializedStore(): SessionStore {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(3735928559, CONTENT_CATALOGUE),
  });
  return store;
}

describe('startMission', () => {
  it('accepts the start and records one immutable Mission Snapshot (Base AC-013, S07)', () => {
    const store = initializedStore();
    const result = startMission(store);
    expect(result.kind).toBe('accepted');
    if (result.kind !== 'accepted') {
      throw new Error('Expected an accepted start.');
    }
    expect(result.snapshot).toMatchObject({
      missionInstanceOrdinal: 0,
      combatMissionSeed: deriveStreamSeed(3735928559, COMBAT_MISSION_STREAM, 0),
      aircraftId: 'german-fighter',
      hullIntegrity: 100,
      equippedWeapon: 'machine-gun',
      mouseMovementEnabled: true,
    });
    // The store records the active mission and increments the ordinal once.
    expect(store.getState()?.activeMission).toBe(result.snapshot);
    expect(store.getState()?.missionInstanceCount).toBe(1);
  });

  it('rejects a second start while a mission is active (Base AC-035)', () => {
    const store = initializedStore();
    const first = startMission(store);
    const second = startMission(store);
    expect(first.kind).toBe('accepted');
    expect(second).toEqual({
      kind: 'rejected',
      reason: 'active-mission-exists',
    });
    expect(store.getState()?.missionInstanceCount).toBe(1);
  });

  it('captures the current damaged Hull and equipped weapon (Base AC-031, §9.4)', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: {
        ...initializeSession(3735928559, CONTENT_CATALOGUE),
        hullIntegrity: 40,
        equippedWeapon: 'cannon',
      },
    });
    store.dispatch({ type: 'session/equip-weapon', weapon: 'cannon' });
    const result = startMission(store);
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.snapshot.hullIntegrity).toBe(40);
      expect(result.snapshot.equippedWeapon).toBe('cannon');
    }
  });

  it('rejects when no session exists', () => {
    const store = createSessionStore();
    expect(startMission(store)).toEqual({
      kind: 'rejected',
      reason: 'no-session',
    });
  });

  it('rejects when the mission is not available', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: {
        ...initializeSession(3735928559, CONTENT_CATALOGUE),
        missionAvailable: false,
      },
    });
    expect(startMission(store)).toEqual({
      kind: 'rejected',
      reason: 'mission-not-available',
    });
  });
});
