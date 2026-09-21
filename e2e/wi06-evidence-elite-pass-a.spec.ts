import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';
import {
  ELITE_EVIDENCE_DIR,
  ELITE_EVIDENCE_SESSION_SEED,
  ELITE_EVIDENCE_VIEWPORT,
  ELITE_IDENTITY_READ_PURPOSE,
  ELITE_PASS_SEPARATION,
  ELITE_SCENARIO_IDENTITY,
  fnv1a32,
  forceEliteEvidenceSessionSeed,
  readEliteWorkload,
  readInstrumentedRecord,
  runEliteSweep,
  runEliteWorkloadScenario,
  startMission03ForEliteEvidence,
} from './elite-evidence-support';
import type { EliteWorkloadProbeFacts } from './elite-evidence-support';

/**
 * V02-WI-06 E04-C02 Pass A — instrumented evidence build (Epic §8.3–8.3.1,
 * §9.4, §20.1; V02-AC-009–010, V02-AC-028). The run materialises the exact
 * Elite workload at the authored `05:20` Elite creation step, drives the real
 * Mission 03 Combat through the canonical supported-input sweep, and reads the
 * observed per-step facts the counters record: entry, activation/anchor, one
 * complete `12 s` Armoured phase followed by one complete `6 s` Vulnerable
 * phase, continuous Machine Gun fire, both cannon streams, homing Core
 * creation/activity with the simultaneous cap, projectile/entity maxima,
 * collision candidate/intersection work, and cleanup.
 *
 * This record is evidence/identity only: it makes no timing claim. Pass B owns
 * frame time, sustained FPS, long tasks, heap, and cleanup timing on the
 * uninstrumented scenario artifact.
 */
const RECORD_FILE = 'v02-wi-06-instrumented-elite-workload.json';
/** Generous bounded deadline for one entry plus one complete phase cycle. */
const ELITE_WORKLOAD_DEADLINE_MS = 60_000;

/**
 * Writes the Pass A record ONLY after every workload, cleanup, and page-error
 * assertion above has actually passed, with the machine-readable cleanup object
 * measured from the real post-cleanup state.
 */
function writePassARecord(input: {
  readonly record: Record<string, unknown>;
  readonly observedMaxima: Record<string, unknown>;
  readonly buildLines: readonly string[];
  readonly pageErrors: readonly string[];
  readonly sweepMoves: number;
  readonly observationAtStopMs: number;
  readonly observedPhaseSequence: readonly string[];
  readonly finalObservation: EliteWorkloadProbeFacts | null;
  readonly cleanup: Record<string, unknown>;
  readonly browser: string;
}): void {
  const ownership = readEvidenceOwnership();
  const evidence = {
    label:
      'Pass A instrumented evidence build — exact Elite §20.1 workload identity; non-reference local proxy evidence (V02-AC-009–010, V02-AC-028)',
    buildIdentifier: input.buildLines[0] ?? null,
    browser: input.browser,
    machine: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuCount: cpus().length,
      totalMemBytes: totalmem(),
    },
    viewport: { ...ELITE_EVIDENCE_VIEWPORT },
    workload:
      'Mission 03 authored Elite Encounter (1 Elite) created at the authored 05:20 final-arrival step with every earlier Mission 03 Arrival Group already resolved, then entered to the fixed 50% VW, 20% VH anchor; the per-step counters observe the complete 12 s Armoured phase followed by the complete 6 s Vulnerable phase with continuous automatic Machine Gun fire, both Elite cannon streams, and the Vulnerable homing Core with its permitted active cap of two',
    workloadMethod:
      'authored Mission 03 schedule via the evidence-only deterministic Elite workload preparation at the authored Elite creation step (no hand-authored proxy, no authored-constant inference, no manual-session substitution); the harness reads the scenario-only identity surface passively and drives a predetermined supported-input sweep',
    scenarioIdentity: { ...ELITE_SCENARIO_IDENTITY },
    timingScope:
      'identity and complete-cycle evidence only: this pass makes no timing claim; Pass B owns frame timing',
    identityReadPurpose: ELITE_IDENTITY_READ_PURPOSE,
    passSeparation: ELITE_PASS_SEPARATION,
    sessionSeed: ELITE_EVIDENCE_SESSION_SEED,
    canonicalSeed: input.record.missionSeed,
    runId: ownership.runId,
    sourceFingerprint: ownership.sourceFingerprint,
    sweepMoves: input.sweepMoves,
    observationAtStopMs: input.observationAtStopMs,
    observedPhaseSequence: [...input.observedPhaseSequence],
    finalObservation: input.finalObservation,
    observedMaxima: input.observedMaxima,
    cleanup: input.cleanup,
    pageErrors: input.pageErrors.length,
  };
  mkdirSync(ELITE_EVIDENCE_DIR, { recursive: true });
  const path = join(ELITE_EVIDENCE_DIR, RECORD_FILE);
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('V02-WI06-PASS-A-ELITE-RECORD', JSON.stringify(evidence));
}

test('records the exact Elite §20.1 workload identity in the instrumented evidence build (V02-WI-06 E04-C02, V02-AC-009–010/028)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize(ELITE_EVIDENCE_VIEWPORT);
  await forceEliteEvidenceSessionSeed(page);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const buildLines: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'info' &&
      message.text().startsWith('[shmup] build ')
    ) {
      buildLines.push(message.text());
    }
  });

  await startMission03ForEliteEvidence(page);
  await runEliteWorkloadScenario(page);

  // The only Aircraft input in this run: the canonical supported-input sweep.
  const sweepControl = { done: false };
  const sweepTask = runEliteSweep(
    page,
    sweepControl,
    ELITE_WORKLOAD_DEADLINE_MS,
  );

  // Wait until the observed phase sequence proves one COMPLETE Armoured phase
  // followed by one COMPLETE Vulnerable phase (the third distinct phase entry is
  // the second Armoured phase, i.e. the Vulnerable phase ended).
  const observedPhaseSequence: string[] = [];
  const startedAt = Date.now();
  let lastObservation: EliteWorkloadProbeFacts | null = null;
  while (Date.now() - startedAt < ELITE_WORKLOAD_DEADLINE_MS) {
    lastObservation = await readEliteWorkload(page);
    const phase = lastObservation?.elitePhase ?? null;
    if (
      lastObservation !== null &&
      lastObservation.eliteActivated &&
      phase !== null &&
      phase !== 'entering' &&
      observedPhaseSequence[observedPhaseSequence.length - 1] !== phase
    ) {
      observedPhaseSequence.push(phase);
    }
    if (observedPhaseSequence.length >= 3) {
      break;
    }
    await page.waitForTimeout(200);
  }
  sweepControl.done = true;
  const sweepMoves = await sweepTask;
  const observationAtStopMs = Date.now() - startedAt;

  expect(observedPhaseSequence.slice(0, 3)).toEqual([
    'armoured',
    'vulnerable',
    'armoured',
  ]);
  expect(lastObservation).not.toBeNull();
  expect(lastObservation?.eliteCount).toBe(1);
  expect(lastObservation?.eliteAnchorRowAligned).toBe(true);
  expect(lastObservation?.playerHullIntegrity).toBeGreaterThan(0);

  const record = await readInstrumentedRecord(page);
  expect(record).not.toBeNull();
  // The raw instrumented record uses the canonical observed-maxima names; the
  // record written below exposes them through the same `observedMaxima` keys the
  // accepted regular Pass A record uses, plus the Elite workload facts.
  const maxima = {
    activeEnemiesByRole: record?.activeEnemiesByRoleMax ?? {},
    activePlayerProjectiles: record?.activePlayerProjectilesMax ?? null,
    activeEnemyProjectiles: record?.activeEnemyProjectilesMax ?? null,
    collisionWorkMax: record?.collisionWorkMax ?? {},
    exactRegularWorkloadSteps: record?.exactRegularWorkloadSteps ?? null,
    workloadReachedSteps: record?.workloadReachedSteps ?? null,
    steps: record?.steps ?? null,
    eliteWorkload: record?.eliteWorkload ?? {},
  } as Record<string, unknown>;
  const eliteWorkload = maxima.eliteWorkload as Record<string, unknown>;
  const roleMax = maxima.activeEnemiesByRole as Record<string, number>;

  expect(record?.missionSeed).toBe(
    fnv1a32(`shmup-mvp:rng-v1|${ELITE_EVIDENCE_SESSION_SEED}|combat-mission|0`),
  );
  expect(roleMax['elite-drone']).toBe(1);
  expect(maxima.activePlayerProjectiles).toBeGreaterThanOrEqual(1);
  expect(maxima.activeEnemyProjectiles).toBeGreaterThanOrEqual(1);
  expect(eliteWorkload.eliteCreationSteps).toBe(1);
  expect(eliteWorkload.eliteCreationMissionStep).toBe(
    ELITE_SCENARIO_IDENTITY.creationStep,
  );
  expect(eliteWorkload.eliteEntrySteps).toBeGreaterThanOrEqual(1);
  expect(eliteWorkload.elitePresenceViolationSteps).toBe(0);
  expect(eliteWorkload.anchorSteps).toBeGreaterThanOrEqual(1);
  expect(eliteWorkload.armouredSteps).toBeGreaterThanOrEqual(720);
  expect(eliteWorkload.vulnerableSteps).toBeGreaterThanOrEqual(360);
  expect(eliteWorkload.activeEliteSteps).toBeGreaterThanOrEqual(1080);
  expect(eliteWorkload.phaseOrder).toEqual([
    'armoured',
    'vulnerable',
    'armoured',
  ]);
  expect(eliteWorkload.phaseDurations).toEqual([720, 360]);
  expect(eliteWorkload.eliteWorkloadPlayerFireSteps).toBe(
    eliteWorkload.activeEliteSteps,
  );
  // One complete Armoured phase contains exactly seven cannon pairs: the pair
  // due on the `720`-step phase boundary is suppressed by that boundary
  // (Epic §9.4), and each pair contributes one projectile per stream.
  expect(eliteWorkload.leftCannonProjectilesObserved).toBe(7);
  expect(eliteWorkload.rightCannonProjectilesObserved).toBe(7);
  expect(eliteWorkload.cannonPairSteps).toBeGreaterThanOrEqual(1);
  expect(eliteWorkload.homingCoresObserved).toBe(2);
  expect(eliteWorkload.maxActiveHomingCores).toBe(2);
  expect(eliteWorkload.homingCoreActiveSteps).toBeGreaterThanOrEqual(200);
  const collisionWork = (maxima.collisionWorkMax ?? {}) as Record<
    string,
    number
  >;
  expect(collisionWork.playerProjectileCandidates).toBeGreaterThan(0);
  expect(collisionWork.enemyProjectileCandidates).toBeGreaterThan(0);
  expect(maxima.steps).toBeGreaterThan(1080);
  expect(pageErrors).toEqual([]);

  // Post-run cleanup: the active-mission refresh recovery resolves the running
  // mission exactly once, and Operations opens with zero Combat residue.
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

  writePassARecord({
    record: record as Record<string, unknown>,
    observedMaxima: maxima,
    buildLines,
    pageErrors,
    sweepMoves,
    observationAtStopMs,
    observedPhaseSequence,
    finalObservation: lastObservation,
    cleanup,
    browser: await page.evaluate(() => navigator.userAgent),
  });
});
