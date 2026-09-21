import { describe, expect, it } from 'vitest';
import type {
  CombatEvidenceEnemy,
  CombatEvidenceEnemyProjectile,
} from './evidence';
import {
  EVIDENCE_COUNTERS_ENABLED,
  EVIDENCE_MODE,
  EVIDENCE_SCENARIOS_ENABLED,
  createCollisionEvidenceSink,
  createCombatEvidenceAccumulator,
} from './evidence';

/** The authored `50% VW, 20% VH` anchor at the `1366 × 768` evidence viewport. */
const ANCHOR = { centerX: 683, centerY: 768 * 0.2 };

function eliteEnemy(
  phase: 'entering' | 'armoured' | 'vulnerable',
  frame: { readonly centerX: number; readonly centerY: number },
  id = 0,
): CombatEvidenceEnemy {
  return {
    id,
    type: 'elite-drone',
    kind: 'elite',
    activated: phase !== 'entering',
    centerX: frame.centerX,
    centerY: frame.centerY,
    phase,
  };
}

function basicEnemy(id: number): CombatEvidenceEnemy {
  return regularEnemy('basic-drone', id);
}

function regularEnemy(
  type: 'basic-drone' | 'ranged-drone' | 'hunter-drone',
  id: number,
): CombatEvidenceEnemy {
  return {
    id,
    type,
    kind:
      type === 'basic-drone'
        ? 'basic'
        : type === 'ranged-drone'
          ? 'ranged'
          : 'hunter',
    activated: true,
    centerX: 100,
    centerY: 40,
  };
}

function cannonCannon(
  id: number,
  side: 'left' | 'right',
): CombatEvidenceEnemyProjectile {
  return {
    id,
    kind: 'elite-cannon',
    velocityX: side === 'left' ? -31.2 : 31.2,
  };
}

function homingCore(id: number): CombatEvidenceEnemyProjectile {
  return { id, kind: 'elite-core' };
}

/** Records one Elite workload step into a fresh accumulator and returns it. */
function recordEliteSteps(
  steps: readonly {
    readonly enemies: readonly CombatEvidenceEnemy[];
    readonly projectiles?: readonly CombatEvidenceEnemyProjectile[];
    readonly players?: number;
    readonly anchor?: { readonly centerX: number; readonly centerY: number };
    readonly missionStepCount?: number;
  }[],
): ReturnType<typeof createCombatEvidenceAccumulator> {
  const accumulator = createCombatEvidenceAccumulator(609704137);
  let missionStepCount = 0;
  for (const step of steps) {
    missionStepCount += 1;
    accumulator.recordStep(
      step.enemies,
      step.players ?? 6,
      step.projectiles ?? [],
      step.anchor ?? ANCHOR,
      step.missionStepCount ?? missionStepCount,
      createCollisionEvidenceSink(),
    );
  }
  return accumulator;
}

/**
 * V02-WI-04 C03/C04 evidence-core unit contract (Epic §20.1, V02-AC-028):
 * the read-only per-step sink and the observed per-step maxima accumulator,
 * including the C04 exact simultaneous-state proof. Unit tests run the
 * ordinary-build semantics (both capabilities compile-time disabled); the
 * evidence builds' compile-time-enabled behaviour is covered by the browser
 * harnesses and the artifact-hygiene regression.
 */
describe('V02-WI-04 C03/C04 evidence-core (Pass A counters)', () => {
  it('is compile-time disabled in the ordinary build semantics', () => {
    expect(EVIDENCE_MODE).toBe(false);
    expect(EVIDENCE_SCENARIOS_ENABLED).toBe(false);
    expect(EVIDENCE_COUNTERS_ENABLED).toBe(false);
  });

  it('the collision sink accumulates observed work and reports totals', () => {
    const sink = createCollisionEvidenceSink();
    expect(sink.totals()).toEqual({
      playerProjectileCandidates: 0,
      playerProjectileIntersections: 0,
      enemyProjectileCandidates: 0,
      enemyProjectileIntersections: 0,
      contactCandidates: 0,
      contactIntersections: 0,
    });
    sink.addPlayerProjectileCandidates(7);
    sink.addPlayerProjectileIntersections(2);
    sink.addEnemyProjectileCandidates(3);
    sink.addEnemyProjectileIntersections(1);
    sink.addContactCandidates(5);
    sink.addContactIntersections(0);
    expect(sink.totals()).toEqual({
      playerProjectileCandidates: 7,
      playerProjectileIntersections: 2,
      enemyProjectileCandidates: 3,
      enemyProjectileIntersections: 1,
      contactCandidates: 5,
      contactIntersections: 0,
    });
  });

  it('the accumulator records per-role, projectile, and collision-work maxima across steps', () => {
    const accumulator = createCombatEvidenceAccumulator(1234);
    const firstSink = createCollisionEvidenceSink();
    firstSink.addPlayerProjectileCandidates(4);
    firstSink.addPlayerProjectileIntersections(1);
    accumulator.recordStep(
      [
        basicEnemy(0),
        basicEnemy(1),
        regularEnemy('ranged-drone', 2),
        regularEnemy('hunter-drone', 3),
      ],
      2,
      [],
      ANCHOR,
      1,
      firstSink,
    );
    const secondSink = createCollisionEvidenceSink();
    secondSink.addPlayerProjectileCandidates(6);
    secondSink.addPlayerProjectileIntersections(3);
    accumulator.recordStep(
      [
        basicEnemy(0),
        basicEnemy(1),
        basicEnemy(2),
        regularEnemy('ranged-drone', 3),
        regularEnemy('hunter-drone', 4),
      ],
      3,
      [cannonCannon(0, 'left')],
      ANCHOR,
      1,
      secondSink,
    );
    const record = accumulator.record();
    expect(record.missionSeed).toBe(1234);
    expect(record.activeEnemiesByRoleMax).toEqual({
      'basic-drone': 3,
      'ranged-drone': 1,
      'hunter-drone': 1,
      'elite-drone': 0,
    });
    expect(record.activePlayerProjectilesMax).toBe(3);
    expect(record.activeEnemyProjectilesMax).toBe(1);
    expect(record.collisionWorkMax).toEqual({
      playerProjectileCandidates: 6,
      playerProjectileIntersections: 3,
      enemyProjectileCandidates: 0,
      enemyProjectileIntersections: 0,
      contactCandidates: 0,
      contactIntersections: 0,
    });
    // Only the second step reached the approved 3 Basic + 1 Ranged + 1 Hunter
    // concurrent mix; that step's mix is EXACTLY 3+1+1+0, so the exact
    // simultaneous-state counter also increments once.
    expect(record.workloadReachedSteps).toBe(1);
    expect(record.exactRegularWorkloadSteps).toBe(1);
    expect(record.steps).toBe(2);
  });

  it('V02-WI-04 C04: an exact simultaneous-state hit requires EXACT 3+1+1+0, not just maxima or a >= mix', () => {
    const accumulator = createCombatEvidenceAccumulator(55);
    // A lingering earlier enemy: 4 Basic + 1 Ranged + 1 Hunter active together
    // (the e1 group contaminating the e5 sample). The >= reach counter counts
    // it, but the exact-state counter must NOT.
    accumulator.recordStep(
      [
        basicEnemy(0),
        basicEnemy(1),
        basicEnemy(2),
        basicEnemy(3),
        regularEnemy('ranged-drone', 4),
        regularEnemy('hunter-drone', 5),
      ],
      3,
      [cannonCannon(0, 'left')],
      ANCHOR,
      1,
      createCollisionEvidenceSink(),
    );
    // The exact e5-only state: EXACTLY 3 Basic + 1 Ranged + 1 Hunter + 0 Elite.
    accumulator.recordStep(
      [
        basicEnemy(0),
        basicEnemy(1),
        basicEnemy(2),
        regularEnemy('ranged-drone', 3),
        regularEnemy('hunter-drone', 4),
      ],
      3,
      [cannonCannon(0, 'left')],
      ANCHOR,
      1,
      createCollisionEvidenceSink(),
    );
    const record = accumulator.record();
    expect(record.activeEnemiesByRoleMax['basic-drone']).toBe(4);
    expect(record.workloadReachedSteps).toBe(2);
    expect(record.exactRegularWorkloadSteps).toBe(1);
  });

  it('record() returns a detached snapshot (later steps do not mutate it)', () => {
    const accumulator = createCombatEvidenceAccumulator(77);
    accumulator.recordStep(
      [basicEnemy(0)],
      1,
      [],
      ANCHOR,
      1,
      createCollisionEvidenceSink(),
    );
    const before = accumulator.record();
    accumulator.recordStep(
      [
        basicEnemy(0),
        basicEnemy(1),
        basicEnemy(2),
        regularEnemy('ranged-drone', 3),
        regularEnemy('hunter-drone', 4),
      ],
      2,
      [],
      ANCHOR,
      1,
      createCollisionEvidenceSink(),
    );
    const after = accumulator.record();
    expect(before.activeEnemiesByRoleMax['basic-drone']).toBe(1);
    expect(before.steps).toBe(1);
    expect(after.activeEnemiesByRoleMax['basic-drone']).toBe(3);
    expect(after.steps).toBe(2);
  });

  it('reports an all-zero Elite workload when the observed run contains no Elite', () => {
    const accumulator = recordEliteSteps([
      { enemies: [basicEnemy(0)], projectiles: [{ id: 7, kind: 'ranged' }] },
    ]);
    expect(accumulator.record().eliteWorkload).toEqual({
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
      leftCannonProjectilesObserved: 0,
      rightCannonProjectilesObserved: 0,
      eliteCannonProjectilesMax: 0,
      cannonPairSteps: 0,
      homingCoresObserved: 0,
      maxActiveHomingCores: 0,
      homingCoreActiveSteps: 0,
    });
  });
});

/**
 * V02-WI-06 E04-C02 Elite workload identity facts (Epic §9.4, §20.1;
 * V02-AC-009–010, V02-AC-028). The counters are observed per executed fixed
 * step so the Pass A record can prove the exact Elite workload — the entry, the
 * activation/anchor step, one complete Armoured phase followed by one complete
 * Vulnerable phase, continuous player fire, both cannon streams, and homing Core
 * creation/activity with the simultaneous cap. The read-only identity
 * observation the uninstrumented Pass B build reads per probe is derived inline
 * inside the compile-time scenarios gate in the Combat presentation entry (so
 * no observation field name can reach the ordinary production artifact) and is
 * proven end-to-end by the Pass B browser evidence and the artifact-hygiene
 * regression.
 */
describe('V02-WI-06 E04-C02 Elite workload counters (Pass A)', () => {
  it('separates entry, activation/anchor, and both active phases with exact observed durations', () => {
    const accumulator = recordEliteSteps([
      // Two executed entry steps: the Elite is present but not yet activated.
      { enemies: [eliteEnemy('entering', { centerX: 683, centerY: -10 })] },
      { enemies: [eliteEnemy('entering', { centerX: 683, centerY: 30 })] },
      // Activation step: the centre clamps exactly to the authored anchor.
      { enemies: [eliteEnemy('armoured', ANCHOR)] },
      // One more Armoured step, then the phase boundary step itself belongs to
      // the new Vulnerable phase, then one further Vulnerable step.
      {
        enemies: [
          eliteEnemy('armoured', { centerX: 700, centerY: ANCHOR.centerY }),
        ],
      },
      {
        enemies: [
          eliteEnemy('vulnerable', { centerX: 720, centerY: ANCHOR.centerY }),
        ],
      },
      {
        enemies: [
          eliteEnemy('vulnerable', { centerX: 740, centerY: ANCHOR.centerY }),
        ],
      },
      // The next phase boundary completes the Vulnerable phase: both observed
      // durations are recorded from the executed steps only.
      {
        enemies: [
          eliteEnemy('armoured', { centerX: 760, centerY: ANCHOR.centerY }),
        ],
      },
    ]);
    const elite = accumulator.record().eliteWorkload;
    expect(elite.eliteCreationSteps).toBe(1);
    expect(elite.eliteEntrySteps).toBe(2);
    expect(elite.activeEliteSteps).toBe(5);
    expect(elite.anchorSteps).toBe(1);
    expect(elite.armouredSteps).toBe(3);
    expect(elite.vulnerableSteps).toBe(2);
    expect(elite.phaseOrder).toEqual(['armoured', 'vulnerable', 'armoured']);
    expect(elite.phaseDurations).toEqual([2, 2]);
    expect(elite.elitePresenceViolationSteps).toBe(0);
  });

  it('records the authoritative mission step on which the Elite was created', () => {
    const accumulator = recordEliteSteps([
      {
        enemies: [eliteEnemy('entering', { centerX: 683, centerY: -10 })],
        missionStepCount: 19200,
      },
      {
        enemies: [eliteEnemy('entering', { centerX: 683, centerY: 30 })],
        missionStepCount: 19201,
      },
      { enemies: [eliteEnemy('armoured', ANCHOR)], missionStepCount: 19320 },
    ]);
    const elite = accumulator.record().eliteWorkload;
    expect(elite.eliteCreationSteps).toBe(1);
    expect(elite.eliteCreationMissionStep).toBe(19200);
  });

  it('counts the two cannon streams from the authoritative projectile direction and the Core cap separately', () => {
    const accumulator = recordEliteSteps([
      {
        enemies: [eliteEnemy('armoured', ANCHOR)],
        projectiles: [cannonCannon(0, 'left'), cannonCannon(1, 'right')],
      },
      {
        enemies: [eliteEnemy('armoured', ANCHOR)],
        // Only the left stream is still flying: no pair step this step.
        projectiles: [cannonCannon(0, 'left')],
      },
      {
        enemies: [eliteEnemy('vulnerable', ANCHOR)],
        projectiles: [homingCore(2), homingCore(3)],
      },
      // A later step observes the same two Cores: distinct creation is 2, the
      // simultaneous maximum stays 2, and Ranged projectiles are ignored.
      {
        enemies: [eliteEnemy('vulnerable', ANCHOR)],
        projectiles: [homingCore(2), homingCore(3), { id: 9, kind: 'ranged' }],
      },
    ]);
    const elite = accumulator.record().eliteWorkload;
    expect(elite.leftCannonProjectilesObserved).toBe(1);
    expect(elite.rightCannonProjectilesObserved).toBe(1);
    expect(elite.eliteCannonProjectilesMax).toBe(2);
    expect(elite.cannonPairSteps).toBe(1);
    expect(elite.homingCoresObserved).toBe(2);
    expect(elite.maxActiveHomingCores).toBe(2);
    expect(elite.homingCoreActiveSteps).toBe(2);
  });

  it('proves continuous player fire only on steps where an active projectile really existed', () => {
    const accumulator = recordEliteSteps([
      { enemies: [eliteEnemy('armoured', ANCHOR)], players: 5 },
      { enemies: [eliteEnemy('armoured', ANCHOR)], players: 4 },
      { enemies: [eliteEnemy('armoured', ANCHOR)], players: 0 },
      { enemies: [basicEnemy(0)], players: 4 },
    ]);
    const elite = accumulator.record().eliteWorkload;
    expect(elite.activeEliteSteps).toBe(3);
    expect(elite.eliteWorkloadPlayerFireSteps).toBe(2);
  });

  it('flags any second Elite present on the same step', () => {
    const accumulator = recordEliteSteps([
      {
        enemies: [
          eliteEnemy('armoured', ANCHOR, 0),
          eliteEnemy('armoured', ANCHOR, 1),
        ],
      },
      { enemies: [eliteEnemy('armoured', ANCHOR)] },
    ]);
    const elite = accumulator.record().eliteWorkload;
    expect(elite.elitePresenceViolationSteps).toBe(1);
    expect(elite.eliteCreationSteps).toBe(2);
    expect(elite.activeEliteSteps).toBe(3);
  });

  it('returns a detached Elite workload snapshot (later steps do not mutate it)', () => {
    const accumulator = recordEliteSteps([
      { enemies: [eliteEnemy('armoured', ANCHOR)] },
      { enemies: [eliteEnemy('vulnerable', ANCHOR)] },
    ]);
    const before = accumulator.record().eliteWorkload;
    accumulator.recordStep(
      [eliteEnemy('vulnerable', ANCHOR)],
      6,
      [],
      ANCHOR,
      1,
      createCollisionEvidenceSink(),
    );
    expect(before.phaseOrder).toEqual(['armoured', 'vulnerable']);
    expect(before.phaseDurations).toEqual([1]);
    expect(before.vulnerableSteps).toBe(1);
    expect(accumulator.record().eliteWorkload.vulnerableSteps).toBe(2);
    expect(accumulator.record().eliteWorkload.phaseOrder).toEqual([
      'armoured',
      'vulnerable',
    ]);
  });
});
