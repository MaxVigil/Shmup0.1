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

declare global {
  interface Window {
    __shmupEvidence__?: CombatEvidenceWindow;
    __legacyBenchmarkIdentity__?: LegacyBenchmarkIdentityWindow;
    __shmupEliteWorkload__?: EliteWorkloadIdentityWindow;
  }
}
