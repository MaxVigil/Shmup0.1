import { useSyncExternalStore } from 'react';
import type { SessionState } from '@application/session';
import { useApplication } from '../application-context';

/**
 * Reactive Shared Session State subscription for presentation (Technical
 * Foundation §3.5): React observes the single application-owned store without
 * holding a parallel copy. The ready composition renders only after Boot has
 * initialized the session, so a missing session is an invariant violation.
 */
export function useSessionState(): SessionState {
  const { store } = useApplication();
  const session = useSyncExternalStore(store.subscribe, store.getState);
  if (session === null) {
    throw new Error(
      'SessionState is missing: the ready composition requires an initialized session.',
    );
  }
  return session;
}
