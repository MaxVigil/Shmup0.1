#!/usr/bin/env node
/**
 * V02-WI-04 C05 machine-readable performance comparison package (Epic §20.1,
 * V02-AC-028; C03/C04 delta 8/9, C05 deltas 1-6). Reads the approved records
 * from `.agent-handoff/evidence/` and emits ONE comparison JSON that links:
 *   - base legacy five-Basic production proxy (identity-hook method);
 *   - post-integration legacy five-Basic production proxy (same method);
 *   - instrumented regular maxima (Pass A);
 *   - uninstrumented regular timing/memory/cleanup (Pass B).
 *
 * Every local result is explicitly labelled non-reference proxy evidence and
 * never claims physical reference-device validation. The package FAILS
 * (non-zero exit) when any integrity fact cannot be produced truthfully:
 *   - the fixed session/canonical seeds are missing or mismatch across records;
 *   - the regular workload is not proven EXACT (role object must be exactly
 *     3 Basic + 1 Ranged + 1 Hunter + 0 Elite AND exactRegularWorkloadSteps
 *     > 0 — either alone is insufficient);
 *   - the canonical Ranged path is missing (no active enemy projectile and no
 *     enemy-projectile collision candidate work);
 *   - build identity is missing or unknown;
 *   - the legacy benchmark method or fixed seed differs between sides;
 *   - a timing record carries instrumented maxima (timing must be
 *     uninstrumented);
 *   - a machine-readable cleanup object is missing, malformed, or non-zero in
 *     Pass B and both legacy timing records;
 *   - required percentile/minimum-window/heap/cleanup fields are missing;
 *   - artifact scans show counter symbols compiled into the ordinary Pass B
 *     bundle or the uninstrumented-scenario bundle (allowed scenario identity
 *     APIs remain, workload counters must be compile-time absent);
 *   - any record lacks the current control runId or the current-source
 *     fingerprint, or the fingerprint differs across records / from the tree;
 *   - any sustained or minimum-window result falls below 50 FPS.
 * The package exposes every per-record fact and every check result, not only
 * `assertionsPassed`.
 *
 * The evaluation core is exported for mutation-level coverage
 * (`npm run evidence:mutation`); running this file directly is the CLI entry.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { computeSourceFingerprint } from './evidence-source-fingerprint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_EVIDENCE_DIR = join(ROOT, '.agent-handoff', 'evidence');
const SESSION_SEED = 19023;
const CANONICAL_MISSION_SEED = 609704137;
const KNOWN_BASE_REVISION = '168822f4fac647c8a14ffe751c3c2363c7a71c41';

/** Counter API/symbol set that MUST be compile-time absent from every timing
 *  artifact (ordinary Pass B bundle and uninstrumented-scenario bundle). These
 *  are the per-step workload counter record keys and maxima — they exist only
 *  when the instrumented Pass A accumulator is compiled in. */
export const COUNTER_SYMBOLS = [
  'exactRegularWorkloadSteps',
  'workloadReachedSteps',
  'collisionWorkMax',
  'activeEnemiesByRoleMax',
  'activeEnemyProjectilesMax',
  'activePlayerProjectilesMax',
];

/** Scenario-only identity APIs that MAY remain in the authorized
 *  uninstrumented-scenario artifact (they establish workload identity without
 *  timing instrumentation) but must NEVER appear in the ordinary bundle. */
export const SCENARIO_SYMBOLS = [
  '__shmupEvidence__',
  '__legacyBenchmarkIdentity__',
  'runBenchmarkScenario',
  'readActiveByType',
];

export const RECORD_FILES = [
  'v02-wi-04-instrumented-regular-workload.json',
  'v02-wi-04-uninstrumented-regular-workload.json',
  'base-legacy-five-basic.json',
  'post-integration-legacy-five-basic.json',
];

function scanAssetsForSymbols(assetDir, symbols) {
  const files = existsSync(join(assetDir, 'assets'))
    ? readdirSync(join(assetDir, 'assets')).filter((file) =>
        file.endsWith('.js'),
      )
    : [];
  const leaks = [];
  for (const file of files) {
    const content = readFileSync(join(assetDir, 'assets', file), 'utf8');
    for (const symbol of symbols) {
      if (content.includes(symbol)) {
        leaks.push({ symbol, file });
      }
    }
  }
  return { assetDir, filesScanned: files.length, leaks };
}

function readRecordFrom(evidenceDir, fileName) {
  const path = join(evidenceDir, fileName);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readControlRunId(rootDir) {
  const controlPath = join(rootDir, '.agent-handoff', 'control.json');
  if (!existsSync(controlPath)) {
    return null;
  }
  const control = JSON.parse(readFileSync(controlPath, 'utf8'));
  return typeof control.runId === 'string' ? control.runId : null;
}

/** Expected C05 record ownership fields: every record carries the current
 *  control runId and the common current-source fingerprint. */
export function readRecordOwnership(record) {
  const raw =
    record && typeof record.sourceFingerprint === 'object'
      ? record.sourceFingerprint
      : null;
  return {
    runId: record && typeof record.runId === 'string' ? record.runId : null,
    sourceFingerprint:
      raw !== null &&
      typeof raw.head === 'string' &&
      typeof raw.digest === 'string'
        ? raw
        : null,
  };
}

/** A cleanup object is valid only when it is machine-readable, was recorded
 *  after the cleanup assertions passed, and carries exact zero residue. */
export function isValidCleanupObject(cleanup) {
  return (
    cleanup !== null &&
    typeof cleanup === 'object' &&
    cleanup.operationsVisible === true &&
    typeof cleanup.canvasCount === 'number' &&
    cleanup.canvasCount === 0 &&
    typeof cleanup.combatHudCount === 'number' &&
    cleanup.combatHudCount === 0 &&
    typeof cleanup.dialogOverlayCount === 'number' &&
    cleanup.dialogOverlayCount === 0
  );
}

function requiredTimingFields(check, record, prefix) {
  if (record === null) {
    return;
  }
  check(
    record.frameTimeMs &&
      typeof record.frameTimeMs.mean === 'number' &&
      typeof record.frameTimeMs.p95 === 'number' &&
      typeof record.frameTimeMs.p99 === 'number' &&
      typeof record.frameTimeMs.max === 'number',
    `${prefix}-frame-percentiles`,
    'mean/p95/p99/max frame time must be present',
  );
  check(
    typeof record.sustainedFps === 'number' &&
      typeof record.minimumSustainedWindowFps === 'number',
    `${prefix}-minimum-window-fps`,
    'sustainedFps and minimumSustainedWindowFps must be present',
  );
  check(
    record.longTasks &&
      typeof record.longTasks.count === 'number' &&
      typeof record.longTasks.maxMs === 'number',
    `${prefix}-long-tasks`,
    'longTasks count/maxMs must be present',
  );
  check(
    typeof record.heapUsedBeforeGcBytes === 'number' &&
      typeof record.heapUsedAfterGcBytes === 'number',
    `${prefix}-heap`,
    'heap used before/after must be present',
  );
  check(
    record.pageErrors === 0,
    `${prefix}-page-errors`,
    `page errors must be zero (got ${record.pageErrors})`,
  );
  // C05: passing results must never be worded as below the minimum.
  check(
    typeof record.sustainedFps === 'number' && record.sustainedFps >= 50,
    `${prefix}-sustained-50`,
    `sustained FPS must be >= 50 (got ${record.sustainedFps})`,
  );
  check(
    typeof record.minimumSustainedWindowFps === 'number' &&
      record.minimumSustainedWindowFps >= 50,
    `${prefix}-min-window-50`,
    `minimum sustained window FPS must be >= 50 (got ${record.minimumSustainedWindowFps})`,
  );
}

/**
 * Runs every evidence-integrity check against the approved records and writes
 * the comparison package. Returns `{ checks, failures, packageRecord }`.
 * `options` overrides the roots for mutation-level coverage:
 *   - rootDir, evidenceDir, distDir, uninstrumentedDir
 *   - expectedRunId (default: the active control.json runId)
 *   - currentFingerprint (default: recomputed from the current source tree)
 *   - writePackage (default: true)
 */
export function evaluateEvidenceComparison(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const evidenceDir = options.evidenceDir ?? DEFAULT_EVIDENCE_DIR;
  const expectedRunId =
    options.expectedRunId ??
    readControlRunId(rootDir) ??
    'MISSING-CONTROL-RUN-ID';
  const currentFingerprint =
    options.currentFingerprint ?? computeSourceFingerprint(rootDir);
  const distDir = options.distDir ?? join(rootDir, 'dist');
  const uninstrumentedDir =
    options.uninstrumentedDir ?? join(rootDir, 'dist-evidence-uninstrumented');
  const writePackage = options.writePackage ?? true;

  const failures = [];
  const checks = [];
  function check(condition, name, message) {
    checks.push({ name, passed: Boolean(condition), message });
    if (!condition) {
      failures.push(`${name}: ${message}`);
    }
  }

  const passA = readRecordFrom(evidenceDir, RECORD_FILES[0]);
  const passB = readRecordFrom(evidenceDir, RECORD_FILES[1]);
  const baseLegacy = readRecordFrom(evidenceDir, RECORD_FILES[2]);
  const postLegacy = readRecordFrom(evidenceDir, RECORD_FILES[3]);

  // -------------------------------------------------------------------------
  // 1. Fixed seed identity across Pass A and Pass B.
  // -------------------------------------------------------------------------
  check(
    passA?.sessionSeed === SESSION_SEED,
    'pass-a-session-seed',
    `Pass A sessionSeed must be ${SESSION_SEED} (got ${passA?.sessionSeed})`,
  );
  check(
    passB?.sessionSeed === SESSION_SEED,
    'pass-b-session-seed',
    `Pass B sessionSeed must be ${SESSION_SEED} (got ${passB?.sessionSeed})`,
  );
  check(
    passA?.canonicalSeed === CANONICAL_MISSION_SEED &&
      passB?.canonicalSeed === CANONICAL_MISSION_SEED,
    'canonical-seed-identity',
    `Pass A seed ${passA?.canonicalSeed} and Pass B seed ${passB?.canonicalSeed} must both be ${CANONICAL_MISSION_SEED}`,
  );

  // -------------------------------------------------------------------------
  // 2. EXACT regular workload (C05 delta 1: the ROLE OBJECT must itself be
  //    exactly 3 Basic + 1 Ranged + 1 Hunter + 0 Elite; exactRegularWorkload
  //    Steps alone is insufficient because a mutated role object can keep the
  //    step counter while contradicting it) + canonical Ranged path.
  // -------------------------------------------------------------------------
  if (passA) {
    const maxima = passA.observedMaxima;
    check(
      maxima != null && maxima.exactRegularWorkloadSteps > 0,
      'pass-a-exact-workload',
      `Pass A must prove an EXACT 3+1+1+0 simultaneous state (got exactRegularWorkloadSteps=${maxima?.exactRegularWorkloadSteps})`,
    );
    check(
      maxima != null &&
        maxima.activeEnemiesByRole != null &&
        maxima.activeEnemiesByRole['basic-drone'] === 3 &&
        maxima.activeEnemiesByRole['ranged-drone'] === 1 &&
        maxima.activeEnemiesByRole['hunter-drone'] === 1 &&
        maxima.activeEnemiesByRole['elite-drone'] === 0,
      'pass-a-exact-role-object',
      `Pass A active role object must be exactly {basic-drone: 3, ranged-drone: 1, hunter-drone: 1, elite-drone: 0} (got ${JSON.stringify(maxima?.activeEnemiesByRole)})`,
    );
    check(
      maxima != null && maxima.activeEnemyProjectiles >= 1,
      'pass-a-enemy-projectiles',
      `Pass A must observe at least one active enemy projectile (got ${maxima?.activeEnemyProjectiles})`,
    );
    check(
      maxima != null &&
        maxima.collisionWorkMax &&
        maxima.collisionWorkMax.enemyProjectileCandidates > 0,
      'pass-a-enemy-projectile-work',
      `Pass A must observe non-zero enemy-projectile collision candidate work (got ${maxima?.collisionWorkMax?.enemyProjectileCandidates})`,
    );
    check(
      maxima != null &&
        maxima.collisionWorkMax &&
        maxima.collisionWorkMax.playerProjectileCandidates > 0 &&
        maxima.collisionWorkMax.contactCandidates > 0,
      'pass-a-player-contact-work',
      'Pass A must observe player-projectile and contact collision candidate work',
    );
    check(
      maxima != null && typeof maxima.steps === 'number' && maxima.steps > 0,
      'pass-a-observed-steps',
      'Pass A must contain a real observed step count',
    );
  }

  // -------------------------------------------------------------------------
  // 3. Timing must come from uninstrumented artifacts (JSON-level: no
  //    observedMaxima) plus the C05 cleanup objects in every timing record.
  // -------------------------------------------------------------------------
  check(
    passA != null && passB != null,
    'regular-records-present',
    'Pass A and Pass B records must both exist',
  );
  check(
    passB?.observedMaxima == null,
    'pass-b-uninstrumented',
    'Pass B (uninstrumented timing) must NOT carry observedMaxima',
  );
  for (const [name, record] of [
    ['base-legacy', baseLegacy],
    ['post-legacy', postLegacy],
  ]) {
    check(
      record?.observedMaxima == null,
      `${name}-uninstrumented`,
      `${name} (timing) must NOT carry observedMaxima`,
    );
    check(
      record?.identityProof != null &&
        record.identityProof['basic-drone'] === 5 &&
        record.identityProof['ranged-drone'] === 0 &&
        record.identityProof['hunter-drone'] === 0 &&
        record.identityProof['elite-drone'] === 0,
      `${name}-exact-five-basic`,
      `${name} must prove exactly 5 Basic + 0 other enemies concurrently`,
    );
    check(
      isValidCleanupObject(record?.cleanup),
      `${name}-cleanup-object`,
      `${name} must carry a machine-readable cleanup object with operationsVisible true and zero canvas/hud/dialog counts (got ${JSON.stringify(record?.cleanup)})`,
    );
  }
  check(
    isValidCleanupObject(passB?.cleanup),
    'pass-b-cleanup-object',
    `Pass B must carry a machine-readable cleanup object with operationsVisible true and zero canvas/hud/dialog counts (got ${JSON.stringify(passB?.cleanup)})`,
  );

  // -------------------------------------------------------------------------
  // 4. Build identity + same benchmark method + fixed seed.
  // -------------------------------------------------------------------------
  check(
    baseLegacy?.buildIdentifier != null &&
      baseLegacy.buildIdentifier.includes(KNOWN_BASE_REVISION),
    'base-build-identity',
    `base buildIdentifier must include the known revision ${KNOWN_BASE_REVISION} (got ${baseLegacy?.buildIdentifier})`,
  );
  check(
    postLegacy?.buildIdentifier != null &&
      !postLegacy.buildIdentifier.includes('unknown'),
    'post-build-identity',
    'post-integration buildIdentifier must not be unknown',
  );
  check(
    baseLegacy?.workloadMethod != null &&
      postLegacy?.workloadMethod != null &&
      baseLegacy.workloadMethod === postLegacy.workloadMethod,
    'same-benchmark-method',
    'base and post-integration must use the same exact five-Basic materialization',
  );
  check(
    baseLegacy?.sessionSeed === SESSION_SEED &&
      postLegacy?.sessionSeed === SESSION_SEED,
    'legacy-fixed-seed',
    `base and post-integration legacy proxies must both use the fixed session seed ${SESSION_SEED}`,
  );

  // -------------------------------------------------------------------------
  // 5. Full timing fields in every record.
  // -------------------------------------------------------------------------
  requiredTimingFields(check, baseLegacy, 'base-legacy');
  requiredTimingFields(check, postLegacy, 'post-legacy');
  requiredTimingFields(check, passB, 'pass-b');
  if (passB) {
    check(
      typeof passB.frameTimeMs?.count === 'number' &&
        passB.frameTimeMs.count > 100,
      'pass-b-sample-size',
      `Pass B frame sample must exceed 100 frames (got ${passB.frameTimeMs?.count})`,
    );
    check(
      typeof passB.canonicalSeed === 'number',
      'pass-b-canonical-seed-field',
      'Pass B must record the canonical seed',
    );
  }

  // -------------------------------------------------------------------------
  // 6. C05 artifact counter-elimination facts: scan the ACTUAL measured
  //    bundles (ordinary Pass B + uninstrumented-scenario), not just the JSON.
  //    Scenario-only identity APIs may remain in the uninstrumented artifact;
  //    every workload counter symbol must be compile-time absent. The scan
  //    facts (artifact path + zero leaks) are recorded and required.
  // -------------------------------------------------------------------------
  const ordinaryScan = scanAssetsForSymbols(distDir, [
    ...COUNTER_SYMBOLS,
    ...SCENARIO_SYMBOLS,
  ]);
  const uninstrumentedScan = scanAssetsForSymbols(
    uninstrumentedDir,
    COUNTER_SYMBOLS,
  );
  check(
    ordinaryScan.assetDir !== undefined && ordinaryScan.filesScanned > 0,
    'ordinary-bundle-scan-fact',
    `ordinary Pass B artifact scan must run over real assets (scanned ${ordinaryScan.filesScanned} files in ${ordinaryScan.assetDir})`,
  );
  check(
    ordinaryScan.leaks.length === 0,
    'ordinary-bundle-counter-leak',
    `ordinary Pass B bundle must contain NO counter or scenario symbols (leaks: ${JSON.stringify(ordinaryScan.leaks)})`,
  );
  check(
    uninstrumentedScan.assetDir !== undefined &&
      uninstrumentedScan.filesScanned > 0,
    'uninstrumented-bundle-scan-fact',
    `uninstrumented-scenario artifact scan must run over real assets (scanned ${uninstrumentedScan.filesScanned} files in ${uninstrumentedScan.assetDir})`,
  );
  check(
    uninstrumentedScan.leaks.length === 0,
    'uninstrumented-bundle-counter-leak',
    `uninstrumented-scenario bundle must contain NO workload counter symbols (leaks: ${JSON.stringify(uninstrumentedScan.leaks)})`,
  );

  // -------------------------------------------------------------------------
  // 7. C05 runId + source-fingerprint coherence: every record must carry the
  //    expected control runId and the SAME current-source fingerprint, and the
  //    fingerprint must match the current tree at validation time.
  // -------------------------------------------------------------------------
  for (const [name, record] of [
    ['pass-a', passA],
    ['pass-b', passB],
    ['base-legacy', baseLegacy],
    ['post-legacy', postLegacy],
  ]) {
    const ownership = readRecordOwnership(record);
    check(
      ownership.runId === expectedRunId,
      `${name}-run-id`,
      `${name} runId must be ${expectedRunId} (got ${ownership.runId})`,
    );
    check(
      ownership.sourceFingerprint != null,
      `${name}-fingerprint-present`,
      `${name} must carry the source fingerprint {head, digest}`,
    );
    check(
      ownership.sourceFingerprint != null &&
        ownership.sourceFingerprint.head === currentFingerprint.head &&
        ownership.sourceFingerprint.digest === currentFingerprint.digest,
      `${name}-fingerprint-current`,
      `${name} fingerprint ${JSON.stringify(ownership.sourceFingerprint)} must match the current source fingerprint ${JSON.stringify(currentFingerprint)}`,
    );
  }

  // -------------------------------------------------------------------------
  // Package record exposing every fact (C05: exact-role, cleanup, scan,
  // runId, and fingerprint facts are all exposed, not only assertionsPassed).
  // -------------------------------------------------------------------------
  const packageRecord = {
    label:
      'V02-WI-04 C05 performance comparison package — every linked record is non-reference local proxy evidence; no physical reference-device validation is claimed',
    expectedRunId,
    sourceFingerprint: currentFingerprint,
    fixedSessionSeed: SESSION_SEED,
    canonicalMissionSeed: CANONICAL_MISSION_SEED,
    machine: passB?.machine ?? passA?.machine ?? null,
    checks,
    assertionsPassed: failures.length === 0,
    artifactScans: {
      ordinaryPassBBundle: {
        path: distDir,
        scannedJsFiles: ordinaryScan.filesScanned,
        counterOrScenarioSymbolLeaks: ordinaryScan.leaks,
      },
      uninstrumentedScenarioBundle: {
        path: uninstrumentedDir,
        scannedJsFiles: uninstrumentedScan.filesScanned,
        counterSymbolLeaks: uninstrumentedScan.leaks,
      },
    },
    records: {
      baseLegacyProxy: {
        path: 'base-legacy-five-basic.json',
        buildIdentifier: baseLegacy?.buildIdentifier ?? null,
        side: baseLegacy?.side ?? null,
        workloadMethod: baseLegacy?.workloadMethod ?? null,
        identityProof: baseLegacy?.identityProof ?? null,
        runId: readRecordOwnership(baseLegacy).runId,
        sourceFingerprint: readRecordOwnership(baseLegacy).sourceFingerprint,
        cleanup: baseLegacy?.cleanup ?? null,
        timing: baseLegacy
          ? {
              frameTimeMs: baseLegacy.frameTimeMs,
              sustainedFps: baseLegacy.sustainedFps,
              minimumSustainedWindowFps: baseLegacy.minimumSustainedWindowFps,
              longTasks: baseLegacy.longTasks,
              heapUsedBeforeGcBytes: baseLegacy.heapUsedBeforeGcBytes,
              heapUsedAfterGcBytes: baseLegacy.heapUsedAfterGcBytes,
              pageErrors: baseLegacy.pageErrors,
            }
          : null,
      },
      postIntegrationLegacyProxy: {
        path: 'post-integration-legacy-five-basic.json',
        buildIdentifier: postLegacy?.buildIdentifier ?? null,
        side: postLegacy?.side ?? null,
        workloadMethod: postLegacy?.workloadMethod ?? null,
        identityProof: postLegacy?.identityProof ?? null,
        runId: readRecordOwnership(postLegacy).runId,
        sourceFingerprint: readRecordOwnership(postLegacy).sourceFingerprint,
        cleanup: postLegacy?.cleanup ?? null,
        timing: postLegacy
          ? {
              frameTimeMs: postLegacy.frameTimeMs,
              sustainedFps: postLegacy.sustainedFps,
              minimumSustainedWindowFps: postLegacy.minimumSustainedWindowFps,
              longTasks: postLegacy.longTasks,
              heapUsedBeforeGcBytes: postLegacy.heapUsedBeforeGcBytes,
              heapUsedAfterGcBytes: postLegacy.heapUsedAfterGcBytes,
              pageErrors: postLegacy.pageErrors,
            }
          : null,
      },
      instrumentedRegularMaxima: {
        path: 'v02-wi-04-instrumented-regular-workload.json',
        buildIdentifier: passA?.buildIdentifier ?? null,
        sessionSeed: passA?.sessionSeed ?? null,
        canonicalSeed: passA?.canonicalSeed ?? null,
        runId: readRecordOwnership(passA).runId,
        sourceFingerprint: readRecordOwnership(passA).sourceFingerprint,
        observedMaxima: passA?.observedMaxima ?? null,
        pageErrors: passA?.pageErrors ?? null,
      },
      uninstrumentedRegularTiming: {
        path: 'v02-wi-04-uninstrumented-regular-workload.json',
        buildIdentifier: passB?.buildIdentifier ?? null,
        sessionSeed: passB?.sessionSeed ?? null,
        canonicalSeed: passB?.canonicalSeed ?? null,
        runId: readRecordOwnership(passB).runId,
        sourceFingerprint: readRecordOwnership(passB).sourceFingerprint,
        cleanup: passB?.cleanup ?? null,
        frameTimeMs: passB?.frameTimeMs ?? null,
        sustainedFps: passB?.sustainedFps ?? null,
        minimumSustainedWindowFps: passB?.minimumSustainedWindowFps ?? null,
        longTasks: passB?.longTasks ?? null,
        heapUsedBeforeGcBytes: passB?.heapUsedBeforeGcBytes ?? null,
        heapUsedAfterGcBytes: passB?.heapUsedAfterGcBytes ?? null,
        requestsDuringRun: passB?.requestsDuringRun ?? null,
        pageErrors: passB?.pageErrors ?? null,
      },
    },
  };

  if (writePackage) {
    mkdirSync(evidenceDir, { recursive: true });
    const outPath = join(evidenceDir, 'v02-wi-04-comparison-package.json');
    writeFileSync(outPath, `${JSON.stringify(packageRecord, null, 2)}\n`);
  }
  return { checks, failures, packageRecord };
}

/** CLI entry: validate the real records and exit non-zero on any failure. */
function main() {
  const result = evaluateEvidenceComparison();
  console.log(
    'V02-WI04-COMPARISON-PACKAGE',
    JSON.stringify(result.packageRecord),
  );
  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      console.error(`ASSERTION FAILED: ${failure}`);
    }
    console.error(
      `Comparison package assertions failed (${result.failures.length}):\n- ${result.failures.join('\n- ')}`,
    );
    process.exit(1);
  }
  console.log('Comparison package assertions passed.');
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
