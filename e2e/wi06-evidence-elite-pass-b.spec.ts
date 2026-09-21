import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';
import {
  ELITE_EVIDENCE_DIR,
  ELITE_EVIDENCE_SESSION_SEED,
  ELITE_EVIDENCE_VIEWPORT,
  ELITE_FINAL_COUNTDOWN,
  ELITE_IDENTITY_READ_PURPOSE,
  ELITE_PASS_SEPARATION,
  ELITE_PROBE_ORDER,
  ELITE_SCENARIO_IDENTITY,
  ELITE_SWEEP,
  fnv1a32,
  forceEliteEvidenceSessionSeed,
  readEliteProbe,
  readEliteWorkload,
  runEliteSweep,
  runEliteWorkloadScenario,
  sampleEliteFrames,
  startMission03ForEliteEvidence,
} from './elite-evidence-support';
import type {
  EliteCombatDomProbe,
  EliteSample,
  EliteWorkloadProbe,
  EliteWorkloadProbeFacts,
} from './elite-evidence-support';

/**
 * V02-WI-06 E04-C02 Pass B — uninstrumented production-optimized scenario
 * artifact (Epic §9.4, §20.1; V02-AC-009–010, V02-AC-028). It owns the Elite
 * workload TIMING: the same exact workload, the same fixed `6000 ms` sampling
 * window, the same percentile/minimum-window method, and the same continuous
 * supported-input sweep as Pass A, but with counters OFF.
 *
 * The sample is valid only while the exact Elite workload stays active across
 * the required Armoured→Vulnerable interval: every ordered raw probe must show
 * the Combat Screen, exactly one canvas, the Combat HUD, the `00:00` Countdown,
 * the single activated Elite on its authored anchor row, and no terminal or Base
 * frame; the probes must show Armoured before Vulnerable; both cannon streams
 * must be active in the Armoured part; and the permitted simultaneous cap of two
 * homing Cores must be observed in the Vulnerable part.
 */
const RECORD_FILE = 'v02-wi-06-uninstrumented-elite-workload.json';
const SAMPLE_WINDOW_MS = 6000;
/**
 * The sample starts when the Armoured phase has at most this many fixed steps
 * left (`0.5 s`), so the fixed `6000 ms` window spans the Armoured→Vulnerable
 * transition, runs through the Vulnerable phase, and reaches the permitted
 * simultaneous two-Core interval (`>= 300` Vulnerable steps) with margin.
 */
const ARMOURED_STEPS_BEFORE_BOUNDARY = 30;
/** Generous bounded deadline for the entry plus the Armoured phase. */
const ARMOURED_WAIT_DEADLINE_MS = 60_000;

/** Forces a full V8 garbage collection and returns the used JS heap in bytes. */
async function heapAfterGc(
  page: Page,
  context: BrowserContext,
): Promise<number> {
  const client = await context.newCDPSession(page);
  await client.send('HeapProfiler.collectGarbage');
  const { usedSize } = await client.send('Runtime.getHeapUsage');
  await client.detach();
  return usedSize;
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(ratio * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

/** The minimum sustained 1-second window FPS (the unchanged method). */
function minimumSustainedWindowFps(deltas: readonly number[]): number {
  const windows: number[] = [];
  let bucketFrames = 0;
  let bucketTime = 0;
  for (const delta of deltas) {
    bucketFrames += 1;
    bucketTime += delta;
    if (bucketTime >= 1000) {
      windows.push(bucketFrames / (bucketTime / 1000));
      bucketFrames = 0;
      bucketTime = 0;
    }
  }
  return windows.length === 0 ? 0 : Number(Math.min(...windows).toFixed(1));
}

/** Merges the player-visible DOM probe and the Elite identity facts into one
 *  ordered raw workload probe. */
function mergeProbe(
  label: string,
  combat: EliteCombatDomProbe,
  elite: EliteWorkloadProbeFacts | null,
): EliteWorkloadProbe {
  return {
    label,
    ...combat,
    missionSeed: elite?.missionSeed ?? -1,
    eliteCount: elite?.eliteCount ?? -1,
    eliteActivated: elite?.eliteActivated ?? false,
    elitePhase: elite?.elitePhase ?? null,
    elitePhaseStepsElapsed: elite?.elitePhaseStepsElapsed ?? -1,
    eliteAnchorRowAligned: elite?.eliteAnchorRowAligned ?? false,
    activeCannonLeft: elite?.activeCannonLeft ?? -1,
    activeCannonRight: elite?.activeCannonRight ?? -1,
    activeHomingCores: elite?.activeHomingCores ?? -1,
    activePlayerProjectiles: elite?.activePlayerProjectiles ?? -1,
    playerHullIntegrity: elite?.playerHullIntegrity ?? -1,
  };
}

/** Waits until the activated Elite is in Armoured with at most `stepsLeft`
 *  fixed steps left in its phase. */
async function waitForArmouredStepsLeft(
  page: Page,
  stepsLeft: number,
  deadlineMs: number,
): Promise<EliteWorkloadProbeFacts | null> {
  const startedAt = Date.now();
  let observation: EliteWorkloadProbeFacts | null = null;
  while (Date.now() - startedAt < deadlineMs) {
    observation = await readEliteWorkload(page);
    if (
      observation !== null &&
      observation.eliteActivated &&
      observation.elitePhase === 'armoured' &&
      observation.elitePhaseStepsElapsed >= 720 - stepsLeft
    ) {
      return observation;
    }
    await page.waitForTimeout(10);
  }
  return observation;
}

test('records the uninstrumented Elite §20.1 workload timing across the Armoured-to-Vulnerable interval in the production-optimized scenario artifact (V02-WI-06 E04-C02, V02-AC-009–010/028)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize(ELITE_EVIDENCE_VIEWPORT);
  await forceEliteEvidenceSessionSeed(page);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const workloadRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => workloadRequests.push(request.url()));
  const buildLines: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'info' &&
      message.text().startsWith('[shmup] build ')
    ) {
      buildLines.push(message.text());
    }
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await startMission03ForEliteEvidence(page);
  await runEliteWorkloadScenario(page);

  const sweepControl = { done: false };
  const sweepTask = runEliteSweep(page, sweepControl, 120_000);

  // The heap baseline is measured while the Armoured phase still has ~2 s to
  // run, so its cost can never shorten the final margin before the boundary.
  await waitForArmouredStepsLeft(page, 120, ARMOURED_WAIT_DEADLINE_MS);
  const heapBeforeGcBytes = await heapAfterGc(page, context);
  // The pre-sample probe is taken inside the final ~0.5 s of the Armoured
  // phase, and the fixed 6000 ms window then spans the Armoured→Vulnerable
  // transition and reaches the permitted two-Core interval.
  const lateArmoured = await waitForArmouredStepsLeft(
    page,
    ARMOURED_STEPS_BEFORE_BOUNDARY,
    ARMOURED_WAIT_DEADLINE_MS,
  );
  expect(lateArmoured).not.toBeNull();
  expect(lateArmoured?.elitePhase).toBe('armoured');
  const preSample = await readEliteProbe(page);
  const sampleStartedAt = Date.now();
  const sample: EliteSample = await sampleEliteFrames(page, SAMPLE_WINDOW_MS);
  const sampleWindowMs = Date.now() - sampleStartedAt;
  const hullIntegrityAtEnd = await readEliteWorkload(page);
  sweepControl.done = true;
  const sweepMoves = await sweepTask;
  const heapUsedAfterGcBytes = await heapAfterGc(page, context);

  const probes: EliteWorkloadProbe[] = [
    mergeProbe(ELITE_PROBE_ORDER[0], preSample.combat, preSample.elite),
    mergeProbe(
      ELITE_PROBE_ORDER[1],
      sample.probes[0] ?? preSample.combat,
      sample.eliteProbes[0] ?? null,
    ),
    mergeProbe(
      ELITE_PROBE_ORDER[2],
      sample.probes[1] ?? preSample.combat,
      sample.eliteProbes[1] ?? null,
    ),
    mergeProbe(
      ELITE_PROBE_ORDER[3],
      sample.probes[2] ?? preSample.combat,
      sample.eliteProbes[2] ?? null,
    ),
  ];

  // ---- Raw workload facts derived from the ordered probes --------------------
  const deltas = sample.deltas;
  const sorted = [...deltas].sort((a, b) => a - b);
  const meanMs =
    deltas.length === 0
      ? 0
      : deltas.reduce((total, value) => total + value, 0) / deltas.length;
  const eliteActiveThroughout = probes.every(
    (probe) => probe.eliteCount === 1 && probe.eliteActivated,
  );
  const anchorRowThroughout = probes.every(
    (probe) => probe.eliteAnchorRowAligned,
  );
  const combatActiveThroughout = probes.every(
    (probe) =>
      probe.combatScreenVisible &&
      probe.canvasCount === 1 &&
      probe.combatHudCount === 1,
  );
  const countdownRemainedFinal = probes.every(
    (probe) => probe.countdownText === ELITE_FINAL_COUNTDOWN,
  );
  const phaseProgress = probes.reduce(
    (
      state: {
        previous: EliteWorkloadProbe | null;
        cycleOrdered: boolean;
        capWindowObserved: boolean;
      },
      probe,
    ) => {
      if (state.previous !== null) {
        if (probe.elitePhase !== state.previous.elitePhase) {
          const expected =
            state.previous.elitePhase === 'armoured'
              ? 'vulnerable'
              : 'armoured';
          if (probe.elitePhase !== expected) {
            state.cycleOrdered = false;
          }
        } else if (
          probe.elitePhaseStepsElapsed < state.previous.elitePhaseStepsElapsed
        ) {
          // The same phase must never rewind; two probes may share one fixed step.
          state.cycleOrdered = false;
        }
      }
      if (
        probe.elitePhase === 'vulnerable' &&
        probe.elitePhaseStepsElapsed >= 300 &&
        probe.activeHomingCores === 2
      ) {
        state.capWindowObserved = true;
      }
      state.previous = probe;
      return state;
    },
    { previous: null, cycleOrdered: true, capWindowObserved: false },
  );
  const lateArmouredStart =
    probes[0]?.elitePhase === 'armoured' &&
    (probes[0]?.elitePhaseStepsElapsed ?? 0) >= 690;
  const vulnerableObserved = probes.some(
    (probe) => probe.elitePhase === 'vulnerable',
  );
  const authoredPhaseProgress =
    lateArmouredStart && vulnerableObserved && phaseProgress.cycleOrdered;
  const cannonStreamsActive =
    (probes[0]?.activeCannonLeft ?? 0) >= 1 &&
    (probes[0]?.activeCannonRight ?? 0) >= 1 &&
    (probes[1]?.activeCannonLeft ?? 0) >= 1 &&
    (probes[1]?.activeCannonRight ?? 0) >= 1;
  const playerFireContinuous = probes.every(
    (probe) => probe.activePlayerProjectiles >= 1,
  );
  const coreCapObserved = phaseProgress.capWindowObserved;
  const terminalOrResultSeen = probes.some(
    (probe) =>
      probe.dialogCount > 0 ||
      probe.resultOverlayCount > 0 ||
      probe.gameOverScreenCount > 0,
  );
  const baseOrOperationsSeen = probes.some(
    (probe) => probe.operationsScreenCount > 0,
  );
  const workloadValidity = {
    valid:
      eliteActiveThroughout &&
      anchorRowThroughout &&
      combatActiveThroughout &&
      countdownRemainedFinal &&
      authoredPhaseProgress &&
      cannonStreamsActive &&
      playerFireContinuous &&
      coreCapObserved &&
      !terminalOrResultSeen &&
      !baseOrOperationsSeen,
    eliteActiveThroughout,
    anchorRowThroughout,
    combatActiveThroughout,
    countdownRemainedFinal,
    authoredPhaseProgress,
    lateArmouredStart,
    vulnerableObserved,
    cycleOrdered: phaseProgress.cycleOrdered,
    cannonStreamsActive,
    playerFireContinuous,
    coreCapObserved,
    terminalOrResultSeen,
    baseOrOperationsSeen,
    probeCount: probes.length,
    probeOrder: [...ELITE_PROBE_ORDER],
    probes,
    lateArmoured,
    hullIntegrityAtEnd,
  };

  // ---- Post-run cleanup: zero retained Combat residue ------------------------
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const cleanup = {
    operationsVisible: await page.getByTestId('operations-screen').isVisible(),
    canvasCount: await page.locator('canvas').count(),
    combatHudCount: await page.locator('.ds-combat-hud').count(),
    dialogOverlayCount: await page.getByRole('dialog').count(),
    eliteWorkloadSurfaceCount: await page.evaluate(() =>
      window.__shmupEliteWorkload__ === undefined ? 0 : 1,
    ),
  };
  expect(cleanup.operationsVisible).toBe(true);
  expect(cleanup.canvasCount).toBe(0);
  expect(cleanup.combatHudCount).toBe(0);
  expect(cleanup.dialogOverlayCount).toBe(0);
  expect(cleanup.eliteWorkloadSurfaceCount).toBe(0);

  const ownership = readEvidenceOwnership();
  const evidence = {
    label:
      'Pass B uninstrumented production-optimized scenario artifact — Elite §20.1 workload timing; non-reference local proxy evidence (V02-AC-028)',
    buildIdentifier: buildLines[0] ?? null,
    browser: await page.evaluate(() => navigator.userAgent),
    machine: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuCount: cpus().length,
      totalMemBytes: totalmem(),
    },
    viewport: { ...ELITE_EVIDENCE_VIEWPORT },
    workload:
      'Mission 03 authored Elite Encounter (1 Elite) created at the authored 05:20 final-arrival step with every earlier Mission 03 Arrival Group already resolved, then entered to the fixed 50% VW, 20% VH anchor; continuous automatic Machine Gun fire; the unchanged 6000 ms timing sample spans late Armoured into Vulnerable and observes both Elite cannon streams and the Vulnerable homing Core with its permitted active cap of two',
    workloadMethod:
      'authored Mission 03 schedule via the evidence-only deterministic Elite workload preparation; the sample window starts inside the final 30 fixed steps of the Armoured phase; the Aircraft input is a predetermined wall-clock triangle sweep and is never adapted from the scenario-only read surface',
    scenarioIdentity: { ...ELITE_SCENARIO_IDENTITY },
    timingScope:
      'this sample times the unchanged 6000 ms interval from late Armoured (step 690) into Vulnerable (step 331) and observes both cannon streams and the permitted simultaneous two-Core cap; it does NOT time a complete 12 s Armoured plus 6 s Vulnerable cycle, which Pass A proves from per-step counters',
    identityReadPurpose: ELITE_IDENTITY_READ_PURPOSE,
    passSeparation: ELITE_PASS_SEPARATION,
    sessionSeed: ELITE_EVIDENCE_SESSION_SEED,
    canonicalSeed: lateArmoured?.missionSeed ?? null,
    sampleWindowMs,
    sweepMoves,
    sweep: {
      altitudeFraction: ELITE_SWEEP.altitudeFraction,
      minWidthFraction: ELITE_SWEEP.minWidthFraction,
      maxWidthFraction: ELITE_SWEEP.maxWidthFraction,
      speedRatioPerSecond: ELITE_SWEEP.speedRatioPerSecond,
      moveIntervalMs: ELITE_SWEEP.moveIntervalMs,
    },
    workloadValidity,
    frameTimeMs: {
      count: deltas.length,
      mean: Number(meanMs.toFixed(3)),
      p95: Number(percentile(sorted, 0.95).toFixed(3)),
      p99: Number(percentile(sorted, 0.99).toFixed(3)),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    },
    sustainedFps: meanMs > 0 ? Number((1000 / meanMs).toFixed(1)) : 0,
    minimumSustainedWindowFps: minimumSustainedWindowFps(deltas),
    longTasks: {
      count: sample.longTasks.length,
      maxMs: Number(
        sample.longTasks
          .reduce((max, value) => Math.max(max, value), 0)
          .toFixed(3),
      ),
    },
    heapUsedBeforeGcBytes: heapBeforeGcBytes,
    heapUsedAfterGcBytes,
    requestsDuringRun: workloadRequests.length,
    consoleErrors,
    runId: ownership.runId,
    sourceFingerprint: ownership.sourceFingerprint,
    cleanup,
    pageErrors: pageErrors.length,
  };

  // The truthful record — including any invalid-workload state — is written
  // BEFORE the budget assertions can abort the test.
  mkdirSync(ELITE_EVIDENCE_DIR, { recursive: true });
  const path = join(ELITE_EVIDENCE_DIR, RECORD_FILE);
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('V02-WI06-PASS-B-ELITE-RECORD', JSON.stringify(evidence));

  // ---- Integrity assertions (after the truthful record exists) ---------------
  expect(workloadValidity.valid).toBe(true);
  expect(workloadValidity.eliteActiveThroughout).toBe(true);
  expect(workloadValidity.anchorRowThroughout).toBe(true);
  expect(workloadValidity.combatActiveThroughout).toBe(true);
  expect(workloadValidity.countdownRemainedFinal).toBe(true);
  expect(workloadValidity.authoredPhaseProgress).toBe(true);
  expect(workloadValidity.lateArmouredStart).toBe(true);
  expect(workloadValidity.vulnerableObserved).toBe(true);
  expect(workloadValidity.cycleOrdered).toBe(true);
  expect(workloadValidity.cannonStreamsActive).toBe(true);
  expect(workloadValidity.playerFireContinuous).toBe(true);
  expect(workloadValidity.coreCapObserved).toBe(true);
  expect(workloadValidity.terminalOrResultSeen).toBe(false);
  expect(workloadValidity.baseOrOperationsSeen).toBe(false);
  // Runtime errors are acceptance data, never filtered: no uncaught page error
  // and no console error message may exist for a valid Elite timing record.
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  // Elite cleanup is an enforced contract, not just a recorded value: the
  // scenario-only read surface must be gone with every other Combat resource.
  expect(cleanup.operationsVisible).toBe(true);
  expect(cleanup.canvasCount).toBe(0);
  expect(cleanup.combatHudCount).toBe(0);
  expect(cleanup.dialogOverlayCount).toBe(0);
  expect(cleanup.eliteWorkloadSurfaceCount).toBe(0);
  expect(probes.map((probe) => probe.label)).toEqual([...ELITE_PROBE_ORDER]);
  expect(probes[0]?.playerHullIntegrity).toBeGreaterThan(0);
  expect(hullIntegrityAtEnd?.playerHullIntegrity ?? 0).toBeGreaterThan(0);
  expect(ownership.runId).not.toBeNull();
  expect(ownership.sourceFingerprint).not.toBeNull();
  expect(lateArmoured?.missionSeed).toBe(
    fnv1a32(`shmup-mvp:rng-v1|${ELITE_EVIDENCE_SESSION_SEED}|combat-mission|0`),
  );

  // ---- Budget assertions (Epic §20.1, V02-AC-028) ---------------------------
  expect(evidence.frameTimeMs.count).toBeGreaterThan(100);
  expect(evidence.sustainedFps).toBeGreaterThanOrEqual(50);
  expect(evidence.minimumSustainedWindowFps).toBeGreaterThanOrEqual(50);
  expect(pageErrors).toEqual([]);
});
