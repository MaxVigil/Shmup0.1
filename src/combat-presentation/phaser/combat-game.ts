import Phaser from 'phaser';
import type { CombatSceneContext } from './combat-scene';
import { CombatScene } from './combat-scene';

/**
 * Document-level visibility event names Phaser's `VisibilityHandler` may
 * register: the standard name, or a vendor-prefixed equivalent on an old
 * browser (`phaser@4.2.1` `src/core/VisibilityHandler.js`).
 */
const FRAMEWORK_VISIBILITY_EVENT_TYPES: readonly string[] = [
  'visibilitychange',
  'webkitvisibilitychange',
  'mozvisibilitychange',
  'msvisibilitychange',
];

/** One document listener the Phaser framework registered for this Game. */
interface FrameworkDocumentListener {
  readonly type: string;
  readonly listener: EventListenerOrEventListenerObject;
  readonly options: boolean | AddEventListenerOptions | undefined;
}

/**
 * The browser registrations Phaser makes for ONE Game through no API this
 * repository can release (V02-WI-07 D03, Code Principles §9, V02-AC-027,
 * MASTER §7.10):
 *
 * - `VisibilityHandler` is constructed unconditionally by `Game.start()`, it
 *   registers one `document` visibility listener, and it has no destroy path,
 *   so one Combat mission would leave one duplicated subscription behind;
 * - the same handler overwrites `window.onblur`/`window.onfocus` with closures
 *   that reference the Game's event emitter, so a destroyed Game would stay
 *   reachable from the window.
 *
 * This owner captures those bindings while the framework starts the Game and
 * releases them with the Game, so every registration keeps exactly one
 * repository-owned disposal path. Behaviour while the Game is alive — Phaser
 * pausing its own loop on blur/hidden — is unchanged.
 */
interface FrameworkBrowserBindings {
  readonly documentListeners: FrameworkDocumentListener[];
  previousOnBlur: Window['onblur'];
  previousOnFocus: Window['onfocus'];
  /** The handlers THIS Game installed, read once its start window has ended. */
  assignedOnBlur: Window['onblur'] | undefined;
  assignedOnFocus: Window['onfocus'] | undefined;
}

/**
 * Captures the framework bindings during `Game.start()`: `callbacks.postBoot`
 * runs inside that synchronous start immediately before `VisibilityHandler`,
 * and the interception is restored by a microtask, i.e. as soon as the start
 * call stack empties. Only document visibility registrations are recorded, so
 * nothing this repository or a later Combat owner registers is touched.
 */
function captureFrameworkBrowserBindings(
  bindings: FrameworkBrowserBindings,
): void {
  const originalAddEventListener = document.addEventListener;
  bindings.previousOnBlur = window.onblur;
  bindings.previousOnFocus = window.onfocus;
  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    if (FRAMEWORK_VISIBILITY_EVENT_TYPES.includes(type)) {
      bindings.documentListeners.push({ type, listener, options });
    }
    originalAddEventListener.call(document, type, listener, options);
  }) as typeof document.addEventListener;
  queueMicrotask(() => {
    // Restoring the exact original function keeps the global method identity
    // stable, so repeated Combat entries cannot build a wrapper chain.
    document.addEventListener = originalAddEventListener;
    bindings.assignedOnBlur = window.onblur;
    bindings.assignedOnFocus = window.onfocus;
  });
}

/**
 * Releases the framework bindings of THIS Game from the Game's own `DESTROY`
 * event — the same deferred destroy that removes the canvas — so a disposed
 * Combat boundary owns no browser registration and no reachable destroyed Game.
 */
function releaseFrameworkBrowserBindings(
  bindings: FrameworkBrowserBindings,
): void {
  for (const captured of bindings.documentListeners) {
    document.removeEventListener(
      captured.type,
      captured.listener,
      captured.options,
    );
  }
  bindings.documentListeners.length = 0;
  // Restore only while THIS Game still owns the handler: a newer Combat owner
  // that already installed its own handlers is never clobbered.
  if (
    bindings.assignedOnBlur !== undefined &&
    window.onblur === bindings.assignedOnBlur
  ) {
    window.onblur = bindings.previousOnBlur;
  }
  if (
    bindings.assignedOnFocus !== undefined &&
    window.onfocus === bindings.assignedOnFocus
  ) {
    window.onfocus = bindings.previousOnFocus;
  }
  bindings.assignedOnBlur = undefined;
  bindings.assignedOnFocus = undefined;
}

/**
 * Owns the Phaser Game instance for the Combat Screen shell (Repository
 * Architecture §5.5). The game is created with the approved fixed scene and a
 * canvas filling the container. Only this module and the lazy entry may touch
 * Phaser lifecycle; the returned game is destroyed by the session `dispose`,
 * and its framework-owned browser bindings are released on that same destroy.
 */
export function createCombatGame(
  container: HTMLElement,
  context: CombatSceneContext,
): Phaser.Game {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  class BoundCombatScene extends CombatScene {
    constructor() {
      super(context);
    }
  }
  const bindings: FrameworkBrowserBindings = {
    documentListeners: [],
    previousOnBlur: null,
    previousOnFocus: null,
    assignedOnBlur: undefined,
    assignedOnFocus: undefined,
  };
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width,
    height,
    scene: [BoundCombatScene],
    callbacks: {
      postBoot: () => {
        captureFrameworkBrowserBindings(bindings);
      },
    },
  });
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    releaseFrameworkBrowserBindings(bindings);
  });
  return game;
}
