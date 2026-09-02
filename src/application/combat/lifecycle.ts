/**
 * S13 application-owned Combat lifecycle controller (Combat §10–12, Master
 * §7.6–7.7, MASTER-AC-008/009, AC-037–069). One pure reducer is the single
 * authority for running-versus-paused state, the active blocking Combat
 * Overlay (`none`, Pause, Settings, or development Debug), the Debug
 * restoration origin, and the idempotent browser-safety-pause latch. React
 * renders this state and relays semantic commands; Phaser and the Combat
 * runtime only obey pause/input/debug commands and expose read-only snapshots.
 * Lifecycle truth is never distributed across React booleans, Phaser pause
 * flags, DOM callbacks, or a second store.
 *
 * Mission Result remains higher priority and immutable under every S13 command:
 * the session reducer rejects all lifecycle commands while a result is pending.
 */

export type CombatOverlayId =
  | 'none'
  | 'pause'
  | 'settings'
  | 'debug'
  | 'save-error'
  | 'save-conflict'
  | 'terminal-exit-pause';

/** Where Debug was opened from, for canonical close restoration (Combat §11.2). */
export type DebugRestoreOrigin = 'none' | 'running' | 'pause';

export interface CombatLifecycleState {
  /** False while Combat is paused or a blocking Overlay is open. */
  readonly running: boolean;
  /** The single active blocking Combat Overlay. */
  readonly overlay: CombatOverlayId;
  /** Debug restoration origin: `running` resumes on close; `pause` reopens Pause. */
  readonly debugRestoreOrigin: DebugRestoreOrigin;
  /**
   * Browser-safety-pause latch (Combat §12, AC-066): once a focus/visibility/
   * resize event latches manual Resume, closing Settings/Debug transitions to
   * Pause instead of resuming Combat.
   */
  readonly browserSafetyLatched: boolean;
}

/** Neutral state before Combat starts and after a mission resolves (S13). */
export const IDLE_COMBAT_LIFECYCLE: CombatLifecycleState = Object.freeze({
  running: false,
  overlay: 'none',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
});

/** State entered by one accepted mission start: running with no Overlay. */
export const RUNNING_COMBAT_LIFECYCLE: CombatLifecycleState = Object.freeze({
  running: true,
  overlay: 'none',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
});

/**
 * Canonical lifecycle command matrix (Combat §10–11, §12.2–12.3, AC-052/063–069;
 * S13). Each command is a strict no-op unless the current state is explicitly
 * eligible, so repeated, racing, or out-of-matrix commands never change state.
 * Every command carries the originating Mission Instance ordinal; the session
 * reducer (not this pure transition reducer) enforces that the identity exactly
 * matches the current Active Mission Snapshot, so a delayed or duplicated
 * Pause/Resume/Settings/Debug/browser-safety event from an older mission is a
 * strict no-op before, during, and after mission N+1 (S13-WI01).
 *
 * - running + `none`: open-pause / open-settings / open-debug pause the runtime
 *   and open the requested Overlay; F routes separately through gameplay input.
 * - Pause: resume (also `P`/`Esc`), or F1 replaces Pause with Debug preserving
 *   the paused state; Settings is ignored.
 * - Settings: only close-settings (Close/Esc) may leave it — resuming, or
 *   opening Pause when a browser-safety latch exists; P/F/F1 are ignored.
 * - Debug: only approved actions (relayed separately) plus close-debug
 *   (F1/Esc/Close); P/F/Settings/movement are ignored.
 * - A browser safety event pauses running Combat (latching manual Resume),
 *   keeps Settings/Debug open while latching, and creates nothing during Pause.
 * - Save Error / Save Conflict (V02-WI-04 C02): blocking terminal-recovery
 *   states opened when the terminal campaign transaction fails/rejects or is
 *   inert. Only `Retry Save` (save-error) or `Reload` (save-conflict) may leave
 *   them; all gameplay, Debug, Settings, and pause commands are ignored while
 *   they are open, and a successful commit closes them through `recover`.
 */
export type CombatLifecycleAction =
  | {
      readonly type: 'combat-lifecycle/open-pause';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-lifecycle/resume';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-lifecycle/open-settings';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-lifecycle/close-settings';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-lifecycle/open-debug';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-lifecycle/close-debug';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-lifecycle/browser-safety-event';
      readonly missionInstanceOrdinal: number;
    }
  // V02-WI-04 C02 terminal-persistence recovery states.
  | {
      readonly type: 'combat-terminal/save-error';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-terminal/save-conflict';
      readonly missionInstanceOrdinal: number;
    }
  | {
      readonly type: 'combat-terminal/recover';
      readonly missionInstanceOrdinal: number;
    };

export function combatLifecycleReducer(
  state: CombatLifecycleState,
  action: CombatLifecycleAction,
): CombatLifecycleState {
  switch (action.type) {
    case 'combat-lifecycle/open-pause':
      // Pause Button, `P`, or `Esc` while running with no Overlay (AC-052).
      if (state.running && state.overlay === 'none') {
        return {
          running: false,
          overlay: 'pause',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
        };
      }
      return state;
    case 'combat-lifecycle/resume':
      // `P`, `Esc`, or Resume from the Pause Overlay; also clears any latch.
      if (state.overlay === 'pause') {
        return {
          running: true,
          overlay: 'none',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
        };
      }
      // V02-WI-04 C03: the terminal-exit Pause is Resume-only. Only this
      // explicit Resume may start the committed Success exit; no other
      // lifecycle command can leave that state (the immutable result can
      // never be re-exposed to Return to Base, Settings, Debug, or Retry).
      if (state.overlay === 'terminal-exit-pause') {
        return {
          running: true,
          overlay: 'none',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
        };
      }
      return state;
    case 'combat-lifecycle/open-settings':
      // Settings Button while running with no Overlay (Combat §10.1, AC-038).
      if (state.running && state.overlay === 'none') {
        return {
          running: false,
          overlay: 'settings',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
        };
      }
      return state;
    case 'combat-lifecycle/close-settings':
      // Close/Esc from Settings: resumes unless a browser-safety latch exists,
      // in which case Settings closes into Pause and requires explicit Resume.
      if (state.overlay !== 'settings') {
        return state;
      }
      return state.browserSafetyLatched
        ? {
            running: false,
            overlay: 'pause',
            debugRestoreOrigin: 'none',
            browserSafetyLatched: true,
          }
        : {
            running: true,
            overlay: 'none',
            debugRestoreOrigin: 'none',
            browserSafetyLatched: false,
          };
    case 'combat-lifecycle/open-debug':
      // F1 from running Combat pauses and opens Debug (AC-039); F1 from Pause
      // replaces Pause without resuming (AC-040). Both Overlays never coexist.
      if (state.running && state.overlay === 'none') {
        return {
          running: false,
          overlay: 'debug',
          debugRestoreOrigin: 'running',
          browserSafetyLatched: false,
        };
      }
      if (state.overlay === 'pause') {
        return {
          ...state,
          overlay: 'debug',
          debugRestoreOrigin: 'pause',
        };
      }
      return state;
    case 'combat-lifecycle/close-debug':
      if (state.overlay !== 'debug') {
        return state;
      }
      if (state.browserSafetyLatched) {
        // Latched safety pause overrides automatic restoration (Combat §11.2,
        // AC-066): closing Debug opens Pause and requires explicit Resume.
        return {
          running: false,
          overlay: 'pause',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: true,
        };
      }
      if (state.debugRestoreOrigin === 'running') {
        return {
          running: true,
          overlay: 'none',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
        };
      }
      // Debug replaced Pause (or a defensive unknown origin): reopen Pause.
      return {
        running: false,
        overlay: 'pause',
        debugRestoreOrigin: 'none',
        browserSafetyLatched: false,
      };
    case 'combat-terminal/save-error':
    case 'combat-terminal/save-conflict':
      // V02-WI-04 C02: terminal-persistence recovery is a blocking state. It
      // opens from the terminal (already frozen) commit outcome and cannot be
      // replaced by Pause/Settings/Debug; repeated outcomes stay idempotent.
      // V02-WI-04 C03: once Save Error is open, a Retry Save that reports
      // `inert` means this browser instance has lost durable authority — it
      // transitions immediately to Save Conflict instead of leaving Retry
      // Save available. Save Conflict itself remains Reload-only and a later
      // Save Error outcome can never reopen retry on it.
      if (state.overlay === 'save-error') {
        if (action.type === 'combat-terminal/save-conflict') {
          return {
            running: false,
            overlay: 'save-conflict',
            debugRestoreOrigin: 'none',
            browserSafetyLatched: state.browserSafetyLatched,
          };
        }
        return state;
      }
      if (
        state.overlay === 'save-conflict' ||
        state.overlay === 'terminal-exit-pause'
      ) {
        return state;
      }
      return {
        running: false,
        overlay:
          action.type === 'combat-terminal/save-error'
            ? 'save-error'
            : 'save-conflict',
        debugRestoreOrigin: 'none',
        browserSafetyLatched: false,
      };
    case 'combat-terminal/recover':
      // V02-WI-04 C02: a successful commit closes Save Error and resumes the
      // committed Success exit; inert in any other state.
      // V02-WI-04 C03: when a browser-safety latch is set (the commit resolved
      // while the tab was hidden/blurred), the committed Success exit must not
      // start automatically — Save Error closes into the terminal-exit Pause
      // whose only action is the explicit Resume that starts the exit.
      if (state.overlay !== 'save-error') {
        return state;
      }
      if (state.browserSafetyLatched) {
        return {
          running: false,
          overlay: 'terminal-exit-pause',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: true,
        };
      }
      return {
        running: true,
        overlay: 'none',
        debugRestoreOrigin: 'none',
        browserSafetyLatched: false,
      };
    case 'combat-lifecycle/browser-safety-event':
      // Blur, hidden tab, or an accepted resize during running Combat opens one
      // Pause Overlay and latches manual Resume (AC-044-045). During
      // Settings/Debug the Overlay remains and the latch is set (AC-066).
      // During Pause or after a result, repeated events create nothing (AC-067).
      // V02-WI-04 C03: the same latch applies while Save Error is open — the
      // Overlay stays open and the manual-resume latch is set so a commit that
      // resolves while hidden is held for explicit Resume.
      if (state.running && state.overlay === 'none') {
        return {
          running: false,
          overlay: 'pause',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: true,
        };
      }
      if (
        state.overlay === 'settings' ||
        state.overlay === 'debug' ||
        state.overlay === 'save-error'
      ) {
        return { ...state, browserSafetyLatched: true };
      }
      return state;
  }
}
