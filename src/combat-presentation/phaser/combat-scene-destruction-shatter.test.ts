import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PreparedRuntimeAsset } from '@application/ports';
import {
  DESTRUCTION_SHATTER_ELITE_STEPS,
  DESTRUCTION_SHATTER_REGULAR_STEPS,
  FIXED_STEP_SECONDS,
  stepCombatSimulation,
  type CombatEnemy,
  type CombatSimulationState,
  type DestructionShatter,
} from '@application/combat';
import { createTestCombatState } from '@test-support/domain';
import { createCombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import { resolveCombatGeometry } from '../presentation-config/combat-config';
import {
  destructionShatterGeometry,
  type ShatterRingGeometry,
} from '../presentation-config/destruction-shatter';
import type { CombatSceneContext } from './combat-scene';

/**
 * V021-WI-05 real-renderer destruction-shatter evidence (patch §4.1,
 * V021-DEC-005, V021-AC-009).
 *
 * A genuine Phaser CANVAS game boots the REAL `CombatScene` under jsdom, driven
 * by the REAL fixed-step simulation through the production `CombatSceneContext`,
 * and the assertions read the fills the REAL canvas renderer produced. jsdom
 * cannot rasterise, so the harness replaces the 2D context with a MEASURING one
 * that consumes exactly the draw commands Phaser's real
 * `GraphicsCanvasRenderer` emits, transforms every filled outline into canvas
 * space and measures its extent, vertex count, colour-with-alpha string and
 * distance from the authoritative destruction centre. Nothing here reads the
 * scene source: a renderer that still drew the superseded white square, a filled
 * rectangle, a straight ring, a role-independent fragment count, or an effect
 * that ignored its record's age produces different measured fills.
 *
 * Proven here: the six-fragment/one-broken-ring regular burst with its two-step
 * `text-primary` glint, the ten-fragment Elite burst with its second broken ring
 * from effect step `4` (`ageSteps` `3`), ring growth from `0.20` to `0.80` and
 * fragment travel to at most `0.60` of the destroyed enemy's complete visual
 * dimension, monotone shrink/fade, prepared-versus-fallback pixel equality, no
 * rectangular white
 * block, terminal-fade multiplication with removal at exact zero, own-expiry
 * removal, and inert late frames, resize and disposal.
 */

type Point = { readonly x: number; readonly y: number };

interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** One filled outline the real renderer emitted, in canvas (viewport) space. */
interface RenderedFill {
  /** The rendered `rgba(...)` string (Phaser writes the fill alpha into it). */
  readonly colour: string;
  /** The GameObject alpha in effect while the fill was drawn. */
  readonly objectAlpha: number;
  readonly vertices: number;
  readonly points: readonly Point[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function multiplyMatrix(outer: Matrix, inner: Matrix): Matrix {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

function applyMatrix(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/** Every fill the real renderer drew for the running test, in draw order. */
let renderedFills: RenderedFill[] = [];

/** The completed rendered frames the measuring context observed, in order. One
 *  entry per canvas frame (delimited by the renderer's frame-start clear), so a
 *  test can measure exactly ONE frame instead of accumulating duplicates. */
let renderedFrames: RenderedFill[][] = [];
let currentFrameFills: RenderedFill[] = [];

class MeasuringContext {
  readonly canvas = { width: 1280, height: 600 };
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  imageSmoothingEnabled = true;
  private matrix: Matrix = IDENTITY;
  private readonly savedMatrices: Matrix[] = [];
  private subpaths: Point[][] = [];
  private current: Point[] = [];

  save(): void {
    this.savedMatrices.push(this.matrix);
  }

  restore(): void {
    this.matrix = this.savedMatrices.pop() ?? this.matrix;
  }

  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void {
    this.matrix = { a, b, c, d, e, f };
  }

  translate(x: number, y: number): void {
    this.matrix = multiplyMatrix(this.matrix, {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: x,
      f: y,
    });
  }

  scale(x: number, y: number): void {
    this.matrix = multiplyMatrix(this.matrix, {
      a: x,
      b: 0,
      c: 0,
      d: y,
      e: 0,
      f: 0,
    });
  }

  rotate(radians: number): void {
    this.matrix = multiplyMatrix(this.matrix, {
      a: Math.cos(radians),
      b: Math.sin(radians),
      c: -Math.sin(radians),
      d: Math.cos(radians),
      e: 0,
      f: 0,
    });
  }

  beginPath(): void {
    this.subpaths = [];
    this.current = [];
  }

  moveTo(x: number, y: number): void {
    this.flushCurrent();
    this.current = [{ x, y }];
  }

  lineTo(x: number, y: number): void {
    this.current.push({ x, y });
  }

  closePath(): void {
    this.flushCurrent();
  }

  /** A real rectangular fill: the superseded white square used exactly this. */
  rect(x: number, y: number, width: number, height: number): void {
    this.flushCurrent();
    this.subpaths.push([
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.record([
      [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
    ]);
  }

  arc(
    centerX: number,
    centerY: number,
    radius: number,
    startRadians: number,
    endRadians: number,
  ): void {
    const steps = 32;
    for (let step = 0; step <= steps; step += 1) {
      const angle = startRadians + ((endRadians - startRadians) * step) / steps;
      const point = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
      if (step === 0) {
        this.flushCurrent();
        this.current = [point];
      } else {
        this.current.push(point);
      }
    }
  }

  fill(): void {
    this.flushCurrent();
    this.record(this.subpaths);
  }

  stroke(): void {
    // Strokes are never part of the approved solid burst.
  }

  clearRect(): void {
    // The canvas renderer clears once per frame; that clear is the frame
    // boundary this harness measures by.
    renderedFrames.push(currentFrameFills);
    currentFrameFills = [];
    renderedFills = [];
  }

  drawImage(): void {}

  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }

  createRadialGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }

  createPattern(): null {
    return null;
  }

  measureText(): { width: number } {
    return { width: 0 };
  }

  getImageData(
    _x: number,
    _y: number,
    width: number,
    height: number,
  ): { width: number; height: number; data: Uint8ClampedArray } {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }

  createImageData(
    width: number,
    height: number,
  ): { width: number; height: number; data: Uint8ClampedArray } {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }

  private flushCurrent(): void {
    if (this.current.length > 0) {
      this.subpaths.push(this.current);
      this.current = [];
    }
  }

  private record(subpaths: readonly (readonly Point[])[]): void {
    const transformed = subpaths
      .map((subpath) => subpath.map((point) => applyMatrix(this.matrix, point)))
      .filter((subpath) => subpath.length > 0);
    if (transformed.length === 0) {
      return;
    }
    const points = transformed.flat();
    const fill: RenderedFill = {
      colour: String(this.fillStyle),
      objectAlpha: this.globalAlpha,
      vertices: transformed[0]!.length,
      points: transformed[0]!,
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
    renderedFills.push(fill);
    currentFrameFills.push(fill);
  }
}

/** The measuring context: Phaser probes optional 2D-context features, so any
 *  unmeasured call is absorbed exactly as the existing jsdom harnesses do. */
function createMeasuringContext(): MeasuringContext {
  const context = new MeasuringContext();
  return new Proxy(context, {
    get(target, property) {
      if (property in target) {
        return (target as unknown as Record<string, unknown>)[
          property as string
        ];
      }
      return () => undefined;
    },
    set(target, property, value) {
      (target as unknown as Record<string, unknown>)[property as string] =
        value;
      return true;
    },
  });
}

/** Minimal fake Phaser module/class handles resolved once for the suite. */
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
    value: () => createMeasuringContext(),
  });
  Object.defineProperty(window, 'CanvasRenderingContext2D', {
    configurable: true,
    value: MeasuringContext,
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

/** Prepared enemy bytes for the prepared-versus-fallback comparison. */
const PREPARED_BASIC_DRONE: PreparedRuntimeAsset = {
  id: 'enemy-basic-drone',
  kind: 'enemy-image',
  sourcePath: 'assets/runtime/enemies/basic-drone.png',
  url: '/enemies/basic-drone.png',
  imageDataUri:
    'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  status: 'ready',
};

interface ShatterSceneHarness {
  readonly game: InstanceType<PhaserModule['Game']>;
  readonly scene: Phaser.Scene & {
    destructionShatterVisuals: Map<number, Phaser.GameObjects.Graphics>;
    enemyVisuals: Map<number, Phaser.GameObjects.GameObject>;
    simState: CombatSimulationState;
    update: (time: number, delta: number) => void;
  };
  readonly holder: { state: CombatSimulationState };
  readonly dispose: () => void;
}

async function bootRealCombatScene(
  preparedAssets: readonly PreparedRuntimeAsset[],
  initial: CombatSimulationState,
): Promise<ShatterSceneHarness> {
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
  // Let boot, default textures, and the first rendered frames settle.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const scene = game.scene.getScene(
    'combat',
  ) as unknown as ShatterSceneHarness['scene'];
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

const activeCleanups: ShatterSceneHarness[] = [];
afterEach(() => {
  while (activeCleanups.length > 0) {
    activeCleanups.pop()!.dispose();
  }
  renderedFills = [];
  renderedFrames = [];
  currentFrameFills = [];
});

/**
 * Boots the real scene on one authoritative state and waits until the real
 * renderer has drawn at least one complete frame, returning exactly ONE frame's
 * fills. A renderer that never draws the state under test fails here rather than
 * silently passing, and cross-frame accumulation can never inflate a count.
 */
async function bootAndMeasureFrame(
  preparedAssets: readonly PreparedRuntimeAsset[],
  state: CombatSimulationState,
): Promise<{
  readonly harness: ShatterSceneHarness;
  readonly fills: readonly RenderedFill[];
}> {
  const harness = await bootRealCombatScene(preparedAssets, state);
  activeCleanups.push(harness);
  return { harness, fills: await measureNextFrame(harness, state) };
}

async function measureNextFrame(
  harness: ShatterSceneHarness,
  state: CombatSimulationState,
): Promise<readonly RenderedFill[]> {
  harness.holder.state = state;
  const before = renderedFrames.length;
  harness.scene.update(0, 16.7);
  const start = Date.now();
  // Four frame boundaries guarantee that the measured frame was rendered after
  // this state was set (in-flight frames cannot leak the previous state in).
  while (renderedFrames.length < before + 4) {
    if (Date.now() - start > 5000) {
      throw new Error(
        'The real renderer drew no destruction-shatter frame under this state.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return renderedFrames[renderedFrames.length - 2]!;
}

const TEST_GEOMETRY = resolveCombatGeometry({ width: 1280, height: 600 });
const DANGER_COLOUR = TEST_GEOMETRY.shatterFragmentColor;
const HIGHLIGHT_COLOUR = TEST_GEOMETRY.shatterHighlightColor;
const DESTRUCTION_CENTRE = { x: 640, y: 200 } as const;
const BURST_SIZE = 48;
const BURST_ENEMY_ID = 3;

/**
 * The authoritative state under test: one destruction record plus explicit
 * terminal facts, and no other surface that could paint `danger` or
 * `text-primary` into the measured frame (the harness never steps the
 * simulation, so no player projectiles exist and the aircraft fallback keeps
 * its own light-grey colour).
 */
function shatterState(input: {
  readonly variant: 'regular' | 'elite';
  readonly ageSteps: number;
  readonly enemyId?: number;
  readonly withEnemy?: boolean;
  readonly terminal?: CombatSimulationState['terminalResult'];
  readonly exitAuthorized?: boolean;
  readonly exitPhase?: CombatSimulationState['exitPhase'];
  readonly exitCentreStepsRemaining?: number;
  readonly defeatFadeStepsRemaining?: number;
}): CombatSimulationState {
  const base = createTestCombatState({ mode: 'keyboard' });
  return {
    ...base,
    enemies: input.withEnemy === true ? [testBasicEnemy(base)] : [],
    projectiles: [],
    enemyProjectiles: [],
    eliteDeflectionFeedbacks: {},
    activeEnemyFlashStepsRemaining: {},
    aircraftDangerFlashStepsRemaining: 0,
    arrivalGroups: [],
    arrivalGroupIndex: 0,
    terminalResult: input.terminal ?? null,
    exitAuthorized: input.exitAuthorized ?? base.exitAuthorized,
    exitPhase: input.exitPhase ?? base.exitPhase,
    exitCentreStepsRemaining:
      input.exitCentreStepsRemaining ?? base.exitCentreStepsRemaining,
    defeatFadeStepsRemaining:
      input.defeatFadeStepsRemaining ?? base.defeatFadeStepsRemaining,
    destructionShatters: [
      {
        enemyId: input.enemyId ?? BURST_ENEMY_ID,
        centerX: DESTRUCTION_CENTRE.x,
        centerY: DESTRUCTION_CENTRE.y,
        size: BURST_SIZE,
        variant: input.variant,
        totalSteps:
          input.variant === 'elite'
            ? DESTRUCTION_SHATTER_ELITE_STEPS
            : DESTRUCTION_SHATTER_REGULAR_STEPS,
        ageSteps: input.ageSteps,
      },
    ],
  };
}

/**
 * One Basic Drone of the authored identity, used to exercise the prepared and
 * procedural-fallback enemy paths beside the same destruction record.
 */
function testBasicEnemy(state: CombatSimulationState): CombatEnemy {
  const bounds = state.enemyBoundsByType['basic-drone'];
  return {
    id: 11,
    kind: 'basic',
    type: 'basic-drone',
    hullIntegrity: 3,
    centerX: 300,
    centerY: 120,
    width: bounds.width,
    height: bounds.height,
    entry: 'top',
    hasEnteredVisibleArea: true,
    activated: true,
    ordinal: 11,
  };
}

function rgbOf(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** The `rgba(...)` fill Phaser wrote, split into its rendered components. */
function parseFill(fill: RenderedFill): {
  r: number;
  g: number;
  b: number;
  alpha: number;
} {
  const match = /rgba?\(([^)]+)\)/.exec(fill.colour);
  if (match === null) {
    return { r: 0, g: 0, b: 0, alpha: 1 };
  }
  const parts = match[1]!.split(',').map((part) => Number(part.trim()));
  return {
    r: parts[0] ?? 0,
    g: parts[1] ?? 0,
    b: parts[2] ?? 0,
    alpha: parts[3] ?? 1,
  };
}

/** Nearest-vertex distance of one fill from the destruction centre. */
function distanceFromCentre(fill: RenderedFill): number {
  return Math.min(
    ...fill.points.map((point) =>
      Math.hypot(
        point.x - DESTRUCTION_CENTRE.x,
        point.y - DESTRUCTION_CENTRE.y,
      ),
    ),
  );
}

/** Farthest-vertex distance of one fill from the destruction centre. */
function farthestFromCentre(fill: RenderedFill): number {
  return Math.max(
    ...fill.points.map((point) =>
      Math.hypot(
        point.x - DESTRUCTION_CENTRE.x,
        point.y - DESTRUCTION_CENTRE.y,
      ),
    ),
  );
}

/** The fill's own centre (mean of its outline vertices). */
function centroidDistance(fill: RenderedFill): number {
  const count = fill.points.length;
  const meanX = fill.points.reduce((sum, point) => sum + point.x, 0) / count;
  const meanY = fill.points.reduce((sum, point) => sum + point.y, 0) / count;
  return Math.hypot(meanX - DESTRUCTION_CENTRE.x, meanY - DESTRUCTION_CENTRE.y);
}

/** Longest pairwise vertex distance (a monotone shrink proxy for a fragment). */
function outlineSpan(fill: RenderedFill): number {
  let span = 0;
  for (const from of fill.points) {
    for (const to of fill.points) {
      span = Math.max(span, Math.hypot(to.x - from.x, to.y - from.y));
    }
  }
  return span;
}

/** Every fill of ONE measured frame drawn in one exact colour inside the burst. */
function burstFillsOf(
  fills: readonly RenderedFill[],
  hex: string,
): readonly RenderedFill[] {
  const rgb = rgbOf(hex);
  return fills.filter((fill) => {
    const parsed = parseFill(fill);
    return (
      parsed.r === rgb.r &&
      parsed.g === rgb.g &&
      parsed.b === rgb.b &&
      distanceFromCentre(fill) <= BURST_SIZE
    );
  });
}

/** The distinct outline corners of one fill, in draw order. */
function distinctPoints(fill: RenderedFill): readonly Point[] {
  const seen = new Set<string>();
  const corners: Point[] = [];
  for (const point of fill.points) {
    const key = `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    corners.push(point);
  }
  return corners;
}

/** Number of distinct outline corners (Phaser repeats the first point when it
 *  closes a path, so a triangle records four points and a rectangle five). */
function distinctCorners(fill: RenderedFill): number {
  return distinctPoints(fill).length;
}

/** The mid-band radius of one broken-ring segment band. */
function ringMidRadius(fill: RenderedFill): number {
  return (distanceFromCentre(fill) + farthestFromCentre(fill)) / 2;
}

/** A comparable signature of one burst fill (geometry plus rendered alpha). */
function fillSignature(fill: RenderedFill): string {
  return [
    distinctCorners(fill),
    fill.minX.toFixed(3),
    fill.maxX.toFixed(3),
    fill.minY.toFixed(3),
    fill.maxY.toFixed(3),
    parseFill(fill).alpha.toFixed(6),
  ].join('|');
}

/** Four distinct corners: a rectangular block, which the burst never paints. */
function isRectangle(fill: RenderedFill): boolean {
  return distinctCorners(fill) === 4;
}

const RING_VERTICES = 14;
const FRAGMENT_VERTICES = 3;
const GLINT_VERTICES = 8;
const RING_BAND_RATIO = 0.055;

describe('real CombatScene destruction shatter (V021-WI-05, V021-DEC-005)', () => {
  it('paints six danger fragments, one broken ring and a two-step text-primary glint with no rectangular block (fallback assets at 1280×600)', async () => {
    const { fills } = await bootAndMeasureFrame(
      [],
      shatterState({ variant: 'regular', ageSteps: 0 }),
    );

    const danger = burstFillsOf(fills, DANGER_COLOUR);
    const highlight = burstFillsOf(fills, HIGHLIGHT_COLOUR);
    // Four broken-ring segments and six tapered fragments in `danger`.
    expect(
      danger.filter((fill) => distinctCorners(fill) === RING_VERTICES),
    ).toHaveLength(4);
    expect(
      danger.filter((fill) => distinctCorners(fill) === FRAGMENT_VERTICES),
    ).toHaveLength(6);
    expect(danger).toHaveLength(10);
    // Six fragment highlights plus the eight-vertex four-point glint.
    expect(
      highlight.filter((fill) => distinctCorners(fill) === FRAGMENT_VERTICES),
    ).toHaveLength(6);
    expect(
      highlight.filter((fill) => distinctCorners(fill) === GLINT_VERTICES),
    ).toHaveLength(1);
    expect(highlight).toHaveLength(7);
    // Every burst fill is fully opaque on the creation step.
    expect(
      [...danger, ...highlight].map((fill) => parseFill(fill).alpha),
    ).toEqual(new Array<number>(17).fill(1));

    // The ring starts at `0.20 × size` (mid-band radius, band `0.055 × size`).
    const ring = danger.filter(
      (fill) => distinctCorners(fill) === RING_VERTICES,
    );
    const ringNear = Math.min(...ring.map(distanceFromCentre));
    const ringFar = Math.max(...ring.map(farthestFromCentre));
    expect(ringNear).toBeGreaterThan(
      BURST_SIZE * 0.2 - BURST_SIZE * RING_BAND_RATIO,
    );
    expect(ringFar).toBeLessThan(
      BURST_SIZE * 0.2 + BURST_SIZE * RING_BAND_RATIO,
    );
    // The glint is small: its extent is `0.16 × size`.
    const glint = highlight.filter(
      (fill) => distinctCorners(fill) === GLINT_VERTICES,
    );
    expect(Math.max(...glint.map(farthestFromCentre))).toBeCloseTo(
      BURST_SIZE * 0.16,
      6,
    );
    // Fragments start at the destruction centre.
    const fragments = danger.filter(
      (fill) => distinctCorners(fill) === FRAGMENT_VERTICES,
    );
    expect(Math.max(...fragments.map(centroidDistance))).toBeLessThan(
      BURST_SIZE * 0.15,
    );

    // No rectangular fill and no `size × size` block near the centre: the
    // superseded 100 ms white square was exactly that.
    const nearCentre = fills.filter(
      (fill) => distanceFromCentre(fill) <= BURST_SIZE,
    );
    expect(nearCentre.length).toBeGreaterThan(0);
    expect(nearCentre.every((fill) => !isRectangle(fill))).toBe(true);
    expect(
      nearCentre.some(
        (fill) =>
          Math.abs(fill.maxX - fill.minX - BURST_SIZE) < 2 &&
          Math.abs(fill.maxY - fill.minY - BURST_SIZE) < 2,
      ),
    ).toBe(false);
  });

  it('expands the ring from 0.20 to 0.80, moves fragment centres out to at most 0.60 and shrinks/fades monotonically over the 12 regular steps', async () => {
    const harness = await bootRealCombatScene(
      [],
      shatterState({ variant: 'regular', ageSteps: 0 }),
    );
    activeCleanups.push(harness);
    const ringRadii: number[] = [];
    const fragmentSpans: number[] = [];
    const alphas: number[] = [];
    const glints: number[] = [];
    for (let age = 0; age < DESTRUCTION_SHATTER_REGULAR_STEPS; age += 1) {
      const fills = await measureNextFrame(
        harness,
        shatterState({ variant: 'regular', ageSteps: age }),
      );
      const danger = burstFillsOf(fills, DANGER_COLOUR);
      const highlight = burstFillsOf(fills, HIGHLIGHT_COLOUR);
      const ring = danger.filter(
        (fill) => distinctCorners(fill) === RING_VERTICES,
      );
      const fragments = danger.filter(
        (fill) => distinctCorners(fill) === FRAGMENT_VERTICES,
      );
      expect(ring).toHaveLength(4);
      expect(fragments).toHaveLength(6);
      ringRadii.push(Math.max(...ring.map(ringMidRadius)));
      fragmentSpans.push(Math.max(...fragments.map(outlineSpan)));
      alphas.push(parseFill(ring[0]!).alpha);
      glints.push(
        highlight.filter((fill) => distinctCorners(fill) === GLINT_VERTICES)
          .length,
      );
    }
    // The `text-primary` glint covers exactly the first two executed steps.
    expect(glints).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Ring: `0.20 → 0.80 × size`, strictly expanding step by step.
    expect(ringRadii[0]!).toBeCloseTo(BURST_SIZE * 0.2, 6);
    expect(ringRadii[ringRadii.length - 1]!).toBeCloseTo(BURST_SIZE * 0.8, 6);
    for (let index = 1; index < ringRadii.length; index += 1) {
      expect(ringRadii[index]!).toBeGreaterThan(ringRadii[index - 1]!);
      expect(fragmentSpans[index]!).toBeLessThan(fragmentSpans[index - 1]!);
      expect(alphas[index]!).toBeLessThan(alphas[index - 1]!);
    }
    // Monotone shrink/fade from `1` to `0.15` over the exact lifetime.
    expect(alphas[0]!).toBeCloseTo(1, 6);
    expect(alphas[alphas.length - 1]!).toBeCloseTo(0.15, 6);
  });

  it('adds the Elite second broken ring from effect step 4 (age 3) and keeps ten fragments over the exact 15 steps', async () => {
    const harness = await bootRealCombatScene(
      [],
      shatterState({ variant: 'elite', ageSteps: 0 }),
    );
    activeCleanups.push(harness);
    const ringSegments: number[] = [];
    const smallestRingRadii: (number | null)[] = [];
    for (let age = 0; age < DESTRUCTION_SHATTER_ELITE_STEPS; age += 1) {
      const fills = await measureNextFrame(
        harness,
        shatterState({ variant: 'elite', ageSteps: age }),
      );
      const danger = burstFillsOf(fills, DANGER_COLOUR);
      const highlight = burstFillsOf(fills, HIGHLIGHT_COLOUR);
      expect(
        danger.filter((fill) => distinctCorners(fill) === FRAGMENT_VERTICES),
      ).toHaveLength(10);
      expect(
        highlight.filter((fill) => distinctCorners(fill) === FRAGMENT_VERTICES),
      ).toHaveLength(10);
      expect(
        highlight.filter((fill) => distinctCorners(fill) === GLINT_VERTICES),
      ).toHaveLength(age < 2 ? 1 : 0);
      const rings = danger.filter(
        (fill) => distinctCorners(fill) === RING_VERTICES,
      );
      ringSegments.push(rings.length);
      // The smallest ring is the first ring until the second one appears at
      // age 3, and the second ring thereafter (both reach `0.80 × size` on the
      // unchanged last age 14).
      smallestRingRadii.push(
        rings.length < 8 ? null : Math.min(...rings.map(ringMidRadius)),
      );
    }
    // One broken ring (four segments) at ages 0-2 — effect steps 1-3 — and the
    // second ring's four segments from exactly age 3, which is approved effect
    // step 4: the creation step has age 0 and already is visible step 1.
    expect(ringSegments).toEqual([4, 4, 4, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
    expect(smallestRingRadii.slice(0, 3)).toEqual([null, null, null]);
    // The second ring starts small again at `0.20 × size` on its first age and
    // reaches exactly `0.80 × size` on its own last age.
    expect(smallestRingRadii[3]!).toBeCloseTo(BURST_SIZE * 0.2, 2);
    expect(smallestRingRadii[DESTRUCTION_SHATTER_ELITE_STEPS - 1]!).toBeCloseTo(
      BURST_SIZE * 0.8,
      2,
    );

    // Two visibly different radii on the second ring's first age: the first ring
    // is already expanded while the second one starts at `0.20 × size`.
    const atThreeFills = await measureNextFrame(
      harness,
      shatterState({ variant: 'elite', ageSteps: 3 }),
    );
    const radii = burstFillsOf(atThreeFills, DANGER_COLOUR)
      .filter((fill) => distinctCorners(fill) === RING_VERTICES)
      .map(ringMidRadius);
    const distinctRadii = [...new Set(radii.map((r) => r.toFixed(3)))]
      .map(Number)
      .sort((a, b) => a - b);
    expect(distinctRadii).toHaveLength(2);
    expect(distinctRadii[0]!).toBeCloseTo(BURST_SIZE * 0.2, 2);
    expect(distinctRadii[1]!).toBeCloseTo(
      BURST_SIZE * (0.2 + 0.6 * (3 / (DESTRUCTION_SHATTER_ELITE_STEPS - 1))),
      2,
    );

    // The superseded age-4 start would leave age 3 with a single ring: exactly
    // one ring at the first ring's own age-3 radius.
    const atTwoFills = await measureNextFrame(
      harness,
      shatterState({ variant: 'elite', ageSteps: 2 }),
    );
    const atTwoRadii = burstFillsOf(atTwoFills, DANGER_COLOUR)
      .filter((fill) => distinctCorners(fill) === RING_VERTICES)
      .map(ringMidRadius);
    expect(atTwoRadii).toHaveLength(4);
    expect(Math.max(...atTwoRadii)).toBeCloseTo(
      BURST_SIZE * (0.2 + 0.6 * (2 / (DESTRUCTION_SHATTER_ELITE_STEPS - 1))),
      2,
    );

    // The record's own exact expiry removes the surface, and no later frame
    // re-creates it (the harness state is stepped through the real simulation).
    const scene = harness.scene;
    expect(scene.destructionShatterVisuals.size).toBe(1);
    let expired: CombatSimulationState = shatterState({
      variant: 'elite',
      ageSteps: DESTRUCTION_SHATTER_ELITE_STEPS - 1,
    });
    let emptied = false;
    for (let step = 0; step < 3 && !emptied; step += 1) {
      expired = stepCombatSimulation(expired, FIXED_STEP_SECONDS);
      await measureNextFrame(harness, expired);
      emptied = scene.destructionShatterVisuals.size === 0;
    }
    expect(emptied).toBe(true);
    for (let frame = 0; frame < 10; frame += 1) {
      await measureNextFrame(harness, expired);
      expect(scene.destructionShatterVisuals.size).toBe(0);
    }
  });

  it('paints exactly the same burst pixels from the prepared and the procedural-fallback enemy path', async () => {
    const state = shatterState({
      variant: 'regular',
      ageSteps: 3,
      withEnemy: true,
    });
    const fallback = await bootAndMeasureFrame([], state);
    const prepared = await bootAndMeasureFrame([PREPARED_BASIC_DRONE], state);

    // The two asset paths really differed: the prepared run renders the enemy
    // from the prepared texture, the fallback run from procedural graphics.
    expect(fallback.harness.scene.enemyVisuals.get(11)).toBeInstanceOf(
      Phaser.GameObjects.Graphics,
    );
    expect(prepared.harness.scene.enemyVisuals.get(11)).toBeInstanceOf(
      Phaser.GameObjects.Image,
    );

    const burstSignature = (
      fills: readonly RenderedFill[],
    ): readonly string[] =>
      [
        ...burstFillsOf(fills, DANGER_COLOUR),
        ...burstFillsOf(fills, HIGHLIGHT_COLOUR),
      ]
        .map(fillSignature)
        .sort();
    expect(burstSignature(prepared.fills)).toEqual(
      burstSignature(fallback.fills),
    );
    expect(burstSignature(fallback.fills).length).toBeGreaterThan(0);
  });

  it('multiplies the burst opacity by the committed terminal fade and removes it at exact zero', async () => {
    // A committed Defeat six steps into its 30-step fade: the terminal scalar is
    // `24 / 30`, while the record's own effect alpha is `1 - 0.85 × (3 / 11)`.
    const fadeAge = 3;
    const defeated = shatterState({
      variant: 'regular',
      ageSteps: fadeAge,
      terminal: { kind: 'defeat' },
      exitAuthorized: true,
      defeatFadeStepsRemaining: 24,
    });
    const harness = await bootRealCombatScene([], defeated);
    activeCleanups.push(harness);
    await measureNextFrame(harness, defeated);
    const visual = harness.scene.destructionShatterVisuals.get(BURST_ENEMY_ID);
    expect(visual).toBeDefined();
    // The surface carries the simulation-owned terminal scalar...
    expect(visual!.alpha).toBeCloseTo(24 / 30, 6);
    // ...while every painted fill carries the effect's own faded alpha, so the
    // rendered opacity is the product of the two authoritative values.
    const restored = renderedFrames[renderedFrames.length - 2]!;
    const ring = burstFillsOf(restored, DANGER_COLOUR).filter(
      (fill) => distinctCorners(fill) === RING_VERTICES,
    );
    expect(ring).toHaveLength(4);
    const effectAlpha =
      1 - 0.85 * (fadeAge / (DESTRUCTION_SHATTER_REGULAR_STEPS - 1));
    expect(parseFill(ring[0]!).alpha).toBeCloseTo(effectAlpha, 6);

    // A committed terminal whose fade is already at exact zero draws nothing,
    // even though this record's own duration has not elapsed yet.
    const zeroFade = shatterState({
      variant: 'regular',
      ageSteps: 0,
      terminal: { kind: 'success' },
      exitAuthorized: true,
      exitPhase: 'centre',
      exitCentreStepsRemaining: 15,
    });
    await measureNextFrame(harness, zeroFade);
    expect(harness.scene.destructionShatterVisuals.size).toBe(0);
    const zeroFadeFrame = renderedFrames[renderedFrames.length - 2]!;
    expect(burstFillsOf(zeroFadeFrame, DANGER_COLOUR)).toEqual([]);
    expect(burstFillsOf(zeroFadeFrame, HIGHLIGHT_COLOUR)).toEqual([]);
    for (let frame = 0; frame < 10; frame += 1) {
      await measureNextFrame(harness, zeroFade);
      expect(harness.scene.destructionShatterVisuals.size).toBe(0);
    }
  });

  it('never re-creates the burst across a viewport resize or scene disposal', async () => {
    const harness = await bootRealCombatScene(
      [],
      shatterState({ variant: 'regular', ageSteps: 1 }),
    );
    activeCleanups.push(harness);
    const scene = harness.scene;
    await measureNextFrame(
      harness,
      shatterState({ variant: 'regular', ageSteps: 1 }),
    );
    expect(scene.destructionShatterVisuals.size).toBe(1);
    // A different viewport still draws the same ONE effect.
    await measureNextFrame(harness, {
      ...shatterState({ variant: 'regular', ageSteps: 1 }),
      viewportWidth: 1600,
      viewportHeight: 900,
    });
    expect(scene.destructionShatterVisuals.size).toBe(1);

    // Once the record has expired the surface is gone and stays gone.
    let expired: CombatSimulationState = shatterState({
      variant: 'regular',
      ageSteps: DESTRUCTION_SHATTER_REGULAR_STEPS - 1,
    });
    for (
      let step = 0;
      step < 3 && scene.destructionShatterVisuals.size > 0;
      step += 1
    ) {
      expired = stepCombatSimulation(expired, FIXED_STEP_SECONDS);
      await measureNextFrame(harness, expired);
    }
    expect(scene.destructionShatterVisuals.size).toBe(0);
    await measureNextFrame(harness, expired);
    expect(scene.destructionShatterVisuals.size).toBe(0);

    // Disposal clears the scene-owned map and leaves no stale surface behind.
    harness.dispose();
    expect(scene.destructionShatterVisuals.size).toBe(0);
  });
});

describe('destruction shatter geometry owner (V021-WI-05, patch §4.1)', () => {
  const record = (
    variant: 'regular' | 'elite',
    ageSteps: number,
    enemyId = BURST_ENEMY_ID,
  ): DestructionShatter => ({
    enemyId,
    centerX: DESTRUCTION_CENTRE.x,
    centerY: DESTRUCTION_CENTRE.y,
    size: BURST_SIZE,
    variant,
    totalSteps:
      variant === 'elite'
        ? DESTRUCTION_SHATTER_ELITE_STEPS
        : DESTRUCTION_SHATTER_REGULAR_STEPS,
    ageSteps,
  });

  /** The mid-band radius of a pure ring geometry's filled arc bands. */
  const ringMidRadiusOf = (ring: ShatterRingGeometry): number => {
    const radii = ring.segments.flat().map(([x, y]) => Math.hypot(x, y));
    return (Math.min(...radii) + Math.max(...radii)) / 2;
  };

  /** One fragment's own centre: the midpoint of its apex and base midpoint. The
   *  geometry module emits local outlines around the destruction centre, so the
   *  distance below is that centre distance directly. */
  const fragmentCentreDistance = (fragment: {
    readonly outline: readonly (readonly [number, number])[];
  }): number => {
    const [apex, left, right] = fragment.outline;
    const baseX = (left![0] + right![0]) / 2;
    const baseY = (left![1] + right![1]) / 2;
    return Math.hypot((apex![0] + baseX) / 2, (apex![1] + baseY) / 2);
  };

  it('moves fragment centres from the destruction centre out to exactly 0.60 × size with monotone shrink and fade', () => {
    const centres: number[] = [];
    const spans: number[] = [];
    const alphas: number[] = [];
    for (let age = 0; age < DESTRUCTION_SHATTER_REGULAR_STEPS; age += 1) {
      const geometry = destructionShatterGeometry(record('regular', age));
      expect(geometry.fragments).toHaveLength(6);
      expect(geometry.rings).toHaveLength(1);
      expect(geometry.glint === null).toBe(age >= 2);
      centres.push(Math.max(...geometry.fragments.map(fragmentCentreDistance)));
      spans.push(
        Math.max(
          ...geometry.fragments.map((fragment) => {
            const [apex, left] = fragment.outline;
            return Math.hypot(apex![0] - left![0], apex![1] - left![1]);
          }),
        ),
      );
      alphas.push(geometry.fragments[0]!.alpha);
      // The ring fades with exactly the same effect opacity as the fragments.
      expect(geometry.rings[0]!.alpha).toBe(geometry.fragments[0]!.alpha);
    }
    expect(centres[0]!).toBeCloseTo(0, 9);
    expect(centres[centres.length - 1]!).toBeCloseTo(BURST_SIZE * 0.6, 9);
    for (let index = 1; index < centres.length; index += 1) {
      expect(centres[index]!).toBeGreaterThan(centres[index - 1]!);
      expect(spans[index]!).toBeLessThan(spans[index - 1]!);
      expect(alphas[index]!).toBeLessThan(alphas[index - 1]!);
    }
    expect(alphas[0]!).toBeCloseTo(1, 9);
    expect(alphas[alphas.length - 1]!).toBeCloseTo(0.15, 9);
  });

  it('adds the Elite second ring from effect step 4 (age 3) and never before', () => {
    // Effect steps 1-3 are the creation age 0 plus ages 1 and 2: one ring only.
    for (const age of [0, 1, 2]) {
      expect(
        destructionShatterGeometry(record('elite', age)).rings,
      ).toHaveLength(1);
    }
    const atThree = destructionShatterGeometry(record('elite', 3));
    expect(atThree.rings).toHaveLength(2);
    expect(atThree.fragments).toHaveLength(10);
    // The second ring starts at `0.20 × size` on its own timeline at age 3, the
    // approved one-based effect step 4 (the creation step has age 0 and already
    // is visible effect step 1, like the two-step glint).
    expect(ringMidRadiusOf(atThree.rings[1]!)).toBeCloseTo(BURST_SIZE * 0.2, 9);
    // Its own growth still reaches exactly `0.80 × size` on the unchanged last
    // age of the exact 15-step Elite lifetime.
    const atLast = destructionShatterGeometry(
      record('elite', DESTRUCTION_SHATTER_ELITE_STEPS - 1),
    );
    expect(atLast.rings).toHaveLength(2);
    expect(ringMidRadiusOf(atLast.rings[1]!)).toBeCloseTo(BURST_SIZE * 0.8, 9);
    // The regular variant never owns a second ring.
    expect(
      destructionShatterGeometry(record('regular', 11)).rings,
    ).toHaveLength(1);
  });

  it('rotates the fixed pattern only with the stable enemy id and stays deterministic', () => {
    const base = destructionShatterGeometry(record('regular', 6, 0));
    // `enemyId mod 8` eighths of a turn: id 8 is the same pattern as id 0.
    expect(destructionShatterGeometry(record('regular', 6, 8))).toEqual(base);
    const rotated = destructionShatterGeometry(record('regular', 6, 1));
    const angleOf = (
      geometry: ReturnType<typeof destructionShatterGeometry>,
    ): number => {
      const [apex] = geometry.fragments[0]!.outline;
      return Math.atan2(apex![1], apex![0]);
    };
    expect(angleOf(rotated) - angleOf(base)).toBeCloseTo(Math.PI / 4, 9);
    // The same record always yields exactly the same geometry (no RNG, no clock).
    expect(destructionShatterGeometry(record('regular', 6, 1))).toEqual(
      rotated,
    );
  });
});
