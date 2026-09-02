import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  AIRCRAFT_WIDTH,
  AIRCRAFT_HEIGHT,
  TEST_MISSION_SEED,
} from '@test-support/domain';
import {
  createCombatSimulation,
  stepCombatSimulation,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import {
  resolveAircraftContacts,
  resolveEnemyProjectileCollisions,
  resolveProjectileCollisions,
  PAIR_CONTACT_COOLDOWN_STEPS,
  ENEMY_HIT_FLASH_STEPS,
} from './collision';
import type { CombatEnemy } from './enemies';
import { spawnProjectile } from './projectiles';
import type { EnemyProjectile } from './projectiles';
import {
  enemyCollisionAabb,
  aircraftCollisionAabb,
} from './collision-geometry';

/**
 * V02-WI-04 collision evidence (Epic §11, V02-AC-008/011–013): player
 * projectiles damage and destroy enemies with the single-hit lifecycle,
 * Ranged projectiles damage and are consumed by the Aircraft, regular contact
 * damages the Aircraft with a 0.75 s per-pair cooldown while the enemy
 * survives, and Hunter kamikaze contact destroys the Hunter with zero reward.
 */

const VIEWPORT = { width: 1280, height: 600 };
const CONTACT_DAMAGE_BY_TYPE = {
  'basic-drone': 15,
  'ranged-drone': 15,
  'hunter-drone': 35,
  'elite-drone': 0,
} as const;

function createState(hull = 100): CombatSimulationState {
  const aircraft = CONTENT_CATALOGUE.aircraft[0]!;
  return createCombatSimulation({
    initialMode: 'mouse',
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon: CONTENT_CATALOGUE.weapons[0]!,
    projectile: CONTENT_CATALOGUE.projectile,
    missionSeed: TEST_MISSION_SEED,
    mission: CONTENT_CATALOGUE.missions[0]!,
    enemies: CONTENT_CATALOGUE.enemies,
    playerHullIntegrity: hull,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}

function makeEnemy(
  type: 'basic-drone' | 'ranged-drone' | 'hunter-drone',
  centerX: number,
  centerY: number,
  id = 0,
): CombatEnemy {
  const def = CONTENT_CATALOGUE.enemies.find((enemy) => enemy.type === type)!;
  const size = type === 'ranged-drone' ? 28 : type === 'hunter-drone' ? 20 : 24;
  const common = {
    id,
    type,
    hullIntegrity: def.maximumHullIntegrity,
    centerX,
    centerY,
    width: size,
    height: size,
    entry: 'top' as const,
    hasEnteredVisibleArea: true,
    activated: true,
    ordinal: id,
  };
  if (type === 'basic-drone') {
    return { ...common, kind: 'basic' as const };
  }
  if (type === 'ranged-drone') {
    return { ...common, kind: 'ranged' as const, firingStepsRemaining: 180 };
  }
  return {
    ...common,
    kind: 'hunter' as const,
    phase: 'committed' as const,
    committedVx: 0,
    committedVy: 1,
    approachStepsElapsed: 120,
  };
}

describe('player projectile → enemy (Epic §11, single-hit lifecycle)', () => {
  it('damages a Basic Drone and consumes the projectile exactly once', () => {
    const enemy = makeEnemy('basic-drone', 640, 300);
    const projectile = spawnProjectile(0, 1, 640, 300, { width: 3, height: 9 });
    const result = resolveProjectileCollisions({
      projectiles: [projectile],
      enemies: [enemy],
      projectileWidth: 3,
      projectileHeight: 9,
      existingFlashes: {},
    });
    expect(result.projectiles).toHaveLength(0);
    expect(result.destroyedEnemies).toHaveLength(0);
    expect(result.enemies[0]?.hullIntegrity).toBe(2);
    expect(result.flashes[enemy.id]).toBe(ENEMY_HIT_FLASH_STEPS);
  });

  it('destroys a Basic Drone after 3 hits and reports it once with its role', () => {
    const enemy = makeEnemy('basic-drone', 640, 300);
    const projectiles = [0, 1, 2].map((id) =>
      spawnProjectile(id, 1, 640, 300, { width: 3, height: 9 }),
    );
    const result = resolveProjectileCollisions({
      projectiles,
      enemies: [enemy],
      projectileWidth: 3,
      projectileHeight: 9,
      existingFlashes: {},
    });
    expect(result.enemies).toHaveLength(0);
    expect(result.destroyedEnemies).toEqual([{ id: 0, type: 'basic-drone' }]);
    expect(result.destroyedEnemyFlashes).toHaveLength(1);
  });

  it('uses the complete rendered bounds AABB for hits (V02-DEC-019)', () => {
    const enemy = makeEnemy('ranged-drone', 640, 300);
    const aabb = enemyCollisionAabb(enemy);
    expect(aabb.width).toBe(enemy.width);
    expect(aabb.height).toBe(enemy.height);
  });
});

describe('enemy projectile → Aircraft (v0.2 §9.2/§10)', () => {
  it('damages the Aircraft by 12 and consumes the projectile on its first valid hit', () => {
    const state = createState();
    const projectile: EnemyProjectile = {
      id: 0,
      kind: 'ranged',
      damage: 12,
      centerX: 640,
      centerY: 400,
      velocityX: 0,
      velocityY: 144,
      width: 7.2,
      height: 3.6,
    };
    const result = resolveEnemyProjectileCollisions({
      projectiles: [projectile],
      aircraftCenterX: 640,
      aircraftCenterY: 400,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerHullIntegrity: state.playerHullIntegrity,
      playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(result.projectiles).toHaveLength(0);
    expect(result.playerHullIntegrity).toBe(88);
    expect(result.hitCount).toBe(1);
  });

  it('applies Defeat when Hull reaches zero and stops further damage', () => {
    const state = createState(10);
    const projectile: EnemyProjectile = {
      id: 0,
      kind: 'ranged',
      damage: 12,
      centerX: 640,
      centerY: 400,
      velocityX: 0,
      velocityY: 144,
      width: 7.2,
      height: 3.6,
    };
    const result = resolveEnemyProjectileCollisions({
      projectiles: [projectile],
      aircraftCenterX: 640,
      aircraftCenterY: 400,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerHullIntegrity: state.playerHullIntegrity,
      playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(result.playerHullIntegrity).toBe(0);
    expect(result.playerDefeated).toBe(true);
  });
});

describe('aircraft contact (Epic §11.1–11.3)', () => {
  it('regular contact damages the Aircraft, never the enemy, and starts the pair cooldown', () => {
    const state = createState();
    const enemy = makeEnemy('basic-drone', 640, 400);
    const result = resolveAircraftContacts({
      enemies: [enemy],
      aircraftCenterX: 640,
      aircraftCenterY: 400,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerHullIntegrity: state.playerHullIntegrity,
      playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
      pairContactCooldownSteps: {},
      contactDamageByType: CONTACT_DAMAGE_BY_TYPE,
      aircraftDangerFlashStepsRemaining: 0,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(result.playerHullIntegrity).toBe(85);
    expect(result.enemies).toHaveLength(1); // the Basic survives
    expect(result.enemies[0]?.hullIntegrity).toBe(3);
    expect(result.pairContactCooldownSteps[enemy.id]).toBe(
      PAIR_CONTACT_COOLDOWN_STEPS,
    );
    expect(result.destroyedByContact).toHaveLength(0);
  });

  it('applies contact damage at most once per 0.75 s per pair', () => {
    const state = createState();
    const enemy = makeEnemy('basic-drone', 640, 400);
    const shared = {
      aircraftCenterX: 640,
      aircraftCenterY: 400,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
      contactDamageByType: CONTACT_DAMAGE_BY_TYPE,
      aircraftDangerFlashStepsRemaining: 0,
      godModeEnabled: false,
      playerDefeated: false,
    };
    const first = resolveAircraftContacts({
      enemies: [enemy],
      playerHullIntegrity: state.playerHullIntegrity,
      pairContactCooldownSteps: {},
      ...shared,
    });
    const second = resolveAircraftContacts({
      enemies: first.enemies,
      playerHullIntegrity: first.playerHullIntegrity,
      pairContactCooldownSteps: first.pairContactCooldownSteps,
      ...shared,
    });
    expect(second.playerHullIntegrity).toBe(85);
  });

  it('Hunter kamikaze contact deals 35 damage, destroys the Hunter, and grants zero reward', () => {
    const state = createState();
    const hunter = makeEnemy('hunter-drone', 640, 400);
    const result = resolveAircraftContacts({
      enemies: [hunter],
      aircraftCenterX: 640,
      aircraftCenterY: 400,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerHullIntegrity: state.playerHullIntegrity,
      playerMaximumHullIntegrity: state.playerMaximumHullIntegrity,
      pairContactCooldownSteps: {},
      contactDamageByType: CONTACT_DAMAGE_BY_TYPE,
      aircraftDangerFlashStepsRemaining: 0,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(result.playerHullIntegrity).toBe(65);
    expect(result.enemies).toHaveLength(0);
    expect(result.destroyedByContact).toEqual([
      { id: hunter.id, type: 'hunter-drone' },
    ]);
  });

  it('counts a kamikaze Hunter in both the total Destroyed and contact tallies exactly once with zero reward (V02-WI-04 C01)', () => {
    const state = createState();
    const hunter = makeEnemy('hunter-drone', 640, 480);
    const current: CombatSimulationState = {
      ...state,
      projectiles: [],
      enemyProjectiles: [],
      enemies: [hunter],
      firingStepsRemaining: 999, // the player must not fire this step
    };
    const stepped = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    expect(stepped.playerHullIntegrity).toBe(65);
    expect(stepped.enemies).toHaveLength(0);
    // The accounting boundary increments BOTH the total Destroyed count and
    // the contact-destruction count exactly once (the previous shared
    // deduplication consumed the Hunter's id in the total pass, so the contact
    // count stayed at zero for it), and the kamikaze grants no reward.
    expect(stepped.destroyedCountByType['hunter-drone']).toBe(1);
    expect(stepped.destroyedByContactCountByType['hunter-drone']).toBe(1);
    expect(stepped.pendingCombatRewards).toBe(0);
    expect(stepped.escapedCountByType['hunter-drone']).toBe(0);
  });
});

describe('aircraft hitbox (Combat §8.6)', () => {
  it('keeps the 60% × 70% centred hitbox from the rendered bounds', () => {
    const aabb = aircraftCollisionAabb(
      640,
      400,
      AIRCRAFT_WIDTH,
      AIRCRAFT_HEIGHT,
    );
    expect(aabb.width).toBeCloseTo(AIRCRAFT_WIDTH * 0.6, 6);
    expect(aabb.height).toBeCloseTo(AIRCRAFT_HEIGHT * 0.7, 6);
  });
});
