import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  HUNTER_DRONE,
  enemyRenderedBounds,
} from '@application/content';
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
  DESTRUCTION_SHATTER_REGULAR_STEPS,
  ENEMY_HIT_FLASH_STEPS,
} from './collision';
import type { CombatEnemy } from './enemies';
import { hunterRotatedBounds } from './enemies';
import type { HunterEnemyState } from './enemies';
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
    // V021-WI-03 (patch §3): the heading owns the committed movement vector and
    // the visual rotation; `0` is nose-down (straight down) here.
    headingRadians: 0,
    visualWidth: size,
    visualHeight: size,
    committedStepsExecuted: 0,
    steeringEnded: false,
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
    // V021-WI-05 E01 (patch §4.1): exactly one hitbox-free shatter record, at
    // the destruction step's authoritative centre, scaled by this enemy's
    // complete visual dimension, aged `0` on its creation step, and carrying the
    // regular variant with its exact 12-step lifetime.
    expect(result.destructionShatters).toEqual([
      {
        enemyId: enemy.id,
        centerX: enemy.centerX,
        centerY: enemy.centerY,
        size: Math.max(enemy.width, enemy.height),
        variant: 'regular',
        totalSteps: DESTRUCTION_SHATTER_REGULAR_STEPS,
        ageSteps: 0,
      },
    ]);
  });

  it('uses the complete rendered bounds AABB for hits (V02-DEC-019)', () => {
    const enemy = makeEnemy('ranged-drone', 640, 300);
    const aabb = enemyCollisionAabb(enemy);
    expect(aabb.width).toBe(enemy.width);
    expect(aabb.height).toBe(enemy.height);
  });

  it('registers a hit through the enlarged v0.2.1 complete bounds and misses the smaller v0.2 bounds (V021-AC-002)', () => {
    const bounds = createState().enemyBoundsByType['basic-drone'];
    const enemy: CombatEnemy = {
      ...makeEnemy('basic-drone', 640, 300),
      width: bounds.width,
      height: bounds.height,
    };
    const geometry = { width: 3, height: 9 };
    // One pixel inside the v0.2.1 top edge. AABB contact is strict (edge-only
    // contact is not overlap), so only the enlarged authoritative bounds
    // register this shot.
    const projectileTopY = 300 - bounds.height / 2 + 1;
    const hit = resolveProjectileCollisions({
      projectiles: [spawnProjectile(0, 1, 640, projectileTopY, geometry)],
      enemies: [enemy],
      projectileWidth: geometry.width,
      projectileHeight: geometry.height,
      existingFlashes: {},
    });
    expect(hit.projectiles).toHaveLength(0);
    expect(hit.enemies[0]?.hullIntegrity).toBe(2);
    // The same shot stops short of the smaller v0.2 complete bounds.
    const v02Height = enemyRenderedBounds(
      {
        visualFootprintAreaRatio: 1,
        visualAspectRatio: BASIC_DRONE.visualAspectRatio,
      },
      600,
    ).heightPx;
    const miss = resolveProjectileCollisions({
      projectiles: [spawnProjectile(0, 1, 640, projectileTopY, geometry)],
      enemies: [{ ...enemy, height: v02Height }],
      projectileWidth: geometry.width,
      projectileHeight: geometry.height,
      existingFlashes: {},
    });
    expect(miss.projectiles).toHaveLength(1);
    expect(miss.enemies[0]?.hullIntegrity).toBe(3);
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

describe('V021-WI-03 Hunter rotated-envelope contact (patch §3)', () => {
  /** The patch's committed steering angle: the configured nose-down rectangle
   *  (114 / 192 at area ratio 1.8) is no longer its own collision/visibility
   *  authority once the Hunter is rotating. */
  const HEADING_RADIANS = 0.5;

  const CONFIGURED = enemyRenderedBounds(HUNTER_DRONE, VIEWPORT.height);
  const ENVELOPE = hunterRotatedBounds({
    width: CONFIGURED.widthPx,
    height: CONFIGURED.heightPx,
    headingRadians: HEADING_RADIANS,
  });

  /** A committing Hunter carrying the v0.2.1 single heading and the complete
   *  rotated envelope as its authoritative width/height. */
  function makeRotatedHunter(
    centerX: number,
    centerY: number,
  ): HunterEnemyState {
    return {
      id: 0,
      kind: 'hunter',
      type: 'hunter-drone',
      hullIntegrity: HUNTER_DRONE.maximumHullIntegrity,
      centerX,
      centerY,
      width: ENVELOPE.width,
      height: ENVELOPE.height,
      entry: 'upper-left',
      hasEnteredVisibleArea: true,
      activated: true,
      ordinal: 0,
      phase: 'committed',
      headingRadians: HEADING_RADIANS,
      visualWidth: CONFIGURED.widthPx,
      visualHeight: CONFIGURED.heightPx,
      committedStepsExecuted: 0,
      steeringEnded: false,
      approachStepsElapsed: 120,
    };
  }

  it('deals kamikaze contact through the rotated envelope, not the configured rectangle', () => {
    const aircraftBox = aircraftCollisionAabb(
      640,
      400,
      AIRCRAFT_WIDTH,
      AIRCRAFT_HEIGHT,
    );
    expect(ENVELOPE.width).toBeGreaterThan(CONFIGURED.widthPx);
    // One pixel of envelope-only reach into the Aircraft hitbox: the envelope's
    // right edge overlaps while the configured rectangle's right edge stops
    // short, so only the rotated envelope can register this contact.
    const hunter = makeRotatedHunter(
      aircraftBox.x - ENVELOPE.width / 2 + 1,
      400,
    );
    const hunterBox = enemyCollisionAabb(hunter);
    expect(hunterBox.width).toBeCloseTo(ENVELOPE.width, 9);
    expect(hunterBox.height).toBeCloseTo(ENVELOPE.height, 9);
    expect(hunter.centerX + CONFIGURED.widthPx / 2).toBeLessThan(aircraftBox.x);
    expect(hunter.centerX + ENVELOPE.width / 2).toBeGreaterThan(aircraftBox.x);

    const result = resolveAircraftContacts({
      enemies: [hunter],
      aircraftCenterX: 640,
      aircraftCenterY: 400,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerHullIntegrity: 100,
      playerMaximumHullIntegrity: 100,
      pairContactCooldownSteps: {},
      contactDamageByType: CONTACT_DAMAGE_BY_TYPE,
      aircraftDangerFlashStepsRemaining: 0,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(result.playerHullIntegrity).toBe(65);
    expect(result.enemies).toHaveLength(0);
    expect(result.destroyedByContact).toEqual([
      { id: 0, type: 'hunter-drone' },
    ]);
  });
});
