import { describe, expect, it, vi } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import { startMission, SEAM_MISSION_ID } from '@application/mission';
import { createCombatGame } from '@combat-presentation/phaser/combat-game';
import type { CombatSessionInput } from '@application/combat';
import type { SessionStore } from '@application/session';

const combatRuntimeSpies = vi.hoisted(() => ({
  runtimes: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    setPaused: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@combat-presentation/phaser/combat-game', () => ({
  createCombatGame: vi.fn(),
}));

vi.mock('@combat-presentation/phaser/combat-scene', () => ({
  CombatScene: class {},
}));

vi.mock('@application/combat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@application/combat')>();
  return {
    ...actual,
    createCombatSimulationRuntime: vi.fn(
      (options: Parameters<typeof actual.createCombatSimulationRuntime>[0]) => {
        const runtime = actual.createCombatSimulationRuntime(options);
        const dispose = vi.fn(() => runtime.dispose());
        const setPaused = vi.fn((paused: boolean) => runtime.setPaused(paused));
        const wrapped = { ...runtime, dispose, setPaused };
        combatRuntimeSpies.runtimes.push({ dispose, setPaused });
        return wrapped;
      },
    ),
  };
});

import { createCombatSession } from './entry';

type Unsubscribe = () => void;

async function buildInput(): Promise<{
  input: CombatSessionInput;
  container: HTMLElement;
  store: SessionStore;
  capturedUnsubscribe: { fn: Unsubscribe | null };
}> {
  const app = createInitializedTestApplication();
  const started = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    SEAM_MISSION_ID,
  );
  if (started.kind !== 'accepted') {
    throw new Error('Expected the mission to start.');
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const capturedUnsubscribe: { fn: Unsubscribe | null } = { fn: null };
  const originalSubscribe = app.store.subscribe.bind(app.store);
  app.store.subscribe = ((listener: () => void) => {
    const unsubscribe = originalSubscribe(listener);
    capturedUnsubscribe.fn = vi.fn(unsubscribe) as Unsubscribe;
    return capturedUnsubscribe.fn;
  }) as SessionStore['subscribe'];
  return {
    input: {
      snapshot: started.snapshot,
      preparedAssets: [],
      container,
      weapon: CONTENT_CATALOGUE.weapons[0],
      projectile: CONTENT_CATALOGUE.projectile,
      mission: CONTENT_CATALOGUE.missions[0],
      enemies: CONTENT_CATALOGUE.enemies,
      playerMaximumHullIntegrity: 100,
      store: app.store,
      debugMode: true,
      commitTerminalResult: vi.fn(),
      abortMission: vi.fn(),
    } as CombatSessionInput,
    container,
    store: app.store,
    capturedUnsubscribe,
  };
}

function clearDevSurface(): void {
  delete (window as Window & { __shmupDevObservability__?: unknown })
    .__shmupDevObservability__;
}
describe('createCombatSession transactional construction (V02-DEC-031 C01)', () => {
  it('a game-construction throw after resource acquisition rolls back every acquired owner exactly once and leaves no late callbacks', async () => {
    const { input, container, store, capturedUnsubscribe } = await buildInput();
    (createCombatGame as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('controlled Phaser owner failure');
    });
    combatRuntimeSpies.runtimes.length = 0;

    expect(() => createCombatSession(input)).toThrow(
      'controlled Phaser owner failure',
    );

    // HUD bridge DOM and any canvas are gone; the container is empty.
    expect(container.childElementCount).toBe(0);
    expect(container.querySelector('.ds-combat-hud')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    // Development observability window surface was removed.
    expect(
      (window as Window & { __shmupDevObservability__?: unknown })
        .__shmupDevObservability__,
    ).toBeUndefined();
    // Runtime cleanup and store unsubscription ran exactly once.
    expect(combatRuntimeSpies.runtimes).toHaveLength(1);
    expect(combatRuntimeSpies.runtimes[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(capturedUnsubscribe.fn).not.toBeNull();
    expect(capturedUnsubscribe.fn).toHaveBeenCalledTimes(1);

    // No late callbacks: a store dispatch after rollback must not reach the
    // released runtime/lifecycle subscriber.
    const pausedCallsAfterFailure =
      combatRuntimeSpies.runtimes[0]?.setPaused.mock.calls.length ?? 0;
    store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
    });
    expect(
      combatRuntimeSpies.runtimes[0]?.setPaused.mock.calls.length ?? 0,
    ).toBe(pausedCallsAfterFailure);
    clearDevSurface();
  });

  it('keeps successful construction/dispose release and idempotency unchanged', async () => {
    const { input, container, capturedUnsubscribe } = await buildInput();
    const destroy = vi.fn();
    const resize = vi.fn();
    (createCombatGame as ReturnType<typeof vi.fn>).mockReturnValue({
      destroy,
      scale: { resize },
    });
    combatRuntimeSpies.runtimes.length = 0;

    const session = createCombatSession(input);
    expect(container.querySelector('.ds-combat-hud')).not.toBeNull();
    session.dispose();
    expect(container.childElementCount).toBe(0);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(combatRuntimeSpies.runtimes[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(capturedUnsubscribe.fn).toHaveBeenCalledTimes(1);
    expect(
      (window as Window & { __shmupDevObservability__?: unknown })
        .__shmupDevObservability__,
    ).toBeUndefined();
    // dispose is idempotent: a second call releases nothing twice.
    session.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(combatRuntimeSpies.runtimes[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(capturedUnsubscribe.fn).toHaveBeenCalledTimes(1);
    clearDevSurface();
  });

  it('failed-construction rollback never removes a replacement surface installed by a newer owner', async () => {
    const { input, container, capturedUnsubscribe } = await buildInput();
    const sentinel = (): string => 'newer-owner-surface';
    (createCombatGame as ReturnType<typeof vi.fn>).mockImplementation(() => {
      // A newer valid owner replaces this owner's dev surface BEFORE the older
      // construction fails; the older rollback must leave the sentinel intact.
      (
        window as Window & { __shmupDevObservability__?: unknown }
      ).__shmupDevObservability__ = sentinel;
      throw new Error('controlled Phaser owner failure');
    });
    combatRuntimeSpies.runtimes.length = 0;

    expect(() => createCombatSession(input)).toThrow(
      'controlled Phaser owner failure',
    );

    // The newer owner's replacement surface survives...
    expect(
      (window as Window & { __shmupDevObservability__?: unknown })
        .__shmupDevObservability__,
    ).toBe(sentinel);
    // ...while every resource owned by the failed owner is released exactly
    // once (bridge DOM, runtime, and the store subscription).
    expect(container.childElementCount).toBe(0);
    expect(combatRuntimeSpies.runtimes).toHaveLength(1);
    expect(combatRuntimeSpies.runtimes[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(capturedUnsubscribe.fn).toHaveBeenCalledTimes(1);
    clearDevSurface();
  });

  it('ordinary disposal of a stale owner never removes a newer owner replacement surface', async () => {
    const { input, container, capturedUnsubscribe } = await buildInput();
    const destroy = vi.fn();
    (createCombatGame as ReturnType<typeof vi.fn>).mockReturnValue({
      destroy,
      scale: { resize: vi.fn() },
    });
    combatRuntimeSpies.runtimes.length = 0;

    const session = createCombatSession(input);
    // A newer valid owner replaces this session's dev surface; the stale
    // owner's later disposal must not delete the replacement.
    const sentinel = (): string => 'newer-owner-surface';
    (
      window as Window & { __shmupDevObservability__?: unknown }
    ).__shmupDevObservability__ = sentinel;
    session.dispose();

    expect(
      (window as Window & { __shmupDevObservability__?: unknown })
        .__shmupDevObservability__,
    ).toBe(sentinel);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(combatRuntimeSpies.runtimes[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(capturedUnsubscribe.fn).toHaveBeenCalledTimes(1);
    expect(container.childElementCount).toBe(0);
    clearDevSurface();
  });
});
