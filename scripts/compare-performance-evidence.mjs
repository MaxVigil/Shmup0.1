#!/usr/bin/env node
/**
 * V02-WI-04 C05 machine-readable performance comparison package (Epic §20.1,
 * V02-AC-028; C03/C04 delta 8/9, C05 deltas 1-6; V02-WI-06 E04-C02). Reads the
 * approved records from `.agent-handoff/evidence/` and emits ONE comparison JSON
 * that links:
 *   - base legacy five-Basic production proxy (identity-hook method);
 *   - post-integration legacy five-Basic production proxy (same method);
 *   - instrumented regular maxima (Pass A);
 *   - uninstrumented regular timing/memory/cleanup (Pass B);
 *   - instrumented Elite workload maxima/identity (Elite Pass A);
 *   - uninstrumented Elite workload timing across the Armoured→Vulnerable
 *     interval (Elite Pass B).
 *
 * Every local result is explicitly labelled non-reference proxy evidence and
 * never claims physical reference-device validation. The package FAILS
 * (non-zero exit) when any integrity fact cannot be produced truthfully:
 *   - the fixed session/canonical seeds are missing or mismatch across records;
 *   - the canonical mission seed does not equal its canonical FNV-1a derivation;
 *   - the regular workload is not proven EXACT (role object must be exactly
 *     3 Basic + 1 Ranged + 1 Hunter + 0 Elite AND exactRegularWorkloadSteps
 *     > 0 — either alone is insufficient);
 *   - the canonical Ranged path is missing (no active enemy projectile and no
 *     enemy-projectile collision candidate work);
 *   - the Elite workload is not proven EXACT (not exactly one created Elite with
 *     no multi-Elite step, the Top entry and the exact anchor activation step,
 *     one complete 720-step Armoured phase followed by one complete 360-step
 *     Vulnerable phase in that order, continuous player fire on every
 *     activated-Elite step, both cannon streams, both projectile collision
 *     candidate paths, and the permitted simultaneous two-Core cap);
 *   - the Elite timing sample does not stay inside that workload across the
 *     Armoured→Vulnerable interval (ordered probes missing, malformed, or
 *     contradicting the phase order, the anchor row, the two cannon streams,
 *     continuous player fire, or the permitted Core cap; a terminal, Result
 *     Overlay, Game Over, or Base frame invalidates the sample);
 *   - build identity is missing or unknown;
 *   - the legacy benchmark method or fixed seed differs between sides;
 *   - a timing record carries instrumented maxima (timing must be
 *     uninstrumented);
 *   - a machine-readable cleanup object is missing, malformed, or non-zero in
 *     Pass B and both legacy timing records;
 *   - the Pass B workload-validity facts are missing or invalid: the authored
 *     `03:10` final arrival was not proven; the raw ordered probe array
 *     (pre-sample plus sample start/middle/end) is missing, malformed, has the
 *     wrong count or order, does not show exactly one canvas / one Combat HUD /
 *     the Combat Screen / the `00:00` Combat Countdown, or shows a dialog,
 *     Mission Result Overlay, Game Over Screen, or Operations Screen; the
 *     record's summary flags disagree with the facts recomputed from the raw
 *     probes (V02-WI-05 E02 C03–C04);
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
  // V02-WI-06 E04-C02 Elite workload counters (Pass A only). The Elite workload
  // CONTRACT key and every observed Elite counter name must be compile-time
  // absent from every timing artifact.
  'eliteWorkload',
  'eliteCreationSteps',
  'activeEliteSteps',
  'eliteEntrySteps',
  'elitePresenceViolationSteps',
  'anchorSteps',
  'armouredSteps',
  'vulnerableSteps',
  'eliteWorkloadPlayerFireSteps',
  'phaseOrder',
  'phaseDurations',
  'leftCannonProjectilesObserved',
  'rightCannonProjectilesObserved',
  'eliteCannonProjectilesMax',
  'cannonPairSteps',
  'homingCoresObserved',
  'maxActiveHomingCores',
  'homingCoreActiveSteps',
];

/** Scenario-only identity APIs that MAY remain in the authorized
 *  uninstrumented-scenario artifact (they establish workload identity without
 *  timing instrumentation) but must NEVER appear in the ordinary bundle. */
export const SCENARIO_SYMBOLS = [
  '__shmupEvidence__',
  '__legacyBenchmarkIdentity__',
  '__shmupEliteWorkload__',
  'runBenchmarkScenario',
  'readActiveByType',
  'readEliteWorkload',
  // V02-WI-06 E04-C02 Elite workload identity observation fields (scenarios
  // gate only). They are the identity facts the uninstrumented Pass B probe
  // reads, so they may remain in the scenario artifact but must never reach the
  // ordinary bundle.
  'elitePhaseStepsElapsed',
  'eliteAnchorRowAligned',
  'eliteActivated',
  'eliteCount',
  'activeCannonLeft',
  'activeCannonRight',
  'activeHomingCores',
];

export const RECORD_FILES = [
  'v02-wi-04-instrumented-regular-workload.json',
  'v02-wi-04-uninstrumented-regular-workload.json',
  'base-legacy-five-basic.json',
  'post-integration-legacy-five-basic.json',
  'v02-wi-06-instrumented-elite-workload.json',
  'v02-wi-06-uninstrumented-elite-workload.json',
];

const REGULAR_PASS_A_FILE = RECORD_FILES[0];
const REGULAR_PASS_B_FILE = RECORD_FILES[1];
const BASE_LEGACY_FILE = RECORD_FILES[2];
const POST_LEGACY_FILE = RECORD_FILES[3];
const ELITE_PASS_A_FILE = RECORD_FILES[4];
const ELITE_PASS_B_FILE = RECORD_FILES[5];

/** The fixed, ordered raw Elite Pass B workload probe contract (V02-WI-06
 *  E04-C02): one pre-sample probe plus the timing sample's start/middle/end
 *  probes. */
export const ELITE_PROBE_ORDER = [
  'pre-sample',
  'sample-start',
  'sample-mid',
  'sample-end',
];

/** The complete required key set of one raw Elite workload probe. */
const ELITE_PROBE_KEYS = [
  'label',
  'combatScreenVisible',
  'canvasCount',
  'combatHudCount',
  'countdownText',
  'dialogCount',
  'resultOverlayCount',
  'gameOverScreenCount',
  'operationsScreenCount',
  'missionSeed',
  'eliteCount',
  'eliteActivated',
  'elitePhase',
  'elitePhaseStepsElapsed',
  'eliteAnchorRowAligned',
  'activeCannonLeft',
  'activeCannonRight',
  'activeHomingCores',
  'activePlayerProjectiles',
  'playerHullIntegrity',
];

const ELITE_PHASES = ['entering', 'armoured', 'vulnerable'];
const ELITE_ARMOURED_PHASE_STEPS = 720;
const ELITE_VULNERABLE_PHASE_STEPS = 360;
/** The authored Elite phase cycle (`Armoured → Vulnerable → repeat`, §9.4). */
const ELITE_PHASE_CYCLE = ['armoured', 'vulnerable'];
/** The sample must start inside the final 30 fixed steps of the Armoured
 *  phase, so the `6000 ms` window covers the Armoured→Vulnerable transition. */
const ELITE_ARMOURED_LATE_STEPS = ELITE_ARMOURED_PHASE_STEPS - 30;
/** The earliest Vulnerable step on which the permitted simultaneous two-Core
 *  cap can be observed (the second Core launches `2.5 s` after the first). */
const ELITE_CAP_WINDOW_MIN_STEPS = 300;

/** The 32-bit FNV-1a over the ASCII RNG-input string (Technical Foundation §8):
 *  the canonical mission-seed derivation, implemented here so the recorded seed
 *  is verified against its derivation rather than trusted as a magic number. */
export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The canonical Mission 03 seed both Elite evidence passes must record. The
 *  mission seed is derived per mission INSTANCE ordinal; both Elite passes start
 *  the first mission instance of a fresh seeded session, so it equals the
 *  regular workload's canonical seed and is verified against the derivation. */
export const ELITE_CANONICAL_MISSION_SEED = fnv1a32(
  `shmup-mvp:rng-v1|${SESSION_SEED}|combat-mission|0`,
);

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

/**
 * V02-WI-06 E04-C02-C01 (review finding 1): the Elite records must additionally
 * prove that the scenario-only Elite workload identity surface was released, so
 * the Elite cleanup contract is STRICTER than the generic one: the generic
 * fields plus an exact numeric `eliteWorkloadSurfaceCount === 0`. A missing,
 * malformed, or non-zero count fails.
 */
export function isValidEliteCleanupObject(cleanup) {
  return (
    isValidCleanupObject(cleanup) &&
    typeof cleanup.eliteWorkloadSurfaceCount === 'number' &&
    cleanup.eliteWorkloadSurfaceCount === 0
  );
}

/** The assigned controlled-sequence environment contract: every linked record
 *  must be measured at the minimum-width supported viewport and on the same
 *  machine/browser, so the comparison is like-for-like (Epic §20.1). */
export const EVIDENCE_VIEWPORT = { width: 1366, height: 768 };

/** The canonical Elite workload scenario identity (Epic §8.3.1, §9.4): the
 *  authored Mission 03 Elite Encounter created at the `05:20` final arrival,
 *  simulated with the canonical fixed `1/60 s` step and the authored phase
 *  lengths. Both Elite passes must declare this identity so they are provably
 *  the same workload method rather than compared through free-form prose. */
export const ELITE_CREATION_STEP = 320 * 60;
export const ELITE_SCENARIO_IDENTITY = {
  scenario: 'm03-e8',
  encounterId: 'interception-03-e8',
  creationStep: ELITE_CREATION_STEP,
  fixedStepId: '1/60',
  fixedStepsPerSecond: 60,
  armouredPhaseSteps: ELITE_ARMOURED_PHASE_STEPS,
  vulnerablePhaseSteps: ELITE_VULNERABLE_PHASE_STEPS,
};

/** Deep structural equality for the structured record identities, so a
 *  reordered or added key cannot masquerade as an equal identity. */
export function sameStructuredIdentity(left, right) {
  if (left === null || right === null) {
    return false;
  }
  if (typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.join('|') === rightKeys.join('|') &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

/** V02-WI-05 E02 C04: the fixed, ordered Pass B observation contract — one
 *  pre-sample probe plus the timing sample's start/middle/end probes. The
 *  accepted workload facts are ALWAYS recomputed from these raw probes; the
 *  record's summary booleans are reporting conveniences only. */
export const PASS_B_PROBE_ORDER = [
  'pre-sample',
  'sample-start',
  'sample-mid',
  'sample-end',
];

/** The complete required key set of one raw Combat DOM probe. */
const PASS_B_PROBE_KEYS = [
  'label',
  'combatScreenVisible',
  'canvasCount',
  'combatHudCount',
  'countdownText',
  'dialogCount',
  'resultOverlayCount',
  'gameOverScreenCount',
  'operationsScreenCount',
];

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/** One raw probe is usable only when it has exactly the contract keys, carries
 *  the expected contract label, and every value has its exact type/domain. */
export function isValidCombatProbe(probe, expectedLabel) {
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
    return false;
  }
  const keys = Object.keys(probe);
  if (
    keys.length !== PASS_B_PROBE_KEYS.length ||
    !PASS_B_PROBE_KEYS.every((key) => keys.includes(key))
  ) {
    return false;
  }
  return (
    probe.label === expectedLabel &&
    typeof probe.combatScreenVisible === 'boolean' &&
    isNonNegativeInteger(probe.canvasCount) &&
    isNonNegativeInteger(probe.combatHudCount) &&
    (probe.countdownText === null || typeof probe.countdownText === 'string') &&
    isNonNegativeInteger(probe.dialogCount) &&
    isNonNegativeInteger(probe.resultOverlayCount) &&
    isNonNegativeInteger(probe.gameOverScreenCount) &&
    isNonNegativeInteger(probe.operationsScreenCount)
  );
}

/**
 * Recomputes every accepted Pass B workload fact from the raw probe array only.
 * A tampered or contradictory summary cannot make these facts pass; a
 * disagreement between a summary and these recomputed facts is itself a
 * failure.
 */
export function derivePassBWorkloadFacts(probes) {
  const list = Array.isArray(probes) ? probes : [];
  const structureValid =
    list.length === PASS_B_PROBE_ORDER.length &&
    list.every((probe, index) =>
      isValidCombatProbe(probe, PASS_B_PROBE_ORDER[index]),
    );
  const usable = list.every(
    (probe) =>
      probe !== null && typeof probe === 'object' && !Array.isArray(probe),
  )
    ? list
    : [];
  const complete =
    structureValid && usable.length === PASS_B_PROBE_ORDER.length;
  return {
    structureValid,
    probeCount: list.length,
    activeCombat:
      complete &&
      usable.every(
        (probe) =>
          probe.combatScreenVisible === true &&
          probe.canvasCount === 1 &&
          probe.combatHudCount === 1,
      ),
    countdownFinal:
      complete && usable.every((probe) => probe.countdownText === '00:00'),
    terminalSeen:
      complete &&
      usable.some(
        (probe) =>
          probe.dialogCount > 0 ||
          probe.resultOverlayCount > 0 ||
          probe.gameOverScreenCount > 0,
      ),
    baseSeen:
      complete && usable.some((probe) => probe.operationsScreenCount > 0),
  };
}

/**
 * V02-WI-06 E04-C02: one raw Elite workload probe is usable only when it has
 * exactly the Elite probe contract keys, carries the expected contract label,
 * and every value has its exact type/domain.
 */
export function isValidEliteWorkloadProbe(probe, expectedLabel) {
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
    return false;
  }
  const keys = Object.keys(probe);
  if (
    keys.length !== ELITE_PROBE_KEYS.length ||
    !ELITE_PROBE_KEYS.every((key) => keys.includes(key))
  ) {
    return false;
  }
  return (
    probe.label === expectedLabel &&
    typeof probe.combatScreenVisible === 'boolean' &&
    isNonNegativeInteger(probe.canvasCount) &&
    isNonNegativeInteger(probe.combatHudCount) &&
    (probe.countdownText === null || typeof probe.countdownText === 'string') &&
    isNonNegativeInteger(probe.dialogCount) &&
    isNonNegativeInteger(probe.resultOverlayCount) &&
    isNonNegativeInteger(probe.gameOverScreenCount) &&
    isNonNegativeInteger(probe.operationsScreenCount) &&
    isNonNegativeInteger(probe.missionSeed) &&
    isNonNegativeInteger(probe.eliteCount) &&
    typeof probe.eliteActivated === 'boolean' &&
    (probe.elitePhase === null || ELITE_PHASES.includes(probe.elitePhase)) &&
    isNonNegativeInteger(probe.elitePhaseStepsElapsed) &&
    typeof probe.eliteAnchorRowAligned === 'boolean' &&
    isNonNegativeInteger(probe.activeCannonLeft) &&
    isNonNegativeInteger(probe.activeCannonRight) &&
    isNonNegativeInteger(probe.activeHomingCores) &&
    isNonNegativeInteger(probe.activePlayerProjectiles) &&
    isNonNegativeInteger(probe.playerHullIntegrity)
  );
}

/**
 * Recomputes the authored-phase-progress facts from the ordered probes: the
 * sample must start inside the final 30 fixed steps of the `12 s` Armoured
 * phase, the observed phases must follow the authored `Armoured → Vulnerable →
 * repeat` cycle without a skipped or backwards transition, the same phase must
 * always advance, and a Vulnerable probe inside the permitted two-Core window
 * must show the cap.
 */
export function deriveElitePhaseProgress(probes) {
  const list = Array.isArray(probes) ? probes : [];
  let previous = null;
  let cycleOrdered = true;
  let capWindowObserved = false;
  for (const probe of list) {
    if (previous !== null) {
      if (probe.elitePhase !== previous.elitePhase) {
        const previousIndex = ELITE_PHASE_CYCLE.indexOf(previous.elitePhase);
        const expected =
          ELITE_PHASE_CYCLE[(previousIndex + 1) % ELITE_PHASE_CYCLE.length];
        if (probe.elitePhase !== expected) {
          cycleOrdered = false;
        }
      } else if (
        probe.elitePhaseStepsElapsed < previous.elitePhaseStepsElapsed
      ) {
        // The same phase must never rewind. Two probes may legitimately be
        // taken inside the same executed fixed step, so equality is allowed.
        cycleOrdered = false;
      }
    }
    if (
      probe.elitePhase === 'vulnerable' &&
      probe.elitePhaseStepsElapsed >= ELITE_CAP_WINDOW_MIN_STEPS &&
      probe.activeHomingCores === 2
    ) {
      capWindowObserved = true;
    }
    previous = probe;
  }
  const lateArmouredStart =
    list[0]?.elitePhase === 'armoured' &&
    (list[0]?.elitePhaseStepsElapsed ?? 0) >= ELITE_ARMOURED_LATE_STEPS;
  const vulnerableObserved = list.some(
    (probe) => probe.elitePhase === 'vulnerable',
  );
  return {
    lateArmouredStart,
    vulnerableObserved,
    cycleOrdered,
    authoredPhaseProgress:
      lateArmouredStart && vulnerableObserved && cycleOrdered,
    capWindowObserved,
  };
}

/**
 * Recomputes every accepted Elite Pass B workload fact from the raw probe array
 * only (V02-WI-06 E04-C02): the exact Elite workload across the required
 * Armoured→Vulnerable interval, both cannon streams, continuous player fire, and
 * the permitted simultaneous two-Core cap. Summary booleans can never make these
 * facts pass; a disagreement with them is itself a failure.
 */
export function deriveEliteWorkloadFacts(probes) {
  const list = Array.isArray(probes) ? probes : [];
  const structureValid =
    list.length === ELITE_PROBE_ORDER.length &&
    list.every((probe, index) =>
      isValidEliteWorkloadProbe(probe, ELITE_PROBE_ORDER[index]),
    );
  const usable = list.every(
    (probe) =>
      probe !== null && typeof probe === 'object' && !Array.isArray(probe),
  )
    ? list
    : [];
  const complete = structureValid && usable.length === ELITE_PROBE_ORDER.length;
  const progress = deriveElitePhaseProgress(complete ? usable : []);
  return {
    structureValid,
    probeCount: list.length,
    eliteActive:
      complete &&
      usable.every(
        (probe) => probe.eliteCount === 1 && probe.eliteActivated === true,
      ),
    anchorRow:
      complete && usable.every((probe) => probe.eliteAnchorRowAligned === true),
    activeCombat:
      complete &&
      usable.every(
        (probe) =>
          probe.combatScreenVisible === true &&
          probe.canvasCount === 1 &&
          probe.combatHudCount === 1,
      ),
    countdownFinal:
      complete && usable.every((probe) => probe.countdownText === '00:00'),
    authoredPhaseProgress: progress.authoredPhaseProgress,
    lateArmouredStart: progress.lateArmouredStart,
    vulnerableObserved: progress.vulnerableObserved,
    cycleOrdered: progress.cycleOrdered,
    cannonStreams:
      complete &&
      usable[0].activeCannonLeft >= 1 &&
      usable[0].activeCannonRight >= 1 &&
      usable[1].activeCannonLeft >= 1 &&
      usable[1].activeCannonRight >= 1,
    playerFire:
      complete && usable.every((probe) => probe.activePlayerProjectiles >= 1),
    coreCap: complete && progress.capWindowObserved,
    terminalSeen:
      complete &&
      usable.some(
        (probe) =>
          probe.dialogCount > 0 ||
          probe.resultOverlayCount > 0 ||
          probe.gameOverScreenCount > 0,
      ),
    baseSeen:
      complete && usable.some((probe) => probe.operationsScreenCount > 0),
  };
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

  const passA = readRecordFrom(evidenceDir, REGULAR_PASS_A_FILE);
  const passB = readRecordFrom(evidenceDir, REGULAR_PASS_B_FILE);
  const baseLegacy = readRecordFrom(evidenceDir, BASE_LEGACY_FILE);
  const postLegacy = readRecordFrom(evidenceDir, POST_LEGACY_FILE);
  const elitePassA = readRecordFrom(evidenceDir, ELITE_PASS_A_FILE);
  const elitePassB = readRecordFrom(evidenceDir, ELITE_PASS_B_FILE);

  // -------------------------------------------------------------------------
  // 0. Canonical seed derivation (Technical Foundation §8): the fixed mission
  //    seed every workload record carries is verified against the canonical
  //    FNV-1a derivation rather than trusted as a recorded constant.
  // -------------------------------------------------------------------------
  check(
    fnv1a32(`shmup-mvp:rng-v1|${SESSION_SEED}|combat-mission|0`) ===
      CANONICAL_MISSION_SEED &&
      ELITE_CANONICAL_MISSION_SEED === CANONICAL_MISSION_SEED,
    'canonical-seed-derivation',
    `the recorded canonical mission seed must equal its FNV-1a derivation (derived ${ELITE_CANONICAL_MISSION_SEED}, recorded constant ${CANONICAL_MISSION_SEED})`,
  );

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
  // 3b. V02-WI-05 E02 C04 Pass B workload integrity: the uninstrumented timing
  //     record is accepted only when the authored `03:10` final arrival was
  //     actually executed AND the RAW ordered probe array independently proves
  //     real active Combat (the Combat Screen, exactly one canvas, the Combat
  //     HUD, and the `00:00` Combat Countdown) with no terminal/Result
  //     Overlay/Game Over/Base frame at the pre-sample, sample start, sample
  //     middle, and sample end observations. Every accepted fact is recomputed
  //     from `workloadValidity.probes`; the record's summary flags are only
  //     reporting conveniences and any disagreement with the recomputed facts
  //     fails.
  // -------------------------------------------------------------------------
  const validity = passB?.workloadValidity;
  const probeFacts = derivePassBWorkloadFacts(validity?.probes);
  const probeCountText = JSON.stringify(probeFacts.probeCount);
  check(
    probeFacts.structureValid,
    'pass-b-probe-structure',
    `Pass B raw probes must be exactly ${JSON.stringify(PASS_B_PROBE_ORDER)} with every contract key and value type (got ${probeCountText} probe(s): ${JSON.stringify(validity?.probes)})`,
  );
  check(
    probeFacts.activeCombat,
    'pass-b-probe-active-combat',
    `Every Pass B raw probe must show the Combat Screen, exactly one canvas, and exactly one Combat HUD (got ${JSON.stringify(validity?.probes)})`,
  );
  check(
    probeFacts.countdownFinal,
    'pass-b-probe-countdown-final',
    `Every Pass B raw probe must show the 00:00 Combat Countdown (got ${JSON.stringify((validity?.probes ?? []).map((probe) => probe?.countdownText))})`,
  );
  check(
    !probeFacts.terminalSeen,
    'pass-b-probe-no-terminal',
    `No Pass B raw probe may show a dialog, Mission Result Overlay, or Game Over Screen (got ${JSON.stringify(validity?.probes)})`,
  );
  check(
    !probeFacts.baseSeen,
    'pass-b-probe-no-base',
    `No Pass B raw probe may show the Operations/Base Screen (got ${JSON.stringify(validity?.probes)})`,
  );
  check(
    validity != null && validity.arrivalReached === true,
    'pass-b-workload-arrival',
    `Pass B must prove the authored 03:10 final arrival was executed (got ${JSON.stringify(validity?.arrivalReached)})`,
  );
  check(
    probeFacts.structureValid &&
      probeFacts.activeCombat &&
      probeFacts.countdownFinal,
    'pass-b-workload-active',
    `Pass B probes must prove the Combat Screen, exactly one canvas, the Combat HUD, and the 00:00 Countdown at the start, middle, and end of the sample (got ${JSON.stringify(probeFacts)})`,
  );
  check(
    probeFacts.structureValid &&
      !probeFacts.terminalSeen &&
      !probeFacts.baseSeen &&
      validity?.valid === true,
    'pass-b-workload-no-terminal',
    `Pass B must prove no terminal/Result Overlay/Base frame appeared during the sample (got ${JSON.stringify(probeFacts)})`,
  );
  // Summary agreement: the recorded reporting flags must equal the facts
  // recomputed from the raw probes, and `valid` must equal the derived
  // acceptance of the same raw facts.
  const derivedAccepted =
    probeFacts.structureValid &&
    probeFacts.activeCombat &&
    probeFacts.countdownFinal &&
    !probeFacts.terminalSeen &&
    !probeFacts.baseSeen &&
    validity?.arrivalReached === true &&
    (validity?.flightInputError === null ||
      validity?.flightInputError === undefined);
  check(
    validity != null &&
      validity.combatActiveThroughout === probeFacts.activeCombat &&
      validity.countdownRemainedFinal === probeFacts.countdownFinal &&
      validity.terminalOrResultSeen === probeFacts.terminalSeen &&
      validity.baseOrOperationsSeen === probeFacts.baseSeen &&
      validity.probeCount === probeFacts.probeCount &&
      Array.isArray(validity.probeOrder) &&
      validity.probeOrder.join('|') === PASS_B_PROBE_ORDER.join('|') &&
      validity.valid === derivedAccepted,
    'pass-b-probe-summary-consistency',
    `Pass B summary flags must equal the facts recomputed from the raw probes: summary ${JSON.stringify({ combatActiveThroughout: validity?.combatActiveThroughout, countdownRemainedFinal: validity?.countdownRemainedFinal, terminalOrResultSeen: validity?.terminalOrResultSeen, baseOrOperationsSeen: validity?.baseOrOperationsSeen, probeCount: validity?.probeCount, probeOrder: validity?.probeOrder, valid: validity?.valid })} vs recomputed ${JSON.stringify({ ...probeFacts, derivedAccepted })}`,
  );

  // -------------------------------------------------------------------------
  // 3c. V02-WI-06 E04-C02 Elite workload (Epic §9.4, §20.1; V02-AC-009–010,
  //     V02-AC-028). Pass A proves the exact workload identity from observed
  //     per-step counters; Pass B proves that the uninstrumented timing sample
  //     stayed inside that workload across the Armoured→Vulnerable interval.
  //     Both records must share the canonical Mission 03 seed, and Pass B must
  //     carry no instrumentation.
  // -------------------------------------------------------------------------
  const eliteMaxima = elitePassA?.observedMaxima ?? {};
  const eliteCounters = eliteMaxima.eliteWorkload ?? null;
  const eliteRoleMax = eliteMaxima.activeEnemiesByRole ?? {};
  const elitePhaseOrder = Array.isArray(eliteCounters?.phaseOrder)
    ? eliteCounters.phaseOrder
    : [];
  const elitePhaseDurations = Array.isArray(eliteCounters?.phaseDurations)
    ? eliteCounters.phaseDurations
    : [];
  check(
    elitePassA != null,
    'elite-pass-a-record-present',
    `the Elite Pass A instrumented record ${ELITE_PASS_A_FILE} must exist`,
  );
  check(
    elitePassB != null,
    'elite-pass-b-record-present',
    `the Elite Pass B uninstrumented record ${ELITE_PASS_B_FILE} must exist`,
  );
  check(
    elitePassA?.sessionSeed === SESSION_SEED &&
      elitePassB?.sessionSeed === SESSION_SEED,
    'elite-seeds-fixed',
    `both Elite records must use the fixed session seed ${SESSION_SEED} (got ${elitePassA?.sessionSeed} / ${elitePassB?.sessionSeed})`,
  );
  check(
    elitePassA?.canonicalSeed === ELITE_CANONICAL_MISSION_SEED &&
      elitePassB?.canonicalSeed === ELITE_CANONICAL_MISSION_SEED,
    'elite-canonical-seed-identity',
    `both Elite records must record the canonical Mission 03 seed ${ELITE_CANONICAL_MISSION_SEED} (got ${elitePassA?.canonicalSeed} / ${elitePassB?.canonicalSeed})`,
  );
  check(
    eliteCounters != null && eliteCounters.eliteCreationSteps === 1,
    'elite-pass-a-created',
    `Pass A must observe exactly one Elite creation (got ${eliteCounters?.eliteCreationSteps})`,
  );
  check(
    eliteRoleMax['elite-drone'] === 1 &&
      eliteCounters != null &&
      eliteCounters.elitePresenceViolationSteps === 0,
    'elite-pass-a-single-elite',
    `Pass A must observe exactly one active Elite and no step with more than one (got ${JSON.stringify(eliteRoleMax)} / ${eliteCounters?.elitePresenceViolationSteps})`,
  );
  check(
    eliteCounters != null &&
      eliteCounters.eliteEntrySteps >= 1 &&
      eliteCounters.anchorSteps >= 1,
    'elite-pass-a-entry-and-anchor',
    `Pass A must observe the Top entry and the exact anchor activation step (got entry ${eliteCounters?.eliteEntrySteps}, anchor ${eliteCounters?.anchorSteps})`,
  );
  check(
    elitePhaseOrder[0] === 'armoured' &&
      elitePhaseOrder[1] === 'vulnerable' &&
      elitePhaseDurations[0] === ELITE_ARMOURED_PHASE_STEPS &&
      elitePhaseDurations[1] === ELITE_VULNERABLE_PHASE_STEPS &&
      eliteCounters.armouredSteps >= ELITE_ARMOURED_PHASE_STEPS &&
      eliteCounters.vulnerableSteps >= ELITE_VULNERABLE_PHASE_STEPS,
    'elite-pass-a-complete-phases',
    `Pass A must observe one complete 12 s Armoured phase followed by one complete 6 s Vulnerable phase (got order ${JSON.stringify(elitePhaseOrder)}, durations ${JSON.stringify(elitePhaseDurations)}, steps ${eliteCounters?.armouredSteps}/${eliteCounters?.vulnerableSteps})`,
  );
  check(
    eliteCounters != null &&
      eliteCounters.activeEliteSteps >=
        ELITE_ARMOURED_PHASE_STEPS + ELITE_VULNERABLE_PHASE_STEPS &&
      eliteCounters.eliteWorkloadPlayerFireSteps ===
        eliteCounters.activeEliteSteps,
    'elite-pass-a-continuous-player-fire',
    `Pass A must observe continuous player fire on every activated-Elite step (got ${eliteCounters?.eliteWorkloadPlayerFireSteps} of ${eliteCounters?.activeEliteSteps})`,
  );

  check(
    eliteCounters != null &&
      eliteCounters.leftCannonProjectilesObserved >= 1 &&
      eliteCounters.rightCannonProjectilesObserved >= 1 &&
      eliteCounters.leftCannonProjectilesObserved ===
        eliteCounters.rightCannonProjectilesObserved &&
      eliteCounters.cannonPairSteps >= 1,
    'elite-pass-a-cannon-streams',
    `Pass A must observe both Elite cannon streams active (got left ${eliteCounters?.leftCannonProjectilesObserved}, right ${eliteCounters?.rightCannonProjectilesObserved}, pair steps ${eliteCounters?.cannonPairSteps})`,
  );
  check(
    eliteCounters != null &&
      eliteCounters.homingCoresObserved >= 2 &&
      eliteCounters.maxActiveHomingCores === 2 &&
      eliteCounters.homingCoreActiveSteps >= 1,
    'elite-pass-a-core-cap',
    `Pass A must observe homing Core creation/activity with the simultaneous cap of two (got observed ${eliteCounters?.homingCoresObserved}, max active ${eliteCounters?.maxActiveHomingCores})`,
  );
  check(
    eliteCounters != null &&
      eliteMaxima.activePlayerProjectiles >= 1 &&
      eliteMaxima.activeEnemyProjectiles >= 1 &&
      (eliteMaxima.collisionWorkMax?.playerProjectileCandidates ?? 0) > 0 &&
      (eliteMaxima.collisionWorkMax?.enemyProjectileCandidates ?? 0) > 0,
    'elite-pass-a-collision-and-projectiles',
    `Pass A must observe player/enemy projectile maxima and both projectile collision candidate paths (got ${JSON.stringify({ player: eliteMaxima.activePlayerProjectiles, enemy: eliteMaxima.activeEnemyProjectiles, work: eliteMaxima.collisionWorkMax })})`,
  );
  check(
    eliteMaxima.exactRegularWorkloadSteps === 0 &&
      (eliteRoleMax['basic-drone'] ?? 0) === 0 &&
      (eliteRoleMax['ranged-drone'] ?? 0) === 0 &&
      (eliteRoleMax['hunter-drone'] ?? 0) === 0,
    'elite-pass-a-elite-only',
    `the Elite workload record must contain only the one authored Elite (got ${JSON.stringify({ exact: eliteMaxima.exactRegularWorkloadSteps, roles: eliteRoleMax })})`,
  );
  check(
    isValidEliteCleanupObject(elitePassA?.cleanup),
    'elite-pass-a-cleanup-object',
    `the Elite Pass A record must carry a machine-readable cleanup object with operationsVisible true, exact zero canvas/hud/dialog counts AND an exact zero Elite workload identity surface count (got ${JSON.stringify(elitePassA?.cleanup)})`,
  );
  check(
    elitePassB?.observedMaxima == null,
    'elite-pass-b-uninstrumented',
    'the Elite Pass B timing record must NOT carry observedMaxima (timing must be uninstrumented)',
  );
  check(
    elitePassB?.buildIdentifier != null &&
      !elitePassB.buildIdentifier.includes('unknown'),
    'elite-pass-b-build-identity',
    `the Elite Pass B buildIdentifier must not be unknown (got ${elitePassB?.buildIdentifier})`,
  );

  const eliteProbeFacts = deriveEliteWorkloadFacts(
    elitePassB?.workloadValidity?.probes,
  );
  const eliteValidity = elitePassB?.workloadValidity;
  const eliteDerivedAccepted =
    eliteProbeFacts.structureValid &&
    eliteProbeFacts.eliteActive &&
    eliteProbeFacts.anchorRow &&
    eliteProbeFacts.activeCombat &&
    eliteProbeFacts.countdownFinal &&
    eliteProbeFacts.authoredPhaseProgress &&
    eliteProbeFacts.cannonStreams &&
    eliteProbeFacts.playerFire &&
    eliteProbeFacts.coreCap &&
    !eliteProbeFacts.terminalSeen &&
    !eliteProbeFacts.baseSeen;
  check(
    eliteProbeFacts.structureValid,
    'elite-pass-b-probe-structure',
    `the Elite Pass B raw probes must be exactly ${JSON.stringify(ELITE_PROBE_ORDER)} with every contract key and value type (got ${JSON.stringify(elitePassB?.workloadValidity?.probes)})`,
  );
  check(
    eliteProbeFacts.eliteActive && eliteProbeFacts.anchorRow,
    'elite-pass-b-elite-active-on-anchor',
    `every Elite Pass B probe must show the one activated Elite on its authored anchor row (got ${JSON.stringify(eliteProbeFacts)})`,
  );
  check(
    eliteProbeFacts.activeCombat && eliteProbeFacts.countdownFinal,
    'elite-pass-b-combat-active',
    `every Elite Pass B probe must show the Combat Screen, exactly one canvas, the Combat HUD, and the 00:00 Countdown (got ${JSON.stringify(eliteProbeFacts)})`,
  );
  check(
    eliteProbeFacts.authoredPhaseProgress,
    'elite-pass-b-authored-phase-progress',
    `the Elite Pass B probes must start inside the last 30 fixed steps of the 12 s Armoured phase and then follow the authored Armoured→Vulnerable cycle without a wrong or backwards phase/order (got ${JSON.stringify(elitePassB?.workloadValidity?.probes?.map((probe) => [probe?.elitePhase, probe?.elitePhaseStepsElapsed]))}, facts ${JSON.stringify({ lateArmouredStart: eliteProbeFacts.lateArmouredStart, vulnerableObserved: eliteProbeFacts.vulnerableObserved, cycleOrdered: eliteProbeFacts.cycleOrdered })})`,
  );
  check(
    eliteProbeFacts.cannonStreams && eliteProbeFacts.playerFire,
    'elite-pass-b-attack-streams',
    `the Elite Pass B probes must show both cannon streams active and continuous player fire (got ${JSON.stringify(elitePassB?.workloadValidity?.probes?.map((probe) => [probe?.activeCannonLeft, probe?.activeCannonRight, probe?.activePlayerProjectiles]))})`,
  );
  check(
    eliteProbeFacts.coreCap,
    'elite-pass-b-core-cap',
    `the Elite Pass B sample must observe the permitted simultaneous cap of two homing Cores inside the Vulnerable window (got ${JSON.stringify(elitePassB?.workloadValidity?.probes?.map((probe) => [probe?.elitePhase, probe?.elitePhaseStepsElapsed, probe?.activeHomingCores]))})`,
  );
  check(
    !eliteProbeFacts.terminalSeen && !eliteProbeFacts.baseSeen,
    'elite-pass-b-no-terminal',
    `no Elite Pass B probe may show a terminal/Result Overlay/Game Over/Base frame (got ${JSON.stringify(eliteProbeFacts)})`,
  );
  check(
    eliteValidity != null &&
      eliteValidity.eliteActiveThroughout === eliteProbeFacts.eliteActive &&
      eliteValidity.anchorRowThroughout === eliteProbeFacts.anchorRow &&
      eliteValidity.combatActiveThroughout === eliteProbeFacts.activeCombat &&
      eliteValidity.countdownRemainedFinal === eliteProbeFacts.countdownFinal &&
      eliteValidity.authoredPhaseProgress ===
        eliteProbeFacts.authoredPhaseProgress &&
      eliteValidity.cannonStreamsActive === eliteProbeFacts.cannonStreams &&
      eliteValidity.playerFireContinuous === eliteProbeFacts.playerFire &&
      eliteValidity.coreCapObserved === eliteProbeFacts.coreCap &&
      eliteValidity.terminalOrResultSeen === eliteProbeFacts.terminalSeen &&
      eliteValidity.baseOrOperationsSeen === eliteProbeFacts.baseSeen &&
      eliteValidity.probeCount === eliteProbeFacts.probeCount &&
      Array.isArray(eliteValidity.probeOrder) &&
      eliteValidity.probeOrder.join('|') === ELITE_PROBE_ORDER.join('|') &&
      eliteValidity.valid === eliteDerivedAccepted,
    'elite-pass-b-summary-consistency',
    `the Elite Pass B summary flags must equal the facts recomputed from the raw probes: summary ${JSON.stringify({ eliteActiveThroughout: eliteValidity?.eliteActiveThroughout, anchorRowThroughout: eliteValidity?.anchorRowThroughout, combatActiveThroughout: eliteValidity?.combatActiveThroughout, countdownRemainedFinal: eliteValidity?.countdownRemainedFinal, authoredPhaseProgress: eliteValidity?.authoredPhaseProgress, cannonStreamsActive: eliteValidity?.cannonStreamsActive, playerFireContinuous: eliteValidity?.playerFireContinuous, coreCapObserved: eliteValidity?.coreCapObserved, terminalOrResultSeen: eliteValidity?.terminalOrResultSeen, baseOrOperationsSeen: eliteValidity?.baseOrOperationsSeen, probeCount: eliteValidity?.probeCount, probeOrder: eliteValidity?.probeOrder, valid: eliteValidity?.valid })} vs recomputed ${JSON.stringify({ ...eliteProbeFacts, derivedAccepted: eliteDerivedAccepted })}`,
  );
  check(
    typeof elitePassB?.sampleWindowMs === 'number' &&
      elitePassB.sampleWindowMs >= 6000,
    'elite-pass-b-sample-window',
    `the Elite Pass B sampling window must remain the unchanged 6000 ms window (got ${elitePassB?.sampleWindowMs})`,
  );
  check(
    isValidEliteCleanupObject(elitePassB?.cleanup),
    'elite-pass-b-cleanup-object',
    `the Elite Pass B record must carry a machine-readable cleanup object with operationsVisible true, exact zero canvas/hud/dialog counts AND an exact zero Elite workload identity surface count (got ${JSON.stringify(elitePassB?.cleanup)})`,
  );
  check(
    Array.isArray(elitePassB?.consoleErrors) &&
      elitePassB.consoleErrors.length === 0,
    'elite-pass-b-console-errors',
    `the Elite Pass B timing record must carry an EMPTY consoleErrors array (got ${JSON.stringify(elitePassB?.consoleErrors)})`,
  );

  // -------------------------------------------------------------------------
  // 3d. V02-WI-06 E04-C02-C01: assigned like-for-like environment and workload
  //     identity contract (Epic §20.1). Every linked record must be measured at
  //     the same viewport on the same machine/browser; every record for the
  //     CURRENT candidate must carry a build identifier tied to the current
  //     HEAD (the immutable base proxy stays tied to its known base revision);
  //     and both Elite passes must declare the same canonical scenario and
  //     fixed-step identity so the two-pass method is proven structurally.
  // -------------------------------------------------------------------------
  const environmentRecords = [
    ['base-legacy', baseLegacy],
    ['post-legacy', postLegacy],
    ['pass-a', passA],
    ['pass-b', passB],
    ['elite-pass-a', elitePassA],
    ['elite-pass-b', elitePassB],
  ];
  for (const [name, record] of environmentRecords) {
    check(
      record?.viewport?.width === EVIDENCE_VIEWPORT.width &&
        record?.viewport?.height === EVIDENCE_VIEWPORT.height,
      `${name}-viewport`,
      `${name} viewport must be exactly ${EVIDENCE_VIEWPORT.width}x${EVIDENCE_VIEWPORT.height} (got ${JSON.stringify(record?.viewport)})`,
    );
  }
  const machineBrowserIdentity = (record) =>
    record == null
      ? null
      : JSON.stringify({ machine: record.machine, browser: record.browser });
  const referenceEnvironment = machineBrowserIdentity(passB ?? elitePassB);
  const environmentMismatches = environmentRecords
    .filter(
      ([, record]) =>
        machineBrowserIdentity(record) !== referenceEnvironment ||
        record?.machine == null ||
        typeof record?.browser !== 'string',
    )
    .map(([name]) => name);
  check(
    referenceEnvironment !== null && environmentMismatches.length === 0,
    'machine-browser-identity',
    `all six linked records must report the same machine and browser identity for the controlled sequence (mismatches: ${JSON.stringify(environmentMismatches)}, reference ${referenceEnvironment})`,
  );
  const currentHeadShort = currentFingerprint.head.slice(0, 7);
  for (const [name, record] of [
    ['post-legacy', postLegacy],
    ['pass-a', passA],
    ['pass-b', passB],
    ['elite-pass-a', elitePassA],
    ['elite-pass-b', elitePassB],
  ]) {
    check(
      typeof record?.buildIdentifier === 'string' &&
        record.buildIdentifier.includes(currentHeadShort) &&
        !record.buildIdentifier.includes('unknown'),
      `${name}-current-build-identity`,
      `${name} buildIdentifier must be tied to the current HEAD ${currentHeadShort} and not be unknown (got ${record?.buildIdentifier})`,
    );
  }
  check(
    sameStructuredIdentity(
      elitePassA?.scenarioIdentity,
      elitePassB?.scenarioIdentity,
    ),
    'elite-scenario-identity',
    `both Elite records must declare the SAME structured scenario identity (got Pass A ${JSON.stringify(elitePassA?.scenarioIdentity)} vs Pass B ${JSON.stringify(elitePassB?.scenarioIdentity)})`,
  );
  check(
    sameStructuredIdentity(
      elitePassA?.scenarioIdentity,
      ELITE_SCENARIO_IDENTITY,
    ) &&
      sameStructuredIdentity(
        elitePassB?.scenarioIdentity,
        ELITE_SCENARIO_IDENTITY,
      ),
    'elite-scenario-identity-canonical',
    `both Elite records must declare the canonical Mission 03 Elite scenario identity ${JSON.stringify(ELITE_SCENARIO_IDENTITY)} (got Pass A ${JSON.stringify(elitePassA?.scenarioIdentity)}, Pass B ${JSON.stringify(elitePassB?.scenarioIdentity)})`,
  );
  check(
    eliteCounters != null &&
      eliteCounters.eliteCreationMissionStep === ELITE_CREATION_STEP,
    'elite-pass-a-creation-step',
    `Pass A must observe the Elite created on the authored fixed step ${ELITE_CREATION_STEP} (got ${eliteCounters?.eliteCreationMissionStep})`,
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
  requiredTimingFields(check, elitePassB, 'elite-pass-b');
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
  if (elitePassB) {
    check(
      typeof elitePassB.frameTimeMs?.count === 'number' &&
        elitePassB.frameTimeMs.count > 100,
      'elite-pass-b-sample-size',
      `Elite Pass B frame sample must exceed 100 frames (got ${elitePassB.frameTimeMs?.count})`,
    );
    check(
      typeof elitePassB.canonicalSeed === 'number',
      'elite-pass-b-canonical-seed-field',
      'the Elite Pass B record must record the canonical seed',
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
    ['elite-pass-a', elitePassA],
    ['elite-pass-b', elitePassB],
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
      'V02-WI-04 C05 + V02-WI-06 E04-C02 performance comparison package — every linked record is non-reference local proxy evidence; no physical reference-device validation is claimed',
    expectedRunId,
    sourceFingerprint: currentFingerprint,
    fixedSessionSeed: SESSION_SEED,
    canonicalMissionSeed: CANONICAL_MISSION_SEED,
    eliteCanonicalMissionSeed: ELITE_CANONICAL_MISSION_SEED,
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
        workloadIdentity: passB?.workloadIdentity ?? null,
        inputPath: passB?.inputPath ?? null,
        workloadValidity: passB?.workloadValidity ?? null,
        derivedWorkloadFacts: probeFacts,
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
      eliteInstrumentedMaxima: {
        path: ELITE_PASS_A_FILE,
        buildIdentifier: elitePassA?.buildIdentifier ?? null,
        sessionSeed: elitePassA?.sessionSeed ?? null,
        canonicalSeed: elitePassA?.canonicalSeed ?? null,
        runId: readRecordOwnership(elitePassA).runId,
        sourceFingerprint: readRecordOwnership(elitePassA).sourceFingerprint,
        workloadMethod: elitePassA?.workloadMethod ?? null,
        scenarioIdentity: elitePassA?.scenarioIdentity ?? null,
        timingScope: elitePassA?.timingScope ?? null,
        observedMaxima: elitePassA?.observedMaxima ?? null,
        cleanup: elitePassA?.cleanup ?? null,
        eliteCleanupValid: isValidEliteCleanupObject(elitePassA?.cleanup),
        pageErrors: elitePassA?.pageErrors ?? null,
      },
      eliteUninstrumentedTiming: {
        path: ELITE_PASS_B_FILE,
        buildIdentifier: elitePassB?.buildIdentifier ?? null,
        sessionSeed: elitePassB?.sessionSeed ?? null,
        canonicalSeed: elitePassB?.canonicalSeed ?? null,
        runId: readRecordOwnership(elitePassB).runId,
        sourceFingerprint: readRecordOwnership(elitePassB).sourceFingerprint,
        workloadMethod: elitePassB?.workloadMethod ?? null,
        scenarioIdentity: elitePassB?.scenarioIdentity ?? null,
        timingScope: elitePassB?.timingScope ?? null,
        sampleWindowMs: elitePassB?.sampleWindowMs ?? null,
        workloadValidity: elitePassB?.workloadValidity ?? null,
        derivedEliteWorkloadFacts: eliteProbeFacts,
        cleanup: elitePassB?.cleanup ?? null,
        eliteCleanupValid: isValidEliteCleanupObject(elitePassB?.cleanup),
        consoleErrors: elitePassB?.consoleErrors ?? null,
        frameTimeMs: elitePassB?.frameTimeMs ?? null,
        sustainedFps: elitePassB?.sustainedFps ?? null,
        minimumSustainedWindowFps:
          elitePassB?.minimumSustainedWindowFps ?? null,
        longTasks: elitePassB?.longTasks ?? null,
        heapUsedBeforeGcBytes: elitePassB?.heapUsedBeforeGcBytes ?? null,
        heapUsedAfterGcBytes: elitePassB?.heapUsedAfterGcBytes ?? null,
        requestsDuringRun: elitePassB?.requestsDuringRun ?? null,
        pageErrors: elitePassB?.pageErrors ?? null,
      },
    },
    environmentIdentity: {
      requiredViewport: EVIDENCE_VIEWPORT,
      referenceMachine: (passB ?? elitePassB)?.machine ?? null,
      referenceBrowser: (passB ?? elitePassB)?.browser ?? null,
      currentHeadShort,
      perRecord: environmentRecords.map(([name, record]) => ({
        name,
        viewport: record?.viewport ?? null,
        buildIdentifier: record?.buildIdentifier ?? null,
        machineAndBrowserMatchReference:
          machineBrowserIdentity(record) === referenceEnvironment,
      })),
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
