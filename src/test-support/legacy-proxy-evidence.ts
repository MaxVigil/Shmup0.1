import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * V02-WI-07 D05-C01 legacy five-Basic proxy attempt persistence.
 *
 * The legacy proxy harness must never lose the facts of its own attempt. It
 * used to assert the 50 FPS floor (and then the cleanup state) before writing
 * anything, so a newly failed sample left no record at all — only an earlier
 * run's file could remain, which is not proof that the current attempt was
 * retained. This helper owns the persistence ORDER of one attempt:
 *
 * 1. the measured attempt facts are written BEFORE any budget assertion runs,
 *    so whatever happens afterwards the file on disk describes THIS attempt;
 * 2. the caller's unchanged budget assertions run; a throw leaves that raw
 *    attempt in place, still without a `cleanup` object, which is exactly what
 *    keeps a failed record comparator-ineligible instead of inventing a
 *    passing cleanup object;
 * 3. the cleanup phase is measured and asserted by the caller;
 * 4. only after step 3 returned the measured cleanup facts is the completed
 *    record written, replacing the raw attempt with the same measured facts
 *    plus that measured cleanup object.
 *
 * No assertion, floor, sample window, seed or workload is owned here; the
 * successful record shape is unchanged (`{...evidence, cleanup}`).
 */

export interface LegacyProxyRecordTarget {
  readonly evidenceDir: string;
  readonly recordName: string;
}

/** The cleanup facts measured from the real post-cleanup state. */
export interface LegacyProxyCleanupFacts {
  readonly operationsVisible: boolean;
  readonly canvasCount: number;
  readonly combatHudCount: number;
  readonly dialogOverlayCount: number;
}

export interface LegacyProxyAttemptResult {
  readonly attemptPath: string;
  readonly recordPath: string;
  readonly record: Record<string, unknown>;
}

export function legacyProxyRecordPath(target: LegacyProxyRecordTarget): string {
  return join(target.evidenceDir, target.recordName);
}

/** Writes this attempt's measured facts with no cleanup object. */
export function writeLegacyProxyAttemptRecord(
  target: LegacyProxyRecordTarget,
  attempt: Record<string, unknown>,
): string {
  return writeLegacyProxyRecord(target, attempt);
}

/** Writes the completed record: this attempt's facts plus the measured cleanup. */
export function writeLegacyProxyCompletedRecord(
  target: LegacyProxyRecordTarget,
  attempt: Record<string, unknown>,
  cleanup: LegacyProxyCleanupFacts,
): LegacyProxyAttemptResult {
  const record = { ...attempt, cleanup };
  return {
    attemptPath: legacyProxyRecordPath(target),
    recordPath: writeLegacyProxyRecord(target, record),
    record,
  };
}

function writeLegacyProxyRecord(
  target: LegacyProxyRecordTarget,
  record: Record<string, unknown>,
): string {
  mkdirSync(target.evidenceDir, { recursive: true });
  const path = legacyProxyRecordPath(target);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

/**
 * Runs one legacy proxy attempt through the persistence order above.
 * `assertBudgets` and `completeWithMeasuredCleanup` hold the harness's own
 * unchanged assertions; this function only decides when the record is written
 * relative to them and never invokes either one twice.
 */
export async function recordLegacyProxyAttempt(options: {
  readonly target: LegacyProxyRecordTarget;
  readonly attempt: Record<string, unknown>;
  readonly assertBudgets: () => void;
  readonly completeWithMeasuredCleanup: () => Promise<LegacyProxyCleanupFacts>;
}): Promise<LegacyProxyAttemptResult> {
  const attemptPath = writeLegacyProxyAttemptRecord(
    options.target,
    options.attempt,
  );
  options.assertBudgets();
  const cleanup = await options.completeWithMeasuredCleanup();
  const completed = writeLegacyProxyCompletedRecord(
    options.target,
    options.attempt,
    cleanup,
  );
  return { ...completed, attemptPath };
}
