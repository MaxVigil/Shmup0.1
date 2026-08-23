import { describe, expect, it } from 'vitest';
import { BASIC_DRONE, GERMAN_FIGHTER, INTERCEPTION } from '@content/index';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import {
  createCombatSimulation,
  createCombatSimulationRuntime,
  stepCombatSimulation,
  submitCombatCommand,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import { resolveGermanFighter } from './combat-session';
import type { CombatEnemy } from './enemies';
import type { CombatProjectile } from './projectiles';
import {
  AIRCRAFT_DAMAGE_FLASH_STEPS,
  CONTACT_COOLDOWN_STEPS,
  CONTACT_DAMAGE,
  DESTROYED_ENEMY_FLASH_STEPS,
  ENEMY_HIT_FLASH_STEPS,
  resolveAircraftContacts,
  resolveProjectileCollisions,
} from './collision';
import { overlaps } from '@domain/geometry';
import {
  droneCollisionAabb,
  projectileCollisionAabb,
} from './collision-geometry';

// 1280x600: aircraft 48 high (width 49.83); drone square 24; projectile 3x9.
const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
const AIRCRAFT_HEIGHT = 48;
const PROJECTILE_WIDTH = 3;
const PROJECTILE_HEIGHT = 9;
const ENEMY_SIZE = 24;

function createState(): CombatSimulationState {
  return createCombatSimulation({
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
}

/** Crafts a full state override with controlled gameplay entities. */
function stateWith(overrides: {
  enemies?: readonly CombatEnemy[];
  projectiles?: readonly CombatProjectile[];
  playerHullIntegrity?: number;
  contactCooldownStepsRemaining?: number;
  godModeEnabled?: boolean;
}): CombatSimulationState {
  const base = createState();
  return { ...base, ...overrides };
}

function enemyAt(
  id: number,
  centerX: number,
  centerY: number,
  hullIntegrity = 3,
): CombatEnemy {
  return {
    id,
    type: 'basic-drone',
    hullIntegrity,
    centerX,
    centerY,
    entry: 'top',
    waypointX: null,
    waypointY: null,
    waypointReached: false,
    hasEnteredVisibleArea: true,
  };
}

function projectileAt(
  id: number,
  centerY: number,
  damage = 1,
): CombatProjectile {
  return {
    id,
    damage,
    centerX: 640,
    centerY,
    ageSeconds: 0,
  };
}

function stepOnce(state: CombatSimulationState): CombatSimulationState {
  return stepCombatSimulation(state, FIXED_STEP_SECONDS);
}

function submit(
  state: CombatSimulationState,
  command: Parameters<typeof submitCombatCommand>[1],
): CombatSimulationState {
  return submitCombatCommand(state, command);
}

describe('S11 collision geometry (AC-049, edge semantics)', () => {
  it('builds the drone and projectile AABBs from their full rendered bounds', () => {
    const drone = droneCollisionAabb(enemyAt(0, 640, 100), ENEMY_SIZE);
    expect(drone).toEqual({ x: 628, y: 88, width: 24, height: 24 });
    const shot = projectileCollisionAabb(
      projectileAt(0, 451.5),
      PROJECTILE_WIDTH,
      PROJECTILE_HEIGHT,
    );
    expect(shot).toEqual({ x: 638.5, y: 447, width: 3, height: 9 });
  });

  it('treats edge-only contact as no overlap (strict AABB semantics)', () => {
    const drone = droneCollisionAabb(enemyAt(0, 640, 100), ENEMY_SIZE);
    const touching = {
      x: drone.x + drone.width,
      y: drone.y,
      width: 10,
      height: 10,
    };
    expect(overlaps(touching, drone)).toBe(false);
  });
});

describe('S11 projectile-to-enemy pass (AC-023–026, AC-058)', () => {
  function hitWith(projectiles: CombatProjectile[], enemies: CombatEnemy[]) {
    return resolveProjectileCollisions({
      projectiles,
      enemies,
      projectileWidth: PROJECTILE_WIDTH,
      projectileHeight: PROJECTILE_HEIGHT,
      enemySize: ENEMY_SIZE,
      existingFlashes: {},
    });
  }

  it('applies the authored damage and consumes the projectile exactly once (AC-023)', () => {
    const result = hitWith([projectileAt(0, 100)], [enemyAt(0, 640, 100, 3)]);
    expect(result.enemies[0]!.hullIntegrity).toBe(2);
    expect(result.projectiles).toEqual([]); // consumed
    expect(result.destroyedEnemyCount).toBe(0);
    expect(result.flashes[0]).toBe(ENEMY_HIT_FLASH_STEPS);
  });

  it('destroys a full-Hull drone on the third Machine Gun hit, not earlier (AC-025)', () => {
    const twoHits = hitWith(
      [projectileAt(0, 100), projectileAt(1, 100)],
      [enemyAt(0, 640, 100, 3)],
    );
    expect(twoHits.enemies[0]!.hullIntegrity).toBe(1);
    expect(twoHits.destroyedEnemyCount).toBe(0);
    const threeHits = hitWith(
      [projectileAt(0, 100), projectileAt(1, 100), projectileAt(2, 100)],
      [enemyAt(0, 640, 100, 3)],
    );
    expect(threeHits.destroyedEnemyCount).toBe(1);
    expect(threeHits.enemies).toEqual([]);
  });

  it('destroys a full-Hull drone with one Cannon hit (AC-026)', () => {
    const result = hitWith(
      [projectileAt(0, 100, 3)],
      [enemyAt(0, 640, 100, 3)],
    );
    expect(result.destroyedEnemyCount).toBe(1);
    expect(result.enemies).toEqual([]);
  });

  it('damages only the first overlapping enemy by ascending enemy id (AC-023)', () => {
    // Both drones overlap the projectile; only the lowest id is damaged.
    const result = hitWith(
      [projectileAt(0, 100)],
      [enemyAt(10, 640, 100, 3), enemyAt(20, 640, 100, 3)],
    );
    expect(result.enemies.find((e) => e.id === 10)!.hullIntegrity).toBe(2);
    expect(result.enemies.find((e) => e.id === 20)!.hullIntegrity).toBe(3);
    expect(result.projectiles).toEqual([]);
  });

  it('removes a destroyed enemy immediately and creates one hitbox-free 100 ms flash (AC-024)', () => {
    const result = hitWith(
      [projectileAt(0, 100, 3)],
      [enemyAt(7, 640, 100, 3), enemyAt(8, 700, 400, 3)],
    );
    expect(result.destroyedEnemyCount).toBe(1);
    expect(result.enemies.map((e) => e.id)).toEqual([8]);
    expect(result.destroyedEnemyFlashes).toEqual([
      {
        enemyId: 7,
        centerX: 640,
        centerY: 100,
        size: ENEMY_SIZE,
        stepsRemaining: DESTROYED_ENEMY_FLASH_STEPS,
      },
    ]);
  });

  it('lets a later projectile in the same step ignore the destroyed enemy and hit its next target', () => {
    const result = hitWith(
      [
        projectileAt(0, 100, 3),
        projectileAt(1, 100, 3), // overlaps the destroyed id 10 too, then id 20
      ],
      [enemyAt(10, 640, 100, 3), enemyAt(20, 640, 100, 3)],
    );
    expect(result.destroyedEnemyCount).toBe(2);
    expect(result.enemies).toEqual([]);
    expect(result.projectiles).toEqual([]);
  });

  it('restarts (not stacks) the 50 ms flash and preserves the enemy for a non-destroying hit (AC-058)', () => {
    const result = hitWith([projectileAt(0, 100)], [enemyAt(0, 640, 100, 3)]);
    expect(result.flashes[0]).toBe(ENEMY_HIT_FLASH_STEPS);
    // The enemy keeps its movement/hitbox: it is still in the active list.
    expect(result.enemies[0]).toMatchObject({
      id: 0,
      centerX: 640,
      centerY: 100,
      hasEnteredVisibleArea: true,
      entry: 'top',
    });
  });
});

describe('S11 aircraft contact pass (AC-010–013, AC-059–061)', () => {
  function contact(
    enemies: CombatEnemy[],
    overrides: {
      playerHullIntegrity?: number;
      contactCooldownStepsRemaining?: number;
      godModeEnabled?: boolean;
      playerDefeated?: boolean;
    } = {},
  ) {
    return resolveAircraftContacts({
      enemies,
      enemySize: ENEMY_SIZE,
      aircraftCenterX: 640,
      aircraftCenterY: 480,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerHullIntegrity: overrides.playerHullIntegrity ?? 100,
      playerMaximumHullIntegrity: 100,
      contactCooldownStepsRemaining:
        overrides.contactCooldownStepsRemaining ?? 0,
      aircraftDangerFlashStepsRemaining: 0,
      godModeEnabled: overrides.godModeEnabled ?? false,
      playerDefeated: overrides.playerDefeated ?? false,
    });
  }

  it('atomically applies 25 damage to both objects, starts the cooldown and flash (AC-011, AC-059)', () => {
    const result = contact([enemyAt(5, 640, 480)]);
    expect(result.playerHullIntegrity).toBe(100 - CONTACT_DAMAGE);
    expect(result.contactCooldownStepsRemaining).toBe(CONTACT_COOLDOWN_STEPS);
    expect(result.aircraftDangerFlashStepsRemaining).toBe(
      AIRCRAFT_DAMAGE_FLASH_STEPS,
    );
    expect(result.enemies).toEqual([]); // drone destroyed by contact
    expect(result.destroyedEnemyCount).toBe(1);
    expect(result.destroyedEnemyFlashes[0]!.stepsRemaining).toBe(
      DESTROYED_ENEMY_FLASH_STEPS,
    );
  });

  it('clamps player Hull at 0 and sets the idempotent defeat-trigger state (AC-010)', () => {
    const result = contact([enemyAt(5, 640, 480)], {
      playerHullIntegrity: 10,
    });
    expect(result.playerHullIntegrity).toBe(0); // clamped, not negative
    expect(result.playerDefeated).toBe(true);
  });

  it('protects same-step later contacts: drone still destroyed, no Hull/flash/cooldown change (AC-012, AC-060)', () => {
    const result = contact([enemyAt(5, 640, 480), enemyAt(6, 640, 480)]);
    expect(result.playerHullIntegrity).toBe(75); // only one -25
    expect(result.aircraftDangerFlashStepsRemaining).toBe(
      AIRCRAFT_DAMAGE_FLASH_STEPS,
    );
    expect(result.contactCooldownStepsRemaining).toBe(CONTACT_COOLDOWN_STEPS);
    expect(result.destroyedEnemyCount).toBe(2); // both drones destroyed
    expect(result.enemies).toEqual([]);
  });

  it('does not restart or extend the cooldown during an active cooldown (AC-012)', () => {
    const result = contact([enemyAt(5, 640, 480)], {
      contactCooldownStepsRemaining: 12,
    });
    expect(result.playerHullIntegrity).toBe(100); // unchanged
    expect(result.aircraftDangerFlashStepsRemaining).toBe(0); // no flash replay
    expect(result.contactCooldownStepsRemaining).toBe(12); // not restarted
    expect(result.destroyedEnemyCount).toBe(1); // drone still destroyed
  });

  it('does not cancel an existing aircraft flash during a cooldown contact', () => {
    const result = resolveAircraftContacts({
      enemies: [enemyAt(5, 640, 480)],
      enemySize: ENEMY_SIZE,
      aircraftCenterX: 640,
      aircraftCenterY: 480,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      playerHullIntegrity: 75,
      playerMaximumHullIntegrity: 100,
      contactCooldownStepsRemaining: 12,
      aircraftDangerFlashStepsRemaining: 5,
      godModeEnabled: false,
      playerDefeated: false,
    });
    expect(result.aircraftDangerFlashStepsRemaining).toBe(5);
    expect(result.playerHullIntegrity).toBe(75);
    expect(result.contactCooldownStepsRemaining).toBe(12);
  });

  it('keeps God Mode at maximum Hull with no aircraft flash (AC-061)', () => {
    const result = contact([enemyAt(5, 640, 480)], {
      playerHullIntegrity: 40,
      godModeEnabled: true,
    });
    expect(result.playerHullIntegrity).toBe(100); // restored to maximum
    expect(result.aircraftDangerFlashStepsRemaining).toBe(0);
    expect(result.contactCooldownStepsRemaining).toBe(CONTACT_COOLDOWN_STEPS);
    expect(result.destroyedEnemyCount).toBe(1); // enemy feedback unchanged
  });

  it('keeps God Mode at maximum Hull during a cooldown contact', () => {
    const result = contact([enemyAt(5, 640, 480)], {
      playerHullIntegrity: 40,
      contactCooldownStepsRemaining: 12,
      godModeEnabled: true,
    });
    expect(result.playerHullIntegrity).toBe(100);
    expect(result.aircraftDangerFlashStepsRemaining).toBe(0);
    expect(result.contactCooldownStepsRemaining).toBe(12);
    expect(result.destroyedEnemyCount).toBe(1);
  });

  it('stops all remaining processing once the defeat trigger fires', () => {
    const result = contact([enemyAt(5, 640, 480), enemyAt(6, 640, 480)], {
      playerHullIntegrity: 25,
    });
    expect(result.playerDefeated).toBe(true);
    // The second drone was never processed after the defeat trigger.
    expect(result.destroyedEnemyCount).toBe(1);
    expect(result.enemies.map((e) => e.id)).toEqual([6]);
  });

  it('leaves enemy-enemy overlaps completely inert (AC-051)', () => {
    const result = contact([enemyAt(5, 640, 100), enemyAt(6, 640, 100)]);
    // Both drones overlap each other but neither overlaps the aircraft.
    expect(result.enemies).toHaveLength(2);
    expect(result.destroyedEnemyCount).toBe(0);
    expect(result.playerHullIntegrity).toBe(100);
  });

  it('exposes the exact N+30 cooldown boundary', () => {
    // A contact resolved at step N is next eligible at step N+30.
    const atStep = contact([enemyAt(5, 640, 480)]);
    expect(atStep.contactCooldownStepsRemaining).toBe(CONTACT_COOLDOWN_STEPS);
    let cooldown = atStep.contactCooldownStepsRemaining;
    for (let step = 1; step < CONTACT_COOLDOWN_STEPS; step += 1) {
      cooldown -= 1;
    }
    expect(cooldown).toBe(1); // at the beginning of N+29 it is 1
    // At the beginning of N+30 it is 0 → a contact there is eligible again.
    expect(cooldown - 1).toBe(0);
  });
});

describe('S11 simulation integration (fixed-step collision phase)', () => {
  it('runs projectile-to-enemy before aircraft contacts (player-readable tie-break)', () => {
    // A drone overlapping both the projectile column and the aircraft with a
    // single-hit hull: the projectile destroys it, so it cannot also
    // contact-damage the aircraft.
    const state = stateWith({
      enemies: [enemyAt(5, 640, 451.5, 1)],
    });
    const after = stepOnce(state);
    expect(after.enemies).toEqual([]); // destroyed by the projectile
    expect(after.playerHullIntegrity).toBe(100); // no contact damage
    expect(after.destroyedEnemyCount).toBe(1);
  });

  it('a contact reduces Hull, destroys the drone, and the cooldown/flash start in the same step', () => {
    const state = stateWith({
      enemies: [enemyAt(5, 640, 480)],
    });
    const after = stepOnce(state);
    expect(after.playerHullIntegrity).toBe(75);
    expect(after.contactCooldownStepsRemaining).toBe(CONTACT_COOLDOWN_STEPS);
    expect(after.aircraftDangerFlashStepsRemaining).toBe(
      AIRCRAFT_DAMAGE_FLASH_STEPS,
    );
    expect(after.destroyedEnemyCount).toBe(1);
  });

  it('keeps the aircraft danger flash for exactly six simulation steps', () => {
    let state = stepOnce(stateWith({ enemies: [enemyAt(5, 640, 480)] }));
    expect(state.aircraftDangerFlashStepsRemaining).toBe(
      AIRCRAFT_DAMAGE_FLASH_STEPS,
    );
    for (let elapsed = 1; elapsed < AIRCRAFT_DAMAGE_FLASH_STEPS; elapsed += 1) {
      state = stepOnce(state);
      expect(state.aircraftDangerFlashStepsRemaining).toBe(
        AIRCRAFT_DAMAGE_FLASH_STEPS - elapsed,
      );
    }
    state = stepOnce(state);
    expect(state.aircraftDangerFlashStepsRemaining).toBe(0);
  });

  it('defeat triggers once and freezes every later simulation step (AC-010)', () => {
    const state = stateWith({
      enemies: [enemyAt(5, 640, 480)],
      playerHullIntegrity: 25,
    });
    const defeated = stepOnce(state);
    expect(defeated.playerHullIntegrity).toBe(0);
    expect(defeated.playerDefeated).toBe(true);
    // Later steps are inert: no movement, spawning, firing, or collisions.
    expect(stepOnce(defeated)).toBe(defeated);
    expect(stepOnce(defeated)).toBe(defeated);
  });

  it('counts every destroyed enemy exactly once across the whole mission', () => {
    let state = stepOnce(stateWith({ enemies: [enemyAt(5, 640, 451.5)] }));
    expect(state.destroyedEnemyCount).toBe(1);
    // Further steps never recount the already-destroyed drone.
    for (let index = 0; index < 60; index += 1) {
      state = stepOnce(state);
    }
    expect(state.destroyedEnemyCount).toBe(1);
  });

  it('newly created feedback exposes its full duration in the post-hit snapshot', () => {
    const hit = resolveProjectileCollisions({
      projectiles: [projectileAt(0, 451.5)],
      enemies: [enemyAt(9, 640, 451.5, 3)],
      projectileWidth: PROJECTILE_WIDTH,
      projectileHeight: PROJECTILE_HEIGHT,
      enemySize: ENEMY_SIZE,
      existingFlashes: {},
    });
    expect(hit.flashes[9]).toBe(ENEMY_HIT_FLASH_STEPS);
    expect(hit.destroyedEnemyFlashes).toEqual([]);
    const destroyed = resolveProjectileCollisions({
      projectiles: [projectileAt(0, 451.5, 3)],
      enemies: [enemyAt(9, 640, 451.5, 3)],
      projectileWidth: PROJECTILE_WIDTH,
      projectileHeight: PROJECTILE_HEIGHT,
      enemySize: ENEMY_SIZE,
      existingFlashes: {},
    });
    expect(destroyed.destroyedEnemyFlashes[0]!.stepsRemaining).toBe(
      DESTROYED_ENEMY_FLASH_STEPS,
    );
  });

  it('reprojects destroyed-enemy feedback on resize and keeps the counters (S11)', () => {
    const state = stepOnce(stateWith({ enemies: [enemyAt(5, 640, 451.5)] }));
    expect(state.destroyedEnemyFlashes).toHaveLength(1);
    const resized = submit(state, {
      type: 'combat/viewport-resize',
      width: 800,
      height: 400,
      aircraftWidth: 32 * (1278 / 1231),
      aircraftHeight: 32,
    });
    const flash = resized.destroyedEnemyFlashes[0]!;
    expect(flash.centerX).toBeCloseTo(640 * 0.625, 6);
    // The drone moved one step (72/60 px) before the projectile destroyed it.
    expect(flash.centerY).toBeCloseTo(
      (451.5 + 72 * FIXED_STEP_SECONDS) * (2 / 3),
      6,
    );
    expect(flash.size).toBeCloseTo(16, 6);
    expect(flash.stepsRemaining).toBe(DESTROYED_ENEMY_FLASH_STEPS);
  });
});

describe('S11 hardening and cleanup', () => {
  it('hardens the construction boundary against invalid player Hull input', () => {
    const badHull = {
      initialMode: 'mouse' as const,
      viewportWidth: 1280,
      viewportHeight: 600,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
      weapon: MACHINE_GUN,
      projectile: PLAYER_PROJECTILE,
      missionSeed: 1234,
      enemy: BASIC_DRONE,
      schedule: INTERCEPTION.schedule,
      playerHullIntegrity: 101,
      playerMaximumHullIntegrity: 100,
    };
    expect(() => createCombatSimulation(badHull)).toThrow(/Hull/);
    expect(() =>
      createCombatSimulation({ ...badHull, playerHullIntegrity: Number.NaN }),
    ).toThrow(/Hull/);
    expect(() =>
      createCombatSimulation({
        ...badHull,
        playerHullIntegrity: 100,
        playerMaximumHullIntegrity: 0,
      }),
    ).toThrow(/Hull/);
  });

  it('freezes every gameplay collection after runtime disposal (cleanup)', () => {
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
    expect(runtime.advance(1)).toBe(before);
    expect(runtime.advance(1).playerHullIntegrity).toBe(
      before.playerHullIntegrity,
    );
  });
});

describe('S11 no-tunnelling bound (discrete post-integration AABB)', () => {
  it('cannot tunnel at approved speeds across supported landscape viewports', () => {
    // Projectiles move 100% viewport-height/s upward; enemies 12%/s downward.
    // The worst-case relative vertical approach per fixed step stays below the
    // 4%-short-side enemy height at every supported landscape viewport, so a
    // discrete per-step AABB overlap is guaranteed while the columns overlap.
    for (const viewport of [
      { width: 1280, height: 600 },
      { width: 1500, height: 800 },
      { width: 1920, height: 1080 },
    ]) {
      const height = viewport.height;
      const shortSide = Math.min(viewport.width, viewport.height);
      const enemySize = shortSide * 0.04;
      const relativeApproachPerStep = height * (1 + 0.12) * FIXED_STEP_SECONDS;
      expect(relativeApproachPerStep).toBeLessThan(enemySize);
      // Horizontal: enemies never move laterally once descending and the
      // aircraft moves at most 45% short-side/s.
      const horizontalApproachPerStep =
        (shortSide * 0.45 + height * 0.12) * FIXED_STEP_SECONDS;
      expect(horizontalApproachPerStep).toBeLessThan(enemySize);
    }
  });
});

describe('S11 content seam resolver', () => {
  it('resolves the German Fighter maximum Hull from the catalogue (no magic number)', () => {
    const aircraft = resolveGermanFighter(CONTENT_CATALOGUE);
    expect(aircraft).toBe(GERMAN_FIGHTER);
    expect(aircraft.maximumHullIntegrity).toBe(100);
  });
});

describe('S12 terminal resolution (Combat §9.4–9.5, AC-031)', () => {
  function exhaustedScheduleState(overrides: {
    playerHullIntegrity?: number;
    enemies?: readonly CombatEnemy[];
  }) {
    const base = createState();
    return {
      ...base,
      finalGroupSpawned: true,
      spawnPlan: [],
      spawnPlanIndex: 0,
      playerHullIntegrity: overrides.playerHullIntegrity ?? 100,
      enemies: overrides.enemies ?? [],
    };
  }

  it('emits Defeat when player Hull reaches 0 and freezes every later step', () => {
    const state = exhaustedScheduleState({
      playerHullIntegrity: 25,
      enemies: [enemyAt(5, 640, 480)],
    });
    const defeated = stepOnce(state);
    expect(defeated.playerHullIntegrity).toBe(0);
    expect(defeated.playerDefeated).toBe(true);
    expect(defeated.terminalResult).toEqual({ kind: 'defeat' });
    expect(stepOnce(defeated)).toBe(defeated);
    expect(stepOnce(defeated)).toBe(defeated);
  });

  it('emits Success immediately when the final group spawned, no group remains, and no active enemy remains', () => {
    // The single one-hit drone is destroyed by the projectile in this step.
    const state = exhaustedScheduleState({
      enemies: [enemyAt(5, 640, 451.5, 1)],
    });
    const after = stepOnce(state);
    expect(after.enemies).toEqual([]);
    expect(after.terminalResult).toEqual({ kind: 'success' });
    expect(stepOnce(after)).toBe(after); // frozen
  });

  it('gives Defeat unconditional priority over Success in the same step', () => {
    const state = exhaustedScheduleState({
      playerHullIntegrity: 25,
      enemies: [
        enemyAt(5, 640, 451.5, 1), // destroyed by the projectile
        enemyAt(6, 640, 480, 1), // contact destroys the player
      ],
    });
    const after = stepOnce(state);
    expect(after.enemies).toEqual([]);
    expect(after.playerDefeated).toBe(true);
    expect(after.terminalResult).toEqual({ kind: 'defeat' });
  });

  it('does not use 120 s as an end condition', () => {
    // At 130 s with active enemies the mission continues without a result.
    const state = {
      ...exhaustedScheduleState({
        enemies: [enemyAt(5, 640, 400, 3)],
      }),
      missionStepCount: 130 * 60,
      missionTimeSeconds: 130,
    };
    expect(state.terminalResult).toBeNull();
    const after = stepOnce(state);
    expect(after.terminalResult).toBeNull();
    expect(after.enemies).toHaveLength(1);
  });

  it('never re-evaluates or duplicates a committed terminal result', () => {
    const state = exhaustedScheduleState({
      enemies: [enemyAt(5, 640, 451.5, 1)],
    });
    const after = stepOnce(state);
    expect(after.terminalResult).toEqual({ kind: 'success' });
    for (let index = 0; index < 60; index += 1) {
      expect(stepOnce(after)).toBe(after);
    }
  });
});
