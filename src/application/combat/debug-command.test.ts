import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  HUNTER_DRONE,
  INTERCEPTION_01,
  RANGED_DRONE,
} from '@content/index';
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
    mission: INTERCEPTION_01,
    enemies: [BASIC_DRONE, RANGED_DRONE, HUNTER_DRONE],
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
    // touching the top boundary (S13-WI01: the fixed band-centre position is
    // deterministic — no RNG is consumed, so authored-staging randomness is
    // untouched).
    expect(enemy.centerY + enemy.height / 2).toBe(0);
    expect(isEnemyFullyOutsideViewport(enemy, 1280, 600)).toBe(true);
    // The authored Top fraction (0.5) is projected to the engagement-band
    // horizontal centre.
    expect(enemy.centerX).toBe((state.bounds.minX + state.bounds.maxX) / 2);
    // Every spawn uses the same deterministic position: no RNG draw.
    const again = debug(spawned, {
      type: 'combat-debug/spawn-standard-enemy',
    });
    expect(again.enemies[again.enemies.length - 1]?.centerX).toBe(
      (state.bounds.minX + state.bounds.maxX) / 2,
    );
  });

  it('Spawn Standard Enemy leaves mission time, the authored plan, and arrival state unchanged', () => {
    const state = createState();
    const spawned = debug(state, {
      type: 'combat-debug/spawn-standard-enemy',
    });
    expect(spawned.missionStepCount).toBe(state.missionStepCount);
    expect(spawned.missionTimeSeconds).toBe(state.missionTimeSeconds);
    expect(spawned.enemyPlan).toBe(state.enemyPlan);
    expect(spawned.arrivalGroupIndex).toBe(state.arrivalGroupIndex);
  });

  it('Spawn Encounter is additive, keeps existing enemies and mission time, and is a strict no-op once spawned', () => {
    const state = createState();
    const forced = debug(state, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e1',
    });
    // e1 (10 s) is the authored opening Encounter: 4 Basics at the authored
    // placements, appended without advancing mission time or consuming the
    // mission-data stream's Hunter draws. The spawned groups are consumed by
    // removal from the plan (the cursor points at the first still-scheduled
    // group).
    expect(forced.enemies.length).toBe(state.enemies.length + 4);
    expect(forced.missionTimeSeconds).toBe(state.missionTimeSeconds);
    expect(forced.arrivalGroups).toHaveLength(state.arrivalGroups.length - 1);
    expect(
      forced.arrivalGroups.every(
        (group) => group.encounterId !== 'interception-01-e1',
      ),
    ).toBe(true);
    // One-use: a repeated command for the already-spawned Encounter is inert.
    const repeated = debug(forced, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e1',
    });
    expect(repeated.enemies).toBe(forced.enemies);
  });

  it('Spawn Encounter materialises an OUT-OF-ORDER encounter (e5) exactly (V02-WI-04 C03)', () => {
    const state = createState();
    const forced = debug(state, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e5',
    });
    // e5 is the final (03:10) Encounter: 3 Basic + 1 Ranged + 1 Hunter. The
    // previous implementation silently no-opped here (the cursor only walked
    // the next scheduled encounter), which is why the C01 visual evidence was
    // false-green.
    expect(forced.enemies.length).toBe(state.enemies.length + 5);
    const roles = forced.enemies
      .slice(state.enemies.length)
      .map((enemy) => enemy.type)
      .sort();
    expect(roles).toEqual([
      'basic-drone',
      'basic-drone',
      'basic-drone',
      'hunter-drone',
      'ranged-drone',
    ]);
    expect(
      forced.arrivalGroups.every(
        (group) => group.encounterId !== 'interception-01-e5',
      ),
    ).toBe(true);
    // The natural schedule never duplicates the authored group.
    const repeated = debug(forced, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e5',
    });
    expect(repeated.enemies).toBe(forced.enemies);
    // An unknown encounter id remains a strict no-op.
    const unknown = debug(state, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-missing',
    });
    expect(unknown.enemies).toBe(state.enemies);
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
    // V02-WI-04 C01: the Debug command must NOT complete the deterministic
    // centre-and-up exit. The Debug pause is closed through the authoritative
    // lifecycle so forced Success runs the same committed 0.5 s centre phase
    // and 60% VH/s upward exit as natural Success before result presentation;
    // the exit still waits for the campaign transaction (`authorizeSuccessExit`).
    expect(won.successExitPhase).toBe('centre');
    expect(won.successExitAuthorized).toBe(false);
    expect(won.arrivalGroupIndex).toBe(won.arrivalGroups.length);
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
    // relay; the v0.2 paid full-Repair/Game Over economy is owned by the domain
    // campaign transition and the terminal-save application boundary.
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
