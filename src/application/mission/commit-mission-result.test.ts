import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE, INTERCEPTION_01 } from '@content/index';
import {
  V02_DEFEAT_REPAIR_COST_CREDITS,
  V02_STARTING_CREDITS,
} from '@domain/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import type { InitializedTestApplication } from '@test-support/persistence';
import { SEAM_MISSION_ID } from './compatibility-seam';
import { abortMission } from './abort-mission';
import { commitMissionResult } from './commit-mission-result';
import { startMission } from './start-mission';
import type { CampaignStorePort } from '../persistence';

async function startMissionIn(app: InitializedTestApplication): Promise<void> {
  const result = await startMission(
    {
      store: app.store,
      campaignStore: app.campaignStore,
      content: CONTENT_CATALOGUE,
    },
    SEAM_MISSION_ID,
  );
  if (result.kind !== 'accepted') {
    throw new Error('Expected an accepted persisted start.');
  }
}

function failingStore(app: InitializedTestApplication): CampaignStorePort {
  return {
    ...app.campaignStore,
    update: async () => ({ kind: 'missing' }) as const,
  } as unknown as CampaignStorePort;
}

describe('commitMissionResult (Epic §13, V02-AC-020)', () => {
  it('persists missionInProgress before Combat, then commits Success exactly once', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app);
    // The active session mission implies the persisted marker was set.
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });

    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'success' },
      80,
      0,
      0,
    );
    expect(outcome.outcome).toBe('committed');
    // V02-WI-04: a Success result is returned for the deferred exit-sequence
    // session dispatch (Epic §13.3); the test mirrors the entry's dispatch.
    if (outcome.outcome === 'committed' && outcome.result?.kind === 'success') {
      app.store.dispatch({ type: 'mission/result', result: outcome.result });
    }
    // Durable before/after: marker cleared, completion reward applied exactly
    // once, mission completed, and only Interception 02 unlocked (V02-AC-002).
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.campaignStore.current?.credits).toBe(
      V02_STARTING_CREDITS + INTERCEPTION_01.completionReward,
    );
    expect(app.campaignStore.current?.hullIntegrity).toBe(80);
    expect(app.campaignStore.current?.completedMissionIds).toEqual([
      'interception-01',
    ]);
    expect(app.campaignStore.current?.unlockedMissionIds).toEqual([
      'interception-01',
      'interception-02',
    ]);
    // Session mirrors the durable state (persist-then-session ordering).
    const session = app.store.getState();
    expect(session?.credits).toBe(
      V02_STARTING_CREDITS + INTERCEPTION_01.completionReward,
    );
    expect(session?.hullIntegrity).toBe(80);
    expect(session?.activeMission).toBe('none');
    expect(session?.completedMissionIds).toEqual(['interception-01']);
    expect(session?.unlockedMissionIds).toEqual([
      'interception-01',
      'interception-02',
    ]);
    expect(session?.missionResult).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 0,
      creditsEarned: INTERCEPTION_01.completionReward,
      completionReward: INTERCEPTION_01.completionReward,
      newlyUnlockedMissionId: 'interception-02',
    });
  });

  it('a repeated or racing terminal completion is inert and cannot duplicate the reward', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app);
    const first = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'success' },
      80,
      0,
      0,
    );
    expect(first.outcome).toBe('committed');
    const afterFirst = app.campaignStore.current?.credits;
    const second = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'success' },
      80,
      0,
      0,
    );
    expect(second.outcome).toBe('inert');
    expect(app.campaignStore.current?.credits).toBe(afterFirst);
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
  });

  it('commits Defeat with zero reward and the paid full Repair (V02-AC-016)', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app);
    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'defeat' },
      0,
      0,
      0,
    );
    expect(outcome.outcome).toBe('committed');
    // V02-WI-05 C03: the atomic transaction returns the committed immutable
    // result to the lifecycle boundary; it no longer dispatches/navigates.
    if (outcome.outcome === 'committed' && outcome.result?.kind === 'defeat') {
      expect(outcome.result).toMatchObject({
        missionInstanceOrdinal: 0,
        repairCostCredits: 8,
        runStatusAfter: 'active',
      });
    }
    // 12 starting Credits − 8 Repair cost; Hull fully restored; run stays
    // active; the marker is cleared.
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS - 8);
    expect(app.campaignStore.current?.hullIntegrity).toBe(100);
    expect(app.campaignStore.current?.runStatus).toBe('active');
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    // Mirror the entry's boundary dispatch of the committed result (the
    // command itself stays inert at the session boundary): the failure result
    // is then presented exactly once.
    if (outcome.outcome === 'committed' && outcome.result?.kind === 'defeat') {
      app.store.dispatch({ type: 'mission/result', result: outcome.result });
    }
    expect(app.store.getState()?.missionResult).toEqual({
      kind: 'defeat',
      missionInstanceOrdinal: 0,
      creditsEarned: 0,
      repairCostCredits: 8,
    });
  });

  it('does not navigate before the lifecycle boundary evaluates browser safety (V02-WI-05 C03)', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app);
    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'defeat' },
      0,
      0,
      0,
    );
    expect(outcome.outcome).toBe('committed');
    // The durable transaction committed (Repair deducted, marker cleared)…
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS - 8);
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    // …but the session was NOT navigated, rewarded, or cleared by the command:
    // Defeat presentation stays behind the boundary that evaluates the
    // browser-safety latch and holds committed results for explicit Resume.
    const session = app.store.getState();
    expect(session?.activeMission).not.toBe('none');
    expect(session?.missionResult).toBeNull();
    expect(session?.credits).toBe(V02_STARTING_CREDITS);
    expect(session?.combatLifecycle.running).toBe(true);
  });

  it('commits Game Over without any partial deduction when Credits are below the Repair cost (V02-AC-016)', async () => {
    const app = createInitializedTestApplication();
    const campaign = app.campaignStore.current;
    if (campaign === null) {
      throw new Error('Expected a seeded campaign.');
    }
    // Credits 7 = Repair cost − 1: the exact unaffordable boundary.
    app.campaignStore.seed({
      ...campaign,
      credits: V02_DEFEAT_REPAIR_COST_CREDITS - 1,
    });
    await startMissionIn(app);
    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'defeat' },
      0,
      0,
      0,
    );
    expect(outcome.outcome).toBe('committed');
    expect(app.campaignStore.current?.runStatus).toBe('game-over');
    expect(app.campaignStore.current?.credits).toBe(
      V02_DEFEAT_REPAIR_COST_CREDITS - 1,
    );
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    // Mirror the boundary dispatch: Game Over presents no Mission Result — the
    // Session Router opens the terminal Game Over Screen instead.
    if (outcome.outcome === 'committed' && outcome.result?.kind === 'defeat') {
      expect(outcome.result).toMatchObject({
        runStatusAfter: 'game-over',
        repairCostCredits: 0,
      });
      app.store.dispatch({ type: 'mission/result', result: outcome.result });
    }
    const session = app.store.getState();
    expect(session?.runStatus).toBe('game-over');
    expect(session?.missionResult).toBeNull();
    expect(session?.activeMission).toBe('none');
  });

  it('a stale terminal for an older Mission Instance is inert', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app); // mission 0
    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'success' },
      80,
      0,
      99,
    );
    expect(outcome.outcome).toBe('inert');
    // The active mission and the persisted marker are untouched.
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });
  });

  it('is inert when no active mission remains (post-resolution duplicate)', async () => {
    const app = createInitializedTestApplication();
    expect(
      await commitMissionResult(
        {
          store: app.store,
          campaignStore: app.campaignStore,
          content: CONTENT_CATALOGUE,
        },
        { kind: 'defeat' },
        0,
        0,
        0,
      ),
    ).toMatchObject({ outcome: 'inert' });
  });

  it('a failed campaign transaction never updates the session (persist first)', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app);
    // Simulate an infrastructure failure at the port boundary.
    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: failingStore(app),
        content: CONTENT_CATALOGUE,
      },
      { kind: 'success' },
      80,
      0,
      0,
    );
    expect(outcome.outcome).toBe('failed');
    // The session keeps the active mission; nothing was rewarded or cleared.
    expect(app.store.getState()?.activeMission).not.toBe('none');
    expect(app.store.getState()?.credits).toBe(V02_STARTING_CREDITS);
    expect(app.store.getState()?.missionResult).toBeNull();
  });
});

describe('abortMission (temporary v0.1 Return to Base seam)', () => {
  it('persists the marker clear, retains Hull, and opens Operations without a Result', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app);
    const outcome = await abortMission(
      { store: app.store, campaignStore: app.campaignStore },
      55,
      0,
      0,
    );
    expect(outcome).toBe('committed');
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.campaignStore.current?.hullIntegrity).toBe(55);
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionResult).toBeNull();
  });

  it('a repeated Aborted command is inert once the marker is cleared', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app);
    await abortMission(
      { store: app.store, campaignStore: app.campaignStore },
      55,
      0,
      0,
    );
    expect(
      await abortMission(
        { store: app.store, campaignStore: app.campaignStore },
        55,
        0,
        0,
      ),
    ).toBe('inert');
    expect(app.store.getState()?.hullIntegrity).toBe(55);
  });
});

describe('V02-WI-05 C04 exact mission + attempt identity regressions', () => {
  it('live Defeat rejects a persisted marker of another mission carrying the same attempt id (V02-AC-020)', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app); // session + marker: interception-01, attempt 0
    const campaign = app.campaignStore.current;
    if (campaign === null) {
      throw new Error('Expected a seeded campaign.');
    }
    // Reviewer counterexample: the durable marker was replaced by an otherwise
    // valid unlocked Mission 02 marker with the SAME attempt id while this
    // browser session still runs Mission 01 (ordinal 0).
    app.campaignStore.seed({
      ...campaign,
      unlockedMissionIds: ['interception-01', 'interception-02'],
      missionInProgress: { missionId: 'interception-02', attemptId: 0 },
    });
    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'defeat' },
      0,
      0,
      0,
    );
    // The atomic transition rejected before any Credits/Hull/marker change,
    // so the command reports inert (the boundary maps it to Save Conflict).
    expect(outcome.outcome).toBe('inert');
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
    expect(app.campaignStore.current?.hullIntegrity).toBe(100);
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: 'interception-02',
      attemptId: 0,
    });
    // The session was not navigated or charged.
    const session = app.store.getState();
    expect(session?.activeMission).not.toBe('none');
    expect(session?.credits).toBe(V02_STARTING_CREDITS);
    expect(session?.missionResult).toBeNull();

    // The matching originating identity (Mission 01 marker, attempt 0) still
    // commits through the same atomic transaction.
    app.campaignStore.seed({
      ...app.campaignStore.current!,
      missionInProgress: { missionId: SEAM_MISSION_ID, attemptId: 0 },
    });
    const matching = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'defeat' },
      0,
      0,
      0,
    );
    expect(matching.outcome).toBe('committed');
    expect(app.campaignStore.current?.credits).toBe(
      V02_STARTING_CREDITS - V02_DEFEAT_REPAIR_COST_CREDITS,
    );
  });

  it('a same-ordinal completion with a different durable attempt id is inert before mutation (V02-AC-020)', async () => {
    const app = createInitializedTestApplication();
    await startMissionIn(app); // session snapshot attempt 0, ordinal 0
    const outcome = await commitMissionResult(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      { kind: 'defeat' },
      0,
      1, // stale caller supplies a different durable attempt id
      0,
    );
    expect(outcome.outcome).toBe('inert');
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
    expect(app.store.getState()?.activeMission).not.toBe('none');
  });
});
