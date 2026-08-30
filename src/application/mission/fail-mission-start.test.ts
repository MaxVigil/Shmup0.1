import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE, INTERCEPTION_01 } from '@content/index';
import {
  V02_STARTING_CREDITS,
  V02_DEFEAT_REPAIR_COST_CREDITS,
  applyDefeatRecoveryOrGameOver,
  type CampaignStateV1,
} from '@domain/index';
import {
  createInitializedTestApplication,
  InMemoryCampaignStore,
  InMemoryUserSettingsStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import type {
  CampaignReadResult,
  CampaignStartOutcome,
  CampaignStorePort,
  CampaignUpdateOutcome,
} from '@application/persistence';
import { buildNewGameCampaign } from '../persistence';
import { createBootRunner } from '../session/boot';
import { initializeSession } from '../session';
import { createSessionStore } from '../session/store';
import { abortMission } from './abort-mission';
import { SEAM_MISSION_ID } from './compatibility-seam';
import { commitMissionResult } from './commit-mission-result';
import { failMissionStart } from './fail-mission-start';
import { startMission } from './start-mission';

/** Campaign store whose `update` rejects exactly like an unavailable
 *  IndexedDB/Dexie adapter (infrastructure failure, no outcome returned). */
class RejectingUpdateCampaignStore implements CampaignStorePort {
  constructor(private readonly delegate: InMemoryCampaignStore) {}

  async read(): Promise<CampaignReadResult> {
    return this.delegate.read();
  }

  async update(): Promise<CampaignUpdateOutcome> {
    throw new Error('Simulated persistence infrastructure failure');
  }

  async startMission(): Promise<CampaignStartOutcome> {
    throw new Error('Simulated persistence infrastructure failure');
  }

  async replace(): Promise<void> {
    throw new Error('Simulated persistence infrastructure failure');
  }
}

describe('failMissionStart (Base AC-014 correction, V02-AC-018/020)', () => {
  it('atomically clears the persisted marker and reconciles the session so a same-session retry succeeds', async () => {
    const app = createInitializedTestApplication();
    const started = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(started.kind).toBe('accepted');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });

    const outcome = await failMissionStart(
      {
        store: app.store,
        campaignStore: app.campaignStore,
      },
      0,
    );
    expect(outcome).toBe('cleared');
    // Durable marker cleared; in-memory session reconciled.
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(true);
    expect(app.store.getState()?.credits).toBe(V02_STARTING_CREDITS);

    // The failure does not strand the same-session retry: the retry is a NEW
    // attempt (ordinal 1) of the same mission id.
    const retry = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(retry.kind).toBe('accepted');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
  });

  it('never becomes a paid Defeat on reload after the failed start (no marker, no 8-Credit deduction)', async () => {
    const app = createInitializedTestApplication();
    const started = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(started.kind).toBe('accepted');
    await failMissionStart(
      {
        store: app.store,
        campaignStore: app.campaignStore,
      },
      0,
    );
    // The post-failure campaign is the recovery authority on the next startup.
    const recovered = app.campaignStore.current!;
    expect(recovered.missionInProgress).toBeNull();
    expect(recovered.credits).toBe(V02_STARTING_CREDITS);
    expect(recovered.runStatus).toBe('active');

    const store = createSessionStore();
    const campaignStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    const userSettingsStore = new InMemoryUserSettingsStore();
    campaignStore.seed(recovered);
    const outcome = await createBootRunner({
      store,
      sessionSeedSource: { getSessionSeed: () => 3735928559 },
      runtimeAssetPreload: {
        preload: async () => [],
        fallbackResult: () => [],
      },
      content: CONTENT_CATALOGUE,
      campaignStore,
      userSettingsStore,
    }).run();
    expect(outcome.kind).toBe('ready');
    // Exactly 12 Credits: the failed start never resolved as a paid Defeat.
    expect(store.getState()?.credits).toBe(V02_STARTING_CREDITS);
    expect(store.getState()?.activeMission).toBe('none');
  });

  it('is inert for a stale duplicate failure after the marker is cleared', async () => {
    const app = createInitializedTestApplication();
    await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    await failMissionStart(
      {
        store: app.store,
        campaignStore: app.campaignStore,
      },
      0,
    );
    // A second failure callback finds no active mission: strict no-op.
    expect(
      await failMissionStart(
        {
          store: app.store,
          campaignStore: app.campaignStore,
        },
        0,
      ),
    ).toBe('inert');
    expect(app.store.getState()?.missionResult).toBeNull();
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
  });

  it('is inert when no mission was started at all', async () => {
    const app = createInitializedTestApplication();
    expect(
      await failMissionStart(
        {
          store: app.store,
          campaignStore: app.campaignStore,
        },
        0,
      ),
    ).toBe('inert');
    expect(app.store.getState()?.missionStartFailed).toBe(false);
  });

  it('race regression: an older delayed failure completion never clears a newer attempt of the same mission', async () => {
    const app = createInitializedTestApplication();
    // Attempt 0 starts, then its initialization rejects and is rolled back.
    await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    await failMissionStart(
      {
        store: app.store,
        campaignStore: app.campaignStore,
      },
      0,
    );
    // A NEWER attempt of the SAME mission (same mission id, ordinal 1) starts
    // and persists its own marker before the old failure callback completes.
    const retry = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(retry.kind).toBe('accepted');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });

    // The DELAYED stale failure callback for attempt 0 arrives now. The atomic
    // transition rejects as `attempt-does-not-match`, so the newer marker and
    // session stay intact and no `mission/start-failed` reconciliation occurs.
    const stale = await failMissionStart(
      {
        store: app.store,
        campaignStore: app.campaignStore,
      },
      0,
    );
    expect(stale).toBe('inert');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(
      (
        app.store.getState()?.activeMission as {
          missionInstanceOrdinal: number;
        }
      ).missionInstanceOrdinal,
    ).toBe(1);
    expect(app.store.getState()?.missionStartFailed).toBe(false);
  });

  it('a rejected durable update is handled explicitly: no unhandled rejection, no dispatch, and the session stays aligned with the still-present marker', async () => {
    const app = createInitializedTestApplication();
    await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    const rejectingStore = new RejectingUpdateCampaignStore(app.campaignStore);

    // The command itself catches the rejection and returns `failed`.
    await expect(
      failMissionStart(
        {
          store: app.store,
          campaignStore: rejectingStore,
        },
        0,
      ),
    ).resolves.toBe('failed');

    // No false claim of durable cleanup: the in-memory mission is NOT cleared,
    // so the session mirrors the durable marker (no divergence) and the
    // approved Return to Base recovery remains the escape.
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });
  });

  it('an unreadable record is reported as failed without clearing the in-memory mission', async () => {
    const app = createInitializedTestApplication();
    await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    // Corrupt the stored record after the marker was written.
    app.campaignStore.seed({
      ...(app.campaignStore.current as CampaignStateV1),
      credits: -5,
    } as CampaignStateV1);

    const outcome = await failMissionStart(
      {
        store: app.store,
        campaignStore: app.campaignStore,
      },
      0,
    );
    expect(outcome).toBe('failed');
    // The unreadable marker state is not silently reconciled away.
    expect(app.store.getState()?.activeMission).not.toBe('none');
  });

  it('cross-instance regression: an older instance\u2019s delayed failure callback never clears a newer attempt started by another instance sharing the campaign (both sessions restart at ordinal 0)', async () => {
    // One shared campaign store, two independent application instances. Their
    // session-local ordinals both start at 0 — the identity collision that
    // made the session-local identity unsafe (V02-WI-02 correction C03).
    const campaignStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    await campaignStore.replace(buildNewGameCampaign(CONTENT_CATALOGUE, 111));
    const storeA = createSessionStore();
    storeA.dispatch({
      type: 'session/initialized',
      session: initializeSession(111, CONTENT_CATALOGUE),
    });
    const storeB = createSessionStore();
    storeB.dispatch({
      type: 'session/initialized',
      session: initializeSession(222, CONTENT_CATALOGUE),
    });

    // Instance A starts the mission: campaign attempt id 0.
    const startedA = await startMission(
      {
        store: storeA,
        campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(startedA.kind).toBe('accepted');
    if (startedA.kind !== 'accepted') {
      throw new Error('Expected instance A to start.');
    }
    expect(startedA.snapshot.missionAttemptId).toBe(0);

    // Instance B boots while A's marker is persisted: startup recovery resolves
    // A's marker exactly once as Defeat (V02-AC-018) and B's fresh session
    // also starts its ordinal counter at 0.
    const recovery = applyDefeatRecoveryOrGameOver(campaignStore.current!);
    if (recovery.kind !== 'recovered') {
      throw new Error('Expected the persisted marker to recover as Defeat.');
    }
    await campaignStore.replace(recovery.campaign);

    // Instance B starts the SAME mission: the campaign allocates the NEXT
    // attempt id (1), never reusing the session-restarted ordinal.
    const startedB = await startMission(
      {
        store: storeB,
        campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(startedB.kind).toBe('accepted');
    if (startedB.kind !== 'accepted') {
      throw new Error('Expected instance B to start.');
    }
    expect(startedB.snapshot.missionAttemptId).toBe(1);
    // Both sessions carry the identical session-local ordinal 0.
    expect(startedB.snapshot.missionInstanceOrdinal).toBe(
      startedA.snapshot.missionInstanceOrdinal,
    );

    // The DELAYED stale failure callback from instance A arrives now. Its
    // session-local ordinal matches B's restarted ordinal, but the durable
    // campaign attempt id 0 does not match B's marker (attempt id 1), so the
    // callback is inert and B's marker and session stay intact.
    const stale = await failMissionStart({ store: storeA, campaignStore }, 0);
    expect(stale).toBe('inert');
    expect(campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
    expect(storeA.getState()?.activeMission).not.toBe('none');
    expect(storeB.getState()?.activeMission).not.toBe('none');
    expect(
      (storeB.getState()?.activeMission as { missionAttemptId: number })
        .missionAttemptId,
    ).toBe(1);
  });

  it('cross-instance regression: stale terminal result and abort callbacks from an older instance stay inert while the current matching attempt still commits normally', async () => {
    const campaignStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    await campaignStore.replace(buildNewGameCampaign(CONTENT_CATALOGUE, 333));
    const storeA = createSessionStore();
    storeA.dispatch({
      type: 'session/initialized',
      session: initializeSession(333, CONTENT_CATALOGUE),
    });
    const storeB = createSessionStore();
    storeB.dispatch({
      type: 'session/initialized',
      session: initializeSession(444, CONTENT_CATALOGUE),
    });

    const startedA = await startMission(
      {
        store: storeA,
        campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(startedA.kind).toBe('accepted');
    if (startedA.kind !== 'accepted') {
      throw new Error('Expected instance A to start.');
    }
    expect(startedA.snapshot.missionAttemptId).toBe(0);

    // Instance B boots (resolves A's marker as Defeat) and starts the next
    // attempt (campaign attempt id 1).
    const recovery = applyDefeatRecoveryOrGameOver(campaignStore.current!);
    if (recovery.kind !== 'recovered') {
      throw new Error('Expected the persisted marker to recover as Defeat.');
    }
    await campaignStore.replace(recovery.campaign);
    const creditsAfterRecovery =
      V02_STARTING_CREDITS - V02_DEFEAT_REPAIR_COST_CREDITS;
    expect(campaignStore.current?.credits).toBe(creditsAfterRecovery);

    const startedB = await startMission(
      {
        store: storeB,
        campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(startedB.kind).toBe('accepted');
    if (startedB.kind !== 'accepted') {
      throw new Error('Expected instance B to start.');
    }
    expect(startedB.snapshot.missionAttemptId).toBe(1);

    // Stale SUCCESS from instance A (attempt id 0): the durable transition
    // rejects before any reward or Hull change.
    expect(
      await commitMissionResult(
        { store: storeA, campaignStore, content: CONTENT_CATALOGUE },
        { kind: 'success' },
        80,
        0,
        startedA.snapshot.missionInstanceOrdinal,
      ),
    ).toBe('inert');
    expect(campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
    expect(campaignStore.current?.credits).toBe(creditsAfterRecovery);

    // Stale Aborted from instance A (attempt id 0): inert, no Hull change.
    expect(
      await abortMission(
        { store: storeA, campaignStore },
        55,
        0,
        startedA.snapshot.missionInstanceOrdinal,
      ),
    ).toBe('inert');
    expect(campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
    expect(campaignStore.current?.hullIntegrity).toBe(100);

    // The CURRENT matching attempt (B, attempt id 1) still commits normally:
    // the Success reward applies exactly once and the marker clears.
    expect(
      await commitMissionResult(
        { store: storeB, campaignStore, content: CONTENT_CATALOGUE },
        { kind: 'success' },
        80,
        1,
        startedB.snapshot.missionInstanceOrdinal,
      ),
    ).toBe('committed');
    expect(campaignStore.current?.missionInProgress).toBeNull();
    expect(campaignStore.current?.credits).toBe(
      creditsAfterRecovery + INTERCEPTION_01.completionReward,
    );
    expect(campaignStore.current?.hullIntegrity).toBe(80);
    expect(storeB.getState()?.activeMission).toBe('none');
  });

  it('cross-run regression: confirmed New Game replaces the campaign without resetting the allocator, so attempt B never equals A and every stale callback for A stays inert while B commits normally', async () => {
    const campaignStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    await campaignStore.replace(buildNewGameCampaign(CONTENT_CATALOGUE, 555));
    const storeA = createSessionStore();
    storeA.dispatch({
      type: 'session/initialized',
      session: initializeSession(555, CONTENT_CATALOGUE),
    });

    // Old run: instance A starts attempt A (campaign attempt id 0).
    const startedA = await startMission(
      {
        store: storeA,
        campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(startedA.kind).toBe('accepted');
    if (startedA.kind !== 'accepted') {
      throw new Error('Expected instance A to start.');
    }
    expect(startedA.snapshot.missionAttemptId).toBe(0);

    // Confirmed New Game replaces the campaign record entirely (fresh run,
    // credits 12, no marker). The dedicated allocator is NOT reset.
    await campaignStore.replace(buildNewGameCampaign(CONTENT_CATALOGUE, 777));

    // Fresh application instance B (session ordinal restarts at 0) starts the
    // SAME mission.
    const storeB = createSessionStore();
    storeB.dispatch({
      type: 'session/initialized',
      session: initializeSession(777, CONTENT_CATALOGUE),
    });
    const startedB = await startMission(
      {
        store: storeB,
        campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(startedB.kind).toBe('accepted');
    if (startedB.kind !== 'accepted') {
      throw new Error('Expected instance B to start.');
    }
    // The allocator survived the replacement: B never equals A even though
    // both session-local ordinals restart at zero.
    expect(startedB.snapshot.missionAttemptId).toBe(1);
    expect(startedB.snapshot.missionAttemptId).not.toBe(
      startedA.snapshot.missionAttemptId,
    );
    expect(startedB.snapshot.missionInstanceOrdinal).toBe(
      startedA.snapshot.missionInstanceOrdinal,
    );

    // Every stale callback for A (failure, Success, Defeat, Aborted) is inert
    // against B's marker even though A's session ordinal collides with B's.
    expect(
      await failMissionStart(
        { store: storeA, campaignStore },
        startedA.snapshot.missionAttemptId,
      ),
    ).toBe('inert');
    expect(
      await commitMissionResult(
        { store: storeA, campaignStore, content: CONTENT_CATALOGUE },
        { kind: 'success' },
        80,
        startedA.snapshot.missionAttemptId,
        startedA.snapshot.missionInstanceOrdinal,
      ),
    ).toBe('inert');
    expect(
      await commitMissionResult(
        { store: storeA, campaignStore, content: CONTENT_CATALOGUE },
        { kind: 'defeat' },
        0,
        startedA.snapshot.missionAttemptId,
        startedA.snapshot.missionInstanceOrdinal,
      ),
    ).toBe('inert');
    expect(
      await abortMission(
        { store: storeA, campaignStore },
        55,
        startedA.snapshot.missionAttemptId,
        startedA.snapshot.missionInstanceOrdinal,
      ),
    ).toBe('inert');

    // B's marker/session/economy remain unchanged.
    expect(campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
    expect(campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
    expect(campaignStore.current?.hullIntegrity).toBe(100);
    expect(storeB.getState()?.activeMission).not.toBe('none');

    // B still commits normally (Success reward applied exactly once).
    expect(
      await commitMissionResult(
        { store: storeB, campaignStore, content: CONTENT_CATALOGUE },
        { kind: 'success' },
        80,
        startedB.snapshot.missionAttemptId,
        startedB.snapshot.missionInstanceOrdinal,
      ),
    ).toBe('committed');
    expect(campaignStore.current?.missionInProgress).toBeNull();
    expect(campaignStore.current?.credits).toBe(
      V02_STARTING_CREDITS + INTERCEPTION_01.completionReward,
    );
    expect(campaignStore.current?.hullIntegrity).toBe(80);
  });
});
