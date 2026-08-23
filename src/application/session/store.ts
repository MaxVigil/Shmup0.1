import type { WeaponType } from '@domain/index';
import {
  IDLE_COMBAT_LIFECYCLE,
  RUNNING_COMBAT_LIFECYCLE,
  combatLifecycleReducer,
} from '../combat/lifecycle';
import type { CombatLifecycleAction } from '../combat/lifecycle';
import type { MissionResult, MissionSnapshot } from '../mission';
import type { BaseScreenId, SessionState } from './session-state';

/**
 * Named session actions. Mutations occur only through the store dispatch and
 * are reduced by `sessionReducer`. S04 added Base navigation and Settings;
 * S06 added Repair and weapon equip; S07 adds the one-accepted mission start
 * and the Combat-initialization-failure return signal; S12 adds the single
 * typed, idempotent mission-result commitment path and its consumption; S13
 * adds the application-owned Combat lifecycle command matrix (Pause/Settings/
 * Debug/browser-safety transitions).
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
  | { readonly type: 'mission/start-failure-consumed' }
  | { readonly type: 'mission/result'; readonly result: MissionResult }
  | {
      readonly type: 'mission/result-consumed';
      readonly missionInstanceOrdinal: number;
    }
  | CombatLifecycleAction;

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
      // S12-WI01: while a committed Mission Result is pending the raw action is
      // a strict no-op too, so no start command can bypass the blocking UI or
      // the application boundary and mutate the result flow.
      if (
        state === null ||
        state.activeMission !== 'none' ||
        state.missionResult !== null
      ) {
        return state;
      }
      return {
        ...state,
        activeMission: action.snapshot,
        missionInstanceCount: state.missionInstanceCount + 1,
        missionStartFailed: false,
        // S13: one accepted mission start enters Combat running with no
        // Overlay and no browser-safety latch.
        combatLifecycle: RUNNING_COMBAT_LIFECYCLE,
      };
    case 'mission/start-failed':
      // Combat initialization failure (Base AC-014): no active mission
      // remains and Base state is unchanged; the failure is signalled so the
      // Mission Details Overlay can reopen with the approved message.
      if (state === null || state.activeMission === 'none') {
        return state;
      }
      return {
        ...state,
        activeMission: 'none',
        missionStartFailed: true,
        combatLifecycle: IDLE_COMBAT_LIFECYCLE,
      };
    case 'mission/start-failure-consumed':
      // The Base UI has reopened the Mission Details Overlay with the failure
      // message; clear the transient signal.
      if (state === null || !state.missionStartFailed) {
        return state;
      }
      return { ...state, missionStartFailed: false };
    case 'mission/result':
      // S12 single typed, idempotent commitment path bound to the originating
      // Mission Instance (Base §9.5, AC-032/033/034). Ignored when no active
      // mission remains OR when the command's missionInstanceOrdinal does not
      // exactly match the active Mission Snapshot, so a delayed or duplicated
      // terminal/Aborted command from an older mission can never resolve,
      // reward, recover, or abort another Mission Instance. Success retains the
      // Combat Hull and grants exactly +1 Credit; Defeat grants no Credit and
      // applies the free emergency recovery to exactly 25; Aborted retains the
      // Combat Hull with no reward or recovery. Neither path performs full
      // Repair.
      if (
        state === null ||
        state.activeMission === 'none' ||
        state.activeMission.missionInstanceOrdinal !==
          action.result.missionInstanceOrdinal
      ) {
        return state;
      }
      if (action.result.kind === 'defeat') {
        return {
          ...state,
          activeMission: 'none',
          hullIntegrity: 25,
          missionResult: {
            kind: 'defeat',
            missionInstanceOrdinal: action.result.missionInstanceOrdinal,
          },
          // S13: any open Combat Overlay/lifecycle closes with the mission;
          // the Mission Result Overlay becomes the only continuation point.
          combatLifecycle: IDLE_COMBAT_LIFECYCLE,
        };
      }
      if (action.result.kind === 'success') {
        return {
          ...state,
          activeMission: 'none',
          credits: state.credits + 1,
          hullIntegrity: action.result.combatHullIntegrity,
          missionResult: {
            kind: 'success',
            missionInstanceOrdinal: action.result.missionInstanceOrdinal,
          },
          combatLifecycle: IDLE_COMBAT_LIFECYCLE,
        };
      }
      // Aborted: no Overlay is presented; Operations opens directly.
      return {
        ...state,
        activeMission: 'none',
        hullIntegrity: action.result.combatHullIntegrity,
        missionResult: null,
        combatLifecycle: IDLE_COMBAT_LIFECYCLE,
      };
    case 'mission/result-consumed':
      // Continue performed navigation/cleanup only for the presented result.
      // The command must exactly match the presented result's originating
      // Mission Instance; a stale Continue from an older mission is a no-op and
      // can never clear a newer mission's result.
      if (
        state === null ||
        state.missionResult === null ||
        state.missionResult.missionInstanceOrdinal !==
          action.missionInstanceOrdinal
      ) {
        return state;
      }
      return { ...state, missionResult: null };
    case 'combat-lifecycle/open-pause':
    case 'combat-lifecycle/resume':
    case 'combat-lifecycle/open-settings':
    case 'combat-lifecycle/close-settings':
    case 'combat-lifecycle/open-debug':
    case 'combat-lifecycle/close-debug':
    case 'combat-lifecycle/browser-safety-event': {
      // S13 lifecycle commands are meaningful only during an Active Mission
      // and are inert before one starts, after it resolves, and while a
      // committed Mission Result is pending (Mission Result remains higher
      // priority and immutable under every S13 command).
      if (
        state === null ||
        state.activeMission === 'none' ||
        state.missionResult !== null
      ) {
        return state;
      }
      // S13-WI01: every lifecycle command is bound to its originating Mission
      // Instance. The reducer accepts it only when the identity exactly
      // matches the current Active Mission Snapshot, so a delayed or
      // duplicated Pause/Resume/Settings/Debug/browser-safety event from an
      // older mission is a strict no-op before, during, and after mission N+1
      // and can never pause, resume, overlay, or mutate another mission.
      if (
        state.activeMission.missionInstanceOrdinal !==
        action.missionInstanceOrdinal
      ) {
        return state;
      }
      const lifecycle = combatLifecycleReducer(state.combatLifecycle, action);
      return lifecycle === state.combatLifecycle
        ? state
        : { ...state, combatLifecycle: lifecycle };
    }
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
