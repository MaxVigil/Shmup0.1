import { expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import { startMission, commitMissionResult } from '@application/mission';
import type { CombatSessionInput } from '@application/combat';
import type { CombatSimulationState } from '@application/combat';
import {
  EVACUATION_COUNTDOWN_STEPS,
  EXIT_CENTRE_STEPS,
  buildEvacuationCountdownReadModel,
  evacuationCountdownDisplaySeconds,
} from '@application/combat';
import { evacuationEnemyOpacity } from '@application/combat';
import { mapCommitMissionOutcome } from './terminal-commit';

// Substitute ONLY the Phaser renderer/scene. The Combat entry orchestration,
// the real deterministic simulation runtime, the Session Store, and the E01
// lifecycle reducer are the submitted production code, so the E02 binding
// (store `evacuationCommitted` → exactly one authoritative `beginEvacuation`
// relay) is exercised end-to-end at this boundary.
const renderer = vi.hoisted(() => ({
  advanceFrame: (_seconds: number): CombatSimulationState => {
    void _seconds;
    throw new Error('advanceFrame not captured yet');
  },
}));

vi.mock('./phaser/combat-game', () => ({
  createCombatGame: (
    _container: unknown,
    input: { advanceFrame: (seconds: number) => CombatSimulationState },
  ) => {
    renderer.advanceFrame = input.advanceFrame;
    return { destroy: vi.fn(), scale: { resize: vi.fn() } };
  },
}));
vi.mock('./phaser/combat-scene', () => ({ CombatScene: class {} }));

import { createCombatSession } from './entry';

/** V02-WI-05 E02 entry-binding regression: the Combat presentation entry
 *  relays the authoritative `beginEvacuation` runtime command exactly once per
 *  Mission Instance when the store's E01 commitment fact becomes (or already
 *  is) true — never per frame, never twice, and never through React-local
 *  timing or a mutable global/test command. The countdown advances only through
 *  executed fixed steps while the authoritative lifecycle is running. */
async function buildRunningMission(): Promise<{
  app: ReturnType<typeof createInitializedTestApplication>;
  sessionInput: () => CombatSessionInput;
  container: HTMLElement;
  dispatch: (
    type:
      | 'combat-lifecycle/open-evacuation-confirmation'
      | 'combat-lifecycle/confirm-evacuation'
      | 'combat-lifecycle/browser-safety-event'
      | 'combat-lifecycle/resume',
  ) => void;
  ordinal: number;
}> {
  const app = createInitializedTestApplication();
  const start = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    'interception-01',
  );
  if (start.kind !== 'accepted') {
    throw new Error('Start failed');
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const ordinal = start.snapshot.missionInstanceOrdinal;
  const input: CombatSessionInput = {
    snapshot: start.snapshot,
    container,
    preparedAssets: [],
    weapon: CONTENT_CATALOGUE.weapons[0]!,
    projectile: CONTENT_CATALOGUE.projectile,
    mission: CONTENT_CATALOGUE.missions[0]!,
    enemies: CONTENT_CATALOGUE.enemies,
    playerMaximumHullIntegrity: 100,
    store: app.store,
    debugMode: true,
    commitTerminalResult: vi.fn(),
  };
  return {
    app,
    sessionInput: () => input,
    container,
    dispatch: (type) => {
      app.store.dispatch({
        type,
        missionInstanceOrdinal: ordinal,
      });
    },
    ordinal,
  };
}

for (const scenario of ['running', 'latched-pause'] as const) {
  it(`actual entry: Confirm from ${scenario} relays begin exactly once and the countdown advances only under the running lifecycle`, async () => {
    const { app, sessionInput, container, dispatch } =
      await buildRunningMission();
    const owner = createCombatSession(sessionInput());
    try {
      if (scenario === 'latched-pause') {
        // A browser-safety event latches manual Resume (paused + latched).
        dispatch('combat-lifecycle/browser-safety-event');
        expect(app.store.getState()?.combatLifecycle.browserSafetyLatched).toBe(
          true,
        );
      }
      dispatch('combat-lifecycle/open-evacuation-confirmation');
      expect(app.store.getState()?.combatLifecycle.overlay).toBe(
        'evacuation-confirmation',
      );
      dispatch('combat-lifecycle/confirm-evacuation');
      const committed = app.store.getState();
      expect(committed?.combatLifecycle.evacuationCommitted).toBe(true);
      // A duplicated open/confirm cannot re-begin: the E01 reducer blocks any
      // re-offer after commitment.
      dispatch('combat-lifecycle/open-evacuation-confirmation');
      dispatch('combat-lifecycle/confirm-evacuation');

      if (scenario === 'latched-pause') {
        // The commitment is recorded immediately even while the lifecycle stays
        // paused under the latch; frames must NOT decrement it.
        const frozen = renderer.advanceFrame(1 / 60) as CombatSimulationState;
        expect(frozen.evacuationStepsRemaining).toBe(
          EVACUATION_COUNTDOWN_STEPS,
        );
        expect(frozen.terminalResult).toBeNull();
        // Only explicit Resume advances the countdown (no catch-up burst).
        dispatch('combat-lifecycle/resume');
        const resumed = renderer.advanceFrame(1 / 60) as CombatSimulationState;
        expect(resumed.evacuationStepsRemaining).toBe(
          EVACUATION_COUNTDOWN_STEPS - 1,
        );
      } else {
        // Running: the next executed frame decrements exactly once (a
        // duplicated begin relay would have recorded 600 and never reach 299
        // here).
        const first = renderer.advanceFrame(1 / 60) as CombatSimulationState;
        expect(first.evacuationStepsRemaining).toBe(
          EVACUATION_COUNTDOWN_STEPS - 1,
        );
        const second = renderer.advanceFrame(1 / 60) as CombatSimulationState;
        expect(second.evacuationStepsRemaining).toBe(
          EVACUATION_COUNTDOWN_STEPS - 2,
        );
        expect(second.terminalResult).toBeNull();
      }
    } finally {
      owner.dispose();
      container.remove();
    }
  });
}

it('actual entry: an entry created after the store already contains committed=true begins exactly once', async () => {
  const { app, sessionInput, container, dispatch } =
    await buildRunningMission();
  // Commit before any Combat owner exists (initial state carries the fact).
  dispatch('combat-lifecycle/open-evacuation-confirmation');
  dispatch('combat-lifecycle/confirm-evacuation');
  expect(app.store.getState()?.combatLifecycle.evacuationCommitted).toBe(true);
  const owner = createCombatSession(sessionInput());
  try {
    const first = renderer.advanceFrame(1 / 60) as CombatSimulationState;
    expect(first.evacuationStepsRemaining).toBe(EVACUATION_COUNTDOWN_STEPS - 1);
    // Exactly one relay: the second frame decrements once more, never twice.
    const second = renderer.advanceFrame(1 / 60) as CombatSimulationState;
    expect(second.evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS - 2,
    );
  } finally {
    owner.dispose();
    container.remove();
  }
});

it('actual entry: a disposed owner never relays a late confirmation', async () => {
  const { app, sessionInput, container, dispatch } =
    await buildRunningMission();
  const owner = createCombatSession(sessionInput());
  owner.dispose();
  // The late lifecycle transition cannot reach the dead runtime/subscription.
  dispatch('combat-lifecycle/open-evacuation-confirmation');
  dispatch('combat-lifecycle/confirm-evacuation');
  expect(app.store.getState()?.combatLifecycle.evacuationCommitted).toBe(true);
  container.remove();
});

it('actual entry: a resolved Evacuation freezes once, commits through the shared boundary, and presents only after the exact exit completes', async () => {
  for (const firstOutcome of ['committed', 'failed', 'rejected'] as const) {
    const app = createInitializedTestApplication();
    const start = await startMission(
      { ...app, content: CONTENT_CATALOGUE },
      'interception-01',
    );
    if (start.kind !== 'accepted') {
      throw new Error('Start failed');
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const calls: Parameters<CombatSessionInput['commitTerminalResult']>[] = [];
    let callIndex = 0;
    const owner = createCombatSession({
      snapshot: start.snapshot,
      container,
      preparedAssets: [],
      weapon: CONTENT_CATALOGUE.weapons[0]!,
      projectile: CONTENT_CATALOGUE.projectile,
      mission: CONTENT_CATALOGUE.missions[0]!,
      enemies: CONTENT_CATALOGUE.enemies,
      playerMaximumHullIntegrity: 100,
      store: app.store,
      debugMode: true,
      commitTerminalResult: (...args) => {
        calls.push(args);
        if (firstOutcome !== 'committed' && callIndex === 0) {
          callIndex += 1;
          // The first write fails/rejects synchronously: Save Error holds the
          // SAME frozen Evacuated payload and never advances any exit. The
          // later Retry Save must reuse the exact payload identity (slice 0..5
          // equality across the calls).
          args[5]?.(
            firstOutcome === 'rejected'
              ? { status: 'rejected', error: new Error('Controlled rejection') }
              : { status: 'failed' },
          );
          return;
        }
        callIndex += 1;
        void commitMissionResult(
          { ...app, content: CONTENT_CATALOGUE },
          args[0],
          args[1],
          args[2],
          args[3],
          args[4],
        ).then((result) => {
          args[5]?.(mapCommitMissionOutcome(result));
        });
      },
    });
    const dispatch = (
      type:
        | 'combat-lifecycle/open-evacuation-confirmation'
        | 'combat-lifecycle/confirm-evacuation',
    ) =>
      app.store.dispatch({
        type,
        missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
      });
    try {
      dispatch('combat-lifecycle/open-evacuation-confirmation');
      dispatch('combat-lifecycle/confirm-evacuation');
      // Run 299 executed steps: countdown at 1, no terminal, no commit yet.
      let state: CombatSimulationState = renderer.advanceFrame(0);
      for (let index = 0; index < EVACUATION_COUNTDOWN_STEPS - 1; index += 1) {
        state = renderer.advanceFrame(1 / 60);
        expect(state.terminalResult).toBeNull();
      }
      expect(state.evacuationStepsRemaining).toBe(1);
      expect(calls).toHaveLength(0);
      // The exact 300th step resolves Evacuated and relays the frozen terminal
      // exactly once (pending write begins).
      state = renderer.advanceFrame(1 / 60);
      expect(state.terminalResult).toEqual({ kind: 'evacuated' });
      expect(calls).toHaveLength(1);

      if (firstOutcome !== 'committed') {
        // The first write fails/rejects synchronously: Save Error holds the
        // frozen terminal (the pending flag cleared with it); Retry Save reuses
        // it and commits through the real campaign command.
        expect(app.store.getState()?.combatLifecycle.overlay).toBe(
          'save-error',
        );
        expect(app.store.getState()?.combatLifecycle.terminalSavePending).toBe(
          false,
        );
        // The frozen terminal never starts any exit before the commit.
        state = renderer.advanceFrame(1 / 60);
        expect(state.exitAuthorized).toBe(false);
        expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
        owner.retryTerminalSave();
        expect(calls).toHaveLength(2);
        expect(calls[1]!.slice(0, 5)).toEqual(calls[0]!.slice(0, 5));
      } else {
        // The committed write is pending at the relay instant.
        expect(app.store.getState()?.combatLifecycle.terminalSavePending).toBe(
          true,
        );
      }
      // Let the committed write's callback settle through the real entry.
      await new Promise((resolve) => setTimeout(resolve, 0));
      state = renderer.advanceFrame(0);
      expect(state.exitAuthorized).toBe(true);
      expect(state.exitPhase).toBe('centre');
      expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
      expect(app.store.getState()?.missionResult).toBeNull();

      // Exactly 30 fade/centre steps (opacity scalar driven by the same
      // simulation-owned phase), then fly-up, then complete.
      for (let index = 1; index <= EXIT_CENTRE_STEPS; index += 1) {
        state = renderer.advanceFrame(1 / 60);
        expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS - index);
        expect(evacuationEnemyOpacity(state)).toBeCloseTo(
          (EXIT_CENTRE_STEPS - index) / EXIT_CENTRE_STEPS,
          6,
        );
      }
      expect(app.store.getState()?.missionResult).toBeNull();
      state = renderer.advanceFrame(1 / 60);
      expect(state.exitPhase).toBe('fly-up');
      let completed = false;
      for (let index = 0; index < 400; index += 1) {
        state = renderer.advanceFrame(1 / 60);
        if (state.exitPhase === 'complete') {
          completed = true;
          break;
        }
      }
      expect(completed).toBe(true);
      // The committed Evacuation result is presented only after the complete
      // rendered Aircraft bounds leave the viewport.
      expect(app.store.getState()?.activeMission).toBe('none');
      expect(app.store.getState()?.missionResult).toMatchObject({
        kind: 'evacuated',
        creditsEarned: 0,
      });
      const durable = app.campaignStore.current;
      expect(durable?.missionInProgress ?? null).toBeNull();
    } finally {
      owner.dispose();
      container.remove();
    }
  }
});
it('actual entry: an inert Evacuation write opens Save Conflict and permits no fade, centring, flight, or result presentation', async () => {
  const app = createInitializedTestApplication();
  const start = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    'interception-01',
  );
  if (start.kind !== 'accepted') {
    throw new Error('Start failed');
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const calls: Parameters<CombatSessionInput['commitTerminalResult']>[] = [];
  const owner = createCombatSession({
    snapshot: start.snapshot,
    container,
    preparedAssets: [],
    weapon: CONTENT_CATALOGUE.weapons[0]!,
    projectile: CONTENT_CATALOGUE.projectile,
    mission: CONTENT_CATALOGUE.missions[0]!,
    enemies: CONTENT_CATALOGUE.enemies,
    playerMaximumHullIntegrity: 100,
    store: app.store,
    debugMode: true,
    commitTerminalResult: (...args) => {
      calls.push(args);
      args[5]?.({ status: 'inert' });
    },
  });
  const dispatch = (
    type:
      | 'combat-lifecycle/open-evacuation-confirmation'
      | 'combat-lifecycle/confirm-evacuation',
  ) =>
    app.store.dispatch({
      type,
      missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
    });
  try {
    dispatch('combat-lifecycle/open-evacuation-confirmation');
    dispatch('combat-lifecycle/confirm-evacuation');
    let state: CombatSimulationState = renderer.advanceFrame(0);
    for (let index = 0; index < EVACUATION_COUNTDOWN_STEPS; index += 1) {
      state = renderer.advanceFrame(1 / 60);
    }
    expect(state.terminalResult).toEqual({ kind: 'evacuated' });
    expect(calls).toHaveLength(1);
    // Inert loses durable authority: blocking Save Conflict (Reload only).
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('save-conflict');
    expect(app.store.getState()?.missionResult).toBeNull();
    expect(app.store.getState()?.activeMission).not.toBe('none');
    // No fade/centring/flight may advance and no result may present.
    const frozenY = state.aircraft.centerY;
    const frozenX = state.aircraft.centerX;
    for (let index = 0; index < 60; index += 1) {
      state = renderer.advanceFrame(1 / 60);
      expect(state.exitAuthorized).toBe(false);
      expect(state.exitPhase).toBe('centre');
      expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
      expect(state.aircraft.centerY).toBe(frozenY);
      expect(state.aircraft.centerX).toBe(frozenX);
    }
    expect(app.store.getState()?.missionResult).toBeNull();
    expect(app.store.getState()?.activeMission).not.toBe('none');
  } finally {
    owner.dispose();
    container.remove();
  }
});

it('actual entry: a committed Evacuation under the browser-safety latch stays frozen until explicit Resume and then completes the shared exit exactly once', async () => {
  const app = createInitializedTestApplication();
  const start = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    'interception-01',
  );
  if (start.kind !== 'accepted') {
    throw new Error('Start failed');
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const calls: Parameters<CombatSessionInput['commitTerminalResult']>[] = [];
  const owner = createCombatSession({
    snapshot: start.snapshot,
    container,
    preparedAssets: [],
    weapon: CONTENT_CATALOGUE.weapons[0]!,
    projectile: CONTENT_CATALOGUE.projectile,
    mission: CONTENT_CATALOGUE.missions[0]!,
    enemies: CONTENT_CATALOGUE.enemies,
    playerMaximumHullIntegrity: 100,
    store: app.store,
    debugMode: true,
    commitTerminalResult: (...args) => {
      calls.push(args);
      void commitMissionResult(
        { ...app, content: CONTENT_CATALOGUE },
        args[0],
        args[1],
        args[2],
        args[3],
        args[4],
      ).then((result) => {
        args[5]?.(mapCommitMissionOutcome(result));
      });
    },
  });
  const dispatch = (
    type:
      | 'combat-lifecycle/open-evacuation-confirmation'
      | 'combat-lifecycle/confirm-evacuation'
      | 'combat-lifecycle/browser-safety-event'
      | 'combat-lifecycle/resume',
  ) =>
    app.store.dispatch({
      type,
      missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
    });
  try {
    dispatch('combat-lifecycle/open-evacuation-confirmation');
    dispatch('combat-lifecycle/confirm-evacuation');
    let state: CombatSimulationState = renderer.advanceFrame(0);
    for (let index = 0; index < EVACUATION_COUNTDOWN_STEPS; index += 1) {
      state = renderer.advanceFrame(1 / 60);
    }
    expect(state.terminalResult).toEqual({ kind: 'evacuated' });
    expect(calls).toHaveLength(1);
    // Latch while the terminal write is still pending (commit resolves after).
    dispatch('combat-lifecycle/browser-safety-event');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.store.getState()?.combatLifecycle.browserSafetyLatched).toBe(
      true,
    );
    // The committed exit is held behind the Resume-only terminal-exit Pause.
    expect(app.store.getState()?.combatLifecycle.overlay).toBe(
      'terminal-exit-pause',
    );
    expect(app.store.getState()?.missionResult).toBeNull();
    // The commit authorized the exit, but the paused lifecycle holds every
    // fade/centre step: the counter stays at 30 and the Aircraft never moves.
    state = renderer.advanceFrame(0);
    expect(state.exitAuthorized).toBe(true);
    const heldY = state.aircraft.centerY;
    const heldX = state.aircraft.centerX;
    for (let index = 0; index < 40; index += 1) {
      state = renderer.advanceFrame(1 / 60);
      expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
      expect(state.aircraft.centerY).toBe(heldY);
      expect(state.aircraft.centerX).toBe(heldX);
    }
    expect(app.store.getState()?.missionResult).toBeNull();

    // Explicit Resume is the only continuation; the exit completes exactly once.
    dispatch('combat-lifecycle/resume');
    state = renderer.advanceFrame(0);
    expect(state.exitAuthorized).toBe(true);
    for (let index = 1; index <= EXIT_CENTRE_STEPS; index += 1) {
      state = renderer.advanceFrame(1 / 60);
      expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS - index);
    }
    state = renderer.advanceFrame(1 / 60);
    expect(state.exitPhase).toBe('fly-up');
    let completed = false;
    for (let index = 0; index < 400; index += 1) {
      state = renderer.advanceFrame(1 / 60);
      if (state.exitPhase === 'complete') {
        completed = true;
        break;
      }
    }
    expect(completed).toBe(true);
    expect(app.store.getState()?.missionResult).toMatchObject({
      kind: 'evacuated',
    });
    expect(app.store.getState()?.activeMission).toBe('none');
  } finally {
    owner.dispose();
    container.remove();
  }
});

it('actual entry: a failed or rejected Evacuation write opens Save Error, Retry Save reuses the identical frozen payload, and the committed exit presents the frozen Evacuated result only after the aircraft leaves the viewport', async () => {
  const app = createInitializedTestApplication();
  const start = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    'interception-01',
  );
  if (start.kind !== 'accepted') {
    throw new Error('Start failed');
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const calls: Parameters<CombatSessionInput['commitTerminalResult']>[] = [];
  const owner = createCombatSession({
    snapshot: start.snapshot,
    container,
    preparedAssets: [],
    weapon: CONTENT_CATALOGUE.weapons[0]!,
    projectile: CONTENT_CATALOGUE.projectile,
    mission: CONTENT_CATALOGUE.missions[0]!,
    enemies: CONTENT_CATALOGUE.enemies,
    playerMaximumHullIntegrity: 100,
    store: app.store,
    debugMode: true,
    commitTerminalResult: (...args) => {
      // The real campaign command performs the atomic transaction; the entry
      // observes the typed outcome exactly as production does.
      calls.push(args);
    },
  });
  const dispatch = (type: 'combat-lifecycle/confirm-evacuation'): void => {
    app.store.dispatch({
      type,
      missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
    });
  };
  try {
    app.store.dispatch({
      type: 'combat-lifecycle/open-evacuation-confirmation',
      missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
    });
    dispatch('combat-lifecycle/confirm-evacuation');
    let state: CombatSimulationState = renderer.advanceFrame(0);
    for (let index = 0; index < EVACUATION_COUNTDOWN_STEPS; index += 1) {
      state = renderer.advanceFrame(1 / 60);
    }
    expect(state.terminalResult).toEqual({ kind: 'evacuated' });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({ kind: 'evacuated' });

    // The first write fails or rejects: frozen Combat stays behind Save Error
    // and neither the exit nor the result may begin.
    for (const firstOutcome of ['failed', 'rejected'] as const) {
      calls[0]![5]?.(
        firstOutcome === 'failed'
          ? { status: 'failed' }
          : { status: 'rejected', error: new Error('Controlled rejection') },
      );
      expect(app.store.getState()?.combatLifecycle.overlay).toBe('save-error');
      expect(app.store.getState()?.missionResult).toBeNull();
      for (let index = 0; index < 30; index += 1) {
        state = renderer.advanceFrame(1 / 60);
        expect(state.exitAuthorized).toBe(false);
        expect(state.exitPhase).toBe('centre');
        expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
      }
    }

    // Retry Save is single-flight and reuses the EXACT frozen payload/identity.
    owner.retryTerminalSave();
    owner.retryTerminalSave();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.slice(0, 5)).toEqual(calls[0]!.slice(0, 5));

    // The retry commits through the real campaign transaction.
    const retryCall = calls[1]!;
    const outcome = await commitMissionResult(
      { ...app, content: CONTENT_CATALOGUE },
      retryCall[0],
      retryCall[1],
      retryCall[2],
      retryCall[3],
      retryCall[4],
    );
    expect(outcome.outcome).toBe('committed');
    retryCall[5]?.(mapCommitMissionOutcome(outcome));
    expect(app.store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(app.store.getState()?.missionResult).toBeNull();

    // The accepted E02 shared exit runs; the immutable result appears only
    // after the Aircraft's complete bounds leave the viewport.
    state = renderer.advanceFrame(0);
    expect(state.exitAuthorized).toBe(true);
    for (let index = 1; index <= EXIT_CENTRE_STEPS; index += 1) {
      state = renderer.advanceFrame(1 / 60);
      expect(state.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS - index);
      expect(app.store.getState()?.missionResult).toBeNull();
    }
    state = renderer.advanceFrame(1 / 60);
    expect(state.exitPhase).toBe('fly-up');
    expect(app.store.getState()?.missionResult).toBeNull();
    let completed = false;
    for (let index = 0; index < 400; index += 1) {
      state = renderer.advanceFrame(1 / 60);
      if (state.exitPhase === 'complete') {
        completed = true;
        break;
      }
      expect(app.store.getState()?.missionResult).toBeNull();
    }
    expect(completed).toBe(true);

    // The presented result is the frozen Evacuation payload: retained 50% of
    // the floored net reward, frozen counts, and no completion/unlock facts.
    const presented = app.store.getState()!;
    expect(presented.activeMission).toBe('none');
    expect(presented.missionResult).not.toBeNull();
    const result = presented.missionResult!;
    expect(result.kind).toBe('evacuated');
    if (result.kind === 'evacuated') {
      expect(result.combatRewards).toBeGreaterThanOrEqual(0);
      expect(result.escapePenalties).toBeGreaterThanOrEqual(0);
      expect(result.netCombatReward).toBe(
        Math.max(0, result.combatRewards - result.escapePenalties),
      );
      expect(result.creditsEarned).toBe(
        Math.floor(Math.max(0, result.netCombatReward) * 0.5),
      );
      expect(result.destroyedCounts).toBeDefined();
      expect(result.escapedCounts).toBeDefined();
      expect(
        (result as unknown as Record<string, unknown>).newlyUnlockedMissionId,
      ).toBeUndefined();
      expect(
        (result as unknown as Record<string, unknown>).completionReward,
      ).toBeUndefined();
    }
  } finally {
    owner.dispose();
    container.remove();
  }
});

it('actual entry: Pause and Settings freeze the authoritative Evacuation countdown and explicit Resume continues it (Epic §14.4, V02-AC-014)', async () => {
  const app = createInitializedTestApplication();
  const start = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    'interception-01',
  );
  if (start.kind !== 'accepted') {
    throw new Error('Start failed');
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const ordinal = start.snapshot.missionInstanceOrdinal;
  const owner = createCombatSession({
    snapshot: start.snapshot,
    container,
    preparedAssets: [],
    weapon: CONTENT_CATALOGUE.weapons[0]!,
    projectile: CONTENT_CATALOGUE.projectile,
    mission: CONTENT_CATALOGUE.missions[0]!,
    enemies: CONTENT_CATALOGUE.enemies,
    playerMaximumHullIntegrity: 100,
    store: app.store,
    debugMode: true,
    commitTerminalResult: vi.fn(),
  });
  const dispatch = (
    type:
      | 'combat-lifecycle/open-evacuation-confirmation'
      | 'combat-lifecycle/confirm-evacuation'
      | 'combat-lifecycle/open-pause'
      | 'combat-lifecycle/resume'
      | 'combat-lifecycle/open-settings'
      | 'combat-lifecycle/close-settings',
  ): void => {
    app.store.dispatch({ type, missionInstanceOrdinal: ordinal });
  };
  try {
    dispatch('combat-lifecycle/open-evacuation-confirmation');
    dispatch('combat-lifecycle/confirm-evacuation');
    let state: CombatSimulationState = renderer.advanceFrame(0);
    for (let index = 0; index < 10; index += 1) {
      state = renderer.advanceFrame(1 / 60);
    }
    expect(state.evacuationStepsRemaining).toBe(
      EVACUATION_COUNTDOWN_STEPS - 10,
    );

    // Pause and Settings both freeze every authoritative value; the displayed
    // Evacuation Countdown therefore cannot change either.
    for (const pause of [
      'combat-lifecycle/open-pause',
      'combat-lifecycle/open-settings',
    ] as const) {
      const frozenSteps = state.evacuationStepsRemaining;
      const frozenMissionTime = state.missionTimeSeconds;
      dispatch(pause);
      for (let index = 0; index < 180; index += 1) {
        state = renderer.advanceFrame(1 / 60);
      }
      expect(state.evacuationStepsRemaining).toBe(frozenSteps);
      expect(state.missionTimeSeconds).toBe(frozenMissionTime);
      expect(state.terminalResult).toBeNull();
      expect(buildEvacuationCountdownReadModel(state).displaySeconds).toBe(
        evacuationCountdownDisplaySeconds(frozenSteps),
      );
      dispatch(
        pause === 'combat-lifecycle/open-pause'
          ? 'combat-lifecycle/resume'
          : 'combat-lifecycle/close-settings',
      );
      state = renderer.advanceFrame(1 / 60);
      expect(state.evacuationStepsRemaining).toBe(frozenSteps - 1);
    }
  } finally {
    owner.dispose();
    container.remove();
  }
});
