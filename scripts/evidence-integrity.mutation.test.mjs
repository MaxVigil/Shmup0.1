#!/usr/bin/env node
/**
 * V02-WI-04 C05 evidence-integrity mutation coverage (Epic §20.1, V02-AC-028;
 * C05 deltas 1-4). Runs the comparison validator's evaluation core against
 * mutated copies of the real approved records and asserts the SPECIFIC
 * integrity check fails for each targeted mutation:
 *   - a mutated active role object (exactRegularWorkloadSteps preserved) fails
 *     the exact-role check (delta 1);
 *   - a missing/malformed/non-zero cleanup object fails the cleanup checks
 *     (delta 2);
 *   - a leaked counter symbol in a scanned artifact fails the
 *     counter-elimination checks (delta 3);
 *   - a mismatched runId or source fingerprint fails the coherence checks
 *     (delta 4);
 *   - a Pass B record whose RAW probe array is tampered — one altered probe
 *     only, with every summary boolean/count deliberately left valid (missing
 *     canvas/HUD/Combat Screen, non-final countdown, terminal/Result
 *     Overlay/Game Over, Operations/Base, malformed or missing probe,
 *     probe-count or label-order inconsistency) — fails the raw probe checks,
 *     and a summary that disagrees with healthy raw probes fails the
 *     consistency check (V02-WI-05 E02 C04);
 *   - V02-WI-06 E04-C02: a mutated Elite Pass A identity fact (phase
 *     order/durations, Core cap, continuous player fire, cannon stream,
 *     single-Elite, Elite-only workload) or a tampered RAW Elite Pass B probe
 *     (Core cap, phase order, Armoured elapsed steps, cannon stream, player
 *     fire, anchor row, activation, terminal/Base frame, structure, missing
 *     probe), a timing record carrying instrumentation maxima, a mismatched
 *     Elite runId/fingerprint/seed derivation, a missing Elite record, and a
 *     leaked Elite counter or identity symbol fails that specific check.
 * A baseline run over the unmutated records must pass every check, so this
 * suite also confirms the real evidence is intact before mutation.
 * A baseline run over the unmutated records must pass every check, so this
 * suite also confirms the real evidence is intact before mutation.
 *
 * Usage: node --test scripts/evidence-integrity.mutation.test.mjs
 */
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  evaluateEvidenceComparison,
  RECORD_FILES,
} from './compare-performance-evidence.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_DIR = join(ROOT, '.agent-handoff', 'evidence');
const REAL_DIST = join(ROOT, 'dist');
const REAL_UNINSTRUMENTED = join(ROOT, 'dist-evidence-uninstrumented');

function makeTempEvidenceDir() {
  const dir = mkdtempSync(join(tmpdir(), 'shmup-evidence-mutation-'));
  for (const file of RECORD_FILES) {
    cpSync(join(EVIDENCE_DIR, file), join(dir, file));
  }
  return dir;
}

function mutateRecord(dir, fileName, mutate) {
  const path = join(dir, fileName);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  const mutated = mutate(record);
  writeFileSync(path, `${JSON.stringify(mutated ?? record, null, 2)}\n`);
}

function failureNames(result) {
  return result.failures.map((failure) => failure.split(':')[0]);
}

test('baseline: the unmutated C05 records and artifacts pass every check', () => {
  const result = evaluateEvidenceComparison({
    evidenceDir: EVIDENCE_DIR,
    distDir: REAL_DIST,
    uninstrumentedDir: REAL_UNINSTRUMENTED,
    writePackage: false,
  });
  assert.deepEqual(
    failureNames(result),
    [],
    `baseline failures: ${result.failures.join(' | ')}`,
  );
  assert.equal(result.packageRecord.assertionsPassed, true);
});

test('C05 delta 1: a mutated role object fails pass-a-exact-role-object even when exactRegularWorkloadSteps is preserved', () => {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, 'v02-wi-04-instrumented-regular-workload.json', (r) => {
      r.observedMaxima.activeEnemiesByRole['basic-drone'] = 4;
      return r;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('pass-a-exact-role-object'),
      `expected pass-a-exact-role-object failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C05 delta 2: a missing Pass B cleanup object fails pass-b-cleanup-object', () => {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, 'v02-wi-04-uninstrumented-regular-workload.json', (r) => {
      delete r.cleanup;
      return r;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('pass-b-cleanup-object'),
      `expected pass-b-cleanup-object failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C05 delta 2: a non-zero canvas count in a legacy cleanup object fails base-legacy-cleanup-object', () => {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, 'base-legacy-five-basic.json', (r) => {
      r.cleanup.canvasCount = 1;
      return r;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('base-legacy-cleanup-object'),
      `expected base-legacy-cleanup-object failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C05 delta 3: a leaked counter symbol in the uninstrumented bundle fails uninstrumented-bundle-counter-leak', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shmup-uninstrumented-leak-'));
  try {
    mkdirSync(join(fixture, 'assets'), { recursive: true });
    writeFileSync(
      join(fixture, 'assets', 'bundle.js'),
      'const x = { exactRegularWorkloadSteps: 1 };',
    );
    const result = evaluateEvidenceComparison({
      evidenceDir: EVIDENCE_DIR,
      distDir: REAL_DIST,
      uninstrumentedDir: fixture,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('uninstrumented-bundle-counter-leak'),
      `expected uninstrumented-bundle-counter-leak failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('C05 delta 3: a leaked scenario symbol in the ordinary bundle fails ordinary-bundle-counter-leak', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shmup-ordinary-leak-'));
  try {
    mkdirSync(join(fixture, 'assets'), { recursive: true });
    writeFileSync(
      join(fixture, 'assets', 'bundle.js'),
      'window.__shmupEvidence__ = {};',
    );
    const result = evaluateEvidenceComparison({
      evidenceDir: EVIDENCE_DIR,
      distDir: fixture,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('ordinary-bundle-counter-leak'),
      `expected ordinary-bundle-counter-leak failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('C05 delta 4: a mismatched runId fails pass-a-run-id', () => {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, 'v02-wi-04-instrumented-regular-workload.json', (r) => {
      r.runId = 'v02-wi-04-c04-168822f';
      return r;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('pass-a-run-id'),
      `expected pass-a-run-id failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * V02-WI-05 E02 C04 raw-evidence mutation helper. It mutates the RAW Pass B
 * probe array only and deliberately leaves every summary boolean/count exactly
 * as the real accepted record has it, so a passing summary can never mask the
 * tampered raw fact. Summary-mutation counter-cases pass
 * `{ expectSummariesValid: false }`.
 */
function runPassBRawProbeMutation(
  label,
  mutate,
  expectedFailure,
  { expectSummariesValid = true } = {},
) {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(
      dir,
      'v02-wi-04-uninstrumented-regular-workload.json',
      (record) => {
        mutate(record);
        return record;
      },
    );
    const mutated = JSON.parse(
      readFileSync(
        join(dir, 'v02-wi-04-uninstrumented-regular-workload.json'),
        'utf8',
      ),
    );
    // The deliberately untouched reporting flags stay as the valid record has
    // them, so the rejection must come from the recomputed raw-probe facts.
    if (expectSummariesValid) {
      assert.equal(
        mutated.workloadValidity.combatActiveThroughout,
        true,
        label,
      );
      assert.equal(
        mutated.workloadValidity.countdownRemainedFinal,
        true,
        label,
      );
      assert.equal(mutated.workloadValidity.terminalOrResultSeen, false, label);
      assert.equal(mutated.workloadValidity.baseOrOperationsSeen, false, label);
      assert.equal(mutated.workloadValidity.valid, true, label);
    }

    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes(expectedFailure),
      `${label}: expected ${expectedFailure} failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('C05 delta 4: a mismatched source fingerprint fails post-legacy-fingerprint-current', () => {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, 'post-integration-legacy-five-basic.json', (r) => {
      r.sourceFingerprint.digest = '00000000';
      return r;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('post-legacy-fingerprint-current'),
      `expected post-legacy-fingerprint-current failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C04: a raw probe without a canvas fails pass-b-probe-active-combat while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw canvas',
    (record) => {
      record.workloadValidity.probes[1].canvasCount = 0;
    },
    'pass-b-probe-active-combat',
  );
});

test('C04: a raw probe without the Combat HUD fails pass-b-probe-active-combat while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw combat HUD',
    (record) => {
      record.workloadValidity.probes[2].combatHudCount = 0;
    },
    'pass-b-probe-active-combat',
  );
});

test('C04: a raw probe without the Combat Screen fails pass-b-probe-active-combat while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw combat screen',
    (record) => {
      record.workloadValidity.probes[0].combatScreenVisible = false;
    },
    'pass-b-probe-active-combat',
  );
});

test('C04: a raw probe with a non-final countdown fails pass-b-probe-countdown-final while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw countdown',
    (record) => {
      record.workloadValidity.probes[3].countdownText = '00:01';
    },
    'pass-b-probe-countdown-final',
  );
});

test('C04: a raw probe with a Mission Result Overlay fails pass-b-probe-no-terminal while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw result overlay',
    (record) => {
      record.workloadValidity.probes[1].resultOverlayCount = 1;
    },
    'pass-b-probe-no-terminal',
  );
});

test('C04: a raw probe with a dialog fails pass-b-probe-no-terminal while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw dialog',
    (record) => {
      record.workloadValidity.probes[0].dialogCount = 1;
    },
    'pass-b-probe-no-terminal',
  );
});

test('C04: a raw probe with a Game Over Screen fails pass-b-probe-no-terminal while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw game over',
    (record) => {
      record.workloadValidity.probes[2].gameOverScreenCount = 1;
    },
    'pass-b-probe-no-terminal',
  );
});

test('C04: a raw probe showing Operations/Base fails pass-b-probe-no-base while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'raw operations',
    (record) => {
      record.workloadValidity.probes[3].operationsScreenCount = 1;
    },
    'pass-b-probe-no-base',
  );
});

test('C04: a malformed raw probe fails pass-b-probe-structure while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'malformed probe',
    (record) => {
      record.workloadValidity.probes[2] = 'not-a-probe';
    },
    'pass-b-probe-structure',
  );
});

test('C04: a raw probe missing a contract key fails pass-b-probe-structure while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'missing probe key',
    (record) => {
      delete record.workloadValidity.probes[1].combatHudCount;
    },
    'pass-b-probe-structure',
  );
});

test('C04: a missing raw probe (probe-count inconsistency) fails pass-b-probe-structure while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'missing probe',
    (record) => {
      record.workloadValidity.probes.pop();
    },
    'pass-b-probe-structure',
  );
});

test('C04: an extra raw probe (probe-count inconsistency) fails pass-b-probe-structure while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'extra probe',
    (record) => {
      record.workloadValidity.probes.push({
        ...record.workloadValidity.probes[3],
      });
    },
    'pass-b-probe-structure',
  );
});

test('C04: a swapped raw-probe label order fails pass-b-probe-structure while every summary stays valid', () => {
  runPassBRawProbeMutation(
    'probe order',
    (record) => {
      record.workloadValidity.probes[0].label = 'sample-start';
    },
    'pass-b-probe-structure',
  );
});

test('C04: a summary probe count that disagrees with the raw probes fails pass-b-probe-summary-consistency', () => {
  runPassBRawProbeMutation(
    'summary probe count',
    (record) => {
      // Raw probes stay healthy; only the reporting count lies.
      record.workloadValidity.probeCount = 3;
    },
    'pass-b-probe-summary-consistency',
  );
});

test('C04: a summary that contradicts healthy raw probes fails pass-b-probe-summary-consistency', () => {
  runPassBRawProbeMutation(
    'summary contradiction',
    (record) => {
      record.workloadValidity.combatActiveThroughout = false;
    },
    'pass-b-probe-summary-consistency',
    { expectSummariesValid: false },
  );
});

test('C04: a Pass B record without the authored final arrival fails pass-b-workload-arrival', () => {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, 'v02-wi-04-uninstrumented-regular-workload.json', (r) => {
      r.workloadValidity.arrivalReached = false;
      r.workloadValidity.valid = false;
      return r;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('pass-b-workload-arrival'),
      `expected pass-b-workload-arrival failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * V02-WI-06 E04-C02 Elite workload mutation helper: it mutates one Elite record
 * field and asserts the SPECIFIC Elite integrity check fails.
 */
function runEliteRecordMutation(label, fileName, mutate, expectedFailure) {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, fileName, (record) => {
      mutate(record);
      return record;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes(expectedFailure),
      `${label}: expected ${expectedFailure} failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * V02-WI-06 E04-C02 Elite Pass B raw-probe mutation helper: it mutates the RAW
 * ordered Elite probe array only and deliberately leaves every summary
 * boolean/count exactly as the real record has it, so a passing summary can
 * never mask the tampered raw fact.
 */
function runEliteRawProbeMutation(
  label,
  mutate,
  expectedFailure,
  { expectSummariesValid = true } = {},
) {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(
      dir,
      'v02-wi-06-uninstrumented-elite-workload.json',
      (record) => {
        mutate(record);
        return record;
      },
    );
    const mutated = JSON.parse(
      readFileSync(
        join(dir, 'v02-wi-06-uninstrumented-elite-workload.json'),
        'utf8',
      ),
    );
    if (expectSummariesValid) {
      const validity = mutated.workloadValidity;
      assert.equal(validity.eliteActiveThroughout, true, label);
      assert.equal(validity.anchorRowThroughout, true, label);
      assert.equal(validity.combatActiveThroughout, true, label);
      assert.equal(validity.countdownRemainedFinal, true, label);
      assert.equal(validity.terminalOrResultSeen, false, label);
      assert.equal(validity.baseOrOperationsSeen, false, label);
      assert.equal(validity.valid, true, label);
    }
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes(expectedFailure),
      `${label}: expected ${expectedFailure} failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('E04-C02: an Elite Pass A record without the exact phase order/durations fails elite-pass-a-complete-phases', () => {
  runEliteRecordMutation(
    'elite phase durations',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      // The complete 12 s Armoured phase is falsified while every other observed
      // Elite fact stays exactly as the real record has it.
      record.observedMaxima.eliteWorkload.phaseDurations = [360, 720];
    },
    'elite-pass-a-complete-phases',
  );
});

test('E04-C02: an Elite Pass A record that never reached the Core cap fails elite-pass-a-core-cap', () => {
  runEliteRecordMutation(
    'elite core cap',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      record.observedMaxima.eliteWorkload.maxActiveHomingCores = 1;
    },
    'elite-pass-a-core-cap',
  );
});

test('E04-C02: an Elite Pass A record that loses continuous player fire fails elite-pass-a-continuous-player-fire', () => {
  runEliteRecordMutation(
    'elite continuous player fire',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      const counters = record.observedMaxima.eliteWorkload;
      counters.eliteWorkloadPlayerFireSteps = counters.activeEliteSteps - 1;
    },
    'elite-pass-a-continuous-player-fire',
  );
});

test('E04-C02: an Elite Pass A record missing one cannon stream fails elite-pass-a-cannon-streams', () => {
  runEliteRecordMutation(
    'elite cannon stream',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      record.observedMaxima.eliteWorkload.leftCannonProjectilesObserved = 0;
    },
    'elite-pass-a-cannon-streams',
  );
});

test('E04-C02: an Elite Pass A record with a multi-Elite step fails elite-pass-a-single-elite', () => {
  runEliteRecordMutation(
    'elite single elite',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      record.observedMaxima.eliteWorkload.elitePresenceViolationSteps = 1;
    },
    'elite-pass-a-single-elite',
  );
});

test('E04-C02: an Elite Pass A record with regular enemies in the workload fails elite-pass-a-elite-only', () => {
  runEliteRecordMutation(
    'elite only workload',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      record.observedMaxima.activeEnemiesByRole['basic-drone'] = 2;
    },
    'elite-pass-a-elite-only',
  );
});

test('E04-C02: an Elite Pass B probe without the permitted Core cap in the Vulnerable window fails elite-pass-b-core-cap while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw core cap',
    (record) => {
      // Both Vulnerable probes lose the cap: the sample never observed it.
      record.workloadValidity.probes[2].activeHomingCores = 1;
      record.workloadValidity.probes[3].activeHomingCores = 1;
    },
    'elite-pass-b-core-cap',
  );
});

test('E04-C02: an Elite Pass B probe with the wrong phase order fails elite-pass-b-authored-phase-progress while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw phase order',
    (record) => {
      // The Vulnerable probe is relabelled Armoured: the same phase then also
      // rewinds, so the authored cycle order is provably broken.
      record.workloadValidity.probes[2].elitePhase = 'armoured';
    },
    'elite-pass-b-authored-phase-progress',
  );
});

test('E04-C02: an Elite Pass B probe whose Armoured phase is not the authored one fails elite-pass-b-authored-phase-progress while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw armoured elapsed',
    (record) => {
      // The probe is still Armoured, but the 12 s phase was never executed.
      record.workloadValidity.probes[1].elitePhaseStepsElapsed = 120;
    },
    'elite-pass-b-authored-phase-progress',
  );
});

test('E04-C02: an Elite Pass B sample that starts before the final Armoured steps fails elite-pass-b-authored-phase-progress while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw early sample start',
    (record) => {
      record.workloadValidity.probes[0].elitePhaseStepsElapsed = 120;
      record.workloadValidity.probes[1].elitePhaseStepsElapsed = 240;
    },
    'elite-pass-b-authored-phase-progress',
  );
});

test('E04-C02: an Elite Pass B probe missing one cannon stream fails elite-pass-b-attack-streams while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw cannon stream',
    (record) => {
      record.workloadValidity.probes[1].activeCannonRight = 0;
    },
    'elite-pass-b-attack-streams',
  );
});

test('E04-C02: an Elite Pass B probe without continuous player fire fails elite-pass-b-attack-streams while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw player fire',
    (record) => {
      record.workloadValidity.probes[2].activePlayerProjectiles = 0;
    },
    'elite-pass-b-attack-streams',
  );
});

test('E04-C02: an Elite Pass B probe off the authored anchor row fails elite-pass-b-elite-active-on-anchor while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw anchor row',
    (record) => {
      record.workloadValidity.probes[0].eliteAnchorRowAligned = false;
    },
    'elite-pass-b-elite-active-on-anchor',
  );
});

test('E04-C02: an Elite Pass B probe without the activated Elite fails elite-pass-b-elite-active-on-anchor while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw activation',
    (record) => {
      record.workloadValidity.probes[3].eliteActivated = false;
    },
    'elite-pass-b-elite-active-on-anchor',
  );
});

test('E04-C02: an Elite Pass B probe with a Base frame fails elite-pass-b-no-terminal while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw base frame',
    (record) => {
      record.workloadValidity.probes[1].operationsScreenCount = 1;
    },
    'elite-pass-b-no-terminal',
  );
});

test('E04-C02: an Elite Pass B probe with a Mission Result Overlay fails elite-pass-b-no-terminal while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw result overlay',
    (record) => {
      record.workloadValidity.probes[3].resultOverlayCount = 1;
    },
    'elite-pass-b-no-terminal',
  );
});

test('E04-C02: a malformed Elite Pass B probe fails elite-pass-b-probe-structure while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw malformed probe',
    (record) => {
      record.workloadValidity.probes[2] = 'not-a-probe';
    },
    'elite-pass-b-probe-structure',
  );
});

test('E04-C02: an Elite Pass B probe missing a contract key fails elite-pass-b-probe-structure while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw missing probe key',
    (record) => {
      delete record.workloadValidity.probes[1].activeHomingCores;
    },
    'elite-pass-b-probe-structure',
  );
});

test('E04-C02: a missing Elite Pass B probe fails elite-pass-b-probe-structure while every summary stays valid', () => {
  runEliteRawProbeMutation(
    'elite raw missing probe',
    (record) => {
      record.workloadValidity.probes.pop();
    },
    'elite-pass-b-probe-structure',
  );
});

test('E04-C02: an Elite Pass B summary that contradicts healthy raw probes fails elite-pass-b-summary-consistency', () => {
  runEliteRawProbeMutation(
    'elite summary contradiction',
    (record) => {
      record.workloadValidity.coreCapObserved = false;
    },
    'elite-pass-b-summary-consistency',
    { expectSummariesValid: false },
  );
});

test('E04-C02: an Elite Pass B timing record carrying instrumentation maxima fails elite-pass-b-uninstrumented', () => {
  runEliteRecordMutation(
    'elite timing instrumentation',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      record.observedMaxima = { steps: 1 };
    },
    'elite-pass-b-uninstrumented',
  );
});

test('E04-C02: an Elite Pass B record with the wrong runId fails elite-pass-b-run-id', () => {
  runEliteRecordMutation(
    'elite run id',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      record.runId = 'v02-wi-05-e04-c01-d299f2a';
    },
    'elite-pass-b-run-id',
  );
});

test('E04-C02: an Elite Pass B record with a mismatched source fingerprint fails elite-pass-b-fingerprint-current', () => {
  runEliteRecordMutation(
    'elite fingerprint',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      record.sourceFingerprint.digest = 'ffffffff';
    },
    'elite-pass-b-fingerprint-current',
  );
});

test('E04-C02: a missing Elite Pass A record fails elite-pass-a-record-present', () => {
  const dir = makeTempEvidenceDir();
  try {
    rmSync(join(dir, 'v02-wi-06-instrumented-elite-workload.json'), {
      force: true,
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('elite-pass-a-record-present'),
      `expected elite-pass-a-record-present failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E04-C02: a leaked Elite counter symbol in the uninstrumented bundle fails uninstrumented-bundle-counter-leak', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shmup-elite-counter-leak-'));
  try {
    mkdirSync(join(fixture, 'assets'), { recursive: true });
    writeFileSync(
      join(fixture, 'assets', 'bundle.js'),
      'const x = { maxActiveHomingCores: 2 };',
    );
    const result = evaluateEvidenceComparison({
      evidenceDir: EVIDENCE_DIR,
      distDir: REAL_DIST,
      uninstrumentedDir: fixture,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('uninstrumented-bundle-counter-leak'),
      `expected uninstrumented-bundle-counter-leak failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('E04-C02: a leaked Elite identity symbol in the ordinary bundle fails ordinary-bundle-counter-leak', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shmup-elite-symbol-leak-'));
  try {
    mkdirSync(join(fixture, 'assets'), { recursive: true });
    writeFileSync(
      join(fixture, 'assets', 'bundle.js'),
      'window.__shmupEliteWorkload__ = { readEliteWorkload() {} };',
    );
    const result = evaluateEvidenceComparison({
      evidenceDir: EVIDENCE_DIR,
      distDir: fixture,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('ordinary-bundle-counter-leak'),
      `expected ordinary-bundle-counter-leak failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('E04-C02: the canonical mission seed must equal its FNV-1a derivation', () => {
  const dir = makeTempEvidenceDir();
  try {
    mutateRecord(dir, 'v02-wi-06-instrumented-elite-workload.json', (r) => {
      r.canonicalSeed = 1;
      return r;
    });
    const result = evaluateEvidenceComparison({
      evidenceDir: dir,
      distDir: REAL_DIST,
      uninstrumentedDir: REAL_UNINSTRUMENTED,
      writePackage: false,
    });
    const names = failureNames(result);
    assert.ok(
      names.includes('elite-canonical-seed-identity'),
      `expected elite-canonical-seed-identity failure, got ${names.join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E04-C02-C01: a non-zero Elite identity-surface count fails elite-pass-a-cleanup-object', () => {
  runEliteRecordMutation(
    'elite pass-a surface retained',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      record.cleanup.eliteWorkloadSurfaceCount = 1;
    },
    'elite-pass-a-cleanup-object',
  );
});

test('E04-C02-C01: a missing Elite identity-surface count fails elite-pass-a-cleanup-object', () => {
  runEliteRecordMutation(
    'elite pass-a surface missing',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      delete record.cleanup.eliteWorkloadSurfaceCount;
    },
    'elite-pass-a-cleanup-object',
  );
});

test('E04-C02-C01: a non-zero Elite identity-surface count fails elite-pass-b-cleanup-object', () => {
  runEliteRecordMutation(
    'elite pass-b surface retained',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      record.cleanup.eliteWorkloadSurfaceCount = 1;
    },
    'elite-pass-b-cleanup-object',
  );
});

test('E04-C02-C01: a missing Elite identity-surface count fails elite-pass-b-cleanup-object', () => {
  runEliteRecordMutation(
    'elite pass-b surface missing',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      delete record.cleanup.eliteWorkloadSurfaceCount;
    },
    'elite-pass-b-cleanup-object',
  );
});

test('E04-C02-C01: a non-empty consoleErrors array fails elite-pass-b-console-errors', () => {
  runEliteRecordMutation(
    'elite pass-b console error',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      record.consoleErrors = ['uncaught test failure'];
    },
    'elite-pass-b-console-errors',
  );
});

test('E04-C02-C01: a missing consoleErrors array fails elite-pass-b-console-errors', () => {
  runEliteRecordMutation(
    'elite pass-b console errors missing',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      delete record.consoleErrors;
    },
    'elite-pass-b-console-errors',
  );
});

test('E04-C02-C01: a wrong-viewport Elite record fails elite-pass-a-viewport', () => {
  runEliteRecordMutation(
    'elite pass-a viewport',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      record.viewport = { width: 1280, height: 600 };
    },
    'elite-pass-a-viewport',
  );
});

test('E04-C02-C01: a wrong-viewport timing record fails pass-b-viewport', () => {
  runEliteRecordMutation(
    'regular pass-b viewport',
    'v02-wi-04-uninstrumented-regular-workload.json',
    (record) => {
      record.viewport = { width: 1920, height: 1080 };
    },
    'pass-b-viewport',
  );
});

test('E04-C02-C01: a cross-machine record fails machine-browser-identity', () => {
  runEliteRecordMutation(
    'cross machine',
    'v02-wi-04-uninstrumented-regular-workload.json',
    (record) => {
      record.machine.cpuCount = record.machine.cpuCount + 1;
    },
    'machine-browser-identity',
  );
});

test('E04-C02-C01: a cross-browser record fails machine-browser-identity', () => {
  runEliteRecordMutation(
    'cross browser',
    'post-integration-legacy-five-basic.json',
    (record) => {
      record.browser =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/1.0.0.0 Safari/537.36';
    },
    'machine-browser-identity',
  );
});

test('E04-C02-C01: a current-candidate record tied to another revision fails pass-a-current-build-identity', () => {
  runEliteRecordMutation(
    'current build identity',
    'v02-wi-04-instrumented-regular-workload.json',
    (record) => {
      record.buildIdentifier = '[shmup] build shmup@0.1.0 (deadbee-dirty)';
    },
    'pass-a-current-build-identity',
  );
});

test('E04-C02-C01: a different Elite scenario identity between passes fails elite-scenario-identity', () => {
  runEliteRecordMutation(
    'elite scenario mismatch',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      record.scenarioIdentity = {
        ...record.scenarioIdentity,
        scenario: 'm01-e5',
      };
    },
    'elite-scenario-identity',
  );
});

test('E04-C02-C01: a wrong fixed-step identity fails elite-scenario-identity-canonical', () => {
  runEliteRecordMutation(
    'elite fixed-step identity',
    'v02-wi-06-uninstrumented-elite-workload.json',
    (record) => {
      record.scenarioIdentity = {
        ...record.scenarioIdentity,
        fixedStepId: '1/30',
        fixedStepsPerSecond: 30,
      };
    },
    'elite-scenario-identity-canonical',
  );
});

test('E04-C02-C01: a missing scenario identity fails elite-scenario-identity-canonical', () => {
  runEliteRecordMutation(
    'elite scenario identity missing',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      delete record.scenarioIdentity;
    },
    'elite-scenario-identity-canonical',
  );
});

test('E04-C02-C01: an Elite created off the authored fixed step fails elite-pass-a-creation-step', () => {
  runEliteRecordMutation(
    'elite creation step',
    'v02-wi-06-instrumented-elite-workload.json',
    (record) => {
      record.observedMaxima.eliteWorkload.eliteCreationMissionStep = 19199;
    },
    'elite-pass-a-creation-step',
  );
});
