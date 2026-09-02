import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_COUNTERS_ENABLED,
  EVIDENCE_MODE,
  EVIDENCE_SCENARIOS_ENABLED,
  createCollisionEvidenceSink,
  createCombatEvidenceAccumulator,
} from './evidence';

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
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'ranged-drone' },
        { type: 'hunter-drone' },
      ],
      2,
      0,
      firstSink,
    );
    const secondSink = createCollisionEvidenceSink();
    secondSink.addPlayerProjectileCandidates(6);
    secondSink.addPlayerProjectileIntersections(3);
    accumulator.recordStep(
      [
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'ranged-drone' },
        { type: 'hunter-drone' },
      ],
      3,
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
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'ranged-drone' },
        { type: 'hunter-drone' },
      ],
      3,
      1,
      createCollisionEvidenceSink(),
    );
    // The exact e5-only state: EXACTLY 3 Basic + 1 Ranged + 1 Hunter + 0 Elite.
    accumulator.recordStep(
      [
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'ranged-drone' },
        { type: 'hunter-drone' },
      ],
      3,
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
      [{ type: 'basic-drone' }],
      1,
      0,
      createCollisionEvidenceSink(),
    );
    const before = accumulator.record();
    accumulator.recordStep(
      [
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'basic-drone' },
        { type: 'ranged-drone' },
        { type: 'hunter-drone' },
      ],
      2,
      0,
      createCollisionEvidenceSink(),
    );
    const after = accumulator.record();
    expect(before.activeEnemiesByRoleMax['basic-drone']).toBe(1);
    expect(before.steps).toBe(1);
    expect(after.activeEnemiesByRoleMax['basic-drone']).toBe(3);
    expect(after.steps).toBe(2);
  });
});
