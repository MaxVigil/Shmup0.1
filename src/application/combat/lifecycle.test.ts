import { describe, expect, it } from 'vitest';
import {
  IDLE_COMBAT_LIFECYCLE,
  RUNNING_COMBAT_LIFECYCLE,
  combatLifecycleReducer,
  evacuationAvailability,
} from './lifecycle';
import type { CombatLifecycleAction, CombatLifecycleState } from './lifecycle';

/**
 * S13 lifecycle command matrix (Combat §10–12, AC-052/063–069). Each command
 * is a strict no-op unless the current state is explicitly eligible; repeated,
 * racing, or out-of-matrix commands never change state.
 */

const RUNNING: CombatLifecycleState = RUNNING_COMBAT_LIFECYCLE;
const PAUSED: CombatLifecycleState = {
  running: false,
  overlay: 'pause',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
  terminalSavePending: false,
  evacuationConfirmationOrigin: 'none',
  evacuationCommitted: false,
};
const SETTINGS: CombatLifecycleState = {
  running: false,
  overlay: 'settings',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
  terminalSavePending: false,
  evacuationConfirmationOrigin: 'none',
  evacuationCommitted: false,
};
const DEBUG_FROM_RUNNING: CombatLifecycleState = {
  running: false,
  overlay: 'debug',
  debugRestoreOrigin: 'running',
  browserSafetyLatched: false,
  terminalSavePending: false,
  evacuationConfirmationOrigin: 'none',
  evacuationCommitted: false,
};
const DEBUG_FROM_PAUSE: CombatLifecycleState = {
  running: false,
  overlay: 'debug',
  debugRestoreOrigin: 'pause',
  browserSafetyLatched: false,
  terminalSavePending: false,
  evacuationConfirmationOrigin: 'none',
  evacuationCommitted: false,
};
const IDLE: CombatLifecycleState = IDLE_COMBAT_LIFECYCLE;

function reduce(
  state: CombatLifecycleState,
  type: CombatLifecycleAction['type'],
): CombatLifecycleState {
  // The pure transition reducer never reads the originating identity; the
  // session reducer enforces it. A fixed dummy ordinal keeps the type honest.
  return combatLifecycleReducer(state, { type, missionInstanceOrdinal: 0 });
}

describe('S13 lifecycle: running with no Overlay', () => {
  it('Pause Button / P / Esc opens Pause and stops running', () => {
    expect(reduce(RUNNING, 'combat-lifecycle/open-pause')).toEqual(PAUSED);
  });

  it('Settings Button opens Settings and stops running', () => {
    expect(reduce(RUNNING, 'combat-lifecycle/open-settings')).toEqual(SETTINGS);
  });

  it('F1 opens Debug paused with the running restore origin', () => {
    expect(reduce(RUNNING, 'combat-lifecycle/open-debug')).toEqual(
      DEBUG_FROM_RUNNING,
    );
  });

  it('Resume / close-settings / close-debug are no-ops while running', () => {
    for (const action of [
      'combat-lifecycle/resume',
      'combat-lifecycle/close-settings',
      'combat-lifecycle/close-debug',
    ] as const) {
      expect(reduce(RUNNING, action)).toBe(RUNNING);
    }
  });
});

describe('S13 lifecycle: Pause Overlay', () => {
  it('P / Esc / Resume resumes with the same runtime', () => {
    expect(reduce(PAUSED, 'combat-lifecycle/resume')).toEqual(RUNNING);
  });

  it('F1 replaces Pause with Debug preserving the paused state', () => {
    expect(reduce(PAUSED, 'combat-lifecycle/open-debug')).toEqual(
      DEBUG_FROM_PAUSE,
    );
  });

  it('Settings is ignored while Pause is open', () => {
    expect(reduce(PAUSED, 'combat-lifecycle/open-settings')).toBe(PAUSED);
  });

  it('open-pause is a no-op while already paused', () => {
    expect(reduce(PAUSED, 'combat-lifecycle/open-pause')).toBe(PAUSED);
  });

  it('a browser safety event creates nothing while Pause is open (AC-067)', () => {
    expect(reduce(PAUSED, 'combat-lifecycle/browser-safety-event')).toBe(
      PAUSED,
    );
    const latchedPause = reduce(
      PAUSED,
      'combat-lifecycle/browser-safety-event',
    );
    expect(reduce(latchedPause, 'combat-lifecycle/browser-safety-event')).toBe(
      latchedPause,
    );
  });
});

describe('S13 lifecycle: Settings Overlay', () => {
  it('only Close/Esc (close-settings) may leave Settings', () => {
    const resumed = reduce(SETTINGS, 'combat-lifecycle/close-settings');
    expect(resumed).toEqual(RUNNING);
  });

  it('P, F1, Resume, and open-pause are ignored while Settings is open', () => {
    for (const action of [
      'combat-lifecycle/resume',
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
    ] as const) {
      expect(reduce(SETTINGS, action)).toBe(SETTINGS);
    }
  });

  it('a browser safety event keeps Settings open and latches manual Resume', () => {
    const latched = reduce(SETTINGS, 'combat-lifecycle/browser-safety-event');
    expect(latched).toEqual({
      running: false,
      overlay: 'settings',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    expect(reduce(latched, 'combat-lifecycle/close-settings')).toEqual({
      running: false,
      overlay: 'pause',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    const resumed = reduce(
      reduce(latched, 'combat-lifecycle/close-settings'),
      'combat-lifecycle/resume',
    );
    expect(resumed).toEqual(RUNNING);
  });
});

describe('S13 lifecycle: Debug Overlay', () => {
  it('close from the running origin resumes Combat', () => {
    expect(reduce(DEBUG_FROM_RUNNING, 'combat-lifecycle/close-debug')).toEqual(
      RUNNING,
    );
  });

  it('close from the pause origin reopens Pause without resuming', () => {
    expect(reduce(DEBUG_FROM_PAUSE, 'combat-lifecycle/close-debug')).toEqual(
      PAUSED,
    );
  });

  it('a latched safety event overrides automatic restoration (AC-066)', () => {
    const latchedDebug = reduce(
      DEBUG_FROM_RUNNING,
      'combat-lifecycle/browser-safety-event',
    );
    expect(latchedDebug.browserSafetyLatched).toBe(true);
    expect(reduce(latchedDebug, 'combat-lifecycle/close-debug')).toEqual({
      running: false,
      overlay: 'pause',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
  });

  it('P, F (routing), Settings, and open-pause are ignored while Debug is open', () => {
    for (const action of [
      'combat-lifecycle/resume',
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
    ] as const) {
      expect(reduce(DEBUG_FROM_RUNNING, action)).toBe(DEBUG_FROM_RUNNING);
    }
  });

  it('close-debug is a no-op when no Debug Overlay is open', () => {
    expect(reduce(RUNNING, 'combat-lifecycle/close-debug')).toBe(RUNNING);
  });
});

describe('S13 lifecycle: browser safety events', () => {
  it('blur/hidden/resize during running Combat opens one Pause and latches', () => {
    const paused = reduce(RUNNING, 'combat-lifecycle/browser-safety-event');
    expect(paused).toEqual({
      running: false,
      overlay: 'pause',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    // Repeated events create nothing new (AC-069).
    expect(reduce(paused, 'combat-lifecycle/browser-safety-event')).toBe(
      paused,
    );
  });

  it('explicit Pause is not latched (browser events are the only latch source)', () => {
    expect(PAUSED.browserSafetyLatched).toBe(false);
    expect(RUNNING_COMBAT_LIFECYCLE.browserSafetyLatched).toBe(false);
  });

  it('a browser event on the idle state is a no-op (no Active Mission)', () => {
    expect(reduce(IDLE, 'combat-lifecycle/browser-safety-event')).toBe(IDLE);
  });
});

describe('V02-WI-04 C02: terminal-persistence recovery states', () => {
  const SAVE_ERROR: CombatLifecycleState = {
    running: false,
    overlay: 'save-error',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };
  const SAVE_CONFLICT: CombatLifecycleState = {
    running: false,
    overlay: 'save-conflict',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };

  it('save-error opens a blocking Save Error from the terminal state', () => {
    expect(reduce(RUNNING, 'combat-terminal/save-error')).toEqual(SAVE_ERROR);
  });

  it('save-conflict opens a blocking Save Conflict from the terminal state', () => {
    expect(reduce(RUNNING, 'combat-terminal/save-conflict')).toEqual(
      SAVE_CONFLICT,
    );
  });

  it('repeated save-error/save-conflict outcomes stay idempotent', () => {
    expect(reduce(SAVE_ERROR, 'combat-terminal/save-error')).toBe(SAVE_ERROR);
    expect(reduce(SAVE_CONFLICT, 'combat-terminal/save-conflict')).toBe(
      SAVE_CONFLICT,
    );
    // Save Conflict is Reload-only: a later Save Error outcome can never
    // reopen retry on it.
    expect(reduce(SAVE_CONFLICT, 'combat-terminal/save-error')).toBe(
      SAVE_CONFLICT,
    );
  });

  it('V02-WI-04 C03: an inert Retry after Save Error transitions immediately to Save Conflict', () => {
    // The current C02 no-op left Retry Save available after this browser
    // instance lost durable authority; a save-conflict outcome while Save
    // Error is open must transition, never stay retryable.
    expect(reduce(SAVE_ERROR, 'combat-terminal/save-conflict')).toEqual(
      SAVE_CONFLICT,
    );
    // A latched Save Error keeps the latch across the authority-loss transition.
    const latchedSaveError: CombatLifecycleState = {
      ...SAVE_ERROR,
      browserSafetyLatched: true,
    };
    expect(reduce(latchedSaveError, 'combat-terminal/save-conflict')).toEqual({
      ...SAVE_CONFLICT,
      browserSafetyLatched: true,
    });
  });

  it('Save Error is blocking: Pause, Settings, and Debug cannot replace it', () => {
    for (const action of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
    ] as const) {
      expect(reduce(SAVE_ERROR, action)).toBe(SAVE_ERROR);
    }
  });

  it('Save Conflict is blocking: only a reload can leave it', () => {
    for (const action of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
      'combat-lifecycle/resume',
    ] as const) {
      expect(reduce(SAVE_CONFLICT, action)).toBe(SAVE_CONFLICT);
    }
    // Recover is inert on Save Conflict (Reload is the only continuation).
    expect(reduce(SAVE_CONFLICT, 'combat-terminal/recover')).toBe(
      SAVE_CONFLICT,
    );
  });

  it('recover closes Save Error and resumes the committed exit', () => {
    expect(reduce(SAVE_ERROR, 'combat-terminal/recover')).toEqual(RUNNING);
  });

  it('recover is inert everywhere except Save Error', () => {
    expect(reduce(RUNNING, 'combat-terminal/recover')).toBe(RUNNING);
    expect(reduce(PAUSED, 'combat-terminal/recover')).toBe(PAUSED);
    expect(reduce(IDLE, 'combat-terminal/recover')).toBe(IDLE);
  });
});

describe('V02-WI-04 C03: hidden-tab/focus safety during terminal recovery', () => {
  const SAVE_ERROR: CombatLifecycleState = {
    running: false,
    overlay: 'save-error',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };
  const LATCHED_SAVE_ERROR: CombatLifecycleState = {
    ...SAVE_ERROR,
    browserSafetyLatched: true,
  };
  const TERMINAL_EXIT_PAUSE: CombatLifecycleState = {
    running: false,
    overlay: 'terminal-exit-pause',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };

  it('a browser-safety event while Save Error is open latches manual Resume without closing the Overlay', () => {
    const latched = reduce(SAVE_ERROR, 'combat-lifecycle/browser-safety-event');
    expect(latched).toEqual(LATCHED_SAVE_ERROR);
    // Repeated events stay idempotent.
    expect(reduce(latched, 'combat-lifecycle/browser-safety-event')).toEqual(
      LATCHED_SAVE_ERROR,
    );
  });

  it('recover while Save Error is latched closes Save Error into the terminal-exit Pause', () => {
    expect(reduce(LATCHED_SAVE_ERROR, 'combat-terminal/recover')).toEqual(
      TERMINAL_EXIT_PAUSE,
    );
  });

  it('recover while Save Error is NOT latched still resumes the committed exit directly', () => {
    expect(reduce(SAVE_ERROR, 'combat-terminal/recover')).toEqual(RUNNING);
  });

  it('the terminal-exit Pause is Resume-only after the immutable Success commit', () => {
    for (const action of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/close-settings',
      'combat-lifecycle/open-debug',
      'combat-lifecycle/close-debug',
      'combat-terminal/recover',
      'combat-terminal/save-error',
      'combat-terminal/save-conflict',
      'combat-lifecycle/browser-safety-event',
    ] as const) {
      expect(reduce(TERMINAL_EXIT_PAUSE, action)).toBe(TERMINAL_EXIT_PAUSE);
    }
  });

  it('only explicit Resume leaves the terminal-exit Pause and starts the committed Success exit', () => {
    expect(reduce(TERMINAL_EXIT_PAUSE, 'combat-lifecycle/resume')).toEqual(
      RUNNING,
    );
  });

  it('Save Conflict remains Reload-only even when a safety latch is present', () => {
    const latchedConflict: CombatLifecycleState = {
      running: false,
      overlay: 'save-conflict',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    };
    for (const action of [
      'combat-lifecycle/resume',
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
      'combat-terminal/recover',
    ] as const) {
      expect(reduce(latchedConflict, action)).toBe(latchedConflict);
    }
  });
});

describe('V02-WI-05 C03: Defeat/Game Over committed under the initial-write latch', () => {
  const TERMINAL_EXIT_PAUSE: CombatLifecycleState = {
    running: false,
    overlay: 'terminal-exit-pause',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };
  const LATCHED_PAUSE: CombatLifecycleState = {
    running: false,
    overlay: 'pause',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };
  const LATCHED_SETTINGS: CombatLifecycleState = {
    running: false,
    overlay: 'settings',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };
  const LATCHED_DEBUG: CombatLifecycleState = {
    running: false,
    overlay: 'debug',
    debugRestoreOrigin: 'running',
    browserSafetyLatched: true,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };

  it('recover from a latched Pause holds the committed result behind the Resume-only terminal-exit Pause', () => {
    // The tab was hidden/blurred while the initial pending Defeat write was in
    // flight (Pause overlay + latch). When the write commits, the committed
    // Defeat/Game Over must NOT present/navigate automatically.
    expect(reduce(LATCHED_PAUSE, 'combat-terminal/recover')).toEqual(
      TERMINAL_EXIT_PAUSE,
    );
  });

  it('recover from a latched Settings/Debug overlay also closes into the terminal-exit Pause', () => {
    for (const state of [LATCHED_SETTINGS, LATCHED_DEBUG]) {
      expect(reduce(state, 'combat-terminal/recover')).toEqual(
        TERMINAL_EXIT_PAUSE,
      );
    }
  });

  it('recover stays inert from a non-latched Pause (no committed outcome boundary is active)', () => {
    expect(reduce(PAUSED, 'combat-terminal/recover')).toBe(PAUSED);
  });

  it('the terminal-exit Pause is Resume-only and repeated recover is idempotent', () => {
    expect(reduce(TERMINAL_EXIT_PAUSE, 'combat-terminal/recover')).toBe(
      TERMINAL_EXIT_PAUSE,
    );
    // Only explicit Resume leaves it; Pause/Settings/Debug/Retry/Conflict and
    // repeated safety events stay inert.
    expect(reduce(TERMINAL_EXIT_PAUSE, 'combat-lifecycle/resume')).toEqual(
      RUNNING,
    );
    for (const action of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
      'combat-terminal/save-error',
      'combat-terminal/save-conflict',
      'combat-lifecycle/browser-safety-event',
    ] as const) {
      expect(reduce(TERMINAL_EXIT_PAUSE, action)).toBe(TERMINAL_EXIT_PAUSE);
    }
  });
});

describe('V02-WI-05 C04: terminal-pending write keeps browser safety terminal-aware', () => {
  const PENDING_RUNNING: CombatLifecycleState = {
    running: true,
    overlay: 'none',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: true,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };
  const PENDING_PAUSED: CombatLifecycleState = {
    running: false,
    overlay: 'pause',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: true,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };

  it('the pending action marks the lifecycle once and is idempotent', () => {
    expect(reduce(RUNNING, 'combat-terminal/pending')).toEqual(PENDING_RUNNING);
    expect(reduce(PENDING_RUNNING, 'combat-terminal/pending')).toBe(
      PENDING_RUNNING,
    );
    // Ordinary non-pending running/paused states stay unmarked.
    expect(reduce(PAUSED, 'combat-terminal/pending').terminalSavePending).toBe(
      true,
    );
    expect(RUNNING.terminalSavePending).toBe(false);
  });

  it('Pause opened during the pending write stays terminal-aware', () => {
    expect(reduce(PENDING_RUNNING, 'combat-lifecycle/open-pause')).toEqual(
      PENDING_PAUSED,
    );
    // Resuming before the write resolves keeps the pending flag (a later
    // safety event from Pause can still latch).
    expect(reduce(PENDING_PAUSED, 'combat-lifecycle/resume')).toEqual(
      PENDING_RUNNING,
    );
  });

  it('S2 regression: a browser-safety event during the pending write latches even from an already-open ordinary Pause', () => {
    const latched = reduce(
      PENDING_PAUSED,
      'combat-lifecycle/browser-safety-event',
    );
    expect(latched).toEqual({
      ...PENDING_PAUSED,
      browserSafetyLatched: true,
    });
    // Repeated safety events stay idempotent.
    expect(reduce(latched, 'combat-lifecycle/browser-safety-event')).toBe(
      latched,
    );
  });

  it('ordinary non-pending Pause still ignores browser-safety events (AC-067 unchanged)', () => {
    expect(reduce(PAUSED, 'combat-lifecycle/browser-safety-event')).toBe(
      PAUSED,
    );
    expect(PAUSED.browserSafetyLatched).toBe(false);
  });

  it('the committed outcome under the pending-write latch is held behind the terminal-exit Pause', () => {
    const latchedPendingPause = reduce(
      PENDING_PAUSED,
      'combat-lifecycle/browser-safety-event',
    );
    // recover is dispatched only after the terminal write reports `committed`.
    expect(reduce(latchedPendingPause, 'combat-terminal/recover')).toEqual({
      running: false,
      overlay: 'terminal-exit-pause',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    // The write resolved: the pending flag is cleared and only explicit
    // Resume leaves the terminal-exit Pause.
    const held = reduce(latchedPendingPause, 'combat-terminal/recover');
    expect(reduce(held, 'combat-lifecycle/resume')).toEqual(RUNNING);
  });

  it('a commit that resolves while an ordinary non-latched Pause is open clears the pending flag without latching', () => {
    const resolved = reduce(PENDING_PAUSED, 'combat-terminal/recover');
    expect(resolved).toEqual(PAUSED);
  });

  it('blur during a Settings/Debug overlay while the write is pending latches and preserves the flag', () => {
    const settingsPending: CombatLifecycleState = {
      running: false,
      overlay: 'settings',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: false,
      terminalSavePending: true,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    };
    const latched = reduce(
      settingsPending,
      'combat-lifecycle/browser-safety-event',
    );
    expect(latched.browserSafetyLatched).toBe(true);
    expect(latched.terminalSavePending).toBe(true);
    expect(reduce(latched, 'combat-terminal/recover').overlay).toBe(
      'terminal-exit-pause',
    );
  });
});

describe('V02-WI-05 C05: the manual-resume latch survives terminal recovery transitions', () => {
  const LATCHED_PENDING_PAUSE: CombatLifecycleState = {
    running: false,
    overlay: 'pause',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: true,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };
  const LATCHED_SAVE_ERROR: CombatLifecycleState = {
    running: false,
    overlay: 'save-error',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };

  it('a failed/rejected completion opens Save Error WITHOUT clearing the latch (S2 chain repair)', () => {
    // pending initial write -> ordinary Pause -> browser-safety -> the write
    // fails. Opening Save Error replaces the blocking overlay but must never
    // discharge the already-set manual-Resume requirement.
    const opened = reduce(LATCHED_PENDING_PAUSE, 'combat-terminal/save-error');
    expect(opened).toEqual({
      running: false,
      overlay: 'save-error',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    // The latch is present on the Save Error state itself.
    expect(opened.browserSafetyLatched).toBe(true);
  });

  it('repeated failure keeps Save Error latched; a committed Retry then holds behind the terminal-exit Pause', () => {
    const latchedError = reduce(
      LATCHED_PENDING_PAUSE,
      'combat-terminal/save-error',
    );
    // Repeated failure is idempotent and keeps the latch.
    expect(reduce(latchedError, 'combat-terminal/save-error')).toBe(
      latchedError,
    );
    // Focus restoration is not a lifecycle action and never clears the latch;
    // only an explicit Resume does. A committed Retry Save under the preserved
    // latch therefore closes Save Error into the Resume-only terminal-exit
    // Pause instead of presenting the Defeat/Game Over.
    expect(reduce(latchedError, 'combat-terminal/recover')).toEqual({
      running: false,
      overlay: 'terminal-exit-pause',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
  });

  it('an inert Retry (Save Conflict) preserves the latch and stays Reload-only', () => {
    const latchedError = reduce(
      LATCHED_PENDING_PAUSE,
      'combat-terminal/save-error',
    );
    const conflict = reduce(latchedError, 'combat-terminal/save-conflict');
    expect(conflict.overlay).toBe('save-conflict');
    expect(conflict.browserSafetyLatched).toBe(true);
    // Reload is the only continuation — neither Resume nor recover leaves it.
    expect(reduce(conflict, 'combat-lifecycle/resume')).toBe(conflict);
    expect(reduce(conflict, 'combat-terminal/recover')).toBe(conflict);
  });

  it('only an explicit Resume discharges the latch (Save Error latched -> committed -> Resume)', () => {
    const latchedError = reduce(
      LATCHED_PENDING_PAUSE,
      'combat-terminal/save-error',
    );
    const held = reduce(latchedError, 'combat-terminal/recover');
    expect(held.overlay).toBe('terminal-exit-pause');
    expect(held.browserSafetyLatched).toBe(true);
    // Resume is the only action that discharges it.
    expect(reduce(held, 'combat-lifecycle/resume')).toEqual(RUNNING);
  });

  it('a non-latched terminal failure still opens an unlatched Save Error (ordinary path unchanged)', () => {
    expect(reduce(RUNNING, 'combat-terminal/save-error')).toEqual({
      running: false,
      overlay: 'save-error',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: false,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    expect(LATCHED_SAVE_ERROR.browserSafetyLatched).toBe(true);
  });
});

describe('V02-DEC-031: Mission Start Recovery Error lifecycle state', () => {
  const RECOVERY_ERROR: CombatLifecycleState = {
    running: false,
    overlay: 'mission-start-recovery-error',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: false,
    evacuationConfirmationOrigin: 'none',
    evacuationCommitted: false,
  };

  it('opens the blocking Mission Start Recovery Error from the frozen Combat shell', () => {
    expect(reduce(RUNNING, 'combat-start/recovery-error')).toEqual(
      RECOVERY_ERROR,
    );
  });

  it('is idempotent under repeated recovery-error outcomes', () => {
    expect(reduce(RECOVERY_ERROR, 'combat-start/recovery-error')).toBe(
      RECOVERY_ERROR,
    );
  });

  it('is blocking: Pause, Settings, Debug, Resume, Save Error, and browser events cannot replace it', () => {
    for (const type of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/resume',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
      'combat-terminal/save-error',
      'combat-terminal/recover',
      'combat-lifecycle/browser-safety-event',
    ] as const) {
      expect(reduce(RECOVERY_ERROR, type)).toBe(RECOVERY_ERROR);
    }
  });

  it('a durable Save Conflict outcome replaces the recovery Overlay with the Reload-only Save Conflict state', () => {
    const conflict = reduce(RECOVERY_ERROR, 'combat-terminal/save-conflict');
    expect(conflict.overlay).toBe('save-conflict');
    expect(conflict.running).toBe(false);
    // Save Conflict is Reload-only; Resume/recover/recovery-error cannot leave it.
    expect(reduce(conflict, 'combat-lifecycle/resume')).toBe(conflict);
    expect(reduce(conflict, 'combat-terminal/recover')).toBe(conflict);
    expect(reduce(conflict, 'combat-start/recovery-error')).toBe(conflict);
  });

  it('never demotes Save Conflict or the terminal-exit Pause to the recovery Overlay', () => {
    const conflict = reduce(RUNNING, 'combat-terminal/save-conflict');
    expect(reduce(conflict, 'combat-start/recovery-error')).toBe(conflict);
    const held = reduce(RECOVERY_ERROR, 'combat-terminal/save-conflict');
    expect(reduce(held, 'combat-start/recovery-error')).toBe(held);
  });
});

describe('V02-WI-05 E01: Evacuation Confirmation lifecycle (Epic §13.4, §15.5, V02-DEC-013/027/030)', () => {
  const openFromRunning = (): CombatLifecycleState =>
    reduce(RUNNING, 'combat-lifecycle/open-evacuation-confirmation');
  const openFromPause = (): CombatLifecycleState =>
    reduce(PAUSED, 'combat-lifecycle/open-evacuation-confirmation');

  it('open from running pauses Combat and records the exact running origin', () => {
    const open = openFromRunning();
    expect(open.running).toBe(false);
    expect(open.overlay).toBe('evacuation-confirmation');
    expect(open.evacuationConfirmationOrigin).toBe('running');
    expect(open.evacuationCommitted).toBe(false);
    expect(open.browserSafetyLatched).toBe(false);
    expect(open.terminalSavePending).toBe(false);
    expect(open.debugRestoreOrigin).toBe('none');
  });

  it('open from Pause stays paused and records the exact pause origin', () => {
    const open = openFromPause();
    expect(open.running).toBe(false);
    expect(open.overlay).toBe('evacuation-confirmation');
    expect(open.evacuationConfirmationOrigin).toBe('pause');
    expect(open.evacuationCommitted).toBe(false);
    expect(open.browserSafetyLatched).toBe(false);
  });

  it('a second Open while the confirmation is open is a strict no-op', () => {
    const open = openFromRunning();
    expect(reduce(open, 'combat-lifecycle/open-evacuation-confirmation')).toBe(
      open,
    );
  });

  it('Open is a no-op once Evacuation is committed (no re-offer after confirmation)', () => {
    const confirmed = reduce(
      openFromRunning(),
      'combat-lifecycle/confirm-evacuation',
    );
    expect(confirmed.evacuationCommitted).toBe(true);
    expect(
      reduce(confirmed, 'combat-lifecycle/open-evacuation-confirmation'),
    ).toBe(confirmed);
    // ... even from an ordinary Pause opened after confirmation.
    const pausedAfterConfirm = reduce(confirmed, 'combat-lifecycle/open-pause');
    expect(
      reduce(
        pausedAfterConfirm,
        'combat-lifecycle/open-evacuation-confirmation',
      ),
    ).toBe(pausedAfterConfirm);
  });

  it('Cancel from a running origin restores running and clears the origin exactly once', () => {
    const cancelled = reduce(
      openFromRunning(),
      'combat-lifecycle/cancel-evacuation-confirmation',
    );
    expect(cancelled).toEqual(RUNNING);
    expect(cancelled.evacuationConfirmationOrigin).toBe('none');
    expect(cancelled.evacuationCommitted).toBe(false);
    // Repeated Cancel (now out of state) is a strict no-op.
    expect(
      reduce(cancelled, 'combat-lifecycle/cancel-evacuation-confirmation'),
    ).toBe(cancelled);
  });

  it('Cancel from a Pause origin returns to Pause and clears the origin', () => {
    const cancelled = reduce(
      openFromPause(),
      'combat-lifecycle/cancel-evacuation-confirmation',
    );
    expect(cancelled.running).toBe(false);
    expect(cancelled.overlay).toBe('pause');
    expect(cancelled.evacuationConfirmationOrigin).toBe('none');
  });

  it('Cancel from a running origin under a browser-safety latch returns to Pause with the latch intact', () => {
    const open = openFromRunning();
    const latched = reduce(open, 'combat-lifecycle/browser-safety-event');
    expect(latched.overlay).toBe('evacuation-confirmation');
    expect(latched.browserSafetyLatched).toBe(true);
    const cancelled = reduce(
      latched,
      'combat-lifecycle/cancel-evacuation-confirmation',
    );
    expect(cancelled.overlay).toBe('pause');
    expect(cancelled.running).toBe(false);
    expect(cancelled.browserSafetyLatched).toBe(true);
    expect(cancelled.evacuationConfirmationOrigin).toBe('none');
    // Only the canonical explicit Resume clears the latch.
    const resumed = reduce(cancelled, 'combat-lifecycle/resume');
    expect(resumed.running).toBe(true);
    expect(resumed.browserSafetyLatched).toBe(false);
  });

  it('Confirm clears the origin exactly once, records the commitment fact, and returns to running', () => {
    const confirmed = reduce(
      openFromRunning(),
      'combat-lifecycle/confirm-evacuation',
    );
    expect(confirmed).toEqual({
      ...RUNNING,
      evacuationCommitted: true,
    });
    expect(confirmed.evacuationConfirmationOrigin).toBe('none');
    // Repeated Confirm is a strict no-op.
    expect(reduce(confirmed, 'combat-lifecycle/confirm-evacuation')).toBe(
      confirmed,
    );
    // Repeated Cancel after Confirm is a strict no-op.
    expect(
      reduce(confirmed, 'combat-lifecycle/cancel-evacuation-confirmation'),
    ).toBe(confirmed);
    // Cancel of an open confirmation never silently confirms.
    const cancelled = reduce(
      openFromPause(),
      'combat-lifecycle/cancel-evacuation-confirmation',
    );
    expect(cancelled.evacuationCommitted).toBe(false);
    expect(reduce(cancelled, 'combat-lifecycle/confirm-evacuation')).toBe(
      cancelled,
    );
  });

  it('Confirm from a Pause origin resumes Combat with the commitment fact (no latch)', () => {
    const confirmed = reduce(
      openFromPause(),
      'combat-lifecycle/confirm-evacuation',
    );
    expect(confirmed.running).toBe(true);
    expect(confirmed.overlay).toBe('none');
    expect(confirmed.evacuationConfirmationOrigin).toBe('none');
    expect(confirmed.evacuationCommitted).toBe(true);
  });

  it('Confirm under a browser-safety latch returns to Pause and keeps the latch for explicit Resume', () => {
    const open = openFromPause();
    const latched = reduce(open, 'combat-lifecycle/browser-safety-event');
    expect(latched.overlay).toBe('evacuation-confirmation');
    const confirmed = reduce(latched, 'combat-lifecycle/confirm-evacuation');
    expect(confirmed.overlay).toBe('pause');
    expect(confirmed.running).toBe(false);
    expect(confirmed.browserSafetyLatched).toBe(true);
    expect(confirmed.evacuationCommitted).toBe(true);
    expect(confirmed.evacuationConfirmationOrigin).toBe('none');
    // Only explicit Resume may leave the latched Pause.
    const resumed = reduce(confirmed, 'combat-lifecycle/resume');
    expect(resumed.running).toBe(true);
    expect(resumed.browserSafetyLatched).toBe(false);
    expect(resumed.evacuationCommitted).toBe(true);
  });

  it('a browser-safety event while the confirmation is open latches without closing or replacing it', () => {
    const open = openFromRunning();
    const latched = reduce(open, 'combat-lifecycle/browser-safety-event');
    expect(latched.overlay).toBe('evacuation-confirmation');
    expect(latched.evacuationConfirmationOrigin).toBe('running');
    expect(latched.running).toBe(false);
    expect(latched.browserSafetyLatched).toBe(true);
    // Repeated events are idempotent.
    expect(reduce(latched, 'combat-lifecycle/browser-safety-event')).toBe(
      latched,
    );
    // Pause/Settings/Debug/Resume cannot close or replace the confirmation.
    for (const type of [
      'combat-lifecycle/resume',
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
    ] as const) {
      expect(reduce(latched, type)).toBe(latched);
    }
  });

  it('Open is a strict no-op from every incompatible blocking Overlay', () => {
    const incompatibleStates = [
      reduce(RUNNING, 'combat-lifecycle/open-settings'),
      reduce(PAUSED, 'combat-lifecycle/open-debug'),
      reduce(RUNNING, 'combat-terminal/save-error'),
      reduce(RUNNING, 'combat-terminal/save-conflict'),
      reduce(RUNNING, 'combat-start/recovery-error'),
    ];
    // The terminal-exit Pause is built through the latched committed-recover
    // chain and must also reject Open.
    const latchedPause: CombatLifecycleState = {
      ...RUNNING,
      running: false,
      overlay: 'pause',
      browserSafetyLatched: true,
    };
    const terminalExit = reduce(latchedPause, 'combat-terminal/recover');
    incompatibleStates.push(terminalExit);
    for (const state of incompatibleStates) {
      expect(
        reduce(state, 'combat-lifecycle/open-evacuation-confirmation'),
      ).toBe(state);
    }
  });

  it('Open is a strict no-op while a terminal write is pending and when not running with no Overlay', () => {
    const pendingRunning = reduce(RUNNING, 'combat-terminal/pending');
    expect(
      reduce(pendingRunning, 'combat-lifecycle/open-evacuation-confirmation'),
    ).toBe(pendingRunning);
    const idle: CombatLifecycleState = { ...IDLE_COMBAT_LIFECYCLE };
    expect(reduce(idle, 'combat-lifecycle/open-evacuation-confirmation')).toBe(
      idle,
    );
  });

  it('terminal-pending, save-recovery, and mission-start-recovery relays are strict no-ops while the confirmation is open', () => {
    const open = openFromRunning();
    expect(reduce(open, 'combat-terminal/pending')).toBe(open);
    expect(reduce(open, 'combat-terminal/save-error')).toBe(open);
    expect(reduce(open, 'combat-terminal/save-conflict')).toBe(open);
    expect(reduce(open, 'combat-start/recovery-error')).toBe(open);
    expect(reduce(open, 'combat-terminal/recover')).toBe(open);
  });

  it('Confirm and Cancel are strict no-ops when no confirmation is open', () => {
    expect(reduce(RUNNING, 'combat-lifecycle/confirm-evacuation')).toBe(
      RUNNING,
    );
    expect(reduce(PAUSED, 'combat-lifecycle/confirm-evacuation')).toBe(PAUSED);
    expect(
      reduce(RUNNING, 'combat-lifecycle/cancel-evacuation-confirmation'),
    ).toBe(RUNNING);
    expect(
      reduce(IDLE, 'combat-lifecycle/cancel-evacuation-confirmation'),
    ).toBe(IDLE);
  });

  it('the neutral IDLE and entry RUNNING lifecycle states carry no origin and no commitment', () => {
    expect(IDLE.evacuationConfirmationOrigin).toBe('none');
    expect(IDLE.evacuationCommitted).toBe(false);
    expect(RUNNING.evacuationConfirmationOrigin).toBe('none');
    expect(RUNNING.evacuationCommitted).toBe(false);
  });
});

describe('V02-WI-05 E03 C01: application-owned Evacuation availability selector (Epic §13.4, §15.5)', () => {
  const withLifecycle = (
    base: CombatLifecycleState,
    overrides: Partial<CombatLifecycleState>,
  ): CombatLifecycleState => ({ ...base, ...overrides });

  const CONFIRMATION_FROM_RUNNING = withLifecycle(RUNNING, {
    running: false,
    overlay: 'evacuation-confirmation',
    evacuationConfirmationOrigin: 'running',
  });
  const CONFIRMATION_FROM_PAUSE = withLifecycle(PAUSED, {
    overlay: 'evacuation-confirmation',
    evacuationConfirmationOrigin: 'pause',
  });
  const SAVE_ERROR = reduce(RUNNING, 'combat-terminal/save-error');
  const SAVE_CONFLICT = reduce(RUNNING, 'combat-terminal/save-conflict');
  const RECOVERY_ERROR = reduce(RUNNING, 'combat-start/recovery-error');
  const TERMINAL_EXIT_PAUSE = withLifecycle(PAUSED, {
    overlay: 'terminal-exit-pause',
    browserSafetyLatched: true,
    terminalSavePending: false,
  });
  const TERMINAL_PENDING_RUNNING = reduce(RUNNING, 'combat-terminal/pending');
  const TERMINAL_PENDING_PAUSE = reduce(PAUSED, 'combat-terminal/pending');
  const COMMITTED_RUNNING = withLifecycle(RUNNING, {
    evacuationCommitted: true,
  });
  const COMMITTED_PAUSE = withLifecycle(PAUSED, { evacuationCommitted: true });

  it('is the single rule for the two activatable origins', () => {
    expect(evacuationAvailability(RUNNING)).toEqual({
      visible: true,
      enabled: true,
      origin: 'running',
    });
    expect(evacuationAvailability(PAUSED)).toEqual({
      visible: true,
      enabled: true,
      origin: 'pause',
    });
  });

  it('hides the affordance while an atomic terminal write is pending', () => {
    for (const state of [TERMINAL_PENDING_RUNNING, TERMINAL_PENDING_PAUSE]) {
      expect(evacuationAvailability(state)).toEqual({
        visible: false,
        enabled: false,
        origin: 'none',
      });
    }
  });

  it('hides the affordance in every terminal/recovery Overlay state', () => {
    for (const state of [
      SAVE_ERROR,
      SAVE_CONFLICT,
      TERMINAL_EXIT_PAUSE,
      RECOVERY_ERROR,
      COMMITTED_RUNNING,
      COMMITTED_PAUSE,
    ]) {
      expect(evacuationAvailability(state)).toEqual({
        visible: false,
        enabled: false,
        origin: 'none',
      });
    }
  });

  it('keeps the affordance visible but disabled behind ordinary blocking Overlays', () => {
    for (const state of [
      SETTINGS,
      DEBUG_FROM_RUNNING,
      DEBUG_FROM_PAUSE,
      CONFIRMATION_FROM_RUNNING,
      CONFIRMATION_FROM_PAUSE,
      IDLE,
    ]) {
      const availability = evacuationAvailability(state);
      expect(availability.visible).toBe(true);
      expect(availability.enabled).toBe(false);
      expect(availability.origin).toBe('none');
    }
  });

  it('the lifecycle reducer accepts exactly the activatable selector states and records the selector origin', () => {
    const states: readonly (readonly [string, CombatLifecycleState])[] = [
      ['running', RUNNING],
      ['pause', PAUSED],
      ['settings', SETTINGS],
      ['debug-from-running', DEBUG_FROM_RUNNING],
      ['debug-from-pause', DEBUG_FROM_PAUSE],
      ['confirmation-from-running', CONFIRMATION_FROM_RUNNING],
      ['confirmation-from-pause', CONFIRMATION_FROM_PAUSE],
      ['terminal-pending-running', TERMINAL_PENDING_RUNNING],
      ['terminal-pending-pause', TERMINAL_PENDING_PAUSE],
      ['save-error', SAVE_ERROR],
      ['save-conflict', SAVE_CONFLICT],
      ['terminal-exit-pause', TERMINAL_EXIT_PAUSE],
      ['mission-start-recovery-error', RECOVERY_ERROR],
      ['committed-running', COMMITTED_RUNNING],
      ['committed-pause', COMMITTED_PAUSE],
      ['idle', IDLE],
    ];
    for (const [label, state] of states) {
      const availability = evacuationAvailability(state);
      const opened = reduce(
        state,
        'combat-lifecycle/open-evacuation-confirmation',
      );
      if (availability.origin === 'none') {
        // Not activatable: the command is a strict no-op — it cannot open a
        // second confirmation, replace a blocking Overlay, or change origin.
        expect(opened, label).toBe(state);
        expect(opened.evacuationConfirmationOrigin, label).toBe(
          state.evacuationConfirmationOrigin,
        );
      } else {
        expect(opened.overlay, label).toBe('evacuation-confirmation');
        expect(opened.evacuationConfirmationOrigin, label).toBe(
          availability.origin,
        );
        expect(opened.evacuationCommitted, label).toBe(false);
        expect(opened.running, label).toBe(false);
      }
    }
  });
});
