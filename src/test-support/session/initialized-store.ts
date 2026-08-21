import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import { CONTENT_CATALOGUE } from '@content/index';

/**
 * A Session Store with the approved initial session already dispatched, for
 * UI and application tests that need an initialized session. The canonical
 * content catalogue is used so no balance value is duplicated in tests.
 */
export function createInitializedSessionStore(
  sessionSeed = 3735928559,
): SessionStore {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(sessionSeed, CONTENT_CATALOGUE),
  });
  return store;
}
