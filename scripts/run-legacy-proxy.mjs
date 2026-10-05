#!/usr/bin/env node
/**
 * V02-WI-04 C04 legacy five-Basic proxy runner (Epic §20.1, delta 5/6/7).
 *
 * Reconstructs the immutable base revision (168822f) in a FRESH disposable
 * temporary directory on EVERY run (safely created with `mkdtemp`, cleaned in
 * a `finally`), injects the workload-identity observer + five-Basic spawn into
 * the base copy, and records the base legacy five-Basic production proxy with
 * the SAME harness that runs against the current uninstrumented scenario build
 * (scenarios ON, counters OFF). Both sides use the same fixed session seed,
 * the same exact five-Basic materialization, the same browser/machine/viewport
 * (1366×768), automatic Machine Gun fire, fixed-step method, sample duration,
 * and uninstrumented production optimization mode. The known base revision is
 * injected into the base record so `buildIdentifier` is never unknown. The
 * active checkout is never touched.
 *
 * V02-WI-07 D05: each side is invoked exactly ONCE. The previous bounded
 * retry-until-pass loop is removed, so a failing sample propagates immediately
 * as raw failure evidence and is never replaced by a later attempt. The single
 * side invocation is exported for the focused tooling regression.
 *
 * V02-WI-07 D05-C02: the disposable base copy receives the complete shared
 * harness set, including the local evidence helper the harness imports, and the
 * absent `src/test-support` destination directory is created first.
 * `--preflight` prepares a disposable base copy through the same real path and
 * verifies the historical dependency/build context and Playwright discovery
 * without executing any measurement.
 *
 * Usage: node scripts/run-legacy-proxy.mjs [--preflight]
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSourceFingerprint } from './evidence-source-fingerprint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_REV = '168822f4fac647c8a14ffe751c3c2363c7a71c41';
const EVIDENCE_DIR = join(ROOT, '.agent-handoff', 'evidence');
const LEGACY_PORT = 4176;

/** V02-WI-04 C05 evidence ownership: the active control runId and the current
 *  source fingerprint are injected into BOTH legacy harnesses so every record
 *  carries the same coherent ownership (delta 4). */
const controlPath = join(ROOT, '.agent-handoff', 'control.json');
const RUN_ID = existsSync(controlPath)
  ? JSON.parse(readFileSync(controlPath, 'utf8')).runId
  : null;
const SOURCE_FINGERPRINT = computeSourceFingerprint(ROOT);
const OWNERSHIP_ENV = {
  SHMUP_EVIDENCE_RUN_ID: RUN_ID ?? 'MISSING-CONTROL-RUN-ID',
  SHMUP_EVIDENCE_SOURCE_FINGERPRINT: JSON.stringify(SOURCE_FINGERPRINT),
};

/** The identity-hook injection applied ONLY to the disposable base copy's
 *  combat entry (the base has no evidence-scenario infrastructure). It reuses
 *  the base's own one-use `spawn-final-group` transform and reads the current
 *  active enemy mix — never timing or cumulative counters. */
const BASE_IDENTITY_HOOK = `  // V02-WI-04 C04 injected legacy-proxy evidence hook (disposable base copy).
  (
    window as unknown as { __legacyBenchmarkIdentity__?: unknown }
  ).__legacyBenchmarkIdentity__ = {
    spawnFiveBasic(): void {
      runtime.submitDebug({ type: 'combat-debug/spawn-final-group' });
    },
    readActiveByType(): Record<string, number> {
      const state = runtime.getState();
      const counts: Record<string, number> = {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      };
      for (const enemy of state.enemies) {
        counts[enemy.type] = (counts[enemy.type] ?? 0) + 1;
      }
      return counts;
    },
  };

  const submitCommand = (command: CombatInputCommand): void => {`;

const INJECT_ANCHOR =
  '  const submitCommand = (command: CombatInputCommand): void => {';

/** V02-WI-04 C04: the base copy's `forceFinalGroupSpawn` is patched so the
 *  injected proxy replaces any natural arrivals and materializes EXACTLY five
 *  TOP-entry Basic drones at the same engagement-band fractions as the
 *  post-integration benchmark (0.1/0.3/0.5/0.7/0.9). The base Mission 01
 *  schedule spawns its first regular group at mission time 0, so appending
 *  would contaminate the sample; the legacy RNG plan also mixed top/side
 *  entries and cannot be compared as the same workload. Both sides project the
 *  fractions inside the aircraft's reachable centre range with identical
 *  bounds, and future spawns are cancelled so exactly 5 Basic + 0 others are
 *  active concurrently. */
const FORCE_FINAL_GROUP_SPAWN_ANCHOR = `  const spawned = placeTopEntriesWithinEngagementBand(
    spawnGroupDrones(
      finalGroup,
      state.nextEnemyId,
      state.enemyType,
      state.enemyHullIntegrity,
      state.viewportWidth,
      state.viewportHeight,
      state.enemySize,
    ),
    state.viewportWidth,
    state.enemySize,
    state.bounds,
  );
  return {
    ...state,
    enemies: [...state.enemies, ...spawned],
    nextEnemyId: state.nextEnemyId + spawned.length,
    // AC-042: forcing the final group cancels all future regular/final spawns
    // without mutating mission time or removing already active enemies.
    spawnPlanIndex: state.spawnPlan.length,
    finalGroupSpawned: true,
  };`;

const FORCE_FINAL_GROUP_SPAWN_REPLACEMENT = `  // V02-WI-04 C04 injected legacy-proxy workload (disposable base copy only):
  // replace any natural arrivals and materialize EXACTLY five top-entry Basic
  // drones at the same engagement-band fractions the post-integration
  // benchmark uses, projected inside the aircraft's reachable centre range
  // identically on both sides. Future regular/final spawns are cancelled so
  // the proxy proves exactly 5 Basic + 0 other enemies concurrently.
  const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
  const spawned = fractions.map((fraction, index) => {
    const bandCenter =
      state.bounds.minX + fraction * (state.bounds.maxX - state.bounds.minX);
    const spawnAxis =
      (bandCenter - state.enemySize / 2) /
      (state.viewportWidth - state.enemySize);
    return spawnEnemy(
      state.nextEnemyId + index,
      state.enemyType,
      state.enemyHullIntegrity,
      'top',
      spawnAxis,
      null,
      null,
      state.viewportWidth,
      state.viewportHeight,
      state.enemySize,
    );
  });
  return {
    ...state,
    enemies: [...spawned],
    nextEnemyId: state.nextEnemyId + spawned.length,
    spawnPlanIndex: state.spawnPlan.length,
    finalGroupSpawned: true,
  };`;

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd ?? ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed with exit ${result.status}`,
    );
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // not ready yet
    }
    await delay(500);
  }
  throw new Error(`Server at ${url} did not become ready in time`);
}

function serveBuild(cwd, outDir) {
  return spawn(
    join(cwd, 'node_modules', '.bin', 'vite'),
    [
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(LEGACY_PORT),
      '--outDir',
      outDir,
    ],
    { cwd, stdio: 'ignore' },
  );
}

/**
 * Runs ONE side of the legacy five-Basic proxy exactly once (V02-WI-07 D05).
 *
 * The unchanged Playwright workload is invoked a single time per side. A
 * non-zero result propagates immediately as the side's raw failure evidence, so
 * an unfavourable sample can never be replaced by a later, more favourable
 * attempt. The harness writes its record only after every in-browser assertion
 * passed, and nothing here deletes or rewrites an existing record file, so a
 * failed attempt leaves whatever raw data exists on disk untouched. The sample
 * duration, the 50 FPS floor, the seeds, and the workload are unchanged.
 *
 * `invoke` is injectable only so the single-attempt contract is covered by the
 * focused tooling regression (`scripts/run-legacy-proxy.test.mjs`).
 */
export async function recordProxy(
  cwd,
  recordName,
  side,
  buildIdentifier,
  invoke = invokeLegacyWorkload,
) {
  const env = {
    LEGACY_PROXY_RECORD: recordName,
    LEGACY_PROXY_SIDE: side,
    LEGACY_PROXY_EVIDENCE_DIR: EVIDENCE_DIR,
    // V02-WI-04 C05: both legacy records carry the current control runId and
    // the common current-source fingerprint.
    ...OWNERSHIP_ENV,
  };
  if (buildIdentifier !== undefined) {
    env.LEGACY_PROXY_BUILD_IDENTIFIER = buildIdentifier;
  }
  await invoke(cwd, env);
}

/** Runs the unchanged legacy Playwright workload for exactly one side. */
async function invokeLegacyWorkload(cwd, env) {
  run('npx', ['playwright', 'test', '-c', 'playwright.legacy.config.ts'], {
    cwd,
    env,
  });
}

/**
 * The current shared harness files the disposable base copy must receive, at
 * the same relative paths. The base revision keeps its own application source;
 * only the harness, every local module that harness imports, and the evidence
 * Playwright config are taken from the current tree (V02-WI-07 D05-C02: the
 * explicit list is the whole contract — never a source-tree copy).
 */
export const BASE_COPY_SHARED_FILES = [
  'e2e/legacy-proxy-performance.spec.ts',
  'e2e/evidence-ownership.ts',
  'src/test-support/legacy-proxy-evidence.ts',
  'playwright.legacy.config.ts',
];

/**
 * Copies the shared harness files into a disposable base copy, creating each
 * destination's parent directory first: the immutable base revision has no
 * `src/test-support`, so the destination directory for the shared
 * legacy-proxy evidence helper has to be created before it can be written
 * (V02-WI-07 D05-C02 repair of the base-copy preparation).
 */
export function copySharedHarnessIntoBaseCopy(baseDir, sourceRoot = ROOT) {
  for (const relative of BASE_COPY_SHARED_FILES) {
    const destination = join(baseDir, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(sourceRoot, relative), destination);
  }
}

/** Extracts the immutable base revision into the disposable directory. */
export function extractBaseRevision(baseDir) {
  const archive = execFileSync('git', ['archive', BASE_REV], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  execFileSync('tar', ['-xzf', '-'], { cwd: baseDir, input: archive });
}

/**
 * Injects the identity hook into the base entry and patches the base's
 * `forceFinalGroupSpawn` so the proxy materializes the SAME five top-entry
 * Basic workload as the post-integration benchmark (the base has no
 * evidence-scenario infrastructure; the injection is the compile-time
 * evidence-only scenario).
 */
export function injectBaseWorkloadIdentity(baseDir) {
  const entryPath = join(baseDir, 'src', 'combat-presentation', 'entry.ts');
  const entrySource = readFileSync(entryPath, 'utf8');
  if (!entrySource.includes(INJECT_ANCHOR)) {
    throw new Error('Base entry anchor not found; injection aborted');
  }
  const injectedEntry = entrySource.replace(INJECT_ANCHOR, BASE_IDENTITY_HOOK);
  writeFileSync(entryPath, injectedEntry);

  const simulationPath = join(
    baseDir,
    'src',
    'application',
    'combat',
    'combat-simulation.ts',
  );
  const simulationSource = readFileSync(simulationPath, 'utf8');
  const anchorCount =
    simulationSource.split(FORCE_FINAL_GROUP_SPAWN_ANCHOR).length - 1;
  if (anchorCount !== 1) {
    throw new Error(
      `Base forceFinalGroupSpawn anchor must appear exactly once (found ${anchorCount}); injection aborted`,
    );
  }
  const injectedSimulation = simulationSource.replace(
    FORCE_FINAL_GROUP_SPAWN_ANCHOR,
    FORCE_FINAL_GROUP_SPAWN_REPLACEMENT,
  );
  writeFileSync(simulationPath, injectedSimulation);
}

/**
 * CLI entry (V02-WI-07 D05): reconstruct the immutable base side, record the
 * current post-integration side, and then run the shared comparison validator.
 * Guarded below so importing this module for the focused tooling regression
 * never performs any build, browser, or filesystem work.
 */
async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  // ---------------------------------------------------------------------------
  // 1. Base legacy proxy: fresh disposable reconstruction + identity-hook
  //    injection (never touches the active checkout; cleaned in `finally`).
  // ---------------------------------------------------------------------------
  let baseDir = null;
  let basePreview = null;
  let postPreview = null;
  try {
    baseDir = mkdtempSync(join(tmpdir(), 'shmup-v02-wi-04-base-proxy-'));
    console.log(`Fresh base copy at ${baseDir}`);
    extractBaseRevision(baseDir);
    injectBaseWorkloadIdentity(baseDir);
    // The SAME harness version, its local imports and the evidence config are
    // copied into the base copy (V02-WI-07 D05-C02: the shared legacy-proxy
    // evidence helper is part of that set).
    copySharedHarnessIntoBaseCopy(baseDir);

    console.log('Installing base copy dependencies (npm ci)...');
    run('npm', ['ci'], { cwd: baseDir });
    console.log('Building the base production artifact...');
    run('npm', ['run', 'build'], { cwd: baseDir });
    basePreview = serveBuild(baseDir, 'dist');
    await waitForServer(`http://127.0.0.1:${LEGACY_PORT}/`);
    console.log('Recording the base legacy five-Basic proxy...');
    await recordProxy(
      baseDir,
      'base-legacy-five-basic.json',
      'base',
      `[shmup] build shmup@0.1.0 (${BASE_REV})`,
    );
    basePreview.kill();
    basePreview = null;

    // -------------------------------------------------------------------------
    // 2. Post-integration legacy proxy (current uninstrumented scenario build:
    //    scenarios ON, counters OFF — timing is never instrumented).
    // -------------------------------------------------------------------------
    console.log('Building the current uninstrumented scenario artifact...');
    run('npm', ['run', 'build:evidence-uninstrumented'], { cwd: ROOT });
    postPreview = serveBuild(ROOT, 'dist-evidence-uninstrumented');
    await waitForServer(`http://127.0.0.1:${LEGACY_PORT}/`);
    console.log('Recording the post-integration legacy five-Basic proxy...');
    await recordProxy(
      ROOT,
      'post-integration-legacy-five-basic.json',
      'post-integration',
      undefined,
    );
    postPreview.kill();
    postPreview = null;
  } finally {
    if (basePreview !== null) {
      basePreview.kill();
    }
    if (postPreview !== null) {
      postPreview.kill();
    }
    if (baseDir !== null && baseDir.startsWith(tmpdir())) {
      rmSync(baseDir, { recursive: true, force: true });
      console.log(`Cleaned base copy at ${baseDir}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Comparison package with assertions (delta 8).
  // ---------------------------------------------------------------------------
  console.log('Building the machine-readable comparison package...');
  run('node', ['scripts/compare-performance-evidence.mjs'], { cwd: ROOT });
  console.log('Legacy proxy evidence complete.');
}

/**
 * V02-WI-07 D05-C02 preflight: prepares a disposable base copy through the
 * REAL reconstruction path (extract → inject → copy the shared harness set) and
 * proves the historical dependency/build context and Playwright discovery
 * work, without executing any workload, server or measurement. Every
 * temporary resource is removed in `finally`.
 */
async function runBaseCopyPreflight() {
  let baseDir = null;
  try {
    baseDir = mkdtempSync(join(tmpdir(), 'shmup-v02-wi-04-base-preflight-'));
    console.log(`Preflight base copy at ${baseDir}`);
    extractBaseRevision(baseDir);
    injectBaseWorkloadIdentity(baseDir);
    copySharedHarnessIntoBaseCopy(baseDir);
    console.log('Preflight: installing base copy dependencies (npm ci)...');
    run('npm', ['ci'], { cwd: baseDir });
    console.log('Preflight: base build (typecheck + vite build)...');
    run('npm', ['run', 'build'], { cwd: baseDir });
    console.log(
      'Preflight: Playwright discovery (--list) of the real legacy test...',
    );
    run(
      'npx',
      ['playwright', 'test', '-c', 'playwright.legacy.config.ts', '--list'],
      { cwd: baseDir },
    );
    console.log(
      'Base-copy preflight passed: the disposable 168822f copy builds and resolves the shared harness imports.',
    );
  } finally {
    if (baseDir !== null && baseDir.startsWith(tmpdir())) {
      rmSync(baseDir, { recursive: true, force: true });
      console.log(`Cleaned preflight base copy at ${baseDir}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--preflight')) {
    await runBaseCopyPreflight();
  } else {
    await main();
  }
}
