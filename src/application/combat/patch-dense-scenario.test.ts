import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { AIRCRAFT_HEIGHT, AIRCRAFT_WIDTH } from '@test-support/domain';
import { COMBAT_MISSION_STREAM, deriveStreamSeed } from '@domain/index';
import { INTERCEPTION_03 } from '@application/content';
import { resolveGermanFighter } from '@application/combat';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import {
  DENSE_WORKLOAD_BUCKET_STEPS,
  DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE,
  DENSE_WORKLOAD_MIN_BUCKET_CORE_LAUNCHES,
  DENSE_WORKLOAD_MIN_CONSECUTIVE_CORE_STEPS,
  DENSE_WORKLOAD_MIN_HUNTERS,
  DENSE_WORKLOAD_MIN_RANGED,
  createDenseWorkloadAccumulator,
  createDenseWorkloadOwnerWorkRecorder,
  denseWorkloadBucketStartStep,
  qualifyDenseWorkloadBucket,
} from './evidence';
import type {
  DenseWorkloadBucketFacts,
  DenseWorkloadEnemyObservation,
  DenseWorkloadOwnerWorkRecorder,
  DenseWorkloadQualification,
  DenseWorkloadStepObservation,
  DenseWorkloadStepWork,
} from './evidence';
import {
  FIXED_STEP_SECONDS,
  FIXED_STEPS_PER_SECOND,
  applyDebugCommand,
  createCombatSimulation,
  maintainDenseCombinedStress,
  stepCombatSimulation,
} from './combat-simulation';
import type { CombatSimulationState } from './combat-simulation';
import {
  ELITE_ARMOURED_PHASE_STEPS,
  ELITE_CORE_FIRST_INTERVAL_STEPS,
  ELITE_CORE_INTERVAL_STEPS,
  ELITE_VULNERABLE_PHASE_STEPS,
} from './enemies';
import type { CombatEnemy } from './enemies';
import { ELITE_CORE_LIFETIME_STEPS } from './projectiles';

/**
 * V021-PATCH-STAB-01 C01 dense combined-stress owner evidence (Verification §11,
 * local-patch exception V021-AC-006).
 *
 * Layer 1 — the real pipeline. The ordinary Mission 03 simulation is executed
 * through the authoritative fixed-step owner and the evidence-only dense
 * combined-stress maintenance (`maintainDenseCombinedStress`, the same bounded
 * §11 setup the scenarios-gated runtime method exposes to an evidence build)
 * tops the LIVE population up to the §11 minimum before each recorded step. The
 * recorder reads only the authoritative post-step state, so the resulting
 * qualification is C01's own evidence rather than a fixture: the natural route is
 * recorded as well, WITHOUT the setup, to prove the qualifier is not trivially
 * satisfied and that the setup is what makes the bucket dense.
 *
 * Layer 2 — the qualifier's fail-sensitivity. An authored-geometry observation
 * series that qualifies, plus one mutation per check that must fail exactly that
 * check (a qualifier that cannot fail proves nothing about the real run).
 *
 * No browser, no wall-clock timing, and no Pass A counter is involved. The
 * scenarios-gated runtime method itself is proven by the browser harness, because
 * unit tests compile the scenarios gate off (`__SHMUP_EVIDENCE_SCENARIOS__`).
 */

/**
 * Explicit, bounded per-test allowance, following the file-local convention of
 * the Mission 02/03 owner suites: each real-pipeline test drives the fixed-step
 * owner through ~20 400 executed steps (~0.7 s alone) and Vitest's default
 * `5_000 ms` budget measures wall clock, which inflates under the aggregate
 * parallel run. The value is still finite, so a genuinely hanging test cannot be
 * masked.
 */
const AGGREGATE_LOAD_TEST_TIMEOUT_MS = 30_000;

const VIEWPORT = { width: 1366, height: 768 } as const;
const SESSION_SEED = 19023;
const MISSION_SEED = deriveStreamSeed(SESSION_SEED, COMBAT_MISSION_STREAM, 0);
/** Far past the predeclared bucket end (activation 19 320 + 1 110). */
const FINAL_STEP = 20_500;

/**
 * The §11 vocabulary view of ONE live enemy: a deliberate structural subset of
 * the authoritative `CombatEnemy`, with the phase fields omitted for the roles
 * that own no phase (`exactOptionalPropertyTypes` forbids an explicit
 * `undefined`).
 */
function observeEnemy(enemy: CombatEnemy): DenseWorkloadEnemyObservation {
  return {
    id: enemy.id,
    kind: enemy.type,
    activated: enemy.activated,
    hullIntegrity: enemy.hullIntegrity,
    centerX: enemy.centerX,
    centerY: enemy.centerY,
    ...(enemy.kind === 'elite' || enemy.kind === 'hunter'
      ? { phase: enemy.phase }
      : {}),
    ...(enemy.kind === 'elite'
      ? { elitePhaseStepsElapsed: enemy.phaseStepsElapsed }
      : {}),
  };
}

/** Reads ONE executed step's authoritative post-step facts (§11 vocabulary). */
/**
 * The PRE-step facts of ONE executed step: read from the authoritative state
 * AFTER the evidence-only §11 setup and BEFORE the step executes, so every
 * "every executed step" population claim is the population the step RAN WITH.
 */
interface DensePreStepObservation {
  readonly missionStepCount: number;
  readonly hunterCount: number;
  readonly rangedCount: number;
  readonly enemyIds: readonly number[];
}

/** Counts one authored enemy type in the authoritative live population. */
function countKind(
  state: CombatSimulationState,
  type: CombatEnemy['type'],
): number {
  return state.enemies.filter((enemy) => enemy.type === type).length;
}

function observePreStep(state: CombatSimulationState): DensePreStepObservation {
  return {
    missionStepCount: state.missionStepCount,
    hunterCount: countKind(state, 'hunter-drone'),
    rangedCount: countKind(state, 'ranged-drone'),
    enemyIds: state.enemies.map((enemy) => enemy.id),
  };
}

/** Counts one authored enemy role in an OBSERVED (recorded) population. */
function countObservedKind(
  observation: DenseWorkloadStepObservation,
  kind: DenseWorkloadEnemyObservation['kind'],
): number {
  return observation.enemies.filter((enemy) => enemy.kind === kind).length;
}

/** The one recorded observation of a mission step (the driver records every step). */
function observationOf(
  observations: readonly DenseWorkloadStepObservation[],
  step: number,
): DenseWorkloadStepObservation {
  const observation = observations.find(
    (candidate) => candidate.missionStepCount === step,
  );
  if (observation === undefined) {
    throw new Error(`no recorded observation for executed step ${step}`);
  }
  return observation;
}

/**
 * The authoritative observation of ONE executed step: the post-step facts, the
 * pre-step population the step ran with, and the step's OWNER-REPORTED work read
 * from the armed recorder (`null` when no recorder was armed for that step).
 */
function observeStep(
  state: CombatSimulationState,
  preStep: DensePreStepObservation,
  ownerWork: DenseWorkloadStepWork | null,
): DenseWorkloadStepObservation {
  return {
    missionStepCount: state.missionStepCount,
    terminal: state.terminalResult !== null,
    playerProjectileCount: state.projectiles.length,
    preStepMissionStepCount: preStep.missionStepCount,
    preStepHunterCount: preStep.hunterCount,
    preStepRangedCount: preStep.rangedCount,
    preStepEnemyIds: preStep.enemyIds,
    ownerWork,
    enemies: state.enemies.map((enemy) => observeEnemy(enemy)),
    enemyProjectiles: state.enemyProjectiles.map((projectile) => ({
      id: projectile.id,
      kind: projectile.kind,
      remainingLifetimeSteps:
        projectile.kind === 'elite-core'
          ? projectile.remainingLifetimeSteps
          : -1,
    })),
    shatters: state.destructionShatters
      .filter((shatter) => shatter.ageSteps === 0)
      .map((shatter) => ({
        enemyId: shatter.enemyId,
        variant: shatter.variant,
        size: shatter.size,
      })),
  };
}

/** The ordinary Mission 03 session under the existing development God Mode. */
function createDenseMissionState(): CombatSimulationState {
  const aircraft = resolveGermanFighter(CONTENT_CATALOGUE);
  const state = createCombatSimulation({
    initialMode: 'mouse',
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon: MACHINE_GUN,
    projectile: PLAYER_PROJECTILE,
    missionSeed: MISSION_SEED,
    mission: INTERCEPTION_03,
    enemies: CONTENT_CATALOGUE.enemies,
    playerHullIntegrity: 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
  return applyDebugCommand(state, {
    type: 'combat-debug/god-mode',
    enabled: true,
  });
}

interface DenseRunResult {
  readonly facts: DenseWorkloadBucketFacts;
  readonly qualification: DenseWorkloadQualification;
  /**
   * Frames the driver sealed that did NOT cover exactly one consecutive executed
   * step. A violated frame also seals NO owner work, so a bucket step can never
   * be credited with work the driver could not bind to that step.
   */
  readonly framingViolations: number;
  /**
   * The RAW recorded observations of the predeclared window, plus the single step
   * before it (the population the first window step ran with was left by that
   * step), kept so the regression can assert the loss-and-top-up boundary itself
   * from the same records the qualifier reads.
   */
  readonly observations: readonly DenseWorkloadStepObservation[];
}

/**
 * Arms the dense owner-work recorder WITHOUT the population setup: the evidence
 * -only §11 maintenance sets this same state field, so the control route that
 * deliberately lacks the combined-stress population still reports the owner work
 * of every step it executes.
 */
function withArmedOwnerWork(
  state: CombatSimulationState,
  ownerWork: DenseWorkloadOwnerWorkRecorder,
): CombatSimulationState {
  return { ...state, denseWorkloadOwnerWork: ownerWork };
}

/**
 * Executes Mission 03 from step 1, recording EVERY executed step until the
 * predeclared bucket window closes. `dense` arms the evidence-only §11
 * maintenance as soon as the observed Elite activation predeclared the window,
 * exactly as the bounded C02 evidence setup does.
 *
 * The owner-work recorder is instrumentation, not setup: it is armed in BOTH
 * routes and the authoritative driver frames every step it executes, so the
 * route WITHOUT the population setup still proves the §11 work facts and fails
 * only the population and destruction requirements it genuinely lacks.
 */
function runDenseBucket(dense: boolean): DenseRunResult {
  const accumulator = createDenseWorkloadAccumulator();
  const ownerWork = createDenseWorkloadOwnerWorkRecorder();
  const observations: DenseWorkloadStepObservation[] = [];
  let state = createDenseMissionState();
  let framingViolations = 0;
  for (let step = 1; step <= FINAL_STEP; step += 1) {
    const window = accumulator.bucketWindow();
    if (window !== null) {
      state = dense
        ? maintainDenseCombinedStress(state, ownerWork)
        : withArmedOwnerWork(state, ownerWork);
    }
    // The population the step is about to RUN WITH, read after the setup and
    // before execution.
    const preStep = observePreStep(state);
    state = stepCombatSimulation(state, FIXED_STEP_SECONDS);
    const observation = observeStep(state, preStep, ownerWork.lastStepWork());
    accumulator.recordStep(observation);
    if (window !== null && step >= window.startStep - 1) {
      observations.push(observation);
    }
    framingViolations = ownerWork.framingViolationSteps();
    if (window !== null && step >= window.endStep) {
      break;
    }
  }
  const facts = accumulator.facts();
  return {
    facts,
    qualification: qualifyDenseWorkloadBucket(facts),
    framingViolations,
    observations,
  };
}

/** The names of the checks a qualification failed, in check order. */
function failedCheckNames(
  qualification: DenseWorkloadQualification,
): readonly string[] {
  return qualification.checks
    .filter((check) => !check.passed)
    .map((check) => check.name);
}

/**
 * The synthetic baseline mirrors the OBSERVED authored Elite cycle of the real
 * Mission 03 activation in `./enemies` terms only: activation on `A`, Armoured
 * `720` executed steps, then a Vulnerable phase whose Cores launch on the
 * authored `30 + 60 k` cadence. The authored cycle and the predeclared
 * `denseWorkloadBucketStartStep` put the sixth owner Core exactly on the bucket
 * start by construction, so the baseline qualifies without any value being fitted
 * to a measured result.
 */
const SYNTHETIC_ACTIVATION_STEP = 1000;
const SYNTHETIC_VULNERABLE_START_STEP =
  SYNTHETIC_ACTIVATION_STEP + ELITE_ARMOURED_PHASE_STEPS;
const SYNTHETIC_BUCKET_START_STEP = denseWorkloadBucketStartStep(
  SYNTHETIC_ACTIVATION_STEP,
);
const SYNTHETIC_BUCKET_END_STEP =
  SYNTHETIC_BUCKET_START_STEP + DENSE_WORKLOAD_BUCKET_STEPS - 1;
const SYNTHETIC_ELITE_ID = 1000;
const SYNTHETIC_HUNTER_ID_BASE = 100;
const SYNTHETIC_RANGED_ID = 200;
const SYNTHETIC_CORE_ID_BASE = 9000;
/** The authored `30, 90, 150, 210, 270, 330` Vulnerable launch steps. */
const SYNTHETIC_CORE_LAUNCH_STEPS = Array.from(
  { length: DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE },
  (_unused, index) =>
    SYNTHETIC_VULNERABLE_START_STEP +
    ELITE_CORE_FIRST_INTERVAL_STEPS +
    index * ELITE_CORE_INTERVAL_STEPS,
);
/** The owner Core ids of the authored cycle: `9000`, the sixth, and a seventh. */
const SYNTHETIC_FIRST_CORE_ID = SYNTHETIC_CORE_ID_BASE;
const SYNTHETIC_SIXTH_CORE_ID =
  SYNTHETIC_CORE_ID_BASE + DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE - 1;
const SYNTHETIC_SEVENTH_CORE_ID =
  SYNTHETIC_CORE_ID_BASE + DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE;
/** The Elite's authored hull integrity (it never changes in the cycle). */
const SYNTHETIC_ELITE_HULL = 60;
/**
 * A held sixth launch is still an OWNER Core only while its Vulnerable phase is
 * running. The authored sixth launch is at phase elapsed `330` of the authored
 * `360`-step phase, so exactly `30` steps of that phase remain after it and a
 * held launch can stay an owner launch for at most `29` of them. Half of that
 * remaining slack holds the launch strictly inside BOTH the phase and the
 * predeclared window, so the qualifier must accept it: the cadence rule is an
 * observed upper bound, never an exact schedule match.
 */
const HELD_SIXTH_CORE_PHASE_SLACK_STEPS =
  ELITE_VULNERABLE_PHASE_STEPS -
  (ELITE_CORE_FIRST_INTERVAL_STEPS +
    (DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE - 1) * ELITE_CORE_INTERVAL_STEPS);
const HELD_SIXTH_CORE_DELAY_STEPS = HELD_SIXTH_CORE_PHASE_SLACK_STEPS / 2;
/**
 * The DELAYED sixth owner launch carries a FRESH id: the authored sixth Core is
 * withheld entirely (it is never observed, so it never disappears), while the
 * recorder forbids an observed id from reappearing after it disappeared. A held
 * launch must therefore arrive as a new Core, exactly as a real one would.
 */
const SYNTHETIC_HELD_SIXTH_CORE_ID = SYNTHETIC_CORE_ID_BASE + 100;

/** The authored Elite phase/elapsed state of ONE synthetic executed step. */
function syntheticEliteCycle(step: number): {
  readonly phase: 'armoured' | 'vulnerable';
  readonly elapsed: number;
} {
  const armouredElapsed = step - SYNTHETIC_ACTIVATION_STEP;
  if (armouredElapsed < ELITE_ARMOURED_PHASE_STEPS) {
    return { phase: 'armoured', elapsed: armouredElapsed };
  }
  const vulnerableElapsed = step - SYNTHETIC_VULNERABLE_START_STEP;
  if (vulnerableElapsed < ELITE_VULNERABLE_PHASE_STEPS) {
    return { phase: 'vulnerable', elapsed: vulnerableElapsed };
  }
  return {
    phase: 'armoured',
    elapsed: vulnerableElapsed - ELITE_VULNERABLE_PHASE_STEPS,
  };
}

/** One live synthetic Hunter (`DENSE_WORKLOAD_MIN_HUNTERS` of these are live). */
function syntheticHunter(index: number): DenseWorkloadEnemyObservation {
  return {
    id: SYNTHETIC_HUNTER_ID_BASE + index,
    kind: 'hunter-drone',
    activated: true,
    hullIntegrity: 2,
    centerX: 200 + index * 10,
    centerY: 300,
    phase: 'committed',
  };
}

/** One live synthetic Ranged Drone (the §11 population minimum). */
function syntheticRanged(): DenseWorkloadEnemyObservation {
  return {
    id: SYNTHETIC_RANGED_ID,
    kind: 'ranged-drone',
    activated: true,
    hullIntegrity: 4,
    centerX: 683,
    centerY: 120,
  };
}

/**
 * The live Cores of ONE synthetic step with their exact authored lifetime: a Core
 * is live from its launch step for `ELITE_CORE_LIFETIME_STEPS - 1` executed steps
 * with `remainingLifetimeSteps` decreasing by exactly one (the rule the
 * authoritative mission demonstrates: launch on step `L` with `359`, last live
 * observation on `L + 358` with `1`).
 */
function syntheticCores(
  step: number,
): DenseWorkloadStepObservation['enemyProjectiles'] {
  return SYNTHETIC_CORE_LAUNCH_STEPS.map((launchStep, index) => ({
    launchStep,
    id: SYNTHETIC_CORE_ID_BASE + index,
  }))
    .filter(
      ({ launchStep }) =>
        step >= launchStep &&
        step - launchStep <= ELITE_CORE_LIFETIME_STEPS - 2,
    )
    .map(({ launchStep, id }) => ({
      id,
      kind: 'elite-core',
      remainingLifetimeSteps:
        ELITE_CORE_LIFETIME_STEPS - 1 - (step - launchStep),
    }));
}

/**
 * The authored step on which the §11 population loses its first Hunter to the
 * Aircraft-contact owner (the ONE destruction event the bucket proves): the step
 * after the window opens, so the proven shatter lies inside it.
 */
const SYNTHETIC_SHATTER_STEP = SYNTHETIC_BUCKET_START_STEP + 1;

/**
 * The OWNER-REPORTED work of ONE synthetic step. The synthetic series mirrors
 * the SHAPE the canonical owners report, never a measured value (the real
 * Mission 03 pipeline supplies the measured facts): the player-projectile
 * collision pass enumerates the whole live population as candidate pairs every
 * step, the Aircraft-contact pass enumerates the same population and overlaps
 * only the Ranged drone — plus, on the shatter step, the Hunter that reaches the
 * aircraft and is destroyed by that contact — and the Elite attack step reports
 * the Core it created on an authored launch step and nothing otherwise.
 */
function syntheticOwnerWork(
  step: number,
  destroyedHunterId: number | null,
): DenseWorkloadStepWork {
  const launchIndex = SYNTHETIC_CORE_LAUNCH_STEPS.indexOf(step);
  return {
    step,
    playerProjectileCandidates: DENSE_WORKLOAD_MIN_HUNTERS + 2,
    playerProjectileIntersections: 0,
    playerProjectileLethalEnemyIds: [],
    contactCandidates: DENSE_WORKLOAD_MIN_HUNTERS + 2,
    contactIntersections: destroyedHunterId === null ? 1 : 2,
    contactLethalEnemyIds:
      destroyedHunterId === null ? [] : [destroyedHunterId],
    ownerCoreLaunchIds:
      launchIndex < 0 ? [] : [SYNTHETIC_CORE_ID_BASE + launchIndex],
  };
}

/** ONE synthetic executed step: the authored Elite cycle plus the §11 population. */
function syntheticObservation(step: number): DenseWorkloadStepObservation {
  const cycle = syntheticEliteCycle(step);
  // The step the contact owner destroys the first Hunter on: that Hunter is part
  // of the population the step RAN WITH, the owner reports the lethal id, and it
  // is gone from the post-step population — all three links of the shatter proof.
  const destroyedHunterId =
    step === SYNTHETIC_SHATTER_STEP ? SYNTHETIC_HUNTER_ID_BASE : null;
  const elite: DenseWorkloadEnemyObservation = {
    id: SYNTHETIC_ELITE_ID,
    kind: 'elite-drone',
    activated: true,
    hullIntegrity: SYNTHETIC_ELITE_HULL,
    centerX: 1026,
    centerY: 153,
    phase: cycle.phase,
    elitePhaseStepsElapsed: cycle.elapsed,
  };
  const hunters = Array.from(
    { length: DENSE_WORKLOAD_MIN_HUNTERS },
    (_unused, index) => syntheticHunter(index),
  );
  const ranged = syntheticRanged();
  const preStepEnemies = [elite, ...hunters, ranged];
  return {
    missionStepCount: step,
    terminal: false,
    playerProjectileCount: 3,
    preStepMissionStepCount: step - 1,
    preStepHunterCount: hunters.length,
    preStepRangedCount: 1,
    preStepEnemyIds: preStepEnemies.map((enemy) => enemy.id),
    ownerWork: syntheticOwnerWork(step, destroyedHunterId),
    enemies: preStepEnemies.filter((enemy) => enemy.id !== destroyedHunterId),
    enemyProjectiles: syntheticCores(step),
    shatters:
      destroyedHunterId === null
        ? []
        : [
            {
              enemyId: destroyedHunterId,
              variant: 'regular' as const,
              size: 24,
            },
          ],
  };
}

/** The whole synthetic series: the activation step through the bucket end. */
function syntheticSeries(): DenseWorkloadStepObservation[] {
  const steps: DenseWorkloadStepObservation[] = [];
  for (
    let step = SYNTHETIC_ACTIVATION_STEP;
    step <= SYNTHETIC_BUCKET_END_STEP;
    step += 1
  ) {
    steps.push(syntheticObservation(step));
  }
  return steps;
}

/** Records a whole series and returns its observed facts. */
function factsOfSeries(
  steps: readonly DenseWorkloadStepObservation[],
): DenseWorkloadBucketFacts {
  const accumulator = createDenseWorkloadAccumulator();
  for (const step of steps) {
    accumulator.recordStep(step);
  }
  return accumulator.facts();
}

/** Records a whole series and qualifies the window its activation predeclared. */
function qualifySeries(
  steps: readonly DenseWorkloadStepObservation[],
): DenseWorkloadQualification {
  return qualifyDenseWorkloadBucket(factsOfSeries(steps));
}

/** Replaces ONE step's observation, selected by mission step count. */
function mutateStep(
  steps: readonly DenseWorkloadStepObservation[],
  step: number,
  mutate: (
    observation: DenseWorkloadStepObservation,
  ) => DenseWorkloadStepObservation,
): DenseWorkloadStepObservation[] {
  return steps.map((observation) =>
    observation.missionStepCount === step ? mutate(observation) : observation,
  );
}

/** The same observation without the given live enemy projectiles. */
function withoutProjectiles(
  observation: DenseWorkloadStepObservation,
  ids: readonly number[],
): DenseWorkloadStepObservation {
  return {
    ...observation,
    enemyProjectiles: observation.enemyProjectiles.filter(
      (projectile) => !ids.includes(projectile.id),
    ),
  };
}

/** Applies `mutate` to every series step from `step` on (inclusive). */
function mutateFromStep(
  steps: readonly DenseWorkloadStepObservation[],
  step: number,
  mutate: (
    observation: DenseWorkloadStepObservation,
  ) => DenseWorkloadStepObservation,
): DenseWorkloadStepObservation[] {
  return steps.map((observation) =>
    observation.missionStepCount >= step ? mutate(observation) : observation,
  );
}

/** Keeps only the series steps up to `step` (inclusive): a truncated attempt. */
function truncateAfter(
  steps: readonly DenseWorkloadStepObservation[],
  step: number,
): DenseWorkloadStepObservation[] {
  return steps.filter((observation) => observation.missionStepCount <= step);
}

/** Records one series step a second time: a duplicated (stale) observation. */
function duplicateStep(
  steps: readonly DenseWorkloadStepObservation[],
  step: number,
): DenseWorkloadStepObservation[] {
  const duplicate = steps.find(
    (observation) => observation.missionStepCount === step,
  );
  if (duplicate === undefined) {
    return [...steps];
  }
  return steps.flatMap((observation) =>
    observation.missionStepCount === step
      ? [observation, { ...duplicate }]
      : [observation],
  );
}

/** Omits one series step: a skipped (non-consecutive) observation. */
function skipStep(
  steps: readonly DenseWorkloadStepObservation[],
  step: number,
): DenseWorkloadStepObservation[] {
  return steps.filter((observation) => observation.missionStepCount !== step);
}

/**
 * The same observation with one live enemy's authored role replaced for the
 * WHOLE executed step: the step that ran with this enemy cannot have it as a
 * Hunter at the start and as a Basic Drone at the end, so the pre-step role
 * counts the §11 population claims read move with the post-step population.
 */
function replaceEnemyKind(
  observation: DenseWorkloadStepObservation,
  id: number,
  kind: DenseWorkloadEnemyObservation['kind'],
): DenseWorkloadStepObservation {
  const replaced = observation.enemies.find((enemy) => enemy.id === id);
  if (replaced === undefined || replaced.kind === kind) {
    return observation;
  }
  const wasPreStep = observation.preStepEnemyIds.includes(id);
  return {
    ...observation,
    preStepHunterCount:
      wasPreStep && replaced.kind === 'hunter-drone'
        ? observation.preStepHunterCount - 1
        : observation.preStepHunterCount,
    preStepRangedCount:
      wasPreStep && replaced.kind === 'ranged-drone'
        ? observation.preStepRangedCount - 1
        : observation.preStepRangedCount,
    enemies: observation.enemies.map((enemy) =>
      enemy.id === id
        ? {
            id: enemy.id,
            kind,
            activated: enemy.activated,
            hullIntegrity: enemy.hullIntegrity,
            centerX: enemy.centerX,
            centerY: enemy.centerY,
          }
        : enemy,
    ),
  };
}

/** The same observation with the live Elite's hull integrity replaced. */
function withEliteHull(
  observation: DenseWorkloadStepObservation,
  hullIntegrity: number,
): DenseWorkloadStepObservation {
  return {
    ...observation,
    enemies: observation.enemies.map((enemy) =>
      enemy.id === SYNTHETIC_ELITE_ID ? { ...enemy, hullIntegrity } : enemy,
    ),
  };
}

/** The same observation with the live Elite not (yet) activated. */
function withEliteDeactivated(
  observation: DenseWorkloadStepObservation,
): DenseWorkloadStepObservation {
  return {
    ...observation,
    enemies: observation.enemies.map((enemy) =>
      enemy.id === SYNTHETIC_ELITE_ID ? { ...enemy, activated: false } : enemy,
    ),
  };
}

/** The same observation carrying a SECOND live Elite: ambiguous presence. */
function withSecondElite(
  observation: DenseWorkloadStepObservation,
): DenseWorkloadStepObservation {
  const elite = observation.enemies.find(
    (enemy) => enemy.id === SYNTHETIC_ELITE_ID,
  );
  if (elite === undefined) {
    return observation;
  }
  return {
    ...observation,
    enemies: [...observation.enemies, { ...elite, id: SYNTHETIC_ELITE_ID + 1 }],
  };
}

/** The same observation plus one live Core the owner never launched. */
function withInjectedCore(
  observation: DenseWorkloadStepObservation,
  id: number,
  remainingLifetimeSteps: number,
): DenseWorkloadStepObservation {
  return {
    ...observation,
    enemyProjectiles: [
      ...observation.enemyProjectiles,
      { id, kind: 'elite-core', remainingLifetimeSteps },
    ],
  };
}

/** The same observation plus one shatter no live enemy can account for. */
function withUnprovenShatter(
  observation: DenseWorkloadStepObservation,
): DenseWorkloadStepObservation {
  return {
    ...observation,
    shatters: [
      ...observation.shatters,
      { enemyId: 9999, variant: 'regular', size: 24 },
    ],
  };
}

/** The same observation with its owner-reported work record REPLACED. */
function withOwnerWork(
  observation: DenseWorkloadStepObservation,
  ownerWork: DenseWorkloadStepWork | null,
): DenseWorkloadStepObservation {
  return { ...observation, ownerWork };
}

/** The same observation with its owner-reported Core launch ids replaced. */
function withOwnerCoreLaunchIds(
  observation: DenseWorkloadStepObservation,
  ids: readonly number[],
): DenseWorkloadStepObservation {
  const ownerWork = observation.ownerWork;
  return ownerWork === null
    ? observation
    : withOwnerWork(observation, { ...ownerWork, ownerCoreLaunchIds: ids });
}

/**
 * The same observation with the owner-reported work of a DIFFERENT step: the
 * frame the driver bound to this executed step no longer belongs to it.
 */
function withReboundOwnerWork(
  observation: DenseWorkloadStepObservation,
): DenseWorkloadStepObservation {
  const ownerWork = observation.ownerWork;
  return ownerWork === null
    ? observation
    : withOwnerWork(observation, { ...ownerWork, step: ownerWork.step + 1 });
}

/**
 * The same observation whose owner reports ZERO player-projectile candidates
 * while the live pair the work would need is still present: the population a
 * count-only rule would credit is there, the owner-reported work is not.
 */
function withOwnerCandidates(
  observation: DenseWorkloadStepObservation,
  count: number,
): DenseWorkloadStepObservation {
  const ownerWork = observation.ownerWork;
  return ownerWork === null
    ? observation
    : withOwnerWork(observation, {
        ...ownerWork,
        playerProjectileCandidates: count,
      });
}

/** The same observation whose contact owner reports no lethal destruction. */
function withoutOwnerLethalIds(
  observation: DenseWorkloadStepObservation,
): DenseWorkloadStepObservation {
  const ownerWork = observation.ownerWork;
  return ownerWork === null
    ? observation
    : withOwnerWork(observation, {
        ...ownerWork,
        contactLethalEnemyIds: [],
        playerProjectileLethalEnemyIds: [],
      });
}

/**
 * ONE recorded-series mutation that must make the qualifier fail exactly the
 * checks named in `expectedFailures`. A mutation that failed NOTHING would mean
 * the check it targets is dead, and a mutation that failed MORE than it targets
 * would mean the named check is not the one that observed the missing property;
 * both are asserted, in check order.
 */
interface DenseQualificationMutationCase {
  /** The mutation described in one line; used as the `it.each` title. */
  readonly title: string;
  readonly expectedFailures: readonly string[];
  readonly mutate: (
    steps: readonly DenseWorkloadStepObservation[],
  ) => DenseWorkloadStepObservation[];
}

/**
 * Every mutation is applied to the SAME qualifying baseline series, so each case
 * isolates one missing or corrupted §11 property. `mutateFromStep`,
 * `mutateStep`, `skipStep`, `truncateAfter`, `duplicateStep` and the elite and
 * Core helpers above are the only tools used: nothing re-derives an expectation
 * from the mutated series, so a passing case cannot be self-fulfilling.
 */
const MUTATION_CASES: readonly DenseQualificationMutationCase[] = [
  {
    title: 'withholds the first owner Core from the fifth window step on',
    expectedFailures: ['six-cores-concurrent-run'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP + 5, (observation) =>
        withoutProjectiles(observation, [SYNTHETIC_FIRST_CORE_ID]),
      ),
  },
  {
    title: 'deactivates the observed Elite for one window step',
    expectedFailures: [
      'active-elite-every-step',
      'six-cores-with-active-elite',
    ],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP + 3, (observation) =>
        withEliteDeactivated(observation),
      ),
  },
  {
    title: 'injects a seventh Core on the step after the window opens',
    expectedFailures: ['core-owner-provenance'],
    mutate: (steps) =>
      steps.map((observation) => {
        if (observation.missionStepCount === SYNTHETIC_BUCKET_START_STEP + 1) {
          return withInjectedCore(
            observation,
            SYNTHETIC_SEVENTH_CORE_ID,
            ELITE_CORE_LIFETIME_STEPS - 1,
          );
        }
        if (observation.missionStepCount > SYNTHETIC_BUCKET_START_STEP + 1) {
          return withoutProjectiles(observation, [SYNTHETIC_SEVENTH_CORE_ID]);
        }
        return observation;
      }),
  },
  {
    title: 'withholds the sixth owner Core for the whole window',
    expectedFailures: [
      'six-cores-concurrent-run',
      'core-launch-steps-recorded',
    ],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP, (observation) =>
        withoutProjectiles(observation, [SYNTHETIC_SIXTH_CORE_ID]),
      ),
  },
  {
    title: 'converts one live Hunter to a Basic Drone inside the window',
    expectedFailures: ['six-hunters-every-step'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP + 3, (observation) =>
        replaceEnemyKind(observation, SYNTHETIC_HUNTER_ID_BASE, 'basic-drone'),
      ),
  },
  {
    title: 'converts the live Ranged Drone to a Basic Drone inside the window',
    expectedFailures: ['ranged-every-step'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP + 3, (observation) =>
        replaceEnemyKind(observation, SYNTHETIC_RANGED_ID, 'basic-drone'),
      ),
  },
  {
    title: 'clears the player projectile population for the last ten steps',
    expectedFailures: [
      'player-projectile-work-every-step',
      'collision-candidate-work-every-step',
    ],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_END_STEP - 9, (observation) => ({
        ...observation,
        playerProjectileCount: 0,
      })),
  },
  {
    title: 'clears the enemy projectile population for the last ten steps',
    expectedFailures: ['enemy-projectile-work-every-step'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_END_STEP - 9, (observation) => ({
        ...observation,
        enemyProjectiles: [],
      })),
  },
  {
    title: 'removes the only proven destruction shatter',
    expectedFailures: ['lethal-destruction-shatter'],
    mutate: (steps) =>
      mutateStep(steps, SYNTHETIC_SHATTER_STEP, (observation) => ({
        ...observation,
        shatters: [],
      })),
  },
  {
    title: 'adds a shatter no live enemy can account for',
    expectedFailures: ['lethal-destruction-shatter'],
    mutate: (steps) =>
      mutateStep(steps, SYNTHETIC_BUCKET_START_STEP + 5, (observation) =>
        withUnprovenShatter(observation),
      ),
  },
  {
    title:
      'records the proven shatter without the owner that destroyed its enemy',
    expectedFailures: ['lethal-destruction-shatter'],
    mutate: (steps) =>
      mutateStep(steps, SYNTHETIC_SHATTER_STEP, (observation) =>
        withoutOwnerLethalIds(observation),
      ),
  },
  {
    title: 'records the shatter of an enemy the step still had alive',
    expectedFailures: ['lethal-destruction-shatter'],
    mutate: (steps) =>
      mutateStep(steps, SYNTHETIC_SHATTER_STEP, (observation) => ({
        ...observation,
        preStepEnemyIds: observation.preStepEnemyIds.filter(
          (id) => id !== SYNTHETIC_HUNTER_ID_BASE,
        ),
      })),
  },
  {
    title: 'withholds the owner work of the last ten window steps',
    expectedFailures: ['collision-candidate-work-every-step'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_END_STEP - 9, (observation) =>
        withOwnerWork(observation, null),
      ),
  },
  {
    title: 'reports the owner work of a different step for the last ten steps',
    expectedFailures: ['collision-candidate-work-every-step'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_END_STEP - 9, (observation) =>
        withReboundOwnerWork(observation),
      ),
  },
  {
    title:
      'reports the pre-step population of the previous executed step for the last ten steps',
    expectedFailures: ['pre-step-population-recorded'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_END_STEP - 9, (observation) => ({
        ...observation,
        preStepMissionStepCount: observation.preStepMissionStepCount - 1,
      })),
  },
  {
    title:
      'reports zero owner collision candidates for the last ten steps while the population is present',
    expectedFailures: ['collision-candidate-work-every-step'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_END_STEP - 9, (observation) =>
        withOwnerCandidates(observation, 0),
      ),
  },
  {
    title: 'reports the new owner Core without the step that launched it',
    expectedFailures: ['core-owner-provenance'],
    mutate: (steps) =>
      mutateStep(steps, SYNTHETIC_BUCKET_START_STEP, (observation) =>
        withOwnerCoreLaunchIds(observation, []),
      ),
  },
  {
    title: 'drops the final window step',
    expectedFailures: [
      'bucket-window-complete',
      'active-elite-every-step',
      'player-projectile-work-every-step',
      'enemy-projectile-work-every-step',
      'collision-candidate-work-every-step',
    ],
    mutate: (steps) => truncateAfter(steps, SYNTHETIC_BUCKET_END_STEP - 1),
  },
  {
    title: 'truncates the run at the thirtieth window step',
    expectedFailures: [
      'bucket-executed-steps',
      'bucket-window-complete',
      'active-elite-every-step',
      'player-projectile-work-every-step',
      'enemy-projectile-work-every-step',
      'collision-candidate-work-every-step',
    ],
    mutate: (steps) => truncateAfter(steps, SYNTHETIC_BUCKET_START_STEP + 30),
  },
  {
    title: 'skips the eighth window step',
    expectedFailures: [
      'bucket-window-complete',
      'executed-step-continuity',
      'active-elite-every-step',
      // The missing executed step breaks every live Core's `−1` per-step
      // lifetime proof, so the provenance check fails with it.
      'core-owner-provenance',
      'player-projectile-work-every-step',
      'enemy-projectile-work-every-step',
      'collision-candidate-work-every-step',
    ],
    mutate: (steps) => skipStep(steps, SYNTHETIC_BUCKET_START_STEP + 7),
  },
  {
    title: 'records the fourth window step twice',
    expectedFailures: [
      'bucket-window-complete',
      'executed-step-continuity',
      'no-stale-step-facts',
      'active-elite-every-step',
      // A replayed step rewinds every live Core's remaining lifetime by one, so
      // the provenance check fails with the continuity it depends on.
      'core-owner-provenance',
      'player-projectile-work-every-step',
      'enemy-projectile-work-every-step',
      'collision-candidate-work-every-step',
    ],
    mutate: (steps) => duplicateStep(steps, SYNTHETIC_BUCKET_START_STEP + 3),
  },
  {
    title: 'records a terminal state inside the window',
    expectedFailures: ['no-pause-or-terminal'],
    mutate: (steps) =>
      mutateStep(steps, SYNTHETIC_BUCKET_START_STEP + 3, (observation) => ({
        ...observation,
        terminal: true,
      })),
  },
  {
    title: 'reports a fractional Elite hull inside the window',
    expectedFailures: ['elite-hull-monotonic'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP + 3, (observation) =>
        withEliteHull(observation, 60.5),
      ),
  },
  {
    title: 'raises the Elite hull inside the window',
    expectedFailures: ['elite-hull-monotonic'],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP + 40, (observation) =>
        withEliteHull(observation, SYNTHETIC_ELITE_HULL + 1),
      ),
  },
  {
    title: 'reports a second live Elite inside the window',
    expectedFailures: [
      'active-elite-every-step',
      'single-elite',
      'six-cores-with-active-elite',
    ],
    mutate: (steps) =>
      mutateFromStep(steps, SYNTHETIC_BUCKET_START_STEP + 3, (observation) =>
        withSecondElite(observation),
      ),
  },
];

/**
 * The Elite's authored `05:20` creation step (`320 s × 60`) and the `2 s`
 * (120 executed steps) authored Top-entry that precedes its first active phase:
 * the frozen C01 feasibility diagnostic recorded creation `19200` and activation
 * `19320`, and the bucket rule derives `20370..20429` from the activation.
 */
const ELITE_CREATION_STEP = 320 * FIXED_STEPS_PER_SECOND;
const ELITE_ACTIVATION_STEP = ELITE_CREATION_STEP + 120;
const BUCKET_START_STEP = denseWorkloadBucketStartStep(ELITE_ACTIVATION_STEP);
const BUCKET_END_STEP = BUCKET_START_STEP + DENSE_WORKLOAD_BUCKET_STEPS - 1;

describe('V021-PATCH-STAB-01 C01 dense combined-stress bucket (real Mission 03 pipeline)', () => {
  it('derives the predeclared bucket from the authored Elite activation alone', () => {
    // The rule is authored arithmetic (`12 s` Armoured, `0.5 s` first Core,
    // `5 × 1 s`), so the window is fixed before the run and can never be fitted
    // to a measured result.
    expect(denseWorkloadBucketStartStep(ELITE_ACTIVATION_STEP)).toBe(
      ELITE_ACTIVATION_STEP +
        ELITE_ARMOURED_PHASE_STEPS +
        ELITE_CORE_FIRST_INTERVAL_STEPS +
        (DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE - 1) *
          ELITE_CORE_INTERVAL_STEPS,
    );
    expect(BUCKET_START_STEP).toBe(20370);
    expect(BUCKET_END_STEP).toBe(20429);
  });

  it(
    'records the natural window as failing exactly the §11 population and destruction requirements, and qualifies the same window once the evidence-only dense population is maintained',
    () => {
      const natural = runDenseBucket(false);
      const dense = runDenseBucket(true);

      // Both routes execute the SAME authoritative pipeline, so they observe the
      // same Elite activation and therefore the same predeclared window, fully
      // executed in both cases (60 of 60 window steps).
      expect(natural.facts.eliteActivationStep).toBe(ELITE_ACTIVATION_STEP);
      expect(dense.facts.eliteActivationStep).toBe(
        natural.facts.eliteActivationStep,
      );
      expect(dense.facts.bucketStartStep).toBe(natural.facts.bucketStartStep);
      expect(dense.facts.bucketEndStep).toBe(natural.facts.bucketEndStep);
      expect(natural.facts.bucketStartStep).toBe(BUCKET_START_STEP);
      expect(natural.facts.executedSteps).toBe(DENSE_WORKLOAD_BUCKET_STEPS);
      expect(dense.facts.executedSteps).toBe(DENSE_WORKLOAD_BUCKET_STEPS);

      // NATURAL ROUTE: the authored Mission 03 route is missing precisely the
      // §11 combined-stress population (six Hunters, one Ranged) and a proven
      // destruction inside the window. Every other §11 property — the Elite, the
      // six concurrent owner Cores for the authored run, the in-window owner
      // launch, projectile work on every step, and step continuity — already
      // holds naturally, which is why the dense setup only has to ADD roles.
      expect(failedCheckNames(natural.qualification)).toEqual([
        'six-hunters-every-step',
        'ranged-every-step',
        'lethal-destruction-shatter',
      ]);
      expect(natural.qualification.qualified).toBe(false);
      expect(natural.facts.hunterMin).toBe(0);
      expect(natural.facts.rangedMin).toBe(0);
      expect(natural.facts.shatterCount).toBe(0);
      expect(natural.facts.maxConsecutiveSixCoreSteps).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_CONSECUTIVE_CORE_STEPS,
      );
      expect(natural.facts.terminalSteps).toBe(0);

      // DENSE ROUTE: the evidence-only maintenance supplies exactly what was
      // missing and the SAME recorder verdict now holds every §11 check, with
      // the owner Core evidence untouched by the added roles.
      // The §11 population requirement is a claim about the population every
      // executed step RAN WITH, so it is asserted on the pre-step facts the
      // qualifier itself reads. The maintenance tops the live population up
      // before each recorded step, so a Ranged Drone a recorded step destroys is
      // re-topped before the next one: only the PRE-step minimum is invariant.
      expect(dense.facts.preStepHunterMin).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_HUNTERS,
      );
      expect(dense.facts.preStepRangedMin).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_RANGED,
      );
      expect(dense.facts.hunterMax).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_HUNTERS,
      );
      expect(dense.facts.rangedMax).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_RANGED,
      );
      // The maintenance really had to supply a Ranged Drone the natural route
      // lacked AND to re-top one up: the loss is a destroyed Ranged inside the
      // window, never a gap in the recorded population.
      expect(dense.facts.rangedLossSteps).toBeGreaterThanOrEqual(1);
      expect(dense.facts.preStepPopulationViolationSteps).toBe(0);
      expect(dense.facts.playerProjectileWorkSteps).toBe(
        DENSE_WORKLOAD_BUCKET_STEPS,
      );
      expect(dense.facts.enemyProjectileWorkSteps).toBe(
        DENSE_WORKLOAD_BUCKET_STEPS,
      );
      expect(dense.facts.ownerCandidateSteps).toBe(DENSE_WORKLOAD_BUCKET_STEPS);
      expect(dense.facts.ownerContactCandidateSteps).toBe(
        DENSE_WORKLOAD_BUCKET_STEPS,
      );
      expect(dense.facts.minOwnerCandidates).toBeGreaterThan(0);
      // Owner-reporting hygiene: every window step was framed by the armed
      // recorder and bound to its own executed step, no step claimed candidate
      // work without the live pair that work needs, and every step carried the
      // pre-step population of the step it executed.
      expect(dense.facts.unownedWorkSteps).toBe(0);
      expect(dense.facts.ownerWorkBindingViolations).toBe(0);
      expect(dense.facts.candidateWithoutPopulationSteps).toBe(0);
      expect(dense.facts.preStepPopulationViolationSteps).toBe(0);
      expect(dense.framingViolations).toBe(0);
      expect(natural.framingViolations).toBe(0);
      expect(dense.facts.lethalShatterSteps).toBeGreaterThanOrEqual(1);
      expect(dense.facts.unprovenShatters).toBe(0);

      // DIRECT LOSS-AND-TOP-UP BOUNDARY. The §11 minimum is a claim about the
      // population every executed step RAN WITH, and the maintenance is applied
      // BEFORE each recorded step, so the recorded trajectory must show the
      // boundary itself: a step that RAN WITH the Ranged Drone and ended BELOW the
      // minimum, immediately followed by a step that ran with a REPLACEMENT the
      // setup spawned — an enemy that loss step never had — while the natural route
      // never carried a Ranged Drone inside the same window at all. Reading the
      // post-step population (or topping up after the step) would break both facts.
      const lossStepFacts = dense.facts.bucketStepFacts.find(
        (stepFacts) =>
          stepFacts.rangedLoss >= 1 && stepFacts.step < BUCKET_END_STEP,
      );
      expect(lossStepFacts).toBeDefined();
      const lossStep = observationOf(
        dense.observations,
        lossStepFacts === undefined ? -1 : lossStepFacts.step,
      );
      const beforeLoss = observationOf(
        dense.observations,
        lossStep.missionStepCount - 1,
      );
      const afterLoss = observationOf(
        dense.observations,
        lossStep.missionStepCount + 1,
      );
      // (1) The loss step ran WITH the Ranged Drone ...
      expect(lossStep.preStepRangedCount).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_RANGED,
      );
      // (2) ... and ended below the §11 minimum, without it: the raw pre-step
      // count the qualifier reads differs from the post-step population by exactly
      // the loss the accumulator reported for this executed step.
      const lostRangedCount =
        lossStep.preStepRangedCount -
        countObservedKind(lossStep, 'ranged-drone');
      expect(lostRangedCount).toBeGreaterThanOrEqual(1);
      expect(lostRangedCount).toBe(
        lossStepFacts === undefined ? -1 : lossStepFacts.rangedLoss,
      );
      expect(countObservedKind(lossStep, 'ranged-drone')).toBeLessThan(
        DENSE_WORKLOAD_MIN_RANGED,
      );
      // (3) The Ranged Drone that step ran with is the one the player destroyed:
      // it was live when the previous step ended, it is live at the START of the
      // loss step, and it is absent from the loss step's own post-step state.
      const rangedLiveBeforeLoss = beforeLoss.enemies
        .filter((enemy) => enemy.kind === 'ranged-drone')
        .map((enemy) => enemy.id);
      const lossStepPostIds = lossStep.enemies.map((enemy) => enemy.id);
      const destroyedRangedIds = rangedLiveBeforeLoss.filter(
        (id) => !lossStepPostIds.includes(id),
      );
      expect(destroyedRangedIds.length).toBeGreaterThanOrEqual(1);
      for (const id of destroyedRangedIds) {
        expect(lossStep.preStepEnemyIds).toContain(id);
      }
      // (4) The next executed step ran with the §11 minimum RESTORED, and the
      // destroyed enemy was never resurrected: the Ranged Drone it ran with is a
      // different enemy the setup spawned between the two steps.
      expect(afterLoss.preStepRangedCount).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_RANGED,
      );
      for (const id of destroyedRangedIds) {
        expect(afterLoss.preStepEnemyIds).not.toContain(id);
        expect(afterLoss.enemies.map((enemy) => enemy.id)).not.toContain(id);
      }
      expect(
        afterLoss.preStepEnemyIds.filter(
          (id) => !lossStep.preStepEnemyIds.includes(id),
        ).length,
      ).toBeGreaterThanOrEqual(1);
      // (5) The same window in the control route carries NO Ranged Drone at all, so
      // the restored one can only be the evidence-only setup's own top-up (the
      // ordinary Mission 03 pipeline never supplied it).
      expect(natural.facts.rangedMax).toBe(0);
      expect(natural.facts.preStepRangedMin).toBe(0);

      expect(dense.facts.maxConsecutiveSixCoreSteps).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_CONSECUTIVE_CORE_STEPS,
      );
      // A 60-step window carries AT MOST one authored launch (`30, 90, …, 330`
      // at a 60-step cadence), and this one is the sixth owner Core.
      expect(dense.facts.coreLaunchSteps).toEqual([BUCKET_START_STEP]);
      expect(dense.facts.coreLaunchSteps.length).toBeGreaterThanOrEqual(
        DENSE_WORKLOAD_MIN_BUCKET_CORE_LAUNCHES,
      );
      expect(dense.facts.bucketCoreIds).toHaveLength(
        DENSE_WORKLOAD_MIN_BUCKET_CORE_LAUNCHES,
      );
      // The window's provenance subset is a REAL subset: the Cores observed
      // before it are not credited to it (which is why the window check only
      // requires the one launch a 60-step window can contain).
      expect(dense.facts.coreIdsObserved).toHaveLength(
        DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE,
      );
      for (const id of dense.facts.bucketCoreIds) {
        expect(dense.facts.coreIdsObserved).toContain(id);
      }
      expect(dense.facts.sixCoreWithoutEliteSteps).toBe(0);
      expect(dense.facts.coreCadenceViolations).toBe(0);
      expect(dense.facts.coreLaunchCountExcess).toBe(0);
      expect(dense.facts.coreLifetimeViolations).toBe(0);
      expect(dense.facts.coreIdReuseViolations).toBe(0);
      expect(dense.qualification.failures).toEqual([]);
      expect(dense.qualification.qualified).toBe(true);
    },
    AGGREGATE_LOAD_TEST_TIMEOUT_MS,
  );
});

/**
 * The same authored cycle with the SIXTH owner Core held for half the authored
 * interval: it still lands inside the predeclared window, so the qualifier must
 * accept it. This is the no-false-positive counterpart of the "withheld Core"
 * mutation: the cadence rule is an observed UPPER BOUND, never an exact schedule
 * match, and the launch is recorded on its actual step.
 */
function heldSixthCoreSeries(): DenseWorkloadStepObservation[] {
  const heldLaunchStep =
    SYNTHETIC_BUCKET_START_STEP + HELD_SIXTH_CORE_DELAY_STEPS;
  const authoredSixthStep =
    SYNTHETIC_CORE_LAUNCH_STEPS[DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE - 1];
  const withoutSixthCore = (
    observation: DenseWorkloadStepObservation,
  ): DenseWorkloadStepObservation =>
    withoutProjectiles(observation, [SYNTHETIC_SIXTH_CORE_ID]);
  return syntheticSeries().map((observation) => {
    // The authored sixth launch is withheld entirely, so the step that would
    // have launched it reports no owner launch at all — the held launch below is
    // the ONLY Core the owner creates inside the window.
    const base =
      observation.missionStepCount === authoredSixthStep
        ? withOwnerCoreLaunchIds(observation, [])
        : observation;
    const heldSteps = observation.missionStepCount - heldLaunchStep;
    if (heldSteps < 0) {
      return withoutSixthCore(base);
    }
    // The held Core still expires after exactly its authored lifetime, so its
    // remaining steps decrease by one per executed step like every other Core.
    const remainingLifetimeSteps = ELITE_CORE_LIFETIME_STEPS - 1 - heldSteps;
    if (remainingLifetimeSteps < 1) {
      return withoutSixthCore(base);
    }
    const held = withInjectedCore(
      withoutSixthCore(base),
      SYNTHETIC_HELD_SIXTH_CORE_ID,
      remainingLifetimeSteps,
    );
    return withOwnerCoreLaunchIds(
      held,
      heldSteps === 0 ? [SYNTHETIC_HELD_SIXTH_CORE_ID] : [],
    );
  });
}

describe('V021-PATCH-STAB-01 C01 dense combined-stress qualifier (fail-sensitivity)', () => {
  it('qualifies the authored-cycle baseline series', () => {
    const qualification = qualifySeries(syntheticSeries());
    expect(qualification.checks).toHaveLength(20);
    expect(failedCheckNames(qualification)).toEqual([]);
    expect(qualification.qualified).toBe(true);
  });

  it('accepts an owner-Core launch that is HELD but still inside the window', () => {
    const steps = heldSixthCoreSeries();
    const facts = factsOfSeries(steps);
    expect(facts.coreLaunchSteps).toEqual([
      SYNTHETIC_BUCKET_START_STEP + HELD_SIXTH_CORE_DELAY_STEPS,
    ]);
    expect(facts.maxConsecutiveSixCoreSteps).toBeGreaterThanOrEqual(
      DENSE_WORKLOAD_MIN_CONSECUTIVE_CORE_STEPS,
    );
    expect(facts.coreLaunchCountExcess).toBe(0);
    expect(failedCheckNames(qualifyDenseWorkloadBucket(facts))).toEqual([]);
  });

  it('fails the activation check when nothing was recorded at all', () => {
    const names = failedCheckNames(qualifySeries([]));
    // Without an observed activation there is no predeclared window, so the
    // activation check is the first check that must fail and the window checks
    // must fail with it.
    expect(names[0]).toBe('elite-activation-observed');
    expect(names).toContain('bucket-executed-steps');
    expect(names).toContain('bucket-window-complete');
    expect(names).toContain('six-hunters-every-step');
  });

  it.each(MUTATION_CASES)(
    'fails exactly the intended checks when the series $title',
    ({ expectedFailures, mutate }) => {
      const qualification = qualifySeries(mutate(syntheticSeries()));
      expect(failedCheckNames(qualification)).toEqual(expectedFailures);
      expect(qualification.qualified).toBe(false);
    },
  );

  it('exercises every recorded check with at least one failing case', () => {
    // A check no case can fail would be dead weight in the C01 verdict, so the
    // union of every expected failure set must equal the complete check list.
    const failingNames = new Set<string>([
      ...MUTATION_CASES.flatMap(({ expectedFailures }) => expectedFailures),
      ...failedCheckNames(qualifySeries([])),
    ]);
    const allCheckNames = qualifySeries(syntheticSeries()).checks.map(
      (check) => check.name,
    );
    expect(allCheckNames).toHaveLength(20);
    expect([...failingNames].sort()).toEqual([...allCheckNames].sort());
  });
});
