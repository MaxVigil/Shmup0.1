import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE, INTERCEPTION_01 } from '@content/index';
import { V02_STARTING_CREDITS } from '@domain/index';
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

  it('commits Defeat with zero reward through the seam', async () => {
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
    expect(app.campaignStore.current?.credits).toBe(V02_STARTING_CREDITS);
    expect(app.campaignStore.current?.hullIntegrity).toBe(25);
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.store.getState()?.missionResult).toEqual({
      kind: 'defeat',
      missionInstanceOrdinal: 0,
      creditsEarned: 0,
    });
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
