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
