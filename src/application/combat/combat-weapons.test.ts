import { describe, expect, it } from 'vitest';
import { CANNON, MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import type { WeaponDefinition } from '@content/weapons';
import type { WeaponType } from '@domain/index';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  createTestCombatRuntime,
  createTestCombatState,
  AIRCRAFT_HEIGHT,
  AIRCRAFT_WIDTH,
} from '@test-support/domain';
import {
  advanceSimulationFrames,
  createCombatSimulation,
  FIXED_STEP_SECONDS,
  stepCombatSimulation,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import { resolveEquippedWeapon } from './combat-session';
import {
  advanceEnemyProjectile,
  advanceProjectile,
  isEnemyProjectileOutsideViewport,
  isProjectileOutsideViewport,
  isProjectileRemoved,
  projectileGeometry,
  projectileSpeedPxPerSecond,
  rangedProjectileGeometry,
  rangedProjectileSpeedPxPerSecond,
  resolveWeaponFireProfile,
  spawnProjectile,
  spawnRangedProjectile,
  stepsPerShotFor,
} from './projectiles';

const GEOMETRY = projectileGeometry(600);

function stepSeconds(
  state: CombatSimulationState,
  seconds: number,
): CombatSimulationState {
  let current = state;
  const steps = Math.round(seconds / FIXED_STEP_SECONDS);
  for (let index = 0; index < steps; index += 1) {
    current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
  }
  return current;
}

describe('player projectile pure rules (Combat §8, v0.2 §10)', () => {
  it('derives the approved width/height from the viewport short side', () => {
    expect(projectileGeometry(600)).toEqual({ width: 3, height: 9 });
    expect(projectileGeometry(800)).toEqual({ width: 4, height: 12 });
  });

  it('derives per-weapon projectile speed (v0.2 §10: MG 55%, Cannon 45% VH)', () => {
    expect(projectileSpeedPxPerSecond(600, MACHINE_GUN)).toBeCloseTo(330, 6);
    expect(projectileSpeedPxPerSecond(600, CANNON)).toBeCloseTo(270, 6);
  });

  it('computes exact fixed-step shot spacing for the v0.2 weapons', () => {
    expect(stepsPerShotFor(MACHINE_GUN.fireRate, FIXED_STEP_SECONDS)).toBe(12);
    expect(stepsPerShotFor(CANNON.fireRate, FIXED_STEP_SECONDS)).toBe(40);
    const profile = resolveWeaponFireProfile(CANNON, FIXED_STEP_SECONDS);
    expect(profile).toEqual({ damage: 3, fireRate: 1.5, stepsPerShot: 40 });
  });

  it('spawns at the aircraft muzzle and advances straight up', () => {
    const projectile = spawnProjectile(
      7,
      MACHINE_GUN.damage,
      500,
      200,
      GEOMETRY,
    );
    expect(projectile).toMatchObject({
      id: 7,
      damage: 1,
      centerX: 500,
      centerY: 200 - GEOMETRY.height / 2,
      ageSeconds: 0,
    });
    const advanced = advanceProjectile(projectile, 330, FIXED_STEP_SECONDS);
    expect(advanced.centerY).toBeCloseTo(projectile.centerY - 330 / 60, 6);
    expect(advanced.ageSeconds).toBeCloseTo(1 / 60, 6);
  });

  it('removes a projectile only when fully outside the viewport or after 2 s', () => {
    const inside = spawnProjectile(0, 1, 640, 300, GEOMETRY);
    expect(isProjectileOutsideViewport(inside, 1280, 600, GEOMETRY)).toBe(
      false,
    );
    const above = { ...inside, centerY: -GEOMETRY.height };
    expect(isProjectileOutsideViewport(above, 1280, 600, GEOMETRY)).toBe(true);
    expect(
      isProjectileRemoved(
        { ...inside, ageSeconds: 2 },
        1280,
        600,
        PLAYER_PROJECTILE.maximumLifetimeSeconds,
        GEOMETRY,
      ),
    ).toBe(true);
  });

  it('starts automatic fire immediately and fires at the v0.2 cadence', () => {
    const state = createTestCombatState();
    expect(state.projectiles).toHaveLength(1); // AC-019 first shot at creation
    const before = state.projectiles.length;
    const after = stepSeconds(state, 12 / 60); // MG: one shot per 12 steps
    expect(after.projectiles.length).toBeGreaterThan(before);
  });

  it('never fires a burst on a long frame (fixed-step cap, AC-019)', () => {
    const state = stepSeconds(createTestCombatState(), 11 / 60);
    const result = advanceSimulationFrames(state, 2, 0);
    expect(
      result.state.projectiles.length - state.projectiles.length,
    ).toBeLessThanOrEqual(1);
    expect(result.accumulatorSeconds).toBe(0);
  });

  it('hardens the construction boundary against invalid weapon input', () => {
    const badWeapon = (
      overrides: Partial<WeaponDefinition>,
    ): WeaponDefinition => ({ ...MACHINE_GUN, ...overrides });
    for (const weapon of [
      badWeapon({ damage: Number.NaN }),
      badWeapon({ damage: -1 }),
      badWeapon({ fireRate: 0 }),
      badWeapon({ projectileSpeedViewportHeightPerSecond: 0 }),
    ]) {
      expect(() => createTestCombatState({ weapon })).toThrow(/weapon/);
    }
  });

  it('hardens the construction boundary against invalid projectile input', () => {
    const badProjectile = { ...PLAYER_PROJECTILE, maximumLifetimeSeconds: 0 };
    expect(() =>
      createCombatSimulation({
        initialMode: 'mouse',
        viewportWidth: 1280,
        viewportHeight: 600,
        aircraftWidth: AIRCRAFT_WIDTH,
        aircraftHeight: AIRCRAFT_HEIGHT,
        weapon: MACHINE_GUN,
        projectile: badProjectile,
        missionSeed: 1234,
        mission: CONTENT_CATALOGUE.missions[0]!,
        enemies: CONTENT_CATALOGUE.enemies,
        playerHullIntegrity: 100,
        playerMaximumHullIntegrity: 100,
      }),
    ).toThrow(/projectile/);
  });

  it('runtime disposal freezes projectiles (no further firing after dispose)', () => {
    const runtime = createTestCombatRuntime();
    runtime.advance(0.1);
    const before = runtime.getState();
    runtime.dispose();
    expect(runtime.advance(1)).toBe(before);
  });
});

describe('enemy (Ranged) projectile rules (v0.2 §9.2)', () => {
  it('uses the approved 1.2% × 0.6% geometry and 24% VH/s speed', () => {
    const geometry = rangedProjectileGeometry(600);
    expect(geometry).toEqual({ width: 7.2, height: 3.6 });
    expect(rangedProjectileSpeedPxPerSecond(600)).toBeCloseTo(144, 6);
  });

  it('spawns from the central lower muzzle aimed at the Aircraft centre (V02-WI-04 C01: top edge touches the Ranged bottom edge)', () => {
    const geometry = rangedProjectileGeometry(600);
    const projectile = spawnRangedProjectile(
      0,
      640,
      200,
      700,
      400,
      144,
      geometry,
    );
    expect(projectile.kind).toBe('ranged');
    expect(projectile.damage).toBe(12);
    expect(projectile.centerX).toBe(640);
    // Exact edge equality: the projectile's TOP edge is exactly at the Ranged
    // bottom edge (the previous sign placed the BOTTOM edge there instead).
    expect(projectile.centerY).toBeCloseTo(200 + geometry.height / 2, 6);
    expect(projectile.centerY - geometry.height / 2).toBeCloseTo(200, 6);
    expect(projectile.centerY + geometry.height / 2).toBeCloseTo(
      200 + geometry.height,
      6,
    );
    expect(projectile.velocityX).toBeGreaterThan(0);
    expect(projectile.velocityY).toBeGreaterThan(0);
    const advanced = advanceEnemyProjectile(projectile, FIXED_STEP_SECONDS);
    expect(advanced.centerX).toBeCloseTo(
      projectile.centerX + projectile.velocityX / 60,
      6,
    );
  });

  it('has no artificial lifetime: removal only on complete-viewport exit', () => {
    const geometry = rangedProjectileGeometry(600);
    const projectile = spawnRangedProjectile(
      0,
      640,
      200,
      700,
      400,
      144,
      geometry,
    );
    expect(isEnemyProjectileOutsideViewport(projectile, 1280, 600)).toBe(false);
    const farRight = { ...projectile, centerX: 1280 + geometry.width };
    expect(isEnemyProjectileOutsideViewport(farRight, 1280, 600)).toBe(true);
    const farBelow = { ...projectile, centerY: 600 + geometry.height };
    expect(isEnemyProjectileOutsideViewport(farBelow, 1280, 600)).toBe(true);
  });
});

describe('resolveEquippedWeapon (Base §9.4, S09)', () => {
  it('resolves the snapshot weapon from the validated catalogue', () => {
    expect(resolveEquippedWeapon(CONTENT_CATALOGUE, 'machine-gun')).toBe(
      MACHINE_GUN,
    );
    expect(resolveEquippedWeapon(CONTENT_CATALOGUE, 'cannon')).toBe(CANNON);
  });

  it('falls back to the Machine Gun for an unknown type (defensive)', () => {
    expect(
      resolveEquippedWeapon(CONTENT_CATALOGUE, 'laser' as WeaponType),
    ).toBe(MACHINE_GUN);
  });
});
