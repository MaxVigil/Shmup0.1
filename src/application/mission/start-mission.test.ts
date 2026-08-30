import { describe, expect, it } from 'vitest';
import {
  CONTENT_CATALOGUE,
  INTERCEPTION_02,
  INTERCEPTION_03,
} from '@content/index';
import { contentCatalogueWith } from '@test-support/content';
import { COMBAT_MISSION_STREAM, deriveStreamSeed } from '@domain/index';
import { createSessionStore } from '../session';
import { createInitializedTestApplication } from '@test-support/persistence';
import { SEAM_MISSION_ID } from './compatibility-seam';
import { startMission } from './start-mission';

describe('startMission (Epic §13.2, V02-AC-020)', () => {
  it('persists missionInProgress before Combat and records one immutable Mission Snapshot', async () => {
    const app = createInitializedTestApplication();
    const result = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(result.kind).toBe('accepted');
    if (result.kind !== 'accepted') {
      throw new Error('Expected an accepted start.');
    }
    // The durable marker was persisted before the session entered Combat. The
    // campaign-owned attempt id 0 is allocated atomically by the transaction.
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });
    expect(result.snapshot).toMatchObject({
      missionId: SEAM_MISSION_ID,
      missionInstanceOrdinal: 0,
      missionAttemptId: 0,
      combatMissionSeed: deriveStreamSeed(3735928559, COMBAT_MISSION_STREAM, 0),
      aircraftId: 'german-fighter',
      hullIntegrity: 100,
      equippedWeapon: 'machine-gun',
      mouseMovementEnabled: true,
    });
    // The store records the active mission and increments the ordinal once.
    expect(app.store.getState()?.activeMission).toBe(result.snapshot);
    expect(app.store.getState()?.missionInstanceCount).toBe(1);
  });

  it('rejects a second start while a mission is active (Base AC-035) and persists nothing new', async () => {
    const app = createInitializedTestApplication();
    const first = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    const second = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(first.kind).toBe('accepted');
    expect(second).toEqual({
      kind: 'rejected',
      reason: 'active-mission-exists',
    });
    expect(app.store.getState()?.missionInstanceCount).toBe(1);
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });
  });

  it('captures the current damaged Hull and equipped weapon (Base AC-031, §9.4)', async () => {
    const app = createInitializedTestApplication();
    const before = app.store.getState();
    if (before === null) {
      throw new Error('Expected an initialized session.');
    }
    app.store.dispatch({
      type: 'session/new-game',
      session: { ...before, hullIntegrity: 40 },
    });
    app.store.dispatch({ type: 'session/equip-weapon', weapon: 'cannon' });
    const result = await startMission(
      {
        store: app.store,
        campaignStore: app.campaignStore,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.snapshot.hullIntegrity).toBe(40);
      expect(result.snapshot.equippedWeapon).toBe('cannon');
    }
  });

  it('rejects when no session exists', async () => {
    const store = createSessionStore();
    const app = createInitializedTestApplication();
    expect(
      await startMission(
        {
          store,
          campaignStore: app.campaignStore,
          content: CONTENT_CATALOGUE,
        },
        SEAM_MISSION_ID,
      ),
    ).toEqual({ kind: 'rejected', reason: 'no-session' });
  });

  it('rejects a mission not present in the validated registry', async () => {
    const app = createInitializedTestApplication();
    expect(
      await startMission(
        {
          store: app.store,
          campaignStore: app.campaignStore,
          content: CONTENT_CATALOGUE,
        },
        'interception-99' as never,
      ),
    ).toEqual({ kind: 'rejected', reason: 'mission-not-found' });
  });

  it('rejects an id absent from the INJECTED catalogue instead of starting the global mission (V02-WI-03 correction)', async () => {
    // The injected catalogue omits Interception 01. Selected-mission validation
    // must resolve from that injected catalogue: requesting `interception-01`
    // is rejected even though the global MISSIONS registry still contains it,
    // proving no substituted global content can start.
    const injected = contentCatalogueWith({
      missions: [INTERCEPTION_02, INTERCEPTION_03],
    });
    const app = createInitializedTestApplication(injected);
    expect(
      await startMission(
        {
          store: app.store,
          campaignStore: app.campaignStore,
          content: injected,
        },
        SEAM_MISSION_ID,
      ),
    ).toEqual({ kind: 'rejected', reason: 'mission-not-found' });
    // No marker was persisted and no session mutation occurred.
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionInstanceCount).toBe(0);
  });

  it('rejects a locked mission before the mission-start transaction (Epic §6.1)', async () => {
    const app = createInitializedTestApplication();
    expect(
      await startMission(
        {
          store: app.store,
          campaignStore: app.campaignStore,
          content: CONTENT_CATALOGUE,
        },
        'interception-02',
      ),
    ).toEqual({ kind: 'rejected', reason: 'mission-not-available' });
    // No marker was persisted and no session mutation occurred.
    expect(app.campaignStore.current?.missionInProgress).toBeNull();
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionInstanceCount).toBe(0);
  });

  it('reports persist-failed without entering Combat when the transaction cannot write', async () => {
    const app = createInitializedTestApplication();
    const failing = {
      ...app.campaignStore,
      update: async () => ({ kind: 'missing' }) as const,
    } as unknown as Parameters<typeof startMission>[0]['campaignStore'];
    const result = await startMission(
      {
        store: app.store,
        campaignStore: failing,
        content: CONTENT_CATALOGUE,
      },
      SEAM_MISSION_ID,
    );
    expect(result).toEqual({ kind: 'rejected', reason: 'persist-failed' });
    // Combat never became active and no reward/progression changed.
    expect(app.store.getState()?.activeMission).toBe('none');
    expect(app.store.getState()?.missionInstanceCount).toBe(0);
  });
});
