import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CANNON, MACHINE_GUN } from '@content/weapons';
import type { WeaponDefinition } from '@content/weapons';
import {
  COMBAT_RENDER_DEPTH,
  resolveCombatGeometry,
} from '../presentation-config/combat-config';
import {
  FIXED_STEP_SECONDS,
  eliteCannonProjectileGeometry,
  eliteCannonSpeedPxPerSecond,
  eliteCoreProjectileGeometry,
  eliteCoreSpeedPxPerSecond,
  rangedProjectileGeometry,
  rangedProjectileSpeedPxPerSecond,
  spawnEliteCannonProjectile,
  spawnEliteHomingCore,
  spawnRangedProjectile,
  stepCombatSimulation,
} from '@application/combat';
import type { CombatSimulationState } from '@application/combat';
import { createTestCombatState } from '@test-support/domain';
import { createCombatHudBridge } from '../hud-bridge/combat-hud-bridge';
import type { CombatSceneContext } from './combat-scene';

/**
 * V021-WI-04-A (patch §4, V021-DEC-002, V021-AC-004) real-Phaser projectile
 * silhouette evidence.
 *
 * A genuine Phaser CANVAS game boots the REAL `CombatScene` under jsdom, driven
 * by the REAL fixed-step simulation through the production `CombatSceneContext`,
 * and the assertions read the pixels the REAL canvas renderer produced. jsdom
 * cannot rasterise, so the harness replaces the 2D context with a MEASURING one
 * that consumes exactly the draw commands Phaser's real
 * `GraphicsCanvasRenderer` emits (`setTransform`, `beginPath`, `moveTo`,
 * `lineTo`, `arc`, `fillStyle`, `fill`), transforms each filled outline into
 * canvas space, and measures its pixel silhouette (solid pixels per row/column
 * plus the exact outline extents). Nothing here reads the scene source: a
 * renderer that drew the previous rectangle, the superseded ellipse, an
 * outline-only shape, or a differently sized shape produces a different
 * measured silhouette and fails.
 *
 * The four changed cases — the Ranged shot circle, the Elite cannon circle, and
 * the Machine Gun and Cannon player teardrops — are each proven to be
 * non-rectangular, to keep their required geometry, to be a solid fill of the
 * approved token, and to be centred on their own authoritative AABB. Both
 * non-Core kinds must measure the SAME circle: equal rendered width and height,
 * the approved `7.2 px` diameter taken from the longer side of their unchanged
 * `7.2 × 3.6` / `3.6 × 7.2` authoritative AABBs, and the accepted `1.8 px`
 * overhang beyond each shorter AABB side (V021-DEC-002). The unchanged Elite
 * homing Core is proven to still be the diamond inscribed in its authoritative
 * square AABB.
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

/** One filled outline the real renderer emitted, in canvas (screenshot) space. */
interface RenderedFill {
  readonly colour: string;
  readonly alpha: number;
  readonly subpaths: readonly (readonly Point[])[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  /** Solid pixels per canvas row inside the outline's integer bounding box. */
  readonly rowWidths: readonly number[];
  /** Solid pixels per canvas column inside that box. */
  readonly columnHeights: readonly number[];
}

/** Every fill the real renderer drew for the running test, in draw order. */
let renderedFills: RenderedFill[] = [];

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

/** Even-odd coverage of one canvas-space point by one or more closed outlines. */
function covers(
  subpaths: readonly (readonly Point[])[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (const subpath of subpaths) {
    for (let index = 0; index < subpath.length; index += 1) {
      const from = subpath[index]!;
      const to = subpath[(index + 1) % subpath.length]!;
      if (from.y > y !== to.y > y) {
        const crossingX =
          from.x + ((y - from.y) / (to.y - from.y)) * (to.x - from.x);
        if (x < crossingX) {
          inside = !inside;
        }
      }
    }
  }
  return inside;
}

/** The maximum number of pixels measured per fill (larger fills are not shapes). */
const MAX_MEASURED_PIXELS = 4096;

/**
 * Creates the measuring context. Phaser probes optional 2D-context features
 * (for example `putImageData` during its inverse-alpha check), so any call this
 * harness does not measure is absorbed exactly as the existing jsdom harnesses
 * absorb it.
 */
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

/**
 * The measuring 2D context: it accepts every call Phaser's canvas renderer makes
 * and records the pixel silhouette of each solid fill.
 */
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

  rect(x: number, y: number, width: number, height: number): void {
    this.flushCurrent();
    this.subpaths.push([
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]);
  }

  /** Circles/arcs are approximated the way the renderer's shape commands are. */
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
    // Strokes are never part of an approved solid projectile silhouette.
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

  clearRect(): void {}

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

  /** Transforms the outline into canvas space and measures its solid pixels. */
  private record(subpaths: readonly (readonly Point[])[]): void {
    const transformed = subpaths
      .map((subpath) => subpath.map((point) => applyMatrix(this.matrix, point)))
      .filter((subpath) => subpath.length > 0);
    if (transformed.length === 0) {
      return;
    }
    const points = transformed.flat();
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const left = Math.floor(minX);
    const top = Math.floor(minY);
    const columns = Math.ceil(maxX) - left;
    const rows = Math.ceil(maxY) - top;
    let rowWidths: number[] = [];
    let columnHeights: number[] = [];
    if (columns > 0 && rows > 0 && columns * rows <= MAX_MEASURED_PIXELS) {
      rowWidths = new Array<number>(rows).fill(0);
      columnHeights = new Array<number>(columns).fill(0);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (covers(transformed, left + column + 0.5, top + row + 0.5)) {
            rowWidths[row] = (rowWidths[row] ?? 0) + 1;
            columnHeights[column] = (columnHeights[column] ?? 0) + 1;
          }
        }
      }
    }
    if (renderedFills.length >= 50_000) {
      return;
    }
    renderedFills.push({
      colour: String(this.fillStyle),
      alpha: this.globalAlpha,
      subpaths: transformed,
      minX,
      maxX,
      minY,
      maxY,
      rowWidths,
      columnHeights,
    });
  }
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

interface ProjectileSceneHarness {
  readonly game: InstanceType<PhaserModule['Game']>;
  readonly scene: Phaser.Scene & {
    projectileVisuals: Map<number, Phaser.GameObjects.Graphics>;
    enemyProjectileVisuals: Map<number, Phaser.GameObjects.Graphics>;
    eliteCoreVisuals: Map<number, Phaser.GameObjects.Graphics>;
    simState: CombatSimulationState;
    update: (time: number, delta: number) => void;
  };
  readonly holder: { state: CombatSimulationState };
  readonly dispose: () => void;
}

async function bootRealCombatScene(
  initial: CombatSimulationState,
): Promise<ProjectileSceneHarness> {
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
    preparedAssets: [],
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
  ) as unknown as ProjectileSceneHarness['scene'];
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

const activeCleanups: ProjectileSceneHarness[] = [];
afterEach(() => {
  while (activeCleanups.length > 0) {
    activeCleanups.pop()!.dispose();
  }
  renderedFills = [];
});

const TEST_GEOMETRY = resolveCombatGeometry({ width: 1280, height: 600 });

/** The exact `rgba(...)` string Phaser's canvas renderer sets for one token. */
function cssColourOf(hex: string): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(value >> 16) & 0xff},${(value >> 8) & 0xff},${value & 0xff},1)`;
}

/** Every solid fill the real renderer drew in one approved token colour. */
function fillsOf(colour: string): readonly RenderedFill[] {
  return renderedFills.filter((fill) => fill.colour === colour);
}

/** The fills of one colour whose outline bounds match the authoritative AABB. */
function fillsSized(
  colour: string,
  width: number,
  height: number,
): readonly RenderedFill[] {
  return fillsOf(colour).filter(
    (fill) =>
      Math.abs(fill.maxX - fill.minX - width) <= 1.5 &&
      Math.abs(fill.maxY - fill.minY - height) <= 1.5,
  );
}

/** The outline's horizontal envelope, sampled at `bands` evenly spaced rows. */
function bandWidths(fill: RenderedFill, bands: number): readonly number[] {
  const height = fill.maxY - fill.minY;
  const widths: number[] = [];
  for (let band = 0; band < bands; band += 1) {
    const y = fill.minY + ((band + 0.5) * height) / bands;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const subpath of fill.subpaths) {
      for (let index = 0; index < subpath.length; index += 1) {
        const from = subpath[index]!;
        const to = subpath[(index + 1) % subpath.length]!;
        if (from.y > y !== to.y > y) {
          const crossingX =
            from.x + ((y - from.y) / (to.y - from.y)) * (to.x - from.x);
          minX = Math.min(minX, crossingX);
          maxX = Math.max(maxX, crossingX);
        }
      }
    }
    widths.push(Number.isFinite(minX) ? maxX - minX : 0);
  }
  return widths;
}

/** The outline's vertical envelope, sampled at `bands` evenly spaced columns. */
function bandHeights(fill: RenderedFill, bands: number): readonly number[] {
  const width = fill.maxX - fill.minX;
  const heights: number[] = [];
  for (let band = 0; band < bands; band += 1) {
    const x = fill.minX + ((band + 0.5) * width) / bands;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const subpath of fill.subpaths) {
      for (let index = 0; index < subpath.length; index += 1) {
        const from = subpath[index]!;
        const to = subpath[(index + 1) % subpath.length]!;
        if (from.x > x !== to.x > x) {
          const crossingY =
            from.y + ((x - from.x) / (to.x - from.x)) * (to.y - from.y);
          minY = Math.min(minY, crossingY);
          maxY = Math.max(maxY, crossingY);
        }
      }
    }
    heights.push(Number.isFinite(minY) ? maxY - minY : 0);
  }
  return heights;
}

/**
 * The solid pixel count the SAME renderer would have produced for the rectangle
 * this presentation replaced: the authoritative AABB covers every row of its
 * integer bounding box whose pixel centres fall inside the outline's horizontal
 * extent. A silhouette that measures fewer pixels than this is provably not that
 * rectangle at the same sub-pixel alignment.
 */
function rectanglePixelCount(fill: RenderedFill): number {
  const left = Math.floor(fill.minX);
  let centres = 0;
  for (let column = 0; column < fill.columnHeights.length; column += 1) {
    const x = left + column + 0.5;
    if (x >= fill.minX && x <= fill.maxX) {
      centres += 1;
    }
  }
  return centres * fill.rowWidths.length;
}

/** The rows of the measured pixel silhouette that actually contain pixels. */
function occupiedRows(fill: RenderedFill): readonly number[] {
  return fill.rowWidths.filter((width) => width > 0);
}

/** A real, stepped Machine Gun or Cannon Combat state with live projectiles. */
function firedPlayerState(weapon: WeaponDefinition): CombatSimulationState {
  let state = createTestCombatState({ weapon });
  for (let step = 0; step < 30; step += 1) {
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
  }
  return state;
}

/**
 * The two non-Core enemy projectiles created by their real spawn owners, plus
 * the unchanged Elite homing Core, at their own authoritative geometries and
 * with no enemy bodies in the frame (so every danger/accent fill on the canvas
 * is a projectile).
 */
function enemyProjectileState(): CombatSimulationState {
  const fresh = createTestCombatState({ mode: 'keyboard' });
  const shortSide = Math.min(fresh.viewportWidth, fresh.viewportHeight);
  const ranged = spawnRangedProjectile(
    0,
    fresh.viewportWidth * 0.3,
    fresh.viewportHeight * 0.2,
    fresh.aircraft.centerX,
    fresh.aircraft.centerY,
    rangedProjectileSpeedPxPerSecond(fresh.viewportHeight),
    rangedProjectileGeometry(shortSide),
  );
  const cannon = spawnEliteCannonProjectile(
    1,
    fresh.viewportWidth * 0.7,
    fresh.viewportHeight * 0.2,
    shortSide * 0.2,
    shortSide * 0.2,
    'right',
    eliteCannonSpeedPxPerSecond(fresh.viewportHeight),
    eliteCannonProjectileGeometry(shortSide),
  );
  const core = spawnEliteHomingCore(
    2,
    fresh.viewportWidth * 0.5,
    fresh.viewportHeight * 0.35,
    shortSide * 0.2,
    fresh.aircraft.centerX,
    fresh.aircraft.centerY,
    eliteCoreSpeedPxPerSecond(fresh.viewportHeight),
    eliteCoreProjectileGeometry(shortSide),
  );
  return { ...fresh, enemyProjectiles: [ranged, cannon, core] };
}

/**
 * Fails unless one rendered silhouette is the approved teardrop: a pointed
 * leading (upward) edge, a rounded trailing end that narrows again, and an
 * envelope that is never the constant-width rectangle it replaced.
 */
function expectTeardrop(
  fill: RenderedFill,
  width: number,
  height: number,
): void {
  const bands = bandWidths(fill, 9);
  const widest = Math.max(...bands);
  expect(bands[0]!).toBeLessThan(widest * 0.4);
  expect(bands[bands.length - 1]!).toBeGreaterThan(bands[0]!);
  expect(bands[bands.length - 1]!).toBeLessThan(widest);
  expect(widest).toBeGreaterThan(width * 0.75);
  expect(widest - Math.min(...bands)).toBeGreaterThan(1);
  expect(bands.indexOf(widest)).toBeGreaterThanOrEqual(6);
  const pixels = occupiedRows(fill);
  expect(pixels.length).toBeGreaterThanOrEqual(Math.round(height) - 3);
  expect(Math.max(...pixels)).toBeGreaterThan(width * 0.6);
  // Fewer solid pixels than the same renderer would draw for the rectangle this
  // presentation replaced at the same sub-pixel alignment.
  const solid = fill.rowWidths.reduce((total, count) => total + count, 0);
  expect(solid).toBeLessThan(rectanglePixelCount(fill));
}

/** The number of outline bands at which a circle is sampled per axis. */
const CIRCLE_BANDS = 24;

/**
 * The chord of a regular `steps`-gon inscribed in the approved circle, at one
 * sampled band of its own square bounding box. Phaser's `fillCircle` emits
 * `arc`, which its canvas renderer and this harness both approximate with that
 * inscribed polygon, so this is the exact chord the real renderer draws — and a
 * superseded ellipse, diamond or rectangle of the same box measures a different
 * one (the ellipse tapers unequally, the diamond linearly, the rectangle not at
 * all).
 */
function inscribedCircleChord(
  diameter: number,
  bands: number,
  band: number,
  steps = 32,
): number {
  const radius = diameter / 2;
  const offset = ((band + 0.5) / bands) * diameter - radius;
  const vertices: Point[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    vertices.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const from = vertices[index]!;
    const to = vertices[(index + 1) % vertices.length]!;
    if (from.y > offset !== to.y > offset) {
      const crossingX =
        from.x + ((offset - from.y) / (to.y - from.y)) * (to.x - from.x);
      minX = Math.min(minX, crossingX);
      maxX = Math.max(maxX, crossingX);
    }
  }
  return Number.isFinite(minX) ? maxX - minX : 0;
}

/**
 * Fails unless one rendered silhouette is the approved solid filled circle
 * (V021-WI-04-A, patch §4/V021-DEC-002/V021-AC-004). Measurements a superseded
 * or non-approved shape cannot produce:
 * 1. equal rendered width and height, both exactly the approved diameter (the
 *    longer side of the unchanged authoritative AABB) — the superseded
 *    horizontal Ranged ellipse and vertical cannon ellipse are unequal on those
 *    axes, and the replaced rectangle of the same AABB is not this diameter;
 * 2. the inscribed-circle chord on BOTH axes at every sampled band, and the same
 *    chord on both axes — the same measurement on a horizontal or vertical
 *    ellipse of the same AABB is unequal between the axes, a rectangle measures
 *    the constant chord `2 * radius`, and a diamond tapers linearly;
 * 3. a monotone taper to both extremes, solid pixels about `π / 4` of its own
 *    square bounding box, and strictly fewer pixels than the rectangle this
 *    presentation replaced at the same sub-pixel alignment, so the four corners
 *    of that box stay unpainted.
 */
function expectCircle(fill: RenderedFill, diameter: number): void {
  const measuredWidth = fill.maxX - fill.minX;
  const measuredHeight = fill.maxY - fill.minY;
  expect(measuredWidth).toBeCloseTo(diameter, 3);
  expect(measuredHeight).toBeCloseTo(diameter, 3);
  const rows = bandWidths(fill, CIRCLE_BANDS);
  const columns = bandHeights(fill, CIRCLE_BANDS);
  for (let band = 0; band < CIRCLE_BANDS; band += 1) {
    const chord = inscribedCircleChord(diameter, CIRCLE_BANDS, band);
    expect(rows[band]!).toBeCloseTo(chord, 3);
    expect(columns[band]!).toBeCloseTo(chord, 3);
    expect(rows[band]!).toBeCloseTo(columns[band]!, 3);
  }
  expect(rows[0]!).toBeLessThan(Math.max(...rows));
  expect(rows[rows.length - 1]!).toBeLessThan(Math.max(...rows));
  expect(columns[0]!).toBeLessThan(Math.max(...columns));
  expect(columns[columns.length - 1]!).toBeLessThan(Math.max(...columns));
  // The pixel silhouette tapers toward both ends on BOTH axes, which the
  // replaced rectangle of the same box can never do at any sub-pixel alignment.
  expect(fill.rowWidths[0]!).toBeLessThan(Math.max(...fill.rowWidths));
  expect(fill.rowWidths[fill.rowWidths.length - 1]!).toBeLessThan(
    Math.max(...fill.rowWidths),
  );
  expect(fill.columnHeights[0]!).toBeLessThan(Math.max(...fill.columnHeights));
  expect(fill.columnHeights[fill.columnHeights.length - 1]!).toBeLessThan(
    Math.max(...fill.columnHeights),
  );
  const solid = fill.rowWidths.reduce((total, count) => total + count, 0);
  expect(solid).toBeLessThan(rectanglePixelCount(fill));
  const areaFraction = solid / (measuredWidth * measuredHeight);
  expect(areaFraction).toBeGreaterThan(0.68);
  expect(areaFraction).toBeLessThan(0.88);
}

/**
 * Fails unless one rendered silhouette is still the Elite homing Core's solid
 * diamond: the horizontal envelope is the exact linear taper of a diamond
 * inscribed in its square AABB (an ellipse over the same AABB would measure a
 * broad flat envelope instead), and the measured pixels are widest in the middle.
 */
function expectDiamond(fill: RenderedFill): void {
  const bands = bandWidths(fill, 8);
  const width = fill.maxX - fill.minX;
  for (let band = 0; band < bands.length; band += 1) {
    const fraction = (band + 0.5) / bands.length;
    const expected = 2 * width * Math.min(fraction, 1 - fraction);
    expect(bands[band]!).toBeCloseTo(expected, 2);
  }
  const pixels = occupiedRows(fill);
  expect(Math.max(...pixels)).toBeGreaterThan(width * 0.8);
  expect(pixels[0]!).toBeLessThan(Math.max(...pixels));
  expect(pixels[pixels.length - 1]!).toBeLessThan(Math.max(...pixels));
  expect(Math.max(...pixels) - Math.min(...pixels)).toBeGreaterThanOrEqual(2);
  // The unchanged Core still covers about half of its square AABB — the diamond
  // signature, not the `π / 4` of an ellipse and not the old full rectangle.
  const solid = fill.rowWidths.reduce((total, count) => total + count, 0);
  expect(solid).toBeLessThan(rectanglePixelCount(fill));
  const areaFraction = solid / (width * width);
  expect(areaFraction).toBeGreaterThan(0.35);
  expect(areaFraction).toBeLessThan(0.6);
}

/**
 * Boots the real scene on one authoritative state and waits until the real
 * renderer has drawn the silhouette under test. A renderer that never draws the
 * expected shape fails here rather than silently passing.
 */
async function bootAndRender(
  state: CombatSimulationState,
  when: (fills: readonly RenderedFill[]) => boolean,
): Promise<ProjectileSceneHarness> {
  const harness = await bootRealCombatScene(state);
  activeCleanups.push(harness);
  harness.scene.update(0, 16.7);
  const start = Date.now();
  while (!when(renderedFills)) {
    if (Date.now() - start > 5000) {
      throw new Error(
        'The real renderer produced no matching projectile silhouette.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  harness.scene.update(0, 16.7);
  return harness;
}

describe('real CombatScene projectile silhouettes (V021-WI-04-A, V021-AC-004)', () => {
  const playerColour = cssColourOf(TEST_GEOMETRY.projectileColor);
  const rangedColour = cssColourOf(TEST_GEOMETRY.rangedProjectileColor);
  const cannonColour = cssColourOf(TEST_GEOMETRY.eliteCannonProjectileColor);
  const coreColour = cssColourOf(TEST_GEOMETRY.eliteCoreProjectileColor);

  /** Every rendered fill of one colour drawn at one authoritative centre. */
  function fillsAt(
    colour: string,
    centerX: number,
    centerY: number,
  ): readonly RenderedFill[] {
    return fillsOf(colour).filter(
      (fill) =>
        Math.abs((fill.minX + fill.maxX) / 2 - centerX) <= 0.75 &&
        Math.abs((fill.minY + fill.maxY) / 2 - centerY) <= 0.75,
    );
  }

  /** The one rendered fill of one colour drawn at one authoritative AABB. */
  function fillOf(
    colour: string,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
  ): RenderedFill {
    const matches = fillsAt(colour, centerX, centerY).filter(
      (fill) =>
        Math.abs(fill.maxX - fill.minX - width) <= 0.75 &&
        Math.abs(fill.maxY - fill.minY - height) <= 0.75,
    );
    expect(matches.length).toBeGreaterThan(0);
    return matches[0]!;
  }

  /**
   * The one rendered fill of one non-Core kind drawn as the approved circle: the
   * outline bounds are the approved diameter on BOTH axes, centred on the
   * authoritative centre (patch §4/V021-DEC-002).
   */
  function circleFillAt(
    colour: string,
    projectile: {
      readonly centerX: number;
      readonly centerY: number;
    },
    diameter: number,
  ): RenderedFill {
    const matches = fillsAt(
      colour,
      projectile.centerX,
      projectile.centerY,
    ).filter(
      (fill) =>
        Math.abs(fill.maxX - fill.minX - diameter) <= 0.75 &&
        Math.abs(fill.maxY - fill.minY - diameter) <= 0.75,
    );
    expect(matches.length).toBeGreaterThan(0);
    return matches[0]!;
  }

  it('renders every Machine Gun projectile as the shared filled teardrop and never as a rectangle', async () => {
    const state = firedPlayerState(MACHINE_GUN);
    // The stepped real simulation fires the first shot at creation.
    expect(state.projectiles.length).toBeGreaterThan(0);
    const harness = await bootAndRender(
      state,
      () =>
        fillsSized(playerColour, state.projectileWidth, state.projectileHeight)
          .length > 0,
    );
    const { scene } = harness;
    // Object level: exactly one solid Graphics surface per authoritative shot.
    expect(scene.projectileVisuals.size).toBe(state.projectiles.length);
    for (const projectile of state.projectiles) {
      const visual = scene.projectileVisuals.get(projectile.id);
      expect(visual).toBeInstanceOf(Phaser.GameObjects.Graphics);
      expect(visual!.depth).toBe(COMBAT_RENDER_DEPTH.projectile);
      expect(visual!.x).toBeCloseTo(projectile.centerX, 6);
      expect(visual!.y).toBeCloseTo(projectile.centerY, 6);
      // Pixel level: every fill drawn for this shot is the same teardrop with
      // the authoritative AABB's complete bounds.
      const matches = fillsAt(
        playerColour,
        projectile.centerX,
        projectile.centerY,
      );
      expect(matches.length).toBeGreaterThan(0);
      for (const fill of matches) {
        expect(fill.alpha).toBe(1);
        expect(fill.maxX - fill.minX).toBeCloseTo(state.projectileWidth, 6);
        expect(fill.maxY - fill.minY).toBeCloseTo(state.projectileHeight, 6);
        expectTeardrop(fill, state.projectileWidth, state.projectileHeight);
      }
    }
  });

  it('renders every Hangar Cannon projectile as that same shared filled teardrop', async () => {
    const state = firedPlayerState(CANNON);
    expect(state.projectiles.length).toBeGreaterThan(0);
    await bootAndRender(
      state,
      () =>
        fillsSized(playerColour, state.projectileWidth, state.projectileHeight)
          .length > 0,
    );
    for (const projectile of state.projectiles) {
      const fill = fillOf(
        playerColour,
        projectile.centerX,
        projectile.centerY,
        state.projectileWidth,
        state.projectileHeight,
      );
      expect(fill.alpha).toBe(1);
      expectTeardrop(fill, state.projectileWidth, state.projectileHeight);
    }
  });

  it('renders the Ranged shot and the Elite cannon as the same solid `danger` circle centred on their unchanged authoritative AABBs', async () => {
    const state = enemyProjectileState();
    const shortSide = Math.min(state.viewportWidth, state.viewportHeight);
    const ranged = state.enemyProjectiles.find(
      (projectile) => projectile.kind === 'ranged',
    )!;
    const cannon = state.enemyProjectiles.find(
      (projectile) => projectile.kind === 'elite-cannon',
    )!;
    await bootAndRender(
      state,
      () =>
        fillsAt(rangedColour, ranged.centerX, ranged.centerY).length > 0 &&
        fillsAt(cannonColour, cannon.centerX, cannon.centerY).length > 0,
    );
    // The authoritative AABBs are unchanged: `7.2 × 3.6` for the Ranged shot and
    // `3.6 × 7.2` for the Elite cannon at `1280 × 600`.
    expect(ranged.width).toBeCloseTo(shortSide * 0.012, 6);
    expect(ranged.height).toBeCloseTo(shortSide * 0.006, 6);
    expect(cannon.width).toBeCloseTo(shortSide * 0.006, 6);
    expect(cannon.height).toBeCloseTo(shortSide * 0.012, 6);
    // The approved visual diameter is max(authoritative width, height), the same
    // `7.2 px` for both kinds (patch §4 / V021-DEC-002).
    const rangedDiameter = Math.max(ranged.width, ranged.height);
    const cannonDiameter = Math.max(cannon.width, cannon.height);
    expect(rangedDiameter).toBeCloseTo(shortSide * 0.012, 6);
    expect(cannonDiameter).toBeCloseTo(shortSide * 0.012, 6);
    expect(rangedDiameter).toBeCloseTo(cannonDiameter, 6);
    // The explicitly accepted visual/collision mismatch (V021-DEC-002): each
    // circle extends `1.8 px` beyond the two shorter AABB sides and that AABB's
    // four corners stay outside the ideal circle.
    expect((rangedDiameter - ranged.height) / 2).toBeCloseTo(1.8, 6);
    expect((cannonDiameter - cannon.width) / 2).toBeCloseTo(1.8, 6);
    const cornerDistance = Math.hypot(rangedDiameter / 2, ranged.height / 2);
    expect(cornerDistance).toBeGreaterThan(rangedDiameter / 2);
    expect(cornerDistance - rangedDiameter / 2).toBeGreaterThan(0.4);
    expect(cornerDistance - rangedDiameter / 2).toBeLessThan(0.45);

    const rangedFill = circleFillAt(rangedColour, ranged, rangedDiameter);
    expect(rangedFill.alpha).toBe(1);
    expectCircle(rangedFill, rangedDiameter);
    // Centred on the unchanged authoritative centre. The canvas transform is
    // single-precision, so the measured centre is compared to `1e-4` px.
    expect((rangedFill.minX + rangedFill.maxX) / 2).toBeCloseTo(
      ranged.centerX,
      4,
    );
    expect((rangedFill.minY + rangedFill.maxY) / 2).toBeCloseTo(
      ranged.centerY,
      4,
    );

    const cannonFill = circleFillAt(cannonColour, cannon, cannonDiameter);
    expect(cannonFill.alpha).toBe(1);
    expectCircle(cannonFill, cannonDiameter);
    expect((cannonFill.minX + cannonFill.maxX) / 2).toBeCloseTo(
      cannon.centerX,
      4,
    );
    expect((cannonFill.minY + cannonFill.maxY) / 2).toBeCloseTo(
      cannon.centerY,
      4,
    );

    // Equal circles: both kinds measure the same visual width and height.
    expect(rangedFill.maxX - rangedFill.minX).toBeCloseTo(
      cannonFill.maxX - cannonFill.minX,
      4,
    );
    expect(rangedFill.maxY - rangedFill.minY).toBeCloseTo(
      cannonFill.maxY - cannonFill.minY,
      4,
    );
  });

  it('keeps the Elite homing Core the solid diamond inscribed in its square AABB', async () => {
    const state = enemyProjectileState();
    const core = state.enemyProjectiles.find(
      (projectile) => projectile.kind === 'elite-core',
    )!;
    const harness = await bootAndRender(
      state,
      () => fillsAt(coreColour, core.centerX, core.centerY).length > 0,
    );
    expect(core.width).toBeCloseTo(core.height, 6);
    const fill = fillOf(
      coreColour,
      core.centerX,
      core.centerY,
      core.width,
      core.height,
    );
    expect(fill.maxX - fill.minX).toBeCloseTo(core.width, 6);
    expect(fill.maxY - fill.minY).toBeCloseTo(core.height, 6);
    expect(fill.alpha).toBe(1);
    expectDiamond(fill);
    // The Core keeps its own diamond surface and is never a non-Core circle.
    expect(harness.scene.eliteCoreVisuals.get(core.id)).toBeInstanceOf(
      Phaser.GameObjects.Graphics,
    );
    expect(harness.scene.enemyProjectileVisuals.has(core.id)).toBe(false);
  });

  it('owns one solid Graphics surface per non-Core projectile, centred and never filling its own box', async () => {
    const state = enemyProjectileState();
    const ranged = state.enemyProjectiles.find(
      (projectile) => projectile.kind === 'ranged',
    )!;
    const harness = await bootAndRender(
      state,
      () => fillsAt(rangedColour, ranged.centerX, ranged.centerY).length > 0,
    );
    const { scene } = harness;
    expect(scene.enemyProjectileVisuals.size).toBe(2);
    expect(scene.eliteCoreVisuals.size).toBe(1);
    for (const projectile of state.enemyProjectiles) {
      const isCore = projectile.kind === 'elite-core';
      const visual = (
        isCore ? scene.eliteCoreVisuals : scene.enemyProjectileVisuals
      ).get(projectile.id);
      expect(visual).toBeInstanceOf(Phaser.GameObjects.Graphics);
      expect(visual!.depth).toBe(COMBAT_RENDER_DEPTH.projectile);
      expect(visual!.x).toBeCloseTo(projectile.centerX, 6);
      expect(visual!.y).toBeCloseTo(projectile.centerY, 6);
      // The non-Core surfaces are the approved equal-diameter circle, so their
      // measured box is the authoritative maximum side; the Core keeps the
      // diamond inscribed in its own authoritative square AABB.
      const span = isCore
        ? projectile.width
        : Math.max(projectile.width, projectile.height);
      const fill = isCore
        ? fillOf(
            coreColour,
            projectile.centerX,
            projectile.centerY,
            projectile.width,
            projectile.height,
          )
        : circleFillAt(rangedColour, projectile, span);
      // A solid silhouette narrower than its own bounding box: the approved
      // circle covers about `π / 4` of its box, the unchanged diamond about half,
      // and the rectangle this presentation replaced all of it.
      const solid = fill.rowWidths.reduce((total, width) => total + width, 0);
      expect(solid).toBeGreaterThan(0);
      expect(solid).toBeLessThan(rectanglePixelCount(fill));
      const areaFraction = solid / (span * span);
      expect(areaFraction).toBeGreaterThan(isCore ? 0.35 : 0.68);
      expect(areaFraction).toBeLessThan(isCore ? 0.6 : 0.88);
    }
  });
});
