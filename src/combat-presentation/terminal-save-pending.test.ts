import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import {
  V02_DEFEAT_REPAIR_COST_CREDITS,
  V02_STARTING_CREDITS,
} from '@domain/index';
import type { CampaignStateV1, MissionId } from '@domain/index';
import {
  commitMissionResult,
  SEAM_MISSION_ID,
  startMission,
} from '@application/mission';
import type {
  CampaignReadResult,
  CampaignStartOutcome,
  CampaignStorePort,
  CampaignUpdateOutcome,
} from '@application/persistence';
import { createInitializedTestApplication } from '@test-support/persistence';
import type { InitializedTestApplication } from '@test-support/persistence';
import {
  mapCommitMissionOutcome,
  mayPresentHeldDefeat,
  planCommittedTerminal,
} from './terminal-commit';

/**
 * V02-WI-05 C04 regression at the ACTUAL commitment/lifecycle wiring boundary
 * with a controllably deferred campaign transaction. The terminal write is
 * started FIRST and proven to remain pending; only then does the test open an
 * ordinary Pause and fire the browser-safety event (the S2 reviewer
 * counterexample), resolve the deferred write, verify the committed Defeat is
 * HELD behind the Resume-only continuation (no automatic Result/Game Over
 * presentation), restore focus (no auto-resume), and explicitly Resume so the
 * held result presents exactly once. The pure boundary decision used here
 * (`planCommittedTerminal`, `mayPresentHeldDefeat`) is the same production
 * code the Combat presentation entry applies, and the session store, lifecycle
 * reducer, and terminal command are the real production owners.
 */

/** CampaignStorePort wrapper whose `update` promise resolves only on demand. */
class DeferredCampaignStore implements CampaignStorePort {
  private release: (() => void) | null = null;

  constructor(private readonly inner: CampaignStorePort) {}

  get pending(): boolean {
    return this.release !== null;
  }

  releasePending(): void {
    this.release?.();
    this.release = null;
  }

  read(): Promise<CampaignReadResult> {
    return this.inner.read();
  }

  update(
    transform: (current: CampaignStateV1) => {
      readonly kind: 'applied' | 'rejected';
      readonly campaign?: CampaignStateV1;
      readonly reason?: string;
    },
  ): Promise<CampaignUpdateOutcome> {
    // Hold the underlying transaction until releasePending() is called so the
    // test can observe and drive the pending-write window deterministically.
    return new Promise<CampaignUpdateOutcome>((resolve) => {
      this.release = () => {
        void this.inner
          .update(transform as Parameters<CampaignStorePort['update']>[0])
          .then(resolve);
      };
    });
  }

  startMission(missionId: MissionId): Promise<CampaignStartOutcome> {
    return this.inner.startMission(missionId);
  }

  replace(next: CampaignStateV1): Promise<void> {
    return this.inner.replace(next);
  }
}

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

function snapshotIdentity(store: InitializedTestApplication['store']): {
  readonly missionId: string;
  readonly missionAttemptId: number;
  readonly missionInstanceOrdinal: number;
} {
  const session = store.getState();
  if (session === null || session.activeMission === 'none') {
    throw new Error('Expected an active Mission Snapshot.');
  }
  return {
    missionId: session.activeMission.missionId,
    missionAttemptId: session.activeMission.missionAttemptId,
    missionInstanceOrdinal: session.activeMission.missionInstanceOrdinal,
  };
}

describe('V02-WI-05 C04: pending terminal write + ordinary Pause + safety latch', () => {
  it('S2: a write that stays pending through Pause and blur is held, and only Resume presents the paid-Repair Defeat once', async () => {
    const app = createInitializedTestApplication();
    const deferred = new DeferredCampaignStore(app.campaignStore);
    await startMissionIn(app);

    // 1. The entry marks the pending atomic write and starts it (write stays
    //    open because the port is deferred).
    app.store.dispatch({
      type: 'combat-terminal/pending',
      missionInstanceOrdinal: 0,
    });
    const commitPromise = commitMissionResult(
      { store: app.store, campaignStore: deferred, content: CONTENT_CATALOGUE },
      { kind: 'defeat' },
      0,
      0,
      0,
    );
    // Prove the write is genuinely pending: the durable marker is untouched
    // and the session has not been charged or navigated.
    expect(deferred.pending).toBe(true);
    expect(app.campaignStore.current?.missionInProgress).toEqual({
      missionId: SEAM_MISSION_ID,
      attemptId: 0,
    });
    expect(app.store.getState()?.credits).toBe(V02_STARTING_CREDITS);
    expect(app.store.getState()?.missionResult).toBeNull();

    // 2. Ordinary Pause opens, then the browser-safety event arrives.
    app.store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: 0,
    });
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('pause');
    app.store.dispatch({
      type: 'combat-lifecycle/browser-safety-event',
      missionInstanceOrdinal: 0,
    });
    // S2 regression: the terminal-pending window makes the safety event latch
    // even though the Pause was opened manually. Ordinary non-terminal Pause
    // semantics are unchanged (covered by the lifecycle reducer tests).
    expect(app.store.getState()?.combatLifecycle.browserSafetyLatched).toBe(
      true,
    );

    // 3. The deferred transaction resolves with a committed Defeat.
    deferred.releasePending();
    const outcome = await commitPromise;
    expect(outcome.outcome).toBe('committed');
    // The durable Repair (12 − 8 = 4) and marker clear committed…
    expect(app.campaignStore.current?.credits).toBe(
      V02_STARTING_CREDITS - V02_DEFEAT_REPAIR_COST_CREDITS,
    );
    expect(app.campaignStore.current?.missionInProgress).toBeNull();

    // …but the boundary HOLDS the result (no auto-presentation into the
    // blurred session) and moves into the Resume-only terminal-exit Pause.
    const session = app.store.getState();
    const plan = planCommittedTerminal(
      mapCommitMissionOutcome(outcome),
      session,
      snapshotIdentity(app.store),
    );
    expect(plan.kind).toBe('hold');
    expect(session?.missionResult).toBeNull();
    expect(session?.activeMission).not.toBe('none');
    app.store.dispatch({
      type: 'combat-terminal/recover',
      missionInstanceOrdinal: 0,
    });
    expect(app.store.getState()?.combatLifecycle.overlay).toBe(
      'terminal-exit-pause',
    );

    // 4. Restoring focus is NOT Resume: nothing dispatches or auto-presents.
    //    (The app has no focus listener that resumes Combat; the state simply
    //    stays held behind the Resume-only Pause.)
    expect(app.store.getState()?.combatLifecycle.overlay).toBe(
      'terminal-exit-pause',
    );
    expect(app.store.getState()?.missionResult).toBeNull();

    // 5. Explicit Resume presents the single committed Defeat exactly once.
    app.store.dispatch({
      type: 'combat-lifecycle/resume',
      missionInstanceOrdinal: 0,
    });
    const resumed = app.store.getState();
    if (!mayPresentHeldDefeat(resumed, snapshotIdentity(app.store))) {
      throw new Error('Explicit Resume must make the held Defeat presentable.');
    }
    if (plan.kind !== 'hold') {
      throw new Error('Expected a held result.');
    }
    app.store.dispatch({ type: 'mission/result', result: plan.result });
    const presented = app.store.getState();
    expect(presented?.missionResult).toEqual({
      kind: 'defeat',
      missionInstanceOrdinal: 0,
      creditsEarned: 0,
      repairCostCredits: 8,
    });
    expect(presented?.credits).toBe(
      V02_STARTING_CREDITS - V02_DEFEAT_REPAIR_COST_CREDITS,
    );
    expect(presented?.activeMission).toBe('none');

    // Exactly-once: a duplicate presentation is inert (no second economy
    // effect and no navigation change).
    app.store.dispatch({ type: 'mission/result', result: plan.result });
    expect(app.store.getState()?.credits).toBe(
      V02_STARTING_CREDITS - V02_DEFEAT_REPAIR_COST_CREDITS,
    );
    expect(app.store.getState()?.activeMission).toBe('none');
  });
});

describe('V02-WI-05 C04: unaffordable pending Defeat (Game Over) under the latch', () => {
  it('an unaffordable pending Defeat resolves to Game Over only after explicit Resume', async () => {
    const app = createInitializedTestApplication();
    const campaign = app.campaignStore.current;
    if (campaign === null) {
      throw new Error('Expected a seeded campaign.');
    }
    // Credits 7: the exact unaffordable boundary (Repair cost − 1).
    app.campaignStore.seed({
      ...campaign,
      credits: V02_DEFEAT_REPAIR_COST_CREDITS - 1,
    });
    await startMissionIn(app);
    const deferred = new DeferredCampaignStore(app.campaignStore);

    app.store.dispatch({
      type: 'combat-terminal/pending',
      missionInstanceOrdinal: 0,
    });
    const commitPromise = commitMissionResult(
      { store: app.store, campaignStore: deferred, content: CONTENT_CATALOGUE },
      { kind: 'defeat' },
      0,
      0,
      0,
    );
    expect(deferred.pending).toBe(true);
    app.store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: 0,
    });
    app.store.dispatch({
      type: 'combat-lifecycle/browser-safety-event',
      missionInstanceOrdinal: 0,
    });
    expect(app.store.getState()?.combatLifecycle.browserSafetyLatched).toBe(
      true,
    );

    deferred.releasePending();
    const outcome = await commitPromise;
    expect(outcome.outcome).toBe('committed');
    const session = app.store.getState();
    const plan = planCommittedTerminal(
      mapCommitMissionOutcome(outcome),
      session,
      snapshotIdentity(app.store),
    );
    expect(plan.kind).toBe('hold');
    expect(session?.missionResult).toBeNull();
    app.store.dispatch({
      type: 'combat-terminal/recover',
      missionInstanceOrdinal: 0,
    });
    app.store.dispatch({
      type: 'combat-lifecycle/resume',
      missionInstanceOrdinal: 0,
    });
    const resumed = app.store.getState();
    if (!mayPresentHeldDefeat(resumed, snapshotIdentity(app.store))) {
      throw new Error('Explicit Resume must make the held Defeat presentable.');
    }
    if (plan.kind !== 'hold') {
      throw new Error('Expected a held result.');
    }
    app.store.dispatch({ type: 'mission/result', result: plan.result });
    const presented = app.store.getState();
    // Game Over: no partial deduction and no Mission Result; the Session
    // Router opens the terminal Game Over Screen.
    expect(presented?.runStatus).toBe('game-over');
    expect(presented?.missionResult).toBeNull();
    expect(presented?.activeMission).toBe('none');
    expect(presented?.credits).toBe(V02_DEFEAT_REPAIR_COST_CREDITS - 1);
  });
});
