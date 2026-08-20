import type { SessionState } from './session-state';

/**
 * Named session actions. Mutations occur only through the store dispatch and
 * are reduced by `sessionReducer`. New actions are added by later slices; the
 * canonical `assertNever` exhaustiveness guard is introduced when the union
 * has more than one member (see `sessionReducer`).
 */
export type SessionAction = {
  readonly type: 'session/initialized';
  readonly session: SessionState;
};

export interface SessionStore {
  /** Returns the session, or `null` before the session is initialized. */
  getState(): SessionState | null;
  subscribe(listener: () => void): () => void;
  dispatch(action: SessionAction): void;
}

export function sessionReducer(
  state: SessionState | null,
  action: SessionAction,
): SessionState | null {
  switch (action.type) {
    case 'session/initialized':
      // Idempotent: a repeated initialization is ignored (MASTER-AC-002).
      return state === null ? action.session : state;
    default:
      // The action union currently has exactly one member, so this default is
      // unreachable. TS 6.0.3 does not narrow a single-member union to `never`,
      // so the canonical `assertNever` exhaustiveness guard is introduced when
      // later slices widen `SessionAction` (S04+).
      return state;
  }
}

export function createSessionStore(): SessionStore {
  let state: SessionState | null = null;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action) => {
      const next = sessionReducer(state, action);
      if (next !== state) {
        state = next;
        listeners.forEach((listener) => listener());
      }
    },
  };
}
