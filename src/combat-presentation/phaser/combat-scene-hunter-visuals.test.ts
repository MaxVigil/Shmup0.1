import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PreparedRuntimeAsset } from '@application/ports';
import { resolveCombatGeometry } from '../presentation-config/combat-config';
import {
  FIXED_STEP_SECONDS,
  applyDebugCommand,
  stepCombatSimulation,
  submitCombatCommand,
} from '@application/combat';
import type {
  CombatSimulationState,
  HunterEnemyState,
} from '@application/combat';
import { createTestCombatState } from '@test-support/domain';
import { createCombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import type { CombatSceneContext } from './combat-scene';

/**
 * V021-WI-03 (patch §3, V021-AC-003) real-Phaser Hunter rotation evidence.
 *
 * A genuine Phaser CANVAS game boots the REAL `CombatScene` under jsdom, driven
 * by the REAL Mission 01 fixed-step simulation through the production
 * `CombatSceneContext`. The Hunter is the real Debug-spawned authored Side Entry
 * Hunter of the current mission, stepped to its committed Attack Run, so the
 * assertions inspect the scene's real GameObjects for the TWO required visual
 * paths: the prepared Hunter artwork and the approved procedural fallback.
 *
 * Both paths must render the ONE authoritative `headingRadians` as the rotation
 * of the nose-down configured artwork about the configured centre and must scale
 * by the CONFIGURED complete rendered bounds — never by the enclosing rotated
 * AABB, which exists only for simulation collision/visibility/escape. A
 * rendering-only (or unrotated) result, a second presentation-owned direction,
 * or an AABB-scaled sprite all fail these checks, and every other role is proven
 * to stay unrotated.
 *
 * jsdom cannot decode images or draw canvas, so the harness stubs `Image`
 * (fires load with usable dimensions) and a no-op 2D context; the scene code, the
 * engine object graph, and the authoritative simulation are real.
 */

/** Minimal 2D canvas context fake: absorbs draw calls, serves zero image data. */
function fake2dContext(): unknown {
  const gradient = (): { addColorStop: () => void } => ({
    addColorStop: () => {},
  });
  const context: Record<string, unknown> = {
    canvas: { width: 1280, height: 600 },
    drawImage: () => {},
    fillRect: () => {},
    clearRect: () => {},
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

const srcAssignments = new Map<string, number>();

/** Minimal Phaser module/class handles resolved once for the suite. */
type PhaserModule = typeof import('phaser');
type CombatSceneClass = typeof import('./combat-scene').CombatScene;
let Phaser: PhaserModule;
let CombatScene: CombatSceneClass;

interface FakeImageInstance {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  readonly src: string;
}

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
  // never fire LOAD/ERROR and the scene would never boot.
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
      queueMicrotask(() => this.onload?.());
    }
    get src(): string {
      return this._src;
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

/** Prepared Hunter bytes: the catalogue path stays a second request, so the
 *  regression can prove the prepared inline bytes are the decoded source. */
const HUNTER_PATH = '/enemies/hunter-drone.png';
const HUNTER_BYTES =
  'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const PREPARED_HUNTER_DRONE: PreparedRuntimeAsset = {
  id: 'enemy-hunter-drone',
  kind: 'enemy-image',
  sourcePath: 'assets/runtime/enemies/hunter-drone.png',
  url: HUNTER_PATH,
  imageDataUri: HUNTER_BYTES,
  status: 'ready',
};

interface HunterSceneHarness {
  readonly game: InstanceType<PhaserModule['Game']>;
  readonly scene: Phaser.Scene & {
    enemyVisuals: Map<number, Phaser.GameObjects.GameObject>;
    enemyTextureStates: Map<string, 'decoding' | 'ready' | 'fallback'>;
    simState: CombatSimulationState;
    update: (time: number, delta: number) => void;
  };
  readonly holder: { state: CombatSimulationState };
  readonly dispose: () => void;
}

async function bootRealCombatScene(
  preparedAssets: PreparedRuntimeAsset[],
  initial: CombatSimulationState,
): Promise<HunterSceneHarness> {
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
  // Let boot, default textures, and the first frames settle.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const scene = game.scene.getScene(
    'combat',
  ) as unknown as HunterSceneHarness['scene'];
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

const activeCleanups: HunterSceneHarness[] = [];
afterEach(() => {
  while (activeCleanups.length > 0) {
    activeCleanups.pop()!.dispose();
  }
  srcAssignments.clear();
});

function hunterIn(state: CombatSimulationState): HunterEnemyState | undefined {
  return state.enemies.find(
    (enemy): enemy is HunterEnemyState => enemy.kind === 'hunter',
  );
}

/**
 * A real Mission 01 pipeline: the Debug-authored Side Entry Hunter (authored
 * placement, real entry integration) stepped to its committed Attack Run with
 * live steering, plus one ordinary step helper for the same simulation.
 */
function committedHunterState(): CombatSimulationState {
  let state = applyDebugCommand(
    createTestCombatState({ missionId: 'interception-01' }),
    { type: 'combat-debug/god-mode', enabled: true },
  );
  state = applyDebugCommand(state, {
    type: 'combat-debug/spawn-enemy',
    enemyType: 'hunter-drone',
  });
  for (let step = 0; step < 1500; step += 1) {
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    const hunter = hunterIn(state);
    if (
      hunter !== undefined &&
      hunter.phase === 'committed' &&
      hunter.committedStepsExecuted >= 3
    ) {
      return state;
    }
  }
  throw new Error(
    'Fixture failed: no Hunter reached its committed Attack Run.',
  );
}

function stepHunter(state: CombatSimulationState): {
  readonly state: CombatSimulationState;
  readonly hunter: HunterEnemyState;
} {
  const next = stepCombatSimulation(state, FIXED_STEP_SECONDS);
  const hunter = hunterIn(next);
  if (hunter === undefined) {
    throw new Error('Fixture failed: the Hunter left the simulation mid-run.');
  }
  return { state: next, hunter };
}

async function waitForHunterTexture(
  harness: HunterSceneHarness,
): Promise<void> {
  for (let frames = 0; frames < 100; frames += 1) {
    harness.scene.update(0, 16.7);
    if (harness.scene.enemyTextureStates.get('hunter-drone') === 'ready') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Prepared Hunter texture never registered.');
}

describe('real CombatScene Hunter heading rendering (V021-AC-003)', () => {
  it('rotates the prepared Hunter artwork by the authoritative heading and scales it to the configured bounds', async () => {
    const state = committedHunterState();
    const hunter = hunterIn(state)!;
    // A committed Side Entry Hunter owns a non-zero heading; an unrotated
    // (no-op) presentation is a different, failing result.
    expect(hunter.headingRadians).not.toBe(0);
    const harness = await bootRealCombatScene([PREPARED_HUNTER_DRONE], state);
    activeCleanups.push(harness);
    const { scene } = harness;
    await waitForHunterTexture(harness);
    scene.update(0, 16.7);

    const visual = scene.enemyVisuals.get(hunter.id);
    expect(visual).toBeInstanceOf(Phaser.GameObjects.Image);
    const image = visual as Phaser.GameObjects.Image;
    expect(image.texture.key).toBe('enemy-visual-hunter-drone');
    // The rendered nose IS the ONE authoritative simulation heading, pivoting
    // about the authoritative centre.
    expect(image.rotation).toBeCloseTo(hunter.headingRadians, 9);
    expect(image.rotation).not.toBe(0);
    expect(image.x).toBeCloseTo(hunter.centerX, 6);
    expect(image.y).toBeCloseTo(hunter.centerY, 6);
    // The CONFIGURED complete rendered bounds scale the artwork; the enclosing
    // rotated AABB is simulation-only and must never stretch the sprite.
    expect(image.displayWidth).toBeCloseTo(hunter.visualWidth, 6);
    expect(image.displayHeight).toBeCloseTo(hunter.visualHeight, 6);
    expect(image.displayWidth).not.toBeCloseTo(hunter.width, 6);
    expect(image.displayHeight).not.toBeCloseTo(hunter.height, 6);
    // The prepared inline bytes are the ONE decode; the catalogue URL is never
    // requested by Combat (MASTER-AC-014).
    expect(srcAssignments.get(HUNTER_BYTES)).toBe(1);
    expect(srcAssignments.get(HUNTER_PATH)).toBeUndefined();

    // A later authoritative heading change — driven by a REAL Aircraft move
    // through the same simulation input a player produces — rotates the SAME
    // visual: no new object, no second decode, no presentation-owned direction.
    const firstRotation = image.rotation;
    let moved = submitCombatCommand(state, {
      type: 'combat/pointer-move',
      x: hunter.centerX + 260,
      y: state.aircraft.centerY,
    });
    let movedHunter = hunter;
    for (let step = 0; step < 10; step += 1) {
      const advanced = stepHunter(moved);
      moved = advanced.state;
      movedHunter = advanced.hunter;
    }
    expect(movedHunter.headingRadians).not.toBeCloseTo(firstRotation, 4);
    harness.holder.state = moved;
    scene.update(0, 16.7);
    const stillImage = scene.enemyVisuals.get(
      hunter.id,
    ) as Phaser.GameObjects.Image;
    expect(stillImage).toBe(image);
    expect(stillImage.rotation).toBeCloseTo(movedHunter.headingRadians, 9);
    expect(stillImage.rotation).not.toBeCloseTo(firstRotation, 4);
    expect(stillImage.x).toBeCloseTo(movedHunter.centerX, 6);
    expect(stillImage.y).toBeCloseTo(movedHunter.centerY, 6);
    expect(srcAssignments.get(HUNTER_BYTES)).toBe(1);
  });

  it('rotates the procedural Hunter fallback by the same heading and leaves every other role unrotated', async () => {
    const state = committedHunterState();
    const hunter = hunterIn(state)!;
    // One real Debug-authored Basic Drone shares the exact rendered frame, so
    // the Hunter-only nature of heading rotation is directly falsifiable.
    const withSibling = applyDebugCommand(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'basic-drone',
    });
    const other = withSibling.enemies.find((enemy) => enemy.kind !== 'hunter');
    if (other === undefined) {
      throw new Error('Fixture failed: no non-Hunter role in the frame.');
    }
    const harness = await bootRealCombatScene([], withSibling);
    activeCleanups.push(harness);
    const { scene } = harness;
    scene.update(0, 16.7);
    scene.update(0, 16.7);

    const visual = scene.enemyVisuals.get(hunter.id);
    expect(visual).toBeInstanceOf(Phaser.GameObjects.Graphics);
    const graphics = visual as Phaser.GameObjects.Graphics;
    expect(graphics.rotation).toBeCloseTo(hunter.headingRadians, 9);
    expect(graphics.rotation).not.toBe(0);
    expect(graphics.x).toBeCloseTo(hunter.centerX, 6);
    expect(graphics.y).toBeCloseTo(hunter.centerY, 6);
    // Heading rotation is Hunter-only: an ordinary role rendered in the same
    // frame keeps the axis-aligned orientation its geometry was authored for.
    const otherVisual = scene.enemyVisuals.get(other.id) as
      Phaser.GameObjects.Graphics | undefined;
    expect(otherVisual).toBeInstanceOf(Phaser.GameObjects.Graphics);
    expect(otherVisual?.rotation).toBe(0);
  });
});
