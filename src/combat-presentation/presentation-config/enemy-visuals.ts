import type { PreparedRuntimeAsset } from '@application/ports';

/**
 * V02-WI-01 enemy visual presentation mapping (v0.2 Epic §16).
 *
 * The five approved enemy roles/states get typed central-catalogue identities,
 * a centrally configured gameplay-scale complete rendered bounds (verified at
 * the minimum supported viewport, §16.1), and the exact role-specific
 * procedural fallbacks from Epic §16.5 with the same configured centre,
 * complete rendered bounds, orientation, and gameplay-scale footprint as their
 * prepared sprites.
 *
 * WI-01 owns presentation configuration and evidence only: no enemy
 * simulation, content, missions, persistence, or player-visible product UI is
 * introduced here. Authoritative gameplay hitbox mapping is verified by the
 * Work Item that introduces each enemy's simulation consumer (regular enemies
 * in V02-WI-04, Elite in V02-WI-06).
 */

export const ENEMY_VISUAL_KINDS = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
  'elite-drone-armoured',
  'elite-drone-vulnerable',
] as const;
export type EnemyVisualKind = (typeof ENEMY_VISUAL_KINDS)[number];

/**
 * Approved fill tokens for the procedural fallback geometry (§16.5, Design
 * System §6). Colours are resolved at render time from the canonical token
 * source (`--color-*`); these names are the only authority referenced by the
 * geometry so distinction stays geometric rather than colour-only.
 */
export type EnemyFallbackFill = 'border-strong' | 'surface-raised' | 'accent';

export interface FallbackPolygon {
  /**
   * Normalized coordinates relative to the complete rendered bounds: both
   * axes span `[-0.5, 0.5]`, the origin is the configured centre, positive
   * `y` is the nose — the craft is oriented nose-down towards the player
   * (Epic §16.1, matching the prepared sprites) — and positive `x` is the
   * craft's right.
   */
  readonly points: readonly (readonly [number, number])[];
  readonly fill: EnemyFallbackFill;
}

export interface EnemyFallbackGeometry {
  readonly shapes: readonly FallbackPolygon[];
}

export interface EnemyVisualScale {
  /**
   * Approved gameplay-scale footprint relative to the historical Basic Drone
   * rendered square (Combat §7.2: `4%` of the viewport short side per side):
   * Ranged ≈ `1.2×`, Hunter ≈ `0.8×`, Elite ≈ `2.3–2.6×` (§16.2–16.3; the
   * configured Elite value is the approved mid-point `2.45`). The footprint
   * is an area ratio, so the complete rendered area of each enemy equals
   * `footprintAreaRatio × (0.04 × shortSide)²`.
   */
  readonly footprintAreaRatio: number;
  /**
   * Prepared-PNG width/height ratio (v0.2 Epic §16.4 FACT dimensions), so the
   * rendered bounds preserve the approved artwork proportions exactly.
   */
  readonly aspectRatio: number;
}

export interface EnemyVisualMapping {
  readonly kind: EnemyVisualKind;
  /** Central-catalogue manifest id (single asset-path authority). */
  readonly assetId: string;
  readonly scale: EnemyVisualScale;
  /** Exact role-specific procedural fallback (§16.5). */
  readonly fallback: EnemyFallbackGeometry;
}

/**
 * Shared Elite outer silhouette: the approved large manta/flattened-diamond
 * outer shape with the two integrated cannon structures. Both Elite states
 * share these exact shapes (same craft, framing, outer silhouette, weapons,
 * materials, and lighting — §16.3); only the central housing differs.
 */
const ELITE_OUTER_SILHOUETTE: readonly FallbackPolygon[] = [
  {
    points: [
      [0, 0.5],
      [0.42, 0.18],
      [0.5, -0.1],
      [0.15, -0.5],
      [-0.15, -0.5],
      [-0.5, -0.1],
      [-0.42, 0.18],
    ],
    fill: 'border-strong',
  },
  {
    points: [
      [0.26, -0.3],
      [0.36, -0.3],
      [0.36, -0.18],
      [0.26, -0.18],
    ],
    fill: 'border-strong',
  },
  {
    points: [
      [-0.26, -0.3],
      [-0.36, -0.3],
      [-0.36, -0.18],
      [-0.26, -0.18],
    ],
    fill: 'border-strong',
  },
];

export const ENEMY_VISUAL_MAPPINGS: readonly EnemyVisualMapping[] = [
  {
    kind: 'basic-drone',
    assetId: 'enemy-basic-drone',
    // §16.2: wide, short, simple swept-wing silhouette, 1.7–1.9:1 width:length.
    scale: { footprintAreaRatio: 1, aspectRatio: 192 / 101 },
    fallback: {
      shapes: [
        {
          points: [
            [0, 0.5],
            [0.5, -0.1],
            [0.1, -0.45],
            [-0.1, -0.45],
            [-0.5, -0.1],
          ],
          fill: 'border-strong',
        },
      ],
    },
  },
  {
    kind: 'ranged-drone',
    assetId: 'enemy-ranged-drone',
    // §16.2: heavier/wider gun platform with two weapon housings, 1.2× Basic.
    scale: { footprintAreaRatio: 1.2, aspectRatio: 224 / 163 },
    fallback: {
      shapes: [
        {
          points: [
            [0, 0.5],
            [0.5, -0.05],
            [0.15, -0.45],
            [-0.15, -0.45],
            [-0.5, -0.05],
          ],
          fill: 'border-strong',
        },
        {
          points: [
            [0.3, -0.05],
            [0.45, -0.05],
            [0.45, -0.22],
            [0.3, -0.22],
          ],
          fill: 'border-strong',
        },
        {
          points: [
            [-0.3, -0.05],
            [-0.45, -0.05],
            [-0.45, -0.22],
            [-0.3, -0.22],
          ],
          fill: 'border-strong',
        },
      ],
    },
  },
  {
    kind: 'hunter-drone',
    assetId: 'enemy-hunter-drone',
    // §16.2: narrow, elongated, pointed interceptor, 0.8× Basic; must read as
    // an aircraft, not a missile, so the fallback adds small swept wings.
    scale: { footprintAreaRatio: 0.8, aspectRatio: 114 / 192 },
    fallback: {
      shapes: [
        // Narrow, elongated pointed fuselage with the nose at the bottom.
        {
          points: [
            [0, 0.5],
            [0.05, 0.15],
            [0.045, -0.45],
            [-0.045, -0.45],
            [-0.05, 0.15],
          ],
          fill: 'border-strong',
        },
        // Swept-back delta wings spanning nearly the full bounds width so the
        // silhouette reads as an interceptor aircraft rather than a missile at
        // the minimum supported viewport.
        {
          points: [
            [0.045, 0.12],
            [0.48, -0.38],
            [0.05, -0.05],
          ],
          fill: 'border-strong',
        },
        {
          points: [
            [-0.045, 0.12],
            [-0.48, -0.38],
            [-0.05, -0.05],
          ],
          fill: 'border-strong',
        },
      ],
    },
  },
  {
    kind: 'elite-drone-armoured',
    assetId: 'enemy-elite-drone-armoured',
    // §16.3: alien/hybrid manta/flattened diamond, 2.3–2.6× Basic footprint.
    scale: { footprintAreaRatio: 2.45, aspectRatio: 214 / 320 },
    fallback: {
      shapes: [
        ...ELITE_OUTER_SILHOUETTE,
        // Geometrically closed central housing (no opening).
        {
          points: [
            [0.1, -0.14],
            [0.1, 0.05],
            [-0.1, 0.05],
            [-0.1, -0.14],
          ],
          fill: 'surface-raised',
        },
      ],
    },
  },
  {
    kind: 'elite-drone-vulnerable',
    assetId: 'enemy-elite-drone-vulnerable',
    // §16.3: same craft/framing/outer silhouette; vulnerable retracts the
    // armour plates and exposes the centred engineered Core with one
    // restrained pale-cyan accent (`accent`).
    scale: { footprintAreaRatio: 2.45, aspectRatio: 281 / 320 },
    fallback: {
      shapes: [
        ...ELITE_OUTER_SILHOUETTE,
        // Retracted armour-plate ring around the exposed Core opening.
        {
          points: [
            [0.1, -0.14],
            [0.1, 0.05],
            [-0.1, 0.05],
            [-0.1, -0.14],
          ],
          fill: 'surface-raised',
        },
        // The exposed centred geometric Core (pale-cyan accent).
        {
          points: [
            [0.05, -0.08],
            [0.05, -0.02],
            [-0.05, -0.02],
            [-0.05, -0.08],
          ],
          fill: 'accent',
        },
      ],
    },
  },
];

export function enemyVisualMappingFor(
  kind: EnemyVisualKind,
): EnemyVisualMapping {
  const mapping = ENEMY_VISUAL_MAPPINGS.find((entry) => entry.kind === kind);
  if (mapping === undefined) {
    throw new Error(`No enemy visual mapping for kind: ${kind}`);
  }
  return mapping;
}

export interface EnemyRenderedBounds {
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Complete rendered bounds at gameplay scale for the given viewport short
 * side. The complete rendered area equals `footprintAreaRatio × (0.04 ×
 * shortSide)²` (the historical Basic Drone rendered square area) and the
 * width/height split preserves the prepared-PNG aspect ratio exactly, so the
 * sprite and its procedural fallback always share the same centre, complete
 * bounds, and orientation.
 */
export function resolveEnemyRenderedBounds(
  mapping: EnemyVisualMapping,
  shortSidePx: number,
): EnemyRenderedBounds {
  const areaPx2 = mapping.scale.footprintAreaRatio * (0.04 * shortSidePx) ** 2;
  return {
    widthPx: Math.sqrt(areaPx2 * mapping.scale.aspectRatio),
    heightPx: Math.sqrt(areaPx2 / mapping.scale.aspectRatio),
  };
}

export type EnemyVisualResolution =
  | {
      readonly kind: EnemyVisualKind;
      readonly status: 'ready';
      readonly url: string;
      readonly widthPx: number;
      readonly heightPx: number;
    }
  | {
      readonly kind: EnemyVisualKind;
      readonly status: 'fallback';
      readonly widthPx: number;
      readonly heightPx: number;
      readonly geometry: EnemyFallbackGeometry;
    };

/**
 * Resolves the prepared-or-fallback result for one enemy visual through the
 * existing application boundary (`AssetPreloadResult`, Master §5.6): a ready
 * prepared asset yields its runtime URL; an absent, failed, or timed-out entry
 * yields the stable procedural fallback for the complete page-load session.
 * Combat consumes this prepared result and never issues a second request,
 * loading state, or late fallback swap (V02-AC-025 asset layer).
 */
export function resolveEnemyVisual(
  kind: EnemyVisualKind,
  preparedAssets: readonly PreparedRuntimeAsset[],
  shortSidePx: number,
): EnemyVisualResolution {
  const mapping = enemyVisualMappingFor(kind);
  const bounds = resolveEnemyRenderedBounds(mapping, shortSidePx);
  const prepared = preparedAssets.find((asset) => asset.id === mapping.assetId);
  if (prepared?.status === 'ready' && prepared.url.length > 0) {
    return {
      kind,
      status: 'ready',
      url: prepared.url,
      widthPx: bounds.widthPx,
      heightPx: bounds.heightPx,
    };
  }
  return {
    kind,
    status: 'fallback',
    widthPx: bounds.widthPx,
    heightPx: bounds.heightPx,
    geometry: mapping.fallback,
  };
}
