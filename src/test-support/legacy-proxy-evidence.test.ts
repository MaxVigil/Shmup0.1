import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  legacyProxyRecordPath,
  recordLegacyProxyAttempt,
} from './legacy-proxy-evidence';

/**
 * V02-WI-07 D05-C01 raw-failure persistence regression.
 *
 * The legacy five-Basic proxy harness used to assert its 50 FPS floor before
 * writing anything, so a newly failed sample was never written at all: the only
 * file a reviewer could find was a stale record from an earlier attempt, which
 * is not proof that the current attempt was retained. These cases exercise the
 * real writer/ordering path with an injected low-FPS sample and prove that:
 * the attempt's own measured facts are persisted before the floor assertion
 * rejects it, that they survive the rejection without a second invocation or a
 * favourable replacement, that no cleanup object is invented, and that the
 * measured cleanup object is added only after the cleanup phase passed.
 */
const RUN_ID = 'v02-wi-07-performance-d05-c01-0c8901d';
const SOURCE_FINGERPRINT = { head: 'a'.repeat(40), digest: 'c01c01c0' };
const RECORD_NAME = 'base-legacy-five-basic.json';

const FAILING_TIMING = {
  frameTimeMs: { count: 361, mean: 23.7, p95: 30.1, p99: 41.4, max: 52.6 },
  sustainedFps: 42.1,
  minimumSustainedWindowFps: 41.3,
};
const PASSING_TIMING = {
  frameTimeMs: { count: 361, mean: 16.6, p95: 17.2, p99: 17.6, max: 24.8 },
  sustainedFps: 60,
  minimumSustainedWindowFps: 55.2,
};

/** The record an earlier passing run could have left behind. */
const STALE_PASSING_RECORD = {
  side: 'base',
  runId: 'parent-run-id',
  sustainedFps: 60.1,
  minimumSustainedWindowFps: 60,
  cleanup: {
    operationsVisible: true,
    canvasCount: 0,
    combatHudCount: 0,
    dialogOverlayCount: 0,
  },
};

function measuredAttempt(timing: typeof FAILING_TIMING) {
  return {
    label:
      'legacy five-Basic production proxy — non-reference local proxy evidence (V02-AC-028, Epic §20.1)',
    buildIdentifier: '[shmup] build shmup@0.1.0 (0c8901d-dirty)',
    side: 'base',
    viewport: { width: 1366, height: 768 },
    sessionSeed: 19023,
    identityProof: {
      'basic-drone': 5,
      'ranged-drone': 0,
      'hunter-drone': 0,
      'elite-drone': 0,
    },
    sampleWindowMs: 6004,
    longTasks: { count: 0, maxMs: 0 },
    heapUsedBeforeGcBytes: 8_132_932,
    heapUsedAfterGcBytes: 8_100_544,
    runId: RUN_ID,
    sourceFingerprint: SOURCE_FINGERPRINT,
    pageErrors: 0,
    ...timing,
  };
}

function readRecord(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('legacy proxy attempt persistence (V02-WI-07 D05-C01)', () => {
  const createdDirs: string[] = [];

  const makeTarget = () => {
    const evidenceDir = mkdtempSync(
      join(tmpdir(), 'shmup-legacy-proxy-attempt-'),
    );
    createdDirs.push(evidenceDir);
    return { evidenceDir, recordName: RECORD_NAME };
  };

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists this attempt's measured low-FPS values before the floor assertion rejects them", async () => {
    const target = makeTarget();
    const attempt = measuredAttempt(FAILING_TIMING);
    const path = legacyProxyRecordPath(target);
    writeFileSync(path, `${JSON.stringify(STALE_PASSING_RECORD, null, 2)}\n`);

    let budgetAssertions = 0;
    let cleanupPhases = 0;

    await expect(
      recordLegacyProxyAttempt({
        target,
        attempt,
        // The harness's unchanged floor, evaluated against the injected sample.
        assertBudgets: () => {
          budgetAssertions += 1;
          expect(attempt.frameTimeMs.count).toBeGreaterThan(100);
          expect(attempt.minimumSustainedWindowFps).toBeGreaterThanOrEqual(50);
        },
        completeWithMeasuredCleanup: async () => {
          cleanupPhases += 1;
          return {
            operationsVisible: true,
            canvasCount: 0,
            combatHudCount: 0,
            dialogOverlayCount: 0,
          };
        },
      }),
    ).rejects.toThrow(/greater than or equal to 50/);

    expect(budgetAssertions).toBe(1);
    expect(cleanupPhases).toBe(0);

    const record = readRecord(path);
    // The file describes THIS attempt, not the earlier favourable sample.
    expect(record['runId']).toBe(RUN_ID);
    expect(record['sourceFingerprint']).toEqual(SOURCE_FINGERPRINT);
    expect(record['minimumSustainedWindowFps']).toBe(41.3);
    expect(record['sustainedFps']).toBe(42.1);
    expect(record['sampleWindowMs']).toBe(6004);
    // No invented cleanup object, so a failed attempt stays comparator-ineligible.
    expect('cleanup' in record).toBe(false);
  });

  it('writes the raw attempt before cleanup is measured and finalizes it with the measured cleanup', async () => {
    const target = makeTarget();
    const attempt = measuredAttempt(PASSING_TIMING);
    const path = legacyProxyRecordPath(target);
    const rawSeenByCleanupPhase: Record<string, unknown>[] = [];

    const result = await recordLegacyProxyAttempt({
      target,
      attempt,
      assertBudgets: () => {
        expect(attempt.frameTimeMs.count).toBeGreaterThan(100);
        expect(attempt.minimumSustainedWindowFps).toBeGreaterThanOrEqual(50);
      },
      completeWithMeasuredCleanup: async () => {
        // Ordering proof: the raw attempt is already on disk when the cleanup
        // phase runs, and it is this attempt's own measurement with no cleanup.
        const onDisk = readRecord(path);
        rawSeenByCleanupPhase.push(onDisk);
        return {
          operationsVisible: true,
          canvasCount: 0,
          combatHudCount: 0,
          dialogOverlayCount: 0,
        };
      },
    });

    expect(rawSeenByCleanupPhase).toHaveLength(1);
    expect(rawSeenByCleanupPhase[0]?.['runId']).toBe(RUN_ID);
    expect(rawSeenByCleanupPhase[0]?.['minimumSustainedWindowFps']).toBe(55.2);
    expect('cleanup' in (rawSeenByCleanupPhase[0] ?? {})).toBe(false);

    const record = readRecord(path);
    // The successful record keeps the measured timing and gains the measured
    // cleanup object — the same shape the comparator accepts.
    expect(record['minimumSustainedWindowFps']).toBe(55.2);
    expect(record['sustainedFps']).toBe(60);
    expect(record['cleanup']).toEqual({
      operationsVisible: true,
      canvasCount: 0,
      combatHudCount: 0,
      dialogOverlayCount: 0,
    });
    expect(result.recordPath).toBe(path);
    expect(result.record).toEqual(record);
  });

  it('keeps the raw attempt when the cleanup phase prevents completion', async () => {
    const target = makeTarget();
    const attempt = measuredAttempt(PASSING_TIMING);
    const path = legacyProxyRecordPath(target);
    let cleanupPhases = 0;

    await expect(
      recordLegacyProxyAttempt({
        target,
        attempt,
        assertBudgets: () => {
          expect(attempt.minimumSustainedWindowFps).toBeGreaterThanOrEqual(50);
        },
        completeWithMeasuredCleanup: async () => {
          cleanupPhases += 1;
          // The cleanup assertions failed: a canvas was still mounted.
          throw new Error('expected canvas count 0, received 1');
        },
      }),
    ).rejects.toThrow('expected canvas count 0, received 1');

    expect(cleanupPhases).toBe(1);

    const record = readRecord(path);
    expect(record['runId']).toBe(RUN_ID);
    expect(record['minimumSustainedWindowFps']).toBe(55.2);
    expect('cleanup' in record).toBe(false);
  });
});
