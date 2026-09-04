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
  | 'terminal-exit-pause'
  | 'mission-start-recovery-error';

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
  /**
   * V02-WI-05 C04 terminal-commitment-pending flag. Set by the Combat entry
   * the instant the authoritative terminal result is relayed and the atomic
   * campaign write begins; cleared when that write resolves (committed,
   * failed, or inert). While set, a browser-safety event latches manual
   * Resume even when the ordinary Pause Overlay is already open, so a
   * Defeat/Game Over whose write completes while the tab is hidden is always
   * held for explicit Resume. Ordinary non-terminal Pause/browser-event
   * semantics (AC-066/067) are unchanged outside this pending window.
   */
  readonly terminalSavePending: boolean;
}

/** Neutral state before Combat starts and after a mission resolves (S13). */
export const IDLE_COMBAT_LIFECYCLE: CombatLifecycleState = Object.freeze({
  running: false,
  overlay: 'none',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
  terminalSavePending: false,
});

/** State entered by one accepted mission start: running with no Overlay. */
export const RUNNING_COMBAT_LIFECYCLE: CombatLifecycleState = Object.freeze({
  running: true,
  overlay: 'none',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
  terminalSavePending: false,
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
 * - Mission Start Recovery Error (V02-DEC-031): blocking start-recovery state
 *   entered when Combat initialization failed after mission-start persistence
 *   and the exact originating-marker cleanup cannot be proven safe. Only the
 *   single-flight `Retry Cleanup` action (via the recovery command) may leave
 *   it through a successful reconcile or the Save Conflict transition.
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
    }
  // V02-WI-05 C04: the authoritative terminal result was relayed and its
  // atomic campaign write is pending. Browser-safety events now latch even
  // when the ordinary Pause Overlay is already open.
  | {
      readonly type: 'combat-terminal/pending';
      readonly missionInstanceOrdinal: number;
    }
  // V02-DEC-031 Mission Start Recovery Error: the mission-start persistence
  // write succeeded but Combat owner initialization failed, and the exact
  // originating-marker cleanup could not be committed safely (thrown/rejected
  // update or an unreadable campaign record). Combat stays frozen and
  // non-interactive and this blocking Overlay is the only surface.
  | {
      readonly type: 'combat-start/recovery-error';
      readonly missionInstanceOrdinal: number;
    };

export function combatLifecycleReducer(
  state: CombatLifecycleState,
  action: CombatLifecycleAction,
): CombatLifecycleState {
  switch (action.type) {
    case 'combat-lifecycle/open-pause':
      // Pause Button, `P`, or `Esc` while running with no Overlay (AC-052).
      // A Pause opened while a terminal write is pending stays terminal-aware.
      if (state.running && state.overlay === 'none') {
        return {
          running: false,
          overlay: 'pause',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
          terminalSavePending: state.terminalSavePending,
        };
      }
      return state;
    case 'combat-lifecycle/resume':
      // `P`, `Esc`, or Resume from the Pause Overlay; also clears any latch.
      // While the terminal write is still pending the flag survives the
      // resume so a later safety event can still latch from the Pause.
      if (state.overlay === 'pause') {
        return {
          running: true,
          overlay: 'none',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
          terminalSavePending: state.terminalSavePending,
        };
      }
      // V02-WI-04 C03: the terminal-exit Pause is Resume-only. Only this
      // explicit Resume may start the committed Success exit or present a held
      // Defeat/Game Over; no other lifecycle command can leave that state (the
      // immutable result can never be re-exposed to Return to Base, Settings,
      // Debug, or Retry). The write has already resolved, so the flag is false.
      if (state.overlay === 'terminal-exit-pause') {
        return {
          running: true,
          overlay: 'none',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
          terminalSavePending: false,
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
          terminalSavePending: state.terminalSavePending,
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
            terminalSavePending: state.terminalSavePending,
          }
        : {
            running: true,
            overlay: 'none',
            debugRestoreOrigin: 'none',
            browserSafetyLatched: false,
            terminalSavePending: state.terminalSavePending,
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
          terminalSavePending: state.terminalSavePending,
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
          terminalSavePending: state.terminalSavePending,
        };
      }
      if (state.debugRestoreOrigin === 'running') {
        return {
          running: true,
          overlay: 'none',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: false,
          terminalSavePending: state.terminalSavePending,
        };
      }
      // Debug replaced Pause (or a defensive unknown origin): reopen Pause.
      return {
        running: false,
        overlay: 'pause',
        debugRestoreOrigin: 'none',
        browserSafetyLatched: false,
        terminalSavePending: state.terminalSavePending,
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
      // V02-WI-05 C05: opening Save Error/Save Conflict replaces the blocking
      // overlay but never discharges an existing manual-resume latch — only
      // explicit Resume (or ownership teardown/reset) may clear it.
      if (state.overlay === 'save-error') {
        if (action.type === 'combat-terminal/save-conflict') {
          return {
            running: false,
            overlay: 'save-conflict',
            debugRestoreOrigin: 'none',
            browserSafetyLatched: state.browserSafetyLatched,
            terminalSavePending: false,
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
      // V02-DEC-031: the blocking Mission Start Recovery Error may only leave
      // through the single-flight Retry Cleanup reconciliation or the Save
      // Conflict transition. A terminal Save Error outcome can never replace
      // it (there is no Combat owner or terminal payload to retry behind it).
      if (
        state.overlay === 'mission-start-recovery-error' &&
        action.type === 'combat-terminal/save-error'
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
        // V02-WI-05 C05: an already-set manual-resume latch survives overlay
        // replacement. Save Error/Save Conflict only replace the blocking
        // state — they never discharge an existing explicit-Resume
        // requirement. Only explicit Resume (or ownership teardown/reset)
        // clears the latch; Retry Save and focus restoration are not Resume.
        browserSafetyLatched: state.browserSafetyLatched,
        terminalSavePending: false,
      };
    case 'combat-terminal/recover':
      // V02-WI-04 C02/C03 + V02-WI-05 C03: dispatched only when a terminal
      // commitment reports `committed`.
      // - Save Error closes: without a browser-safety latch the committed
      //   Success/Evacuation exit resumes; with one, the committed outcome is
      //   held behind the terminal-exit Pause whose only action is the explicit
      //   Resume (V02-WI-04 C03 retry flow).
      // - A committed outcome that resolves under the latch from ANY other
      //   blocking overlay (Pause/Settings/Debug opened while the initial
      //   pending write was in flight) is also held behind that same Resume-only
      //   Pause instead of presenting/navigating or resuming gameplay — this
      //   covers Defeat/Game Over, which have no exit sequence (Epic §13.5,
      //   §13.7). Save Conflict remains Reload-only and is never replaced.
      if (state.overlay !== 'save-error') {
        if (
          state.browserSafetyLatched &&
          (state.overlay === 'pause' ||
            state.overlay === 'settings' ||
            state.overlay === 'debug')
        ) {
          return {
            running: false,
            overlay: 'terminal-exit-pause',
            debugRestoreOrigin: 'none',
            browserSafetyLatched: true,
            terminalSavePending: false,
          };
        }
        // The write resolved; the pending flag is cleared even when this
        // committed outcome leaves an ordinary non-latched Pause open.
        return state.terminalSavePending
          ? { ...state, terminalSavePending: false }
          : state;
      }
      if (state.browserSafetyLatched) {
        return {
          running: false,
          overlay: 'terminal-exit-pause',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: true,
          terminalSavePending: false,
        };
      }
      return {
        running: true,
        overlay: 'none',
        debugRestoreOrigin: 'none',
        browserSafetyLatched: false,
        terminalSavePending: false,
      };
    case 'combat-lifecycle/browser-safety-event':
      // Blur, hidden tab, or an accepted resize during running Combat opens one
      // Pause Overlay and latches manual Resume (AC-044-045). During
      // Settings/Debug the Overlay remains and the latch is set (AC-066).
      // During ordinary Pause or after a result, repeated events create nothing
      // (AC-067). V02-WI-04 C03: the same latch applies while Save Error is
      // open — the Overlay stays open and the manual-resume latch is set so a
      // commit that resolves while hidden is held for explicit Resume.
      // V02-WI-05 C04: while a terminal write is pending, a safety event also
      // latches from an already-open ordinary Pause, so the committed
      // Defeat/Game Over is always held for Resume instead of presenting into
      // a hidden/blurred session. Outside the pending window ordinary-Pause
      // behaviour is unchanged.
      if (state.running && state.overlay === 'none') {
        return {
          running: false,
          overlay: 'pause',
          debugRestoreOrigin: 'none',
          browserSafetyLatched: true,
          terminalSavePending: state.terminalSavePending,
        };
      }
      if (
        state.overlay === 'settings' ||
        state.overlay === 'debug' ||
        state.overlay === 'save-error'
      ) {
        return { ...state, browserSafetyLatched: true };
      }
      if (
        state.overlay === 'pause' &&
        state.terminalSavePending &&
        !state.browserSafetyLatched
      ) {
        return { ...state, browserSafetyLatched: true };
      }
      return state;
    case 'combat-terminal/pending':
      // V02-WI-05 C04: marks the pending atomic terminal write (dispatched by
      // the Combat entry immediately after the first authoritative terminal
      // relay, before the write resolves). Idempotent.
      return state.terminalSavePending
        ? state
        : { ...state, terminalSavePending: true };
    case 'combat-start/recovery-error':
      // V02-DEC-031 Mission Start Recovery Error: entered only after Combat
      // owner initialization failed AND the exact originating-marker cleanup
      // could not be proven safe (a thrown/rejected update or an unreadable
      // campaign record). The Overlay is blocking: running Combat is false,
      // Pause/Settings/Debug/Esc/Scrim/terminal commands cannot replace it,
      // and the only continuation is the single-flight `Retry Cleanup` action
      // that re-runs the same originating mission + attempt cleanup. A
      // repeated outcome stays idempotent. Save Conflict remains Reload-only
      // and the Resume-only terminal-exit Pause is never demoted.
      if (
        state.overlay === 'mission-start-recovery-error' ||
        state.overlay === 'save-conflict' ||
        state.overlay === 'terminal-exit-pause'
      ) {
        return state;
      }
      return {
        running: false,
        overlay: 'mission-start-recovery-error',
        debugRestoreOrigin: 'none',
        browserSafetyLatched: state.browserSafetyLatched,
        terminalSavePending: false,
      };
  }
}
