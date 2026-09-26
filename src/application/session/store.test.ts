import { describe, expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { successMissionResult } from '@test-support/session';
import { initializeSession } from './initialize-session';
import { createSessionStore, sessionReducer } from './store';
import type { MissionSnapshot } from '../mission/snapshot';

function snapshotFor(
  store: ReturnType<typeof createSessionStore>,
): MissionSnapshot {
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  return {
    missionId: 'interception-01',
    missionInstanceOrdinal: 0,
    missionAttemptId: 0,
    combatMissionSeed: 1234,
    aircraftId: session.aircraftId,
    hullIntegrity: session.hullIntegrity,
    equippedWeapon: session.equippedWeapon,
    pilot: session.pilot,
    mouseMovementEnabled: session.mouseMovementEnabled,
  };
}

function initializedStore(): ReturnType<typeof createSessionStore> {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(3735928559, CONTENT_CATALOGUE),
  });
  return store;
}

describe('createSessionStore', () => {
  it('starts without a session', () => {
    const store = createSessionStore();
    expect(store.getState()).toBeNull();
  });

  it('initializes the session through the named action', () => {
    const store = createSessionStore();
    const session = initializeSession(3735928559, CONTENT_CATALOGUE);
    store.dispatch({ type: 'session/initialized', session });
    expect(store.getState()).toBe(session);
  });

  it('ignores a second initialization (Boot idempotency)', () => {
    const store = createSessionStore();
    const first = initializeSession(3735928559, CONTENT_CATALOGUE);
    const second = initializeSession(123456789, CONTENT_CATALOGUE);
    store.dispatch({ type: 'session/initialized', session: first });
    store.dispatch({ type: 'session/initialized', session: second });
    expect(store.getState()).toBe(first);
  });

  it('notifies subscribers only on a real change and unsubscribes cleanly', () => {
    const store = createSessionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(3735928559, CONTENT_CATALOGUE),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    // A repeated initialization is ignored, so no notification fires.
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(123456789, CONTENT_CATALOGUE),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(7, CONTENT_CATALOGUE),
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('navigates between Base Screens through the named action (Base AC-004)', () => {
    const store = initializedStore();
    store.dispatch({ type: 'session/navigate', target: 'hangar' });
    expect(store.getState()?.currentScreen).toBe('hangar');
    store.dispatch({ type: 'session/navigate', target: 'operations' });
    expect(store.getState()?.currentScreen).toBe('operations');
  });

  it('leaves every other shared value unchanged by navigation (Base AC-004)', () => {
    const store = initializedStore();
    const before = store.getState();
    if (before === null) {
      throw new Error('Expected an initialized session.');
    }
    store.dispatch({ type: 'session/navigate', target: 'hangar' });
    const after = store.getState();
    if (after === null) {
      throw new Error('Expected an initialized session.');
    }
    expect(after.currentScreen).toBe('hangar');
    expect(after.credits).toBe(before.credits);
    expect(after.aircraftId).toBe(before.aircraftId);
    expect(after.hullIntegrity).toBe(before.hullIntegrity);
    expect(after.equippedWeapon).toBe(before.equippedWeapon);
    expect(after.mouseMovementEnabled).toBe(before.mouseMovementEnabled);
    expect(after.pilot).toBe(before.pilot);
  });

  it('treats selecting the current Screen as a no-op with the same state object (Base AC-003)', () => {
    const store = initializedStore();
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: 'session/navigate', target: 'operations' });
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('updates the shared Mouse Movement Enabled value immediately (Base AC-044, AC-039)', () => {
    const store = initializedStore();
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: false,
    });
    expect(store.getState()?.mouseMovementEnabled).toBe(false);
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: true,
    });
    expect(store.getState()?.mouseMovementEnabled).toBe(true);
  });

  it('treats an unchanged setting as a no-op with the same state object', () => {
    const store = initializedStore();
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: true,
    });
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores navigation and settings actions before initialization', () => {
    const store = createSessionStore();
    store.dispatch({ type: 'session/navigate', target: 'hangar' });
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: false,
    });
    expect(store.getState()).toBeNull();
  });

  it('throws on an unhandled action variant (exhaustiveness)', () => {
    const session = initializeSession(3735928559, CONTENT_CATALOGUE);
    expect(() =>
      sessionReducer(session, {
        type: 'session/unknown',
      } as unknown as Parameters<typeof sessionReducer>[1]),
    ).toThrow('Unhandled session action');
  });

  it('applies Repair atomically: one Credit spent and Hull restored to 100 (Base AC-028)', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: {
        ...initializeSession(3735928559, CONTENT_CATALOGUE),
        hullIntegrity: 40,
      },
    });
    store.dispatch({ type: 'session/repair' });
    expect(store.getState()?.credits).toBe(11);
    expect(store.getState()?.hullIntegrity).toBe(100);
  });

  it('hides Repair spending at full Hull Integrity (Base AC-025)', () => {
    const store = initializedStore();
    const before = store.getState();
    store.dispatch({ type: 'session/repair' });
    expect(store.getState()).toBe(before);
    expect(store.getState()?.credits).toBe(12);
  });

  it('never spends a Credit without enough Credits (Base AC-027, AC-030)', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: {
        ...initializeSession(3735928559, CONTENT_CATALOGUE),
        credits: 0,
        hullIntegrity: 40,
      },
    });
    store.dispatch({ type: 'session/repair' });
    expect(store.getState()?.credits).toBe(0);
    expect(store.getState()?.hullIntegrity).toBe(40);
  });

  it('treats repeated Repair input as a no-op after the first application (Base AC-029)', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: {
        ...initializeSession(3735928559, CONTENT_CATALOGUE),
        hullIntegrity: 40,
      },
    });
    store.dispatch({ type: 'session/repair' });
    const afterFirst = store.getState();
    store.dispatch({ type: 'session/repair' });
    expect(store.getState()).toBe(afterFirst);
    expect(store.getState()?.credits).toBe(11);
  });

  it('equips a selected weapon only through Confirm (Base AC-022, §7.6)', () => {
    const store = initializedStore();
    store.dispatch({ type: 'session/equip-weapon', weapon: 'cannon' });
    expect(store.getState()?.equippedWeapon).toBe('cannon');
    // The equipped weapon is retained by a later navigation.
    store.dispatch({ type: 'session/navigate', target: 'hangar' });
    expect(store.getState()?.equippedWeapon).toBe('cannon');
  });

  it('treats confirming the already equipped weapon as a no-op', () => {
    const store = initializedStore();
    const before = store.getState();
    store.dispatch({ type: 'session/equip-weapon', weapon: 'machine-gun' });
    expect(store.getState()).toBe(before);
  });

  it('records one accepted mission start and increments the instance ordinal (S07, Base §9.4)', () => {
    const store = initializedStore();
    const snapshot = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot });
    expect(store.getState()?.activeMission).toBe(snapshot);
    expect(store.getState()?.missionInstanceCount).toBe(1);
    expect(store.getState()?.missionStartFailed).toBe(false);
  });

  it('ignores a second mission start while a mission is active (Base AC-035)', () => {
    const store = initializedStore();
    const first = snapshotFor(store);
    const second = { ...first, combatMissionSeed: 999 };
    store.dispatch({ type: 'mission/start', snapshot: first });
    const before = store.getState();
    store.dispatch({ type: 'mission/start', snapshot: second });
    expect(store.getState()).toBe(before);
    expect(store.getState()?.missionInstanceCount).toBe(1);
  });

  it('clears the active mission and signals the failure on Combat initialization failure (Base AC-014)', () => {
    const store = initializedStore();
    const snapshot = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot });
    store.dispatch({
      type: 'mission/start-failed',
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    expect(store.getState()?.activeMission).toBe('none');
    expect(store.getState()?.missionStartFailed).toBe(true);
    expect(store.getState()?.missionStartFailedMissionId).toBe(
      'interception-01',
    );
    // Base state (Credits, Hull, weapon, Pilot, Settings) is unchanged.
    expect(store.getState()?.credits).toBe(12);
    expect(store.getState()?.hullIntegrity).toBe(100);
  });

  it('ignores a start-failure whose originating snapshot identity does not exactly match the Active Mission (V02-DEC-031)', () => {
    const store = initializedStore();
    const snapshot = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot });
    // The stale failure belongs to an older ordinal/attempt of the same
    // mission: it must never clear the current Active Mission or signal a
    // failure for it.
    store.dispatch({
      type: 'mission/start-failed',
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId + 1,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal + 1,
    });
    expect(store.getState()?.activeMission).not.toBe('none');
    expect(store.getState()?.missionStartFailed).toBe(false);
    store.dispatch({
      type: 'mission/start-failed',
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    expect(store.getState()?.activeMission).toBe('none');
    expect(store.getState()?.missionStartFailed).toBe(true);
  });

  it('clears the failure signal once Base has reopened Mission Details', () => {
    const store = initializedStore();
    const snapshot = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot });
    store.dispatch({
      type: 'mission/start-failed',
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    store.dispatch({ type: 'mission/start-failure-consumed' });
    expect(store.getState()?.missionStartFailed).toBe(false);
    expect(store.getState()?.missionStartFailedMissionId).toBeNull();
    expect(store.getState()?.activeMission).toBe('none');
  });

  it('mission start enters the running Combat lifecycle (S13)', () => {
    const store = initializedStore();
    expect(store.getState()?.combatLifecycle).toEqual({
      running: false,
      overlay: 'none',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: false,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) });
    expect(store.getState()?.combatLifecycle).toEqual({
      running: true,
      overlay: 'none',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: false,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
  });

  it('lifecycle commands are inert without an Active Mission and after resolution (S13)', () => {
    const store = initializedStore();
    store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');

    store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) });
    store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('pause');

    // Mission resolution resets the lifecycle to idle and rejects later
    // lifecycle commands (the Result Overlay is the only continuation point).
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: 4,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    expect(store.getState()?.combatLifecycle).toEqual({
      running: false,
      overlay: 'none',
      debugRestoreOrigin: 'none',
      browserSafetyLatched: false,
      terminalSavePending: false,
      evacuationConfirmationOrigin: 'none',
      evacuationCommitted: false,
    });
    store.dispatch({
      type: 'combat-lifecycle/browser-safety-event',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');
  });

  it('Mission Result stays higher priority and immutable under every S13 command', () => {
    const store = initializedStore();
    store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) });
    store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: 0,
    });
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: 4,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    const committed = store.getState();
    if (committed === null || committed.missionResult === null) {
      throw new Error('Expected a committed Defeat result.');
    }
    for (const action of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/resume',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
      'combat-lifecycle/browser-safety-event',
    ] as const) {
      store.dispatch({ type: action, missionInstanceOrdinal: 0 });
      expect(store.getState()).toBe(committed);
    }
  });

  it('a browser safety event during Settings latches manual Resume and close transitions to Pause (S13)', () => {
    const store = initializedStore();
    store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) });
    store.dispatch({
      type: 'combat-lifecycle/open-settings',
      missionInstanceOrdinal: 0,
    });
    store.dispatch({
      type: 'combat-lifecycle/browser-safety-event',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()?.combatLifecycle.browserSafetyLatched).toBe(true);
    store.dispatch({
      type: 'combat-lifecycle/close-settings',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('pause');
    expect(store.getState()?.combatLifecycle.running).toBe(false);
    store.dispatch({
      type: 'combat-lifecycle/resume',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(store.getState()?.combatLifecycle.running).toBe(true);
  });

  it('a stale lifecycle command from mission N is a strict no-op during and after mission N+1 (S13-WI01)', () => {
    const store = initializedStore();
    // Mission N (ordinal 0) starts and pauses.
    const first = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot: first });
    store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('pause');

    // Mission N resolves (Continue consumes the Result Overlay) and mission
    // N+1 (ordinal 1) starts running.
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: 13,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    const second = {
      ...snapshotFor(store),
      missionInstanceOrdinal: 1,
      missionAttemptId: 1,
      combatMissionSeed: 999,
    };
    store.dispatch({ type: 'mission/start', snapshot: second });
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(store.getState()?.combatLifecycle.running).toBe(true);

    // A delayed Pause/Resume/Settings/Debug/browser event from mission N can
    // never pause, resume, overlay, or mutate mission N+1.
    const before = store.getState();
    for (const action of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/resume',
      'combat-lifecycle/open-settings',
      'combat-lifecycle/open-debug',
      'combat-lifecycle/browser-safety-event',
    ] as const) {
      store.dispatch({ type: action, missionInstanceOrdinal: 0 });
      expect(store.getState()).toBe(before);
    }
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(store.getState()?.combatLifecycle.running).toBe(true);
    expect(store.getState()?.credits).toBe(13); // mission N reward applied once
  });
});

describe('V02-WI-05 E01: Evacuation Confirmation through the Session Store', () => {
  function startedStore(): ReturnType<typeof createSessionStore> {
    const store = initializedStore();
    store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) });
    return store;
  }

  it('open/cancel/confirm flow through the one Session Store for the active Mission Instance', () => {
    const store = startedStore();
    store.dispatch({
      type: 'combat-lifecycle/open-evacuation-confirmation',
      missionInstanceOrdinal: 0,
    });
    let lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('evacuation-confirmation');
    expect(lifecycle.running).toBe(false);
    expect(lifecycle.evacuationConfirmationOrigin).toBe('running');
    expect(lifecycle.evacuationCommitted).toBe(false);

    store.dispatch({
      type: 'combat-lifecycle/confirm-evacuation',
      missionInstanceOrdinal: 0,
    });
    lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('none');
    expect(lifecycle.running).toBe(true);
    expect(lifecycle.evacuationConfirmationOrigin).toBe('none');
    expect(lifecycle.evacuationCommitted).toBe(true);

    // After confirmation the same store rejects a re-offer from running and
    // from an ordinary Pause opened on the same Mission Instance.
    store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: 0,
    });
    const paused = store.getState()!.combatLifecycle;
    expect(paused.overlay).toBe('pause');
    store.dispatch({
      type: 'combat-lifecycle/open-evacuation-confirmation',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()!.combatLifecycle.overlay).toBe('pause');
    expect(store.getState()!.combatLifecycle.evacuationCommitted).toBe(true);
  });

  it('a stale Evacuation Confirmation command from mission N is a strict no-op during mission N+1', () => {
    const store = initializedStore();
    store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) }); // N = 0
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: 13,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    const next = {
      ...snapshotFor(store),
      missionInstanceOrdinal: 1,
      missionAttemptId: 1,
      combatMissionSeed: 999,
    };
    store.dispatch({ type: 'mission/start', snapshot: next });
    const before = store.getState()!;
    for (const type of [
      'combat-lifecycle/open-evacuation-confirmation',
      'combat-lifecycle/cancel-evacuation-confirmation',
      'combat-lifecycle/confirm-evacuation',
    ] as const) {
      store.dispatch({ type, missionInstanceOrdinal: 0 });
      expect(store.getState()).toBe(before);
    }
    // The newer Mission Instance is untouched and running.
    expect(before.activeMission).not.toBe('none');
    if (before.activeMission !== 'none') {
      expect(before.activeMission.missionInstanceOrdinal).toBe(1);
    }
    expect(before.combatLifecycle.overlay).toBe('none');
    expect(before.combatLifecycle.evacuationCommitted).toBe(false);
  });

  it('open is a no-op while a terminal write is pending or after a committed Mission Result is pending', () => {
    const store = startedStore();
    store.dispatch({
      type: 'combat-terminal/pending',
      missionInstanceOrdinal: 0,
    });
    store.dispatch({
      type: 'combat-lifecycle/open-evacuation-confirmation',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()!.combatLifecycle.overlay).toBe('none');
    expect(store.getState()!.combatLifecycle.evacuationCommitted).toBe(false);
    // A committed result pending keeps every lifecycle command a strict no-op.
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: 13,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    const committed = store.getState()!;
    store.dispatch({
      type: 'combat-lifecycle/open-evacuation-confirmation',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()).toBe(committed);
  });

  it('open is a no-op under the blocking Mission Start Recovery Error Overlay', () => {
    const store = startedStore();
    store.dispatch({
      type: 'combat-start/recovery-error',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()!.combatLifecycle.overlay).toBe(
      'mission-start-recovery-error',
    );
    const before = store.getState()!;
    store.dispatch({
      type: 'combat-lifecycle/open-evacuation-confirmation',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()).toBe(before);
  });

  it('lifecycle reset: mission end and a new mission clear origin and commitment with the lifecycle', () => {
    const store = startedStore();
    store.dispatch({
      type: 'combat-lifecycle/open-evacuation-confirmation',
      missionInstanceOrdinal: 0,
    });
    store.dispatch({
      type: 'combat-lifecycle/confirm-evacuation',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()!.combatLifecycle.evacuationCommitted).toBe(true);
    // The mission resolves canonically; the lifecycle returns to IDLE.
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: 13,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    expect(store.getState()!.combatLifecycle.evacuationCommitted).toBe(false);
    expect(store.getState()!.combatLifecycle.evacuationConfirmationOrigin).toBe(
      'none',
    );
    // A new Mission Instance re-enters a clean RUNNING lifecycle.
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    store.dispatch({
      type: 'mission/start',
      snapshot: {
        ...snapshotFor(store),
        missionInstanceOrdinal: 1,
        missionAttemptId: 1,
        combatMissionSeed: 999,
      },
    });
    expect(store.getState()!.combatLifecycle.overlay).toBe('none');
    expect(store.getState()!.combatLifecycle.running).toBe(true);
    expect(store.getState()!.combatLifecycle.evacuationCommitted).toBe(false);
    expect(store.getState()!.combatLifecycle.evacuationConfirmationOrigin).toBe(
      'none',
    );
  });
});

describe('V02-WI-07 D02-A: development-only Credits reconciliation', () => {
  it('mirrors the committed Credits for the exact originating identity', () => {
    const store = initializedStore();
    const snapshot = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot });
    expect(store.getState()?.credits).toBe(12);

    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    expect(store.getState()?.credits).toBe(7);
    // Nothing else changed: the marker/runStatus are not session-owned.
    expect(store.getState()?.runStatus).toBe('active');
    expect(store.getState()?.activeMission).not.toBe('none');
  });

  it('is a strict no-op without an Active Mission, for a stale instance, for another mission, and for an invalid value', () => {
    const store = initializedStore();
    const snapshot = snapshotFor(store);

    // No Active Mission.
    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    expect(store.getState()?.credits).toBe(12);

    store.dispatch({ type: 'mission/start', snapshot });
    // A different (stale or newer) Mission Instance ordinal.
    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal + 99,
    });
    expect(store.getState()?.credits).toBe(12);
    // Same ordinal, different durable attempt id (D02-A-C01 F1).
    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId + 1,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    expect(store.getState()?.credits).toBe(12);
    // Same ordinal and attempt, different mission.
    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: 'interception-02',
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    expect(store.getState()?.credits).toBe(12);
    // Out-of-domain values are rejected by the domain guard.
    for (const credits of [-1, 12.5, Number.NaN]) {
      store.dispatch({
        type: 'session/debug-set-credits',
        credits,
        missionId: snapshot.missionId,
        missionAttemptId: snapshot.missionAttemptId,
        missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
      });
    }
    expect(store.getState()?.credits).toBe(12);
  });

  it('treats an already-equal value as a no-op returning the same state object', () => {
    const store = initializedStore();
    const snapshot = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot });
    const before = store.getState();
    store.dispatch({
      type: 'session/debug-set-credits',
      credits: before!.credits,
      missionId: snapshot.missionId,
      missionAttemptId: snapshot.missionAttemptId,
      missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
    });
    expect(store.getState()).toBe(before);
  });

  it('never writes a late value into a resolved or newer Mission Instance', () => {
    const store = initializedStore();
    const first = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot: first });
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: first.missionInstanceOrdinal,
      }),
    });
    expect(store.getState()?.activeMission).toBe('none');

    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: first.missionId,
      missionAttemptId: first.missionAttemptId,
      missionInstanceOrdinal: first.missionInstanceOrdinal,
    });
    // The resolved instance's completion is inert; the committed session values
    // from the result are untouched.
    expect(store.getState()?.credits).toBe(20);
  });

  it('does not overwrite a newer run that reuses the local ordinal after a confirmed New Game (D02-A-C01 F1)', () => {
    const store = initializedStore();
    const first = snapshotFor(store);
    store.dispatch({ type: 'mission/start', snapshot: first });
    expect(store.getState()?.credits).toBe(12);

    // A confirmed New Game resets the session (and its local ordinal counter)
    // while the durable attempt allocator never reuses ids.
    store.dispatch({
      type: 'session/new-game',
      session: initializeSession(123456789, CONTENT_CATALOGUE),
    });
    const second = {
      ...snapshotFor(store),
      missionId: 'interception-02' as const,
      missionAttemptId: first.missionAttemptId + 1,
    };
    store.dispatch({ type: 'mission/start', snapshot: second });
    expect(store.getState()?.activeMission).toMatchObject({
      missionId: 'interception-02',
      missionInstanceOrdinal: first.missionInstanceOrdinal,
      missionAttemptId: second.missionAttemptId,
    });

    // The delayed completion of the OLD run carries the reused local ordinal
    // and the old mission/attempt identity: an ordinal-only match would corrupt
    // the newer run, so the full-identity guard must reject it.
    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: first.missionId,
      missionAttemptId: first.missionAttemptId,
      missionInstanceOrdinal: first.missionInstanceOrdinal,
    });
    expect(store.getState()?.credits).toBe(12);

    // The matching identity of the newer run still applies exactly.
    store.dispatch({
      type: 'session/debug-set-credits',
      credits: 7,
      missionId: second.missionId,
      missionAttemptId: second.missionAttemptId,
      missionInstanceOrdinal: second.missionInstanceOrdinal,
    });
    expect(store.getState()?.credits).toBe(7);
  });
});
