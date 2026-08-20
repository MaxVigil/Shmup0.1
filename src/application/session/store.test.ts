import { describe, expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { initializeSession } from './initialize-session';
import { createSessionStore } from './store';

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
});
