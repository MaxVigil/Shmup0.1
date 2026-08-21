import type { WeaponType } from '@domain/index';
import type { MissionSnapshot } from '../mission/snapshot';
import type { BaseScreenId, SessionState } from './session-state';

/**
 * Named session actions. Mutations occur only through the store dispatch and
 * are reduced by `sessionReducer`. S04 added Base navigation and Settings;
 * S06 added Repair and weapon equip; S07 adds the one-accepted mission start
 * and the Combat-initialization-failure return signal.
 */
export type SessionAction =
  | { readonly type: 'session/initialized'; readonly session: SessionState }
  | { readonly type: 'session/navigate'; readonly target: BaseScreenId }
  | {
      readonly type: 'session/set-mouse-movement-enabled';
      readonly enabled: boolean;
    }
  | { readonly type: 'session/repair' }
  | { readonly type: 'session/equip-weapon'; readonly weapon: WeaponType }
  | { readonly type: 'mission/start'; readonly snapshot: MissionSnapshot }
  | { readonly type: 'mission/start-failed' }
  | { readonly type: 'mission/start-failure-consumed' };

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
    case 'session/navigate':
      // Base §3.4 / AC-003: selecting the current Screen must not reload,
      // reset, or change the session — returning the same state object makes
      // the change invisible to subscribers.
      if (state === null) {
        return state;
      }
      return state.currentScreen === action.target
        ? state
        : { ...state, currentScreen: action.target };
    case 'session/set-mouse-movement-enabled':
      // Shared Settings (Base §3.6, §9.3): updates immediately and keeps the
      // single authoritative value; an unchanged value is a no-op.
      if (state === null) {
        return state;
      }
      return state.mouseMovementEnabled === action.enabled
        ? state
        : { ...state, mouseMovementEnabled: action.enabled };
    case 'session/repair':
      // Repair (Base §8): exactly `Credits -= 1` and `Hull Integrity = 100`,
      // applied atomically. No-op when the aircraft is at full Hull or Credits
      // are insufficient (AC-025, AC-027, AC-030); idempotency also covers
      // repeated-input protection (AC-029).
      if (state === null || state.hullIntegrity >= 100 || state.credits < 1) {
        return state;
      }
      return { ...state, credits: state.credits - 1, hullIntegrity: 100 };
    case 'session/equip-weapon':
      // Weapon selection transaction (Base §7): only `Confirm` equips; the
      // equipped weapon persists across Base navigation (AC-022, §7.6).
      if (state === null || state.equippedWeapon === action.weapon) {
        return state;
      }
      return { ...state, equippedWeapon: action.weapon };
    case 'mission/start':
      // One accepted start (Base §9.4, S07): the snapshot is recorded exactly
      // once; while an active mission exists a second command is ignored
      // (AC-035), and the instance ordinal increments once per acceptance.
      if (state === null || state.activeMission !== 'none') {
        return state;
      }
      return {
        ...state,
        activeMission: action.snapshot,
        missionInstanceCount: state.missionInstanceCount + 1,
        missionStartFailed: false,
      };
    case 'mission/start-failed':
      // Combat initialization failure (Base AC-014): no active mission
      // remains and Base state is unchanged; the failure is signalled so the
      // Mission Details Overlay can reopen with the approved message.
      if (state === null || state.activeMission === 'none') {
        return state;
      }
      return { ...state, activeMission: 'none', missionStartFailed: true };
    case 'mission/start-failure-consumed':
      // The Base UI has reopened the Mission Details Overlay with the failure
      // message; clear the transient signal.
      if (state === null || !state.missionStartFailed) {
        return state;
      }
      return { ...state, missionStartFailed: false };
    default:
      return assertNever(action);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled session action: ${JSON.stringify(value)}`);
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
