import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PreparedRuntimeAsset } from '@application/ports';
import {
  EXIT_CENTRE_STEPS,
  FIXED_STEP_SECONDS,
  rangedProjectileGeometry,
  spawnRangedProjectile,
  stepCombatSimulation,
  type CombatSimulationState,
  type CombatEnemy,
  type EnemyProjectile,
} from '@application/combat';
import { createTestCombatState } from '@test-support/domain';
import { createCombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import { resolveCombatGeometry } from '../presentation-config/combat-config';
import type { CombatSceneContext } from './combat-scene';

/**
 * Real Combat presentation-boundary tests (V02-WI-05 E02 C01 Blocker 2): a
 * genuine Phaser CANVAS game boots the REAL `CombatScene` under jsdom, driven
 * by the authoritative simulation snapshots through the exact production
 * `CombatSceneContext`. The assertions inspect the scene's real GameObjects —
 * prepared/fallback enemy images/graphics and enemy-projectile rectangles —
 * proving they receive the simulation-owned opacity scalar, are destroyed at
 * exactly zero after the 30 centre steps, and are never recreated during later
 * fly-up frames while the frozen simulation entities still exist. jsdom cannot
 * decode images or draw canvas, so the harness stubs `Image` (fires load with
 * usable dimensions), a no-op 2D context, and requestAnimationFrame; the scene
 * code, the engine object graph, and the authoritative simulation are real.
 */

/** Minimal 2D canvas context fake: absorbs draw calls, serves zero image data. */
function fake2dContext(): unknown {
  const gradient = (): { addColorStop: () => void } => ({
    addColorStop: () => {},
  });
  const context: Record<string, unknown> = {
    canvas: { width: 1280, height: 600 },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    createPattern: () => null,
    measureText: () => ({ width: 0 }),
  };
  return new Proxy(context, {
    get(target, property) {
      if (property in target) {
        return target[property as keyof typeof target];
      }
      return () => undefined;
    },
    set() {
      return true;
    },
  });
}

type PhaserModule = typeof import('phaser');
type CombatSceneClass = typeof import('./combat-scene').CombatScene;

const imageLoadErrors: string[] = [];
/**
 * V02-WI-05 E02 C03 controllable prepared-image decode gate. `Image` is the
 * only decode owner in the scene, so the harness can count every `src`
 * assignment and hold a specific prepared URL's load/error callback until the
 * test releases it — exactly the delayed-decode boundary the real browser hits
 * (jsdom cannot decode, and a microtask-completing fake hides the race).
 */
const deferredDecodeUrls = new Set<string>();
const srcAssignments = new Map<string, number>();
const pendingDecodes: { url: string; image: FakeImageInstance }[] = [];
interface FakeImageInstance {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  readonly src: string;
  fireLoad(): void;
  fireError(): void;
}
let Phaser: PhaserModule;
let CombatScene: CombatSceneClass;

function releaseDecode(index: number): void {
  const pending = pendingDecodes[index];
  if (pending === undefined) {
    throw new Error(`No pending deferred decode at index ${index}.`);
  }
  pendingDecodes.splice(index, 1);
  pending.image.fireLoad();
}

function failDecode(index: number): void {
  const pending = pendingDecodes[index];
  if (pending === undefined) {
    throw new Error(`No pending deferred decode at index ${index}.`);
  }
  pendingDecodes.splice(index, 1);
  pending.image.fireError();
}

function resetDecodeControl(): void {
  deferredDecodeUrls.clear();
  srcAssignments.clear();
  pendingDecodes.length = 0;
}

/**
 * V02-WI-05 E02 C05: explicit, bounded allowance for THIS file's asynchronous
 * real-Phaser bootstrap. The hook installs the jsdom canvas/image shims and then
 * dynamically imports Phaser and the real `CombatScene`; under the complete
 * 82-suite run the module transform/environment contention legitimately exceeds
 * Vitest's default `10_000 ms` hook budget (the C04 independent gate observed
 * the hook timing out and all nine tests being skipped). The allowance is
 * file-local: no global test/hook timeout is raised, every assertion and
 * mutation counter-case is unchanged, and the bounded value still expires, so a
 * genuinely hanging bootstrap can never be masked.
 */
const REAL_PHASER_BOOTSTRAP_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => fake2dContext(),
  });
  Object.defineProperty(window, 'CanvasRenderingContext2D', {
    configurable: true,
    value: class CanvasRenderingContext2D {},
  });
  // jsdom cannot decode images: Phaser's TextureManager default images would
  // never fire LOAD/ERROR and READY would never emit (scenes never boot).
  class FakeImage implements FakeImageInstance {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 4;
    naturalHeight = 4;
    width = 4;
    height = 4;
    complete = true;
    private _src = '';
    set src(value: string) {
      this._src = value;
      srcAssignments.set(value, (srcAssignments.get(value) ?? 0) + 1);
      if (deferredDecodeUrls.has(value)) {
        // Held until the test releases (or fails) this decode.
        pendingDecodes.push({ url: value, image: this });
        return;
      }
      queueMicrotask(() => {
        try {
          this.fireLoad();
        } catch (error) {
          imageLoadErrors.push(String(error));
        }
      });
    }
    get src(): string {
      return this._src;
    }
    fireLoad(): void {
      this.onload?.();
    }
    fireError(): void {
      this.onerror?.();
    }
    addEventListener(): void {}
    removeEventListener(): void {}
  }
  Object.defineProperty(window, 'Image', {
    configurable: true,
    value: FakeImage,
  });
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    window.setTimeout(() => callback(performance.now()), 16);
  window.cancelAnimationFrame = (handle: number): void =>
    window.clearTimeout(handle);
  // Phaser's AddToDOM focuses the game canvas; jsdom does not implement it.
  window.focus = () => {};
  Phaser = await import('phaser');
  CombatScene = (await import('./combat-scene')).CombatScene;
}, REAL_PHASER_BOOTSTRAP_TIMEOUT_MS);

const PREPARED_BASIC: PreparedRuntimeAsset = {
  id: 'enemy-basic-drone',
  kind: 'enemy-image',
  sourcePath: 'assets/runtime/enemies/basic-drone.png',
  url: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  status: 'ready',
};

const BASIC_DATA_URI =
  'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

/** Crafted active Basic fixture (same shape the simulation spawns). */
function basicAt(
  state: CombatSimulationState,
  centerX: number,
  centerY: number,
): CombatEnemy {
  return {
    id: 0,
    kind: 'basic',
    type: 'basic-drone',
    hullIntegrity: 100,
    centerX,
    centerY,
    width: state.enemyBoundsByType['basic-drone'].width,
    height: state.enemyBoundsByType['basic-drone'].height,
    entry: 'top',
    hasEnteredVisibleArea: true,
    activated: true,
    ordinal: 0,
  };
}

/** A deterministic Ranged projectile aimed from above (never near the player). */
function rangedProjectileAbove(state: CombatSimulationState): EnemyProjectile {
  const shortSide = Math.min(state.viewportWidth, state.viewportHeight);
  return spawnRangedProjectile(
    0,
    state.viewportWidth * 0.3,
    state.viewportHeight * 0.2,
    state.aircraft.centerX,
    state.aircraft.centerY,
    120,
    rangedProjectileGeometry(shortSide),
  );
}

/** Fires the countdown's exact zero step so the state freezes an immutable
 *  Evacuated terminal while the crafted enemies/enemy projectiles survive. */
function frozenEvacuatedState(): CombatSimulationState {
  const fresh = createTestCombatState({ mode: 'keyboard' });
  const enemy = basicAt(fresh, fresh.viewportWidth * 0.3, 150);
  const enemyProjectile = rangedProjectileAbove(fresh);
  const zeroStep = {
    ...fresh,
    evacuationStepsRemaining: 1,
    enemies: [enemy],
    enemyProjectiles: [enemyProjectile],
  };
  const frozen = stepCombatSimulation(zeroStep, FIXED_STEP_SECONDS);
  if (frozen.terminalResult?.kind !== 'evacuated') {
    throw new Error('Fixture failed to resolve an Evacuated terminal.');
  }
  return frozen;
}

interface CombatSceneHarness {
  readonly game: InstanceType<PhaserModule['Game']>;
  readonly scene: Phaser.Scene & {
    enemyVisuals: Map<number, Phaser.GameObjects.GameObject>;
    enemyProjectileVisuals: Map<number, Phaser.GameObjects.Rectangle>;
    enemyTextureStates: Map<string, 'decoding' | 'ready' | 'fallback'>;
    enemyTextureDecodes: Map<string, HTMLImageElement>;
    simState: CombatSimulationState;
    update: (time: number, delta: number) => void;
  };
  readonly holder: { state: CombatSimulationState };
  readonly dispose: () => void;
}

async function bootRealCombatScene(
  preparedAssets: PreparedRuntimeAsset[],
  initial: CombatSimulationState,
  onGameCreated?: (game: InstanceType<PhaserModule['Game']>) => void,
): Promise<CombatSceneHarness> {
  const holder: { state: CombatSimulationState } = { state: initial };
  const container = document.createElement('div');
  container.style.width = '1280px';
  container.style.height = '600px';
  document.body.appendChild(container);
  const bridge = createCombatHudBridge();
  container.appendChild(bridge.element);
  const geometry = resolveCombatGeometry({ width: 1280, height: 600 });
  const context: CombatSceneContext = {
    geometry,
    bridge,
    aircraftUrl: null,
    preparedAssets,
    submitCommand: () => {},
    advanceFrame: () => holder.state,
    getSimulationState: () => holder.state,
    getPaused: () => false,
    requestPause: () => {},
  };
  class BoundCombatScene extends CombatScene {
    constructor() {
      super(context);
    }
  }
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container,
    width: geometry.viewportWidth,
    height: geometry.viewportHeight,
    banner: false,
    scene: [BoundCombatScene],
  });
  onGameCreated?.(game);
  // Let boot, default textures, and the first frames settle.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const scene = game.scene.getScene(
    'combat',
  ) as unknown as CombatSceneHarness['scene'];
  if (scene === null || scene === undefined) {
    game.destroy(true);
    bridge.dispose();
    container.remove();
    throw new Error('The real Combat scene did not boot under the harness.');
  }
  let disposed = false;
  return {
    game,
    scene,
    holder,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      game.destroy(true);
      bridge.dispose();
      container.remove();
    },
  };
}

function alphaOf(scene: CombatSceneHarness['scene'], enemyId: number): number {
  const visual = scene.enemyVisuals.get(enemyId);
  if (visual === undefined) {
    throw new Error(`Expected enemy visual ${enemyId} to exist.`);
  }
  return (visual as unknown as { alpha: number }).alpha;
}

const activeCleanups: CombatSceneHarness[] = [];
afterEach(() => {
  while (activeCleanups.length > 0) {
    activeCleanups.pop()!.dispose();
  }
  resetDecodeControl();
});

/** Active (non-terminal) Combat state carrying one Basic enemy so the scene
 *  renders one persistent enemy surface for the texture-lifecycle cases. */
function activeBasicState(): CombatSimulationState {
  const fresh = createTestCombatState({ mode: 'keyboard' });
  return {
    ...fresh,
    enemies: [basicAt(fresh, fresh.viewportWidth * 0.3, 150)],
  };
}

describe('real CombatScene Evacuation fade (V02-WI-05 E02 C01)', () => {
  it('fallback enemies and enemy projectiles receive the authoritative opacity and are destroyed at exact zero without recreation', async () => {
    const harness = await bootRealCombatScene([], frozenEvacuatedState());
    activeCleanups.push(harness);
    const { scene, holder } = harness;
    const enemyId = scene.simState.enemies[0]!.id;
    const projectileId = scene.simState.enemyProjectiles[0]!.id;
    // First sync: pre-commit freeze keeps every surface at full opacity.
    scene.update(0, 16.7);
    expect(scene.enemyVisuals.has(enemyId)).toBe(true);
    expect(scene.enemyProjectileVisuals.has(projectileId)).toBe(true);
    expect(alphaOf(scene, enemyId)).toBeCloseTo(1, 6);
    expect(scene.enemyProjectileVisuals.get(projectileId)!.alpha).toBeCloseTo(
      1,
      6,
    );

    // Authorize the committed write; the fade shares the 30 centre steps.
    let state = { ...holder.state, exitAuthorized: true };
    holder.state = state;
    let lastEnemyVisual: Phaser.GameObjects.GameObject | undefined;
    let lastProjectileVisual: Phaser.GameObjects.Rectangle | undefined;
    for (let step = 1; step <= EXIT_CENTRE_STEPS; step += 1) {
      lastEnemyVisual = scene.enemyVisuals.get(enemyId);
      lastProjectileVisual = scene.enemyProjectileVisuals.get(projectileId);
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      holder.state = state;
      scene.update(0, 16.7);
      const expected = (EXIT_CENTRE_STEPS - step) / EXIT_CENTRE_STEPS;
      if (step < EXIT_CENTRE_STEPS) {
        expect(alphaOf(scene, enemyId)).toBeCloseTo(expected, 6);
        expect(
          scene.enemyProjectileVisuals.get(projectileId)!.alpha,
        ).toBeCloseTo(expected, 6);
      }
    }
    // Exact zero after the 30th centre step: both surfaces are destroyed even
    // though the frozen simulation entities still exist.
    expect(scene.simState.enemies).toHaveLength(1);
    expect(scene.simState.enemyProjectiles).toHaveLength(1);
    expect(scene.enemyVisuals.has(enemyId)).toBe(false);
    expect(scene.enemyProjectileVisuals.has(projectileId)).toBe(false);
    expect(lastEnemyVisual?.active).toBe(false);
    expect(lastProjectileVisual?.active).toBe(false);

    // Fly-up frames must never recreate the faded surfaces.
    const enemyIdBefore = scene.simState.enemies[0]!.id;
    const projectileIdBefore = scene.simState.enemyProjectiles[0]!.id;
    for (let step = 0; step < 12; step += 1) {
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      holder.state = state;
      scene.update(0, 16.7);
      expect(scene.simState.enemies[0]!.id).toBe(enemyIdBefore);
      expect(scene.simState.enemyProjectiles[0]!.id).toBe(projectileIdBefore);
      expect(scene.enemyVisuals.has(enemyId)).toBe(false);
      expect(scene.enemyProjectileVisuals.has(projectileId)).toBe(false);
    }
    expect(scene.simState.exitPhase).toBe('fly-up');
    expect(scene.enemyVisuals.size).toBe(0);
    expect(scene.enemyProjectileVisuals.size).toBe(0);
  });

  it('prepared-texture enemies receive the authoritative opacity and disappear at exact zero without recreation', async () => {
    const harness = await bootRealCombatScene(
      [PREPARED_BASIC],
      frozenEvacuatedState(),
    );
    activeCleanups.push(harness);
    const { scene, holder } = harness;
    const enemyId = scene.simState.enemies[0]!.id;
    // Wait (deterministically) for the prepared texture registration + the
    // first Image visual to exist.
    let frames = 0;
    while (
      scene.enemyTextureStates.get('basic-drone') !== 'ready' ||
      !scene.enemyVisuals.has(enemyId)
    ) {
      scene.update(0, 16.7);
      await new Promise((resolve) => setTimeout(resolve, 20));
      frames += 1;
      if (frames > 100) {
        const resolved = (
          scene as unknown as {
            enemyVisualResolutions: Map<string, { status: string }>;
          }
        ).enemyVisualResolutions.get('basic-drone');
        throw new Error(
          `Prepared enemy texture/visual never materialised. ` +
            `imageLoadErrors=[${imageLoadErrors.join(' | ')}]; ` +
            `texturesExists=${harness.game.textures.exists('enemy-visual-basic-drone')}; ` +
            `resolution=${JSON.stringify(resolved)}`,
        );
      }
    }
    const visual = scene.enemyVisuals.get(enemyId);
    expect(visual).toBeInstanceOf(Phaser.GameObjects.Image);
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('ready');
    expect((visual as Phaser.GameObjects.Image).alpha).toBeCloseTo(1, 6);

    // The prepared image fades across the same 30 centre steps.
    let state = { ...holder.state, exitAuthorized: true };
    holder.state = state;
    let lastVisual: Phaser.GameObjects.GameObject | undefined;
    for (let step = 1; step <= EXIT_CENTRE_STEPS; step += 1) {
      lastVisual = scene.enemyVisuals.get(enemyId);
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      holder.state = state;
      scene.update(0, 16.7);
      const expected = (EXIT_CENTRE_STEPS - step) / EXIT_CENTRE_STEPS;
      if (step < EXIT_CENTRE_STEPS) {
        const current = scene.enemyVisuals.get(enemyId);
        expect(current).toBeInstanceOf(Phaser.GameObjects.Image);
        expect((current as Phaser.GameObjects.Image).alpha).toBeCloseTo(
          expected,
          6,
        );
      }
    }
    expect(scene.simState.enemies).toHaveLength(1);
    expect(scene.enemyVisuals.has(enemyId)).toBe(false);
    expect(lastVisual?.active).toBe(false);
    for (let step = 0; step < 8; step += 1) {
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      holder.state = state;
      scene.update(0, 16.7);
      expect(scene.enemyVisuals.has(enemyId)).toBe(false);
    }
    expect(scene.simState.exitPhase).toBe('fly-up');
    expect(scene.enemyVisuals.size).toBe(0);
  });
});

describe('prepared asset fixture sanity', () => {
  it('carries a data URL Phaser can register through the FakeImage path', () => {
    expect(PREPARED_BASIC.status).toBe('ready');
    expect(PREPARED_BASIC.url).toBe(BASIC_DATA_URI);
  });
});

/**
 * V02-WI-05 E02 C03 single-flight prepared-texture registration. The
 * independent review found that `ensureEnemyTexture` only guarded a `ready`
 * set, so every render frame during an in-flight decode created another
 * `Image`, reassigned the prepared data URI, and registered the same texture
 * key again — logging `Texture key already in use`. These are real-Phaser
 * counter-cases with a controllably delayed decode: exactly one source
 * assignment and one registration attempt across many intervening frames, a
 * stable no-retry procedural fallback on decode failure, and an inert late
 * completion after scene disposal.
 */
describe('real CombatScene prepared-texture single-flight registration (V02-WI-05 E02 C03)', () => {
  it('assigns the prepared source once and registers once across many frames of a delayed decode', async () => {
    deferredDecodeUrls.add(BASIC_DATA_URI);
    const consoleErrors: string[] = [];
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        consoleErrors.push(args.map((value) => String(value)).join(' '));
      });
    let addImageSpy: { mock: { calls: unknown[] } } | null = null;
    let harness: CombatSceneHarness;
    try {
      harness = await bootRealCombatScene(
        [PREPARED_BASIC],
        activeBasicState(),
        (game) => {
          addImageSpy = vi.spyOn(game.textures, 'addImage');
        },
      );
    } catch (error) {
      consoleSpy.mockRestore();
      throw error;
    }
    activeCleanups.push(harness);
    const { scene } = harness;
    const enemyId = scene.simState.enemies[0]!.id;
    const addImageCalls = (): number => addImageSpy!.mock.calls.length;

    // Many intervening render frames while the ONE decode is still in flight:
    // the same key is never source-assigned again, never re-registered, and
    // never re-laid-out as a second Image.
    expect(pendingDecodes).toHaveLength(1);
    for (let frame = 0; frame < 60; frame += 1) {
      scene.update(0, 16.7);
    }
    expect(srcAssignments.get(BASIC_DATA_URI)).toBe(1);
    expect(pendingDecodes).toHaveLength(1);
    expect(addImageCalls()).toBe(0);
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('decoding');
    expect(harness.game.textures.exists('enemy-visual-basic-drone')).toBe(
      false,
    );
    // The approved procedural fallback renders while the decode is pending.
    expect(scene.enemyVisuals.get(enemyId)).toBeInstanceOf(
      Phaser.GameObjects.Graphics,
    );

    // The single in-flight decode completes: exactly one registration attempt.
    const decodeImage = pendingDecodes[0]!.image;
    releaseDecode(0);
    expect(addImageCalls()).toBe(1);
    expect(harness.game.textures.exists('enemy-visual-basic-drone')).toBe(true);
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('ready');
    // V02-WI-05 E02 C04: the element Phaser retains as the registered texture
    // source is the decoded image AND carries no scene-owned callbacks.
    const retainedSource = harness.game.textures
      .get('enemy-visual-basic-drone')
      .getSourceImage() as HTMLImageElement;
    expect(retainedSource).toBe(decodeImage);
    expect(retainedSource.onload).toBeNull();
    expect(retainedSource.onerror).toBeNull();
    expect(decodeImage.onload).toBeNull();
    expect(decodeImage.onerror).toBeNull();
    // A stale duplicate completion cannot re-enter registration.
    decodeImage.fireLoad();
    decodeImage.fireError();
    expect(addImageCalls()).toBe(1);
    for (let frame = 0; frame < 30; frame += 1) {
      scene.update(0, 16.7);
    }
    const visual = scene.enemyVisuals.get(enemyId);
    expect(visual).toBeInstanceOf(Phaser.GameObjects.Image);
    expect((visual as Phaser.GameObjects.Image).texture.key).toBe(
      'enemy-visual-basic-drone',
    );
    expect((visual as Phaser.GameObjects.Image).alpha).toBeCloseTo(1, 6);
    // Still single-flight after the texture is ready and reused every frame.
    expect(srcAssignments.get(BASIC_DATA_URI)).toBe(1);
    expect(pendingDecodes).toHaveLength(0);
    expect(addImageCalls()).toBe(1);
    expect(
      consoleErrors.filter((text) => text.includes('already in use')),
    ).toEqual([]);
    // Disposal after a successful registration can neither re-enter
    // registration nor restore callbacks on the retained texture source.
    harness.dispose();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(addImageCalls()).toBe(1);
    expect(retainedSource.onload).toBeNull();
    expect(retainedSource.onerror).toBeNull();
    consoleSpy.mockRestore();
  });

  it('keeps the stable procedural fallback with no retry after a decode error', async () => {
    deferredDecodeUrls.add(BASIC_DATA_URI);
    const harness = await bootRealCombatScene(
      [PREPARED_BASIC],
      activeBasicState(),
    );
    activeCleanups.push(harness);
    const { scene } = harness;
    const enemyId = scene.simState.enemies[0]!.id;

    for (let frame = 0; frame < 10; frame += 1) {
      scene.update(0, 16.7);
    }
    expect(pendingDecodes).toHaveLength(1);
    const failedImage = pendingDecodes[0]!.image;
    failDecode(0);
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('fallback');
    expect(scene.enemyTextureDecodes.size).toBe(0);
    expect(harness.game.textures.exists('enemy-visual-basic-drone')).toBe(
      false,
    );
    // The failed element is fully detached from the scene.
    expect(failedImage.onload).toBeNull();
    expect(failedImage.onerror).toBeNull();
    // A stale duplicate load cannot re-enter registration either.
    failedImage.fireLoad();
    expect(srcAssignments.get(BASIC_DATA_URI)).toBe(1);

    // Later frames never retry the failed decode: no new Image, no second
    // source assignment, and the fallback surface is not replaced.
    for (let frame = 0; frame < 40; frame += 1) {
      scene.update(0, 16.7);
    }
    expect(srcAssignments.get(BASIC_DATA_URI)).toBe(1);
    expect(pendingDecodes).toHaveLength(0);
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('fallback');
    expect(scene.enemyVisuals.get(enemyId)).toBeInstanceOf(
      Phaser.GameObjects.Graphics,
    );
  });

  it('makes a late decode completion inert after scene disposal and leaves no callback residue', async () => {
    deferredDecodeUrls.add(BASIC_DATA_URI);
    const harness = await bootRealCombatScene(
      [PREPARED_BASIC],
      activeBasicState(),
    );
    const { scene } = harness;
    for (let frame = 0; frame < 5; frame += 1) {
      scene.update(0, 16.7);
    }
    expect(pendingDecodes).toHaveLength(1);

    const consoleErrors: string[] = [];
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        consoleErrors.push(args.map((value) => String(value)).join(' '));
      });
    harness.dispose();
    // `Game.destroy()` defers the actual teardown to the next game step, so the
    // scene-owned disposal handler runs on the following frame.
    await new Promise((resolve) => setTimeout(resolve, 80));
    // Shutdown detached the in-flight decode and cleared the scene-owned
    // lifecycle state, so no callback can register a texture afterwards.
    expect(pendingDecodes[0]!.image.onload).toBeNull();
    expect(pendingDecodes[0]!.image.onerror).toBeNull();
    expect(scene.enemyTextureDecodes.size).toBe(0);
    expect(scene.enemyTextureStates.size).toBe(0);

    releaseDecode(0);
    // The detached late completion is a strict no-op: no registration, no
    // error, no retained resource.
    expect(pendingDecodes).toHaveLength(0);
    expect(consoleErrors).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('reuses an already registered prepared texture for the session without a new decode', async () => {
    deferredDecodeUrls.add(BASIC_DATA_URI);
    let preRegistered = false;
    const harness = await bootRealCombatScene(
      [PREPARED_BASIC],
      activeBasicState(),
      (game) => {
        // The texture is already registered (as Boot's bounded preload would
        // have produced it) before the scene observes the kind.
        game.textures.addImage(
          'enemy-visual-basic-drone',
          new (window.Image as unknown as new () => HTMLImageElement)(),
        );
        preRegistered = game.textures.exists('enemy-visual-basic-drone');
      },
    );
    activeCleanups.push(harness);
    const { scene } = harness;
    const enemyId = scene.simState.enemies[0]!.id;
    expect(preRegistered).toBe(true);

    for (let frame = 0; frame < 5; frame += 1) {
      scene.update(0, 16.7);
    }
    // The ready texture is reused: no second decode and no second registration.
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('ready');
    expect(pendingDecodes).toHaveLength(0);
    expect(srcAssignments.get(BASIC_DATA_URI)).toBeUndefined();
    expect(scene.enemyVisuals.get(enemyId)).toBeInstanceOf(
      Phaser.GameObjects.Image,
    );
    expect(
      (scene.enemyVisuals.get(enemyId) as Phaser.GameObjects.Image).texture.key,
    ).toBe('enemy-visual-basic-drone');
  });

  it('settles into the stable fallback when registration returns null and detaches both callbacks', async () => {
    deferredDecodeUrls.add(BASIC_DATA_URI);
    const harness = await bootRealCombatScene(
      [PREPARED_BASIC],
      activeBasicState(),
      (game) => {
        vi.spyOn(game.textures, 'addImage').mockReturnValue(null);
      },
    );
    activeCleanups.push(harness);
    const { scene } = harness;
    const enemyId = scene.simState.enemies[0]!.id;
    for (let frame = 0; frame < 5; frame += 1) {
      scene.update(0, 16.7);
    }
    const decodeImage = pendingDecodes[0]!.image;
    releaseDecode(0);
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('fallback');
    expect(scene.enemyTextureDecodes.size).toBe(0);
    expect(decodeImage.onload).toBeNull();
    expect(decodeImage.onerror).toBeNull();
    expect(harness.game.textures.exists('enemy-visual-basic-drone')).toBe(
      false,
    );

    // No retry after a registration failure: the fallback stays fixed and the
    // released element can never re-enter registration.
    decodeImage.fireLoad();
    decodeImage.fireError();
    for (let frame = 0; frame < 30; frame += 1) {
      scene.update(0, 16.7);
    }
    expect(srcAssignments.get(BASIC_DATA_URI)).toBe(1);
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('fallback');
    expect(scene.enemyVisuals.get(enemyId)).toBeInstanceOf(
      Phaser.GameObjects.Graphics,
    );
  });

  it('treats a thrown registration failure as the stable fallback with no retry and no callback residue', async () => {
    deferredDecodeUrls.add(BASIC_DATA_URI);
    const harness = await bootRealCombatScene(
      [PREPARED_BASIC],
      activeBasicState(),
      (game) => {
        vi.spyOn(game.textures, 'addImage').mockImplementation(() => {
          throw new Error('registration boundary failed');
        });
      },
    );
    activeCleanups.push(harness);
    const { scene } = harness;
    const enemyId = scene.simState.enemies[0]!.id;
    for (let frame = 0; frame < 5; frame += 1) {
      scene.update(0, 16.7);
    }
    const decodeImage = pendingDecodes[0]!.image;
    // A throwing Phaser boundary must not escape into the image callback.
    expect(() => releaseDecode(0)).not.toThrow();
    expect(scene.enemyTextureStates.get('basic-drone')).toBe('fallback');
    expect(scene.enemyTextureDecodes.size).toBe(0);
    expect(decodeImage.onload).toBeNull();
    expect(decodeImage.onerror).toBeNull();
    for (let frame = 0; frame < 30; frame += 1) {
      scene.update(0, 16.7);
    }
    expect(srcAssignments.get(BASIC_DATA_URI)).toBe(1);
    expect(scene.enemyVisuals.get(enemyId)).toBeInstanceOf(
      Phaser.GameObjects.Graphics,
    );
  });
});

/**
 * V02-WI-05 E03 Evacuation Countdown HUD replacement (Epic §13.4 step 5,
 * V02-AC-014, DS §8.26): the ONE canonical `.ds-combat-countdown` element shows
 * the Combat Countdown while no commitment exists and the
 * `EVACUATION MM:SS` value sourced from the E02
 * `buildEvacuationCountdownReadModel` once the commitment is recorded — the two
 * countdowns never coexist, and the scene owns no timer (paused frames simply
 * stop advancing the authoritative state).
 */
describe('real CombatScene Evacuation Countdown replacement (V02-WI-05 E03)', () => {
  function countdownText(): string | null {
    return document.querySelector('.ds-combat-countdown')?.textContent ?? null;
  }

  it('shows only the Combat Countdown before the commitment exists', async () => {
    const harness = await bootRealCombatScene(
      [],
      createTestCombatState({ mode: 'keyboard' }),
    );
    activeCleanups.push(harness);
    harness.scene.update(0, 16.7);
    expect(document.querySelectorAll('.ds-combat-countdown')).toHaveLength(1);
    expect(countdownText()).toBe('03:10');
    expect(countdownText()).not.toContain('EVACUATION');
  });

  it('replaces it with the canonical EVACUATION MM:SS at every display boundary', async () => {
    const harness = await bootRealCombatScene(
      [],
      createTestCombatState({ mode: 'keyboard' }),
    );
    activeCleanups.push(harness);
    const boundaries: readonly [number, string][] = [
      [300, 'EVACUATION 00:05'],
      [299, 'EVACUATION 00:05'],
      [240, 'EVACUATION 00:04'],
      [1, 'EVACUATION 00:01'],
    ];
    for (const [remainingSteps, expected] of boundaries) {
      harness.holder.state = {
        ...harness.holder.state,
        evacuationStepsRemaining: remainingSteps,
      };
      harness.scene.update(0, 16.7);
      expect(document.querySelectorAll('.ds-combat-countdown')).toHaveLength(1);
      expect(countdownText()).toBe(expected);
    }

    // The exact zero step freezes the immutable Evacuated terminal and still
    // shows 00:00 through the same replacement element.
    const zeroStep = stepCombatSimulation(
      { ...harness.holder.state, evacuationStepsRemaining: 1 },
      FIXED_STEP_SECONDS,
    );
    expect(zeroStep.terminalResult).toEqual({ kind: 'evacuated' });
    harness.holder.state = zeroStep;
    harness.scene.update(0, 16.7);
    expect(countdownText()).toBe('EVACUATION 00:00');
    expect(document.querySelectorAll('.ds-combat-countdown')).toHaveLength(1);
    // The ordinary Combat Countdown never survives beside it.
    expect(countdownText()).not.toContain('03:10');
  });

  it('freezes and resumes the same authoritative value without owning a timer', async () => {
    const harness = await bootRealCombatScene(
      [],
      createTestCombatState({ mode: 'keyboard' }),
    );
    activeCleanups.push(harness);
    harness.holder.state = {
      ...harness.holder.state,
      evacuationStepsRemaining: 240,
    };
    harness.scene.update(0, 16.7);
    expect(countdownText()).toBe('EVACUATION 00:04');

    // Paused frames render the identical authoritative value (the scene never
    // advances or mutates the countdown itself).
    for (let frame = 0; frame < 10; frame += 1) {
      harness.scene.update(0, 16.7);
      expect(countdownText()).toBe('EVACUATION 00:04');
    }
    expect(harness.holder.state.evacuationStepsRemaining).toBe(240);
    expect(harness.holder.state.terminalResult).toBeNull();
  });
});
