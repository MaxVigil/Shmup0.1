import { describe, expect, it } from 'vitest';
import type { PreparedRuntimeAsset } from '@application/ports';
import { RUNTIME_ASSET_MANIFEST } from '@platform/assets/runtime-asset-catalogue';
import {
  ENEMY_VISUAL_KINDS,
  ENEMY_VISUAL_MAPPINGS,
  enemyVisualMappingFor,
  resolveEnemyRenderedBounds,
  resolveEnemyVisual,
} from './enemy-visuals';
import type { EnemyVisualKind } from './enemy-visuals';

const MINIMUM_VIEWPORT_SHORT_SIDE = 600;
const BASIC_AREA_PX2 = (0.04 * MINIMUM_VIEWPORT_SHORT_SIDE) ** 2;

describe('enemy visual mapping (V02-WI-01)', () => {
  it('defines exactly the five approved enemy visual kinds', () => {
    expect(ENEMY_VISUAL_KINDS).toEqual([
      'basic-drone',
      'ranged-drone',
      'hunter-drone',
      'elite-drone-armoured',
      'elite-drone-vulnerable',
    ]);
    expect(ENEMY_VISUAL_MAPPINGS).toHaveLength(5);
    expect(ENEMY_VISUAL_MAPPINGS.map((entry) => entry.kind)).toEqual([
      ...ENEMY_VISUAL_KINDS,
    ]);
  });

  it('maps every kind to its central-catalogue enemy entry without duplicating path authority', () => {
    for (const mapping of ENEMY_VISUAL_MAPPINGS) {
      const entry = RUNTIME_ASSET_MANIFEST.find(
        (candidate) => candidate.id === mapping.assetId,
      );
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe('enemy-image');
      expect(entry?.sourcePath).toBe(
        `assets/runtime/enemies/${mapping.kind}.png`,
      );
    }
  });

  it('anchors the scale on the approved §16.2–16.3 footprint ratios and §16.4 aspects', () => {
    const scales = new Map(
      ENEMY_VISUAL_MAPPINGS.map((mapping) => [mapping.kind, mapping.scale]),
    );
    expect(scales.get('basic-drone')?.footprintAreaRatio).toBe(1);
    expect(scales.get('ranged-drone')?.footprintAreaRatio).toBe(1.2);
    expect(scales.get('hunter-drone')?.footprintAreaRatio).toBe(0.8);
    // Elite: approved mid-point of the 2.3–2.6× footprint band.
    expect(scales.get('elite-drone-armoured')?.footprintAreaRatio).toBe(2.45);
    expect(scales.get('elite-drone-vulnerable')?.footprintAreaRatio).toBe(2.45);

    const expectedAspects: Record<EnemyVisualKind, number> = {
      'basic-drone': 192 / 101,
      'ranged-drone': 224 / 163,
      'hunter-drone': 114 / 192,
      'elite-drone-armoured': 214 / 320,
      'elite-drone-vulnerable': 281 / 320,
    };
    for (const kind of ENEMY_VISUAL_KINDS) {
      expect(scales.get(kind)?.aspectRatio).toBeCloseTo(
        expectedAspects[kind] ?? 0,
        9,
      );
    }
  });

  it('produces exact complete rendered bounds at the minimum supported viewport', () => {
    const boundsByKind = new Map(
      ENEMY_VISUAL_MAPPINGS.map((mapping) => [
        mapping.kind,
        resolveEnemyRenderedBounds(mapping, MINIMUM_VIEWPORT_SHORT_SIDE),
      ]),
    );
    for (const kind of ENEMY_VISUAL_KINDS) {
      const bounds = boundsByKind.get(kind);
      const mapping = enemyVisualMappingFor(kind);
      expect(bounds).toBeDefined();
      expect(bounds!.widthPx).toBeGreaterThan(0);
      expect(bounds!.heightPx).toBeGreaterThan(0);
      // The rendered area exactly equals the approved footprint ratio × the
      // historical Basic Drone rendered square area.
      expect(bounds!.widthPx * bounds!.heightPx).toBeCloseTo(
        mapping.scale.footprintAreaRatio * BASIC_AREA_PX2,
        6,
      );
      // The width/height split preserves the prepared-PNG aspect ratio.
      expect(bounds!.widthPx / bounds!.heightPx).toBeCloseTo(
        mapping.scale.aspectRatio,
        9,
      );
    }
    // Relative footprint order: Ranged > Basic > Hunter, Elite far larger.
    const area = (kind: EnemyVisualKind): number => {
      const bounds = boundsByKind.get(kind);
      return bounds!.widthPx * bounds!.heightPx;
    };
    expect(area('ranged-drone')).toBeGreaterThan(area('basic-drone'));
    expect(area('basic-drone')).toBeGreaterThan(area('hunter-drone'));
    expect(area('elite-drone-armoured')).toBeGreaterThan(area('ranged-drone'));
    expect(area('elite-drone-vulnerable')).toBeCloseTo(
      area('elite-drone-armoured'),
      6,
    );
  });

  it('defines exact normalized procedural fallback geometry for every kind (§16.5)', () => {
    for (const mapping of ENEMY_VISUAL_MAPPINGS) {
      expect(mapping.fallback.shapes.length).toBeGreaterThan(0);
      for (const shape of mapping.fallback.shapes) {
        expect(shape.points.length).toBeGreaterThanOrEqual(3);
        expect(['border-strong', 'surface-raised', 'accent']).toContain(
          shape.fill,
        );
        for (const point of shape.points) {
          expect(Math.abs(point[0])).toBeLessThanOrEqual(0.5);
          expect(Math.abs(point[1])).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('keeps the approved Elite outer silhouette identical across both states', () => {
    const armoured = enemyVisualMappingFor('elite-drone-armoured');
    const vulnerable = enemyVisualMappingFor('elite-drone-vulnerable');
    // The shared manta silhouette plus the two cannon structures: the first
    // three shapes must be exactly equal in geometry and fill.
    const armouredOuter = armoured.fallback.shapes.slice(0, 3);
    const vulnerableOuter = vulnerable.fallback.shapes.slice(0, 3);
    expect(armouredOuter).toEqual(vulnerableOuter);
  });

  it('orients every fallback nose-down to match the prepared sprites (C01)', () => {
    for (const mapping of ENEMY_VISUAL_MAPPINGS) {
      const ys = mapping.fallback.shapes.flatMap((shape) =>
        shape.points.map((point) => point[1]),
      );
      // The nose reaches the bottom edge of the complete rendered bounds.
      expect(Math.max(...ys)).toBe(0.5);
      // The nose landmark is the centred bottom point (0, 0.5).
      const noseDown = mapping.fallback.shapes.some((shape) =>
        shape.points.some(
          (point) =>
            Math.abs(point[0]) <= 1e-9 && Math.abs(point[1] - 0.5) <= 1e-9,
        ),
      );
      expect(noseDown).toBe(true);
      // No fallback places a nose at the top edge (reversed orientation).
      const noseUp = mapping.fallback.shapes.some((shape) =>
        shape.points.some(
          (point) =>
            Math.abs(point[0]) <= 1e-9 && Math.abs(point[1] + 0.5) <= 1e-9,
        ),
      );
      expect(noseUp).toBe(false);
    }
  });

  it('gives the Hunter fallback a visible wing span at the minimum viewport (C01)', () => {
    const hunter = enemyVisualMappingFor('hunter-drone');
    const wingPoints = hunter.fallback.shapes
      .filter((shape) => shape.fill === 'border-strong')
      .flatMap((shape) => shape.points);
    const maxAbsX = Math.max(...wingPoints.map((point) => Math.abs(point[0])));
    // The wings span the majority of the complete bounds width so the craft
    // reads as an aircraft rather than a missile.
    expect(maxAbsX).toBeGreaterThanOrEqual(0.4);
    // The fuselage remains narrow and elongated.
    const fuselage = hunter.fallback.shapes[0];
    expect(fuselage).toBeDefined();
    const fuselageMaxAbsX = Math.max(
      ...fuselage!.points.map((point) => Math.abs(point[0])),
    );
    expect(fuselageMaxAbsX).toBeLessThanOrEqual(0.06);
    const fuselageYs = fuselage!.points.map((point) => point[1]);
    expect(Math.max(...fuselageYs) - Math.min(...fuselageYs)).toBeGreaterThan(
      0.8,
    );
  });

  it('exposes the centred engineered Core only in the Vulnerable state', () => {
    const armoured = enemyVisualMappingFor('elite-drone-armoured');
    const vulnerable = enemyVisualMappingFor('elite-drone-vulnerable');
    const fills = (shapes: readonly { fill: string }[]): string[] =>
      shapes.map((shape) => shape.fill);
    expect(fills(armoured.fallback.shapes)).not.toContain('accent');
    expect(fills(vulnerable.fallback.shapes)).toContain('accent');
    // The Core shape sits inside the retracted-plate ring at the configured
    // centre of the complete bounds.
    const core = vulnerable.fallback.shapes.find(
      (shape) => shape.fill === 'accent',
    );
    const housing = vulnerable.fallback.shapes.find(
      (shape) => shape.fill === 'surface-raised',
    );
    expect(core).toBeDefined();
    expect(housing).toBeDefined();
    const xs = core!.points.map((point) => point[0]);
    const ys = core!.points.map((point) => point[1]);
    const housingXs = housing!.points.map((point) => point[0]);
    const housingYs = housing!.points.map((point) => point[1]);
    // The Core is fully contained within the retracted-plate ring.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(Math.min(...housingXs));
    expect(Math.max(...xs)).toBeLessThanOrEqual(Math.max(...housingXs));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(Math.min(...housingYs));
    expect(Math.max(...ys)).toBeLessThanOrEqual(Math.max(...housingYs));
    // The Core spans the configured centre (x axis) of the ring.
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
  });
});

describe('resolveEnemyVisual (V02-WI-01)', () => {
  function preparedEnemy(
    id: string,
    status: 'ready' | 'fallback',
    url = `/enemies/${id.replace('enemy-', '')}.png`,
  ): PreparedRuntimeAsset {
    return {
      id,
      kind: 'enemy-image',
      sourcePath: `assets/runtime/enemies/${id.replace('enemy-', '')}.png`,
      url: status === 'ready' ? url : '/unused',
      status,
    };
  }

  it('resolves a ready prepared asset to its runtime URL with exact bounds', () => {
    const prepared = [
      preparedEnemy('enemy-basic-drone', 'ready'),
      ...ENEMY_VISUAL_MAPPINGS.filter(
        (mapping) => mapping.kind !== 'basic-drone',
      ).map((mapping) => preparedEnemy(mapping.assetId, 'fallback')),
    ];
    const result = resolveEnemyVisual(
      'basic-drone',
      prepared,
      MINIMUM_VIEWPORT_SHORT_SIDE,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.url).toContain('/enemies/basic-drone.png');
    const mapping = enemyVisualMappingFor('basic-drone');
    const bounds = resolveEnemyRenderedBounds(
      mapping,
      MINIMUM_VIEWPORT_SHORT_SIDE,
    );
    expect(result.widthPx).toBeCloseTo(bounds.widthPx, 9);
    expect(result.heightPx).toBeCloseTo(bounds.heightPx, 9);
  });

  it('resolves to the stable procedural fallback when the prepared entry is fallback', () => {
    const prepared = ENEMY_VISUAL_MAPPINGS.map((mapping) =>
      preparedEnemy(mapping.assetId, 'fallback'),
    );
    for (const kind of ENEMY_VISUAL_KINDS) {
      const result = resolveEnemyVisual(
        kind,
        prepared,
        MINIMUM_VIEWPORT_SHORT_SIDE,
      );
      expect(result.status).toBe('fallback');
      if (result.status !== 'fallback') {
        return;
      }
      expect(result.geometry).toBe(enemyVisualMappingFor(kind).fallback);
    }
  });

  it('resolves to the stable procedural fallback when the entry is absent or URL-less', () => {
    const absent = resolveEnemyVisual(
      'hunter-drone',
      [],
      MINIMUM_VIEWPORT_SHORT_SIDE,
    );
    expect(absent.status).toBe('fallback');
    const urlless = resolveEnemyVisual(
      'hunter-drone',
      [preparedEnemy('enemy-hunter-drone', 'ready', '')],
      MINIMUM_VIEWPORT_SHORT_SIDE,
    );
    expect(urlless.status).toBe('fallback');
  });
});
