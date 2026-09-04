import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import {
  V02_STARTING_CREDITS,
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
import type { CampaignTransitionResult, MissionId } from '@domain/index';
import { buildNewGameCampaign } from '../persistence';
import { createBootRunner } from '../session/boot';
import { initializeSession } from '../session';
import { createSessionStore } from '../session/store';
import {
  createMissionStartRecoveryController,
  failMissionStart,
} from './fail-mission-start';
import type {
  FailMissionStartDeps,
  MissionStartRecoveryIdentity,
} from './fail-mission-start';
import { SEAM_MISSION_ID } from './compatibility-seam';
import { startMission } from './start-mission';

/** Campaign store whose `update` rejects like an unavailable IndexedDB/Dexie
 *  adapter (infrastructure failure, no outcome returned). */
class ThrowingUpdateCampaignStore implements CampaignStorePort {
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

  async replace(next: CampaignStateV1): Promise<void> {
    return this.delegate.replace(next);
  }
}

/** Campaign store whose `update` reports an unreadable campaign record. */
class InvalidUpdateCampaignStore implements CampaignStorePort {
  constructor(private readonly delegate: InMemoryCampaignStore) {}

  async read(): Promise<CampaignReadResult> {
    return this.delegate.read();
  }

  async update(): Promise<CampaignUpdateOutcome> {
    return {
      kind: 'invalid',
      diagnostics: [{ path: 'credits', message: 'not a valid credit balance' }],
    };
  }

  async startMission(): Promise<CampaignStartOutcome> {
    throw new Error('Not used by this scenario.');
  }

  async replace(next: CampaignStateV1): Promise<void> {
    return this.delegate.replace(next);
  }
}

/** Campaign store whose record is missing (deleted externally). */
class MissingRecordCampaignStore implements CampaignStorePort {
  constructor(private readonly delegate: InMemoryCampaignStore) {}

  async read(): Promise<CampaignReadResult> {
    return this.delegate.read();
  }

  async update(): Promise<CampaignUpdateOutcome> {
    return { kind: 'missing' };
  }

  async startMission(): Promise<CampaignStartOutcome> {
    throw new Error('Not used by this scenario.');
  }

  async replace(next: CampaignStateV1): Promise<void> {
    return this.delegate.replace(next);
  }
}
/** Campaign store whose `update` throws for the first `failures` invocations,
 *  then delegates to the real in-memory store (retry-success scenarios). */
class FlakyUpdateCampaignStore implements CampaignStorePort {
  private calls = 0;

  constructor(
    private readonly delegate: InMemoryCampaignStore,
    private readonly failures: number,
  ) {}

  async read(): Promise<CampaignReadResult> {
    return this.delegate.read();
  }

  async update(
    transform: (current: CampaignStateV1) => CampaignTransitionResult,
  ): Promise<CampaignUpdateOutcome> {
    this.calls += 1;
    if (this.calls <= this.failures) {
      throw new Error('Simulated transient persistence infrastructure failure');
    }
    return this.delegate.update(transform);
  }

  async startMission(): Promise<CampaignStartOutcome> {
    return this.delegate.startMission(SEAM_MISSION_ID);
  }

  async replace(next: CampaignStateV1): Promise<void> {
    return this.delegate.replace(next);
  }
}

/** Campaign store whose `update` is deferred until the test releases it. */
class DeferredUpdateCampaignStore implements CampaignStorePort {
  private pending:
    | {
        transform: (current: CampaignStateV1) => CampaignTransitionResult;
        resolve: (outcome: CampaignUpdateOutcome) => void;
      }
    | undefined;

  updates = 0;

  constructor(private readonly delegate: InMemoryCampaignStore) {}

  /** Applies the captured transform through the real store and resolves the
   *  in-flight update. */
  releaseWithApplied(): void {
    const pending = this.pending;
    if (pending === undefined) {
      throw new Error('No update is in flight.');
    }
    this.pending = undefined;
    const decision = pending.transform(this.delegate.current!);
    if (decision.kind === 'rejected') {
      pending.resolve({ kind: 'no-change', reason: decision.reason });
      return;
    }
    this.delegate.seed(decision.campaign);
    pending.resolve({ kind: 'applied', next: decision.campaign });
  }

  async read(): Promise<CampaignReadResult> {
    return this.delegate.read();
  }

  async update(
    transform: (current: CampaignStateV1) => CampaignTransitionResult,
  ): Promise<CampaignUpdateOutcome> {
    this.updates += 1;
    return new Promise((resolve) => {
      this.pending = { transform, resolve };
    });
  }

  async startMission(): Promise<CampaignStartOutcome> {
    return this.delegate.startMission(SEAM_MISSION_ID);
  }

  async replace(next: CampaignStateV1): Promise<void> {
    return this.delegate.replace(next);
  }
}

function identityOf(started: {
  missionId: MissionId;
  missionAttemptId: number;
  missionInstanceOrdinal: number;
}): MissionStartRecoveryIdentity {
  return {
    missionId: started.missionId,
    missionAttemptId: started.missionAttemptId,
    missionInstanceOrdinal: started.missionInstanceOrdinal,
  };
}

async function startAccepted(
  deps: FailMissionStartDeps,
): Promise<MissionStartRecoveryIdentity> {
  const started = await startMission(
    { ...deps, content: CONTENT_CATALOGUE },
    SEAM_MISSION_ID,
  );
  if (started.kind !== 'accepted') {
    throw new Error('Expected the mission to start.');
  }
  return identityOf(started.snapshot);
}
describe('Mission Start Recovery Error (Base AC-014, V02-DEC-031, V02-AC-020)', () => {
  it('applied cleanup clears only the exact mission + attempt marker and reconciles the session once; the same-session retry succeeds', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });

    const controller = createMissionStartRecoveryController(
      { store: app.store, campaignStore: app.campaignStore },
      identity,
    );
    await expect(controller.run()).resolves.toBe('cleared');
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(true);
    expect(app.store.getState()?.missionStartFailedMissionId).toBe(
      SEAM_MISSION_ID,
    );
    expect(app.store.getState()?.missionResult).toBeNull();
    expect(app.store.getState()?.credits).toBe(V02_STARTING_CREDITS);
    expect(app.store.getState()?.hullIntegrity).toBe(100);
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
    expect(app.campaignStore.current?.runStatus).toBe('active');

    const retry = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(retry.kind).toBe('accepted');
    if (retry.kind === 'accepted') {
      expect(retry.snapshot.missionInstanceOrdinal).toBe(1);
      expect(app.campaignStore.current?.missionInProgress).toEqual({
        missionId: SEAM_MISSION_ID,
        attemptId: 1,
      });
    }
  });

  it('never becomes a paid Defeat on reload after a safe cleanup (no marker, no 8-Credit deduction)', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    await createMissionStartRecoveryController(
      { store: app.store, campaignStore: app.campaignStore },
      identity,
    ).run();
    const recovered = app.campaignStore.current!;
    expect(recovered.missionInProgress).toBeNull();
    expect(recovered.credits).toBe(V02_STARTING_CREDITS);

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
    expect(store.getState()?.credits).toBe(V02_STARTING_CREDITS);
    expect(store.getState()?.activeMission).toBe('none');
  });
  it('an already-absent marker reconciles once while the session still owns the snapshot; a duplicate callback is inert', async () => {
    const app = createInitializedTestApplication();
    const session = app.store.getState()!;
    app.store.dispatch({
      type: 'mission/start',
      snapshot: {
        missionId: SEAM_MISSION_ID,
        missionInstanceOrdinal: 0,
        missionAttemptId: 0,
        combatMissionSeed: 1234,
        aircraftId: session.aircraftId,
        hullIntegrity: session.hullIntegrity,
        equippedWeapon: session.equippedWeapon,
        pilot: session.pilot,
        mouseMovementEnabled: session.mouseMovementEnabled,
      },
    });
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    const controller = createMissionStartRecoveryController(
      { store: app.store, campaignStore: app.campaignStore },
      {
        missionId: SEAM_MISSION_ID,
        missionAttemptId: 0,
        missionInstanceOrdinal: 0,
      },
    );
    await expect(controller.run()).resolves.toBe('absent');
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(true);
    await expect(controller.retry()).resolves.toBe('inert');
    expect(app.store.getState()?.missionStartFailed).toBe(true);
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
  });

  it('a missing campaign record reconciles safely to Mission Details', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    const campaignStore = new MissingRecordCampaignStore(app.campaignStore);
    await expect(
      createMissionStartRecoveryController(
        { store: app.store, campaignStore },
        identity,
      ).run(),
    ).resolves.toBe('absent');
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(true);
    expect(app.store.getState()?.credits).toBe(V02_STARTING_CREDITS);
  });
  it('a thrown durable update opens the blocking Mission Start Recovery Error without clearing or reconciling', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    const campaignStore = new ThrowingUpdateCampaignStore(app.campaignStore);
    await expect(
      createMissionStartRecoveryController(
        { store: app.store, campaignStore },
        identity,
      ).run(),
    ).resolves.toBe('failed');
    expect(app.store.getState()?.combatLifecycle.overlay).toBe(
      'mission-start-recovery-error',
    );
    expect(app.store.getState()?.combatLifecycle.running).toBe(false);
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(false);
    expect(app.store.getState()?.missionResult).toBeNull();
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
  });

  it('an unreadable campaign record opens the blocking Mission Start Recovery Error (never overwrites)', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    const campaignStore = new InvalidUpdateCampaignStore(app.campaignStore);
    await expect(
      createMissionStartRecoveryController(
        { store: app.store, campaignStore },
        identity,
      ).run(),
    ).resolves.toBe('failed');
    expect(app.store.getState()?.combatLifecycle.overlay).toBe(
      'mission-start-recovery-error',
    );
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.campaignStore.current?.missionInProgress).not.toBeNull();
  });

  it('repeated failure stays on the Mission Start Recovery Error and a later Retry Cleanup of the SAME identity succeeds', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    const campaignStore = new FlakyUpdateCampaignStore(app.campaignStore, 2);
    const controller = createMissionStartRecoveryController(
      { store: app.store, campaignStore },
      identity,
    );
    await expect(controller.run()).resolves.toBe('failed');
    await expect(controller.retry()).resolves.toBe('failed');
    expect(app.store.getState()?.combatLifecycle.overlay).toBe(
      'mission-start-recovery-error',
    );
    expect(app.campaignStore.current?.missionInProgress).not.toBeNull();

    await expect(controller.retry()).resolves.toBe('cleared');
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(true);
    expect(app.store.getState()?.missionResult).toBeNull();
  });
  it('Retry Cleanup is single-flight: an activation while one cleanup is pending is busy and never starts a second update', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    const campaignStore = new DeferredUpdateCampaignStore(app.campaignStore);
    const controller = createMissionStartRecoveryController(
      { store: app.store, campaignStore },
      identity,
    );
    const first = controller.run();
    await expect(controller.retry()).resolves.toBe('busy');
    await expect(controller.retry()).resolves.toBe('busy');
    expect(campaignStore.updates).toBe(1);
    campaignStore.releaseWithApplied();
    await expect(first).resolves.toBe('cleared');
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
  });

  it('a disposed controller can never apply a late cleanup completion (no reopen or clear)', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    const campaignStore = new DeferredUpdateCampaignStore(app.campaignStore);
    const controller = createMissionStartRecoveryController(
      { store: app.store, campaignStore },
      identity,
    );
    const pending = controller.run();
    controller.dispose();
    campaignStore.releaseWithApplied();
    await expect(pending).resolves.toBe('cleared');
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(false);
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('none');
  });
  it('durable authority mismatch while the session still owns the originating snapshot is the exact Save Conflict state (same ordinal, another attempt)', async () => {
    const campaignStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    await campaignStore.replace(buildNewGameCampaign(CONTENT_CATALOGUE, 111));
    const storeA = createSessionStore();
    storeA.dispatch({
      type: 'session/initialized',
      session: initializeSession(111, CONTENT_CATALOGUE),
    });
    const identityA = await startAccepted({ store: storeA, campaignStore });
    expect(identityA.missionInstanceOrdinal).toBe(0);
    expect(identityA.missionAttemptId).toBe(0);

    // Another application instance B boots, resolves A's marker as Defeat
    // (startup recovery), and starts the SAME mission: durable attempt id 1,
    // while B's session ordinal also restarts at 0.
    const recovery = applyDefeatRecoveryOrGameOver(campaignStore.current!);
    if (recovery.kind !== 'recovered') {
      throw new Error('Expected the persisted marker to recover as Defeat.');
    }
    await campaignStore.replace(recovery.campaign);
    const storeB = createSessionStore();
    storeB.dispatch({
      type: 'session/initialized',
      session: initializeSession(222, CONTENT_CATALOGUE),
    });
    const identityB = await startAccepted({ store: storeB, campaignStore });
    expect(identityB.missionInstanceOrdinal).toBe(0);
    expect(identityB.missionAttemptId).toBe(1);

    // A's delayed cleanup callback still owns ITS originating snapshot in
    // memory, but durable authority now belongs to B's marker: cleanup is not
    // attempted or claimed and A transitions to the blocking Save Conflict.
    const controllerA = createMissionStartRecoveryController(
      { store: storeA, campaignStore },
      identityA,
    );
    await expect(controllerA.run()).resolves.toBe('conflict');
    expect(storeA.getState()?.activeMission).not.toBe('none');
    expect(storeA.getState()?.combatLifecycle.overlay).toBe('save-conflict');
    expect(storeA.getState()?.missionStartFailed).toBe(false);
    expect(storeA.getState()?.missionResult).toBeNull();
    expect(campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
    expect(campaignStore.current?.credits).toBe(V02_STARTING_CREDITS - 8);
    expect(storeB.getState()?.activeMission).not.toBe('none');
  });
  it('a schema-valid cross-mission marker is never cleared and opens Save Conflict while the snapshot is still current', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    const current = app.campaignStore.current!;
    await app.campaignStore.replace({
      ...current,
      unlockedMissionIds: ['interception-01', 'interception-02'],
      missionInProgress: { missionId: 'interception-02', attemptId: 99 },
    });
    await expect(
      createMissionStartRecoveryController(
        { store: app.store, campaignStore: app.campaignStore },
        identity,
      ).run(),
    ).resolves.toBe('conflict');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: 'interception-02',
      attemptId: 99,
    });
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('save-conflict');
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(false);
    expect(app.store.getState()?.credits).toBe(V02_STARTING_CREDITS);
  });

  it('a Retry Cleanup that discovers a durable authority mismatch transitions to the same Save Conflict state', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    // Initial cleanup cannot be proven safe: the recovery shell opens.
    const flaky = new FlakyUpdateCampaignStore(app.campaignStore, 1);
    const controller = createMissionStartRecoveryController(
      { store: app.store, campaignStore: flaky },
      identity,
    );
    await expect(controller.run()).resolves.toBe('failed');
    expect(app.store.getState()?.combatLifecycle.overlay).toBe(
      'mission-start-recovery-error',
    );
    // Durable authority moves to another attempt while this session still
    // owns the originating snapshot. The retry makes the exact Save Conflict
    // transition instead of claiming or attempting a cleanup.
    const current = app.campaignStore.current!;
    await app.campaignStore.replace({
      ...current,
      missionInProgress: {
        missionId: SEAM_MISSION_ID,
        attemptId: identity.missionAttemptId + 1,
      },
    });
    await expect(controller.retry()).resolves.toBe('conflict');
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('save-conflict');
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.store.getState()?.missionResult).toBeNull();
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: identity.missionAttemptId + 1,
    });
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
  });

  it('a stale failure callback after a NEWER local mission/run is inert and can never clear or signal it', async () => {
    const app = createInitializedTestApplication();
    const identityA = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    await createMissionStartRecoveryController(
      { store: app.store, campaignStore: app.campaignStore },
      identityA,
    ).run();
    expect(app.store.getState()?.activeMission).toBe('none');
    const identityB = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    expect(identityB.missionInstanceOrdinal).toBe(1);
    expect(identityB.missionAttemptId).toBe(1);

    await expect(
      createMissionStartRecoveryController(
        { store: app.store, campaignStore: app.campaignStore },
        identityA,
      ).run(),
    ).resolves.toBe('inert');
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(app.store.getState()?.missionStartFailed).toBe(false);
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 1,
    });
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
  });
  it('is inert when no originating mission was started at all', async () => {
    const app = createInitializedTestApplication();
    await expect(
      failMissionStart(
        { store: app.store, campaignStore: app.campaignStore },
        {
          missionId: SEAM_MISSION_ID,
          missionAttemptId: 0,
          missionInstanceOrdinal: 0,
        },
      ),
    ).resolves.toBe('inert');
    expect(app.store.getState()?.missionStartFailed).toBe(false);
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('none');
  });

  it('cleanup never runs a result, Repair, reward, penalty, unlock, abort, or startup-Defeat path', async () => {
    const app = createInitializedTestApplication();
    const identity = await startAccepted({
      store: app.store,
      campaignStore: app.campaignStore,
    });
    await createMissionStartRecoveryController(
      { store: app.store, campaignStore: app.campaignStore },
      identity,
    ).run();
    const state = app.store.getState()!;
    expect(state.missionResult).toBeNull();
    expect(state.runStatus).toBe('active');
    expect(state.credits).toBe(V02_STARTING_CREDITS);
    expect(state.hullIntegrity).toBe(100);
    expect(state.completedMissionIds).toEqual([]);
    expect(state.unlockedMissionIds).toEqual(['interception-01']);
    expect(app.campaignStore.current?.runStatus).toBe('active');
    expect(app.campaignStore.current?.completedMissionIds).toEqual([]);
  });
});
