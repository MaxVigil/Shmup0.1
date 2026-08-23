import { describe, expect, it } from 'vitest';
import { BASIC_DRONE, INTERCEPTION } from '@content/index';
import { CANNON, MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import type { WeaponDefinition } from '@content/weapons';
import type { WeaponType } from '@domain/index';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  advanceSimulationFrames,
  createCombatSimulation,
  createCombatSimulationRuntime,
  removeProjectileById,
  stepCombatSimulation,
  submitCombatCommand,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import { resolveEquippedWeapon } from './combat-session';
import type { CombatSimulationState } from './combat-simulation';
import type { CombatProjectile } from './projectiles';
import {
  advanceProjectile,
  isProjectileOutsideViewport,
  isProjectileRemoved,
  projectileGeometry,
  projectileSpeedPxPerSecond,
  resolveWeaponFireProfile,
  spawnProjectile,
  stepsPerShotFor,
} from './projectiles';

// 1280x600: short side 600 → aircraft height 48, width 48 * 1278/1231 ≈ 49.83.
const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
const AIRCRAFT_HEIGHT = 48;
const DEFAULT_VIEWPORT = { width: 1280, height: 600 };
const GEOMETRY = projectileGeometry(600);

/** Slow-speed projectile config used only to isolate the lifetime branch. */
const SLOW_PROJECTILE = {
  speedViewportHeightPerSecond: 0.1,
  maximumLifetimeSeconds: 2,
};

function createState(
  weapon: WeaponDefinition = MACHINE_GUN,
  viewport: { width: number; height: number } = DEFAULT_VIEWPORT,
  projectile = PLAYER_PROJECTILE,
  mode: 'mouse' | 'keyboard' = 'mouse',
): CombatSimulationState {
  return createCombatSimulation({
    initialMode: mode,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon,
    projectile,
    missionSeed: 1234,
    enemy: BASIC_DRONE,
    schedule: INTERCEPTION.schedule,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: 100,
  });
}

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

function submit(
  state: CombatSimulationState,
  command: Parameters<typeof submitCombatCommand>[1],
): CombatSimulationState {
  return submitCombatCommand(state, command);
}

describe('player projectile pure rules (Combat §8, S09)', () => {
  it('derives the approved width/height from the viewport short side', () => {
    expect(projectileGeometry(600)).toEqual({ width: 3, height: 9 });
    expect(projectileGeometry(800)).toEqual({ width: 4, height: 12 });
  });

  it('derives projectile speed as 100% of the viewport height per second', () => {
    expect(projectileSpeedPxPerSecond(600, PLAYER_PROJECTILE)).toBe(600);
    expect(projectileSpeedPxPerSecond(800, PLAYER_PROJECTILE)).toBe(800);
  });

  it('computes exact fixed-step shot spacing for both approved weapons', () => {
    expect(stepsPerShotFor(MACHINE_GUN.fireRate, FIXED_STEP_SECONDS)).toBe(10);
    expect(stepsPerShotFor(CANNON.fireRate, FIXED_STEP_SECONDS)).toBe(30);
    const profile = resolveWeaponFireProfile(CANNON, FIXED_STEP_SECONDS);
    expect(profile).toEqual({ damage: 3, fireRate: 2, stepsPerShot: 30 });
  });

  it('spawns at the muzzle: aircraft centre x, bottom edge on the aircraft top', () => {
    const spawned = spawnProjectile(0, 1, 640, 456, GEOMETRY);
    expect(spawned).toEqual({
      id: 0,
      damage: 1,
      centerX: 640,
      centerY: 456 - 9 / 2,
      ageSeconds: 0,
    });
  });

  it('advances upward at constant speed and accumulates age', () => {
    const start: CombatProjectile = {
      id: 0,
      damage: 1,
      centerX: 640,
      centerY: 451.5,
      ageSeconds: 0,
    };
    const advanced = advanceProjectile(start, 600, FIXED_STEP_SECONDS);
    expect(advanced.centerY).toBeCloseTo(441.5, 6);
    expect(advanced.centerX).toBe(640);
    expect(advanced.ageSeconds).toBeCloseTo(1 / 60, 12);
  });

  it('removes only after the full bounds leave the viewport (AC-077)', () => {
    const inside: CombatProjectile = {
      id: 0,
      damage: 1,
      centerX: 640,
      centerY: 1.5,
      ageSeconds: 0.5,
    };
    // Partially visible at the top edge → stays active.
    expect(isProjectileOutsideViewport(inside, 1280, 600, GEOMETRY)).toBe(
      false,
    );
    // Fully above → removed.
    expect(
      isProjectileOutsideViewport(
        { ...inside, centerY: -5 },
        1280,
        600,
        GEOMETRY,
      ),
    ).toBe(true);
    // Fully left / right / below → removed.
    expect(
      isProjectileOutsideViewport(
        { ...inside, centerX: -2 },
        1280,
        600,
        GEOMETRY,
      ),
    ).toBe(true);
    expect(
      isProjectileOutsideViewport(
        { ...inside, centerX: 1282 },
        1280,
        600,
        GEOMETRY,
      ),
    ).toBe(true);
    expect(
      isProjectileOutsideViewport(
        { ...inside, centerY: 605 },
        1280,
        600,
        GEOMETRY,
      ),
    ).toBe(true);
  });

  it('removes on the 2 s lifetime even while still inside the viewport', () => {
    const inside: CombatProjectile = {
      id: 0,
      damage: 1,
      centerX: 640,
      centerY: 300,
      ageSeconds: 1.999,
    };
    expect(isProjectileRemoved(inside, 1280, 600, 2, GEOMETRY)).toBe(false);
    expect(
      isProjectileRemoved({ ...inside, ageSeconds: 2 }, 1280, 600, 2, GEOMETRY),
    ).toBe(true);
  });
});

describe('player projectile simulation integration (S09)', () => {
  it('creates the first projectile immediately at Combat start (AC-019)', () => {
    const state = createState();
    expect(state.projectiles).toHaveLength(1);
    const first = state.projectiles[0];
    expect(first).toMatchObject({ id: 0, damage: 1 });
    // Muzzle: horizontal centre = aircraft centre; bottom edge = aircraft top.
    expect(first!.centerX).toBeCloseTo(640, 6);
    expect(first!.centerY + state.projectileHeight / 2).toBeCloseTo(
      state.aircraft.centerY - state.aircraftHeight / 2,
      6,
    );
    expect(state.nextProjectileId).toBe(1);
    expect(state.firingStepsRemaining).toBe(10);
  });

  it('produces Machine Gun 6 shots/s with exact fixed-step scheduling', () => {
    const afterOneSecond = stepSeconds(createState(), 1);
    // Spawns at creation + steps 10..60 → ids 0..6, exactly 6 per second.
    expect(afterOneSecond.nextProjectileId).toBe(7);
    const afterTwoSeconds = stepSeconds(afterOneSecond, 1);
    expect(afterTwoSeconds.nextProjectileId).toBe(13);
  });

  it('produces Cannon 2 shots/s (AC-021/022/050)', () => {
    const state = createState(CANNON);
    expect(state.equippedWeaponType).toBe('cannon');
    expect(state.weaponDamage).toBe(3);
    expect(state.weaponFireRate).toBe(2);
    expect(state.stepsPerShot).toBe(30);
    expect(state.projectiles[0]?.damage).toBe(3);
    const afterOneSecond = stepSeconds(state, 1);
    expect(afterOneSecond.nextProjectileId).toBe(3); // ids 0, 1, 2
    const afterThreeSeconds = stepSeconds(afterOneSecond, 2);
    // 2 more seconds = 120 steps → 4 more spawns at steps 90, 120, 150, 180.
    expect(afterThreeSeconds.nextProjectileId).toBe(7);
  });

  it('fires in both control modes with no firing input', () => {
    const keyboard = stepSeconds(
      createState(MACHINE_GUN, DEFAULT_VIEWPORT, PLAYER_PROJECTILE, 'keyboard'),
      1,
    );
    const mouse = stepSeconds(createState(), 1);
    expect(keyboard.nextProjectileId).toBe(7);
    expect(mouse.nextProjectileId).toBe(7);
  });

  it('keeps stable identity and deterministic order (newest first)', () => {
    const first = stepSeconds(createState(), 25 / 60);
    const second = stepSeconds(createState(), 25 / 60);
    const ids = first.projectiles.map((projectile) => projectile.id);
    // No removals yet (id 0 exits at step 46) → ids strictly descending.
    expect(ids).toEqual([2, 1, 0]);
    expect(second.projectiles).toEqual(first.projectiles);
  });

  it('moves every projectile at constant speed straight upward', () => {
    const stepOne = stepSeconds(createState(), 1 / 60);
    const stepTwo = stepSeconds(stepOne, 1 / 60);
    const before = stepOne.projectiles.find((p) => p.id === 0)!;
    const after = stepTwo.projectiles.find((p) => p.id === 0)!;
    expect(after.centerY - before.centerY).toBeCloseTo(-10, 6);
    expect(after.centerX).toBe(before.centerX);
    expect(after.ageSeconds - before.ageSeconds).toBeCloseTo(1 / 60, 12);
  });

  it('places each shot at the muzzle of the moving aircraft (AC-050/076)', () => {
    let state = createState(
      MACHINE_GUN,
      DEFAULT_VIEWPORT,
      PLAYER_PROJECTILE,
      'keyboard',
    );
    for (let index = 0; index < 2; index += 1) {
      state = submit(state, {
        type: 'combat/keyboard',
        key: 'up',
        pressed: true,
      });
      state = submit(state, {
        type: 'combat/keyboard',
        key: 'right',
        pressed: true,
      });
    }
    state = stepSeconds(state, 10 / 60); // spawns id 1 at step 10 while moving
    const newest = state.projectiles[0];
    expect(newest!.id).toBe(1);
    expect(newest!.centerX).toBeCloseTo(state.aircraft.centerX, 6);
    expect(newest!.centerY + state.projectileHeight / 2).toBeCloseTo(
      state.aircraft.centerY -
        state.aircraftHeight / 2 -
        state.projectileSpeedPxPerSecond * FIXED_STEP_SECONDS,
      6,
    );
  });

  it('removes a projectile once its full bounds leave the viewport (AC-077)', () => {
    const partiallyVisible = stepSeconds(createState(), 45 / 60);
    expect(partiallyVisible.projectiles.some((p) => p.id === 0)).toBe(true);
    const fullyExited = stepSeconds(createState(), 46 / 60);
    expect(fullyExited.projectiles.some((p) => p.id === 0)).toBe(false);
  });

  it('removes a projectile on its 2 s lifetime before any viewport exit', () => {
    // Slow-speed config isolates the lifetime branch deterministically: the
    // first projectile is still inside the viewport when its age reaches 2 s.
    const alive = stepSeconds(
      createState(MACHINE_GUN, DEFAULT_VIEWPORT, SLOW_PROJECTILE),
      119 / 60,
    );
    expect(alive.projectiles.some((p) => p.id === 0)).toBe(true);
    const expired = stepSeconds(
      createState(MACHINE_GUN, DEFAULT_VIEWPORT, SLOW_PROJECTILE),
      125 / 60,
    );
    expect(expired.projectiles.some((p) => p.id === 0)).toBe(false);
    expect(expired.projectiles).toHaveLength(12); // ids 1..12 still alive
  });

  it('proportionally reprojects active projectiles and recalculates geometry/speed on resize', () => {
    const before = stepSeconds(createState(), 20 / 60);
    const resized = submit(before, {
      type: 'combat/viewport-resize',
      width: 800,
      height: 400,
      aircraftWidth: 32 * (1278 / 1231),
      aircraftHeight: 32,
    });
    expect(resized.projectileWidth).toBeCloseTo(2, 6);
    expect(resized.projectileHeight).toBeCloseTo(6, 6);
    expect(resized.projectileSpeedPxPerSecond).toBeCloseTo(400, 6);
    expect(resized.projectiles).toHaveLength(before.projectiles.length);
    for (let index = 0; index < before.projectiles.length; index += 1) {
      const oldProjectile = before.projectiles[index];
      const newProjectile = resized.projectiles[index];
      expect(newProjectile!.id).toBe(oldProjectile!.id);
      expect(newProjectile!.centerX).toBeCloseTo(
        oldProjectile!.centerX * 0.625,
        6,
      );
      expect(newProjectile!.centerY).toBeCloseTo(
        oldProjectile!.centerY * (2 / 3),
        6,
      );
    }
  });

  it('never fires a burst on a long frame (fixed-step cap, AC-019)', () => {
    const state = stepSeconds(createState(), 9 / 60); // firingStepsRemaining = 1
    const result = advanceSimulationFrames(state, 2, 0);
    // At most 4 steps run: the shot due at step 10 fires once, then stops.
    expect(result.state.nextProjectileId).toBe(2);
    expect(result.accumulatorSeconds).toBe(0);
    expect(
      result.state.projectiles.length - state.projectiles.length,
    ).toBeLessThanOrEqual(1);
  });

  it('the S11 seam removes a consumed projectile and is a no-op for unknown ids', () => {
    const state = stepSeconds(createState(), 15 / 60);
    const consumed = removeProjectileById(state, state.projectiles[0]!.id);
    expect(consumed.projectiles).toHaveLength(state.projectiles.length - 1);
    expect(consumed.projectiles.map((p) => p.id)).not.toContain(
      state.projectiles[0]!.id,
    );
    expect(removeProjectileById(state, 9999)).toBe(state);
  });

  it('does not advance firing outside stepping', () => {
    const state = createState();
    const moved = submit(state, {
      type: 'combat/pointer-move',
      x: 700,
      y: 300,
    });
    expect(moved.projectiles).toBe(state.projectiles);
    expect(moved.firingStepsRemaining).toBe(state.firingStepsRemaining);
  });

  it('hardens the construction boundary against invalid weapon/projectile input', () => {
    const badWeapon = (
      overrides: Partial<WeaponDefinition>,
    ): WeaponDefinition => ({ ...MACHINE_GUN, ...overrides });
    for (const weapon of [
      badWeapon({ damage: Number.NaN }),
      badWeapon({ damage: -1 }),
      badWeapon({ fireRate: 0 }),
      badWeapon({ fireRate: Number.NaN }),
    ]) {
      expect(() => createState(weapon)).toThrow(/weapon/);
    }
    for (const projectile of [
      { ...PLAYER_PROJECTILE, speedViewportHeightPerSecond: 0 },
      { ...PLAYER_PROJECTILE, maximumLifetimeSeconds: Number.NaN },
    ]) {
      expect(() =>
        createState(MACHINE_GUN, DEFAULT_VIEWPORT, projectile),
      ).toThrow(/projectile/);
    }
  });

  it('runtime disposal freezes projectiles (no further firing after dispose)', () => {
    const runtime = createCombatSimulationRuntime({
      initialMode: 'mouse',
      viewportWidth: 1280,
      viewportHeight: 600,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      weapon: MACHINE_GUN,
      projectile: PLAYER_PROJECTILE,
      missionSeed: 1234,
      enemy: BASIC_DRONE,
      schedule: INTERCEPTION.schedule,
      playerHullIntegrity: 100,
      playerMaximumHullIntegrity: 100,
    });
    runtime.advance(0.1);
    const before = runtime.getState();
    runtime.dispose();
    const after = runtime.advance(1);
    expect(after).toBe(before);
    expect(after.projectiles).toBe(before.projectiles);
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
