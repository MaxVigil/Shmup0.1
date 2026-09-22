import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  HUNTER_DRONE,
  INTERCEPTION_01,
  INTERCEPTION_03,
  RANGED_DRONE,
} from '@content/index';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import { CONTENT_CATALOGUE } from '@test-support/content';
import type { EnemyType } from '@domain/index';
import {
  createEliteMovementStream,
  createRangedFireStream,
} from '@domain/random';
import type { ResolvedSpawnPlacement } from '../mission/encounter-resolution';
import {
  applyDebugCommand,
  createCombatSimulation,
  EVACUATION_COUNTDOWN_STEPS,
  EXIT_CENTRE_STEPS,
  FIXED_STEP_SECONDS,
  stepCombatSimulation,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import {
  buildCombatObservability,
  isDebugCommandEligible,
} from './debug-command';
import type { CombatDebugCommand, CombatObservability } from './debug-command';
import { resolveGermanFighter } from './combat-session';
import {
  drawEliteMovementDecision,
  isEnemyFullyOutsideViewport,
} from './enemies';

const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
const AIRCRAFT_HEIGHT = 48;

/** The four approved enemy roles, for exhaustive read-model assertions. */
const ROLE_KEYS: readonly EnemyType[] = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
  'elite-drone',
];

function createStateFor(
  mission: typeof INTERCEPTION_01,
): CombatSimulationState {
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
    mission,
    enemies: [BASIC_DRONE, RANGED_DRONE, HUNTER_DRONE],
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}

function createState(): CombatSimulationState {
  return createStateFor(INTERCEPTION_01);
}

/** Mission 03 authors the Elite: it resolves the authored Elite member ordinal
 *  and the dedicated `elite-movement` stream identity. */
function createMission03State(): CombatSimulationState {
  return createStateFor(INTERCEPTION_03);
}

/** The first authored Hunter Side Placement of the current mission plan. */
function authoredHunterPlacement(
  state: CombatSimulationState,
): ResolvedSpawnPlacement {
  for (const encounter of state.enemyPlan.encounters) {
    for (const group of encounter.staging ?? []) {
      for (const member of group.members) {
        if (member.type === 'hunter-drone') {
          return member.placement;
        }
      }
    }
  }
  throw new Error('Expected an authored Hunter placement.');
}

/** The authored Elite member ordinal of the current mission plan, derived the
 *  same way the runtime's stable mission-ordinal owner does. */
function authoredEliteOrdinal(state: CombatSimulationState): number {
  let ordinal = 0;
  for (const encounter of state.enemyPlan.encounters) {
    for (const group of encounter.staging ?? []) {
      for (const member of group.members) {
        if (member.type === 'elite-drone') {
          return ordinal;
        }
        ordinal += 1;
      }
    }
  }
  return -1;
}

/** Total authored mission-member count: the exclusive upper bound of every
 *  authored member ordinal (and so the start of the Debug identity space). */
function authoredMemberCount(state: CombatSimulationState): number {
  let count = 0;
  for (const group of state.arrivalGroups) {
    count += group.members.length;
  }
  return count;
}

/** Every authored Ranged member ordinal of the current mission, which keys the
 *  mission's own `ranged-fire` streams. */
function authoredRangedOrdinals(state: CombatSimulationState): number[] {
  const ordinals: number[] = [];
  for (const group of state.arrivalGroups) {
    for (const member of group.members) {
      if (member.type === 'ranged-drone') {
        ordinals.push(member.ordinal);
      }
    }
  }
  return ordinals;
}

/** Steps the shared fixed-step pipeline until `predicate` holds. */
function stepUntil(
  state: CombatSimulationState,
  maxSteps: number,
  predicate: (candidate: CombatSimulationState) => boolean,
): { readonly state: CombatSimulationState; readonly steps: number } {
  let current = state;
  for (let step = 1; step <= maxSteps; step += 1) {
    current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    if (predicate(current)) {
      return { state: current, steps: step };
    }
  }
  throw new Error(`Condition not reached within ${maxSteps} steps.`);
}

function debug(
  state: CombatSimulationState,
  command: CombatDebugCommand,
): CombatSimulationState {
  return applyDebugCommand(state, command);
}

function observabilityOf(state: CombatSimulationState): CombatObservability {
  return buildCombatObservability(state);
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

describe('S13/V02-WI-07 Debug: per-type spawn controls (Combat §11.5, Epic §17)', () => {
  it('Spawn Basic adds exactly one Basic Drone at the engagement-band centre top entry', () => {
    const state = createState();
    const before = state.enemies.length;
    const spawned = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'basic-drone',
    });
    expect(spawned.enemies.length).toBe(before + 1);
    expect(spawned.nextEnemyId).toBe(state.nextEnemyId + 1);
    // The debug drone is appended after the existing active enemies.
    const enemy = spawned.enemies[spawned.enemies.length - 1];
    if (enemy === undefined) {
      throw new Error('Expected the spawned debug enemy.');
    }
    expect(enemy.type).toBe('basic-drone');
    expect(enemy.entry).toBe('top');
    // Complete hitbox outside the viewport with its nearest (bottom) edge
    // touching the top boundary (S13-WI01: the fixed band-centre position is
    // deterministic — no RNG is consumed, so authored-staging randomness is
    // untouched).
    expect(enemy.centerY + enemy.height / 2).toBe(0);
    expect(isEnemyFullyOutsideViewport(enemy, 1280, 600)).toBe(true);
    // The Top fraction (0.5) is projected to the engagement-band horizontal
    // centre — the Aircraft's initial automatic-fire column.
    expect(enemy.centerX).toBe((state.bounds.minX + state.bounds.maxX) / 2);
    // Every spawn uses the same deterministic position: no RNG draw.
    const again = debug(spawned, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'basic-drone',
    });
    expect(again.enemies[again.enemies.length - 1]?.centerX).toBe(
      (state.bounds.minX + state.bounds.maxX) / 2,
    );
  });

  it('Spawn Ranged adds one fully independent Ranged Drone with its own canonical fire stream', () => {
    const state = createState();
    const spawned = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'ranged-drone',
    });
    const enemy = spawned.enemies[spawned.enemies.length - 1];
    if (enemy === undefined) {
      throw new Error('Expected the spawned debug enemy.');
    }
    expect(enemy.type).toBe('ranged-drone');
    expect(enemy.kind).toBe('ranged');
    expect(enemy.entry).toBe('top');
    expect(enemy.centerX).toBe((state.bounds.minX + state.bounds.maxX) / 2);
    expect(enemy.centerY + enemy.height / 2).toBe(0);
    // V02-WI-07 D01-C01: a stable Debug identity OUTSIDE the authored
    // member-ordinal range, so it can never collide with an authored Ranged.
    const authoredCount = authoredMemberCount(state);
    expect(enemy.ordinal).toBeGreaterThanOrEqual(authoredCount);
    expect(authoredRangedOrdinals(state)).not.toContain(enemy.ordinal);
    // Its OWN canonical `ranged-fire` stream instance...
    const own = spawned.rangedFireStreams[enemy.ordinal];
    expect(own).toBeDefined();
    expect(own).not.toBe(state.rangedFireStreams[enemy.ordinal]);
    // ...and every authored stream object is untouched (never replaced).
    for (const authoredOrdinal of authoredRangedOrdinals(state)) {
      expect(spawned.rangedFireStreams[authoredOrdinal]).toBe(
        state.rangedFireStreams[authoredOrdinal],
      );
    }
  });

  it('a Debug-spawned Ranged activates and fires through the normal first-shot and cadence path', () => {
    // Park the Aircraft off the Debug spawn's engagement-band-centre column so
    // the automatic fire cannot destroy the subject: this test isolates the
    // canonical Ranged activation/first-shot/cadence owner.
    const base = createState();
    const state: CombatSimulationState = {
      ...base,
      aircraft: { ...base.aircraft, centerX: 160 },
      mouseTarget: { x: 160, y: base.aircraft.centerY },
    };
    const spawned = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'ranged-drone',
    });
    expect(spawned.enemies[spawned.enemies.length - 1]?.centerX).toBe(640);
    const enemy = spawned.enemies[spawned.enemies.length - 1];
    if (enemy === undefined) {
      throw new Error('Expected the spawned debug Ranged.');
    }
    const id = enemy.id;
    const ordinal = enemy.ordinal;

    // Canonical full-bounds activation, then the exact 180-step first shot.
    const activated = stepUntil(spawned, 600, (candidate) => {
      const current = candidate.enemies.find((entry) => entry.id === id);
      return current?.kind === 'ranged' && current.activated;
    });
    const activatedEnemy = activated.state.enemies.find(
      (entry) => entry.id === id,
    );
    if (activatedEnemy?.kind !== 'ranged') {
      throw new Error('Expected an activated Debug Ranged.');
    }
    expect(activatedEnemy.firingStepsRemaining).toBe(180);
    expect(activated.state.enemyProjectiles).toHaveLength(0);

    const fired = stepUntil(
      activated.state,
      200,
      (candidate) => candidate.enemyProjectiles.length > 0,
    );
    expect(fired.steps).toBe(180);
    // The projectile is the canonical ranged geometry and the actor is still
    // alive: this is a fully valid Ranged, not the defensive no-stream path.
    expect(fired.state.enemyProjectiles[0]?.kind).toBe('ranged');
    expect(fired.state.enemyProjectiles[0]?.width).toBe(
      fired.state.rangedProjectileGeometry.width,
    );
    // The post-shot interval is drawn from its OWN stream (its first draw).
    const ownStream = createRangedFireStream(spawned.missionSeed, ordinal);
    const expectedInterval = 60 + ownStream.nextInt(121);
    const afterShot = fired.state.enemies.find((entry) => entry.id === id);
    if (afterShot?.kind !== 'ranged') {
      throw new Error('Expected the Debug Ranged to survive its first shot.');
    }
    expect(afterShot.firingStepsRemaining).toBe(expectedInterval);
  });

  it('two Debug-spawned Ranged drones own distinct streams and replay deterministically', () => {
    const first = debug(createState(), {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'ranged-drone',
    });
    const twice = debug(first, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'ranged-drone',
    });
    const firstEnemy = twice.enemies[twice.enemies.length - 2];
    const secondEnemy = twice.enemies[twice.enemies.length - 1];
    if (firstEnemy === undefined || secondEnemy === undefined) {
      throw new Error('Expected two Debug Ranged drones.');
    }
    expect(firstEnemy.ordinal).not.toBe(secondEnemy.ordinal);
    const firstStream = twice.rangedFireStreams[firstEnemy.ordinal];
    const secondStream = twice.rangedFireStreams[secondEnemy.ordinal];
    expect(firstStream).toBeDefined();
    expect(secondStream).toBeDefined();
    expect(firstStream).not.toBe(secondStream);
    // Independent instances derived from the canonical owner: the same seed and
    // ordinal replay the identical sequence, distinct ordinals do not.
    const firstReplay = createRangedFireStream(
      twice.missionSeed,
      firstEnemy.ordinal,
    );
    const secondReplay = createRangedFireStream(
      twice.missionSeed,
      secondEnemy.ordinal,
    );
    expect([firstStream!.nextInt(121), firstStream!.nextInt(121)]).toEqual([
      firstReplay.nextInt(121),
      firstReplay.nextInt(121),
    ]);
    expect([secondStream!.nextInt(121)]).toEqual([secondReplay.nextInt(121)]);
    // An identical command sequence from an identical state is reproducible.
    const replayed = debug(
      debug(createState(), {
        type: 'combat-debug/spawn-enemy',
        enemyType: 'ranged-drone',
      }),
      { type: 'combat-debug/spawn-enemy', enemyType: 'ranged-drone' },
    );
    expect(replayed.enemies.map((entry) => entry.ordinal)).toEqual(
      twice.enemies.map((entry) => entry.ordinal),
    );
  });

  it('Debug spawns never consume or shift an authored Ranged stream', () => {
    const state = createState();
    const authoredOrdinals = authoredRangedOrdinals(state);
    expect(authoredOrdinals.length).toBeGreaterThan(0);
    // Materialize the authored e2 Ranged, then add two Debug Ranged drones: the
    // authored stream must be neither replaced nor advanced.
    const withAuthored = debug(state, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e2',
    });
    const withDebug = debug(withAuthored, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'ranged-drone',
    });
    const doubleDebug = debug(withDebug, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'ranged-drone',
    });
    for (const authoredOrdinal of authoredOrdinals) {
      const before = state.rangedFireStreams[authoredOrdinal];
      expect(before).toBeDefined();
      // Object identity proves the authored stream was never replaced.
      expect(doubleDebug.rangedFireStreams[authoredOrdinal]).toBe(before);
      // Value identity proves the authored stream consumed zero draws.
      const fresh = createRangedFireStream(state.missionSeed, authoredOrdinal);
      expect(before!.nextInt(121)).toBe(fresh.nextInt(121));
      expect(before!.nextInt(121)).toBe(fresh.nextInt(121));
    }
  });

  it('treats an out-of-contract enemy type as a strict no-op', () => {
    const state = createState();
    const attempted = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'fighter' as unknown as EnemyType,
    });
    expect(attempted).toBe(state);
  });

  it('Spawn Standard Enemy leaves mission time and the authored plan unchanged', () => {
    const state = createState();
    const spawned = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'basic-drone',
    });
    expect(spawned.missionStepCount).toBe(state.missionStepCount);
    expect(spawned.missionTimeSeconds).toBe(state.missionTimeSeconds);
    expect(spawned.enemyPlan).toBe(state.enemyPlan);
    expect(spawned.arrivalGroupIndex).toBe(state.arrivalGroupIndex);
  });

  it('Spawn Hunter reuses the CURRENT mission authored Side entry placement instead of inventing geometry', () => {
    const state = createState();
    const authored = authoredHunterPlacement(state);
    if (authored.kind !== 'side') {
      throw new Error('Expected an authored Side Hunter placement.');
    }
    const spawned = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'hunter-drone',
    });
    const enemy = spawned.enemies[spawned.enemies.length - 1];
    if (enemy === undefined) {
      throw new Error('Expected the spawned debug Hunter.');
    }
    expect(enemy.type).toBe('hunter-drone');
    expect(enemy.kind).toBe('hunter');
    // The complete hitbox starts fully outside the authored Side boundary.
    expect(enemy.entry).toBe(authored.side);
    expect(enemy.centerY).toBeCloseTo(
      authored.yViewportFraction * state.viewportHeight,
      10,
    );
    if (authored.side === 'upper-left') {
      expect(enemy.centerX + enemy.width / 2).toBe(0);
    } else {
      expect(enemy.centerX - enemy.width / 2).toBe(state.viewportWidth);
    }
  });

  it('Spawn Elite creates the Elite at its fixed anchor with its own canonical movement stream', () => {
    const state = createState();
    const spawned = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    const enemy = spawned.enemies[spawned.enemies.length - 1];
    if (enemy === undefined || enemy.kind !== 'elite') {
      throw new Error('Expected the spawned debug Elite.');
    }
    expect(enemy.type).toBe('elite-drone');
    expect(enemy.activated).toBe(false);
    expect(enemy.phase).toBe('entering');
    expect(enemy.phaseStepsElapsed).toBe(0);
    expect(enemy.centerX).toBe(state.viewportWidth * 0.5);
    expect(enemy.centerY).toBe(state.viewportHeight * 0.2);
    // A non-colliding Debug identity with its OWN `elite-movement` stream.
    expect(enemy.ordinal).toBeGreaterThanOrEqual(authoredMemberCount(state));
    const own = spawned.eliteMovementStreams[enemy.ordinal];
    expect(own).toBeDefined();
    const replay = createEliteMovementStream(state.missionSeed, enemy.ordinal);
    expect(drawEliteMovementDecision(own!)).toEqual(
      drawEliteMovementDecision(replay),
    );
  });

  it('Debug Elites never share the authored Elite identity, stream, or sequence', () => {
    const state = createMission03State();
    const authoredOrdinal = authoredEliteOrdinal(state);
    expect(authoredOrdinal).toBeGreaterThan(0);
    const authoredStream = state.eliteMovementStreams[authoredOrdinal];
    expect(authoredStream).toBeDefined();

    // Two Debug Elites plus the authored identity: three distinct streams.
    const first = debug(state, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    const twice = debug(first, {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    const firstElite = twice.enemies[twice.enemies.length - 2];
    const secondElite = twice.enemies[twice.enemies.length - 1];
    if (firstElite === undefined || secondElite === undefined) {
      throw new Error('Expected two Debug Elites.');
    }
    expect(firstElite.ordinal).not.toBe(authoredOrdinal);
    expect(secondElite.ordinal).not.toBe(authoredOrdinal);
    expect(firstElite.ordinal).not.toBe(secondElite.ordinal);
    expect(twice.eliteMovementStreams[firstElite.ordinal]).not.toBe(
      twice.eliteMovementStreams[secondElite.ordinal],
    );
    // The authored stream object is neither replaced nor advanced.
    expect(twice.eliteMovementStreams[authoredOrdinal]).toBe(authoredStream);
    const authoredReplay = createEliteMovementStream(
      state.missionSeed,
      authoredOrdinal,
    );
    expect(drawEliteMovementDecision(authoredStream!)).toEqual(
      drawEliteMovementDecision(authoredReplay),
    );
    // The authored mission's own Elite keeps its authored identity when the
    // authored Encounter is materialized (that command is not a Debug spawn).
    const forced = debug(state, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-03-e8',
    });
    const forcedElite = forced.enemies[forced.enemies.length - 1];
    if (forcedElite === undefined || forcedElite.kind !== 'elite') {
      throw new Error('Expected the authored Elite.');
    }
    expect(forcedElite.ordinal).toBe(authoredOrdinal);
    expect(forced.eliteMovementStreams[authoredOrdinal]).toBe(authoredStream);
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

  it('Spawn Encounter addresses every authored Encounter of the CURRENT mission (V02-WI-07 D01)', () => {
    // Mission 03 authors eight Encounters including the Elite-only e8: each one
    // is reachable through the same command with no hard-coded subset, and no
    // foreign-mission identity is ever accepted.
    const state = createMission03State();
    const encounterIds = state.arrivalGroups.map((group) => group.encounterId);
    expect(new Set(encounterIds).size).toBe(8);
    for (const encounterId of encounterIds) {
      // Encounter e3 authors two Arrival Groups: every group of the named
      // encounter is materialized, not only the first.
      const expectedMembers = state.arrivalGroups
        .filter((group) => group.encounterId === encounterId)
        .reduce((total, group) => total + group.members.length, 0);
      const forced = debug(state, {
        type: 'combat-debug/spawn-encounter',
        encounterId,
      });
      expect(forced.enemies.length).toBe(
        state.enemies.length + expectedMembers,
      );
      expect(
        forced.arrivalGroups.some((group) => group.encounterId === encounterId),
      ).toBe(false);
    }
    // A foreign-mission identity stays a strict no-op.
    const foreign = debug(state, {
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e1',
    });
    expect(foreign.enemies).toBe(state.enemies);
    expect(foreign.arrivalGroups).toBe(state.arrivalGroups);
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
    // the exit still waits for the campaign transaction (`authorizeCommittedExit`).
    expect(won.exitPhase).toBe('centre');
    expect(won.exitAuthorized).toBe(false);
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

describe('V02-WI-07 Debug: Elite phase controls (Epic §17, V02-AC-026)', () => {
  it('is a strict no-op when the simulation has no Elite', () => {
    const state = createState();
    const attempted = debug(state, {
      type: 'combat-debug/set-elite-phase',
      phase: 'vulnerable',
    });
    expect(attempted).toBe(state);
  });

  it('activates a not-yet-active Elite at its canonical anchor before entering the requested phase', () => {
    const withElite = debug(createState(), {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    const armoured = debug(withElite, {
      type: 'combat-debug/set-elite-phase',
      phase: 'armoured',
    });
    const elite = armoured.enemies[armoured.enemies.length - 1];
    if (elite === undefined || elite.kind !== 'elite') {
      throw new Error('Expected the Elite.');
    }
    // The activation is the canonical anchor activation, not an off-anchor one.
    expect(elite.activated).toBe(true);
    expect(elite.phase).toBe('armoured');
    expect(elite.phaseStepsElapsed).toBe(0);
    expect(elite.centerX).toBe(armoured.viewportWidth * 0.5);
    expect(elite.centerY).toBe(armoured.viewportHeight * 0.2);
    expect(elite.attackStepsRemaining).toBeGreaterThan(0);
  });

  it('moves the current Elite between the two active phases through the single transition owner', () => {
    const withElite = debug(createState(), {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    const vulnerable = debug(withElite, {
      type: 'combat-debug/set-elite-phase',
      phase: 'vulnerable',
    });
    const elite = vulnerable.enemies[vulnerable.enemies.length - 1];
    if (elite === undefined || elite.kind !== 'elite') {
      throw new Error('Expected the Elite.');
    }
    expect(elite.activated).toBe(true);
    expect(elite.phase).toBe('vulnerable');
    // The phase entry reinitializes the phase timer and the phase's own fresh
    // attack timer, so the Debug action can never leave a parallel/old timer.
    expect(elite.phaseStepsElapsed).toBe(0);
    expect(elite.phaseStepsRemaining).toBe(360);
    expect(elite.attackStepsRemaining).toBe(150);
    // Re-entering the phase it already owns is a strict no-op.
    const repeated = debug(vulnerable, {
      type: 'combat-debug/set-elite-phase',
      phase: 'vulnerable',
    });
    expect(repeated.enemies).toBe(vulnerable.enemies);
  });

  it('does not consume the Elite movement stream or invent a decision', () => {
    const withElite = debug(createState(), {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    const spawnedElite = withElite.enemies[withElite.enemies.length - 1];
    if (spawnedElite === undefined || spawnedElite.kind !== 'elite') {
      throw new Error('Expected the Elite.');
    }
    // The stream is keyed by the Elite's own Debug identity, and the phase
    // transition leaves it completely untouched.
    const before = withElite.eliteMovementStreams[spawnedElite.ordinal];
    expect(before).toBeDefined();
    const vulnerable = debug(withElite, {
      type: 'combat-debug/set-elite-phase',
      phase: 'vulnerable',
    });
    expect(vulnerable.eliteMovementStreams[spawnedElite.ordinal]).toBe(before);
    const elite = vulnerable.enemies[vulnerable.enemies.length - 1];
    if (elite === undefined || elite.kind !== 'elite') {
      throw new Error('Expected the Elite.');
    }
    // RNG is not consumed by the Debug transition: the next executed step owns
    // the movement-decision draw.
    expect(elite.movementDecisionStepsRemaining).toBe(0);
    expect(elite.horizontalDirection).toBeNull();
    const replay = createEliteMovementStream(
      withElite.missionSeed,
      spawnedElite.ordinal,
    );
    expect(drawEliteMovementDecision(before!)).toEqual(
      drawEliteMovementDecision(replay),
    );
  });

  it('is a strict no-op after the terminal freeze', () => {
    const won = debug(createState(), { type: 'combat-debug/win-mission' });
    expect(
      debug(won, { type: 'combat-debug/set-elite-phase', phase: 'armoured' }),
    ).toBe(won);
  });
});

describe('V02-WI-07 Debug: forced successful Evacuation (Epic §17, V02-AC-014/015/026)', () => {
  it('resolves the immutable Evacuated terminal with the shared committed-exit centre phase', () => {
    const active = createState();
    const evacuated = debug(active, {
      type: 'combat-debug/evacuate-mission',
    });
    expect(evacuated.terminalResult).toEqual({ kind: 'evacuated' });
    expect(evacuated.exitPhase).toBe('centre');
    expect(evacuated.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
    expect(evacuated.exitAuthorized).toBe(false);
    // No countdown is left live and no economy is recalculated here: the entry
    // relays the frozen terminal through the unchanged atomic commit path.
    expect(evacuated.evacuationStepsRemaining).toBe(0);
    expect(evacuated.pendingCombatRewards).toBe(active.pendingCombatRewards);
    expect(evacuated.pendingEscapePenalties).toBe(
      active.pendingEscapePenalties,
    );
    // Remaining enemies are untouched: they fade through the committed exit and
    // never become Escaped or add a penalty.
    expect(evacuated.enemies).toBe(active.enemies);
    expect(evacuated.escapedCountByType).toBe(active.escapedCountByType);
  });

  it('resolves early from a running Evacuation commitment without a second countdown implementation', () => {
    const committed = {
      ...createState(),
      evacuationStepsRemaining: 277,
    };
    const evacuated = debug(committed, {
      type: 'combat-debug/evacuate-mission',
    });
    expect(evacuated.terminalResult).toEqual({ kind: 'evacuated' });
    expect(evacuated.evacuationStepsRemaining).toBe(0);
    // The source state is never mutated.
    expect(committed.evacuationStepsRemaining).toBe(277);
    expect(EVACUATION_COUNTDOWN_STEPS).toBe(300);
  });

  it('keeps Defeat priority and the terminal freeze', () => {
    const defeated = {
      ...createState(),
      playerDefeated: true,
    };
    const resolved = debug(defeated, {
      type: 'combat-debug/evacuate-mission',
    });
    expect(resolved.terminalResult).toEqual({ kind: 'defeat' });
    const evacuated = debug(createState(), {
      type: 'combat-debug/evacuate-mission',
    });
    // Repeated/racing terminal commands after the first terminal are inert.
    expect(debug(evacuated, { type: 'combat-debug/evacuate-mission' })).toBe(
      evacuated,
    );
    expect(debug(evacuated, { type: 'combat-debug/win-mission' })).toBe(
      evacuated,
    );
    expect(debug(evacuated, { type: 'combat-debug/lose-mission' })).toBe(
      evacuated,
    );
    expect(debug(evacuated, { type: 'combat-debug/set-hull', hull: 25 })).toBe(
      evacuated,
    );
  });
});

describe('V02-WI-07 Debug: observability read model (Epic §17)', () => {
  it('reports a null Elite read model when the simulation has no Elite', () => {
    const observability = observabilityOf(createState());
    expect(observability.elite).toBeNull();
    expect(observability.destroyedByContactEnemiesByType).toEqual({
      'basic-drone': 0,
      'ranged-drone': 0,
      'hunter-drone': 0,
      'elite-drone': 0,
    });
  });

  it('reports the current Elite phase and authoritative elapsed phase seconds', () => {
    const withElite = debug(createState(), {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    expect(observabilityOf(withElite).elite).toEqual({
      phase: 'entering',
      phaseElapsedSeconds: 0,
    });
    const vulnerable = debug(withElite, {
      type: 'combat-debug/set-elite-phase',
      phase: 'vulnerable',
    });
    expect(observabilityOf(vulnerable).elite).toEqual({
      phase: 'vulnerable',
      phaseElapsedSeconds: 0,
    });
    // 90 fixed steps inside the current phase = exactly 1.5 s.
    const elapsed = {
      ...vulnerable,
      enemies: vulnerable.enemies.map((enemy) =>
        enemy.kind === 'elite' ? { ...enemy, phaseStepsElapsed: 90 } : enemy,
      ),
    };
    expect(observabilityOf(elapsed).elite).toEqual({
      phase: 'vulnerable',
      phaseElapsedSeconds: 1.5,
    });
  });

  it('derives the exact projectile destruction cause per role from overlapping non-zero totals', () => {
    const base = createState();
    const state: CombatSimulationState = {
      ...base,
      destroyedCountByType: {
        'basic-drone': 7,
        'ranged-drone': 4,
        'hunter-drone': 3,
        'elite-drone': 1,
      },
      destroyedByContactCountByType: {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 2,
        'elite-drone': 0,
      },
    };
    const observability = observabilityOf(state);
    expect(observability.destroyedEnemiesByType).toEqual({
      'basic-drone': 7,
      'ranged-drone': 4,
      'hunter-drone': 3,
      'elite-drone': 1,
    });
    expect(observability.destroyedByContactEnemiesByType).toEqual({
      'basic-drone': 0,
      'ranged-drone': 0,
      'hunter-drone': 2,
      'elite-drone': 0,
    });
    // The exact remainder per role, not a total plus one subset.
    expect(observability.destroyedByProjectileEnemiesByType).toEqual({
      'basic-drone': 7,
      'ranged-drone': 4,
      'hunter-drone': 1,
      'elite-drone': 1,
    });
    // The two causes plus nothing else account for every destroyed enemy.
    for (const role of ROLE_KEYS) {
      expect(
        observability.destroyedByProjectileEnemiesByType[role] +
          observability.destroyedByContactEnemiesByType[role],
      ).toBe(observability.destroyedEnemiesByType[role]);
      expect(
        observability.destroyedByProjectileEnemiesByType[role],
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('enforces the non-negative destruction-cause invariant instead of mis-reporting a cause', () => {
    const base = createState();
    const contradictory: CombatSimulationState = {
      ...base,
      destroyedCountByType: {
        'basic-drone': 1,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      },
      destroyedByContactCountByType: {
        'basic-drone': 2,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      },
    };
    expect(() => observabilityOf(contradictory)).toThrow(
      /Combat observability invariant violated/,
    );
  });

  it('counts Elite in every per-role record and keeps rewards/penalties authoritative', () => {
    const withElite = debug(createState(), {
      type: 'combat-debug/spawn-enemy',
      enemyType: 'elite-drone',
    });
    const observability = observabilityOf(withElite);
    expect(observability.activeEnemiesByType['elite-drone']).toBe(1);
    expect(observability.destroyedEnemiesByType['elite-drone']).toBe(0);
    expect(observability.escapedEnemiesByType['elite-drone']).toBe(0);
    expect(observability.pendingCombatRewards).toBe(
      withElite.pendingCombatRewards,
    );
    expect(observability.pendingEscapePenalties).toBe(
      withElite.pendingEscapePenalties,
    );
    // The read model is a pure snapshot: it never mutates the simulation.
    expect(observability.activeEnemyBounds).toHaveLength(
      withElite.enemies.length,
    );
  });
});
