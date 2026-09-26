import { describe, expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { startMission, commitMissionResult } from '@application/mission';
import { initializeSession } from '@application/session';
import { createInitializedTestApplication } from '@test-support/persistence';
import {
  InMemoryCampaignStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import type {
  CampaignReadResult,
  CampaignStartOutcome,
  CampaignStorePort,
  CampaignUpdateOutcome,
} from './campaign-store';
import type {
  CampaignStateV1,
  CampaignTransitionResult,
  MissionId,
} from '@domain/index';
import {
  activeMissionIdentity,
  createDebugCampaignCommand,
  debugCampaignMatchesActiveMission,
  readDebugCampaign,
} from './debug-campaign';
import type {
  ActiveMissionIdentity,
  DebugCampaignCommand,
} from './debug-campaign';

/**
 * V02-WI-07 D02-A development-only campaign Debug authority evidence (Epic §17,
 * V02-AC-026). Every case goes through the application-owned CampaignStorePort
 * transaction and the single Session Store; the durable campaign record is the
 * only authority for Credits, the `missionInProgress` marker, and `runStatus`.
 */

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Controllable `CampaignStorePort` wrapper: it delegates to the REAL in-memory
 * adapter (so the transform runs against the current record inside the
 * transaction) while letting a test defer, reject, or count the update.
 */
class ControllableCampaignStore implements CampaignStorePort {
  private readonly queued: {
    readonly transform: (current: CampaignStateV1) => CampaignTransitionResult;
    readonly deferred: Deferred<CampaignUpdateOutcome>;
  }[] = [];

  updateCallCount = 0;
  readCallCount = 0;
  mode: 'immediate' | 'deferred' | 'reject' = 'immediate';
  readOverride: (() => Promise<CampaignReadResult>) | null = null;

  constructor(private readonly inner: InMemoryCampaignStore) {}

  read(): Promise<CampaignReadResult> {
    this.readCallCount += 1;
    return this.readOverride === null ? this.inner.read() : this.readOverride();
  }

  update(
    transform: (current: CampaignStateV1) => CampaignTransitionResult,
  ): Promise<CampaignUpdateOutcome> {
    this.updateCallCount += 1;
    if (this.mode === 'reject') {
      return Promise.reject(new Error('controlled campaign failure'));
    }
    if (this.mode === 'deferred') {
      const entry = deferred<CampaignUpdateOutcome>();
      this.queued.push({ transform, deferred: entry });
      return entry.promise;
    }
    return this.inner.update(transform);
  }

  startMission(missionId: MissionId): Promise<CampaignStartOutcome> {
    return this.inner.startMission(missionId);
  }

  replace(next: CampaignStateV1): Promise<void> {
    return this.inner.replace(next);
  }

  /** Runs every deferred transform through the real transaction and resolves. */
  async flush(): Promise<readonly CampaignUpdateOutcome[]> {
    const queued = [...this.queued];
    this.queued.length = 0;
    const outcomes: CampaignUpdateOutcome[] = [];
    for (const { transform, deferred: entry } of queued) {
      const outcome = await this.inner.update(transform);
      outcomes.push(outcome);
      entry.resolve(outcome);
    }
    return outcomes;
  }
}

interface CommandHarness {
  readonly command: DebugCampaignCommand;
  readonly navigate: ReturnType<typeof vi.fn>;
}

/**
 * Builds the D02-A command exactly as the Combat Screen does: one instance for
 * the logical active mission, development `debugMode` enabled, and browser
 * navigation injected so a test can prove no navigation happens.
 */
function createCommand(
  app: ReturnType<typeof createInitializedTestApplication>,
  options: {
    readonly campaignStore?: CampaignStorePort;
    readonly debugMode?: boolean;
  } = {},
): CommandHarness {
  const navigate = vi.fn();
  // Bound exactly as the Combat Screen binds it: the immutable identity of the
  // mission that is active when the command is constructed (F4).
  const origin = activeMissionIdentity(app.store) ?? {
    missionId: 'interception-01',
    attemptId: 0,
    missionInstanceOrdinal: 0,
  };
  return {
    navigate,
    command: createDebugCampaignCommand({
      store: app.store,
      campaignStore: options.campaignStore ?? app.campaignStore,
      debugMode: options.debugMode ?? true,
      origin,
      navigate,
    }),
  };
}

/** A real initialized application with one accepted, active Interception 01 whose
 *  authoritative Debug Overlay is OPEN (the exact D02-A eligibility state). */
async function activeApplication(): Promise<{
  readonly app: ReturnType<typeof createInitializedTestApplication>;
  readonly identity: ActiveMissionIdentity;
}> {
  const app = createInitializedTestApplication();
  const start = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    'interception-01',
  );
  if (start.kind !== 'accepted') {
    throw new Error('Expected the mission start to be accepted.');
  }
  app.store.dispatch({
    type: 'combat-lifecycle/open-debug',
    missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
  });
  if (app.store.getState()?.combatLifecycle.overlay !== 'debug') {
    throw new Error(
      'Expected the Debug Overlay to be the authoritative state.',
    );
  }
  return {
    app,
    identity: {
      missionId: 'interception-01',
      attemptId: start.snapshot.missionAttemptId,
      missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
    },
  };
}

describe('D02-A campaign observability read (Epic §17, V02-AC-026)', () => {
  it('reads Credits, the exact marker identity, and runStatus from the persisted record', async () => {
    const { app } = await activeApplication();
    const outcome = await readDebugCampaign({
      campaignStore: app.campaignStore,
    });
    expect(outcome.kind).toBe('loaded');
    if (outcome.kind !== 'loaded') {
      return;
    }
    const persisted = app.campaignStore.current!;
    expect(outcome.campaign.credits).toBe(persisted.credits);
    expect(outcome.campaign.runStatus).toBe('active');
    expect(outcome.campaign.missionInProgress).toEqual({
      missionId: persisted.missionInProgress!.missionId,
      attemptId: persisted.missionInProgress!.attemptId,
    });
  });

  it('reports a cleared marker as None and never derives it from the session', async () => {
    const { app } = await activeApplication();
    app.campaignStore.seed({
      ...app.campaignStore.current!,
      missionInProgress: null,
    });
    const outcome = await readDebugCampaign({
      campaignStore: app.campaignStore,
    });
    expect(outcome).toMatchObject({
      kind: 'loaded',
      campaign: { missionInProgress: null },
    });
    // The session still owns an active mission: the read is authoritative and
    // does not mirror the in-memory active mission.
    expect(app.store.getState()?.activeMission).not.toBe('none');
  });

  it('reports a missing, invalid, or unreadable record as unavailable (absent display)', async () => {
    const missing = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    expect(await readDebugCampaign({ campaignStore: missing })).toEqual({
      kind: 'unavailable',
    });

    const invalid = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    invalid.seed({ credits: 'nope' } as unknown as CampaignStateV1);
    expect(await readDebugCampaign({ campaignStore: invalid })).toEqual({
      kind: 'unavailable',
    });

    const broken = new ControllableCampaignStore(
      new InMemoryCampaignStore(campaignSchemaContext(CONTENT_CATALOGUE)),
    );
    broken.readOverride = () => Promise.reject(new Error('controlled read'));
    expect(await readDebugCampaign({ campaignStore: broken })).toEqual({
      kind: 'unavailable',
    });
  });
});

describe('D02-A exact-marker identity guard (Epic §13.2, V02-AC-020/026)', () => {
  it('reads the identity only from the single Session Store active mission', async () => {
    const { app, identity } = await activeApplication();
    expect(activeMissionIdentity(app.store)).toEqual(identity);

    // Resolving the mission removes the identity: nothing can be targeted.
    await commitMissionResult(
      { ...app, content: CONTENT_CATALOGUE },
      { kind: 'evacuated' },
      100,
      identity.attemptId,
      identity.missionInstanceOrdinal,
    );
    app.store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'evacuated',
        missionInstanceOrdinal: identity.missionInstanceOrdinal,
        creditsAfter: 0,
        hullIntegrityAfter: 100,
        creditsEarned: 0,
        combatRewards: 0,
        escapePenalties: 0,
        netCombatReward: 0,
        destroyedCounts: {
          'basic-drone': 0,
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
    expect(activeMissionIdentity(app.store)).toBeNull();
  });

  it('requires an active run, a non-null marker, and both exact identities', () => {
    const identity: ActiveMissionIdentity = {
      missionId: 'interception-01',
      attemptId: 4,
      missionInstanceOrdinal: 1,
    };
    const base = {
      credits: 12,
      missionInProgress: {
        missionId: 'interception-01' as MissionId,
        attemptId: 4,
      },
      runStatus: 'active' as const,
    };
    expect(debugCampaignMatchesActiveMission(base, identity)).toBe(true);
    expect(
      debugCampaignMatchesActiveMission(
        { ...base, runStatus: 'game-over' },
        identity,
      ),
    ).toBe(false);
    expect(
      debugCampaignMatchesActiveMission(
        { ...base, missionInProgress: null },
        identity,
      ),
    ).toBe(false);
    expect(
      debugCampaignMatchesActiveMission(
        {
          ...base,
          missionInProgress: {
            missionId: 'interception-02' as MissionId,
            attemptId: 4,
          },
        },
        identity,
      ),
    ).toBe(false);
    expect(
      debugCampaignMatchesActiveMission(
        {
          ...base,
          missionInProgress: {
            missionId: 'interception-01' as MissionId,
            attemptId: 5,
          },
        },
        identity,
      ),
    ).toBe(false);
  });
});

describe('D02-A bounded Credit command (Epic §12.4/§17, V02-AC-020/026)', () => {
  it('applies exactly one durable Credits write for the exact active identity and then reconciles the session', async () => {
    const { app, identity } = await activeApplication();
    const { command } = createCommand(app);
    expect(command.isCreditsPending()).toBe(false);
    const outcome = await command.setCredits(7);
    expect(outcome).toEqual({ kind: 'applied' });
    expect(command.isCreditsPending()).toBe(false);
    // Durable authority first.
    expect(app.campaignStore.current?.credits).toBe(7);
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: identity.missionId,
      attemptId: identity.attemptId,
    });
    expect(app.campaignStore.current?.runStatus).toBe('active');
    // Session reconciliation mirrors the committed value for this instance.
    expect(app.store.getState()?.credits).toBe(7);
  });

  it('is a strict no-op without an active mission', async () => {
    const app = createInitializedTestApplication();
    const { command } = createCommand(app);
    const before = app.store.getState()?.credits;
    expect(await command.setCredits(7)).toEqual({
      kind: 'skipped',
      reason: 'no-active-mission',
    });
    expect(app.campaignStore.current?.credits).toBe(12);
    expect(app.store.getState()?.credits).toBe(before);
  });

  it('leaves durable and in-memory state untouched for a cleared, foreign, or inactive marker', async () => {
    const corruptions = [
      'cleared',
      'foreign-mission',
      'foreign-attempt',
      'game-over',
    ] as const;
    for (const corrupt of corruptions) {
      const { app } = await activeApplication();
      const current = app.campaignStore.current!;
      const marker = current.missionInProgress!;
      app.campaignStore.seed({
        ...current,
        ...(corrupt === 'cleared' ? { missionInProgress: null } : {}),
        ...(corrupt === 'foreign-mission'
          ? { missionInProgress: { ...marker, missionId: 'interception-02' } }
          : {}),
        ...(corrupt === 'foreign-attempt'
          ? {
              missionInProgress: {
                ...marker,
                attemptId: marker.attemptId + 99,
              },
            }
          : {}),
        ...(corrupt === 'game-over' ? { runStatus: 'game-over' as const } : {}),
      });
      const durableBefore = app.campaignStore.current;
      const sessionCredits = app.store.getState()?.credits;
      const { command } = createCommand(app);
      const outcome = await command.setCredits(8);
      expect(outcome.kind).toBe('skipped');
      // The durable record is unchanged and the session never changed.
      expect(app.campaignStore.current).toEqual(durableBefore);
      expect(app.store.getState()?.credits).toBe(sessionCredits);
    }
  });

  it('reports a thrown transaction as failed with no durable or in-memory change', async () => {
    const { app } = await activeApplication();
    const store = new ControllableCampaignStore(app.campaignStore);
    store.mode = 'reject';
    const { command } = createCommand(app, { campaignStore: store });
    expect(await command.setCredits(7)).toEqual({ kind: 'failed' });
    expect(store.updateCallCount).toBe(1);
    expect(app.campaignStore.current?.credits).toBe(12);
    expect(app.store.getState()?.credits).toBe(12);
  });
});

describe('D02-A single-flight, late, and stale Credit completions', () => {
  it('shares one execution across concurrent activations', async () => {
    const { app } = await activeApplication();
    const store = new ControllableCampaignStore(app.campaignStore);
    store.mode = 'deferred';
    const { command } = createCommand(app, { campaignStore: store });
    const first = command.setCredits(7);
    expect(command.isCreditsPending()).toBe(true);
    const second = command.setCredits(8);
    expect(second).toBe(first);
    expect(store.updateCallCount).toBe(1);
    store.flush();
    expect(await first).toEqual({ kind: 'applied' });
    // The first bounded value won; the duplicate never applied.
    expect(app.campaignStore.current?.credits).toBe(7);
    expect(app.store.getState()?.credits).toBe(7);
    expect(store.updateCallCount).toBe(1);
    expect(command.isCreditsPending()).toBe(false);
  });

  it('never reconciles a late completion into a session that moved on', async () => {
    const { app, identity } = await activeApplication();
    const store = new ControllableCampaignStore(app.campaignStore);
    store.mode = 'deferred';
    const { command } = createCommand(app, { campaignStore: store });
    const pending = command.setCredits(7);
    // The Mission Instance resolves (its result is presented) before the
    // durable write completes, without touching the durable marker.
    const creditsBeforeResolution = app.store.getState()?.credits;
    app.store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: identity.missionInstanceOrdinal,
        creditsAfter: creditsBeforeResolution ?? 0,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    expect(app.store.getState()?.activeMission).toBe('none');
    store.flush();
    await pending;
    // The durable write still completed against the matching marker...
    expect(app.campaignStore.current?.credits).toBe(7);
    // ...but the stale completion never wrote an in-memory value, because the
    // reconciliation is bound to the still-active Mission Instance.
    expect(app.store.getState()?.credits).toBe(creditsBeforeResolution);
    expect(app.store.getState()?.activeMission).toBe('none');
  });

  it('never writes durably when the marker changed before the transaction ran', async () => {
    const { app } = await activeApplication();
    const store = new ControllableCampaignStore(app.campaignStore);
    store.mode = 'deferred';
    const { command } = createCommand(app, { campaignStore: store });
    const pending = command.setCredits(7);
    const current = app.campaignStore.current!;
    const marker = current.missionInProgress!;
    app.campaignStore.seed({
      ...current,
      missionInProgress: { ...marker, attemptId: marker.attemptId + 7 },
    });
    const durableBefore = app.campaignStore.current;
    store.flush();
    expect(await pending).toEqual({ kind: 'skipped', reason: 'no-change' });
    expect(app.campaignStore.current).toEqual(durableBefore);
    expect(app.store.getState()?.credits).toBe(12);
  });
});

describe('D02-A-C01 F1: delayed completion across a replaced campaign run', () => {
  it('is inert for a newer run that reuses the local Mission Instance ordinal', async () => {
    const { app, identity } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    durable.mode = 'deferred';
    const { command } = createCommand(app, { campaignStore: durable });
    const pending = command.setCredits(7);
    // The durable transaction applies under the OLD identity...
    void durable.flush();
    // ...while, before the command observes the resolved write, a confirmed New
    // Game replaces the session and a newer mission starts with the SAME local
    // ordinal but a NEW globally unique durable attempt id.
    app.store.dispatch({
      type: 'session/new-game',
      session: initializeSession(987654321, CONTENT_CATALOGUE),
    });
    const fresh = app.store.getState()!;
    expect(fresh.credits).toBe(12);
    app.store.dispatch({
      type: 'mission/start',
      snapshot: {
        missionId: 'interception-02',
        missionInstanceOrdinal: identity.missionInstanceOrdinal,
        missionAttemptId: identity.attemptId + 1,
        combatMissionSeed: 4242,
        aircraftId: fresh.aircraftId,
        hullIntegrity: fresh.hullIntegrity,
        equippedWeapon: fresh.equippedWeapon,
        pilot: fresh.pilot,
        mouseMovementEnabled: fresh.mouseMovementEnabled,
      },
    });
    expect(app.store.getState()?.activeMission).toMatchObject({
      missionId: 'interception-02',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
      missionAttemptId: identity.attemptId + 1,
    });

    expect(await pending).toEqual({ kind: 'applied' });
    // The older transaction committed its durable value...
    expect(app.campaignStore.current?.credits).toBe(7);
    // ...but its delayed reconciliation carried the OLD mission and durable
    // attempt identity even though the reused local ordinal matched, so the
    // newer run's Credits are untouched. An ordinal-only match would have
    // overwritten them here.
    expect(app.store.getState()?.credits).toBe(12);
  });
});

describe('D02-A-C01 F2: development Debug eligibility at the command boundary', () => {
  it('is inert out of the Debug lifecycle, under another Overlay, and in a disabled build', async () => {
    const { app, identity } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const { command } = createCommand(app, { campaignStore: durable });
    const sessionCredits = app.store.getState()?.credits;
    const durableBefore = app.campaignStore.current;

    // Direct call while the authoritative Debug Overlay is closed.
    app.store.dispatch({
      type: 'combat-lifecycle/close-debug',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    expect(await command.setCredits(7)).toEqual({
      kind: 'skipped',
      reason: 'debug-not-eligible',
    });
    expect(await command.requestRecoveryReload()).toEqual({
      kind: 'skipped',
      reason: 'debug-not-eligible',
    });

    // A different Overlay is not the development Debug lifecycle either.
    app.store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    expect(await command.setCredits(7)).toEqual({
      kind: 'skipped',
      reason: 'debug-not-eligible',
    });

    // Reopened Debug in a build without the development capability.
    app.store.dispatch({
      type: 'combat-lifecycle/resume',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    app.store.dispatch({
      type: 'combat-lifecycle/open-debug',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    const production = createCommand(app, {
      campaignStore: durable,
      debugMode: false,
    });
    expect(await production.command.setCredits(7)).toEqual({
      kind: 'skipped',
      reason: 'debug-not-eligible',
    });
    expect(await production.command.requestRecoveryReload()).toEqual({
      kind: 'skipped',
      reason: 'debug-not-eligible',
    });

    // No durable write, no read, no navigation, and no session change happened.
    expect(durable.updateCallCount).toBe(0);
    expect(durable.readCallCount).toBe(0);
    expect(production.navigate).not.toHaveBeenCalled();
    expect(app.campaignStore.current).toEqual(durableBefore);
    expect(app.store.getState()?.credits).toBe(sessionCredits);
  });

  it('keeps one mission-lifetime latch and pending state across Debug close and reopen', async () => {
    const { app, identity } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    durable.mode = 'deferred';
    const { command } = createCommand(app, { campaignStore: durable });
    const observed: boolean[] = [];
    const unsubscribe = command.subscribe(() => {
      observed.push(command.isCreditsPending());
    });
    const first = command.setCredits(7);
    expect(command.isCreditsPending()).toBe(true);
    expect(observed).toEqual([true]);

    // The player closes and reopens Debug while the write is in flight. The
    // latch belongs to the logical active mission, not to the Overlay, so the
    // pending state is still reported and a second activation joins the SAME
    // transaction instead of starting a second one.
    app.store.dispatch({
      type: 'combat-lifecycle/close-debug',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    app.store.dispatch({
      type: 'combat-lifecycle/open-debug',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    expect(command.isCreditsPending()).toBe(true);
    const second = command.setCredits(8);
    expect(second).toBe(first);
    expect(durable.updateCallCount).toBe(1);

    await durable.flush();
    expect(await first).toEqual({ kind: 'applied' });
    expect(await second).toEqual({ kind: 'applied' });
    expect(observed).toEqual([true, false]);
    unsubscribe();
    expect(durable.updateCallCount).toBe(1);
    expect(app.campaignStore.current?.credits).toBe(7);
    expect(app.store.getState()?.credits).toBe(7);
    expect(command.isCreditsPending()).toBe(false);
  });
});

describe('D02-A-C01 F3: recovery reload re-verifies the persisted campaign', () => {
  it('navigates exactly once per activation for the exact still-active identity', async () => {
    const { app } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const { command, navigate } = createCommand(app, {
      campaignStore: durable,
    });
    expect(durable.readCallCount).toBe(0);

    expect(await command.requestRecoveryReload()).toEqual({ kind: 'reloaded' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(durable.readCallCount).toBe(1);
    // A second activation performs its OWN fresh read: eligibility is never
    // cached from the Overlay's earlier read.
    expect(await command.requestRecoveryReload()).toEqual({ kind: 'reloaded' });
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(durable.readCallCount).toBe(2);
    // The reload itself never mutates the campaign or the session.
    expect(app.campaignStore.current?.credits).toBe(12);
    expect(app.store.getState()?.credits).toBe(12);
  });

  it('never navigates for a marker that changed, cleared, was replaced, or became inactive', async () => {
    const cases = [
      { corruption: 'cleared', reason: 'marker-does-not-match' },
      { corruption: 'foreign-attempt', reason: 'marker-does-not-match' },
      // Strict read validation rejects an unknown mission id and a marker that
      // contradicts `game-over`, so those reads are unavailable and the browser
      // still stays put.
      { corruption: 'foreign-mission', reason: 'campaign-unavailable' },
      { corruption: 'game-over', reason: 'campaign-unavailable' },
    ] as const;
    for (const { corruption, reason } of cases) {
      const { app } = await activeApplication();
      const durable = new ControllableCampaignStore(app.campaignStore);
      const { command, navigate } = createCommand(app, {
        campaignStore: durable,
      });
      const current = app.campaignStore.current!;
      const marker = current.missionInProgress!;
      app.campaignStore.seed({
        ...current,
        ...(corruption === 'cleared' ? { missionInProgress: null } : {}),
        ...(corruption === 'foreign-mission'
          ? { missionInProgress: { ...marker, missionId: 'interception-02' } }
          : {}),
        ...(corruption === 'foreign-attempt'
          ? {
              missionInProgress: {
                ...marker,
                attemptId: marker.attemptId + 99,
              },
            }
          : {}),
        ...(corruption === 'game-over'
          ? { runStatus: 'game-over' as const }
          : {}),
      });

      expect(await command.requestRecoveryReload()).toEqual({
        kind: 'skipped',
        reason,
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(app.store.getState()?.credits).toBe(12);
    }
  });

  it('never navigates for a missing, invalid, or unreadable record', async () => {
    const { app } = await activeApplication();
    const missing = new ControllableCampaignStore(
      new InMemoryCampaignStore(campaignSchemaContext(CONTENT_CATALOGUE)),
    );
    const missingRun = createCommand(app, { campaignStore: missing });
    expect(await missingRun.command.requestRecoveryReload()).toEqual({
      kind: 'skipped',
      reason: 'campaign-unavailable',
    });
    expect(missingRun.navigate).not.toHaveBeenCalled();

    const invalidStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    invalidStore.seed({ credits: 'nope' } as unknown as CampaignStateV1);
    const invalidRun = createCommand(app, { campaignStore: invalidStore });
    expect(await invalidRun.command.requestRecoveryReload()).toEqual({
      kind: 'skipped',
      reason: 'campaign-unavailable',
    });
    expect(invalidRun.navigate).not.toHaveBeenCalled();

    const broken = new ControllableCampaignStore(app.campaignStore);
    broken.readOverride = () => Promise.reject(new Error('controlled read'));
    const brokenRun = createCommand(app, { campaignStore: broken });
    expect(await brokenRun.command.requestRecoveryReload()).toEqual({
      kind: 'skipped',
      reason: 'campaign-unavailable',
    });
    expect(brokenRun.navigate).not.toHaveBeenCalled();
  });

  it('shares one in-flight activation and reports pending until it settles', async () => {
    const { app } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const gate = deferred<CampaignReadResult>();
    durable.readOverride = () => gate.promise;
    const { command, navigate } = createCommand(app, {
      campaignStore: durable,
    });
    const first = command.requestRecoveryReload();
    expect(command.isRecoveryReloadPending()).toBe(true);
    const second = command.requestRecoveryReload();
    expect(second).toBe(first);
    expect(durable.readCallCount).toBe(1);
    expect(navigate).not.toHaveBeenCalled();

    gate.resolve(await app.campaignStore.read());
    expect(await first).toEqual({ kind: 'reloaded' });
    expect(await second).toEqual({ kind: 'reloaded' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(durable.readCallCount).toBe(1);
    expect(command.isRecoveryReloadPending()).toBe(false);
  });
});

/**
 * Confirmed New Game followed by a newer mission that REUSES the local Mission
 * Instance ordinal under a new mission/attempt identity and opens its own
 * authoritative Debug Overlay (D02-A-C02 F4/F5).
 */
function replaceRunReusingLocalOrdinal(
  app: ReturnType<typeof createInitializedTestApplication>,
  previousAttemptId: number,
): ActiveMissionIdentity {
  app.store.dispatch({
    type: 'session/new-game',
    session: initializeSession(987654321, CONTENT_CATALOGUE),
  });
  const fresh = app.store.getState()!;
  app.store.dispatch({
    type: 'mission/start',
    snapshot: {
      missionId: 'interception-02',
      missionInstanceOrdinal: 0,
      missionAttemptId: previousAttemptId + 1,
      combatMissionSeed: 4242,
      aircraftId: fresh.aircraftId,
      hullIntegrity: fresh.hullIntegrity,
      equippedWeapon: fresh.equippedWeapon,
      pilot: fresh.pilot,
      mouseMovementEnabled: fresh.mouseMovementEnabled,
    },
  });
  app.store.dispatch({
    type: 'combat-lifecycle/open-debug',
    missionInstanceOrdinal: 0,
  });
  // The newer run's durable marker, exactly as a real accepted start would have
  // written it (this helper replaces the run deterministically at the session
  // level, so the matching durable half is written explicitly).
  const durable = app.campaignStore.current;
  if (durable !== null) {
    app.campaignStore.seed({
      ...durable,
      missionInProgress: {
        missionId: 'interception-02',
        attemptId: previousAttemptId + 1,
      },
      // The newer run's mission must be legitimately reachable in the replaced
      // record, otherwise strict validation rejects the whole row.
      unlockedMissionIds: ['interception-01', 'interception-02'],
    });
  }
  const active = activeMissionIdentity(app.store);
  if (active === null) {
    throw new Error('Expected the newer mission to be active.');
  }
  return active;
}

describe('D02-A-C02 F4: the command is bound to its originating mission', () => {
  it('is inert for a stale command after a confirmed New Game and a newer mission that reuses the local ordinal', async () => {
    const { app } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const stale = createCommand(app, { campaignStore: durable });
    // A confirmed New Game restarts the local ordinal; the newer mission then
    // carries the SAME local ordinal under a different mission/attempt identity
    // and opens its own Debug Overlay.
    const newer = replaceRunReusingLocalOrdinal(app, 0);
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('debug');

    // Direct calls on the OLD command object: both actions are inert, with no
    // durable write, no durable read, and no navigation.
    expect(await stale.command.setCredits(7)).toEqual({
      kind: 'skipped',
      reason: 'not-originating-mission',
    });
    expect(await stale.command.requestRecoveryReload()).toEqual({
      kind: 'skipped',
      reason: 'not-originating-mission',
    });
    expect(durable.updateCallCount).toBe(0);
    expect(durable.readCallCount).toBe(0);
    expect(stale.navigate).not.toHaveBeenCalled();
    expect(app.store.getState()?.credits).toBe(12);

    // The command bound to the newer mission is authorised in the same state,
    // so the binding rejects the stale owner without disabling the surface.
    const current = createCommand(app, { campaignStore: durable });
    expect(current.command.origin).toEqual(newer);
    expect(await current.command.setCredits(7)).toEqual({ kind: 'applied' });
    expect(app.store.getState()?.credits).toBe(7);
    expect(durable.updateCallCount).toBe(1);
  });

  it('is inert for a stale command of an earlier attempt of the same mission', async () => {
    const { app, identity } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const stale = createCommand(app, { campaignStore: durable });

    // The same mission restarts with a newer durable attempt id and a newer
    // local ordinal, and Debug is open again for it.
    app.store.dispatch({
      type: 'mission/start-failed',
      missionId: identity.missionId,
      missionAttemptId: identity.attemptId,
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    const fresh = app.store.getState()!;
    app.store.dispatch({
      type: 'mission/start',
      snapshot: {
        missionId: identity.missionId,
        missionInstanceOrdinal: identity.missionInstanceOrdinal + 1,
        missionAttemptId: identity.attemptId + 1,
        combatMissionSeed: 4242,
        aircraftId: fresh.aircraftId,
        hullIntegrity: fresh.hullIntegrity,
        equippedWeapon: fresh.equippedWeapon,
        pilot: fresh.pilot,
        mouseMovementEnabled: fresh.mouseMovementEnabled,
      },
    });
    app.store.dispatch({
      type: 'combat-lifecycle/open-debug',
      missionInstanceOrdinal: identity.missionInstanceOrdinal + 1,
    });

    expect(await stale.command.setCredits(8)).toEqual({
      kind: 'skipped',
      reason: 'not-originating-mission',
    });
    expect(await stale.command.requestRecoveryReload()).toEqual({
      kind: 'skipped',
      reason: 'not-originating-mission',
    });
    expect(durable.updateCallCount).toBe(0);
    expect(durable.readCallCount).toBe(0);
    expect(stale.navigate).not.toHaveBeenCalled();
  });
});

describe('D02-A-C02 F5: identity and eligibility are rechecked after the awaited read', () => {
  it('does not navigate when Debug closes while the fresh read is in flight', async () => {
    const { app, identity } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const gate = deferred<CampaignReadResult>();
    durable.readOverride = () => gate.promise;
    const { command, navigate } = createCommand(app, {
      campaignStore: durable,
    });
    // The in-flight read resolves with the EXACT old marker of the bound
    // mission, which alone would have authorised navigation before C02.
    const staleRead = await app.campaignStore.read();
    const pending = command.requestRecoveryReload();
    expect(durable.readCallCount).toBe(1);

    app.store.dispatch({
      type: 'combat-lifecycle/close-debug',
      missionInstanceOrdinal: identity.missionInstanceOrdinal,
    });
    gate.resolve(staleRead);

    expect(await pending).toEqual({
      kind: 'skipped',
      reason: 'debug-closed-during-read',
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when the mission resolves while the fresh read is in flight', async () => {
    const { app, identity } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const gate = deferred<CampaignReadResult>();
    durable.readOverride = () => gate.promise;
    const { command, navigate } = createCommand(app, {
      campaignStore: durable,
    });
    const staleRead = await app.campaignStore.read();
    const pending = command.requestRecoveryReload();
    expect(durable.readCallCount).toBe(1);

    app.store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: identity.missionInstanceOrdinal,
        creditsAfter: 12,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    expect(app.store.getState()?.activeMission).toBe('none');
    gate.resolve(staleRead);

    expect(await pending).toEqual({
      kind: 'skipped',
      reason: 'mission-resolved-during-read',
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when a newer run reuses the local ordinal during the read', async () => {
    const { app, identity } = await activeApplication();
    const durable = new ControllableCampaignStore(app.campaignStore);
    const gate = deferred<CampaignReadResult>();
    durable.readOverride = () => gate.promise;
    const { command, navigate } = createCommand(app, {
      campaignStore: durable,
    });
    const staleRead = await app.campaignStore.read();
    const pending = command.requestRecoveryReload();
    expect(durable.readCallCount).toBe(1);

    // Confirmed New Game plus a newer mission with the SAME local ordinal and
    // its own Debug Overlay: Debug is open, yet the bound identity has moved on.
    replaceRunReusingLocalOrdinal(app, identity.attemptId);
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('debug');
    gate.resolve(staleRead);

    expect(await pending).toEqual({
      kind: 'skipped',
      reason: 'mission-replaced-during-read',
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('D02-A Repair-boundary Defeat composition (Epic §12.4, V02-AC-016)', () => {
  it('Set Credits: 7 then the accepted Lose Mission path resolves Game Over with no partial deduction', async () => {
    const { app, identity } = await activeApplication();
    const { command } = createCommand(app);
    expect(await command.setCredits(7)).toEqual({ kind: 'applied' });
    expect(app.store.getState()?.credits).toBe(7);

    // The SAME terminal evaluator/transaction the accepted Lose Mission command
    // uses: no dedicated Game Over mutation and no duplicate Defeat path.
    const outcome = await commitMissionResult(
      { ...app, content: CONTENT_CATALOGUE },
      { kind: 'defeat' },
      0,
      identity.attemptId,
      identity.missionInstanceOrdinal,
    );
    expect(outcome.outcome).toBe('committed');
    expect(outcome.result).toMatchObject({
      kind: 'defeat',
      creditsAfter: 7,
      runStatusAfter: 'game-over',
      repairCostCredits: 0,
    });
    const durable = app.campaignStore.current!;
    expect(durable.credits).toBe(7);
    expect(durable.runStatus).toBe('game-over');
    expect(durable.missionInProgress).toBeNull();

    // The session mirrors the committed values. A Game Over run presents no
    // mission Result, so the Session Router opens the Game Over Screen once.
    app.store.dispatch({ type: 'mission/result', result: outcome.result! });
    expect(app.store.getState()?.runStatus).toBe('game-over');
    expect(app.store.getState()?.missionResult).toBeNull();
    expect(app.store.getState()?.credits).toBe(7);
    expect(app.store.getState()?.activeMission).toBe('none');
  });

  it('Set Credits: 8 then the accepted Lose Mission path takes the paid full-Repair branch exactly', async () => {
    const { app, identity } = await activeApplication();
    const { command } = createCommand(app);
    expect(await command.setCredits(8)).toEqual({ kind: 'applied' });
    expect(app.store.getState()?.credits).toBe(8);

    const outcome = await commitMissionResult(
      { ...app, content: CONTENT_CATALOGUE },
      { kind: 'defeat' },
      0,
      identity.attemptId,
      identity.missionInstanceOrdinal,
    );
    expect(outcome.outcome).toBe('committed');
    expect(outcome.result).toMatchObject({
      kind: 'defeat',
      creditsAfter: 0,
      hullIntegrityAfter: 100,
      runStatusAfter: 'active',
      repairCostCredits: 8,
    });
    const durable = app.campaignStore.current!;
    expect(durable.credits).toBe(0);
    expect(durable.hullIntegrity).toBe(100);
    expect(durable.runStatus).toBe('active');
    expect(durable.missionInProgress).toBeNull();

    // The affordable-Repair defeat presents the normal failure Result.
    app.store.dispatch({ type: 'mission/result', result: outcome.result! });
    expect(app.store.getState()?.runStatus).toBe('active');
    expect(app.store.getState()?.missionResult).toMatchObject({
      kind: 'defeat',
      repairCostCredits: 8,
    });
    expect(app.store.getState()?.credits).toBe(0);
  });
});
