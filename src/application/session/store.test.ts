import { describe, expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { initializeSession } from './initialize-session';
import { createSessionStore, sessionReducer } from './store';

function initializedStore(): ReturnType<typeof createSessionStore> {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(3735928559, CONTENT_CATALOGUE),
  });
  return store;
}

describe('createSessionStore', () => {
  it('starts without a session', () => {
    const store = createSessionStore();
    expect(store.getState()).toBeNull();
  });

  it('initializes the session through the named action', () => {
    const store = createSessionStore();
    const session = initializeSession(3735928559, CONTENT_CATALOGUE);
    store.dispatch({ type: 'session/initialized', session });
    expect(store.getState()).toBe(session);
  });

  it('ignores a second initialization (Boot idempotency)', () => {
    const store = createSessionStore();
    const first = initializeSession(3735928559, CONTENT_CATALOGUE);
    const second = initializeSession(123456789, CONTENT_CATALOGUE);
    store.dispatch({ type: 'session/initialized', session: first });
    store.dispatch({ type: 'session/initialized', session: second });
    expect(store.getState()).toBe(first);
  });

  it('notifies subscribers only on a real change and unsubscribes cleanly', () => {
    const store = createSessionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(3735928559, CONTENT_CATALOGUE),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    // A repeated initialization is ignored, so no notification fires.
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(123456789, CONTENT_CATALOGUE),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(7, CONTENT_CATALOGUE),
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('navigates between Base Screens through the named action (Base AC-004)', () => {
    const store = initializedStore();
    store.dispatch({ type: 'session/navigate', target: 'hangar' });
    expect(store.getState()?.currentScreen).toBe('hangar');
    store.dispatch({ type: 'session/navigate', target: 'operations' });
    expect(store.getState()?.currentScreen).toBe('operations');
  });

  it('leaves every other shared value unchanged by navigation (Base AC-004)', () => {
    const store = initializedStore();
    const before = store.getState();
    if (before === null) {
      throw new Error('Expected an initialized session.');
    }
    store.dispatch({ type: 'session/navigate', target: 'hangar' });
    const after = store.getState();
    if (after === null) {
      throw new Error('Expected an initialized session.');
    }
    expect(after.currentScreen).toBe('hangar');
    expect(after.credits).toBe(before.credits);
    expect(after.aircraftId).toBe(before.aircraftId);
    expect(after.hullIntegrity).toBe(before.hullIntegrity);
    expect(after.equippedWeapon).toBe(before.equippedWeapon);
    expect(after.mouseMovementEnabled).toBe(before.mouseMovementEnabled);
    expect(after.pilot).toBe(before.pilot);
  });

  it('treats selecting the current Screen as a no-op with the same state object (Base AC-003)', () => {
    const store = initializedStore();
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: 'session/navigate', target: 'operations' });
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('updates the shared Mouse Movement Enabled value immediately (Base AC-044, AC-039)', () => {
    const store = initializedStore();
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: false,
    });
    expect(store.getState()?.mouseMovementEnabled).toBe(false);
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: true,
    });
    expect(store.getState()?.mouseMovementEnabled).toBe(true);
  });

  it('treats an unchanged setting as a no-op with the same state object', () => {
    const store = initializedStore();
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: true,
    });
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores navigation and settings actions before initialization', () => {
    const store = createSessionStore();
    store.dispatch({ type: 'session/navigate', target: 'hangar' });
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: false,
    });
    expect(store.getState()).toBeNull();
  });

  it('throws on an unhandled action variant (exhaustiveness)', () => {
    const session = initializeSession(3735928559, CONTENT_CATALOGUE);
    expect(() =>
      sessionReducer(session, {
        type: 'session/unknown',
      } as unknown as Parameters<typeof sessionReducer>[1]),
    ).toThrow('Unhandled session action');
  });
});
