import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CombatSceneContext } from './combat-scene';

/**
 * V02-WI-07 D03 regression (Code Principles §9, V02-AC-027, MASTER §7.10):
 * Phaser's `VisibilityHandler` registers a `document` visibility listener that
 * no Phaser API can release, and it overwrites `window.onblur`/`window.onfocus`
 * with closures that capture the Game's event emitter. The Combat Game owner
 * must therefore capture those framework registrations while the Game starts
 * and release them with the Game.
 *
 * The fake Game reproduces only the framework's documented sequence —
 * `callbacks.postBoot` inside the synchronous `Game.start()`, then the
 * VisibilityHandler registrations, then the deferred `DESTROY` event — and the
 * assertions use real jsdom document listeners, so removing nothing (the
 * pre-fix behaviour) fails these tests.
 */
const phaserSpies = vi.hoisted(() => ({
  postBoots: [] as (() => void)[],
  games: [] as { destroyHandlers: (() => void)[] }[],
}));

vi.mock('phaser', () => {
  class FakeGame {
    readonly destroyHandlers: (() => void)[] = [];
    readonly events = {
      once: (event: string, handler: () => void) => {
        if (event === 'destroy') {
          this.destroyHandlers.push(handler);
        }
        return this.events;
      },
    };
    constructor(config: { callbacks?: { postBoot?: () => void } }) {
      const postBoot = config.callbacks?.postBoot;
      if (postBoot !== undefined) {
        phaserSpies.postBoots.push(postBoot);
      }
      phaserSpies.games.push(this);
    }
  }
  return {
    default: {
      AUTO: 0,
      Game: FakeGame,
      Core: { Events: { DESTROY: 'destroy' } },
    },
  };
});

vi.mock('./combat-scene', () => ({ CombatScene: class {} }));

import { createCombatGame } from './combat-game';

/** Reproduces the framework start sequence of the newest created Game. */
function startNewestFrameworkGame(): void {
  const postBoot = phaserSpies.postBoots.at(-1);
  if (postBoot === undefined) {
    throw new Error('The Game owner did not register a postBoot capture.');
  }
  postBoot();
}

/** Runs the deferred framework destroy of the newest created Game. */
function destroyNewestFrameworkGame(): void {
  const game = phaserSpies.games.at(-1);
  if (game === undefined) {
    throw new Error('No Game was created.');
  }
  for (const handler of game.destroyHandlers) {
    handler();
  }
}

function createTestContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  window.onblur = null;
  window.onfocus = null;
  phaserSpies.postBoots.length = 0;
  phaserSpies.games.length = 0;
});

describe('createCombatGame framework browser bindings (V02-WI-07 D03)', () => {
  it('releases the framework visibility listener and window focus handlers with the Game', async () => {
    const originalOnBlur = window.onblur;
    const originalOnFocus = window.onfocus;
    const frameworkListener = vi.fn();
    const combatScreenListener = vi.fn();

    createCombatGame(createTestContainer(), {} as CombatSceneContext);
    // The framework start: postBoot capture window, then VisibilityHandler.
    startNewestFrameworkGame();
    document.addEventListener('visibilitychange', frameworkListener, false);
    window.onblur = () => undefined;
    window.onfocus = () => undefined;
    // The start call stack ends: the capture window closes.
    await Promise.resolve();
    document.addEventListener('visibilitychange', combatScreenListener, false);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(frameworkListener).toHaveBeenCalledTimes(1);
    expect(combatScreenListener).toHaveBeenCalledTimes(1);

    destroyNewestFrameworkGame();

    // Only the framework registration is released: the later owner's listener
    // still receives the event, and the window handlers return to their
    // pre-Game values.
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frameworkListener).toHaveBeenCalledTimes(1);
    expect(combatScreenListener).toHaveBeenCalledTimes(2);
    expect(window.onblur).toBe(originalOnBlur);
    expect(window.onfocus).toBe(originalOnFocus);

    document.removeEventListener('visibilitychange', combatScreenListener);
  });

  it('never clobbers a newer owner handler and never releases a later listener', async () => {
    const newerOnBlur = (): void => undefined;
    const frameworkListener = vi.fn();
    const newerListener = vi.fn();

    createCombatGame(createTestContainer(), {} as CombatSceneContext);
    startNewestFrameworkGame();
    document.addEventListener('visibilitychange', frameworkListener, false);
    window.onblur = () => undefined;
    await Promise.resolve();

    // A newer Combat owner installs its own handler and listener.
    window.onblur = newerOnBlur;
    document.addEventListener('visibilitychange', newerListener, false);

    destroyNewestFrameworkGame();

    expect(window.onblur).toBe(newerOnBlur);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frameworkListener).toHaveBeenCalledTimes(0);
    expect(newerListener).toHaveBeenCalledTimes(1);

    document.removeEventListener('visibilitychange', newerListener);
  });

  it('is idempotent and keeps the global document method identity stable', async () => {
    const originalAddEventListener = document.addEventListener;
    const originalRemoveEventListener = document.removeEventListener;
    const container = createTestContainer();

    for (let mission = 0; mission < 3; mission += 1) {
      createCombatGame(container, {} as CombatSceneContext);
      startNewestFrameworkGame();
      document.addEventListener('visibilitychange', vi.fn(), false);
      await Promise.resolve();
      // The interception never outlives the framework start window.
      expect(document.addEventListener).toBe(originalAddEventListener);
      destroyNewestFrameworkGame();
      destroyNewestFrameworkGame();
    }

    expect(document.removeEventListener).toBe(originalRemoveEventListener);
    expect(phaserSpies.games).toHaveLength(3);
  });
});
