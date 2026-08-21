import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { createSessionStore, initializeSession } from '../session';
import type { SessionState, SessionStore } from '../session';
import { requestMissionStart } from './request-mission-start';

function initializedStore(): SessionStore {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(3735928559, CONTENT_CATALOGUE),
  });
  return store;
}

describe('requestMissionStart', () => {
  it('accepts the start request for an available mission (Base AC-013)', () => {
    const store = initializedStore();
    expect(requestMissionStart(store)).toEqual({ kind: 'accepted' });
  });

  it('accepts a damaged-Hull mission start (Base AC-031)', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: {
        ...initializeSession(3735928559, CONTENT_CATALOGUE),
        hullIntegrity: 40,
      },
    });
    expect(requestMissionStart(store)).toEqual({ kind: 'accepted' });
  });

  it('rejects when no session exists', () => {
    const store = createSessionStore();
    expect(requestMissionStart(store)).toEqual({
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
    expect(requestMissionStart(store)).toEqual({
      kind: 'rejected',
      reason: 'mission-not-available',
    });
  });

  it('rejects when an active mission exists (Base AC-035 command guard)', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: {
        ...initializeSession(3735928559, CONTENT_CATALOGUE),
        // S07 widens the activeMission discriminant; this guard is exercised
        // here through the session store as the command-level rejection.
        activeMission: 'starting',
      } as unknown as SessionState,
    });
    expect(requestMissionStart(store)).toEqual({
      kind: 'rejected',
      reason: 'active-mission-exists',
    });
  });
});
