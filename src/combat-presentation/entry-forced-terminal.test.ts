import { expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import type { InitializedTestApplication } from '@test-support/persistence';
import { startMission, commitMissionResult } from '@application/mission';
import type { CombatSession, CombatSessionInput } from '@application/combat';
import type { SessionStore } from '@application/session';
import { V02_DEFEAT_REPAIR_COST_CREDITS } from '@domain/index';
import { mapCommitMissionOutcome } from './terminal-commit';

// Substitute ONLY the Phaser renderer, exactly like the accepted V02-WI-05 C05
// chain regression: the real Combat entry orchestration, deterministic
// simulation runtime, HUD bridge, session store, lifecycle reducer, and
// campaign command remain the submitted production code. The terminal commit
// port is controllably deferred through the captured `onComplete` callbacks, so
// the real forced Debug terminal -> pending atomic write -> committed exit ->
// session result chain can be driven deterministically.
const renderer = vi.hoisted(() => ({
  advanceFrame: (seconds: number) => {
    void seconds;
  },
}));

vi.mock('./phaser/combat-game', () => ({
  createCombatGame: (
    _container: unknown,
    input: { advanceFrame: (seconds: number) => void },
  ) => {
    renderer.advanceFrame = input.advanceFrame;
    return { destroy: vi.fn(), scale: { resize: vi.fn() } };
  },
}));
vi.mock('./phaser/combat-scene', () => ({ CombatScene: class {} }));

import { createCombatSession } from './entry';

interface ForcedTerminalHarness {
  readonly app: InitializedTestApplication;
  readonly owner: CombatSession;
  readonly calls: Parameters<CombatSessionInput['commitTerminalResult']>[];
  readonly dispatch: (
    type: Parameters<SessionStore['dispatch']>[0]['type'],
  ) => void;
  readonly dispose: () => void;
}

/**
 * V02-WI-07 D01 forced-terminal integration harness (Epic §13.3–13.7, §17,
 * V02-AC-014/015/016/020/023/026): one real Combat owner over a real campaign
 * transaction, with only the Phaser renderer substituted.
 */
async function createForcedTerminalHarness(
  credits = 12,
): Promise<ForcedTerminalHarness> {
  const app = createInitializedTestApplication();
  app.campaignStore.seed({
    ...(app.campaignStore.current as NonNullable<
      InitializedTestApplication['campaignStore']['current']
    >),
    credits,
  });
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
    },
  });
  const dispatch = (
    type: Parameters<SessionStore['dispatch']>[0]['type'],
  ): void => {
    app.store.dispatch({
      type,
      missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
    } as Parameters<SessionStore['dispatch']>[0]);
  };
  return {
    app,
    owner,
    calls,
    dispatch,
    dispose: () => {
      owner.dispose();
      container.remove();
    },
  };
}

/** Resolves the captured terminal commit through the REAL campaign command. */
async function resolveCapturedTerminal(
  harness: ForcedTerminalHarness,
  index: number,
  expected: 'committed' | 'inert' = 'committed',
): Promise<void> {
  const call = harness.calls[index];
  if (call === undefined) {
    throw new Error('Expected a captured terminal commit.');
  }
  const outcome = await commitMissionResult(
    { ...harness.app, content: CONTENT_CATALOGUE },
    call[0],
    call[1],
    call[2],
    call[3],
    call[4],
  );
  expect(outcome.outcome).toBe(expected);
  call[5]?.(mapCommitMissionOutcome(outcome));
}

/** Advances the deterministic exit/frame pipeline until it stops changing. */
function advanceFrames(frames: number): void {
  for (let index = 0; index < frames; index += 1) {
    renderer.advanceFrame(1 / 60);
  }
}

it('forced Success closes Debug and presents the committed result only after the shared exit completes (Epic §13.3/§13.7, V02-AC-023/026)', async () => {
  const harness = await createForcedTerminalHarness();
  try {
    harness.dispatch('combat-lifecycle/open-debug');
    harness.owner.submitDebugCommand({ type: 'combat-debug/win-mission' });

    // The forced Success enters the real terminal relay: exactly one pending
    // atomic write with the authoritative Success terminal and frozen economy.
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]![0]).toEqual({ kind: 'success' });
    expect(harness.calls[0]![4]).toEqual({
      combatRewards: 0,
      escapePenalties: 0,
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
    });
    expect(harness.app.store.getState()?.missionResult).toBeNull();

    await resolveCapturedTerminal(harness, 0);
    // The Debug Overlay was closed through the authoritative lifecycle so the
    // committed centre-and-up exit can run, and no result is presented yet.
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(harness.app.store.getState()?.missionResult).toBeNull();

    advanceFrames(150);
    const presented = harness.app.store.getState();
    expect(presented?.missionResult).toMatchObject({
      kind: 'success',
      creditsEarned: 8,
      newlyUnlockedMissionId: 'interception-02',
    });
    // The session mirrors the durable pre-committed campaign values.
    expect(presented?.credits).toBe(20);
    expect(presented?.completedMissionIds).toContain('interception-01');
    expect(presented?.unlockedMissionIds).toContain('interception-02');
    // Created exactly once and never replayed on further frames.
    expect(harness.calls).toHaveLength(1);
    advanceFrames(30);
    expect(harness.app.store.getState()?.missionResult).toMatchObject({
      kind: 'success',
    });
    expect(harness.calls).toHaveLength(1);
  } finally {
    harness.dispose();
  }
});

it('forced Evacuation closes Debug and commits the same frozen Evacuation result as a natural one (Epic §13.4/§13.7, V02-AC-015/023/026)', async () => {
  const harness = await createForcedTerminalHarness();
  try {
    harness.dispatch('combat-lifecycle/open-debug');
    harness.owner.submitDebugCommand({
      type: 'combat-debug/evacuate-mission',
    });

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]![0]).toEqual({ kind: 'evacuated' });
    const frozenEconomy = harness.calls[0]![4];
    if (frozenEconomy === undefined) {
      throw new Error('Expected the frozen economy relay.');
    }
    // The entry relays the authoritative Combat economy; it never computes the
    // result or the retention itself.
    const netCombat = Math.max(
      0,
      frozenEconomy.combatRewards - frozenEconomy.escapePenalties,
    );

    await resolveCapturedTerminal(harness, 0);
    // Identical browser-safe continuation: Debug closed, exit authorized, no
    // result before the Aircraft's complete bounds leave the viewport.
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(harness.app.store.getState()?.missionResult).toBeNull();

    advanceFrames(150);
    const presented = harness.app.store.getState();
    expect(presented?.missionResult).toMatchObject({
      kind: 'evacuated',
      creditsEarned: Math.floor(netCombat * 0.5),
      combatRewards: frozenEconomy.combatRewards,
      escapePenalties: frozenEconomy.escapePenalties,
    });
    // Evacuation grants no completion and no unlock in the durable session.
    expect(presented?.completedMissionIds).not.toContain('interception-01');
    expect(presented?.unlockedMissionIds).toEqual(['interception-01']);
    expect(harness.calls).toHaveLength(1);
  } finally {
    harness.dispose();
  }
});

// V02-WI-07 D01-C01: the forced terminal enters the shared commit path from the
// Debug-close boundary, so every save disposition needs direct cross-boundary
// evidence rather than inheriting natural-Evacuation assumptions.
for (const disposition of ['failed', 'rejected'] as const) {
  it(`forced Evacuation with a ${disposition} write stays frozen in Save Error and Retry reuses the exact payload (Epic §13.7, V02-AC-020)`, async () => {
    const harness = await createForcedTerminalHarness();
    try {
      harness.dispatch('combat-lifecycle/open-debug');
      harness.owner.submitDebugCommand({
        type: 'combat-debug/evacuate-mission',
      });
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0]![0]).toEqual({ kind: 'evacuated' });

      const failure =
        disposition === 'failed'
          ? ({ status: 'failed' } as const)
          : ({
              status: 'rejected',
              error: new Error('Controlled rejection'),
            } as const);
      const first = harness.calls[0]!;
      first[5]?.(failure);
      // Save Error is the only continuation; Combat stays frozen and the
      // committed exit never advances or presents a result.
      expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe(
        'save-error',
      );
      expect(harness.app.store.getState()?.missionResult).toBeNull();
      expect(harness.app.store.getState()?.activeMission).not.toBe('none');
      advanceFrames(150);
      expect(harness.app.store.getState()?.missionResult).toBeNull();
      expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe(
        'save-error',
      );

      // Retry Save is single-flight and reuses the EXACT immutable payload.
      harness.owner.retryTerminalSave();
      harness.owner.retryTerminalSave();
      expect(harness.calls).toHaveLength(2);
      expect(harness.calls[1]!.slice(0, 5)).toEqual(first.slice(0, 5));
      expect(harness.calls[1]![0]).toEqual({ kind: 'evacuated' });

      // A repeated failure keeps Save Error open (no second result, no exit).
      harness.calls[1]![5]?.(failure);
      expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe(
        'save-error',
      );
      advanceFrames(60);
      expect(harness.app.store.getState()?.missionResult).toBeNull();

      // The successful retry authorizes the shared committed exit exactly once
      // and presents the frozen Evacuated result.
      harness.owner.retryTerminalSave();
      expect(harness.calls).toHaveLength(3);
      expect(harness.calls[2]!.slice(0, 5)).toEqual(first.slice(0, 5));
      await resolveCapturedTerminal(harness, 2);
      advanceFrames(150);
      expect(harness.app.store.getState()?.missionResult).toMatchObject({
        kind: 'evacuated',
      });
      expect(harness.calls).toHaveLength(3);
    } finally {
      harness.dispose();
    }
  });
}

it('an inert forced Evacuation opens Save Conflict with no exit and no result (Epic §13.7, V02-AC-020)', async () => {
  const harness = await createForcedTerminalHarness();
  try {
    harness.dispatch('combat-lifecycle/open-debug');
    harness.owner.submitDebugCommand({
      type: 'combat-debug/evacuate-mission',
    });
    expect(harness.calls).toHaveLength(1);

    // Durable authority changes while the write is pending: the real command
    // reports inert (no-change), which is Save Conflict — never a result.
    const current = harness.app.campaignStore.current;
    if (current === null) {
      throw new Error('Expected a seeded campaign record.');
    }
    harness.app.campaignStore.seed({ ...current, missionInProgress: null });

    await resolveCapturedTerminal(harness, 0, 'inert');
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe(
      'save-conflict',
    );
    expect(harness.app.store.getState()?.missionResult).toBeNull();
    expect(harness.app.store.getState()?.activeMission).not.toBe('none');
    // No exit may advance and no further write may be attempted automatically.
    advanceFrames(150);
    expect(harness.app.store.getState()?.missionResult).toBeNull();
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe(
      'save-conflict',
    );
    expect(harness.calls).toHaveLength(1);
  } finally {
    harness.dispose();
  }
});

it('a forced Evacuation committed under the browser-safety latch waits behind the Resume-only pause (Epic §13.7, V02-AC-019/020)', async () => {
  const harness = await createForcedTerminalHarness();
  try {
    harness.dispatch('combat-lifecycle/open-debug');
    harness.owner.submitDebugCommand({
      type: 'combat-debug/evacuate-mission',
    });
    expect(harness.calls).toHaveLength(1);
    // The entry closed Debug through the authoritative lifecycle; an ordinary
    // Pause plus a browser-safety event then latches manual Resume.
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe('none');
    harness.dispatch('combat-lifecycle/open-pause');
    harness.dispatch('combat-lifecycle/browser-safety-event');
    expect(
      harness.app.store.getState()?.combatLifecycle.browserSafetyLatched,
    ).toBe(true);

    await resolveCapturedTerminal(harness, 0);
    // Committed, but held: the Resume-only terminal-exit Pause, no result, and
    // no exit progress while it is frozen.
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe(
      'terminal-exit-pause',
    );
    expect(harness.app.store.getState()?.missionResult).toBeNull();
    advanceFrames(150);
    expect(harness.app.store.getState()?.missionResult).toBeNull();
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe(
      'terminal-exit-pause',
    );

    // Explicit Resume is the only discharge: the committed exit then completes
    // and presents the frozen Evacuated result exactly once.
    harness.dispatch('combat-lifecycle/resume');
    expect(harness.app.store.getState()?.combatLifecycle.overlay).toBe('none');
    advanceFrames(150);
    expect(harness.app.store.getState()?.missionResult).toMatchObject({
      kind: 'evacuated',
    });
    expect(harness.calls).toHaveLength(1);
    advanceFrames(60);
    expect(harness.calls).toHaveLength(1);
    expect(harness.app.store.getState()?.missionResult).toMatchObject({
      kind: 'evacuated',
    });
  } finally {
    harness.dispose();
  }
});

it('forced Defeat presents through the unchanged Defeat/Game Over boundary (Epic §12.4/§13.5, V02-AC-016/026)', async () => {
  const affordable = await createForcedTerminalHarness(12);
  try {
    affordable.dispatch('combat-lifecycle/open-debug');
    affordable.owner.submitDebugCommand({ type: 'combat-debug/lose-mission' });
    expect(affordable.calls).toHaveLength(1);
    expect(affordable.calls[0]![0]).toEqual({ kind: 'defeat' });
    // The authoritative Combat Hull is 0 before the normal Defeat relay; the
    // paid full-Repair economy is owned by the campaign transaction.
    expect(affordable.calls[0]![1]).toBe(0);
    await resolveCapturedTerminal(affordable, 0);
    const presented = affordable.app.store.getState();
    expect(presented?.missionResult).toMatchObject({
      kind: 'defeat',
      creditsEarned: 0,
      repairCostCredits: V02_DEFEAT_REPAIR_COST_CREDITS,
    });
    // The atomic campaign transaction deducted the full Repair and restored
    // Hull; the session mirrors those pre-committed values exactly once.
    expect(presented?.credits).toBe(12 - V02_DEFEAT_REPAIR_COST_CREDITS);
    expect(presented?.runStatus).toBe('active');
    expect(presented?.hullIntegrity).toBe(100);
    expect(affordable.calls).toHaveLength(1);
  } finally {
    affordable.dispose();
  }

  // Credits strictly below the Repair cost: no partial repair, Game Over.
  const unaffordable = await createForcedTerminalHarness(
    V02_DEFEAT_REPAIR_COST_CREDITS - 1,
  );
  try {
    unaffordable.dispatch('combat-lifecycle/open-debug');
    unaffordable.owner.submitDebugCommand({
      type: 'combat-debug/lose-mission',
    });
    await resolveCapturedTerminal(unaffordable, 0);
    const state = unaffordable.app.store.getState();
    expect(state?.missionResult).toBeNull();
    expect(state?.runStatus).toBe('game-over');
    expect(state?.activeMission).toBe('none');
  } finally {
    unaffordable.dispose();
  }
});
