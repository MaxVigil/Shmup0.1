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
};
const SETTINGS: CombatLifecycleState = {
  running: false,
  overlay: 'settings',
  debugRestoreOrigin: 'none',
  browserSafetyLatched: false,
};
const DEBUG_FROM_RUNNING: CombatLifecycleState = {
  running: false,
  overlay: 'debug',
  debugRestoreOrigin: 'running',
  browserSafetyLatched: false,
};
const DEBUG_FROM_PAUSE: CombatLifecycleState = {
  running: false,
  overlay: 'debug',
  debugRestoreOrigin: 'pause',
  browserSafetyLatched: false,
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
    });
    expect(reduce(latched, 'combat-lifecycle/close-settings')).toEqual({
      running: false,
      overlay: 'pause',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: true,
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
  };
  const SAVE_CONFLICT: CombatLifecycleState = {
    running: false,
    overlay: 'save-conflict',
    debugRestoreOrigin: 'none',
    browserSafetyLatched: false,
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
