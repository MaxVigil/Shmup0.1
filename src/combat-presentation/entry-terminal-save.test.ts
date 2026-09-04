import { expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import type { InitializedTestApplication } from '@test-support/persistence';
import { startMission, commitMissionResult } from '@application/mission';
import type { CombatSessionInput } from '@application/combat';
import { mapCommitMissionOutcome } from './terminal-commit';
import { V02_DEFEAT_REPAIR_COST_CREDITS } from '@domain/index';

// Substitute ONLY the Phaser renderer. The Combat entry orchestration, the
// deterministic simulation runtime, HUD bridge, session store, lifecycle
// reducer and the campaign command remain the submitted production code. The
// terminal commit port is controllably deferred through the captured
// onComplete callbacks so the real pending-write -> Pause -> browser-safety ->
// failure/rejection -> Save Error -> focus restore -> single-flight Retry ->
// committed chain can be driven deterministically (V02-WI-05 C05).
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

/**
 * Real-entry terminal-save chain regression (V02-WI-05 C05): the actual Combat
 * presentation entry emits the terminal result, sets the terminal-pending
 * lifecycle state, and routes every completion through the same session store,
 * lifecycle reducer, and terminal command the shipped build uses. Only the
 * Phaser render callbacks are substituted.
 */
for (const credits of [12, 7]) {
  for (const firstOutcome of ['committed', 'failed', 'rejected'] as const) {
    it(`actual entry: Credits ${credits}, pending -> Pause -> blur -> ${firstOutcome} must require Resume and present only after it`, async () => {
      const app = createInitializedTestApplication();
      // Credits 7 is the exact unaffordable boundary (Repair cost − 1).
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
      const calls: Parameters<CombatSessionInput['commitTerminalResult']>[] =
        [];
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
        abortMission: vi.fn(),
      });
      const dispatch = (
        type: Parameters<typeof app.store.dispatch>[0]['type'],
      ) =>
        app.store.dispatch({
          type,
          missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
        } as Parameters<typeof app.store.dispatch>[0]);
      try {
        // The Debug force-defeat is the real entry path that emits the
        // authoritative terminal Defeat and begins the pending atomic write.
        dispatch('combat-lifecycle/open-debug');
        owner.submitDebugCommand({ type: 'combat-debug/lose-mission' });
        expect(calls).toHaveLength(1);
        expect(app.store.getState()?.combatLifecycle.terminalSavePending).toBe(
          true,
        );

        // Ordinary Pause opens, then the browser-safety event latches Resume.
        dispatch('combat-lifecycle/close-debug');
        dispatch('combat-lifecycle/open-pause');
        dispatch('combat-lifecycle/browser-safety-event');
        expect(app.store.getState()?.combatLifecycle.browserSafetyLatched).toBe(
          true,
        );
        expect(app.store.getState()?.missionResult).toBeNull();

        if (firstOutcome !== 'committed') {
          // Release the initial write as failed or rejected: Save Error opens
          // and MUST preserve the already-set manual-resume latch.
          calls[0]![5]?.(
            firstOutcome === 'failed'
              ? { status: 'failed' }
              : {
                  status: 'rejected',
                  error: new Error('Controlled rejection'),
                },
          );
          const afterError = app.store.getState();
          expect(afterError?.combatLifecycle.overlay).toBe('save-error');
          expect(afterError?.combatLifecycle.browserSafetyLatched).toBe(true);
          expect(afterError?.missionResult).toBeNull();

          // Restoring focus is not Resume and does not clear the latch or
          // present anything.
          window.dispatchEvent(new Event('focus'));
          expect(
            app.store.getState()?.combatLifecycle.browserSafetyLatched,
          ).toBe(true);
          expect(app.store.getState()?.missionResult).toBeNull();

          // Retry Save is single-flight and reuses the exact frozen payload.
          owner.retryTerminalSave();
          owner.retryTerminalSave();
          expect(calls).toHaveLength(2);
          expect(calls[1]!.slice(0, 5)).toEqual(calls[0]!.slice(0, 5));
        }

        // The final write resolves committed through the real campaign command.
        const call = calls.at(-1)!;
        const outcome = await commitMissionResult(
          { ...app, content: CONTENT_CATALOGUE },
          call[0],
          call[1],
          call[2],
          call[3],
          call[4],
        );
        expect(outcome.outcome).toBe('committed');
        call[5]?.(mapCommitMissionOutcome(outcome));

        // The committed Defeat/Game Over is HELD: overlay terminal-exit-pause,
        // no Mission Result, session mission still active.
        const held = app.store.getState();
        expect(held?.combatLifecycle.overlay).toBe('terminal-exit-pause');
        expect(held?.missionResult).toBeNull();
        expect(held?.activeMission).not.toBe('none');

        // Frames advance without presenting (still held behind Resume).
        renderer.advanceFrame(1 / 60);
        expect(app.store.getState()?.activeMission).not.toBe('none');
        const durableAfterCommit = structuredClone(app.campaignStore.current);

        // Explicit Resume is the only discharge: one frame later the held
        // result presents exactly once and the durable state is untouched.
        dispatch('combat-lifecycle/resume');
        renderer.advanceFrame(1 / 60);
        const presented = app.store.getState();
        expect(presented?.activeMission).toBe('none');
        if (credits >= V02_DEFEAT_REPAIR_COST_CREDITS) {
          expect(presented?.missionResult).toMatchObject({
            kind: 'defeat',
            repairCostCredits: 8,
          });
        } else {
          // Game Over: no partial deduction and no Mission Result overlay.
          expect(presented?.runStatus).toBe('game-over');
          expect(presented?.missionResult).toBeNull();
        }
        renderer.advanceFrame(1 / 60);
        expect(app.campaignStore.current).toEqual(durableAfterCommit);
        expect(calls).toHaveLength(firstOutcome === 'committed' ? 1 : 2);
      } finally {
        owner.dispose();
        container.remove();
      }
    });
  }
}
