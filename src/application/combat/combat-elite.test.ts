import { describe, expect, it } from 'vitest';
import type { EnemyType } from '@domain/index';
import { ELITE_DRONE, enemyRenderedBounds } from '@application/content';
import { createTestCombatState } from '@test-support/domain';
import {
  activateElite,
  createEliteAtAnchor,
  eliteAcceptsProjectileDamage,
  spawnEnemyFromPlacement,
  stepEnemy,
  ELITE_ANCHOR_VIEWPORT_FRACTION_X,
  ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
  ELITE_ARMOURED_PHASE_STEPS,
  ELITE_PHASE_CYCLE_STEPS,
  ELITE_VULNERABLE_PHASE_STEPS,
} from './enemies';
import type { CombatEnemy, EliteEnemyState, EnemyStepInput } from './enemies';
import {
  AIRCRAFT_DAMAGE_FLASH_STEPS,
  ENEMY_HIT_FLASH_STEPS,
  resolveAircraftContacts,
  resolveProjectileCollisions,
} from './collision';
import type { EliteDeflectionFeedback } from './collision';
import { enemyCollisionAabb } from './collision-geometry';
import { spawnProjectile } from './projectiles';
import {
  stepCombatSimulation,
  submitCombatCommand,
  FIXED_STEP_SECONDS,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';

/**
 * V02-WI-06 E01 Elite foundation evidence (Epic §9.4, §11, §16.1/§16.4,
 * V02-AC-009): one explicit typed Elite state created at the fixed
 * `50% VW, 20% VH` anchor, an idempotent activation transition, the
 * authoritative `Armoured 12 s → Vulnerable 6 s` phase cycle without drift,
 * blocked versus Vulnerable player-projectile resolution, terminal destruction,
 * the single content geometry owner, and the unchanged regular-enemy path.
 *
 * The Elite is intentionally unreachable from the player-facing product in E01:
 * these tests exercise the explicit owner directly and through the real fixed
 * step pipeline with an injected Elite state.
 */

const VIEWPORT = { width: 1280, height: 600 };
const SHORT_SIDE = Math.min(VIEWPORT.width, VIEWPORT.height);
const ELITE_ID = 7;
const PROJECTILE_WIDTH = 3;
const PROJECTILE_HEIGHT = 9;
const ARMOURED_BOUNDS = enemyRenderedBounds(
  ELITE_DRONE.armouredVisualGeometry,
  SHORT_SIDE,
);
const VULNERABLE_BOUNDS = enemyRenderedBounds(
  ELITE_DRONE.vulnerableVisualGeometry,
  SHORT_SIDE,
);

function createElite(): EliteEnemyState {
  return createEliteAtAnchor({
    id: ELITE_ID,
    ordinal: 0,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
  });
}

function activate(elite: EliteEnemyState = createElite()): EliteEnemyState {
  return activateElite(elite);
}

function stepInput(overrides: Partial<EnemyStepInput> = {}): EnemyStepInput {
  return {
    movementSpeedPx: 0.12 * VIEWPORT.height,
    committedSpeedPx: 0.26 * VIEWPORT.height,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    stepSeconds: FIXED_STEP_SECONDS,
    aircraftCenterX: VIEWPORT.width / 2,
    aircraftCenterY: VIEWPORT.height * 0.8,
    ...overrides,
  };
}

/** Steps one Elite through the shared enemy step, failing loudly if it ever
 *  escapes or changes kind (neither is possible for the Elite, Epic §9.4). */
function stepEliteExact(
  elite: EliteEnemyState,
  steps: number,
  input: EnemyStepInput = stepInput(),
): EliteEnemyState {
  let current = elite;
  for (let index = 0; index < steps; index += 1) {
    const result = stepEnemy(current, input);
    if (result.enemy === null || result.enemy.kind !== 'elite') {
      throw new Error('the Elite must never escape or change kind');
    }
    current = result.enemy;
  }
  return current;
}

function eliteFrom(enemies: readonly CombatEnemy[]): EliteEnemyState {
  for (const enemy of enemies) {
    if (enemy.kind === 'elite') {
      return enemy;
    }
  }
  throw new Error('expected an active Elite');
}

function projectileAt(
  id: number,
  damage: number,
  centerX: number,
  centerY: number,
) {
  return spawnProjectile(id, damage, centerX, centerY, {
    width: PROJECTILE_WIDTH,
    height: PROJECTILE_HEIGHT,
  });
}

function resolveHits(
  enemies: readonly CombatEnemy[],
  projectiles: readonly ReturnType<typeof spawnProjectile>[],
  existingEliteDeflections: Readonly<
    Record<number, EliteDeflectionFeedback>
  > = {},
) {
  return resolveProjectileCollisions({
    projectiles,
    enemies,
    projectileWidth: PROJECTILE_WIDTH,
    projectileHeight: PROJECTILE_HEIGHT,
    existingFlashes: {},
    existingEliteDeflections,
  });
}

/** The exact authoritative local deflection record a blocked hit must produce. */
function deflectionFor(
  elite: EliteEnemyState,
  projectile: ReturnType<typeof spawnProjectile>,
  stepsRemaining = ENEMY_HIT_FLASH_STEPS,
): EliteDeflectionFeedback {
  return {
    enemyId: elite.id,
    impactCenterX: projectile.centerX,
    impactCenterY: projectile.centerY,
    stepsRemaining,
  };
}

describe('Elite creation and content ownership (Epic §9.4, §16.4)', () => {
  it('creates the one authored Elite at the fixed 50% VW, 20% VH anchor with Hull 60', () => {
    const elite = createElite();
    expect(elite.kind).toBe('elite');
    expect(elite.type).toBe('elite-drone');
    expect(elite.id).toBe(ELITE_ID);
    expect(elite.hullIntegrity).toBe(60);
    expect(elite.centerX).toBe(
      VIEWPORT.width * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
    );
    expect(elite.centerY).toBe(
      VIEWPORT.height * ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
    );
    expect(elite.centerX).toBe(640);
    expect(elite.centerY).toBe(120);
  });

  it('starts entering with no phase or attack time elapsed and no active timer', () => {
    const elite = createElite();
    expect(elite.activated).toBe(false);
    expect(elite.phase).toBe('entering');
    expect(elite.phaseStepsElapsed).toBe(0);
    expect(elite.phaseStepsRemaining).toBe(0);
    expect(eliteAcceptsProjectileDamage(elite)).toBe(false);
  });

  it('uses the armoured complete rendered bounds as its authoritative AABB', () => {
    const elite = createElite();
    expect(elite.width).toBeCloseTo(ARMOURED_BOUNDS.widthPx, 9);
    expect(elite.height).toBeCloseTo(ARMOURED_BOUNDS.heightPx, 9);
    const aabb = enemyCollisionAabb(elite);
    expect(aabb.width).toBe(elite.width);
    expect(aabb.height).toBe(elite.height);
  });

  it('keeps the approved Elite content facts in the single content geometry owner', () => {
    expect(ELITE_DRONE.type).toBe('elite-drone');
    expect(ELITE_DRONE.maximumHullIntegrity).toBe(60);
    // Both states share the approved 2.45× Basic footprint area ratio.
    expect(ELITE_DRONE.armouredVisualGeometry.visualFootprintAreaRatio).toBe(
      2.45,
    );
    expect(ELITE_DRONE.vulnerableVisualGeometry.visualFootprintAreaRatio).toBe(
      2.45,
    );
    // Prepared sprite aspects (§16.4): 214 × 320 and 281 × 320.
    expect(ELITE_DRONE.armouredVisualGeometry.visualAspectRatio).toBeCloseTo(
      214 / 320,
      9,
    );
    expect(ELITE_DRONE.vulnerableVisualGeometry.visualAspectRatio).toBeCloseTo(
      281 / 320,
      9,
    );
    // Same rendered area, different silhouette: the Vulnerable state is wider
    // and shorter than the Armoured state.
    expect(ARMOURED_BOUNDS.widthPx * ARMOURED_BOUNDS.heightPx).toBeCloseTo(
      VULNERABLE_BOUNDS.widthPx * VULNERABLE_BOUNDS.heightPx,
      6,
    );
    expect(VULNERABLE_BOUNDS.widthPx).toBeGreaterThan(ARMOURED_BOUNDS.widthPx);
    expect(VULNERABLE_BOUNDS.heightPx).toBeLessThan(ARMOURED_BOUNDS.heightPx);
  });
});

describe('Elite pre-activation state (Epic §9.4)', () => {
  it('consumes no phase time, does not move, and is never the regular full-bounds activation', () => {
    const elite = createElite();
    // The complete bounds are already inside the viewport, which would activate
    // every regular role on this step.
    const input = stepInput();
    const result = stepEnemy(elite, input);
    expect(result.newlyActivated).toBe(false);
    expect(result.enemy?.activated).toBe(false);
    const after = stepEliteExact(elite, ELITE_PHASE_CYCLE_STEPS * 3);
    expect(after.phase).toBe('entering');
    expect(after.phaseStepsElapsed).toBe(0);
    expect(after.phaseStepsRemaining).toBe(0);
    expect(after.centerX).toBe(elite.centerX);
    expect(after.centerY).toBe(elite.centerY);
    expect(after.width).toBe(elite.width);
    expect(after.height).toBe(elite.height);
  });

  it('never escapes and never changes phase while entering', () => {
    const elite = stepEliteExact(createElite(), ELITE_PHASE_CYCLE_STEPS * 5);
    expect(elite.phase).toBe('entering');
    expect(elite.activated).toBe(false);
  });
});

describe('Elite activation transition (V02-AC-009)', () => {
  it('enters Armoured and initializes the phase timer exactly once', () => {
    expect(ELITE_ARMOURED_PHASE_STEPS).toBe(720);
    expect(ELITE_VULNERABLE_PHASE_STEPS).toBe(360);
    expect(ELITE_PHASE_CYCLE_STEPS).toBe(1080);
    const elite = activate();
    expect(elite.activated).toBe(true);
    expect(elite.phase).toBe('armoured');
    expect(elite.phaseStepsElapsed).toBe(0);
    expect(elite.phaseStepsRemaining).toBe(ELITE_ARMOURED_PHASE_STEPS);
    expect(eliteAcceptsProjectileDamage(elite)).toBe(false);
  });

  it('is idempotent and can never restart the running phase cycle', () => {
    const activated = activate();
    expect(activateElite(activated)).toBe(activated);
    const advanced = stepEliteExact(activated, 100);
    expect(advanced.phaseStepsElapsed).toBe(100);
    expect(advanced.phaseStepsRemaining).toBe(620);
    // A repeated activation attempt on an already active Elite is a strict
    // no-op: the same state instance is returned and the timer is untouched.
    const repeated = activateElite(advanced);
    expect(repeated).toBe(advanced);
    expect(repeated.phase).toBe('armoured');
    expect(repeated.phaseStepsElapsed).toBe(100);
    expect(repeated.phaseStepsRemaining).toBe(620);
  });

  it('cannot restart a Vulnerable phase either', () => {
    const vulnerable = stepEliteExact(activate(), ELITE_ARMOURED_PHASE_STEPS);
    expect(vulnerable.phase).toBe('vulnerable');
    expect(activateElite(vulnerable)).toBe(vulnerable);
    expect(activateElite(vulnerable).phaseStepsRemaining).toBe(
      ELITE_VULNERABLE_PHASE_STEPS,
    );
  });
});

describe('Elite phase cycle boundaries (Epic §9.4, V02-AC-009)', () => {
  it('keeps Armoured for exactly 720 steps and Vulnerable for exactly 360', () => {
    const activated = activate();
    const afterOne = stepEliteExact(activated, 1);
    expect(afterOne.phase).toBe('armoured');
    expect(afterOne.phaseStepsElapsed).toBe(1);
    expect(afterOne.phaseStepsRemaining).toBe(719);

    const lastArmoured = stepEliteExact(
      activated,
      ELITE_ARMOURED_PHASE_STEPS - 1,
    );
    expect(lastArmoured.phase).toBe('armoured');
    expect(lastArmoured.phaseStepsElapsed).toBe(719);
    expect(lastArmoured.phaseStepsRemaining).toBe(1);

    const firstVulnerable = stepEliteExact(
      activated,
      ELITE_ARMOURED_PHASE_STEPS,
    );
    expect(firstVulnerable.phase).toBe('vulnerable');
    expect(firstVulnerable.phaseStepsElapsed).toBe(0);
    expect(firstVulnerable.phaseStepsRemaining).toBe(
      ELITE_VULNERABLE_PHASE_STEPS,
    );
    expect(eliteAcceptsProjectileDamage(firstVulnerable)).toBe(true);
    expect(firstVulnerable.width).toBeCloseTo(VULNERABLE_BOUNDS.widthPx, 9);
    expect(firstVulnerable.height).toBeCloseTo(VULNERABLE_BOUNDS.heightPx, 9);

    const lastVulnerable = stepEliteExact(
      activated,
      ELITE_ARMOURED_PHASE_STEPS + ELITE_VULNERABLE_PHASE_STEPS - 1,
    );
    expect(lastVulnerable.phase).toBe('vulnerable');
    expect(lastVulnerable.phaseStepsElapsed).toBe(359);
    expect(lastVulnerable.phaseStepsRemaining).toBe(1);

    const secondArmoured = stepEliteExact(activated, ELITE_PHASE_CYCLE_STEPS);
    expect(secondArmoured.phase).toBe('armoured');
    expect(secondArmoured.phaseStepsElapsed).toBe(0);
    expect(secondArmoured.phaseStepsRemaining).toBe(ELITE_ARMOURED_PHASE_STEPS);
    expect(secondArmoured.width).toBeCloseTo(ARMOURED_BOUNDS.widthPx, 9);
    expect(secondArmoured.height).toBeCloseTo(ARMOURED_BOUNDS.heightPx, 9);
  });

  it('transitions exactly once per boundary and never drifts over repeated cycles', () => {
    const activated = activate();
    const runs: { readonly phase: string; readonly steps: number }[] = [];
    let current: EliteEnemyState = activated;
    let previousPhase: string = current.phase;
    let runLength = 0;
    for (let index = 0; index < ELITE_PHASE_CYCLE_STEPS * 5; index += 1) {
      current = stepEliteExact(current, 1);
      if (current.phase === previousPhase) {
        runLength += 1;
        continue;
      }
      runs.push({ phase: previousPhase, steps: runLength + 1 });
      previousPhase = current.phase;
      runLength = 0;
    }
    runs.push({ phase: previousPhase, steps: runLength + 1 });

    // Five complete cycles contain exactly ten boundary transitions, each phase
    // run lasting its exact canonical duration.
    expect(runs).toHaveLength(11);
    const completedRuns = runs.slice(0, 10);
    completedRuns.forEach((run, index) => {
      const expectedPhase = index % 2 === 0 ? 'armoured' : 'vulnerable';
      const expectedSteps =
        index % 2 === 0
          ? ELITE_ARMOURED_PHASE_STEPS
          : ELITE_VULNERABLE_PHASE_STEPS;
      expect(run.phase).toBe(expectedPhase);
      expect(run.steps).toBe(expectedSteps);
    });
    expect(runs[10]).toEqual({ phase: 'armoured', steps: 1 });

    // After exactly five cycles the state is identical to a freshly activated
    // Elite: no drift, and the Elite never moves from its anchor.
    expect(current.phase).toBe(activated.phase);
    expect(current.phaseStepsElapsed).toBe(activated.phaseStepsElapsed);
    expect(current.phaseStepsRemaining).toBe(activated.phaseStepsRemaining);
    expect(current.width).toBeCloseTo(activated.width, 9);
    expect(current.height).toBeCloseTo(activated.height, 9);
    expect(current.centerX).toBe(activated.centerX);
    expect(current.centerY).toBe(activated.centerY);
  });
});

describe('Elite player-projectile resolution (Epic §9.4/§10/§11)', () => {
  it('blocks an Armoured hit: zero damage, Hull preserved, projectile consumed, local deflection record only', () => {
    const elite = activate();
    const projectile = projectileAt(0, 1, elite.centerX - 4, elite.centerY - 3);
    const result = resolveHits([elite], [projectile]);
    expect(result.projectiles).toHaveLength(0);
    expect(result.destroyedEnemies).toHaveLength(0);
    expect(result.destroyedEnemyFlashes).toHaveLength(0);
    expect(result.enemies).toHaveLength(1);
    const after = eliteFrom(result.enemies);
    expect(after.hullIntegrity).toBe(60);
    expect(after.phase).toBe('armoured');
    // The blocked hit reuses the accepted short feedback duration; no second
    // duration is invented for the deflection.
    expect(ENEMY_HIT_FLASH_STEPS).toBe(3);
    // The hit is communicated ONLY by the dedicated local record, which carries
    // the Elite id and the blocking projectile's authoritative centre as the
    // local impact location.
    expect(result.eliteDeflections[ELITE_ID]).toEqual(
      deflectionFor(elite, projectile),
    );
  });

  it('never writes the generic full-craft enemy flash for a blocked hit', () => {
    const elite = activate();
    const result = resolveHits(
      [elite],
      [projectileAt(0, 1, elite.centerX, elite.centerY)],
    );
    // Counter-case for the reviewed contract: `CombatScene` renders
    // `activeEnemyFlashStepsRemaining` as a complete-craft tint/recolour, which
    // Epic §9.4 prohibits for a blocked Elite hit.
    expect(result.flashes[ELITE_ID]).toBeUndefined();
    expect(Object.keys(result.flashes)).toHaveLength(0);
    expect(result.eliteDeflections[ELITE_ID]?.stepsRemaining).toBe(
      ENEMY_HIT_FLASH_STEPS,
    );
  });

  it('does not damage, consume, or acknowledge a projectile against an entering Elite', () => {
    const elite = createElite();
    const projectile = projectileAt(0, 3, elite.centerX, elite.centerY);
    const result = resolveHits([elite], [projectile]);
    const after = eliteFrom(result.enemies);
    expect(after.hullIntegrity).toBe(60);
    expect(after.phase).toBe('entering');
    expect(after.activated).toBe(false);
    // E01 does not own the entry interaction: the projectile flies on untouched
    // and neither feedback owner records anything.
    expect(result.projectiles.map((entry) => entry.id)).toEqual([0]);
    expect(result.flashes[ELITE_ID]).toBeUndefined();
    expect(result.eliteDeflections[ELITE_ID]).toBeUndefined();
  });

  it('skips an entering Elite so the projectile resolves against the next eligible enemy', () => {
    const entering = createElite();
    const bounds = createTestCombatState().enemyBoundsByType['basic-drone'];
    const basic: CombatEnemy = {
      id: 9,
      kind: 'basic',
      type: 'basic-drone',
      hullIntegrity: 3,
      centerX: entering.centerX,
      centerY: entering.centerY,
      width: bounds.width,
      height: bounds.height,
      entry: 'top',
      hasEnteredVisibleArea: true,
      activated: true,
      ordinal: 0,
    };
    const result = resolveHits(
      [entering, basic],
      [projectileAt(0, 1, entering.centerX, entering.centerY)],
    );
    // Stable ascending-id order: the entering Elite was skipped, so the BASIC
    // (higher id) is the first eligible overlapping target and takes the hit.
    expect(result.projectiles).toHaveLength(0);
    expect(result.eliteDeflections[ELITE_ID]).toBeUndefined();
    expect(result.flashes[9]).toBe(ENEMY_HIT_FLASH_STEPS);
    const survivor = result.enemies.find((enemy) => enemy.id === 9);
    expect(survivor?.hullIntegrity).toBe(2);
    expect(eliteFrom(result.enemies).hullIntegrity).toBe(60);
    expect(eliteFrom(result.enemies).phase).toBe('entering');
  });

  it('replaces the Elite deflection record on a later blocked hit at the new impact centre', () => {
    const elite = activate();
    const stale = projectileAt(0, 1, elite.centerX - 20, elite.centerY - 20);
    const fresh = projectileAt(1, 1, elite.centerX + 6, elite.centerY + 2);
    const result = resolveHits([elite], [fresh], {
      [ELITE_ID]: deflectionFor(elite, stale, 1),
    });
    // Exactly one record per Elite: the blocked hit replaces the stale record
    // at the new impact centre and restarts its full lifetime.
    expect(Object.keys(result.eliteDeflections)).toEqual([String(ELITE_ID)]);
    expect(result.eliteDeflections[ELITE_ID]).toEqual(
      deflectionFor(elite, fresh),
    );
    expect(result.flashes[ELITE_ID]).toBeUndefined();
  });

  it('keeps the last blocked hit of the step in the single record', () => {
    const elite = activate();
    const first = projectileAt(0, 1, elite.centerX - 5, elite.centerY);
    const second = projectileAt(1, 1, elite.centerX + 5, elite.centerY);
    const result = resolveHits([elite], [first, second]);
    expect(result.projectiles).toHaveLength(0);
    expect(eliteFrom(result.enemies).hullIntegrity).toBe(60);
    expect(result.eliteDeflections[ELITE_ID]).toEqual(
      deflectionFor(elite, second),
    );
  });

  it('consumes exactly one projectile per hit and leaves non-overlapping projectiles flying', () => {
    const elite = activate();
    const projectile = projectileAt(0, 1, elite.centerX, elite.centerY);
    const result = resolveHits(
      [elite],
      [projectile, projectileAt(1, 1, 10, 500)],
    );
    expect(result.projectiles.map((entry) => entry.id)).toEqual([1]);
    expect(eliteFrom(result.enemies).hullIntegrity).toBe(60);
    expect(result.eliteDeflections[ELITE_ID]).toEqual(
      deflectionFor(elite, projectile),
    );
    expect(result.flashes[ELITE_ID]).toBeUndefined();
  });

  it('consumes every projectile that validly overlaps an Armoured Elite without damage', () => {
    const elite = activate();
    const blocked = [
      projectileAt(0, 1, elite.centerX, elite.centerY),
      projectileAt(1, 1, elite.centerX, elite.centerY),
      projectileAt(2, 1, elite.centerX, elite.centerY),
    ];
    const result = resolveHits([elite], blocked);
    expect(result.projectiles).toHaveLength(0);
    expect(eliteFrom(result.enemies).hullIntegrity).toBe(60);
    expect(result.flashes[ELITE_ID]).toBeUndefined();
    // One record per Elite: the last blocked hit of the step is the live one.
    expect(result.eliteDeflections[ELITE_ID]).toEqual(
      deflectionFor(elite, blocked[2]!),
    );
  });

  it('applies the existing projectile damage once per Vulnerable hit and keeps the regular hit feedback', () => {
    const vulnerable = stepEliteExact(activate(), ELITE_ARMOURED_PHASE_STEPS);
    const machineGunProjectile = projectileAt(
      0,
      1,
      vulnerable.centerX,
      vulnerable.centerY,
    );
    const machineGunHit = resolveHits([vulnerable], [machineGunProjectile]);
    expect(machineGunHit.projectiles).toHaveLength(0);
    expect(eliteFrom(machineGunHit.enemies).hullIntegrity).toBe(59);
    // A Vulnerable hit keeps the accepted normal-damage full-hit-feedback path.
    expect(machineGunHit.flashes[ELITE_ID]).toBe(ENEMY_HIT_FLASH_STEPS);
    // Only a blocked Armoured hit owns a local deflection record.
    expect(machineGunHit.eliteDeflections).toEqual({});

    const cannonHit = resolveHits(
      [vulnerable],
      [projectileAt(0, 3, vulnerable.centerX, vulnerable.centerY)],
    );
    expect(eliteFrom(cannonHit.enemies).hullIntegrity).toBe(57);
  });

  it('destroys the Elite at exactly zero Hull and stays terminal for the rest of the step', () => {
    const vulnerable = stepEliteExact(activate(), ELITE_ARMOURED_PHASE_STEPS);
    const lethal = [
      ...Array.from({ length: 60 }, (_, index) =>
        projectileAt(index, 1, vulnerable.centerX, vulnerable.centerY),
      ),
      projectileAt(60, 1, vulnerable.centerX, vulnerable.centerY),
    ];
    const result = resolveHits([vulnerable], lethal);
    expect(result.enemies).toHaveLength(0);
    expect(result.destroyedEnemies).toEqual([
      { id: ELITE_ID, type: 'elite-drone' },
    ]);
    expect(result.destroyedEnemyFlashes).toHaveLength(1);
    // Destruction is terminal and idempotent: the later same-step projectile
    // flies free instead of damaging or rewarding the destroyed Elite again.
    expect(result.projectiles.map((projectile) => projectile.id)).toEqual([60]);
    // A destroyed Elite owns no deflection record.
    expect(result.eliteDeflections).toEqual({});
  });

  it('removes a live deflection record when the Elite is destroyed', () => {
    const vulnerable = stepEliteExact(activate(), ELITE_ARMOURED_PHASE_STEPS);
    const blockedThenKilled = projectileAt(
      99,
      1,
      vulnerable.centerX,
      vulnerable.centerY,
    );
    const lethal = Array.from({ length: 60 }, (_, index) =>
      projectileAt(index, 1, vulnerable.centerX, vulnerable.centerY),
    );
    const result = resolveHits([vulnerable], lethal, {
      [ELITE_ID]: deflectionFor(vulnerable, blockedThenKilled, 2),
    });
    expect(result.destroyedEnemies).toHaveLength(1);
    expect(result.eliteDeflections).toEqual({});
  });

  it('reports Elite destruction exactly once for many same-step lethal projectiles', () => {
    const vulnerable = stepEliteExact(activate(), ELITE_ARMOURED_PHASE_STEPS);
    const lethal = Array.from({ length: 90 }, (_, index) =>
      projectileAt(index, 1, vulnerable.centerX, vulnerable.centerY),
    );
    const result = resolveHits([vulnerable], lethal);
    expect(result.destroyedEnemies).toHaveLength(1);
    expect(result.destroyedEnemyFlashes).toHaveLength(1);
    expect(result.enemies).toHaveLength(0);
    expect(result.destroyedEnemies[0]?.type).toBe('elite-drone');
    // The 30 projectiles after destruction neither hit nor reward the Elite.
    expect(result.projectiles).toHaveLength(30);
  });

  it('keeps an Armoured Elite immune even with a partially depleted Hull', () => {
    const vulnerable = stepEliteExact(activate(), ELITE_ARMOURED_PHASE_STEPS);
    const damaged: EliteEnemyState = { ...vulnerable, hullIntegrity: 5 };
    const cannonHit = resolveHits(
      [damaged],
      [projectileAt(0, 3, damaged.centerX, damaged.centerY)],
    );
    expect(eliteFrom(cannonHit.enemies).hullIntegrity).toBe(2);

    const armouredAgain: EliteEnemyState = {
      ...activate(),
      hullIntegrity: 5,
      width: damaged.width,
      height: damaged.height,
    };
    const blocked = resolveHits(
      [armouredAgain],
      [projectileAt(0, 1, armouredAgain.centerX, armouredAgain.centerY)],
    );
    expect(eliteFrom(blocked.enemies).hullIntegrity).toBe(5);
    // The blocked hit is still a blocked hit: local deflection only, never the
    // generic full-craft flash, and never any Hull change.
    expect(blocked.flashes[ELITE_ID]).toBeUndefined();
    expect(blocked.eliteDeflections[ELITE_ID]?.stepsRemaining).toBe(
      ENEMY_HIT_FLASH_STEPS,
    );
  });
});

describe('Elite Aircraft contact exclusion (Epic §11.1–11.2, V02-WI-06 E01 C01)', () => {
  const contactInput = (enemies: readonly CombatEnemy[]) => ({
    enemies,
    aircraftCenterX: eliteFrom(enemies).centerX,
    aircraftCenterY: eliteFrom(enemies).centerY,
    aircraftWidth: 48,
    aircraftHeight: 48,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: 100,
    pairContactCooldownSteps: {},
    contactDamageByType: {
      'basic-drone': 15,
      'ranged-drone': 15,
      'hunter-drone': 35,
      'elite-drone': 0,
    },
    aircraftDangerFlashStepsRemaining: 0,
    godModeEnabled: false,
    playerDefeated: false,
  });

  it('produces no damage, flash, cooldown, destruction, or accounting side effect', () => {
    const elite = activate();
    const result = resolveAircraftContacts(contactInput([elite]));
    // No approved Elite contact outcome exists, so every contact owner must stay
    // exactly as it was: the Elite is not a regular enemy and not a Hunter.
    expect(result.playerHullIntegrity).toBe(100);
    expect(result.playerDefeated).toBe(false);
    expect(result.aircraftDangerFlashStepsRemaining).toBe(0);
    expect(result.pairContactCooldownSteps).toEqual({});
    expect(result.destroyedByContact).toHaveLength(0);
    expect(result.destroyedEnemyFlashes).toHaveLength(0);
    expect(result.enemies).toHaveLength(1);
    expect(eliteFrom(result.enemies).hullIntegrity).toBe(60);
  });

  it('does not suppress the regular contact outcome of another overlapping enemy', () => {
    const elite = activate();
    const bounds = createTestCombatState().enemyBoundsByType['basic-drone'];
    const basic: CombatEnemy = {
      id: 4,
      kind: 'basic',
      type: 'basic-drone',
      hullIntegrity: 3,
      centerX: elite.centerX,
      centerY: elite.centerY,
      width: bounds.width,
      height: bounds.height,
      entry: 'top',
      hasEnteredVisibleArea: true,
      activated: true,
      ordinal: 0,
    };
    const result = resolveAircraftContacts(contactInput([basic, elite]));
    // The overlapping Elite is skipped entirely while the Basic keeps the
    // unchanged regular contact behaviour.
    expect(result.playerHullIntegrity).toBe(85);
    expect(result.aircraftDangerFlashStepsRemaining).toBe(
      AIRCRAFT_DAMAGE_FLASH_STEPS,
    );
    expect(result.pairContactCooldownSteps[4]).toBeGreaterThan(0);
    expect(result.pairContactCooldownSteps[ELITE_ID]).toBeUndefined();
    expect(result.destroyedByContact).toHaveLength(0);
    expect(result.enemies).toHaveLength(2);
    expect(eliteFrom(result.enemies).hullIntegrity).toBe(60);
  });

  it('stays side-effect free through the real fixed-step pipeline', () => {
    const activated = activate();
    const base = createTestCombatState();
    // Place the Elite exactly on the Aircraft hold pose so the pair overlaps.
    const overlapping: EliteEnemyState = {
      ...activated,
      centerX: base.aircraft.centerX,
      centerY: base.aircraft.centerY,
    };
    const state: CombatSimulationState = {
      ...base,
      enemies: [overlapping],
      arrivalGroups: [],
      arrivalGroupIndex: 0,
      finalArrivalTimeSeconds: 0,
      countdownSeconds: 0,
    };
    const stepped = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    expect(stepped.playerHullIntegrity).toBe(100);
    expect(stepped.playerDefeated).toBe(false);
    expect(stepped.aircraftDangerFlashStepsRemaining).toBe(0);
    expect(Object.keys(stepped.pairContactCooldownSteps)).toHaveLength(0);
    expect(stepped.destroyedCountByType['elite-drone']).toBe(0);
    expect(stepped.destroyedByContactCountByType['elite-drone']).toBe(0);
    expect(stepped.pendingCombatRewards).toBe(0);
    expect(stepped.pendingEscapePenalties).toBe(0);
    expect(stepped.enemies).toHaveLength(1);
    expect(eliteFrom(stepped.enemies).hullIntegrity).toBe(60);
  });
});

describe('explicit enemy type rejection (no regular-role fallthrough)', () => {
  it('rejects elite-drone through the regular authored-staging spawn path', () => {
    expect(() =>
      spawnEnemyFromPlacement({
        id: 0,
        type: 'elite-drone',
        hullIntegrity: 60,
        width: ARMOURED_BOUNDS.widthPx,
        height: ARMOURED_BOUNDS.heightPx,
        placement: { kind: 'top', engagementBandFraction: 0.5 },
        viewportWidth: VIEWPORT.width,
        viewportHeight: VIEWPORT.height,
        ordinal: 0,
      }),
    ).toThrow(/elite-drone/);
  });

  it('rejects an unsupported enemy type instead of interpreting it as a regular role', () => {
    expect(() =>
      spawnEnemyFromPlacement({
        id: 0,
        type: 'heavy-bomber' as unknown as EnemyType,
        hullIntegrity: 3,
        width: 24,
        height: 24,
        placement: { kind: 'top', engagementBandFraction: 0.5 },
        viewportWidth: VIEWPORT.width,
        viewportHeight: VIEWPORT.height,
        ordinal: 0,
      }),
    ).toThrow(/unsupported enemy type/);
  });

  it('still creates all three regular roles from the same factory', () => {
    const create = (type: EnemyType): CombatEnemy =>
      spawnEnemyFromPlacement({
        id: 0,
        type,
        hullIntegrity: 3,
        width: 24,
        height: 24,
        placement: { kind: 'top', engagementBandFraction: 0.5 },
        viewportWidth: VIEWPORT.width,
        viewportHeight: VIEWPORT.height,
        ordinal: 0,
      });
    expect(create('basic-drone').kind).toBe('basic');
    expect(create('ranged-drone').kind).toBe('ranged');
    expect(create('hunter-drone').kind).toBe('hunter');
    for (const type of [
      'basic-drone',
      'ranged-drone',
      'hunter-drone',
    ] as const) {
      expect(create(type).kind).not.toBe('elite');
    }
  });
});

describe('unchanged regular-enemy behaviour (V02-WI-04 regression)', () => {
  it('still activates a Top-entry Basic only once its complete bounds are inside', () => {
    const bounds = createTestCombatState().enemyBoundsByType['basic-drone'];
    const enemy = spawnEnemyFromPlacement({
      id: 0,
      type: 'basic-drone',
      hullIntegrity: 3,
      width: bounds.width,
      height: bounds.height,
      placement: { kind: 'top', engagementBandFraction: 0.5 },
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      ordinal: 0,
    });
    const firstStep = stepEnemy(enemy, stepInput());
    expect(firstStep.newlyActivated).toBe(false);
    expect(firstStep.enemy?.centerY).toBeCloseTo(
      enemy.centerY + 0.12 * VIEWPORT.height * FIXED_STEP_SECONDS,
      9,
    );
    let current: CombatEnemy = enemy;
    let activationSteps = 0;
    for (let index = 0; index < 600; index += 1) {
      const result = stepEnemy(current, stepInput());
      if (result.enemy === null) {
        break;
      }
      if (result.newlyActivated) {
        activationSteps += 1;
      }
      current = result.enemy;
    }
    expect(activationSteps).toBe(1);
    expect(current.activated).toBe(true);
    expect(current.kind).toBe('basic');
  });

  it('still returns null for an entered regular enemy that fully leaves the viewport', () => {
    const bounds = createTestCombatState().enemyBoundsByType['basic-drone'];
    const enemy: CombatEnemy = {
      id: 0,
      kind: 'basic',
      type: 'basic-drone',
      hullIntegrity: 3,
      centerX: 640,
      centerY: VIEWPORT.height + bounds.height,
      width: bounds.width,
      height: bounds.height,
      entry: 'top',
      hasEnteredVisibleArea: true,
      activated: true,
      ordinal: 0,
    };
    const result = stepEnemy(enemy, stepInput());
    expect(result.enemy).toBeNull();
    expect(result.newlyActivated).toBe(false);
  });
});

describe('Elite deflection feedback inside the real fixed-step pipeline', () => {
  it('creates the local record at the collision-step projectile centre, decays it, removes it at zero, and restarts it', () => {
    const activated = activate();
    const injectedId = 9001;
    const injected = spawnProjectile(
      injectedId,
      1,
      activated.centerX,
      activated.centerY,
      { width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT },
    );
    const state: CombatSimulationState = {
      ...createTestCombatState(),
      enemies: [activated],
      arrivalGroups: [],
      arrivalGroupIndex: 0,
      finalArrivalTimeSeconds: 0,
      countdownSeconds: 0,
      projectiles: [injected],
    };

    // Executed step 1: the blocked hit consumes the injected projectile, keeps
    // the Elite Hull, and creates the authoritative local deflection record at
    // the blocking projectile's centre as it exists AT the collision step (the
    // projectile was advanced before collision resolution).
    const hit = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    expect(
      hit.projectiles.some((projectile) => projectile.id === injectedId),
    ).toBe(false);
    const record = hit.eliteDeflectionFeedbacks[ELITE_ID];
    expect(record).toBeDefined();
    expect(record?.enemyId).toBe(ELITE_ID);
    expect(record?.stepsRemaining).toBe(ENEMY_HIT_FLASH_STEPS);
    expect(record?.impactCenterX).toBeCloseTo(injected.centerX, 9);
    expect(record?.impactCenterY).toBeCloseTo(
      injected.centerY - state.projectileSpeedPxPerSecond * FIXED_STEP_SECONDS,
      9,
    );
    // The generic full-craft enemy flash is never written for a blocked hit.
    expect(hit.activeEnemyFlashStepsRemaining[ELITE_ID]).toBeUndefined();
    expect(eliteFrom(hit.enemies).hullIntegrity).toBe(60);

    // The consumed projectile cannot hit again, so the record decays once per
    // executed step, keeps its impact centre, and is removed at zero.
    const afterOne = stepCombatSimulation(hit, FIXED_STEP_SECONDS);
    expect(afterOne.eliteDeflectionFeedbacks[ELITE_ID]?.stepsRemaining).toBe(2);
    expect(afterOne.eliteDeflectionFeedbacks[ELITE_ID]?.impactCenterX).toBe(
      record?.impactCenterX,
    );
    const afterTwo = stepCombatSimulation(afterOne, FIXED_STEP_SECONDS);
    expect(afterTwo.eliteDeflectionFeedbacks[ELITE_ID]?.stepsRemaining).toBe(1);
    const afterThree = stepCombatSimulation(afterTwo, FIXED_STEP_SECONDS);
    expect(afterThree.eliteDeflectionFeedbacks[ELITE_ID]).toBeUndefined();

    // A later valid blocked hit restarts the record from its full lifetime at
    // the new impact centre.
    const restarting = spawnProjectile(
      injectedId + 1,
      1,
      activated.centerX + 7,
      activated.centerY - 2,
      { width: PROJECTILE_WIDTH, height: PROJECTILE_HEIGHT },
    );
    const restarted = stepCombatSimulation(
      {
        ...afterThree,
        projectiles: [...afterThree.projectiles, restarting],
      },
      FIXED_STEP_SECONDS,
    );
    const restartedRecord = restarted.eliteDeflectionFeedbacks[ELITE_ID];
    expect(restartedRecord?.stepsRemaining).toBe(ENEMY_HIT_FLASH_STEPS);
    expect(restartedRecord?.impactCenterX).toBeCloseTo(restarting.centerX, 9);
    expect(restartedRecord?.impactCenterY).toBeCloseTo(
      restarting.centerY -
        state.projectileSpeedPxPerSecond * FIXED_STEP_SECONDS,
      9,
    );
    expect(
      restarted.projectiles.some(
        (projectile) => projectile.id === injectedId + 1,
      ),
    ).toBe(false);
    expect(eliteFrom(restarted.enemies).hullIntegrity).toBe(60);
  });

  it('reprojects a live local impact centre proportionally on an accepted resize', () => {
    const activated = activate();
    const state: CombatSimulationState = {
      ...createTestCombatState(),
      enemies: [activated],
      arrivalGroups: [],
      arrivalGroupIndex: 0,
      finalArrivalTimeSeconds: 0,
      countdownSeconds: 0,
    };
    const blocked = resolveHits(
      [activated],
      [projectileAt(0, 1, activated.centerX - 8, activated.centerY - 6)],
    );
    const record = blocked.eliteDeflections[ELITE_ID];
    expect(record).toBeDefined();
    const withFeedback: CombatSimulationState = {
      ...state,
      eliteDeflectionFeedbacks: blocked.eliteDeflections,
    };
    const resized = submitCombatCommand(withFeedback, {
      type: 'combat/viewport-resize',
      width: 1600,
      height: 900,
      aircraftWidth: 900 * 0.08 * (1278 / 1231),
      aircraftHeight: 900 * 0.08,
    });
    const after = resized.eliteDeflectionFeedbacks[ELITE_ID];
    expect(after?.impactCenterX).toBeCloseTo(
      (record?.impactCenterX ?? 0) * (1600 / VIEWPORT.width),
      9,
    );
    expect(after?.impactCenterY).toBeCloseTo(
      (record?.impactCenterY ?? 0) * (900 / VIEWPORT.height),
      9,
    );
    // The remaining lifetime and identity are unchanged by a resize.
    expect(after?.enemyId).toBe(ELITE_ID);
    expect(after?.stepsRemaining).toBe(record?.stepsRemaining);
  });
});

describe('Elite phase foundation inside the real fixed-step pipeline', () => {
  it('advances Armoured → Vulnerable → Armoured with blocked damage and no terminal result', () => {
    const activated = activate();
    const state: CombatSimulationState = {
      ...createTestCombatState(),
      enemies: [activated],
      arrivalGroups: [],
      arrivalGroupIndex: 0,
      finalArrivalTimeSeconds: 0,
      countdownSeconds: 0,
    };
    let current = state;
    for (let index = 0; index < ELITE_ARMOURED_PHASE_STEPS; index += 1) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    }
    const vulnerable = eliteFrom(current.enemies);
    expect(vulnerable.phase).toBe('vulnerable');
    expect(vulnerable.phaseStepsRemaining).toBe(ELITE_VULNERABLE_PHASE_STEPS);
    expect(vulnerable.width).toBeCloseTo(VULNERABLE_BOUNDS.widthPx, 9);
    // Every player projectile fired during the Armoured window was blocked.
    expect(vulnerable.hullIntegrity).toBe(60);
    expect(current.pendingCombatRewards).toBe(0);

    for (let index = 0; index < ELITE_VULNERABLE_PHASE_STEPS; index += 1) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    }
    const armoured = eliteFrom(current.enemies);
    expect(armoured.phase).toBe('armoured');
    expect(armoured.hullIntegrity).toBeLessThan(60);
    expect(armoured.hullIntegrity).toBeGreaterThan(0);
    expect(armoured.width).toBeCloseTo(ARMOURED_BOUNDS.widthPx, 9);

    // The following Armoured window blocks every further hit: Hull is frozen.
    const frozenHull = armoured.hullIntegrity;
    for (let index = 0; index < 120; index += 1) {
      current = stepCombatSimulation(current, FIXED_STEP_SECONDS);
    }
    expect(eliteFrom(current.enemies).hullIntegrity).toBe(frozenHull);
    expect(eliteFrom(current.enemies).phase).toBe('armoured');
    expect(current.terminalResult).toBeNull();
    expect(current.enemies).toHaveLength(1);
    // The Elite is never an escape/penalty or reward source in E01.
    expect(current.pendingEscapePenalties).toBe(0);
    expect(current.escapedCountByType).toEqual({
      'basic-drone': 0,
      'ranged-drone': 0,
      'hunter-drone': 0,
      'elite-drone': 0,
    });
  });
});
