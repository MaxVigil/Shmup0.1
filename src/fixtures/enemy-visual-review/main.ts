import {
  ENEMY_VISUAL_KINDS,
  enemyVisualMappingFor,
  resolveEnemyVisual,
  type EnemyFallbackFill,
  type EnemyFallbackGeometry,
  type EnemyVisualKind,
  type EnemyVisualResolution,
} from '@combat-presentation/presentation-config/enemy-visuals';
import { readColorToken } from '@combat-presentation/presentation-config/combat-config';
import { preloadRuntimeAssets } from '@platform/assets/preload';
import '@ui/styles/tokens.css';

/**
 * V02-WI-01 bounded development/test review fixture.
 *
 * Renders every approved enemy sprite and its exact procedural fallback at
 * the centrally configured gameplay scale and complete rendered bounds for
 * colour, grayscale, fallback, and minimum-supported-viewport review (Epic
 * §16.1, §16.5; V02-AC-024 asset layer). It runs the real bounded Boot
 * preload so the prepared-or-fallback result flows through the existing
 * application boundary, and `?force=fallback` deterministically exercises the
 * stable procedural-fallback renderer.
 *
 * This page is served only by the Vite development server and is never part
 * of the production build. It is not player-visible product UI and has no
 * gameplay authority: it never mutates shared state, simulates enemies, or
 * issues a second request owner for the prepared assets.
 */

/** Minimum supported viewport short side (Design System §6.7: 1280 × 600). */
const MINIMUM_VIEWPORT_SHORT_SIDE = 600;
/** Uniform review zoom applied through CSS to the exact-scale canvases. */
const REVIEW_ZOOM = 8;

/** Approved token source for each procedural-fallback fill (§16.5, DS §6). */
const FALLBACK_FILL_TOKENS: Record<
  EnemyFallbackFill,
  { readonly variable: string; readonly fallback: string }
> = {
  'border-strong': { variable: '--color-border-strong', fallback: '#526471' },
  'surface-raised': { variable: '--color-surface-raised', fallback: '#182128' },
  accent: { variable: '--color-accent', fallback: '#65a9d6' },
};

const KIND_LABELS: Record<EnemyVisualKind, string> = {
  'basic-drone': 'Basic Drone',
  'ranged-drone': 'Ranged Drone',
  'hunter-drone': 'Hunter Drone',
  'elite-drone-armoured': 'Elite Drone (Armoured)',
  'elite-drone-vulnerable': 'Elite Drone (Vulnerable)',
};

const panelsHost = (() => {
  const host = document.querySelector<HTMLElement>('#er-panels');
  if (host === null) {
    throw new Error('Enemy visual review fixture root is missing.');
  }
  return host;
})();

async function render(): Promise<void> {
  const forceFallback =
    new URLSearchParams(window.location.search).get('force') === 'fallback';
  // The real bounded Boot preload (Master §5.6): requests each approved
  // manifest asset at most once and resolves prepared-or-fallback at the 5 s
  // deadline or when all assets settle.
  const prepared = await preloadRuntimeAssets();
  const effective = forceFallback
    ? prepared.map((asset) =>
        asset.id.startsWith('enemy-')
          ? { ...asset, status: 'fallback' as const }
          : asset,
      )
    : prepared;

  for (const kind of ENEMY_VISUAL_KINDS) {
    const mapping = enemyVisualMappingFor(kind);
    const resolution = resolveEnemyVisual(
      kind,
      effective,
      MINIMUM_VIEWPORT_SHORT_SIDE,
    );
    let spriteImage: HTMLImageElement | null = null;
    if (resolution.status === 'ready') {
      spriteImage = await loadImage(resolution.url);
    }

    const panel = document.createElement('section');
    panel.className = 'er__panel';
    panel.dataset.kind = kind;

    const title = document.createElement('h2');
    title.className = 'er__panel-title';
    title.textContent = KIND_LABELS[kind];
    panel.appendChild(title);

    const bounds = document.createElement('p');
    bounds.className = 'er__panel-bounds';
    bounds.textContent =
      `Complete rendered bounds at 1280 × 600: ` +
      `${resolution.widthPx.toFixed(1)} × ${resolution.heightPx.toFixed(1)} px`;
    panel.appendChild(bounds);

    const cells = document.createElement('div');
    cells.className = 'er__cells';
    cells.appendChild(
      buildCell(kind, 'colour', resolution, (context, width, height) => {
        if (spriteImage !== null) {
          drawSprite(context, width, height, spriteImage, false);
        } else {
          drawGeometry(context, mapping.fallback, width, height);
        }
      }),
    );
    cells.appendChild(
      buildCell(kind, 'grayscale', resolution, (context, width, height) => {
        if (spriteImage !== null) {
          drawSprite(context, width, height, spriteImage, true);
        } else {
          drawGeometry(context, mapping.fallback, width, height);
        }
      }),
    );
    cells.appendChild(
      buildCell(kind, 'fallback', resolution, (context, width, height) => {
        drawGeometry(context, mapping.fallback, width, height);
      }),
    );
    panel.appendChild(cells);
    panelsHost.appendChild(panel);
  }
}

type CellDraw = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void;

function buildCell(
  kind: EnemyVisualKind,
  variant: 'colour' | 'grayscale' | 'fallback',
  resolution: EnemyVisualResolution,
  draw: CellDraw,
): HTMLElement {
  const width = Math.max(1, Math.ceil(resolution.widthPx));
  const height = Math.max(1, Math.ceil(resolution.heightPx));
  const label = document.createElement('span');
  label.className = 'er__cell-label';
  label.textContent =
    variant === 'colour'
      ? 'Colour sprite'
      : variant === 'grayscale'
        ? 'Grayscale sprite'
        : 'Procedural fallback';

  const canvas = document.createElement('canvas');
  canvas.className = 'er__canvas';
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width * REVIEW_ZOOM}px`;
  canvas.style.height = `${height * REVIEW_ZOOM}px`;
  canvas.dataset.kind = kind;
  canvas.dataset.variant = variant;
  canvas.dataset.status =
    variant === 'fallback' ? 'fallback' : resolution.status;
  canvas.dataset.width = String(width);
  canvas.dataset.height = String(height);

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2D canvas context unavailable in the review fixture.');
  }
  draw(context, width, height);

  const cell = document.createElement('div');
  cell.className = 'er__cell';
  cell.append(label, canvas);
  return cell;
}

/** Draws the prepared sprite scaled into its complete rendered bounds. */
function drawSprite(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement,
  grayscale: boolean,
): void {
  context.imageSmoothingEnabled = false;
  context.filter = grayscale ? 'grayscale(1)' : 'none';
  context.drawImage(image, 0, 0, width, height);
  context.filter = 'none';
}

/**
 * Draws the exact role-specific procedural fallback (§16.5) with the same
 * configured centre, complete rendered bounds, orientation, and gameplay-scale
 * footprint as the prepared sprite. Colours come from the canonical token
 * source; the fills are the approved neutral metallic palette, so the shapes
 * remain distinguishable in grayscale through geometry rather than colour.
 */
function drawGeometry(
  context: CanvasRenderingContext2D,
  geometry: EnemyFallbackGeometry,
  width: number,
  height: number,
): void {
  for (const shape of geometry.shapes) {
    const token = FALLBACK_FILL_TOKENS[shape.fill];
    context.fillStyle = readColorToken(token.variable, token.fallback);
    context.beginPath();
    const first = shape.points[0];
    if (first === undefined) {
      continue;
    }
    context.moveTo((first[0] + 0.5) * width, (first[1] + 0.5) * height);
    for (const point of shape.points.slice(1)) {
      context.lineTo((point[0] + 0.5) * width, (point[1] + 0.5) * height);
    }
    context.closePath();
    context.fill();
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Failed to load enemy sprite for review: ${url}`));
    image.src = url;
  });
}

void render();
