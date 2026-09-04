import { describe, expect, it } from 'vitest';
import {
  IDLE_COMBAT_LIFECYCLE,
  RUNNING_COMBAT_LIFECYCLE,
  combatLifecycleReducer,
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
};
const SETTINGS: CombatLifecycleState = {
  running: false,
  overlay: 'settings',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
  terminalSavePending: false,
};
const DEBUG_FROM_RUNNING: CombatLifecycleState = {
  running: false,
  overlay: 'debug',
  debugRestoreOrigin: 'running',
  browserSafetyLatched: false,
  terminalSavePending: false,
};
const DEBUG_FROM_PAUSE: CombatLifecycleState = {
  running: false,
  overlay: 'debug',
  debugRestoreOrigin: 'pause',
  browserSafetyLatched: false,
  terminalSavePending: false,
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
    });
    expect(reduce(latched, 'combat-lifecycle/close-settings')).toEqual({
      running: false,
      overlay: 'pause',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
      terminalSavePending: false,
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
  };
  const SAVE_CONFLICT: CombatLifecycleState = {
    running: false,
    overlay: 'save-conflict',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: false,
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
  };
  const LATCHED_PAUSE: CombatLifecycleState = {
    running: false,
    overlay: 'pause',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
  };
  const LATCHED_SETTINGS: CombatLifecycleState = {
    running: false,
    overlay: 'settings',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
  };
  const LATCHED_DEBUG: CombatLifecycleState = {
    running: false,
    overlay: 'debug',
    debugRestoreOrigin: 'running',
    browserSafetyLatched: true,
    terminalSavePending: false,
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
  };
  const PENDING_PAUSED: CombatLifecycleState = {
    running: false,
    overlay: 'pause',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
    terminalSavePending: true,
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
  };
  const LATCHED_SAVE_ERROR: CombatLifecycleState = {
    running: false,
    overlay: 'save-error',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: true,
    terminalSavePending: false,
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
