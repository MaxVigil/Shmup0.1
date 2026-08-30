import { describe, expect, it } from 'vitest';
import { BASIC_DRONE, MVP_ENEMY_GROUP_SCHEDULE } from '@content/index';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { applyDebugCommand, createCombatSimulation } from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import { isDebugCommandEligible } from './debug-command';
import type { CombatDebugCommand } from './debug-command';
import { resolveGermanFighter } from './combat-session';
import { isEnemyFullyOutsideViewport } from './enemies';

const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
const AIRCRAFT_HEIGHT = 48;
const ENEMY_SIZE = 24;

function createState(): CombatSimulationState {
  const aircraft = resolveGermanFighter(CONTENT_CATALOGUE);
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
    schedule: MVP_ENEMY_GROUP_SCHEDULE,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}

function debug(
  state: CombatSimulationState,
  command: CombatDebugCommand,
): CombatSimulationState {
  return applyDebugCommand(state, command);
}

describe('S13 Debug: God Mode and Hull controls (Combat §11.4)', () => {
  it('enabling God Mode immediately sets Hull to maximum and clears the damage flash', () => {
    const state: CombatSimulationState = {
      ...createState(),
      playerHullIntegrity: 40,
      aircraftDangerFlashStepsRemaining: 3,
    };
    const enabled = debug(state, {
      type: 'combat-debug/god-mode',
      enabled: true,
    });
    expect(enabled.godModeEnabled).toBe(true);
    expect(enabled.playerHullIntegrity).toBe(state.playerMaximumHullIntegrity);
    expect(enabled.aircraftDangerFlashStepsRemaining).toBe(0);
  });

  it('disabling God Mode leaves Hull at maximum', () => {
    const enabled = debug(createState(), {
      type: 'combat-debug/god-mode',
      enabled: true,
    });
    const disabled = debug(enabled, {
      type: 'combat-debug/god-mode',
      enabled: false,
    });
    expect(disabled.godModeEnabled).toBe(false);
    expect(disabled.playerHullIntegrity).toBe(
      enabled.playerMaximumHullIntegrity,
    );
  });

  it('Set Hull changes Hull immediately without damage feedback or result', () => {
    const state = createState();
    const at25 = debug(state, { type: 'combat-debug/set-hull', hull: 25 });
    expect(at25.playerHullIntegrity).toBe(25);
    expect(at25.aircraftDangerFlashStepsRemaining).toBe(0);
    expect(at25.terminalResult).toBeNull();
    const at100 = debug(at25, { type: 'combat-debug/set-hull', hull: 100 });
    expect(at100.playerHullIntegrity).toBe(100);
  });

  it('Set Hull is disabled (strict no-op) while God Mode is enabled', () => {
    const god = debug(createState(), {
      type: 'combat-debug/god-mode',
      enabled: true,
    });
    const attempted = debug(god, { type: 'combat-debug/set-hull', hull: 25 });
    expect(attempted.playerHullIntegrity).toBe(god.playerMaximumHullIntegrity);
  });
});

describe('S13 Debug: spawn controls (Combat §11.5)', () => {
  it('Spawn Standard Enemy adds exactly one Basic Drone at a valid top-edge position', () => {
    const state = createState();
    const before = state.enemies.length;
    const spawned = debug(state, {
      type: 'combat-debug/spawn-standard-enemy',
    });
    expect(spawned.enemies.length).toBe(before + 1);
    expect(spawned.nextEnemyId).toBe(state.nextEnemyId + 1);
    // The debug drone is appended after the existing active enemies.
    const enemy = spawned.enemies[spawned.enemies.length - 1];
    if (enemy === undefined) {
      throw new Error('Expected the spawned debug enemy.');
    }
    expect(enemy.entry).toBe('top');
    // Complete hitbox outside the viewport with its nearest (bottom) edge
    // touching the top boundary (S13-WI01: the fixed position is exactly the
    // viewport horizontal centre — no RNG is consumed, so scheduled-spawn
    // randomness is untouched).
    expect(enemy.centerY + ENEMY_SIZE / 2).toBe(0);
    expect(isEnemyFullyOutsideViewport(enemy, 1280, 600, ENEMY_SIZE)).toBe(
      true,
    );
    expect(enemy.centerX).toBe(640);
    // Every spawn uses the same deterministic position: no RNG draw.
    const again = debug(spawned, {
      type: 'combat-debug/spawn-standard-enemy',
    });
    expect(again.enemies[again.enemies.length - 1]?.centerX).toBe(640);
  });

  it('Spawn Standard Enemy leaves mission time, the schedule, and final-group state unchanged', () => {
    const state = createState();
    const spawned = debug(state, {
      type: 'combat-debug/spawn-standard-enemy',
    });
    expect(spawned.missionStepCount).toBe(state.missionStepCount);
    expect(spawned.missionTimeSeconds).toBe(state.missionTimeSeconds);
    expect(spawned.spawnPlan).toBe(state.spawnPlan);
    expect(spawned.spawnPlanIndex).toBe(state.spawnPlanIndex);
    expect(spawned.finalGroupSpawned).toBe(state.finalGroupSpawned);
  });

  it('Spawn Final Group is additive, keeps existing enemies and mission time, and disables itself', () => {
    const state = createState();
    const forced = debug(state, {
      type: 'combat-debug/spawn-final-group',
    });
    expect(forced.finalGroupSpawned).toBe(true);
    expect(forced.spawnPlanIndex).toBe(forced.spawnPlan.length);
    expect(forced.enemies.length).toBeGreaterThan(state.enemies.length);
    expect(forced.missionTimeSeconds).toBe(state.missionTimeSeconds);
    // One-use: a repeated command is a strict no-op.
    const repeated = debug(forced, {
      type: 'combat-debug/spawn-final-group',
    });
    expect(repeated.enemies).toBe(forced.enemies);
  });
});

describe('S13 Debug: forced results reuse the S12 terminal path (Combat §11.6)', () => {
  it('Win Mission produces a normal Success even while enemies remain', () => {
    const state: CombatSimulationState = {
      ...createState(),
      enemies: [],
    };
    const won = debug(state, { type: 'combat-debug/win-mission' });
    expect(won.terminalResult).toEqual({ kind: 'success' });
    expect(won.finalGroupSpawned).toBe(true);
    expect(won.spawnPlanIndex).toBe(won.spawnPlan.length);
    expect(won.enemies).toHaveLength(0);
    // Terminal freeze: no further advancement or Debug mutation.
    expect(debug(won, { type: 'combat-debug/win-mission' })).toBe(won);
    expect(debug(won, { type: 'combat-debug/set-hull', hull: 25 })).toBe(won);
  });

  it('Lose Mission disables God Mode, sets authoritative Hull to 0, then produces a normal Defeat', () => {
    const god = debug(createState(), {
      type: 'combat-debug/god-mode',
      enabled: true,
    });
    const lost = debug(god, { type: 'combat-debug/lose-mission' });
    expect(lost.godModeEnabled).toBe(false);
    // S13-WI01: the authoritative player Hull is 0 before the normal Defeat
    // relay; emergency recovery to 25 stays owned by the S12 session reducer.
    expect(lost.playerHullIntegrity).toBe(0);
    expect(lost.terminalResult).toEqual({ kind: 'defeat' });
    // Repeated or racing commands after the first terminal are strict no-ops.
    expect(debug(lost, { type: 'combat-debug/lose-mission' })).toBe(lost);
  });
});

describe('S13-WI01 Debug eligibility at the command boundary', () => {
  it('accepts a Debug action only in the exact development Debug state', () => {
    expect(
      isDebugCommandEligible(
        {
          activeMissionOrdinal: 1,
          overlay: 'debug',
          debugMode: true,
        },
        1,
      ),
    ).toBe(true);
  });

  it('rejects while running, paused in Pause/Settings, and in production', () => {
    const contexts = [
      { activeMissionOrdinal: 1, overlay: 'none', debugMode: true },
      { activeMissionOrdinal: 1, overlay: 'pause', debugMode: true },
      { activeMissionOrdinal: 1, overlay: 'settings', debugMode: true },
      { activeMissionOrdinal: 1, overlay: 'debug', debugMode: false },
    ] as const;
    for (const context of contexts) {
      expect(isDebugCommandEligible(context, 1)).toBe(false);
    }
  });

  it('rejects from a stale mission and when no mission is active', () => {
    expect(
      isDebugCommandEligible(
        { activeMissionOrdinal: 2, overlay: 'debug', debugMode: true },
        1,
      ),
    ).toBe(false);
    expect(
      isDebugCommandEligible(
        { activeMissionOrdinal: null, overlay: 'debug', debugMode: true },
        1,
      ),
    ).toBe(false);
  });
});
