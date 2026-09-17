import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PreparedRuntimeAsset } from '@application/ports';
import {
  COMBAT_RENDER_DEPTH,
  resolveCombatGeometry,
} from '../presentation-config/combat-config';
import { enemyVisualMappingFor } from '../presentation-config/enemy-visuals';
import {
  EXIT_CENTRE_STEPS,
  FIXED_STEP_SECONDS,
  FIXED_STEPS_PER_SECOND,
  applyDebugCommand,
  eliteCannonProjectileGeometry,
  eliteCannonSpeedPxPerSecond,
  eliteCoreProjectileGeometry,
  eliteCoreSpeedPxPerSecond,
  spawnEliteCannonProjectile,
  spawnEliteHomingCore,
  stepCombatSimulation,
  submitCombatCommand,
} from '@application/combat';
import type {
  CombatSimulationState,
  EliteEnemyState,
} from '@application/combat';
import { createTestCombatState } from '@test-support/domain';
import { createCombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import type { CombatSceneContext } from './combat-scene';

/**
 * V02-WI-06 E03 real Combat presentation-boundary evidence (Epic §9.4, §16,
 * V02-AC-009/025).
 *
 * A genuine Phaser CANVAS game boots the REAL `CombatScene` under jsdom, driven
 * by the REAL Mission 03 fixed-step simulation state through the production
 * `CombatSceneContext`. The assertions inspect the scene's real GameObjects:
 * the Elite's prepared Armoured/Vulnerable texture swap (exactly one visual per
 * Elite), the approved procedural fallback for both states, the Elite cannon
 * rectangle and homing-Core diamond geometry/lifecycle, the authoritative local
 * Armoured deflection diamond, the one-request prepared-texture boundary, and
 * shutdown cleanup. jsdom cannot decode images or draw canvas, so the harness
 * stubs `Image` (fires load with usable dimensions), a no-op 2D context, and
 * requestAnimationFrame; the scene code, the engine object graph, and the
 * authoritative simulation are real.
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

const srcAssignments = new Map<string, number>();
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

/** Prepared elite asset URLs (unique per state kind, never re-requested). */
const ELITE_ARMOURED_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const ELITE_VULNERABLE_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOQ==';

const PREPARED_ELITE_ARMOURED: PreparedRuntimeAsset = {
  id: 'enemy-elite-drone-armoured',
  kind: 'enemy-image',
  sourcePath: 'assets/runtime/enemies/elite-drone-armoured.png',
  url: ELITE_ARMOURED_URL,
  status: 'ready',
};
const PREPARED_ELITE_VULNERABLE: PreparedRuntimeAsset = {
  id: 'enemy-elite-drone-vulnerable',
  kind: 'enemy-image',
  sourcePath: 'assets/runtime/enemies/elite-drone-vulnerable.png',
  url: ELITE_VULNERABLE_URL,
  status: 'ready',
};

function eliteIn(state: CombatSimulationState): EliteEnemyState | null {
  const elite = state.enemies.find((enemy) => enemy.kind === 'elite');
  return elite === undefined ? null : elite;
}

/**
 * The real Mission 03 pipeline driven to the exactly activated (Armoured)
 * Elite, with the existing `god-mode` development seam so the aircraft survives
 * the 05:20 arrival. No gameplay rule is altered for the presentation test.
 */
function activatedEliteState(): CombatSimulationState {
  const creationStep = 320 * FIXED_STEPS_PER_SECOND;
  let state = applyDebugCommand(
    createTestCombatState({ missionId: 'interception-03' }),
    { type: 'combat-debug/god-mode', enabled: true },
  );
  for (let step = 0; step < creationStep; step += 1) {
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
  }
  for (let step = 0; step < 400; step += 1) {
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    if (eliteIn(state)?.activated === true) {
      return state;
    }
  }
  throw new Error('Fixture failed: the Mission 03 Elite never activated.');
}

interface EliteSceneHarness {
  readonly game: InstanceType<PhaserModule['Game']>;
  readonly scene: Phaser.Scene & {
    enemyVisuals: Map<number, Phaser.GameObjects.GameObject>;
    enemyProjectileVisuals: Map<number, Phaser.GameObjects.Rectangle>;
    eliteCoreVisuals: Map<number, Phaser.GameObjects.Graphics>;
    eliteDeflectionVisuals: Map<number, Phaser.GameObjects.Graphics>;
    enemyVisualResolutions: Map<string, { readonly status: string }>;
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
): Promise<EliteSceneHarness> {
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
  ) as unknown as EliteSceneHarness['scene'];
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

const activeCleanups: EliteSceneHarness[] = [];
afterEach(() => {
  while (activeCleanups.length > 0) {
    activeCleanups.pop()!.dispose();
  }
  srcAssignments.clear();
});

/** Waits (deterministically) for one prepared enemy texture to register. */
async function waitForTexture(
  harness: EliteSceneHarness,
  kind: 'elite-drone-armoured' | 'elite-drone-vulnerable',
): Promise<void> {
  for (let frames = 0; frames < 100; frames += 1) {
    harness.scene.update(0, 16.7);
    if (harness.scene.enemyTextureStates.get(kind) === 'ready') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Prepared Elite texture ${kind} never registered.`);
}

/** Advances the real pipeline until the Elite reaches `phase`. */
function advanceUntilElitePhase(
  state: CombatSimulationState,
  phase: 'armoured' | 'vulnerable',
): CombatSimulationState {
  let current = state;
  for (let step = 0; step < 800; step += 1) {
    current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    if (eliteIn(current)?.phase === phase) {
      return current;
    }
  }
  throw new Error(`Fixture failed: the Elite never reached ${phase}.`);
}

describe('real CombatScene Elite presentation (V02-WI-06 E03)', () => {
  it('renders the prepared Armoured texture, swaps to Vulnerable on the authoritative phase change, requests each asset once, and cleans up on shutdown', async () => {
    const state = activatedEliteState();
    const elite = eliteIn(state);
    if (elite === null) {
      throw new Error('Fixture failed: no activated Elite.');
    }
    const harness = await bootRealCombatScene(
      [PREPARED_ELITE_ARMOURED, PREPARED_ELITE_VULNERABLE],
      state,
    );
    activeCleanups.push(harness);
    const { scene } = harness;
    await waitForTexture(harness, 'elite-drone-armoured');
    scene.update(0, 16.7);
    const armouredVisual = scene.enemyVisuals.get(elite.id);
    expect(armouredVisual).toBeInstanceOf(Phaser.GameObjects.Image);
    const armouredImage = armouredVisual as Phaser.GameObjects.Image;
    expect(armouredImage.texture.key).toBe('enemy-visual-elite-drone-armoured');
    expect(armouredImage.displayWidth).toBeCloseTo(elite.width, 6);
    expect(armouredImage.displayHeight).toBeCloseTo(elite.height, 6);
    expect(armouredImage.x).toBeCloseTo(elite.centerX, 6);
    expect(armouredImage.y).toBeCloseTo(elite.centerY, 6);
    // Exactly one visual for the one Elite, and no full-craft tint.
    expect(scene.enemyVisuals.size).toBe(1);
    expect(armouredImage.isTinted).toBe(false);

    // The authoritative Armoured → Vulnerable boundary swaps the ready state
    // texture without adding a second Elite visual.
    const vulnerableState = advanceUntilElitePhase(state, 'vulnerable');
    const vulnerableElite = eliteIn(vulnerableState);
    if (vulnerableElite === null) {
      throw new Error('Fixture failed: the Elite disappeared.');
    }
    expect(vulnerableElite.width).not.toBeCloseTo(elite.width, 6);
    harness.holder.state = vulnerableState;
    await waitForTexture(harness, 'elite-drone-vulnerable');
    scene.update(0, 16.7);
    const vulnerableVisual = scene.enemyVisuals.get(elite.id);
    expect(vulnerableVisual).toBeInstanceOf(Phaser.GameObjects.Image);
    const vulnerableImage = vulnerableVisual as Phaser.GameObjects.Image;
    expect(vulnerableImage.texture.key).toBe(
      'enemy-visual-elite-drone-vulnerable',
    );
    expect(vulnerableImage.displayWidth).toBeCloseTo(vulnerableElite.width, 6);
    expect(vulnerableImage.displayHeight).toBeCloseTo(
      vulnerableElite.height,
      6,
    );
    expect(vulnerableImage.x).toBeCloseTo(vulnerableElite.centerX, 6);
    expect(scene.enemyVisuals.size).toBe(1);
    expect(armouredImage.active).toBe(false);

    // Exactly one prepared request per elite state kind for the session.
    expect(srcAssignments.get(ELITE_ARMOURED_URL)).toBe(1);
    expect(srcAssignments.get(ELITE_VULNERABLE_URL)).toBe(1);

    // Shutdown cleanup releases every Elite-owned visual map.
    harness.dispose();
    // `Game.destroy()` defers the actual teardown to the next game step, so the
    // scene-owned disposal handler runs on the following frame.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(scene.enemyVisuals.size).toBe(0);
    expect(scene.enemyProjectileVisuals.size).toBe(0);
    expect(scene.eliteCoreVisuals.size).toBe(0);
    expect(scene.eliteDeflectionVisuals.size).toBe(0);
  });

  it('renders both Elite states from the approved procedural fallback when no prepared asset is available, reusing one surface', async () => {
    const state = activatedEliteState();
    const elite = eliteIn(state);
    if (elite === null) {
      throw new Error('Fixture failed: no activated Elite.');
    }
    const harness = await bootRealCombatScene([], state);
    activeCleanups.push(harness);
    const { scene } = harness;
    scene.update(0, 16.7);
    // Both Elite kinds resolved to their approved stable fallback for the
    // session (never to a regular-role kind).
    expect(
      scene.enemyVisualResolutions.get('elite-drone-armoured')?.status,
    ).toBe('fallback');
    expect(
      scene.enemyVisualResolutions.get('elite-drone-vulnerable')?.status,
    ).toBe('fallback');
    const visual = scene.enemyVisuals.get(elite.id);
    expect(visual).toBeInstanceOf(Phaser.GameObjects.Graphics);
    expect(scene.enemyVisuals.size).toBe(1);
    // The two approved Elite fallbacks differ by geometry, not by colour alone
    // (Epic §16.5: the Vulnerable state exposes the centred Core opening).
    expect(
      enemyVisualMappingFor('elite-drone-armoured').fallback.shapes,
    ).not.toEqual(
      enemyVisualMappingFor('elite-drone-vulnerable').fallback.shapes,
    );

    // The authoritative phase change redraws the SAME single fallback surface
    // for the Vulnerable state: one visual per Elite, no second object.
    const vulnerableState = advanceUntilElitePhase(state, 'vulnerable');
    harness.holder.state = vulnerableState;
    scene.update(0, 16.7);
    expect(scene.enemyVisuals.get(elite.id)).toBe(visual);
    expect(scene.enemyVisuals.size).toBe(1);
  });

  it('renders the Elite cannon rectangle, the homing-Core diamond, and the local Armoured deflection from authoritative geometry only', async () => {
    const state = activatedEliteState();
    const elite = eliteIn(state);
    if (elite === null) {
      throw new Error('Fixture failed: no activated Elite.');
    }
    const shortSide = Math.min(state.viewportWidth, state.viewportHeight);
    // The two Elite attacks are created by their real spawn owners, exactly as
    // the simulation creates them (no test-invented geometry).
    const cannon = spawnEliteCannonProjectile(
      900,
      elite.centerX,
      elite.centerY,
      elite.width,
      elite.height,
      'left',
      eliteCannonSpeedPxPerSecond(state.viewportHeight),
      eliteCannonProjectileGeometry(shortSide),
    );
    const core = spawnEliteHomingCore(
      901,
      elite.centerX,
      elite.centerY,
      elite.height,
      state.aircraft.centerX,
      state.aircraft.centerY,
      eliteCoreSpeedPxPerSecond(state.viewportHeight),
      eliteCoreProjectileGeometry(shortSide),
    );
    const deflection = {
      enemyId: elite.id,
      impactCenterX: elite.centerX + 40,
      impactCenterY: elite.centerY + 10,
      stepsRemaining: 3,
    };
    const harness = await bootRealCombatScene([], {
      ...state,
      enemyProjectiles: [cannon, core],
      eliteDeflectionFeedbacks: { [elite.id]: deflection },
    });
    activeCleanups.push(harness);
    const { scene } = harness;
    const geometry = resolveCombatGeometry({ width: 1280, height: 600 });
    scene.update(0, 16.7);

    // Cannon: a solid VERTICAL `danger` rectangle whose complete bounds equal
    // the projectile's authoritative AABB.
    const cannonVisual = scene.enemyProjectileVisuals.get(cannon.id);
    expect(cannonVisual).toBeInstanceOf(Phaser.GameObjects.Rectangle);
    expect(cannonVisual!.width).toBeCloseTo(cannon.width, 6);
    expect(cannonVisual!.height).toBeCloseTo(cannon.height, 6);
    expect(cannonVisual!.height).toBeGreaterThan(cannonVisual!.width);
    expect(cannonVisual!.x).toBeCloseTo(cannon.centerX, 6);
    expect(cannonVisual!.y).toBeCloseTo(cannon.centerY, 6);
    expect(cannonVisual!.depth).toBe(COMBAT_RENDER_DEPTH.projectile);
    expect(cannonVisual!.fillColor).toBe(
      Number.parseInt(geometry.eliteCannonProjectileColor.slice(1), 16),
    );

    // Core: a solid `accent` diamond centred on the authoritative square AABB
    // (and never a rectangle on the Ranged surface).
    const coreVisual = scene.eliteCoreVisuals.get(core.id);
    expect(coreVisual).toBeInstanceOf(Phaser.GameObjects.Graphics);
    expect(coreVisual!.x).toBeCloseTo(core.centerX, 6);
    expect(coreVisual!.y).toBeCloseTo(core.centerY, 6);
    expect(coreVisual!.depth).toBe(COMBAT_RENDER_DEPTH.projectile);
    expect(scene.enemyProjectileVisuals.has(core.id)).toBe(false);

    // Deflection: exactly one local diamond at the stored impact point, with the
    // exact `1.2%` short-side size, and the Elite itself is never tinted.
    const deflectionVisual = scene.eliteDeflectionVisuals.get(elite.id);
    expect(deflectionVisual).toBeInstanceOf(Phaser.GameObjects.Graphics);
    expect(deflectionVisual!.x).toBeCloseTo(deflection.impactCenterX, 6);
    expect(deflectionVisual!.y).toBeCloseTo(deflection.impactCenterY, 6);
    expect(geometry.eliteDeflectionSizeRatio).toBe(0.012);
    expect(scene.enemyVisuals.get(elite.id)).toBeInstanceOf(
      Phaser.GameObjects.Graphics,
    );

    // Lifecycle: once the authoritative projectiles/record are gone, every
    // Elite-owned projectile and feedback surface is destroyed with no residue.
    const lastCannon = cannonVisual;
    const lastCore = coreVisual;
    const lastDeflection = deflectionVisual;
    harness.holder.state = {
      ...state,
      enemyProjectiles: [],
      eliteDeflectionFeedbacks: {},
    };
    scene.update(0, 16.7);
    expect(scene.enemyProjectileVisuals.size).toBe(0);
    expect(scene.eliteCoreVisuals.size).toBe(0);
    expect(scene.eliteDeflectionVisuals.size).toBe(0);
    expect(lastCannon?.active).toBe(false);
    expect(lastCore?.active).toBe(false);
    expect(lastDeflection?.active).toBe(false);
  });

  it('follows the authoritative Elite centre and bounds through a viewport resize without recreating the visual', async () => {
    const state = activatedEliteState();
    const elite = eliteIn(state);
    if (elite === null) {
      throw new Error('Fixture failed: no activated Elite.');
    }
    const harness = await bootRealCombatScene([], state);
    activeCleanups.push(harness);
    const { scene } = harness;
    scene.update(0, 16.7);
    const visual = scene.enemyVisuals.get(elite.id);
    expect(visual).toBeInstanceOf(Phaser.GameObjects.Graphics);

    const resized = submitCombatCommand(state, {
      type: 'combat/viewport-resize',
      width: 900,
      height: 700,
      aircraftWidth: state.aircraftWidth,
      aircraftHeight: state.aircraftHeight,
    });
    const resizedElite = eliteIn(resized);
    if (resizedElite === null) {
      throw new Error('Fixture failed: the Elite disappeared on resize.');
    }
    expect(resizedElite.centerX).not.toBeCloseTo(elite.centerX, 6);
    harness.holder.state = resized;
    scene.update(0, 16.7);
    // The same single visual follows the reprojected authoritative centre.
    expect(scene.enemyVisuals.get(elite.id)).toBe(visual);
    const graphics = visual as Phaser.GameObjects.Graphics;
    expect(graphics.x).toBeCloseTo(resizedElite.centerX, 6);
    expect(graphics.y).toBeCloseTo(resizedElite.centerY, 6);
    expect(scene.enemyVisuals.size).toBe(1);
  });

  it('fades the Elite surface with the authoritative Evacuation opacity and removes it at exact zero without recreation', async () => {
    const state = activatedEliteState();
    const elite = eliteIn(state);
    if (elite === null) {
      throw new Error('Fixture failed: no activated Elite.');
    }
    // The exact zero step freezes an immutable Evacuated terminal while the
    // crafted Elite remains active.
    const frozen = stepCombatSimulation(
      { ...state, evacuationStepsRemaining: 1 },
      FIXED_STEP_SECONDS,
    );
    expect(frozen.terminalResult?.kind).toBe('evacuated');
    expect(eliteIn(frozen)).not.toBeNull();
    const harness = await bootRealCombatScene([], frozen);
    activeCleanups.push(harness);
    const { scene, holder } = harness;
    scene.update(0, 16.7);
    expect(scene.enemyVisuals.has(elite.id)).toBe(true);

    // The commitment authorizes the shared exit; the fade shares its 30 steps.
    let current = { ...holder.state, exitAuthorized: true };
    holder.state = current;
    let lastVisual = scene.enemyVisuals.get(elite.id);
    for (let step = 1; step <= EXIT_CENTRE_STEPS; step += 1) {
      lastVisual = scene.enemyVisuals.get(elite.id);
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
      holder.state = current;
      scene.update(0, 16.7);
      if (step < EXIT_CENTRE_STEPS) {
        const faded = scene.enemyVisuals.get(elite.id);
        expect((faded as Phaser.GameObjects.Graphics).alpha).toBeCloseTo(
          (EXIT_CENTRE_STEPS - step) / EXIT_CENTRE_STEPS,
          6,
        );
      }
    }
    // Exact zero: the surface is destroyed even though the frozen Elite remains.
    expect(scene.simState.enemies).toHaveLength(1);
    expect(scene.enemyVisuals.has(elite.id)).toBe(false);
    expect(lastVisual?.active).toBe(false);

    // Fly-up frames never recreate the faded Elite surface.
    for (let step = 0; step < 12; step += 1) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
      holder.state = current;
      scene.update(0, 16.7);
      expect(scene.enemyVisuals.has(elite.id)).toBe(false);
    }
    expect(scene.simState.exitPhase).toBe('fly-up');
  });

  it('fades a live Elite deflection record and the Elite cannon/Core surfaces with the authoritative Evacuation opacity, destroys them at exact zero, and never recreates them during fly-up', async () => {
    const state = activatedEliteState();
    const elite = eliteIn(state);
    if (elite === null) {
      throw new Error('Fixture failed: no activated Elite.');
    }
    const shortSide = Math.min(state.viewportWidth, state.viewportHeight);
    const cannon = spawnEliteCannonProjectile(
      910,
      elite.centerX,
      elite.centerY,
      elite.width,
      elite.height,
      'right',
      eliteCannonSpeedPxPerSecond(state.viewportHeight),
      eliteCannonProjectileGeometry(shortSide),
    );
    const core = spawnEliteHomingCore(
      911,
      elite.centerX,
      elite.centerY,
      elite.height,
      state.aircraft.centerX,
      state.aircraft.centerY,
      eliteCoreSpeedPxPerSecond(state.viewportHeight),
      eliteCoreProjectileGeometry(shortSide),
    );
    const deflection = {
      enemyId: elite.id,
      impactCenterX: elite.centerX + 40,
      impactCenterY: elite.centerY + 10,
      stepsRemaining: 3,
    };
    // The exact zero step freezes the immutable Evacuated terminal with the
    // Elite, both Elite projectiles, and a LIVE deflection record.
    const frozen = stepCombatSimulation(
      {
        ...state,
        evacuationStepsRemaining: 1,
        enemyProjectiles: [cannon, core],
        eliteDeflectionFeedbacks: { [elite.id]: deflection },
      },
      FIXED_STEP_SECONDS,
    );
    expect(frozen.terminalResult?.kind).toBe('evacuated');
    expect(eliteIn(frozen)).not.toBeNull();
    expect(frozen.enemyProjectiles).toHaveLength(2);
    // After the terminal there is no further simulation step, so this record can
    // never decrement again: the authoritative opacity scalar is the only
    // terminal-fade authority left.
    expect(frozen.eliteDeflectionFeedbacks[elite.id]).toBeDefined();

    const harness = await bootRealCombatScene([], frozen);
    activeCleanups.push(harness);
    const { scene, holder } = harness;
    scene.update(0, 16.7);
    // The pre-commit freeze keeps every Elite-owned surface at full opacity.
    expect(
      (scene.enemyVisuals.get(elite.id) as Phaser.GameObjects.Graphics).alpha,
    ).toBeCloseTo(1, 6);
    expect(
      (
        scene.enemyProjectileVisuals.get(
          cannon.id,
        ) as Phaser.GameObjects.Rectangle
      ).alpha,
    ).toBeCloseTo(1, 6);
    expect(
      (scene.eliteCoreVisuals.get(core.id) as Phaser.GameObjects.Graphics)
        .alpha,
    ).toBeCloseTo(1, 6);
    expect(
      (
        scene.eliteDeflectionVisuals.get(
          elite.id,
        ) as Phaser.GameObjects.Graphics
      ).alpha,
    ).toBeCloseTo(1, 6);

    let current = { ...holder.state, exitAuthorized: true };
    holder.state = current;
    let lastElite = scene.enemyVisuals.get(elite.id);
    let lastCannon = scene.enemyProjectileVisuals.get(cannon.id);
    let lastCore = scene.eliteCoreVisuals.get(core.id);
    let lastDeflection = scene.eliteDeflectionVisuals.get(elite.id);
    for (let step = 1; step <= EXIT_CENTRE_STEPS; step += 1) {
      lastElite = scene.enemyVisuals.get(elite.id);
      lastCannon = scene.enemyProjectileVisuals.get(cannon.id);
      lastCore = scene.eliteCoreVisuals.get(core.id);
      lastDeflection = scene.eliteDeflectionVisuals.get(elite.id);
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
      holder.state = current;
      scene.update(0, 16.7);
      const expected = (EXIT_CENTRE_STEPS - step) / EXIT_CENTRE_STEPS;
      if (step < EXIT_CENTRE_STEPS) {
        expect(
          (scene.enemyVisuals.get(elite.id) as Phaser.GameObjects.Graphics)
            .alpha,
        ).toBeCloseTo(expected, 6);
        expect(
          (
            scene.enemyProjectileVisuals.get(
              cannon.id,
            ) as Phaser.GameObjects.Rectangle
          ).alpha,
        ).toBeCloseTo(expected, 6);
        expect(
          (scene.eliteCoreVisuals.get(core.id) as Phaser.GameObjects.Graphics)
            .alpha,
        ).toBeCloseTo(expected, 6);
        expect(
          (
            scene.eliteDeflectionVisuals.get(
              elite.id,
            ) as Phaser.GameObjects.Graphics
          ).alpha,
        ).toBeCloseTo(expected, 6);
      }
      if (step === 1) {
        // The frozen authoritative record is still live during the fade.
        expect(
          current.eliteDeflectionFeedbacks[elite.id]?.stepsRemaining,
        ).toBeGreaterThan(0);
      }
    }
    // At exact zero every Elite-owned surface is destroyed and removed even
    // though the frozen record still exists.
    expect(current.eliteDeflectionFeedbacks[elite.id]).toBeDefined();
    expect(scene.enemyVisuals.has(elite.id)).toBe(false);
    expect(scene.enemyProjectileVisuals.has(cannon.id)).toBe(false);
    expect(scene.eliteCoreVisuals.has(core.id)).toBe(false);
    expect(scene.eliteDeflectionVisuals.has(elite.id)).toBe(false);
    expect(lastElite?.active).toBe(false);
    expect(lastCannon?.active).toBe(false);
    expect(lastCore?.active).toBe(false);
    expect(lastDeflection?.active).toBe(false);

    // Fly-up frames must never recreate any Elite-owned surface.
    for (let step = 0; step < 12; step += 1) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
      holder.state = current;
      scene.update(0, 16.7);
      expect(scene.enemyVisuals.has(elite.id)).toBe(false);
      expect(scene.enemyProjectileVisuals.has(cannon.id)).toBe(false);
      expect(scene.eliteCoreVisuals.has(core.id)).toBe(false);
      expect(scene.eliteDeflectionVisuals.has(elite.id)).toBe(false);
    }
    expect(scene.simState.exitPhase).toBe('fly-up');
  });
});
