import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { V02_STARTING_CREDITS } from '@domain/index';
import { initializeSession } from '../session/initialize-session';
import { createSessionStore } from '../session/store';
import type { SessionStore } from '../session/store';
import { successMissionResult } from '@test-support/session';
import type { MissionSnapshot } from './snapshot';

function snapshotFor(store: SessionStore): MissionSnapshot {
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  return {
    missionId: 'interception-01',
    missionInstanceOrdinal: session.missionInstanceCount,
    missionAttemptId: session.missionInstanceCount,
    combatMissionSeed: 1234,
    aircraftId: session.aircraftId,
    hullIntegrity: session.hullIntegrity,
    equippedWeapon: session.equippedWeapon,
    pilot: session.pilot,
    mouseMovementEnabled: session.mouseMovementEnabled,
  };
}

function initializedStore(): SessionStore {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(3735928559, CONTENT_CATALOGUE),
  });
  return store;
}

function startMissionIn(store: SessionStore): void {
  store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) });
}

describe('mission/result commitment (Base §9.5, AC-032/033/034; Epic §13, V02-AC-020)', () => {
  it('commits Success exactly once with the pre-committed campaign values', () => {
    const store = initializedStore();
    startMissionIn(store);
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    const session = store.getState()!;
    expect(session.credits).toBe(V02_STARTING_CREDITS + 1);
    expect(session.hullIntegrity).toBe(80);
    expect(session.activeMission).toBe('none');
    expect(session.missionResult).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 0,
    });
    expect(session.equippedWeapon).toBe('machine-gun');
    expect(session.pilot).not.toBeNull();
    // Duplicate terminal signals never reapply the reward.
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    expect(store.getState()!.credits).toBe(V02_STARTING_CREDITS + 1);
  });

  it('commits Defeat exactly once with the pre-committed campaign values', () => {
    const store = initializedStore();
    startMissionIn(store);
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS - 8,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    const session = store.getState()!;
    expect(session.credits).toBe(V02_STARTING_CREDITS - 8);
    expect(session.hullIntegrity).toBe(100);
    expect(session.runStatus).toBe('active');
    expect(session.activeMission).toBe('none');
    expect(session.missionResult).toMatchObject({
      kind: 'defeat',
      missionInstanceOrdinal: 0,
    });
    // Duplicate terminal signals are strict no-ops.
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS - 8,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    expect(store.getState()!.hullIntegrity).toBe(100);
  });

  it('routes an unaffordable Defeat to the Game Over run status without a mission result (V02-AC-016/017)', () => {
    const store = initializedStore();
    startMissionIn(store);
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS,
        hullIntegrityAfter: 100,
        runStatusAfter: 'game-over',
        repairCostCredits: 0,
      },
    });
    const session = store.getState()!;
    expect(session.runStatus).toBe('game-over');
    expect(session.activeMission).toBe('none');
    expect(session.missionResult).toBeNull();
    // Duplicate Game Over signals stay inert (no duplicate marker clear).
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS,
        hullIntegrityAfter: 100,
        runStatusAfter: 'game-over',
        repairCostCredits: 0,
      },
    });
    expect(store.getState()!.runStatus).toBe('game-over');
  });

  it('commits an Evacuated result once with the retained Hull, floored payout, and unchanged progression (V02-AC-015)', () => {
    const store = initializedStore();
    startMissionIn(store);
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'evacuated',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 2,
        hullIntegrityAfter: 70,
        creditsEarned: 2,
        combatRewards: 5,
        escapePenalties: 1,
        netCombatReward: 4,
        destroyedCounts: {
          'basic-drone': 3,
          'ranged-drone': 0,
          'hunter-drone': 0,
          'elite-drone': 0,
        },
        escapedCounts: {
          'basic-drone': 0,
          'ranged-drone': 0,
          'hunter-drone': 0,
          'elite-drone': 0,
        },
        unlockedMissionIdsAfter: ['interception-01'],
        completedMissionIdsAfter: [],
      },
    });
    const session = store.getState()!;
    expect(session.credits).toBe(V02_STARTING_CREDITS + 2);
    expect(session.hullIntegrity).toBe(70);
    expect(session.activeMission).toBe('none');
    expect(session.missionResult).toMatchObject({
      kind: 'evacuated',
      missionInstanceOrdinal: 0,
      creditsEarned: 2,
      netCombatReward: 4,
    });
    // Evacuation never completes or unlocks a mission.
    expect(session.unlockedMissionIds).toEqual(['interception-01']);
    expect(session.completedMissionIds).toEqual([]);
    // Duplicate terminal signals are strict no-ops.
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'evacuated',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 2,
        hullIntegrityAfter: 70,
        creditsEarned: 2,
        combatRewards: 5,
        escapePenalties: 1,
        netCombatReward: 4,
        destroyedCounts: {
          'basic-drone': 3,
          'ranged-drone': 0,
          'hunter-drone': 0,
          'elite-drone': 0,
        },
        escapedCounts: {
          'basic-drone': 0,
          'ranged-drone': 0,
          'hunter-drone': 0,
          'elite-drone': 0,
        },
        unlockedMissionIdsAfter: ['interception-01'],
        completedMissionIdsAfter: [],
      },
    });
    expect(store.getState()!.credits).toBe(V02_STARTING_CREDITS + 2);
  });

  it('ignores a result with invalid carried values (defensive boundary)', () => {
    const store = initializedStore();
    startMissionIn(store);
    const before = store.getState()!;
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: -1,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    expect(store.getState()).toBe(before);
  });

  it('ignores mission/result when no active mission remains (duplicate resistance)', () => {
    const store = initializedStore();
    const before = store.getState()!;
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 80,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    expect(store.getState()).toBe(before);
  });

  it('commits Aborted: no reward/recovery, retained Hull, no Overlay', () => {
    const store = initializedStore();
    startMissionIn(store);
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'aborted',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS,
        hullIntegrityAfter: 60,
      },
    });
    const session = store.getState()!;
    expect(session.credits).toBe(V02_STARTING_CREDITS);
    expect(session.hullIntegrity).toBe(60);
    expect(session.activeMission).toBe('none');
    expect(session.missionResult).toBeNull();
    // Repeated Aborted signals are no-ops.
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'aborted',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS,
        hullIntegrityAfter: 60,
      },
    });
    expect(store.getState()!.hullIntegrity).toBe(60);
  });

  it('result-consumed clears the presented result and is idempotent', () => {
    const store = initializedStore();
    startMissionIn(store);
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS - 8,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    expect(store.getState()!.missionResult).toMatchObject({
      kind: 'defeat',
      missionInstanceOrdinal: 0,
    });
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()!.missionResult).toBeNull();
    const after = store.getState()!;
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()).toBe(after);
  });

  it('supports a repeat loop: a new mission starts with the retained shared state', () => {
    const store = initializedStore();
    // Mission 1 → Success with Combat Hull 75.
    startMissionIn(store);
    expect(store.getState()!.missionInstanceCount).toBe(1);
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 75,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    expect(store.getState()!.credits).toBe(V02_STARTING_CREDITS + 1);
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });

    // Mission 2 starts from the retained state: ordinal advances once, no
    // resurrection of the prior mission.
    startMissionIn(store);
    const session = store.getState()!;
    expect(session.activeMission).not.toBe('none');
    expect(session.missionInstanceCount).toBe(2);
    const active = session.activeMission;
    if (active === 'none') {
      throw new Error('Expected an active mission.');
    }
    expect(active.missionInstanceOrdinal).toBe(1);
    expect(active.hullIntegrity).toBe(75);
  });

  it('a delayed terminal from mission 0 cannot resolve mission 1', () => {
    const store = initializedStore();
    startMissionIn(store); // mission 0, count 1
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 75,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    startMissionIn(store); // mission 1, count 2

    const before = store.getState()!;
    // Duplicated / delayed terminal from mission 0 arrives during mission 1.
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 99,
        hullIntegrityAfter: 99,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    const after = store.getState()!;
    expect(after).toBe(before); // strict no-op: no reward, no result, mission 1 intact
    expect(after.credits).toBe(V02_STARTING_CREDITS + 1);
    expect(after.missionResult).toBeNull();
    if (after.activeMission === 'none') {
      throw new Error('Mission 1 must still be active.');
    }
    expect(after.activeMission.missionInstanceOrdinal).toBe(1);
    expect(after.activeMission.hullIntegrity).toBe(75);
  });

  it('a stale Aborted command cannot abort mission 1', () => {
    const store = initializedStore();
    startMissionIn(store); // mission 0
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 75,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    startMissionIn(store); // mission 1

    const before = store.getState()!;
    // A stale Return-to-Base callback still bound to mission 0.
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'aborted',
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 55,
      },
    });
    const after = store.getState()!;
    expect(after).toBe(before); // strict no-op: mission 1 not aborted
    if (after.activeMission === 'none') {
      throw new Error('Mission 1 must still be active.');
    }
    expect(after.activeMission.missionInstanceOrdinal).toBe(1);
    expect(after.hullIntegrity).toBe(75); // mission 1 snapshot Hull untouched
  });

  it('a stale Continue cannot clear mission 1 result presented later', () => {
    const store = initializedStore();
    startMissionIn(store); // mission 0
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 75,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    startMissionIn(store); // mission 1
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 1,
        creditsAfter: V02_STARTING_CREDITS + 2,
        hullIntegrityAfter: 60,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });

    // Mission 1's result is now presented (ordinal 1). A delayed Continue
    // command from mission 0 must remain a strict no-op.
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 0,
    });
    expect(store.getState()!.missionResult).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 1,
    });
    expect(store.getState()!.credits).toBe(V02_STARTING_CREDITS + 2);

    // The matching Continue clears the presented result.
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: 1,
    });
    expect(store.getState()!.missionResult).toBeNull();
  });

  it('Start Mission raw action is a strict no-op while a result is pending', () => {
    const store = initializedStore();
    startMissionIn(store); // mission 0
    store.dispatch({
      type: 'mission/result',
      result: successMissionResult({
        missionInstanceOrdinal: 0,
        creditsAfter: V02_STARTING_CREDITS + 1,
        hullIntegrityAfter: 75,
        unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
        completedMissionIdsAfter: ['interception-01'],
        creditsEarned: 8,
      }),
    });
    // Raw action is a strict no-op too: no active mission and no ordinal advance.
    const before = store.getState()!;
    store.dispatch({ type: 'mission/start', snapshot: snapshotFor(store) });
    const after = store.getState()!;
    expect(after).toBe(before);
    expect(after.activeMission).toBe('none');
    expect(after.missionInstanceCount).toBe(1);
  });
});
