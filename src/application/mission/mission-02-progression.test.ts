import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE, INTERCEPTION_03 } from '@content/index';
import {
  COMBAT_MISSION_STREAM,
  deriveStreamSeed,
  V02_STARTING_CREDITS,
} from '@domain/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import type { InitializedTestApplication } from '@test-support/persistence';
import { missionPointViews } from './mission-progression';
import { commitMissionResult } from './commit-mission-result';
import type { SuccessEconomyRelay } from './commit-mission-result';
import { startMission } from './start-mission';
import type { MissionSnapshot } from './snapshot';

/**
 * V02-WI-05 M02-R01 Mission 02 economy/progression evidence (Epic §6.2, §12.2,
 * §13.2–13.3, V02-AC-002/013/020).
 *
 * Every assertion runs the REAL application commands against the in-memory
 * campaign transaction (the same `startMission` / `commitMissionResult`
 * commands the UI relays): accepted Mission 01 Success makes Interception 02
 * available, Mission 02 starts with its own immutable mission/attempt identity,
 * its committed Success applies `max(0, rewards − penalties) + 12` Credits,
 * marks Mission 02 completed, unlocks ONLY Interception 03 exactly once and
 * clears the durable marker. Duplicate, stale, racing, rejected, failed and
 * inert callbacks cannot duplicate Credits, completion, or unlock, and a replay
 * keeps the authored per-run payout without a second completion/unlock.
 */
const MISSION_01 = 'interception-01';
const MISSION_02 = 'interception-02';
const MISSION_03 = 'interception-03';

const MISSION_01_ECONOMY: SuccessEconomyRelay = {
  combatRewards: 4,
  escapePenalties: 1,
  destroyedCounts: {
    'basic-drone': 4,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  escapedCounts: {
    'basic-drone': 1,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
};

const MISSION_02_ECONOMY: SuccessEconomyRelay = {
  combatRewards: 9,
  escapePenalties: 2,
  destroyedCounts: {
    'basic-drone': 6,
    'ranged-drone': 2,
    'hunter-drone': 1,
    'elite-drone': 0,
  },
  escapedCounts: {
    'basic-drone': 1,
    'ranged-drone': 1,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
};

const MISSION_02_REPLAY_ECONOMY: SuccessEconomyRelay = {
  combatRewards: 6,
  escapePenalties: 0,
  destroyedCounts: {
    'basic-drone': 5,
    'ranged-drone': 1,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  escapedCounts: {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
};

function deps(app: InitializedTestApplication) {
  return {
    store: app.store,
    campaignStore: app.campaignStore,
    content: CONTENT_CATALOGUE,
  };
}

/** The Mission 01 Success that makes Interception 02 available (Epic §6.2). */
async function completeMission01(
  app: InitializedTestApplication,
): Promise<void> {
  const started = await startMission(deps(app), MISSION_01);
  if (started.kind !== 'accepted') {
    throw new Error('Mission 02 evidence: Mission 01 did not start.');
  }
  const committed = await commitMissionResult(
    deps(app),
    { kind: 'success' },
    80,
    started.snapshot.missionAttemptId,
    started.snapshot.missionInstanceOrdinal,
    MISSION_01_ECONOMY,
  );
  if (committed.outcome !== 'committed' || committed.result === null) {
    throw new Error('Mission 02 evidence: Mission 01 Success did not commit.');
  }
  app.store.dispatch({ type: 'mission/result', result: committed.result });
  app.store.dispatch({
    type: 'mission/result-consumed',
    missionInstanceOrdinal: committed.result.missionInstanceOrdinal,
  });
}

async function startMission02(
  app: InitializedTestApplication,
): Promise<MissionSnapshot> {
  const started = await startMission(deps(app), MISSION_02);
  if (started.kind !== 'accepted') {
    throw new Error('Mission 02 evidence: Mission 02 did not start.');
  }
  return started.snapshot;
}

async function commitMission02Success(
  app: InitializedTestApplication,
  snapshot: MissionSnapshot,
  economy: SuccessEconomyRelay,
  hullIntegrity: number,
) {
  return commitMissionResult(
    deps(app),
    { kind: 'success' },
    hullIntegrity,
    snapshot.missionAttemptId,
    snapshot.missionInstanceOrdinal,
    economy,
  );
}

describe('Mission 02 economy and progression through the real transaction (Epic §6.2, §12.2, V02-WI-05 M02-R01)', () => {
  it('accepted Mission 01 Success makes Interception 02 available and Mission 02 starts with its own immutable mission and attempt identity', async () => {
    const app = createInitializedTestApplication();
    // Before the Mission 01 Success the mission point is locked and cannot be
    // started by any direct command.
    expect(await startMission(deps(app), MISSION_02)).toEqual({
      kind: 'rejected',
      reason: 'mission-not-available',
    });
    const initial = app.store.getState();
    if (initial === null) {
      throw new Error('Mission 02 evidence: missing session.');
    }
    expect(
      missionPointViews(CONTENT_CATALOGUE.missions, {
        unlockedMissionIds: initial.unlockedMissionIds,
        completedMissionIds: initial.completedMissionIds,
      }).map((view) => [view.missionId, view.state, view.launchable]),
    ).toEqual([
      [MISSION_01, 'available', true],
      [MISSION_02, 'locked', false],
      [MISSION_03, 'locked', false],
    ]);

    await completeMission01(app);

    // Mission 01 Success unlocked exactly Interception 02; 03 stays locked.
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
    ]);
    expect(app.campaignStore.current?.credits).toBe(23);
    expect(app.campaignStore.current?.hullIntegrity).toBe(80);
    const afterMission01 = app.store.getState();
    if (afterMission01 === null) {
      throw new Error('Mission 02 evidence: missing session.');
    }
    expect(
      missionPointViews(CONTENT_CATALOGUE.missions, {
        unlockedMissionIds: afterMission01.unlockedMissionIds,
        completedMissionIds: afterMission01.completedMissionIds,
      }).map((view) => [view.missionId, view.state, view.launchable]),
    ).toEqual([
      [MISSION_01, 'completed', true],
      [MISSION_02, 'available', true],
      [MISSION_03, 'locked', false],
    ]);

    // Mission 02 starts through the same transaction with its own identity: a
    // new immutable attempt id, a new Mission Instance ordinal, its own derived
    // Combat seed, and the committed post-Mission-01 Hull/loadout.
    const snapshot = await startMission02(app);
    expect(snapshot).toMatchObject({
      missionId: MISSION_02,
      missionInstanceOrdinal: 1,
      missionAttemptId: 1,
      combatMissionSeed: deriveStreamSeed(3735928559, COMBAT_MISSION_STREAM, 1),
      aircraftId: 'german-fighter',
      hullIntegrity: 80,
      equippedWeapon: 'machine-gun',
    });
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: MISSION_02,
      attemptId: 1,
    });
    expect(app.store.getState()?.activeMission).toBe(snapshot);
    expect(app.store.getState()?.missionInstanceCount).toBe(2);
    // A second start while Mission 02 is active is rejected without a new
    // marker, snapshot, or ordinal.
    expect(await startMission(deps(app), MISSION_02)).toEqual({
      kind: 'rejected',
      reason: 'active-mission-exists',
    });
    expect(app.store.getState()?.missionInstanceCount).toBe(2);
    // The durable row is still a complete Mission 02 Success away from
    // completion or a Mission 03 unlock.
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
  });

  it('a committed Mission 02 Success applies max(0, rewards − penalties) + 12, completes Mission 02 and unlocks only Interception 03 exactly once', async () => {
    const app = createInitializedTestApplication();
    await completeMission01(app);
    const snapshot = await startMission02(app);
    const creditsBefore = app.store.getState()!.credits;
    expect(creditsBefore).toBe(23);

    const outcome = await commitMission02Success(
      app,
      snapshot,
      MISSION_02_ECONOMY,
      55,
    );
    expect(outcome.outcome).toBe('committed');
    if (outcome.result?.kind !== 'success') {
      throw new Error('Mission 02 evidence: expected a Success result.');
    }
    // netCombat = max(0, 9 − 2) = 7; payout = 7 + 12 = 19.
    expect(outcome.result).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 1,
      creditsAfter: 42,
      hullIntegrityAfter: 55,
      creditsEarned: 19,
      combatRewards: 9,
      escapePenalties: 2,
      netCombatReward: 7,
      completionReward: 12,
      newlyUnlockedMissionId: MISSION_03,
      unlockedMissionIdsAfter: [MISSION_01, MISSION_02, MISSION_03],
      completedMissionIdsAfter: [MISSION_01, MISSION_02],
    });
    expect(outcome.result.destroyedCounts).toEqual(
      MISSION_02_ECONOMY.destroyedCounts,
    );
    expect(outcome.result.escapedCounts).toEqual(
      MISSION_02_ECONOMY.escapedCounts,
    );

    // Durable truth: one coherent transaction cleared the marker, applied the
    // payout, completed Mission 02 and unlocked only Mission 03 exactly once.
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.campaignStore.current?.credits).toBe(42);
    expect(app.campaignStore.current?.hullIntegrity).toBe(55);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(
      app.campaignStore.current?.unlockedMissionIds.filter(
        (id) => id === MISSION_03,
      ),
    ).toEqual([MISSION_03]);

    // The session mirrors the pre-committed durable values exactly once.
    app.store.dispatch({ type: 'mission/result', result: outcome.result });
    const session = app.store.getState();
    expect(session?.credits).toBe(42);
    expect(session?.hullIntegrity).toBe(55);
    expect(session?.activeMission).toBe('none');
    expect(session?.completedMissionIds).toEqual([MISSION_01, MISSION_02]);
    expect(session?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(
      missionPointViews(CONTENT_CATALOGUE.missions, {
        unlockedMissionIds: session!.unlockedMissionIds,
        completedMissionIds: session!.completedMissionIds,
      }).map((view) => [view.missionId, view.state, view.launchable]),
    ).toEqual([
      [MISSION_01, 'completed', true],
      [MISSION_02, 'completed', true],
      [MISSION_03, 'available', true],
    ]);

    app.store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: outcome.result.missionInstanceOrdinal,
    });
    expect(app.store.getState()?.missionResult).toBeNull();

    // V02-WI-06 E03: the unlocked Mission 03 is now fully authored and
    // startable — every encounter carries its exact Arrival Groups
    // (V02-DEC-032), so the same readiness gate that rejected a partially
    // authored mission lets it through to the real mission-start transaction.
    expect(
      INTERCEPTION_03.encounters.every(
        (encounter) => (encounter.staging?.length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(await startMission(deps(app), MISSION_03)).toMatchObject({
      kind: 'accepted',
      snapshot: { missionId: MISSION_03 },
    });
    expect(app.campaignStore.current?.missionInProgress?.missionId).toBe(
      MISSION_03,
    );
    expect(app.campaignStore.current?.credits).toBe(42);
  });

  it('duplicate, stale, rejected and failed Mission 02 callbacks cannot duplicate Credits, completion or unlock', async () => {
    const app = createInitializedTestApplication();
    await completeMission01(app);
    const snapshot = await startMission02(app);
    const committed = await commitMission02Success(
      app,
      snapshot,
      MISSION_02_ECONOMY,
      55,
    );
    expect(committed.outcome).toBe('committed');
    expect(app.campaignStore.current?.credits).toBe(42);

    // A duplicate identical Success callback (racing terminal relay) is inert
    // before any reward, completion, or unlock write.
    const duplicate = await commitMission02Success(
      app,
      snapshot,
      MISSION_02_ECONOMY,
      55,
    );
    expect(duplicate).toEqual({ outcome: 'inert', result: null });
    // A stale Mission 01 callback carrying its own (older) attempt identity can
    // never be charged against the Mission 02 transaction.
    const stale = await commitMissionResult(
      deps(app),
      { kind: 'success' },
      80,
      0,
      0,
      MISSION_01_ECONOMY,
    );
    expect(stale).toEqual({ outcome: 'inert', result: null });
    // A callback carrying a wrong attempt id for the same ordinal is inert too.
    const wrongAttempt = await commitMissionResult(
      deps(app),
      { kind: 'success' },
      55,
      snapshot.missionAttemptId + 7,
      snapshot.missionInstanceOrdinal,
      MISSION_02_ECONOMY,
    );
    expect(wrongAttempt).toEqual({ outcome: 'inert', result: null });
    expect(app.campaignStore.current?.credits).toBe(42);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
  });

  it('a failed transaction write on the Mission 02 replay reports failed with no economy or progress mutation', async () => {
    const app = createInitializedTestApplication();
    await completeMission01(app);
    const snapshot = await startMission02(app);
    const first = await commitMission02Success(
      app,
      snapshot,
      MISSION_02_ECONOMY,
      55,
    );
    if (first.result?.kind !== 'success') {
      throw new Error('Mission 02 evidence: expected the first Success.');
    }
    app.store.dispatch({ type: 'mission/result', result: first.result });
    app.store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: first.result.missionInstanceOrdinal,
    });
    expect(app.campaignStore.current?.credits).toBe(42);

    const replaySnapshot = await startMission02(app);
    const failing = {
      ...app.campaignStore,
      update: async () => ({ kind: 'missing' }) as const,
    } as unknown as Parameters<typeof commitMissionResult>[0]['campaignStore'];
    const failed = await commitMissionResult(
      {
        store: app.store,
        campaignStore: failing,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'success' },
      48,
      replaySnapshot.missionAttemptId,
      replaySnapshot.missionInstanceOrdinal,
      MISSION_02_REPLAY_ECONOMY,
    );
    expect(failed).toEqual({ outcome: 'failed', result: null });
    expect(app.campaignStore.current?.credits).toBe(42);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: MISSION_02,
      attemptId: replaySnapshot.missionAttemptId,
    });
    expect(app.store.getState()?.activeMission).toBe(replaySnapshot);
    expect(app.store.getState()?.missionResult).toBeNull();
  });

  it('a completed Mission 02 stays replayable and the replay earns its per-run payout without a second completion or unlock', async () => {
    const app = createInitializedTestApplication();
    await completeMission01(app);
    const firstSnapshot = await startMission02(app);
    const first = await commitMission02Success(
      app,
      firstSnapshot,
      MISSION_02_ECONOMY,
      55,
    );
    if (first.result?.kind !== 'success') {
      throw new Error('Mission 02 evidence: expected the first Success.');
    }
    app.store.dispatch({ type: 'mission/result', result: first.result });
    app.store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: first.result.missionInstanceOrdinal,
    });
    expect(app.campaignStore.current?.credits).toBe(42);

    // Replay starts again with a fresh immutable attempt identity.
    const replaySnapshot = await startMission02(app);
    expect(replaySnapshot).toMatchObject({
      missionId: MISSION_02,
      missionInstanceOrdinal: 2,
      missionAttemptId: 2,
      hullIntegrity: 55,
    });
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: MISSION_02,
      attemptId: 2,
    });

    const replay = await commitMission02Success(
      app,
      replaySnapshot,
      MISSION_02_REPLAY_ECONOMY,
      48,
    );
    if (replay.result?.kind !== 'success') {
      throw new Error('Mission 02 evidence: expected the replay Success.');
    }
    // The authored per-run payout applies again (netCombat 6 + completion 12),
    // but nothing is newly unlocked and no completion is duplicated.
    expect(replay.result).toMatchObject({
      creditsEarned: 18,
      netCombatReward: 6,
      completionReward: 12,
      newlyUnlockedMissionId: null,
      completedMissionIdsAfter: [MISSION_01, MISSION_02],
      unlockedMissionIdsAfter: [MISSION_01, MISSION_02, MISSION_03],
    });
    expect(app.campaignStore.current?.credits).toBe(60);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(app.campaignStore.current?.missionInProgress).toBeNull();

    // The persisted balance equals the campaign baseline plus exactly the three
    // authored payouts (no duplicated completion reward).
    expect(app.campaignStore.current?.credits).toBe(
      V02_STARTING_CREDITS +
        (MISSION_01_ECONOMY.combatRewards -
          MISSION_01_ECONOMY.escapePenalties) +
        8 +
        (MISSION_02_ECONOMY.combatRewards -
          MISSION_02_ECONOMY.escapePenalties) +
        12 +
        (MISSION_02_REPLAY_ECONOMY.combatRewards -
          MISSION_02_REPLAY_ECONOMY.escapePenalties) +
        12,
    );
  });
});
