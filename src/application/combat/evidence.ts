import {
  ELITE_ARMOURED_PHASE_STEPS,
  ELITE_CORE_FIRST_INTERVAL_STEPS,
  ELITE_CORE_INTERVAL_STEPS,
} from './enemies';
import type { EnemyType } from '@domain/index';

/**
 * V02-WI-04 C03/C04 two-pass performance evidence (Epic §20.1, V02-AC-028).
 *
 * Two independent compile-time capabilities are replaced by Vite:
 *
 * - `__SHMUP_EVIDENCE_SCENARIOS__` enables the evidence-only benchmark
 *   scenarios and the read-only workload-identity observer
 *   (`runBenchmarkScenario`, `spawnFiveBasic`, `readActiveByType`). It is
 *   `true` only in the scenario-bearing evidence builds.
 * - `__SHMUP_EVIDENCE_COUNTERS__` enables the read-only per-step workload
 *   counters (sink, accumulator, per-step maxima record). It is `true` only in
 *   the instrumented Pass A evidence build.
 *
 * C04: timing must come from uninstrumented production-optimized artifacts, so
 * the post-integration legacy proxy runs a build with scenarios ON and
 * counters OFF (`npm run build:evidence-uninstrumented`). In the ordinary
 * production build both flags are `false`: the entire evidence branch is dead
 * code and every evidence symbol below is eliminated, so instrumentation can
 * never leak into the shipped product, add Debug UI, mutate gameplay authority,
 * persist, mirror DOM entities, log remotely, or read a runtime query switch.
 *
 * Pass B is the ordinary uninstrumented production build; it owns all
 * frame-time / FPS / long-task / heap / cleanup / request / artifact timing.
 */
declare const __SHMUP_EVIDENCE_SCENARIOS__: boolean;
declare const __SHMUP_EVIDENCE_COUNTERS__: boolean;

/** Compile-time: `true` only in scenario-bearing evidence builds. */
export const EVIDENCE_SCENARIOS_ENABLED: boolean = __SHMUP_EVIDENCE_SCENARIOS__;
/** Compile-time: `true` only in the instrumented Pass A evidence build. */
export const EVIDENCE_COUNTERS_ENABLED: boolean = __SHMUP_EVIDENCE_COUNTERS__;
/** Compile-time: `true` only in evidence builds (either capability). */
export const EVIDENCE_MODE: boolean =
  __SHMUP_EVIDENCE_SCENARIOS__ || __SHMUP_EVIDENCE_COUNTERS__;
/**
 * V021-PATCH-STAB-01 C01 dense owner-work observation gate (Verification §11,
 * local-patch exception V021-AC-006).
 *
 * The dense combined-stress bucket is executed by the SAME canonical owners as
 * ordinary gameplay, so its per-executed-step work facts must be reported BY
 * those owners (the collision pass and the Elite attack step) instead of being
 * inferred from population counts. This flag keeps that reporting exactly where
 * the dense bucket itself can run:
 *
 * - `EVIDENCE_SCENARIOS_ENABLED` — the scenarios-gated build that owns the
 *   dense bucket's evidence-only setup (and the runtime method C02 consumes);
 * - `import.meta.env.DEV` — development and the unit-test build, where the
 *   dense bucket's real-pipeline regression executes Mission 03. Vite replaces
 *   it with the constant `false` in every production build, so the gate folds
 *   to `false` and the whole branch is dead code.
 *
 * The ordinary production artifact therefore carries no dense owner-work symbol
 * at all, and the Pass A counter capability is unaffected: the same owners keep
 * reporting their existing counters through `EVIDENCE_COUNTERS_ENABLED` on
 * exactly the same steps.
 */
export const DENSE_WORKLOAD_OWNER_WORK_ENABLED: boolean =
  EVIDENCE_SCENARIOS_ENABLED || import.meta.env.DEV;

/** Actual collision candidate / intersection totals for one executed fixed
 *  step, reported by the canonical collision owner. */
export interface CollisionWorkTotals {
  readonly playerProjectileCandidates: number;
  readonly playerProjectileIntersections: number;
  readonly enemyProjectileCandidates: number;
  readonly enemyProjectileIntersections: number;
  readonly contactCandidates: number;
  readonly contactIntersections: number;
}

/** Structural subset of the authoritative enemy state the Elite workload
 *  counters observe. The full `CombatEnemy` union is structurally assignable;
 *  this subset exists so the evidence module never imports the simulation. */
export interface CombatEvidenceEnemy {
  readonly id: number;
  readonly type: EnemyType;
  readonly kind: 'basic' | 'ranged' | 'hunter' | 'elite';
  readonly activated: boolean;
  readonly centerX: number;
  readonly centerY: number;
  /** Present on the Elite (`entering` before activation) and on the Hunter
   *  (`entering`/`approach`/`committed`); the Elite workload observer reads its
   *  own phase through `toElitePhaseName`. */
  readonly phase?:
    'entering' | 'armoured' | 'vulnerable' | 'approach' | 'committed';
}

/** Structural subset of the authoritative enemy projectile state the Elite
 *  workload counters observe. `velocityX` is the fixed Elite cannon direction:
 *  the left `−6°` cannon is negative and the right `+6°` cannon positive, so the
 *  two cannon streams are identified from authoritative runtime data and never
 *  from a second authored source. */
export interface CombatEvidenceEnemyProjectile {
  readonly id: number;
  readonly kind: 'ranged' | 'elite-cannon' | 'elite-core';
  readonly velocityX?: number;
}

/** Observed phase name of the one authored Elite. */
export type ElitePhaseName = 'entering' | 'armoured' | 'vulnerable';

/**
 * V02-WI-06 E04-C02 Elite workload identity facts observed by the Pass A
 * counters (Epic §9.4, §20.1; V02-AC-009–010, V02-AC-028). Every field is
 * observed at runtime from the authoritative state on each executed fixed step
 * — never inferred from authored constants, content values, or summary
 * booleans. The whole record is compile-time absent from every build without
 * the counters capability.
 */
export interface EliteWorkloadCounters {
  /** Executed steps on which a previously unseen Elite instance appeared. */
  readonly eliteCreationSteps: number;
  /**
   * The mission fixed-step count observed on the step the first Elite instance
   * appeared (Mission 03's authored Elite is created at step `19200`, i.e. the
   * `05:20` final arrival). `0` when no Elite was observed.
   */
  readonly eliteCreationMissionStep: number;
  /** Executed steps with exactly one activated Elite. */
  readonly activeEliteSteps: number;
  /** Executed steps with an Elite present and still `entering`. */
  readonly eliteEntrySteps: number;
  /** Executed steps carrying more than one Elite (must stay `0`). */
  readonly elitePresenceViolationSteps: number;
  /** Executed steps whose activated Elite centre equals the authored anchor. */
  readonly anchorSteps: number;
  /** Executed steps observed in each active phase. */
  readonly armouredSteps: number;
  readonly vulnerableSteps: number;
  /** Activated-Elite steps with at least one active player projectile. */
  readonly eliteWorkloadPlayerFireSteps: number;
  /** Phase names in first-observed order (`['armoured','vulnerable',…]`). */
  readonly phaseOrder: readonly ElitePhaseName[];
  /** Executed fixed-step length of every COMPLETED phase, in order. */
  readonly phaseDurations: readonly number[];
  /** Distinct observed cannon projectiles per stream, and both together. */
  readonly leftCannonProjectilesObserved: number;
  readonly rightCannonProjectilesObserved: number;
  /** Simultaneous Elite cannon projectiles (both streams together). */
  readonly eliteCannonProjectilesMax: number;
  /** Steps where at least one projectile of EACH cannon stream was active. */
  readonly cannonPairSteps: number;
  /** Distinct observed homing Cores and the simultaneous active maximum. */
  readonly homingCoresObserved: number;
  readonly maxActiveHomingCores: number;
  readonly homingCoreActiveSteps: number;
}

/** Read-only per-step sink the collision owner reports its observed work into
 *  (evidence build only; the simulation owns one fresh sink per step). */
export interface CollisionEvidenceSink {
  addPlayerProjectileCandidates(count: number): void;
  addPlayerProjectileIntersections(count: number): void;
  addEnemyProjectileCandidates(count: number): void;
  addEnemyProjectileIntersections(count: number): void;
  addContactCandidates(count: number): void;
  addContactIntersections(count: number): void;
  totals(): CollisionWorkTotals;
}

export function createCollisionEvidenceSink(): CollisionEvidenceSink {
  let playerProjectileCandidates = 0;
  let playerProjectileIntersections = 0;
  let enemyProjectileCandidates = 0;
  let enemyProjectileIntersections = 0;
  let contactCandidates = 0;
  let contactIntersections = 0;
  return {
    addPlayerProjectileCandidates(count: number): void {
      playerProjectileCandidates += count;
    },
    addPlayerProjectileIntersections(count: number): void {
      playerProjectileIntersections += count;
    },
    addEnemyProjectileCandidates(count: number): void {
      enemyProjectileCandidates += count;
    },
    addEnemyProjectileIntersections(count: number): void {
      enemyProjectileIntersections += count;
    },
    addContactCandidates(count: number): void {
      contactCandidates += count;
    },
    addContactIntersections(count: number): void {
      contactIntersections += count;
    },
    totals(): CollisionWorkTotals {
      return {
        playerProjectileCandidates,
        playerProjectileIntersections,
        enemyProjectileCandidates,
        enemyProjectileIntersections,
        contactCandidates,
        contactIntersections,
      };
    },
  };
}

/** Observed per-step maxima across the run (evidence build only). Every field
 *  is observed at runtime by the simulation — never authored arithmetic. */
export interface CombatEvidenceRecord {
  /** The mission seed the observed run used (canonical seed recorded truthfully). */
  readonly missionSeed: number;
  readonly activeEnemiesByRoleMax: Readonly<Record<EnemyType, number>>;
  readonly activePlayerProjectilesMax: number;
  readonly activeEnemyProjectilesMax: number;
  readonly collisionWorkMax: CollisionWorkTotals;
  /**
   * Executed fixed steps whose active mix reached the approved regular
   * workload target (`3 Basic + 1 Ranged + 1 Hunter` concurrently, Epic
   * §20.1). Proves the authored workload was actually reached at runtime
   * rather than assumed from content.
   */
  readonly workloadReachedSteps: number;
  /**
   * V02-WI-04 C04 exact simultaneous-state proof: executed fixed steps whose
   * active mix is EXACTLY `3 Basic + 1 Ranged + 1 Hunter + 0 Elite` with no
   * lingering earlier enemy. Maxima collected across different steps cannot
   * prove the exact workload was sampled; this counter can.
   */
  readonly exactRegularWorkloadSteps: number;
  /**
   * V02-WI-06 E04-C02 Elite workload identity facts (Epic §9.4, §20.1;
   * V02-AC-009–010, V02-AC-028): observed phase order/completed durations,
   * activation/anchor, continuous player fire, both cannon streams, Core
   * creation/activity and the simultaneous active Core maximum. All-zero when
   * the observed run contained no Elite.
   */
  readonly eliteWorkload: EliteWorkloadCounters;
  /** Executed fixed steps covered by the record. */
  readonly steps: number;
}

/** Holds the run's observed per-step maxima. Owned by the simulation state
 *  (created only in the evidence build) and never mutated by presentation. */
export interface CombatEvidenceAccumulator {
  readonly record: () => CombatEvidenceRecord;
  readonly recordStep: (
    enemies: readonly CombatEvidenceEnemy[],
    playerProjectileCount: number,
    enemyProjectiles: readonly CombatEvidenceEnemyProjectile[],
    /** The authored Elite anchor centre for the CURRENT viewport. */
    eliteAnchor: { readonly centerX: number; readonly centerY: number },
    /** The authoritative mission fixed-step count of this executed step. */
    missionStepCount: number,
    sink: CollisionEvidenceSink,
  ) => void;
}

export function createCombatEvidenceAccumulator(
  missionSeed: number,
): CombatEvidenceAccumulator {
  const state: {
    activeEnemiesByRoleMax: Record<EnemyType, number>;
    activePlayerProjectilesMax: number;
    activeEnemyProjectilesMax: number;
    collisionWorkMax: {
      playerProjectileCandidates: number;
      playerProjectileIntersections: number;
      enemyProjectileCandidates: number;
      enemyProjectileIntersections: number;
      contactCandidates: number;
      contactIntersections: number;
    };
    workloadReachedSteps: number;
    exactRegularWorkloadSteps: number;
    steps: number;
    eliteWorkload: EliteWorkloadCounterState;
  } = {
    activeEnemiesByRoleMax: {
      'basic-drone': 0,
      'ranged-drone': 0,
      'hunter-drone': 0,
      'elite-drone': 0,
    },
    activePlayerProjectilesMax: 0,
    activeEnemyProjectilesMax: 0,
    collisionWorkMax: {
      playerProjectileCandidates: 0,
      playerProjectileIntersections: 0,
      enemyProjectileCandidates: 0,
      enemyProjectileIntersections: 0,
      contactCandidates: 0,
      contactIntersections: 0,
    },
    workloadReachedSteps: 0,
    exactRegularWorkloadSteps: 0,
    steps: 0,
    eliteWorkload: {
      eliteCreationSteps: 0,
      eliteCreationMissionStep: 0,
      activeEliteSteps: 0,
      eliteEntrySteps: 0,
      elitePresenceViolationSteps: 0,
      anchorSteps: 0,
      armouredSteps: 0,
      vulnerableSteps: 0,
      eliteWorkloadPlayerFireSteps: 0,
      phaseOrder: [],
      phaseDurations: [],
      leftCannonProjectilesObserved: new Set<number>(),
      rightCannonProjectilesObserved: new Set<number>(),
      eliteCannonProjectilesMax: 0,
      cannonPairSteps: 0,
      homingCoresObserved: new Set<number>(),
      maxActiveHomingCores: 0,
      homingCoreActiveSteps: 0,
      seenEliteIds: new Set<number>(),
      currentPhase: null,
      currentPhaseSteps: 0,
    },
  };
  return {
    record: (): CombatEvidenceRecord => ({
      missionSeed,
      activeEnemiesByRoleMax: { ...state.activeEnemiesByRoleMax },
      activePlayerProjectilesMax: state.activePlayerProjectilesMax,
      activeEnemyProjectilesMax: state.activeEnemyProjectilesMax,
      collisionWorkMax: { ...state.collisionWorkMax },
      workloadReachedSteps: state.workloadReachedSteps,
      exactRegularWorkloadSteps: state.exactRegularWorkloadSteps,
      eliteWorkload: {
        eliteCreationSteps: state.eliteWorkload.eliteCreationSteps,
        eliteCreationMissionStep: state.eliteWorkload.eliteCreationMissionStep,
        activeEliteSteps: state.eliteWorkload.activeEliteSteps,
        eliteEntrySteps: state.eliteWorkload.eliteEntrySteps,
        elitePresenceViolationSteps:
          state.eliteWorkload.elitePresenceViolationSteps,
        anchorSteps: state.eliteWorkload.anchorSteps,
        armouredSteps: state.eliteWorkload.armouredSteps,
        vulnerableSteps: state.eliteWorkload.vulnerableSteps,
        eliteWorkloadPlayerFireSteps:
          state.eliteWorkload.eliteWorkloadPlayerFireSteps,
        phaseOrder: [...state.eliteWorkload.phaseOrder],
        phaseDurations: [...state.eliteWorkload.phaseDurations],
        leftCannonProjectilesObserved:
          state.eliteWorkload.leftCannonProjectilesObserved.size,
        rightCannonProjectilesObserved:
          state.eliteWorkload.rightCannonProjectilesObserved.size,
        eliteCannonProjectilesMax:
          state.eliteWorkload.eliteCannonProjectilesMax,
        cannonPairSteps: state.eliteWorkload.cannonPairSteps,
        homingCoresObserved: state.eliteWorkload.homingCoresObserved.size,
        maxActiveHomingCores: state.eliteWorkload.maxActiveHomingCores,
        homingCoreActiveSteps: state.eliteWorkload.homingCoreActiveSteps,
      },
      steps: state.steps,
    }),
    recordStep(
      enemies,
      playerProjectileCount,
      enemyProjectiles,
      eliteAnchor,
      missionStepCount,
      sink,
    ) {
      state.steps += 1;
      const roleCounts: Record<EnemyType, number> = {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      };
      for (const enemy of enemies) {
        roleCounts[enemy.type] += 1;
      }
      for (const type of [
        'basic-drone',
        'ranged-drone',
        'hunter-drone',
        'elite-drone',
      ] as const) {
        state.activeEnemiesByRoleMax[type] = Math.max(
          state.activeEnemiesByRoleMax[type],
          roleCounts[type],
        );
      }
      // Approved regular workload reach proof (Epic §20.1): the step reached
      // `3 Basic + 1 Ranged + 1 Hunter` concurrently.
      if (
        roleCounts['basic-drone'] >= 3 &&
        roleCounts['ranged-drone'] >= 1 &&
        roleCounts['hunter-drone'] >= 1
      ) {
        state.workloadReachedSteps += 1;
      }
      // V02-WI-04 C04 exact simultaneous-state proof: the step's active mix is
      // EXACTLY 3 Basic + 1 Ranged + 1 Hunter + 0 Elite — no lingering earlier
      // enemy (an extra Basic/Ranged/Hunter/Elite would break the equality).
      if (
        roleCounts['basic-drone'] === 3 &&
        roleCounts['ranged-drone'] === 1 &&
        roleCounts['hunter-drone'] === 1 &&
        roleCounts['elite-drone'] === 0
      ) {
        state.exactRegularWorkloadSteps += 1;
      }
      state.activePlayerProjectilesMax = Math.max(
        state.activePlayerProjectilesMax,
        playerProjectileCount,
      );
      state.activeEnemyProjectilesMax = Math.max(
        state.activeEnemyProjectilesMax,
        enemyProjectiles.length,
      );
      recordEliteWorkloadStep(state.eliteWorkload, {
        enemies,
        playerProjectileCount,
        enemyProjectiles,
        eliteAnchor,
        missionStepCount,
      });
      const totals = sink.totals();
      state.collisionWorkMax.playerProjectileCandidates = Math.max(
        state.collisionWorkMax.playerProjectileCandidates,
        totals.playerProjectileCandidates,
      );
      state.collisionWorkMax.playerProjectileIntersections = Math.max(
        state.collisionWorkMax.playerProjectileIntersections,
        totals.playerProjectileIntersections,
      );
      state.collisionWorkMax.enemyProjectileCandidates = Math.max(
        state.collisionWorkMax.enemyProjectileCandidates,
        totals.enemyProjectileCandidates,
      );
      state.collisionWorkMax.enemyProjectileIntersections = Math.max(
        state.collisionWorkMax.enemyProjectileIntersections,
        totals.enemyProjectileIntersections,
      );
      state.collisionWorkMax.contactCandidates = Math.max(
        state.collisionWorkMax.contactCandidates,
        totals.contactCandidates,
      );
      state.collisionWorkMax.contactIntersections = Math.max(
        state.collisionWorkMax.contactIntersections,
        totals.contactIntersections,
      );
    },
  };
}

/** Mutable per-run Elite workload counter state (counters capability only). */
interface EliteWorkloadCounterState {
  eliteCreationSteps: number;
  eliteCreationMissionStep: number;
  activeEliteSteps: number;
  eliteEntrySteps: number;
  elitePresenceViolationSteps: number;
  anchorSteps: number;
  armouredSteps: number;
  vulnerableSteps: number;
  eliteWorkloadPlayerFireSteps: number;
  phaseOrder: ElitePhaseName[];
  phaseDurations: number[];
  leftCannonProjectilesObserved: Set<number>;
  rightCannonProjectilesObserved: Set<number>;
  eliteCannonProjectilesMax: number;
  cannonPairSteps: number;
  homingCoresObserved: Set<number>;
  maxActiveHomingCores: number;
  homingCoreActiveSteps: number;
  seenEliteIds: Set<number>;
  currentPhase: 'armoured' | 'vulnerable' | null;
  currentPhaseSteps: number;
}

/** One executed fixed step of Elite workload observations. */
interface EliteWorkloadStepObservation {
  readonly enemies: readonly CombatEvidenceEnemy[];
  readonly playerProjectileCount: number;
  readonly enemyProjectiles: readonly CombatEvidenceEnemyProjectile[];
  readonly eliteAnchor: { readonly centerX: number; readonly centerY: number };
  /** The authoritative mission fixed-step count of this executed step. */
  readonly missionStepCount: number;
}

/**
 * Observes one executed fixed step of the one authored Elite (Epic §9.4,
 * §20.1). Every fact is read from the authoritative post-collision state: the
 * observed phase sequence/completed durations, the activation/anchor step, the
 * two cannon streams (identified from the authoritative fixed `velocityX`
 * sign), homing Core creation/activity, and whether player fire was continuous
 * while the Elite was active. Called only from the compile-time counters gate.
 */
function recordEliteWorkloadStep(
  state: EliteWorkloadCounterState,
  step: EliteWorkloadStepObservation,
): void {
  const elites = step.enemies.filter((enemy) => enemy.kind === 'elite');
  if (elites.length > 1) {
    state.elitePresenceViolationSteps += 1;
  }
  for (const elite of elites) {
    if (!state.seenEliteIds.has(elite.id)) {
      state.seenEliteIds.add(elite.id);
      state.eliteCreationSteps += 1;
      state.eliteCreationMissionStep = step.missionStepCount;
    }
    if (!elite.activated) {
      state.eliteEntrySteps += 1;
      continue;
    }
    state.activeEliteSteps += 1;
    if (
      elite.centerX === step.eliteAnchor.centerX &&
      elite.centerY === step.eliteAnchor.centerY
    ) {
      state.anchorSteps += 1;
    }
    const phase = elite.phase === 'vulnerable' ? 'vulnerable' : 'armoured';
    if (state.currentPhase === null) {
      state.currentPhase = phase;
      state.phaseOrder.push(phase);
    } else if (state.currentPhase !== phase) {
      state.phaseDurations.push(state.currentPhaseSteps);
      state.currentPhase = phase;
      state.currentPhaseSteps = 0;
      state.phaseOrder.push(phase);
    }
    state.currentPhaseSteps += 1;
    if (phase === 'armoured') {
      state.armouredSteps += 1;
    } else {
      state.vulnerableSteps += 1;
    }
    if (step.playerProjectileCount >= 1) {
      state.eliteWorkloadPlayerFireSteps += 1;
    }
  }
  let leftCannon = 0;
  let rightCannon = 0;
  let cores = 0;
  for (const projectile of step.enemyProjectiles) {
    if (projectile.kind === 'elite-cannon') {
      if ((projectile.velocityX ?? 0) < 0) {
        leftCannon += 1;
        state.leftCannonProjectilesObserved.add(projectile.id);
      } else {
        rightCannon += 1;
        state.rightCannonProjectilesObserved.add(projectile.id);
      }
      continue;
    }
    if (projectile.kind === 'elite-core') {
      cores += 1;
      state.homingCoresObserved.add(projectile.id);
    }
  }
  state.eliteCannonProjectilesMax = Math.max(
    state.eliteCannonProjectilesMax,
    leftCannon + rightCannon,
  );
  if (leftCannon > 0 && rightCannon > 0) {
    state.cannonPairSteps += 1;
  }
  state.maxActiveHomingCores = Math.max(state.maxActiveHomingCores, cores);
  if (cores > 0) {
    state.homingCoreActiveSteps += 1;
  }
}

/**
 * V02-WI-06 E04-C02 read-only Elite workload identity observation (Epic §9.4,
 * §20.1; V02-AC-009–010, V02-AC-028). It reports the CURRENT authoritative
 * state only — never cumulative maxima, never timing — so the uninstrumented
 * timing artifact can prove the exact Elite workload without any Pass A
 * counter being compiled in. The observation is built inline inside the
 * compile-time scenarios gate in the Combat presentation entry (the same
 * pattern as the legacy five-Basic identity observer), so neither this type nor
 * any of its field names can reach the ordinary production artifact.
 */
export interface EliteWorkloadObservation {
  /** Derived canonical mission seed of the observed Combat instance. */
  readonly missionSeed: number;
  /** Number of Elite enemies currently active (`0` or `1`). */
  readonly eliteCount: number;
  readonly eliteActivated: boolean;
  readonly elitePhase: ElitePhaseName | null;
  readonly elitePhaseStepsElapsed: number;
  /** The activated Elite centre sits exactly on the authored anchor row. */
  readonly eliteAnchorRowAligned: boolean;
  /** Currently active Elite cannon projectiles per authoritative stream. */
  readonly activeCannonLeft: number;
  readonly activeCannonRight: number;
  readonly activeHomingCores: number;
  readonly activePlayerProjectiles: number;
  readonly playerHullIntegrity: number;
}

/** The approved read-only evidence surface exposed ONLY by the instrumented
 *  Pass A evidence build to the evidence runner. `read()` returns the observed
 *  per-step maxima (counters gate); `runBenchmarkScenario` materialises an
 *  evidence-only benchmark scenario through the authoritative deterministic
 *  transform (scenarios gate; Epic §20.1, delta 8/2). All members are
 *  compile-time absent from the ordinary production artifact. */
export interface CombatEvidenceWindow {
  readonly read: () => CombatEvidenceRecord | null;
  /** Approved evidence-only benchmark scenarios: the legacy v0.1 five-Basic
   *  group, the authored Mission 01 `e5` Encounter, and the authored Mission 03
   *  Elite workload preparation (Epic §20.1). */
  readonly runBenchmarkScenario: (
    scenario: 'legacy-five-basic' | 'm01-e5' | 'm03-e8',
  ) => void;
}

/** V02-WI-04 C04 read-only workload-identity observer (scenarios gate only, so
 *  it is available in the UNINSTRUMENTED timing builds as well as Pass A).
 *  `readActiveByType` reads the CURRENT active enemy mix (never cumulative
 *  maxima or timing); it exists so both legacy proxy sides can prove exactly
 *  five Basic + zero other enemies concurrently without any timing
 *  instrumentation. */
export interface LegacyBenchmarkIdentityWindow {
  readonly spawnFiveBasic: () => void;
  readonly readActiveByType: () => Readonly<Record<EnemyType, number>>;
}

/** V02-WI-06 E04-C02 read-only Elite workload identity observer (scenarios gate
 *  only): the uninstrumented timing build reads the CURRENT Elite workload facts
 *  per probe so the 6 s timing sample can prove the exact Elite workload across
 *  the Armoured→Vulnerable interval and the permitted Core cap without any Pass
 *  A counter. It never mutates, spawns, or times anything. */
export interface EliteWorkloadIdentityWindow {
  readonly readEliteWorkload: () => EliteWorkloadObservation;
}

/**
 * V021-PATCH-STAB-01 C01 evidence-only dense combined-stress contract
 * (Verification §11 local-patch exception, V021-AC-006).
 *
 * §11 permits the C02 evidence run to build a conservative combined stress
 * state through a bounded evidence-only setup, but the facts must be observed
 * from the real simulation and the setup must be absent from the ordinary
 * artifact. This section owns the read-only, source-independent half of that
 * setup:
 *
 * - the predeclared bucket geometry (`denseWorkloadBucketStartStep`), derived
 *   from the AUTHORED Elite phase/Core constants only, so the window can never
 *   be fitted to an observed result;
 * - the raw per-executed-step observation vocabulary (`DenseWorkload*`);
 * - the pure recorder (`createDenseWorkloadAccumulator`) that turns those
 *   observations into observed facts and refuses stale, injected, or inferred
 *   values (Core launch cadence/provenance and lifetime progression, Elite
 *   presence/hull monotonicity, executed-step continuity);
 * - the pure qualifier (`qualifyDenseWorkloadBucket`) that decides the verdict
 *   from those facts.
 *
 * Nothing here imports the simulation, reads presentation state, or mutates
 * gameplay: the recorder is fed by the authoritative post-step state and the
 * qualifier is a pure function of the recorded facts.
 */

/** The deterministic dense workload bucket length (§11): 60 executed steps. */
export const DENSE_WORKLOAD_BUCKET_STEPS = 60;
/** §11 minimum executed steps the bucket must actually contain. */
export const DENSE_WORKLOAD_MIN_EXECUTED_STEPS = 50;
/** §11 combined stress population: six Hunters at every bucket step. */
export const DENSE_WORKLOAD_MIN_HUNTERS = 6;
/** §11 combined stress population: at least one Ranged enemy at every step. */
export const DENSE_WORKLOAD_MIN_RANGED = 1;
/** The six sequential Cores one Vulnerable phase launches (§3.1). */
export const DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE = 6;
/** §11 minimum consecutive executed steps of six simultaneous owner Cores. */
export const DENSE_WORKLOAD_MIN_CONSECUTIVE_CORE_STEPS = 20;
/**
 * §11 minimum owner-Core launches the `60`-step bucket WINDOW itself must
 * contain. The authored Vulnerable cadence is `30, 90, 150, 210, 270, 330`
 * executed steps (`ELITE_CORE_INTERVAL_STEPS = 60`), so any inclusive
 * `60`-step window can contain AT MOST one launch: asserting the phase-level
 * requirement of six launches inside the window would be unsatisfiable by
 * construction. One in-window launch proves the recorded cadence machinery is
 * exercised by a real owner launch, while the six simultaneous Cores are proven
 * independently by `six-cores-concurrent-run` and `core-owner-provenance`.
 */
export const DENSE_WORKLOAD_MIN_BUCKET_CORE_LAUNCHES = 1;

/**
 * The predeclared bucket start: the executed step that carries the SIXTH
 * sequential Vulnerable Core, derived ONLY from the authored Elite phase/Core
 * constants — `activation + 12 s (Armoured) + 0.5 s (first Core) + 5 × 1.0 s`.
 * The diagnostic measured activation `19320` ⇒ bucket start `20370`; that
 * value is recorded as an observation, never used to define the rule.
 */
export function denseWorkloadBucketStartStep(
  eliteActivationStep: number,
): number {
  return (
    eliteActivationStep +
    ELITE_ARMOURED_PHASE_STEPS +
    ELITE_CORE_FIRST_INTERVAL_STEPS +
    (DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE - 1) * ELITE_CORE_INTERVAL_STEPS
  );
}

/**
 * Authored number of Cores a Vulnerable phase has launched by `elapsed`
 * executed steps of that phase (`30, 90, 150, 210, 270, 330` — `enemies.ts`).
 * A launch held at the permitted active-Core cap can only make the OBSERVED
 * count smaller, so this is a hard upper bound: an injected Core raises the
 * observed count above it on the very step it appears.
 */
export function denseWorkloadExpectedCoreLaunches(
  phaseElapsed: number,
): number {
  if (phaseElapsed < ELITE_CORE_FIRST_INTERVAL_STEPS) {
    return 0;
  }
  return (
    1 +
    Math.floor(
      (phaseElapsed - ELITE_CORE_FIRST_INTERVAL_STEPS) /
        ELITE_CORE_INTERVAL_STEPS,
    )
  );
}

/** One live enemy as the C01 dense recorder observes it in the authoritative
 *  post-step state. Deliberately a structural subset: `evidence.ts` never
 *  imports the simulation (`CombatEnemy` is structurally assignable). */
export interface DenseWorkloadEnemyObservation {
  readonly id: number;
  readonly kind: EnemyType;
  readonly activated: boolean;
  readonly hullIntegrity: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Present on the Elite (`entering` before activation) and on the Hunter. */
  readonly phase?:
    'entering' | 'armoured' | 'vulnerable' | 'approach' | 'committed';
  /** Present on the Elite: elapsed fixed steps inside its current phase. */
  readonly elitePhaseStepsElapsed?: number;
}

/** One live enemy projectile in the authoritative post-step state. */
export interface DenseWorkloadProjectileObservation {
  readonly id: number;
  readonly kind: string;
  /**
   * Remaining executed steps of the projectile's authored lifetime. Only the
   * Elite Homing Core owns an authored lifetime; a projectile kind that does not
   * carries the explicit `-1` sentinel and is deliberately excluded from the
   * lifetime-progression proof (`trackDenseWorkloadCores` reads this field for
   * `elite-core` only).
   */
  readonly remainingLifetimeSteps: number;
}

/** One destruction shatter CREATED on this executed step (`ageSteps === 0`). */
export interface DenseWorkloadShatterObservation {
  readonly enemyId: number;
  readonly variant: 'regular' | 'elite';
  readonly size: number;
}

/**
 * The OWNER-REPORTED work of ONE executed step (§11 "actual raw per-step work
 * facts"). Every value is produced by the canonical owner that performed the
 * work — never inferred from population counts:
 *
 * - the player-projectile→enemy collision pass reports the candidate pairs it
 *   actually ENUMERATED and the pairs that actually overlapped;
 * - that same pass reports the enemy ids its own lethal hit removed on this step
 *   (the destruction event behind every projectile-lethal `ageSteps === 0`
 *   shatter);
 * - the Aircraft-contact pass reports the pairs it enumerated/overlapped and the
 *   enemy ids IT destroyed (the Hunter kamikaze destruction, which owns its own
 *   shatter record);
 * - the Elite attack step reports the Homing Core ids it created on this step.
 */
export interface DenseWorkloadStepWork {
  /** The executed step this record belongs to. */
  readonly step: number;
  /** Candidate pairs the player-projectile collision owner enumerated. */
  readonly playerProjectileCandidates: number;
  /** Enumerated player-projectile candidates that actually overlapped. */
  readonly playerProjectileIntersections: number;
  /** Enemy ids the player-projectile collision owner removed with a lethal hit. */
  readonly playerProjectileLethalEnemyIds: readonly number[];
  /** Candidate (enemy) pairs the Aircraft-contact owner enumerated this step. */
  readonly contactCandidates: number;
  /** Enumerated contact candidates that actually overlapped this step. */
  readonly contactIntersections: number;
  /** Enemy ids the Aircraft-contact owner destroyed (Hunter kamikaze). */
  readonly contactLethalEnemyIds: readonly number[];
  /** Homing Core ids the Elite attack step created on this executed step. */
  readonly ownerCoreLaunchIds: readonly number[];
}

/**
 * The per-executed-step sink the canonical owners report their OWN work into.
 * Implemented by the dense bucket's recorder
 * (`createDenseWorkloadOwnerWorkRecorder`); an owner that was not handed a sink
 * reports nothing.
 */
export interface DenseWorkloadOwnerWorkSink {
  readonly observePlayerProjectileCandidates: (count: number) => void;
  readonly observePlayerProjectileIntersections: (count: number) => void;
  readonly observePlayerProjectileLethalEnemyIds: (
    ids: readonly number[],
  ) => void;
  readonly observeContactCandidates: (count: number) => void;
  readonly observeContactIntersections: (count: number) => void;
  readonly observeContactLethalEnemyIds: (ids: readonly number[]) => void;
  readonly observeOwnerCoreLaunchIds: (ids: readonly number[]) => void;
}

/**
 * The dense bucket's ONE owner-work recorder. The executed-step driver frames
 * every step (`beginStep` before the step, `completeStep` after it), the owners
 * report into the frame while the step runs, and `lastStepWork` returns the
 * sealed record of the step just executed. A frame that does not begin, hold or
 * complete exactly one consecutive executed step — an unsealed frame, a rewound
 * or replayed step, or a step executed with no frame open — is counted as a
 * framing violation, so a skipped, duplicated or mis-aligned frame can never be
 * mistaken for owner evidence.
 */
export interface DenseWorkloadOwnerWorkRecorder extends DenseWorkloadOwnerWorkSink {
  readonly beginStep: (preStepMissionStepCount: number) => void;
  readonly completeStep: (postStepMissionStepCount: number) => void;
  readonly lastStepWork: () => DenseWorkloadStepWork | null;
  /** Frames that did not frame exactly one consecutive executed step. */
  readonly framingViolationSteps: () => number;
}

/** Mutable frame of ONE executed step (private to the recorder). */
interface DenseWorkloadOwnerWorkFrame {
  step: number;
  playerProjectileCandidates: number;
  playerProjectileIntersections: number;
  playerProjectileLethalEnemyIds: number[];
  contactCandidates: number;
  contactIntersections: number;
  contactLethalEnemyIds: number[];
  ownerCoreLaunchIds: number[];
}

export function createDenseWorkloadOwnerWorkRecorder(): DenseWorkloadOwnerWorkRecorder {
  let frame: DenseWorkloadOwnerWorkFrame | null = null;
  let lastStepWork: DenseWorkloadStepWork | null = null;
  let framedStep = -1;
  let framingViolationSteps = 0;
  const seal = (
    frameToSeal: DenseWorkloadOwnerWorkFrame,
    step: number,
  ): DenseWorkloadStepWork => ({
    step,
    playerProjectileCandidates: frameToSeal.playerProjectileCandidates,
    playerProjectileIntersections: frameToSeal.playerProjectileIntersections,
    playerProjectileLethalEnemyIds: [
      ...frameToSeal.playerProjectileLethalEnemyIds,
    ],
    contactCandidates: frameToSeal.contactCandidates,
    contactIntersections: frameToSeal.contactIntersections,
    contactLethalEnemyIds: [...frameToSeal.contactLethalEnemyIds],
    ownerCoreLaunchIds: [...frameToSeal.ownerCoreLaunchIds],
  });
  return {
    beginStep: (preStepMissionStepCount: number): void => {
      // The armed recorder frames EVERY executed step from its first frame on,
      // so a frame must start exactly at the step after the last SEALED one
      // (`preStepMissionStepCount === framedStep`, the previous completion's own
      // post-step count). An unsealed frame still open, a rewound/replayed step,
      // or a gap left by a step that was executed without a frame is a framing
      // violation: the first frame of a run has no predecessor and is accepted
      // as-is, but its own completion is still bound below.
      if (
        frame !== null ||
        (framedStep >= 0 && preStepMissionStepCount !== framedStep)
      ) {
        framingViolationSteps += 1;
      }
      frame = {
        step: preStepMissionStepCount,
        playerProjectileCandidates: 0,
        playerProjectileIntersections: 0,
        playerProjectileLethalEnemyIds: [],
        contactCandidates: 0,
        contactIntersections: 0,
        contactLethalEnemyIds: [],
        ownerCoreLaunchIds: [],
      };
    },
    completeStep: (postStepMissionStepCount: number): void => {
      const framed = frame;
      frame = null;
      if (
        framed === null ||
        postStepMissionStepCount !== framed.step + 1 ||
        postStepMissionStepCount <= framedStep
      ) {
        framingViolationSteps += 1;
        lastStepWork = null;
        framedStep = postStepMissionStepCount;
        return;
      }
      lastStepWork = seal(framed, postStepMissionStepCount);
      framedStep = postStepMissionStepCount;
    },
    observePlayerProjectileCandidates: (count: number): void => {
      if (frame !== null) {
        frame.playerProjectileCandidates += count;
      }
    },
    observePlayerProjectileIntersections: (count: number): void => {
      if (frame !== null) {
        frame.playerProjectileIntersections += count;
      }
    },
    observePlayerProjectileLethalEnemyIds: (ids: readonly number[]): void => {
      if (frame !== null) {
        frame.playerProjectileLethalEnemyIds.push(...ids);
      }
    },
    observeContactCandidates: (count: number): void => {
      if (frame !== null) {
        frame.contactCandidates += count;
      }
    },
    observeContactIntersections: (count: number): void => {
      if (frame !== null) {
        frame.contactIntersections += count;
      }
    },
    observeContactLethalEnemyIds: (ids: readonly number[]): void => {
      if (frame !== null) {
        frame.contactLethalEnemyIds.push(...ids);
      }
    },
    observeOwnerCoreLaunchIds: (ids: readonly number[]): void => {
      if (frame !== null) {
        frame.ownerCoreLaunchIds.push(...ids);
      }
    },
    lastStepWork: (): DenseWorkloadStepWork | null => lastStepWork,
    framingViolationSteps: (): number => framingViolationSteps,
  };
}

/** The complete raw observation of ONE executed fixed step (C01 read-only raw
 *  per-executed-step facts). Every value comes from the authoritative state. */
export interface DenseWorkloadStepObservation {
  readonly missionStepCount: number;
  readonly terminal: boolean;
  readonly playerProjectileCount: number;
  /**
   * The population the executed step RAN WITH: read from the authoritative
   * pre-step state AFTER the evidence-only §11 setup and BEFORE execution. This
   * is what makes the "every executed step" population claims true — a
   * post-step-only reading could attribute a population topped up after the step
   * to work that ran with fewer.
   */
  readonly preStepMissionStepCount: number;
  readonly preStepHunterCount: number;
  readonly preStepRangedCount: number;
  /**
   * The ids of the SAME pre-step population (the enemies the executed step RAN
   * WITH). The shatter proof's liveness link reads THIS set rather than the
   * previous step's post-step population: the evidence-only §11 setup tops the
   * live population up BETWEEN steps, so an enemy the setup added just before
   * this step is live here while being absent from the previous step's recorded
   * population — the population a destruction owner destroyed from is exactly
   * the one the step ran with.
   */
  readonly preStepEnemyIds: readonly number[];
  /** The executed step's OWNER-REPORTED work, or `null` when the step ran
   *  without an armed dense recorder (never acceptable for a bucket step). */
  readonly ownerWork: DenseWorkloadStepWork | null;
  readonly enemies: readonly DenseWorkloadEnemyObservation[];
  readonly enemyProjectiles: readonly DenseWorkloadProjectileObservation[];
  readonly shatters: readonly DenseWorkloadShatterObservation[];
}

/** The observed raw facts of ONE executed step inside the bucket. */
export interface DenseWorkloadStepFacts {
  readonly step: number;
  /** The population the executed step RAN WITH (pre-step authoritative read). */
  readonly preStepHunterCount: number;
  readonly preStepRangedCount: number;
  /** Hunters/Ranged lost during this executed step (pre-step − post-step). */
  readonly hunterLoss: number;
  readonly rangedLoss: number;
  readonly hunterCount: number;
  readonly rangedCount: number;
  readonly basicCount: number;
  readonly enemyCount: number;
  readonly eliteActive: boolean;
  readonly eliteHullIntegrity: number;
  readonly elitePhase: ElitePhaseName | null;
  readonly elitePhaseStepsElapsed: number;
  readonly coreCount: number;
  readonly coreIds: readonly number[];
  readonly coreLaunchIds: readonly number[];
  readonly playerProjectileCount: number;
  /** Owner-reported candidate pairs ENUMERATED by the collision pass. */
  readonly ownerPlayerProjectileCandidates: number;
  /** Owner-reported enumerated candidates that actually overlapped. */
  readonly ownerPlayerProjectileIntersections: number;
  /** Enemy ids the player-projectile collision owner removed lethally. */
  readonly ownerPlayerProjectileLethalEnemyIds: readonly number[];
  /** Owner-reported Aircraft-contact candidates actually enumerated. */
  readonly ownerContactCandidates: number;
  /** Owner-reported enumerated contact candidates that actually overlapped. */
  readonly ownerContactIntersections: number;
  /** Enemy ids the Aircraft-contact owner destroyed (Hunter kamikaze). */
  readonly ownerContactLethalEnemyIds: readonly number[];
  /** Homing Core ids the Elite attack step reported creating. */
  readonly ownerCoreLaunchIds: readonly number[];
  /** Whether this step was framed by the armed dense owner-work recorder. */
  readonly ownerWorkObserved: boolean;
  readonly enemyProjectileCount: number;
  readonly shatterCount: number;
  readonly lethalShatterCount: number;
}

/**
 * The complete observed fact set of one C01 dense workload attempt. Every field
 * is produced by `createDenseWorkloadAccumulator` from authoritative
 * observations; nothing is authored arithmetic, and `-1` marks "never
 * observed".
 */
export interface DenseWorkloadBucketFacts {
  /** Executed step that first observed an ACTIVATED Elite (`-1` if none). */
  readonly eliteActivationStep: number;
  /** Predeclared bucket start derived from `eliteActivationStep` (`-1` if none). */
  readonly bucketStartStep: number;
  /** Predeclared bucket end (inclusive; `-1` if no activation). */
  readonly bucketEndStep: number;
  /** Every executed step the recorder observed. */
  readonly recordedSteps: number;
  /** Executed steps of the predeclared bucket window. */
  readonly executedSteps: number;
  /** Executed steps the bucket window expects (`DENSE_WORKLOAD_BUCKET_STEPS`). */
  readonly expectedSteps: number;
  /** Non-consecutive mission step counts (skipped/duplicated steps) over all. */
  readonly stepContinuityViolations: number;
  /** Recorded steps with `missionStepCount` not strictly increasing (stale). */
  readonly staleFactViolations: number;
  /** Recorded steps that observed a terminal state (must stay `0`). */
  readonly terminalSteps: number;
  readonly hunterMin: number;
  readonly hunterMax: number;
  readonly rangedMin: number;
  readonly rangedMax: number;
  readonly basicMin: number;
  /** Bucket steps whose live Elite was present AND activated. */
  readonly eliteActiveSteps: number;
  /** Bucket steps without a live, activated Elite (must stay `0`). */
  readonly eliteMissingSteps: number;
  /** Bucket steps carrying more than one Elite (must stay `0`). */
  readonly elitePresenceViolationSteps: number;
  /** Bucket steps whose Elite hull is not a positive integer. */
  readonly eliteHullViolationSteps: number;
  /** Bucket steps where the observed Elite hull INCREASED (stale/injected). */
  readonly eliteHullIncreaseSteps: number;
  readonly eliteHullMin: number;
  readonly eliteHullMax: number;
  /** Highest simultaneous Core count observed inside the bucket. */
  readonly maxConcurrentCores: number;
  /** Longest run of consecutive bucket steps with six simultaneous Cores. */
  readonly maxConsecutiveSixCoreSteps: number;
  /** Step the longest six-Core run starts on (`-1` if none). */
  readonly longestSixCoreRunStartStep: number;
  /** Bucket steps with six simultaneous Cores but no active Elite. */
  readonly sixCoreWithoutEliteSteps: number;
  /** Every distinct Core id the recorder observed (`-1`-free, ascending). */
  readonly coreIdsObserved: readonly number[];
  /** Bucket steps on which a previously unseen Core appeared. */
  readonly coreLaunchSteps: readonly number[];
  /** Cores whose first observation was NOT on an authored launch cadence. */
  readonly coreCadenceViolations: number;
  /** Cores observed in excess of the hard cadence upper bound. */
  readonly coreLaunchCountExcess: number;
  /** Cores whose lifetime did not decrease by exactly one executed step. */
  readonly coreLifetimeViolations: number;
  /** Core ids that disappeared and later reappeared (reuse ⇒ injected/stale). */
  readonly coreIdReuseViolations: number;
  /** Distinct Cores observed inside the bucket (owner probe). */
  readonly bucketCoreIds: readonly number[];
  /** Bucket steps with at least one live player projectile. */
  readonly playerProjectileWorkSteps: number;
  /** Bucket steps with at least one live enemy projectile. */
  readonly enemyProjectileWorkSteps: number;
  /**
   * Bucket steps whose OWNER-REPORTED player-projectile→enemy candidate work was
   * greater than zero (the raw `resolveProjectileCollisions` enumeration).
   */
  readonly ownerCandidateSteps: number;
  /** Smallest/largest owner-reported candidate pair count of a bucket step. */
  readonly minOwnerCandidates: number;
  readonly maxOwnerCandidates: number;
  /**
   * Bucket steps whose OWNER-REPORTED Aircraft-contact candidate work
   * (`resolveAircraftContacts` enumeration) was greater than zero. Raw fact only:
   * the contact pass needs a live non-defeated Aircraft plus a live enemy, which
   * the per-step role minimums already guarantee, so this carries no separate
   * qualification check (the owner-proven shatter fact below is what the contact
   * pass must actually deliver).
   */
  readonly ownerContactCandidateSteps: number;
  /** Smallest/largest owner-reported contact candidate count of a bucket step. */
  readonly minOwnerContactCandidates: number;
  readonly maxOwnerContactCandidates: number;
  /** Bucket steps not framed by the armed owner-work recorder (must stay `0`). */
  readonly unownedWorkSteps: number;
  /** Bucket steps claiming candidate work with no coexisting pair possible. */
  readonly candidateWithoutPopulationSteps: number;
  /** Owned steps whose work record was not bound to that exact step. */
  readonly ownerWorkBindingViolations: number;
  /** Minimum Hunter/Ranged count at the START of a bucket step. */
  readonly preStepHunterMin: number;
  readonly preStepRangedMin: number;
  /** Recorded steps whose pre-step record was missing or not the step before. */
  readonly preStepPopulationViolationSteps: number;
  /** Bucket steps that lost at least one Hunter/Ranged while executing. */
  readonly hunterLossSteps: number;
  readonly rangedLossSteps: number;
  /** New Cores whose own launch step did not report them from the owner. */
  readonly coreOwnerViolations: number;
  /** Destruction shatters created inside the bucket. */
  readonly shatterCount: number;
  /** Bucket steps creating at least one OWNER-PROVEN lethal-shatter event. */
  readonly lethalShatterSteps: number;
  /** Bucket shatters no same-step owner-lethal destruction can account for. */
  readonly unprovenShatters: number;
  /** The raw per-executed-step facts of the bucket, in executed order. */
  readonly bucketStepFacts: readonly DenseWorkloadStepFacts[];
}

/** One named, fail-sensitive C01 dense workload check. */
export interface DenseWorkloadCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** The complete C01 verdict derived ONLY from recorded facts. */
export interface DenseWorkloadQualification {
  readonly qualified: boolean;
  readonly checks: readonly DenseWorkloadCheck[];
  readonly failures: readonly string[];
}

/** The predeclared bucket window (`startStep..endStep`, both inclusive). */
export interface DenseWorkloadBucketWindow {
  readonly startStep: number;
  readonly endStep: number;
}

/** The C01 read-only recorder: fed one authoritative observation per executed
 *  fixed step and read once at the end of the attempt.
 *
 *  The observation contract every driver MUST satisfy per executed step is
 *  PRE-step → execute → POST-step:
 *
 *  1. PRE — read the authoritative population AFTER any evidence-only setup and
 *     BEFORE execution (`preStep*`): that is the population the step RUNS WITH;
 *  2. EXECUTE — run exactly one fixed step through the canonical owners with the
 *     dense owner-work recorder framed for that step;
 *  3. POST — read the post-step state (`enemies`, `enemyProjectiles`, `shatters`,
 *     `terminal`) and record the step exactly once.
 *
 *  `preStepMissionStepCount` must be `missionStepCount - 1`, which the
 *  `pre-step-population-recorded` check enforces; a population topped up after
 *  the executed step (or a post-step-only read) fails it, so the §11
 *  "every executed step" population claims can never be satisfied by a
 *  population the step did not run with. */
export interface DenseWorkloadAccumulator {
  readonly recordStep: (observation: DenseWorkloadStepObservation) => void;
  readonly facts: () => DenseWorkloadBucketFacts;
  /**
   * The predeclared bucket window once the Elite activation was observed
   * (`null` before that). Allocation-free, so the evidence-only combined-stress
   * scenario can ask whether an executed step is inside the window BEFORE it
   * records that step's observation.
   */
  readonly bucketWindow: () => DenseWorkloadBucketWindow | null;
}

/** Mutable private bookkeeping of the C01 dense recorder. Never exported: the
 *  only public surface is `DenseWorkloadAccumulator`. */
interface DenseWorkloadRecorderState {
  recordedSteps: number;
  lastRecordedStep: number | null;
  stepContinuityViolations: number;
  staleFactViolations: number;
  terminalSteps: number;
  eliteActivationStep: number;
  bucketStartStep: number;
  bucketEndStep: number;
  executedSteps: number;
  hunterMin: number;
  hunterMax: number;
  rangedMin: number;
  rangedMax: number;
  basicMin: number;
  eliteActiveSteps: number;
  eliteMissingSteps: number;
  elitePresenceViolationSteps: number;
  eliteHullViolationSteps: number;
  eliteHullIncreaseSteps: number;
  eliteHullMin: number;
  eliteHullMax: number;
  maxConcurrentCores: number;
  sixCoreRun: number;
  sixCoreRunStartStep: number;
  maxConsecutiveSixCoreSteps: number;
  longestSixCoreRunStartStep: number;
  sixCoreWithoutEliteSteps: number;
  playerProjectileWorkSteps: number;
  enemyProjectileWorkSteps: number;
  ownerCandidateSteps: number;
  minOwnerCandidates: number;
  maxOwnerCandidates: number;
  ownerContactCandidateSteps: number;
  minOwnerContactCandidates: number;
  maxOwnerContactCandidates: number;
  unownedWorkSteps: number;
  candidateWithoutPopulationSteps: number;
  ownerWorkBindingViolations: number;
  preStepHunterMin: number;
  preStepRangedMin: number;
  preStepPopulationViolationSteps: number;
  hunterLossSteps: number;
  rangedLossSteps: number;
  coreOwnerViolations: number;
  shatterCount: number;
  lethalShatterSteps: number;
  unprovenShatters: number;
  coreCadenceViolations: number;
  coreLaunchCountExcess: number;
  coreLifetimeViolations: number;
  coreIdReuseViolations: number;
  phaseLaunchCount: number;
  previousElitePhase: ElitePhaseName | null;
  coreIdsObserved: Set<number>;
  coreLifetimes: Map<number, number>;
  removedCoreIds: Set<number>;
  eliteHullById: Map<number, number>;
  coreLaunchSteps: number[];
  bucketCoreIds: Set<number>;
  bucketStepFacts: DenseWorkloadStepFacts[];
}

function createDenseWorkloadRecorderState(): DenseWorkloadRecorderState {
  return {
    recordedSteps: 0,
    lastRecordedStep: null,
    stepContinuityViolations: 0,
    staleFactViolations: 0,
    terminalSteps: 0,
    eliteActivationStep: -1,
    bucketStartStep: -1,
    bucketEndStep: -1,
    executedSteps: 0,
    hunterMin: -1,
    hunterMax: 0,
    rangedMin: -1,
    rangedMax: 0,
    basicMin: -1,
    eliteActiveSteps: 0,
    eliteMissingSteps: 0,
    elitePresenceViolationSteps: 0,
    eliteHullViolationSteps: 0,
    eliteHullIncreaseSteps: 0,
    eliteHullMin: -1,
    eliteHullMax: 0,
    maxConcurrentCores: 0,
    sixCoreRun: 0,
    sixCoreRunStartStep: -1,
    maxConsecutiveSixCoreSteps: 0,
    longestSixCoreRunStartStep: -1,
    sixCoreWithoutEliteSteps: 0,
    playerProjectileWorkSteps: 0,
    enemyProjectileWorkSteps: 0,
    ownerCandidateSteps: 0,
    minOwnerCandidates: -1,
    maxOwnerCandidates: 0,
    ownerContactCandidateSteps: 0,
    minOwnerContactCandidates: -1,
    maxOwnerContactCandidates: 0,
    unownedWorkSteps: 0,
    candidateWithoutPopulationSteps: 0,
    ownerWorkBindingViolations: 0,
    preStepHunterMin: -1,
    preStepRangedMin: -1,
    preStepPopulationViolationSteps: 0,
    hunterLossSteps: 0,
    rangedLossSteps: 0,
    coreOwnerViolations: 0,
    shatterCount: 0,
    lethalShatterSteps: 0,
    unprovenShatters: 0,
    coreCadenceViolations: 0,
    coreLaunchCountExcess: 0,
    coreLifetimeViolations: 0,
    coreIdReuseViolations: 0,
    phaseLaunchCount: 0,
    previousElitePhase: null,
    coreIdsObserved: new Set<number>(),
    coreLifetimes: new Map<number, number>(),
    removedCoreIds: new Set<number>(),
    eliteHullById: new Map<number, number>(),
    coreLaunchSteps: [],
    bucketCoreIds: new Set<number>(),
    bucketStepFacts: [],
  };
}

/** The smallest OBSERVED value (`-1` marks "never observed"). */
function minObserved(current: number, next: number): number {
  return current < 0 || next < current ? next : current;
}

/** The largest OBSERVED value. */
function maxObserved(current: number, next: number): number {
  return next > current ? next : current;
}

/**
 * The ONE C01 dense workload recorder (see `createDenseWorkloadAccumulator` for
 * the observation contract). `recordStep` is fed the authoritative observation
 * of every executed fixed step in execution order — the post-step authoritative
 * facts, the PRE-step population the step ran with, and the OWNER-REPORTED work
 * of that exact step — and `facts` returns the facts of the predeclared bucket.
 * It never spawns, moves, shoots, ages, or resolves anything, and it never
 * derives a value from an authored constant that a stale, duplicated, or
 * injected observation could satisfy: the bucket window comes from
 * `denseWorkloadBucketStartStep` applied to the OBSERVED Elite activation step;
 * candidate work is the count the collision owner itself enumerated; a Core
 * counts as newly launched only on its first observation, must have been
 * reported by the Elite attack owner on that step, and the per-Vulnerable-phase
 * launch count must never exceed the authored cadence upper bound for the
 * Elite's own observed phase elapsed; a live Core's remaining lifetime must
 * decrease by exactly one executed step and a removed Core id may never
 * reappear; a shatter proves itself only when a canonical destruction owner
 * lethally removed that enemy on that same step AND the enemy was part of the
 * population the step ran with AND it is gone from the current population; the
 * Elite hull must stay a
 * positive integer that never increases; recorded mission step counts must
 * advance by exactly one, so a Pause (a skipped executed step) or a
 * duplicated/stale observation is a violation.
 */
export function createDenseWorkloadAccumulator(): DenseWorkloadAccumulator {
  const recorder = createDenseWorkloadRecorderState();
  return {
    recordStep: (observation: DenseWorkloadStepObservation): void => {
      recordDenseWorkloadStep(recorder, observation);
    },
    facts: (): DenseWorkloadBucketFacts => readDenseWorkloadFacts(recorder),
    bucketWindow: (): DenseWorkloadBucketWindow | null =>
      recorder.bucketStartStep >= 0
        ? {
            startStep: recorder.bucketStartStep,
            endStep: recorder.bucketEndStep,
          }
        : null,
  };
}

/** Observes the single authored Elite and returns it when it is live AND
 *  activated. The FIRST such step defines the predeclared bucket window through
 *  `denseWorkloadBucketStartStep`, so the window is a function of an observed
 *  activation step and the authored Elite constants only. */
function observeActiveElite(
  recorder: DenseWorkloadRecorderState,
  observation: DenseWorkloadStepObservation,
): DenseWorkloadEnemyObservation | undefined {
  const elites = observation.enemies.filter(
    (enemy) => enemy.kind === 'elite-drone',
  );
  const elite = elites.length === 1 ? elites[0] : undefined;
  if (
    elite === undefined ||
    !elite.activated ||
    elite.phase === 'entering' ||
    elite.phase === undefined
  ) {
    return undefined;
  }
  if (recorder.eliteActivationStep < 0) {
    recorder.eliteActivationStep = observation.missionStepCount;
    recorder.bucketStartStep = denseWorkloadBucketStartStep(
      recorder.eliteActivationStep,
    );
    recorder.bucketEndStep =
      recorder.bucketStartStep + DENSE_WORKLOAD_BUCKET_STEPS - 1;
  }
  return elite;
}

/** True when `missionStepCount` lies inside the predeclared bucket (false until
 *  the observed Elite activation defined the window). */
function inDenseWorkloadBucket(
  recorder: DenseWorkloadRecorderState,
  missionStepCount: number,
): boolean {
  return (
    recorder.bucketStartStep >= 0 &&
    missionStepCount >= recorder.bucketStartStep &&
    missionStepCount <= recorder.bucketEndStep
  );
}

/** Records ONE executed fixed step from its authoritative observation. */
function recordDenseWorkloadStep(
  recorder: DenseWorkloadRecorderState,
  observation: DenseWorkloadStepObservation,
): void {
  recorder.recordedSteps += 1;
  if (recorder.lastRecordedStep !== null) {
    if (observation.missionStepCount <= recorder.lastRecordedStep) {
      recorder.staleFactViolations += 1;
    }
    if (observation.missionStepCount !== recorder.lastRecordedStep + 1) {
      recorder.stepContinuityViolations += 1;
    }
  }
  recorder.lastRecordedStep = observation.missionStepCount;
  if (observation.terminal) {
    recorder.terminalSteps += 1;
  }
  if (
    observation.preStepMissionStepCount !==
    observation.missionStepCount - 1
  ) {
    // The PRE-step contract holds for EVERY recorded step (not only bucket
    // steps): the population a step ran with was read at the step BEFORE it, so
    // a population topped up after the executed step can never be recorded as
    // the one that step ran with.
    recorder.preStepPopulationViolationSteps += 1;
  }
  const ownerWork = observation.ownerWork;
  if (ownerWork !== null && ownerWork.step !== observation.missionStepCount) {
    recorder.ownerWorkBindingViolations += 1;
  }
  const elite = observeActiveElite(recorder, observation);
  const elitePhase =
    elite === undefined ? null : toDenseElitePhaseName(elite.phase);
  const cores = trackDenseWorkloadCores(
    recorder,
    observation,
    elitePhase,
    elite?.elitePhaseStepsElapsed ?? 0,
  );
  if (inDenseWorkloadBucket(recorder, observation.missionStepCount)) {
    aggregateDenseWorkloadBucketStep(recorder, observation, elite, cores);
  }
  recorder.previousElitePhase = elitePhase;
}

/** The Cores observed on one executed step and which of them are NEW. */
interface DenseWorkloadCoreObservation {
  readonly ids: readonly number[];
  readonly newIds: readonly number[];
}

/**
 * OBSERVED Core provenance and lifetime bookkeeping. Every rule is derived from
 * the Elite's own observed phase/elapsed state (never from the bucket window),
 * so a Core that is stale, injected after its launch step, held, or reused can
 * never satisfy a check:
 *
 * - a Core is "new" only on its first observation ever seen;
 * - inside a Vulnerable phase the running count of new Cores must never exceed
 *   the authored cadence upper bound for the observed phase elapsed (a held
 *   launch at the cap only lowers the observed count, so this cannot
 *   false-positive);
 * - a new Core observed outside a Vulnerable phase is a cadence violation;
 * - a new Core must have been REPORTED by the canonical Elite attack owner on
 *   that same executed step (`ownerCoreLaunchIds`): an id that first appears at
 *   an otherwise permitted launch point but was not created by the owner that
 *   step — a substituted or fabricated identity — is an owner violation, so the
 *   check can never be satisfied by cadence arithmetic alone;
 * - a live Core's remaining lifetime must decrease by exactly one executed step;
 * - a Core id that disappeared may never reappear.
 */
function trackDenseWorkloadCores(
  recorder: DenseWorkloadRecorderState,
  observation: DenseWorkloadStepObservation,
  elitePhase: ElitePhaseName | null,
  phaseElapsed: number,
): DenseWorkloadCoreObservation {
  const ids = observation.enemyProjectiles
    .filter((projectile) => projectile.kind === 'elite-core')
    .map((projectile) => projectile.id);
  const newIds = ids.filter((id) => !recorder.coreIdsObserved.has(id));
  const ownerLaunchIds = observation.ownerWork?.ownerCoreLaunchIds ?? [];
  if (
    elitePhase === 'vulnerable' &&
    recorder.previousElitePhase !== 'vulnerable'
  ) {
    recorder.phaseLaunchCount = 0;
  }
  if (elitePhase === 'vulnerable') {
    recorder.phaseLaunchCount += newIds.length;
    const expected = denseWorkloadExpectedCoreLaunches(phaseElapsed);
    if (recorder.phaseLaunchCount > expected) {
      recorder.coreLaunchCountExcess += recorder.phaseLaunchCount - expected;
    }
  } else if (newIds.length > 0) {
    recorder.coreCadenceViolations += newIds.length;
  }
  for (const id of newIds) {
    if (!ownerLaunchIds.includes(id)) {
      recorder.coreOwnerViolations += 1;
    }
    if (recorder.removedCoreIds.has(id)) {
      recorder.coreIdReuseViolations += 1;
    }
    recorder.coreIdsObserved.add(id);
    if (inDenseWorkloadBucket(recorder, observation.missionStepCount)) {
      recorder.bucketCoreIds.add(id);
      recorder.coreLaunchSteps.push(observation.missionStepCount);
    }
  }
  const liveCoreIds = new Set<number>();
  for (const projectile of observation.enemyProjectiles) {
    if (projectile.kind !== 'elite-core') {
      continue;
    }
    liveCoreIds.add(projectile.id);
    const previous = recorder.coreLifetimes.get(projectile.id);
    if (previous === undefined) {
      if (projectile.remainingLifetimeSteps <= 0) {
        recorder.coreLifetimeViolations += 1;
      }
    } else if (projectile.remainingLifetimeSteps !== previous - 1) {
      recorder.coreLifetimeViolations += 1;
    }
    recorder.coreLifetimes.set(
      projectile.id,
      projectile.remainingLifetimeSteps,
    );
  }
  for (const id of [...recorder.coreLifetimes.keys()]) {
    if (!liveCoreIds.has(id)) {
      recorder.removedCoreIds.add(id);
      recorder.coreLifetimes.delete(id);
    }
  }
  return { ids, newIds };
}

/** The observed `ElitePhaseName` of an active Elite (`null` while entering). */
function toDenseElitePhaseName(
  phase: DenseWorkloadEnemyObservation['phase'],
): ElitePhaseName | null {
  return phase === 'armoured' || phase === 'vulnerable' ? phase : null;
}

/** Counts the observed live enemies per role. */
function countObservedEnemies(
  observation: DenseWorkloadStepObservation,
): Record<EnemyType, number> {
  const counts: Record<EnemyType, number> = {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  };
  for (const enemy of observation.enemies) {
    counts[enemy.kind] = (counts[enemy.kind] ?? 0) + 1;
  }
  return counts;
}

/**
 * Aggregates ONE executed step inside the predeclared bucket from its
 * authoritative observation. The shatter proof's liveness link reads the
 * observation's own PRE-step enemy id set — the population the step ran with —
 * so a destruction shatter proves its own lethality against the run's real
 * population instead of being trusted.
 */
function aggregateDenseWorkloadBucketStep(
  recorder: DenseWorkloadRecorderState,
  observation: DenseWorkloadStepObservation,
  elite: DenseWorkloadEnemyObservation | undefined,
  cores: DenseWorkloadCoreObservation,
): void {
  // Every call aggregates exactly ONE recorded step that lies inside the
  // predeclared window, so this is the executed-step count the window, work and
  // population rules are all checked against (`bucket-window-complete`).
  recorder.executedSteps += 1;
  const counts = countObservedEnemies(observation);
  const hunterCount = counts['hunter-drone'];
  const rangedCount = counts['ranged-drone'];
  const basicCount = counts['basic-drone'];
  recorder.hunterMin = minObserved(recorder.hunterMin, hunterCount);
  recorder.hunterMax = maxObserved(recorder.hunterMax, hunterCount);
  recorder.rangedMin = minObserved(recorder.rangedMin, rangedCount);
  recorder.rangedMax = maxObserved(recorder.rangedMax, rangedCount);
  recorder.basicMin = minObserved(recorder.basicMin, basicCount);
  if (counts['elite-drone'] > 1) {
    recorder.elitePresenceViolationSteps += 1;
  }
  if (elite === undefined) {
    recorder.eliteMissingSteps += 1;
  } else {
    recorder.eliteActiveSteps += 1;
    const hull = elite.hullIntegrity;
    if (!Number.isInteger(hull) || hull <= 0) {
      recorder.eliteHullViolationSteps += 1;
    }
    const previousHull = recorder.eliteHullById.get(elite.id);
    if (previousHull !== undefined && hull > previousHull) {
      recorder.eliteHullIncreaseSteps += 1;
    }
    recorder.eliteHullById.set(elite.id, hull);
    recorder.eliteHullMin = minObserved(recorder.eliteHullMin, hull);
    recorder.eliteHullMax = maxObserved(recorder.eliteHullMax, hull);
  }
  const coreCount = cores.ids.length;
  recorder.maxConcurrentCores = maxObserved(
    recorder.maxConcurrentCores,
    coreCount,
  );
  if (coreCount >= DENSE_WORKLOAD_CORE_LAUNCHES_PER_PHASE) {
    if (recorder.sixCoreRun === 0) {
      recorder.sixCoreRunStartStep = observation.missionStepCount;
    }
    recorder.sixCoreRun += 1;
    if (recorder.sixCoreRun > recorder.maxConsecutiveSixCoreSteps) {
      recorder.maxConsecutiveSixCoreSteps = recorder.sixCoreRun;
      recorder.longestSixCoreRunStartStep = recorder.sixCoreRunStartStep;
    }
    if (elite === undefined) {
      recorder.sixCoreWithoutEliteSteps += 1;
    }
  } else {
    recorder.sixCoreRun = 0;
    recorder.sixCoreRunStartStep = -1;
  }
  const playerProjectileCount = observation.playerProjectileCount;
  if (playerProjectileCount > 0) {
    recorder.playerProjectileWorkSteps += 1;
  }
  if (observation.enemyProjectiles.length > 0) {
    recorder.enemyProjectileWorkSteps += 1;
  }
  const ownerWork = observation.ownerWork;
  const ownerCandidates = ownerWork?.playerProjectileCandidates ?? 0;
  if (ownerWork === null) {
    recorder.unownedWorkSteps += 1;
  } else if (
    ownerCandidates > 0 &&
    (playerProjectileCount === 0 || observation.enemies.length === 0)
  ) {
    // A candidate pair IS a live player projectile and a live enemy, so work
    // claiming candidates without either could not have come from the real
    // collision pass. The converse — both present with ZERO reported candidates
    // — is deliberately NOT a violation here: it is the accepted "population but
    // no actual work" case that must fail the every-step count below instead.
    recorder.candidateWithoutPopulationSteps += 1;
  }
  if (ownerCandidates > 0) {
    recorder.ownerCandidateSteps += 1;
  }
  recorder.minOwnerCandidates = minObserved(
    recorder.minOwnerCandidates,
    ownerCandidates,
  );
  recorder.maxOwnerCandidates = maxObserved(
    recorder.maxOwnerCandidates,
    ownerCandidates,
  );
  const ownerContactCandidates = ownerWork?.contactCandidates ?? 0;
  if (ownerContactCandidates > 0) {
    recorder.ownerContactCandidateSteps += 1;
  }
  recorder.minOwnerContactCandidates = minObserved(
    recorder.minOwnerContactCandidates,
    ownerContactCandidates,
  );
  recorder.maxOwnerContactCandidates = maxObserved(
    recorder.maxOwnerContactCandidates,
    ownerContactCandidates,
  );
  const preStepHunterCount = observation.preStepHunterCount;
  const preStepRangedCount = observation.preStepRangedCount;
  recorder.preStepHunterMin = minObserved(
    recorder.preStepHunterMin,
    preStepHunterCount,
  );
  recorder.preStepRangedMin = minObserved(
    recorder.preStepRangedMin,
    preStepRangedCount,
  );
  if (hunterCount < preStepHunterCount) {
    recorder.hunterLossSteps += 1;
  }
  if (rangedCount < preStepRangedCount) {
    recorder.rangedLossSteps += 1;
  }
  const ownerLethalIds = [
    ...(ownerWork?.playerProjectileLethalEnemyIds ?? []),
    ...(ownerWork?.contactLethalEnemyIds ?? []),
  ];
  let provenShatters = 0;
  for (const shatter of observation.shatters) {
    recorder.shatterCount += 1;
    // A shatter is proven only by ALL THREE links: a canonical destruction owner
    // (the player-projectile→enemy pass or the Aircraft-contact pass, whose
    // Hunter kamikaze destruction owns its own shatter) removed that enemy
    // through its own lethal hit on exactly this step, the enemy was part of the
    // population this step RAN WITH (the authoritative pre-step read, so a
    // between-step §11 top-up cannot invalidate a genuine destruction), and it is
    // gone from the current population. A previous-step liveness read alone would
    // accept a shatter for an enemy that is still alive, and the owner link alone
    // would accept a fabricated destruction event.
    const lethallyRemovedByOwner = ownerLethalIds.includes(shatter.enemyId);
    const wasLiveBeforeDestruction = observation.preStepEnemyIds.includes(
      shatter.enemyId,
    );
    const stillLive = observation.enemies.some(
      (enemy) => enemy.id === shatter.enemyId,
    );
    if (lethallyRemovedByOwner && wasLiveBeforeDestruction && !stillLive) {
      provenShatters += 1;
    } else {
      recorder.unprovenShatters += 1;
    }
  }
  if (provenShatters > 0) {
    recorder.lethalShatterSteps += 1;
  }
  recorder.bucketStepFacts.push({
    step: observation.missionStepCount,
    preStepHunterCount,
    preStepRangedCount,
    hunterLoss: preStepHunterCount - hunterCount,
    rangedLoss: preStepRangedCount - rangedCount,
    hunterCount,
    rangedCount,
    basicCount,
    enemyCount: observation.enemies.length,
    eliteActive: elite !== undefined,
    eliteHullIntegrity: elite?.hullIntegrity ?? -1,
    elitePhase: toDenseElitePhaseName(elite?.phase),
    elitePhaseStepsElapsed: elite?.elitePhaseStepsElapsed ?? -1,
    coreCount,
    coreIds: [...cores.ids],
    coreLaunchIds: [...cores.newIds],
    playerProjectileCount,
    ownerPlayerProjectileCandidates: ownerCandidates,
    ownerPlayerProjectileIntersections:
      ownerWork?.playerProjectileIntersections ?? 0,
    ownerPlayerProjectileLethalEnemyIds: [
      ...(ownerWork?.playerProjectileLethalEnemyIds ?? []),
    ],
    ownerContactCandidates,
    ownerContactIntersections: ownerWork?.contactIntersections ?? 0,
    ownerContactLethalEnemyIds: [...(ownerWork?.contactLethalEnemyIds ?? [])],
    ownerCoreLaunchIds: [...(ownerWork?.ownerCoreLaunchIds ?? [])],
    ownerWorkObserved: ownerWork !== null,
    enemyProjectileCount: observation.enemyProjectiles.length,
    shatterCount: observation.shatters.length,
    lethalShatterCount: provenShatters,
  });
}

/** Reads the recorded facts as a fresh immutable snapshot. */
function readDenseWorkloadFacts(
  recorder: DenseWorkloadRecorderState,
): DenseWorkloadBucketFacts {
  return {
    eliteActivationStep: recorder.eliteActivationStep,
    bucketStartStep: recorder.bucketStartStep,
    bucketEndStep: recorder.bucketEndStep,
    recordedSteps: recorder.recordedSteps,
    executedSteps: recorder.executedSteps,
    expectedSteps: DENSE_WORKLOAD_BUCKET_STEPS,
    stepContinuityViolations: recorder.stepContinuityViolations,
    staleFactViolations: recorder.staleFactViolations,
    terminalSteps: recorder.terminalSteps,
    hunterMin: recorder.hunterMin,
    hunterMax: recorder.hunterMax,
    rangedMin: recorder.rangedMin,
    rangedMax: recorder.rangedMax,
    basicMin: recorder.basicMin,
    eliteActiveSteps: recorder.eliteActiveSteps,
    eliteMissingSteps: recorder.eliteMissingSteps,
    elitePresenceViolationSteps: recorder.elitePresenceViolationSteps,
    eliteHullViolationSteps: recorder.eliteHullViolationSteps,
    eliteHullIncreaseSteps: recorder.eliteHullIncreaseSteps,
    eliteHullMin: recorder.eliteHullMin,
    eliteHullMax: recorder.eliteHullMax,
    maxConcurrentCores: recorder.maxConcurrentCores,
    maxConsecutiveSixCoreSteps: recorder.maxConsecutiveSixCoreSteps,
    longestSixCoreRunStartStep: recorder.longestSixCoreRunStartStep,
    sixCoreWithoutEliteSteps: recorder.sixCoreWithoutEliteSteps,
    coreIdsObserved: [...recorder.coreIdsObserved].sort((a, b) => a - b),
    coreLaunchSteps: [...recorder.coreLaunchSteps],
    coreCadenceViolations: recorder.coreCadenceViolations,
    coreLaunchCountExcess: recorder.coreLaunchCountExcess,
    coreLifetimeViolations: recorder.coreLifetimeViolations,
    coreIdReuseViolations: recorder.coreIdReuseViolations,
    bucketCoreIds: [...recorder.bucketCoreIds].sort((a, b) => a - b),
    playerProjectileWorkSteps: recorder.playerProjectileWorkSteps,
    enemyProjectileWorkSteps: recorder.enemyProjectileWorkSteps,
    ownerCandidateSteps: recorder.ownerCandidateSteps,
    minOwnerCandidates: recorder.minOwnerCandidates,
    maxOwnerCandidates: recorder.maxOwnerCandidates,
    ownerContactCandidateSteps: recorder.ownerContactCandidateSteps,
    minOwnerContactCandidates: recorder.minOwnerContactCandidates,
    maxOwnerContactCandidates: recorder.maxOwnerContactCandidates,
    unownedWorkSteps: recorder.unownedWorkSteps,
    candidateWithoutPopulationSteps: recorder.candidateWithoutPopulationSteps,
    ownerWorkBindingViolations: recorder.ownerWorkBindingViolations,
    preStepHunterMin: recorder.preStepHunterMin,
    preStepRangedMin: recorder.preStepRangedMin,
    preStepPopulationViolationSteps: recorder.preStepPopulationViolationSteps,
    hunterLossSteps: recorder.hunterLossSteps,
    rangedLossSteps: recorder.rangedLossSteps,
    coreOwnerViolations: recorder.coreOwnerViolations,
    shatterCount: recorder.shatterCount,
    lethalShatterSteps: recorder.lethalShatterSteps,
    unprovenShatters: recorder.unprovenShatters,
    bucketStepFacts: [...recorder.bucketStepFacts],
  };
}

/** One named §11 dense workload check with its observed evidence. */
function denseWorkloadCheck(
  name: string,
  detail: string,
  passed: boolean,
): DenseWorkloadCheck {
  return { name, detail, passed };
}

/** The §11 population and elite-integrity checks (every one fail-sensitive). */
function buildDenseWorkloadPopulationChecks(
  facts: DenseWorkloadBucketFacts,
): DenseWorkloadCheck[] {
  return [
    denseWorkloadCheck(
      'elite-activation-observed',
      `activation step ${facts.eliteActivationStep}, bucket ${facts.bucketStartStep}..${facts.bucketEndStep}`,
      facts.eliteActivationStep >= 0 && facts.bucketStartStep >= 0,
    ),
    denseWorkloadCheck(
      'bucket-executed-steps',
      `${facts.executedSteps} of ${facts.expectedSteps} window steps executed (minimum ${DENSE_WORKLOAD_MIN_EXECUTED_STEPS})`,
      facts.executedSteps >= DENSE_WORKLOAD_MIN_EXECUTED_STEPS,
    ),
    denseWorkloadCheck(
      'bucket-window-complete',
      `${facts.executedSteps} of ${facts.expectedSteps} window steps recorded`,
      facts.executedSteps === facts.expectedSteps,
    ),
    denseWorkloadCheck(
      'executed-step-continuity',
      `${facts.stepContinuityViolations} non-consecutive executed steps over ${facts.recordedSteps} recorded`,
      facts.stepContinuityViolations === 0,
    ),
    denseWorkloadCheck(
      'no-stale-step-facts',
      `${facts.staleFactViolations} stale or duplicated observations`,
      facts.staleFactViolations === 0,
    ),
    denseWorkloadCheck(
      'no-pause-or-terminal',
      `${facts.terminalSteps} terminal steps recorded`,
      facts.terminalSteps === 0,
    ),
    denseWorkloadCheck(
      'pre-step-population-recorded',
      `${facts.preStepPopulationViolationSteps} recorded steps lacked the pre-step population of the step they executed`,
      facts.preStepPopulationViolationSteps === 0,
    ),
    denseWorkloadCheck(
      'six-hunters-every-step',
      `minimum ${facts.preStepHunterMin} Hunters at the START of every executed step (minimum ${facts.hunterMin} after execution; ${facts.hunterLossSteps} steps lost one and were re-topped up before the next step), maximum ${facts.hunterMax}`,
      facts.preStepHunterMin >= DENSE_WORKLOAD_MIN_HUNTERS,
    ),
    denseWorkloadCheck(
      'ranged-every-step',
      `minimum ${facts.preStepRangedMin} Ranged at the START of every executed step (minimum ${facts.rangedMin} after execution; ${facts.rangedLossSteps} steps lost one), maximum ${facts.rangedMax}`,
      facts.preStepRangedMin >= DENSE_WORKLOAD_MIN_RANGED,
    ),
    denseWorkloadCheck(
      'active-elite-every-step',
      `${facts.eliteActiveSteps} active steps, ${facts.eliteMissingSteps} missing`,
      facts.eliteMissingSteps === 0 &&
        facts.eliteActiveSteps === facts.expectedSteps,
    ),
    denseWorkloadCheck(
      'single-elite',
      `${facts.elitePresenceViolationSteps} steps carried more than one Elite`,
      facts.elitePresenceViolationSteps === 0,
    ),
    denseWorkloadCheck(
      'elite-hull-monotonic',
      `hull ${facts.eliteHullMin}..${facts.eliteHullMax}, ${facts.eliteHullViolationSteps} invalid, ${facts.eliteHullIncreaseSteps} increases`,
      facts.eliteHullMin > 0 &&
        facts.eliteHullViolationSteps === 0 &&
        facts.eliteHullIncreaseSteps === 0,
    ),
  ];
}

/** The §11 Core-provenance, workload and shatter checks (fail-sensitive). */
function buildDenseWorkloadWorkChecks(
  facts: DenseWorkloadBucketFacts,
): DenseWorkloadCheck[] {
  return [
    denseWorkloadCheck(
      'six-cores-concurrent-run',
      `longest run ${facts.maxConsecutiveSixCoreSteps} steps from ${facts.longestSixCoreRunStartStep}, minimum ${DENSE_WORKLOAD_MIN_CONSECUTIVE_CORE_STEPS}`,
      facts.maxConsecutiveSixCoreSteps >=
        DENSE_WORKLOAD_MIN_CONSECUTIVE_CORE_STEPS,
    ),
    denseWorkloadCheck(
      'six-cores-with-active-elite',
      `${facts.sixCoreWithoutEliteSteps} six-Core steps without an active Elite`,
      facts.sixCoreWithoutEliteSteps === 0,
    ),
    denseWorkloadCheck(
      'core-owner-provenance',
      `${facts.bucketCoreIds.length} distinct bucket Cores, ${facts.coreOwnerViolations} owner violations, ${facts.coreCadenceViolations} cadence, ${facts.coreLaunchCountExcess} excess, ${facts.coreLifetimeViolations} lifetime, ${facts.coreIdReuseViolations} reuse violations`,
      facts.coreOwnerViolations === 0 &&
        facts.coreCadenceViolations === 0 &&
        facts.coreLaunchCountExcess === 0 &&
        facts.coreLifetimeViolations === 0 &&
        facts.coreIdReuseViolations === 0,
    ),
    denseWorkloadCheck(
      'core-launch-steps-recorded',
      `${facts.coreLaunchSteps.length} owner launch steps recorded inside the bucket (minimum ${DENSE_WORKLOAD_MIN_BUCKET_CORE_LAUNCHES} of the at most one a 60-step window can contain)`,
      facts.coreLaunchSteps.length >= DENSE_WORKLOAD_MIN_BUCKET_CORE_LAUNCHES,
    ),
    denseWorkloadCheck(
      'player-projectile-work-every-step',
      `${facts.playerProjectileWorkSteps} of ${facts.expectedSteps} steps carried a live player projectile`,
      facts.playerProjectileWorkSteps === facts.expectedSteps,
    ),
    denseWorkloadCheck(
      'enemy-projectile-work-every-step',
      `${facts.enemyProjectileWorkSteps} of ${facts.expectedSteps} steps carried a live enemy projectile`,
      facts.enemyProjectileWorkSteps === facts.expectedSteps,
    ),
    denseWorkloadCheck(
      'collision-candidate-work-every-step',
      `${facts.ownerCandidateSteps} of ${facts.expectedSteps} steps reported OWNER candidate work (min ${facts.minOwnerCandidates}, max ${facts.maxOwnerCandidates} pairs); ${facts.ownerContactCandidateSteps} steps reported owner contact-candidate work (max ${facts.maxOwnerContactCandidates}); ${facts.unownedWorkSteps} steps unowned, ${facts.candidateWithoutPopulationSteps} without a coexisting pair, ${facts.ownerWorkBindingViolations} mis-bound`,
      facts.ownerCandidateSteps === facts.expectedSteps &&
        facts.unownedWorkSteps === 0 &&
        facts.candidateWithoutPopulationSteps === 0 &&
        facts.ownerWorkBindingViolations === 0,
    ),
    denseWorkloadCheck(
      'lethal-destruction-shatter',
      `${facts.lethalShatterSteps} owner-proven steps, ${facts.shatterCount} shatters, ${facts.unprovenShatters} unproven`,
      facts.lethalShatterSteps >= 1 && facts.unprovenShatters === 0,
    ),
  ];
}

/**
 * The C01 verdict, derived ONLY from the recorded facts. Every check is
 * fail-sensitive in both directions: it passes on the observed complete
 * combined stress bucket and fails on a missing role, a missing or
 * underexposed elite, a short/Paused/terminal bucket, a stale or duplicated
 * step, a Core the owner did not launch on its cadence, and a shatter that no
 * live enemy can account for.
 */
export function qualifyDenseWorkloadBucket(
  facts: DenseWorkloadBucketFacts,
): DenseWorkloadQualification {
  const checks = [
    ...buildDenseWorkloadPopulationChecks(facts),
    ...buildDenseWorkloadWorkChecks(facts),
  ];
  const failures = checks
    .filter((check) => !check.passed)
    .map((check) => `${check.name}: ${check.detail}`);
  return { qualified: failures.length === 0, checks, failures };
}

declare global {
  interface Window {
    __shmupEvidence__?: CombatEvidenceWindow;
    __legacyBenchmarkIdentity__?: LegacyBenchmarkIdentityWindow;
    __shmupEliteWorkload__?: EliteWorkloadIdentityWindow;
  }
}
