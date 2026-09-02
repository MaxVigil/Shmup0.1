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
 *     (delta 4).
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
