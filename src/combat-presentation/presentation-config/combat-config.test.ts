import { describe, expect, it } from 'vitest';
import { COMBAT_RENDER_DEPTH, resolveCombatGeometry } from './combat-config';

describe('resolveCombatGeometry', () => {
  it('derives aircraft height from the viewport short side', () => {
    const geometry = resolveCombatGeometry({ width: 1280, height: 600 });
    expect(geometry.shortSide).toBe(600);
    expect(geometry.aircraftHeightPx).toBe(48);
  });

  it('recalculates the aircraft geometry for a materially different short side', () => {
    const geometry = resolveCombatGeometry({ width: 1500, height: 800 });
    expect(geometry.shortSide).toBe(800);
    expect(geometry.aircraftHeightPx).toBe(64);
  });

  it('preserves aspect ratio and Hull ratios across short sides', () => {
    const a = resolveCombatGeometry({ width: 1280, height: 600 });
    const b = resolveCombatGeometry({ width: 1500, height: 800 });
    expect(a.aircraftAspectRatio).toBeCloseTo(1278 / 1231, 6);
    expect(b.aircraftAspectRatio).toBe(a.aircraftAspectRatio);
    expect(a.hullBarWidthRatio).toBe(0.65);
    expect(a.hullBarGapRatio).toBe(0.01);
    expect(b.hullBarWidthRatio).toBe(0.65);
    expect(b.hullBarGapRatio).toBe(0.01);
  });
});

describe('COMBAT_RENDER_DEPTH', () => {
  it('keeps the canonical enemy → projectile → aircraft render order', () => {
    expect(COMBAT_RENDER_DEPTH.enemy).toBeLessThan(
      COMBAT_RENDER_DEPTH.projectile,
    );
    expect(COMBAT_RENDER_DEPTH.projectile).toBeLessThan(
      COMBAT_RENDER_DEPTH.aircraft,
    );
  });
});
