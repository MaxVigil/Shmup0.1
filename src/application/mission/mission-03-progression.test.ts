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
import type { MissionResult } from './mission-result';
import { startMission } from './start-mission';
import type { MissionSnapshot } from './snapshot';

/**
 * V02-WI-06 E03 Mission 03 economy/progression evidence (Epic §6.2, §12.2,
 * §13.2–13.3, V02-AC-002/013/020).
 *
 * Every assertion runs the REAL application commands against the in-memory
 * campaign transaction. Mission 03 becomes available only after the accepted
 * Mission 02 Success, starts through the same mission-start transaction with its
 * own immutable identity, and its committed Success applies
 * `max(0, rewards − penalties) + 16`, marks Mission 03 completed, unlocks no
 * further content, clears the durable marker exactly once, and stays replayable
 * with a fresh identity and no duplicate completion. The committed canonical
 * maximum payout of `51` Credits is verified end to end without any
 * Mission-03-specific UI or persistence logic.
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

/** The canonical Mission 03 maximum: 35 combat rewards and the 16 completion. */
const MISSION_03_MAXIMUM_ECONOMY: SuccessEconomyRelay = {
  combatRewards: INTERCEPTION_03.maximumCombatReward,
  escapePenalties: 0,
  destroyedCounts: {
    'basic-drone': 13,
    'ranged-drone': 4,
    'hunter-drone': 3,
    'elite-drone': 1,
  },
  escapedCounts: {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
};

const MISSION_03_REPLAY_ECONOMY: SuccessEconomyRelay = {
  combatRewards: 12,
  escapePenalties: 2,
  destroyedCounts: {
    'basic-drone': 8,
    'ranged-drone': 2,
    'hunter-drone': 0,
    'elite-drone': 1,
  },
  escapedCounts: {
    'basic-drone': 4,
    'ranged-drone': 1,
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

/** One accepted Success through the real transaction plus session relay. */
async function commitSuccess(
  app: InitializedTestApplication,
  snapshot: MissionSnapshot,
  economy: SuccessEconomyRelay,
  hullIntegrity: number,
): Promise<MissionResult> {
  const committed = await commitMissionResult(
    deps(app),
    { kind: 'success' },
    hullIntegrity,
    snapshot.missionAttemptId,
    snapshot.missionInstanceOrdinal,
    economy,
  );
  if (committed.outcome !== 'committed' || committed.result === null) {
    throw new Error('Mission 03 evidence: the Success did not commit.');
  }
  app.store.dispatch({ type: 'mission/result', result: committed.result });
  app.store.dispatch({
    type: 'mission/result-consumed',
    missionInstanceOrdinal: committed.result.missionInstanceOrdinal,
  });
  return committed.result;
}

async function startAccepted(
  app: InitializedTestApplication,
  missionId: typeof MISSION_01 | typeof MISSION_02 | typeof MISSION_03,
): Promise<MissionSnapshot> {
  const started = await startMission(deps(app), missionId);
  if (started.kind !== 'accepted') {
    throw new Error(`Mission 03 evidence: ${missionId} did not start.`);
  }
  return started.snapshot;
}

/** Drives the accepted Mission 01 and Mission 02 Successes, which unlock 03. */
async function completeMissions01And02(
  app: InitializedTestApplication,
): Promise<void> {
  await commitSuccess(
    app,
    await startAccepted(app, MISSION_01),
    MISSION_01_ECONOMY,
    80,
  );
  await commitSuccess(
    app,
    await startAccepted(app, MISSION_02),
    MISSION_02_ECONOMY,
    55,
  );
}

describe('Mission 03 economy and progression through the real transaction (Epic §6.2, §12.2, §13.3, V02-WI-06 E03)', () => {
  it('Interception 03 is locked until the accepted Mission 02 Success and then starts through the same transaction with its own identity', async () => {
    const app = createInitializedTestApplication();
    // A New Game cannot start Mission 03: only Interception 01 is unlocked.
    expect(app.store.getState()?.unlockedMissionIds).toEqual([MISSION_01]);
    expect(await startMission(deps(app), MISSION_03)).toEqual({
      kind: 'rejected',
      reason: 'mission-not-available',
    });

    await completeMissions01And02(app);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
    expect(app.campaignStore.current?.credits).toBe(42);
    expect(app.campaignStore.current?.hullIntegrity).toBe(55);
    const session = app.store.getState();
    if (session === null) {
      throw new Error('Mission 03 evidence: missing session.');
    }
    expect(
      missionPointViews(CONTENT_CATALOGUE.missions, {
        unlockedMissionIds: session.unlockedMissionIds,
        completedMissionIds: session.completedMissionIds,
      }).map((view) => [view.missionId, view.state, view.launchable]),
    ).toEqual([
      [MISSION_01, 'completed', true],
      [MISSION_02, 'completed', true],
      [MISSION_03, 'available', true],
    ]);

    // Mission 03 starts through the same mission-start transaction: its own
    // immutable attempt identity, Mission Instance ordinal, derived Combat seed,
    // and the committed post-Mission-02 Hull.
    const snapshot = await startAccepted(app, MISSION_03);
    expect(snapshot).toMatchObject({
      missionId: MISSION_03,
      missionInstanceOrdinal: 2,
      missionAttemptId: 2,
      combatMissionSeed: deriveStreamSeed(3735928559, COMBAT_MISSION_STREAM, 2),
      aircraftId: 'german-fighter',
      hullIntegrity: 55,
      equippedWeapon: 'machine-gun',
    });
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: MISSION_03,
      attemptId: 2,
    });
    expect(app.campaignStore.current?.credits).toBe(42);
    // A second start while Mission 03 is active is rejected.
    expect(await startMission(deps(app), MISSION_03)).toEqual({
      kind: 'rejected',
      reason: 'active-mission-exists',
    });
  });

  it('a committed Mission 03 Success applies the canonical maximum 35 + 16 = 51, completes Mission 03, unlocks nothing, and clears the marker exactly once', async () => {
    const app = createInitializedTestApplication();
    await completeMissions01And02(app);
    const snapshot = await startAccepted(app, MISSION_03);
    const creditsBefore = app.store.getState()!.credits;
    expect(creditsBefore).toBe(42);
    expect(INTERCEPTION_03.maximumCombatReward).toBe(35);
    expect(INTERCEPTION_03.maximumSuccessPayout).toBe(51);

    const result = await commitSuccess(
      app,
      snapshot,
      MISSION_03_MAXIMUM_ECONOMY,
      55,
    );
    expect(result).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 2,
      creditsAfter: creditsBefore + INTERCEPTION_03.maximumSuccessPayout,
      hullIntegrityAfter: 55,
      creditsEarned: INTERCEPTION_03.maximumSuccessPayout,
      combatRewards: 35,
      escapePenalties: 0,
      netCombatReward: 35,
      completionReward: 16,
      newlyUnlockedMissionId: null,
      unlockedMissionIdsAfter: [MISSION_01, MISSION_02, MISSION_03],
      completedMissionIdsAfter: [MISSION_01, MISSION_02, MISSION_03],
    });
    if (result.kind !== 'success') {
      throw new Error('Mission 03 evidence: expected a Success result.');
    }
    // The result data truthfully carries the Elite destruction and reward.
    expect(result.destroyedCounts['elite-drone']).toBe(1);
    expect(result.destroyedCounts).toEqual(
      MISSION_03_MAXIMUM_ECONOMY.destroyedCounts,
    );
    expect(result.escapedCounts).toEqual(
      MISSION_03_MAXIMUM_ECONOMY.escapedCounts,
    );

    // One coherent durable transaction: marker cleared, payout applied,
    // Mission 03 completed, and no further unlock.
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.campaignStore.current?.credits).toBe(93);
    expect(app.campaignStore.current?.hullIntegrity).toBe(55);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);

    // Duplicate and stale callbacks cannot duplicate the payout, completion, or
    // any unlock; the durable row is unchanged afterwards.
    const committedRow = app.campaignStore.current;
    expect(
      await commitMissionResult(
        deps(app),
        { kind: 'success' },
        55,
        snapshot.missionAttemptId,
        snapshot.missionInstanceOrdinal,
        MISSION_03_MAXIMUM_ECONOMY,
      ),
    ).toEqual({ outcome: 'inert', result: null });
    expect(
      await commitMissionResult(
        deps(app),
        { kind: 'success' },
        55,
        snapshot.missionAttemptId + 1,
        snapshot.missionInstanceOrdinal,
        MISSION_03_MAXIMUM_ECONOMY,
      ),
    ).toEqual({ outcome: 'inert', result: null });
    expect(app.campaignStore.current).toEqual(committedRow);
  });

  it('a completed Mission 03 stays replayable with a fresh identity and earns its per-run payout without a second completion or unlock', async () => {
    const app = createInitializedTestApplication();
    await completeMissions01And02(app);
    const first = await startAccepted(app, MISSION_03);
    await commitSuccess(app, first, MISSION_03_MAXIMUM_ECONOMY, 55);
    const creditsAfterFirst = app.campaignStore.current?.credits;
    expect(creditsAfterFirst).toBe(93);

    const replay = await startAccepted(app, MISSION_03);
    expect(replay).toMatchObject({
      missionId: MISSION_03,
      missionInstanceOrdinal: 3,
      missionAttemptId: 3,
      combatMissionSeed: deriveStreamSeed(3735928559, COMBAT_MISSION_STREAM, 3),
      hullIntegrity: 55,
    });
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: MISSION_03,
      attemptId: 3,
    });
    // The replay keeps the same authored timeline, rewards, and result rules.
    const replayEconomy = MISSION_03_REPLAY_ECONOMY;
    const replayResult = await commitSuccess(app, replay, replayEconomy, 55);
    const expectedPayout =
      Math.max(0, replayEconomy.combatRewards - replayEconomy.escapePenalties) +
      INTERCEPTION_03.completionReward;
    expect(replayResult).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 3,
      creditsEarned: expectedPayout,
      completionReward: INTERCEPTION_03.completionReward,
      newlyUnlockedMissionId: null,
      completedMissionIdsAfter: [MISSION_01, MISSION_02, MISSION_03],
      unlockedMissionIdsAfter: [MISSION_01, MISSION_02, MISSION_03],
    });
    expect(app.campaignStore.current?.credits).toBe(
      (creditsAfterFirst ?? 0) + expectedPayout,
    );
    // No duplicate completion entry was appended by the replay.
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
  });

  it('an Evacuated Mission 03 keeps the mission incomplete, unlocks nothing, and commits only the 50% payout exactly once', async () => {
    const app = createInitializedTestApplication();
    await completeMissions01And02(app);
    const snapshot = await startAccepted(app, MISSION_03);
    const creditsBefore = app.store.getState()!.credits;
    const outcome = await commitMissionResult(
      deps(app),
      { kind: 'evacuated' },
      40,
      snapshot.missionAttemptId,
      snapshot.missionInstanceOrdinal,
      MISSION_03_REPLAY_ECONOMY,
    );
    expect(outcome.outcome).toBe('committed');
    if (outcome.result?.kind !== 'evacuated') {
      throw new Error('Mission 03 evidence: expected an Evacuated result.');
    }
    // floor(max(0, 12 − 2) × 0.5) = 5; no completion reward.
    const expectedPayout = Math.floor(
      Math.max(
        0,
        MISSION_03_REPLAY_ECONOMY.combatRewards -
          MISSION_03_REPLAY_ECONOMY.escapePenalties,
      ) * 0.5,
    );
    expect(expectedPayout).toBe(5);
    expect(outcome.result.creditsEarned).toBe(expectedPayout);
    expect(outcome.result.hullIntegrityAfter).toBe(40);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      MISSION_01,
      MISSION_02,
      MISSION_03,
    ]);
    expect(app.campaignStore.current?.credits).toBe(
      creditsBefore + expectedPayout,
    );
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    // A repeated Evacuated callback is inert.
    expect(
      await commitMissionResult(
        deps(app),
        { kind: 'evacuated' },
        40,
        snapshot.missionAttemptId,
        snapshot.missionInstanceOrdinal,
        MISSION_03_REPLAY_ECONOMY,
      ),
    ).toEqual({ outcome: 'inert', result: null });
  });

  it('a New Game still starts with only Interception 01 unlocked and the canonical 12 Credits', () => {
    const app = createInitializedTestApplication();
    const session = app.store.getState();
    expect(session?.credits).toBe(V02_STARTING_CREDITS);
    expect(session?.unlockedMissionIds).toEqual([MISSION_01]);
    expect(session?.completedMissionIds).toEqual([]);
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
  });
});
