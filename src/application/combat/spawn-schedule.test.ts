import { describe, expect, it } from 'vitest';
import { INTERCEPTION } from '@content/index';
import { Mulberry32 } from '@domain/random';
import { FIXED_STEP_SECONDS } from './combat-simulation';
import { planEnemyGroups, spawnGroupDrones } from './spawn-schedule';
import { spawnEnemy } from './enemies';

/**
 * S10 mission-owned spawn plan (Combat §7.3–7.4). Fixture values for seed 1234
 * were generated once from the canonical Mulberry32 and pin the exact draw
 * order and fraction→coordinate resolution; any change to the draw order or
 * resolution fails here.
 */
const SEED = 1234;
const W = 1280;
const H = 600;
const SIZE = 24; // 4% of short side

function planFor(seed: number): ReturnType<typeof planEnemyGroups> {
  return planEnemyGroups(
    INTERCEPTION.schedule,
    new Mulberry32(seed),
    FIXED_STEP_SECONDS,
  );
}

describe('planEnemyGroups (Combat §7.3, S10)', () => {
  it('schedules 12 groups at 0, 10, ..., 100 s plus the final 110 s group', () => {
    const plan = planFor(SEED);
    expect(plan.map((group) => group.timeSeconds)).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
    ]);
    // Exact integer fixed-step spawn indices: no float boundary drift.
    expect(plan.map((group) => group.stepIndex)).toEqual([
      0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000, 6600,
    ]);
    expect(plan[0]!.final).toBe(false);
    expect(plan[11]!.final).toBe(true);
    expect(plan[11]!.timeSeconds).toBe(110);
  });

  it('plans exactly 38 drones: 11 regular groups of 3 plus 5 final', () => {
    const plan = planFor(SEED);
    expect(plan).toHaveLength(12);
    const total = plan.reduce((sum, group) => sum + group.drones.length, 0);
    expect(total).toBe(38);
    expect(plan[0]!.drones).toHaveLength(3);
    expect(plan[11]!.drones).toHaveLength(5);
    for (const group of plan.slice(0, 11)) {
      expect(group.drones).toHaveLength(3);
    }
  });

  it('is exactly repeatable for the same seed and different for another seed', () => {
    expect(planFor(SEED)).toEqual(planFor(SEED));
    expect(planFor(SEED)).not.toEqual(planFor(SEED + 1));
  });

  it('consumes the RNG in the pinned per-drone draw order (seed fixture)', () => {
    const plan = planFor(SEED);
    expect(plan[0]!.drones[0]).toEqual({
      entry: 'top',
      spawnAxisFraction: 0.7034119898453355,
      waypointXFraction: null,
      waypointYFraction: null,
    });
    expect(plan[0]!.drones[1]).toEqual({
      entry: 'top',
      spawnAxisFraction: 0.9705493662040681,
      waypointXFraction: null,
      waypointYFraction: null,
    });
    expect(plan[0]!.drones[2]).toEqual({
      entry: 'upper-right',
      spawnAxisFraction: 0.11776310740970075,
      waypointXFraction: 0.4323569962754846,
      waypointYFraction: 0.3605514037422836,
    });
  });

  it('draws all three approved entry regions independently across the mission', () => {
    const plan = planFor(SEED);
    const regions = new Set(
      plan.flatMap((group) => group.drones.map((drone) => drone.entry)),
    );
    expect(regions).toEqual(new Set(['top', 'upper-left', 'upper-right']));
  });

  it('resolves spawn coordinates and waypoints within their approved ranges', () => {
    const enemies = spawnGroupDrones(
      planFor(SEED)[0]!,
      0,
      'basic-drone',
      3,
      W,
      H,
      SIZE,
    );
    for (const enemy of enemies) {
      const half = SIZE / 2;
      if (enemy.entry === 'top') {
        // Complete hitbox within viewport width; bottom edge touches y = 0.
        expect(enemy.centerX - half).toBeGreaterThanOrEqual(0);
        expect(enemy.centerX + half).toBeLessThanOrEqual(W);
        expect(enemy.centerY).toBeCloseTo(-half, 6);
      } else {
        // Complete hitbox within the upper half on the side axis.
        expect(enemy.centerY - half).toBeGreaterThanOrEqual(0);
        expect(enemy.centerY + half).toBeLessThanOrEqual(H / 2);
        if (enemy.entry === 'upper-left') {
          expect(enemy.centerX).toBeCloseTo(-half, 6);
        } else {
          expect(enemy.centerX).toBeCloseTo(W + half, 6);
        }
        // Approved central upper waypoint zone (40%-60% × 20%-40%).
        expect(enemy.waypointX!).toBeGreaterThanOrEqual(W * 0.4);
        expect(enemy.waypointX!).toBeLessThanOrEqual(W * 0.6);
        expect(enemy.waypointY!).toBeGreaterThanOrEqual(H * 0.2);
        expect(enemy.waypointY!).toBeLessThanOrEqual(H * 0.4);
      }
      expect(enemy.hullIntegrity).toBe(3);
      expect(enemy.hasEnteredVisibleArea).toBe(false);
    }
  });

  it('never rerolls or separates overlapping drones (AC-051, AC-074)', () => {
    const first = spawnEnemy(
      0,
      'basic-drone',
      3,
      'top',
      0.5,
      null,
      null,
      W,
      H,
      SIZE,
    );
    const second = spawnEnemy(
      1,
      'basic-drone',
      3,
      'top',
      0.5,
      null,
      null,
      W,
      H,
      SIZE,
    );
    // Identical draws produce identical positions: no separation or re-roll.
    expect(second.centerX).toBe(first.centerX);
    expect(second.centerY).toBe(first.centerY);
  });
});
