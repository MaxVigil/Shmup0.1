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
  /** Executed fixed steps covered by the record. */
  readonly steps: number;
}

/** Holds the run's observed per-step maxima. Owned by the simulation state
 *  (created only in the evidence build) and never mutated by presentation. */
export interface CombatEvidenceAccumulator {
  readonly record: () => CombatEvidenceRecord;
  readonly recordStep: (
    enemies: readonly { readonly type: EnemyType }[],
    playerProjectileCount: number,
    enemyProjectileCount: number,
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
      steps: state.steps,
    }),
    recordStep(enemies, playerProjectileCount, enemyProjectileCount, sink) {
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
        enemyProjectileCount,
      );
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

/** The approved read-only evidence surface exposed ONLY by the instrumented
 *  Pass A evidence build to the evidence runner. `read()` returns the observed
 *  per-step maxima (counters gate); `runBenchmarkScenario` materialises an
 *  evidence-only benchmark scenario through the authoritative deterministic
 *  transform (scenarios gate; Epic §20.1, delta 8/2). All members are
 *  compile-time absent from the ordinary production artifact. */
export interface CombatEvidenceWindow {
  readonly read: () => CombatEvidenceRecord | null;
  readonly runBenchmarkScenario: (
    scenario: 'legacy-five-basic' | 'm01-e5',
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

declare global {
  interface Window {
    __shmupEvidence__?: CombatEvidenceWindow;
    __legacyBenchmarkIdentity__?: LegacyBenchmarkIdentityWindow;
  }
}
