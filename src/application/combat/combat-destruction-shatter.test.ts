import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  ELITE_DRONE,
  HUNTER_DRONE,
  enemyRenderedBounds,
} from '@application/content';
import {
  AIRCRAFT_HEIGHT,
  AIRCRAFT_WIDTH,
  createTestCombatRuntime,
  createTestCombatState,
} from '@test-support/domain';
import {
  DESTRUCTION_SHATTER_ELITE_STEPS,
  DESTRUCTION_SHATTER_REGULAR_STEPS,
} from './collision';
import {
  activateElite,
  createEliteAtAnchor,
  enterElitePhase,
  hunterRotatedBounds,
  type CombatEnemy,
  type EliteEnemyState,
  type HunterEnemyState,
} from './enemies';
import {
  EXIT_CENTRE_STEPS,
  FIXED_STEP_SECONDS,
  TERMINAL_FADE_STEPS,
  applyDebugCommand,
  stepCombatSimulation,
  submitCombatCommand,
  terminalFadeOpacity,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import { spawnProjectile } from './projectiles';
import type { CombatProjectile } from './projectiles';

/**
 * V021-WI-05 E01 deterministic destruction-shatter owner evidence (patch §4.1,
 * V021-DEC-005, V021-AC-009): one hitbox-free shatter per TRUE destruction with
 * its role variant, complete visual dimension, creation-step centre and exact
 * `12` regular / `15` Elite lifetime; no effect for Escaped enemies, nonlethal
 * hits, blocked Armoured deflections or stale same-step projectiles; visual-only
 * ageing across committed terminal fades (including the Elite-on-Success
 * boundary) while an uncommitted write and Pause advance neither clock; and
 * proportional resize reprojection that can never re-create an expired effect.
 *
 * The exact burst geometry, timing and prepared/fallback pixels are owned by the
 * real-Phaser renderer regression (`combat-scene-destruction-shatter.test.ts`);
 * this file owns the authoritative record and its step-by-step lifetime.
 */

const SHORT_SIDE = 600;
const PROJECTILE_GEOMETRY = { width: 3, height: 9 } as const;
const BASIC_BOUNDS = enemyRenderedBounds(BASIC_DRONE, SHORT_SIDE);
const HUNTER_BOUNDS = enemyRenderedBounds(HUNTER_DRONE, SHORT_SIDE);

/** An Arrival Group far in the future: a state with one live enemy therefore
 *  never resolves Success while a case is running. */
const HOLD_GROUP: CombatSimulationState['arrivalGroups'][number] = {
  encounterId: 'wi-05-hold',
  timeSeconds: 100_000,
  stepIndex: 6_000_000,
  offsetSeconds: 0,
  members: [],
};

function basicEnemy(input: {
  readonly id?: number;
  readonly hullIntegrity?: number;
  readonly centerX: number;
  readonly centerY: number;
}): CombatEnemy {
  return {
    id: input.id ?? 1,
    kind: 'basic',
    type: 'basic-drone',
    hullIntegrity: input.hullIntegrity ?? BASIC_DRONE.maximumHullIntegrity,
    centerX: input.centerX,
    centerY: input.centerY,
    width: BASIC_BOUNDS.widthPx,
    height: BASIC_BOUNDS.heightPx,
    entry: 'top',
    hasEnteredVisibleArea: true,
    activated: true,
    ordinal: input.id ?? 1,
  };
}

/** A committing Hunter at the given heading (its rotated AABB is authoritative
 *  for collision, its configured `visualWidth`/`visualHeight` for the burst). */
function hunterEnemy(input: {
  readonly headingRadians: number;
  readonly centerX: number;
  readonly centerY: number;
}): HunterEnemyState {
  const envelope = hunterRotatedBounds({
    width: HUNTER_BOUNDS.widthPx,
    height: HUNTER_BOUNDS.heightPx,
    headingRadians: input.headingRadians,
  });
  return {
    id: 2,
    kind: 'hunter',
    type: 'hunter-drone',
    hullIntegrity: HUNTER_DRONE.maximumHullIntegrity,
    centerX: input.centerX,
    centerY: input.centerY,
    width: envelope.width,
    height: envelope.height,
    visualWidth: HUNTER_BOUNDS.widthPx,
    visualHeight: HUNTER_BOUNDS.heightPx,
    entry: 'upper-left',
    hasEnteredVisibleArea: true,
    activated: true,
    ordinal: 2,
    phase: 'committed',
    headingRadians: input.headingRadians,
    committedStepsExecuted: 0,
    steeringEnded: false,
    approachStepsElapsed: 120,
  };
}

/** The one authored Elite, activated (Armoured) at its fixed anchor. */
function armedElite(hullIntegrity: number): EliteEnemyState {
  const elite = activateElite(
    createEliteAtAnchor({
      id: 7,
      ordinal: 7,
      viewportWidth: 1280,
      viewportHeight: 600,
    }),
  );
  return { ...elite, hullIntegrity };
}

/** The vulnerable Elite of the same authored identity, through the one
 *  authoritative phase-transition owner (full duration, fresh attack timer and
 *  the vulnerable complete rendered bounds). */
function vulnerableElite(hullIntegrity: number): EliteEnemyState {
  return {
    ...enterElitePhase(armedElite(hullIntegrity), 'vulnerable', 1280, 600),
  };
}

/** One isolated Combat state: the given enemies/projectiles under a holding
 *  plan, with no inherited feedback or shatter records. */
function isolated(input: {
  readonly enemies: readonly CombatEnemy[];
  readonly projectiles?: readonly CombatProjectile[];
  readonly godMode?: boolean;
}): CombatSimulationState {
  const base = createTestCombatState({ mode: 'mouse' });
  const armed = input.godMode
    ? applyDebugCommand(base, { type: 'combat-debug/god-mode', enabled: true })
    : base;
  return {
    ...armed,
    enemies: [...input.enemies],
    projectiles: [...(input.projectiles ?? [])],
    enemyProjectiles: [],
    destructionShatters: [],
    eliteDeflectionFeedbacks: {},
    activeEnemyFlashStepsRemaining: {},
    arrivalGroups: [HOLD_GROUP],
    arrivalGroupIndex: 0,
  };
}

/** One injected player projectile overlapping the given target. */
function lethalProjectileAt(id: number, enemy: CombatEnemy): CombatProjectile {
  return spawnProjectile(id, 1, enemy.centerX, enemy.centerY, {
    width: PROJECTILE_GEOMETRY.width,
    height: PROJECTILE_GEOMETRY.height,
  });
}

describe('destruction shatter record (V021-WI-05 E01, V021-DEC-005)', () => {
  it('creates one record at the destruction centre with the complete visual dimension, age 0 and no reward change', () => {
    const target = basicEnemy({ hullIntegrity: 1, centerX: 200, centerY: 200 });
    const after = stepCombatSimulation(
      {
        ...isolated({ enemies: [target] }),
        projectiles: [lethalProjectileAt(0, target)],
      },
      FIXED_STEP_SECONDS,
    );
    expect(after.enemies).toHaveLength(0);
    const [record] = after.destructionShatters;
    expect(record).toBeDefined();
    expect(record?.enemyId).toBe(target.id);
    expect(record?.variant).toBe('regular');
    expect(record?.totalSteps).toBe(DESTRUCTION_SHATTER_REGULAR_STEPS);
    expect(record?.ageSteps).toBe(0);
    expect(record?.size).toBe(
      Math.max(BASIC_BOUNDS.widthPx, BASIC_BOUNDS.heightPx),
    );
    // The centre is the destroyed enemy's centre on the destruction step, i.e.
    // after that step's own movement (bounded by one movement step, < 2 px).
    expect(Math.abs((record?.centerX ?? 0) - target.centerX)).toBeLessThan(2);
    expect(Math.abs((record?.centerY ?? 0) - target.centerY)).toBeLessThan(2);
    // The shatter is presentation-only: the unchanged destruction accounting.
    expect(after.destroyedCountByType['basic-drone']).toBe(1);
    expect(after.pendingCombatRewards).toBe(
      BASIC_DRONE.playerDestructionReward,
    );
    expect(after.pendingEscapePenalties).toBe(0);
  });

  it('scales a Hunter kamikaze burst from its CONFIGURED visual bounds, not its rotated collision AABB, under God Mode', () => {
    const aircraft = createTestCombatState({ mode: 'mouse' }).aircraft;
    const hunter = hunterEnemy({
      headingRadians: Math.PI / 6,
      centerX: aircraft.centerX,
      centerY: aircraft.centerY,
    });
    // The rotated envelope really differs from the configured rectangle, so the
    // assertion below can only pass for the configured visual bounds.
    expect(Math.max(hunter.width, hunter.height)).not.toBeCloseTo(
      Math.max(HUNTER_BOUNDS.widthPx, HUNTER_BOUNDS.heightPx),
      1,
    );
    const after = stepCombatSimulation(
      isolated({ enemies: [hunter], godMode: true }),
      FIXED_STEP_SECONDS,
    );
    expect(after.enemies).toHaveLength(0);
    expect(after.playerHullIntegrity).toBe(after.playerMaximumHullIntegrity);
    expect(after.destroyedByContactCountByType['hunter-drone']).toBe(1);
    const [record] = after.destructionShatters;
    expect(record).toBeDefined();
    expect(record?.enemyId).toBe(hunter.id);
    expect(record?.variant).toBe('regular');
    expect(record?.totalSteps).toBe(DESTRUCTION_SHATTER_REGULAR_STEPS);
    expect(record?.ageSteps).toBe(0);
    // The dimension is the configured visual maximum, never the rotated AABB.
    expect(record?.size).toBe(
      Math.max(HUNTER_BOUNDS.widthPx, HUNTER_BOUNDS.heightPx),
    );
    // The centre is the destroyed enemy's centre on the contact step, i.e. after
    // that step's movement (bounded by one Hunter movement step, < 4 px here).
    expect(Math.abs((record?.centerX ?? 0) - hunter.centerX)).toBeLessThan(4);
    expect(Math.abs((record?.centerY ?? 0) - hunter.centerY)).toBeLessThan(4);
    // Kamikaze contact grants no reward and no escape penalty.
    expect(after.pendingCombatRewards).toBe(0);
    expect(after.pendingEscapePenalties).toBe(0);
  });

  it('creates the Elite variant with its exact 15-step lifetime from the Elite current rendered bounds', () => {
    const elite = vulnerableElite(1);
    const after = stepCombatSimulation(
      {
        ...isolated({ enemies: [elite] }),
        projectiles: [lethalProjectileAt(0, elite)],
      },
      FIXED_STEP_SECONDS,
    );
    expect(after.enemies).toHaveLength(0);
    expect(after.destructionShatters).toEqual([
      {
        enemyId: elite.id,
        centerX: elite.centerX,
        centerY: elite.centerY,
        size: Math.max(elite.width, elite.height),
        variant: 'elite',
        totalSteps: DESTRUCTION_SHATTER_ELITE_STEPS,
        ageSteps: 0,
      },
    ]);
    expect(after.pendingCombatRewards).toBe(
      ELITE_DRONE.playerDestructionReward,
    );
    const vulnerableBounds = enemyRenderedBounds(
      ELITE_DRONE.vulnerableVisualGeometry,
      SHORT_SIDE,
    );
    expect(Math.max(elite.width, elite.height)).toBeCloseTo(
      Math.max(vulnerableBounds.widthPx, vulnerableBounds.heightPx),
      9,
    );
  });

  it('creates no record for a nonlethal hit, a blocked Armoured deflection, or an Escaped enemy', () => {
    const surviving = basicEnemy({
      hullIntegrity: 3,
      centerX: 200,
      centerY: 200,
    });
    const damaged = stepCombatSimulation(
      {
        ...isolated({ enemies: [surviving] }),
        projectiles: [lethalProjectileAt(0, surviving)],
      },
      FIXED_STEP_SECONDS,
    );
    expect(damaged.enemies[0]?.hullIntegrity).toBe(2);
    expect(damaged.destructionShatters).toEqual([]);

    const armoured = armedElite(60);
    const blocked = stepCombatSimulation(
      {
        ...isolated({ enemies: [armoured] }),
        projectiles: [lethalProjectileAt(0, armoured)],
      },
      FIXED_STEP_SECONDS,
    );
    expect(blocked.enemies).toHaveLength(1);
    expect(blocked.destructionShatters).toEqual([]);
    expect(blocked.eliteDeflectionFeedbacks[armoured.id]).toBeDefined();

    const escaping = basicEnemy({
      centerX: 200,
      centerY: 600 + BASIC_BOUNDS.heightPx,
    });
    const escaped = stepCombatSimulation(
      isolated({ enemies: [escaping] }),
      FIXED_STEP_SECONDS,
    );
    expect(escaped.enemies).toHaveLength(0);
    expect(escaped.escapedCountByType['basic-drone']).toBe(1);
    expect(escaped.pendingEscapePenalties).toBe(BASIC_DRONE.escapePenalty);
    expect(escaped.destructionShatters).toEqual([]);
  });

  it('creates exactly one record per true destruction and keeps same-step duplicates and stale paths inert', () => {
    const first = basicEnemy({
      id: 1,
      hullIntegrity: 1,
      centerX: 200,
      centerY: 200,
    });
    const second = basicEnemy({
      id: 2,
      hullIntegrity: 1,
      centerX: 260,
      centerY: 260,
    });
    const destroyed = stepCombatSimulation(
      {
        ...isolated({ enemies: [first, second] }),
        projectiles: [
          // Two lethal projectiles on the first enemy (the second is stale) and
          // one on the second enemy: exactly two records.
          lethalProjectileAt(0, first),
          lethalProjectileAt(1, first),
          lethalProjectileAt(2, second),
        ],
      },
      FIXED_STEP_SECONDS,
    );
    expect(destroyed.destroyedCountByType['basic-drone']).toBe(2);
    expect(destroyed.pendingCombatRewards).toBe(
      2 * BASIC_DRONE.playerDestructionReward,
    );
    expect(destroyed.destructionShatters.map((s) => s.enemyId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(destroyed.destructionShatters.map((s) => s.ageSteps)).toEqual([
      0, 0,
    ]);
    // A later step with the destroyed enemies gone neither duplicates nor
    // re-creates a record; both existing records age by exactly one step.
    const later = stepCombatSimulation(destroyed, FIXED_STEP_SECONDS);
    expect(later.destructionShatters.map((s) => s.enemyId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(later.destructionShatters.map((s) => s.ageSteps)).toEqual([1, 1]);
    expect(later.destroyedCountByType['basic-drone']).toBe(2);
    expect(later.pendingCombatRewards).toBe(
      2 * BASIC_DRONE.playerDestructionReward,
    );
  });

  it('lasts exactly 12 executed steps for a regular role and then stays permanently removed', () => {
    const target = basicEnemy({ hullIntegrity: 1, centerX: 200, centerY: 200 });
    let state = stepCombatSimulation(
      {
        ...isolated({ enemies: [target] }),
        projectiles: [lethalProjectileAt(0, target)],
      },
      FIXED_STEP_SECONDS,
    );
    expect(state.destructionShatters.map((s) => s.ageSteps)).toEqual([0]);
    // Ages 1…11 are the remaining executed steps of the effect: it is present
    // for exactly 12 executed fixed steps, including its creation step.
    for (let age = 1; age < DESTRUCTION_SHATTER_REGULAR_STEPS; age += 1) {
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      expect(state.destructionShatters.map((s) => s.ageSteps)).toEqual([age]);
    }
    // The 12th executed step expires it, and no later frame re-creates it.
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    expect(state.destructionShatters).toEqual([]);
    for (let step = 0; step < 10; step += 1) {
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      expect(state.destructionShatters).toEqual([]);
    }
  });

  it('lasts exactly 15 executed steps for the Elite and then stays permanently removed', () => {
    const elite = vulnerableElite(1);
    let state = stepCombatSimulation(
      {
        ...isolated({ enemies: [elite] }),
        projectiles: [lethalProjectileAt(0, elite)],
      },
      FIXED_STEP_SECONDS,
    );
    expect(state.destructionShatters.map((s) => s.ageSteps)).toEqual([0]);
    for (let age = 1; age < DESTRUCTION_SHATTER_ELITE_STEPS; age += 1) {
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      expect(state.destructionShatters.map((s) => s.ageSteps)).toEqual([age]);
      expect(state.destructionShatters[0]?.totalSteps).toBe(
        DESTRUCTION_SHATTER_ELITE_STEPS,
      );
    }
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    expect(state.destructionShatters).toEqual([]);
    for (let step = 0; step < 10; step += 1) {
      state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
      expect(state.destructionShatters).toEqual([]);
    }
  });

  it('displays the Elite complete 15-step effect inside the 15-step committed Success fade and never before the commit', () => {
    const elite = vulnerableElite(1);
    // Every Arrival Group is already spawned, so destroying the last enemy
    // resolves Success on that same step while its shatter is created.
    const frozen = stepCombatSimulation(
      {
        ...isolated({ enemies: [elite] }),
        arrivalGroups: [],
        projectiles: [lethalProjectileAt(0, elite)],
      },
      FIXED_STEP_SECONDS,
    );
    expect(frozen.terminalResult).toEqual({ kind: 'success' });
    expect(frozen.exitPhase).toBe('centre');
    expect(frozen.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
    expect(frozen.destructionShatters.map((s) => s.ageSteps)).toEqual([0]);

    // An uncommitted terminal write advances neither the exit clock nor the
    // visual-only shatter age.
    let uncommitted = frozen;
    for (let step = 0; step < 5; step += 1) {
      uncommitted = stepCombatSimulation(uncommitted, FIXED_STEP_SECONDS);
      expect(uncommitted.exitCentreStepsRemaining).toBe(EXIT_CENTRE_STEPS);
      expect(uncommitted.destructionShatters.map((s) => s.ageSteps)).toEqual([
        0,
      ]);
      expect(terminalFadeOpacity(uncommitted)).toBe(1);
    }

    // The committed Success fade owns exactly 15 steps; the Elite shatter uses
    // every one of them and is removed exactly when the fade reaches zero.
    let committed: CombatSimulationState = {
      ...uncommitted,
      exitAuthorized: true,
    };
    for (let step = 1; step < DESTRUCTION_SHATTER_ELITE_STEPS; step += 1) {
      committed = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
      expect(committed.destructionShatters.map((s) => s.ageSteps)).toEqual([
        step,
      ]);
      expect(terminalFadeOpacity(committed)).toBeGreaterThan(0);
    }
    committed = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
    expect(committed.destructionShatters).toEqual([]);
    expect(terminalFadeOpacity(committed)).toBe(0);
    // The committed exit itself is unchanged: 15 of the 30 centring steps ran.
    expect(committed.exitCentreStepsRemaining).toBe(
      EXIT_CENTRE_STEPS - DESTRUCTION_SHATTER_ELITE_STEPS,
    );
    // Later fly-up frames never re-create the expired effect.
    let flying = committed;
    for (let step = 0; step < 20; step += 1) {
      flying = stepCombatSimulation(flying, FIXED_STEP_SECONDS);
      expect(flying.destructionShatters).toEqual([]);
    }
  });

  it('ages a live shatter once per committed Defeat fade step and expires it by its own 12-step lifetime', () => {
    const target = basicEnemy({ hullIntegrity: 1, centerX: 200, centerY: 200 });
    let state = stepCombatSimulation(
      {
        ...isolated({ enemies: [target] }),
        projectiles: [lethalProjectileAt(0, target)],
      },
      FIXED_STEP_SECONDS,
    );
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    expect(state.destructionShatters.map((s) => s.ageSteps)).toEqual([1]);
    const frozen = applyDebugCommand(state, {
      type: 'combat-debug/lose-mission',
    });
    expect(frozen.terminalResult).toEqual({ kind: 'defeat' });
    expect(frozen.defeatFadeStepsRemaining).toBe(TERMINAL_FADE_STEPS);

    // Uncommitted Defeat (the Save Error/Conflict case): neither clock moves.
    let uncommitted = frozen;
    for (let step = 0; step < 5; step += 1) {
      uncommitted = stepCombatSimulation(uncommitted, FIXED_STEP_SECONDS);
    }
    expect(uncommitted.defeatFadeStepsRemaining).toBe(TERMINAL_FADE_STEPS);
    expect(uncommitted.destructionShatters.map((s) => s.ageSteps)).toEqual([1]);
    expect(terminalFadeOpacity(uncommitted)).toBe(1);

    // Committed: one visual-only shatter age per fade step, and the effect
    // expires through its own lifetime while the fade is still running.
    let committed: CombatSimulationState = {
      ...uncommitted,
      exitAuthorized: true,
    };
    for (let step = 1; step <= 10; step += 1) {
      committed = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
      expect(committed.destructionShatters.map((s) => s.ageSteps)).toEqual([
        1 + step,
      ]);
      expect(committed.defeatFadeStepsRemaining).toBe(
        TERMINAL_FADE_STEPS - step,
      );
    }
    committed = stepCombatSimulation(committed, FIXED_STEP_SECONDS);
    expect(committed.destructionShatters).toEqual([]);
    expect(committed.defeatFadeStepsRemaining).toBe(TERMINAL_FADE_STEPS - 11);
    expect(terminalFadeOpacity(committed)).toBeGreaterThan(0);
    let fading = committed;
    while (fading.defeatFadeStepsRemaining > 0) {
      fading = stepCombatSimulation(fading, FIXED_STEP_SECONDS);
      expect(fading.destructionShatters).toEqual([]);
    }
    expect(fading.defeatFadeStepsRemaining).toBe(0);
    expect(terminalFadeOpacity(fading)).toBe(0);
  });

  it('advances neither clock while the runtime is paused and ages once per executed step after Resume', () => {
    const runtime = createTestCombatRuntime({ missionId: 'interception-01' });
    runtime.submitDebug({ type: 'combat-debug/god-mode', enabled: true });
    runtime.submitDebug({
      type: 'combat-debug/spawn-enemy',
      enemyType: 'basic-drone',
    });
    let live = runtime.getState();
    for (
      let step = 0;
      step < 3600 && live.destructionShatters.length === 0;
      step += 1
    ) {
      live = runtime.advance(FIXED_STEP_SECONDS);
    }
    expect(live.destructionShatters.length).toBeGreaterThan(0);
    const targetId = live.destructionShatters[0]!.enemyId;
    const ageAtPause = live.destructionShatters[0]!.ageSteps;

    runtime.setPaused(true);
    const paused = runtime.getState();
    for (let frame = 0; frame < 30; frame += 1) {
      // A paused runtime advances nothing at all, so no unexecuted frame can
      // consume a shatter step.
      expect(runtime.advance(1)).toBe(paused);
    }
    expect(
      runtime.getState().destructionShatters.find((s) => s.enemyId === targetId)
        ?.ageSteps,
    ).toBe(ageAtPause);

    runtime.setPaused(false);
    const resumed = runtime.advance(FIXED_STEP_SECONDS);
    const record = resumed.destructionShatters.find(
      (s) => s.enemyId === targetId,
    );
    // The resumed executed step advances the record by exactly one step, unless
    // its own exact lifetime had already completed.
    expect(record === undefined || record.ageSteps === ageAtPause + 1).toBe(
      true,
    );
    runtime.dispose();
  });

  it('reprojects a live shatter proportionally on an accepted resize and never re-creates an expired one', () => {
    const target = basicEnemy({ hullIntegrity: 1, centerX: 200, centerY: 200 });
    let state = stepCombatSimulation(
      {
        ...isolated({ enemies: [target] }),
        projectiles: [lethalProjectileAt(0, target)],
      },
      FIXED_STEP_SECONDS,
    );
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    const before = state.destructionShatters[0]!;
    expect(before.ageSteps).toBe(1);
    const resized = submitCombatCommand(state, {
      type: 'combat/viewport-resize',
      width: 1600,
      height: 900,
      aircraftWidth: 900 * 0.08 * (1278 / 1231),
      aircraftHeight: 900 * 0.08,
    });
    const after = resized.destructionShatters[0]!;
    expect(after.enemyId).toBe(before.enemyId);
    expect(after.variant).toBe(before.variant);
    expect(after.totalSteps).toBe(before.totalSteps);
    expect(after.ageSteps).toBe(before.ageSteps);
    expect(after.centerX).toBeCloseTo(before.centerX * (1600 / 1280), 9);
    expect(after.centerY).toBeCloseTo(before.centerY * (900 / 600), 9);
    // The burst scales with the destroyed enemy's complete visual dimension,
    // which is derived from the new short side (`600 → 900`).
    expect(after.size).toBeCloseTo(before.size * 1.5, 9);

    // An effect that already expired is never re-created by a later resize.
    let expired = resized;
    while (expired.destructionShatters.length > 0) {
      expired = stepCombatSimulation(expired, FIXED_STEP_SECONDS);
    }
    const resizedAgain = submitCombatCommand(expired, {
      type: 'combat/viewport-resize',
      width: 1280,
      height: 600,
      aircraftWidth: AIRCRAFT_WIDTH,
      aircraftHeight: AIRCRAFT_HEIGHT,
    });
    expect(resizedAgain.destructionShatters).toEqual([]);
  });
});
