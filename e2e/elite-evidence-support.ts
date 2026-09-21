import { join } from 'node:path';

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * V02-WI-06 E04-C02 shared Elite workload evidence support (Epic §8.3–8.3.1,
 * §9.4, §20.1; V02-AC-009–010, V02-AC-027–028).
 *
 * Both evidence passes drive the SAME workload through the SAME supported
 * input path: the canonical Mission 03 progression state, the real Operations →
 * Mission Details → Start Mission route, one fixed session seed forced through
 * the browser entropy adapter before bootstrap, the authored `05:20` Elite
 * creation step materialised by the evidence-only deterministic scenario, and
 * the canonical maximum-speed horizontal sweep at `80% VH` emitted as real
 * pointer input. Only the measured capability differs: Pass A adds the
 * instrumented counters, Pass B is the uninstrumented scenario build.
 */
export const ELITE_EVIDENCE_VIEWPORT = { width: 1366, height: 768 } as const;
export const ELITE_EVIDENCE_SESSION_SEED = 19023;
export const ELITE_EVIDENCE_DIR = join(
  process.cwd(),
  '.agent-handoff',
  'evidence',
);
const DB_NAME = 'shmup-v0.2';

/** The canonical maximum-speed horizontal sweep contract. */
export const ELITE_SWEEP = {
  /** Aircraft hold/sweep altitude as a fraction of viewport height. */
  altitudeFraction: 0.8,
  minWidthFraction: 0.1,
  maxWidthFraction: 0.9,
  /** Pointer-move cadence for the sweep (real player-rate input). */
  moveIntervalMs: 50,
  /** Canonical maximum Aircraft speed (45% of the viewport short side). */
  speedRatioPerSecond: 0.45,
} as const;

/** One in-page Elite workload identity observation (scenarios gate surface). */
export interface EliteWorkloadProbeFacts {
  readonly missionSeed: number;
  readonly eliteCount: number;
  readonly eliteActivated: boolean;
  readonly elitePhase: 'entering' | 'armoured' | 'vulnerable' | null;
  readonly elitePhaseStepsElapsed: number;
  readonly eliteAnchorRowAligned: boolean;
  readonly activeCannonLeft: number;
  readonly activeCannonRight: number;
  readonly activeHomingCores: number;
  readonly activePlayerProjectiles: number;
  readonly playerHullIntegrity: number;
}

/** The player-visible Combat facts a valid sample must prove. */
export interface EliteCombatDomProbe {
  readonly combatScreenVisible: boolean;
  readonly canvasCount: number;
  readonly combatHudCount: number;
  readonly countdownText: string | null;
  readonly dialogCount: number;
  readonly resultOverlayCount: number;
  readonly gameOverScreenCount: number;
  readonly operationsScreenCount: number;
}

/** One ordered raw workload probe (player-visible facts + Elite identity). */
export interface EliteWorkloadProbe
  extends EliteCombatDomProbe, EliteWorkloadProbeFacts {
  readonly label: string;
}

/** The fixed, ordered Pass B observation contract. */
export const ELITE_PROBE_ORDER = [
  'pre-sample',
  'sample-start',
  'sample-mid',
  'sample-end',
] as const;

export interface EliteSample {
  readonly deltas: number[];
  readonly longTasks: number[];
  readonly probes: EliteCombatDomProbe[];
  readonly eliteProbes: EliteWorkloadProbeFacts[];
}

/** Forces the ONE fixed session seed through the browser entropy adapter before
 *  bootstrap (Technical Foundation §8), identical in both evidence passes. */
export async function forceEliteEvidenceSessionSeed(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(value >>> 0);
        return array;
      }
      return original(array);
    };
  }, ELITE_EVIDENCE_SESSION_SEED);
}

/** Writes the supported persisted progression state (Missions 01–02 completed,
 *  Mission 03 unlocked) through the campaign store envelope the application
 *  owns, exactly as the accepted Mission 03 acceptance wiring does. */
export async function seedMission03Progression(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, record }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('campaign', 'readwrite');
        transaction.objectStore('campaign').put({
          id: 'current',
          rowFormatVersion: 2,
          value: record,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    {
      dbName: DB_NAME,
      record: {
        schemaVersion: 1,
        runStatus: 'active',
        credits: 42,
        aircraftId: 'german-fighter',
        hullIntegrity: 100,
        equippedWeapon: 'machine-gun',
        unlockedMissionIds: [
          'interception-01',
          'interception-02',
          'interception-03',
        ],
        completedMissionIds: ['interception-01', 'interception-02'],
        missionInProgress: null,
        pilotId: 'pilot-shevchenko',
      },
    },
  );
}

/** Opens Operations, seeds the supported Mission 03 progression, and starts the
 *  authored Mission 03 through the ordinary player-facing route. */
export async function startMission03ForEliteEvidence(
  page: Page,
): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await seedMission03Progression(page);
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  const mission03Point = page.getByRole('button', { name: 'Interception 03' });
  await expect(mission03Point).toBeEnabled();
  await mission03Point.click();
  const details = page.getByRole('dialog');
  await expect(
    details.getByRole('heading', { name: 'Interception 03' }),
  ).toBeVisible();
  await details.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

/** Materialises the exact Elite workload through the evidence-only
 *  deterministic scenario (the authored `05:20` Elite creation step). */
export async function runEliteWorkloadScenario(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__shmupEvidence__?.runBenchmarkScenario('m03-e8');
  });
}

/** Reads the read-only Elite workload identity observation (scenarios gate). */
export async function readEliteWorkload(
  page: Page,
): Promise<EliteWorkloadProbeFacts | null> {
  return page.evaluate(
    () => window.__shmupEliteWorkload__?.readEliteWorkload() ?? null,
  );
}

/** Reads the read-only instrumented Pass A record (counters gate only). */
export async function readInstrumentedRecord(
  page: Page,
): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    () =>
      (window.__shmupEvidence__?.read() as Record<string, unknown> | null) ??
      null,
  );
}

/** Sweep control so the caller can stop the continuous dodge path as soon as
 *  the observation goal is reached. */
export interface SweepControl {
  done: boolean;
}

function sweepCoordinates(viewport: {
  readonly width: number;
  readonly height: number;
}): {
  readonly minX: number;
  readonly maxX: number;
  readonly y: number;
  readonly legSeconds: number;
} {
  const minX = viewport.width * ELITE_SWEEP.minWidthFraction;
  const maxX = viewport.width * ELITE_SWEEP.maxWidthFraction;
  const y = viewport.height * ELITE_SWEEP.altitudeFraction;
  const speed =
    Math.min(viewport.width, viewport.height) * ELITE_SWEEP.speedRatioPerSecond;
  return { minX, maxX, y, legSeconds: (maxX - minX) / speed };
}

function sweepX(
  elapsedSeconds: number,
  legSeconds: number,
  minX: number,
  maxX: number,
): number {
  const phase = elapsedSeconds % (2 * legSeconds);
  const ratio =
    phase <= legSeconds ? phase / legSeconds : 2 - phase / legSeconds;
  return minX + (maxX - minX) * ratio;
}

/**
 * Runs the canonical maximum-speed horizontal triangle sweep between `10%` and
 * `90% VW` at `80% VH` as real pointer input at a player-rate cadence until the
 * caller marks the sweep done or `maxDurationMs` elapses. It is the only
 * Aircraft input in the Elite evidence runs: no Debug, no evidence mutation, no
 * hidden entity read, no time acceleration.
 */
export async function runEliteSweep(
  page: Page,
  control: SweepControl,
  maxDurationMs: number,
): Promise<number> {
  const viewport = ELITE_EVIDENCE_VIEWPORT;
  const { minX, maxX, y, legSeconds } = sweepCoordinates(viewport);
  const startedAt = Date.now();
  let moves = 0;
  while (!control.done && Date.now() - startedAt < maxDurationMs) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    await page.mouse.move(sweepX(elapsedSeconds, legSeconds, minX, maxX), y);
    moves += 1;
    await page.waitForTimeout(ELITE_SWEEP.moveIntervalMs);
  }
  return moves;
}

/** The in-page probe: player-visible facts plus the Elite identity facts. */
function eliteProbeExpression(): {
  readonly combat: EliteCombatDomProbe;
  readonly elite: EliteWorkloadProbeFacts | null;
} {
  const countdown = document.querySelector('.ds-combat-countdown');
  return {
    combat: {
      combatScreenVisible:
        document.querySelector('[data-testid="combat-screen"]') !== null,
      canvasCount: document.querySelectorAll('canvas').length,
      combatHudCount: document.querySelectorAll('.ds-combat-hud').length,
      countdownText: countdown === null ? null : countdown.textContent,
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      resultOverlayCount: document.querySelectorAll(
        '.ds-mission-result-overlay',
      ).length,
      gameOverScreenCount: document.querySelectorAll(
        '[data-testid="game-over-screen"]',
      ).length,
      operationsScreenCount: document.querySelectorAll(
        '[data-testid="operations-screen"]',
      ).length,
    },
    elite: window.__shmupEliteWorkload__?.readEliteWorkload() ?? null,
  };
}

export async function readEliteProbe(page: Page): Promise<{
  readonly combat: EliteCombatDomProbe;
  readonly elite: EliteWorkloadProbeFacts | null;
}> {
  return page.evaluate(eliteProbeExpression);
}

/**
 * Runs the fixed `windowMs` frame sample through `requestAnimationFrame` and
 * captures the DOM/Elite probes at the start, middle, and end of the sample —
 * the same sampling window and percentile method as the regular Pass B record.
 */
export async function sampleEliteFrames(
  page: Page,
  windowMs: number,
): Promise<EliteSample> {
  return page.evaluate(
    (sampleMs) =>
      new Promise<EliteSample>((resolve) => {
        const collected: number[] = [];
        const tasks: number[] = [];
        const probes: EliteCombatDomProbe[] = [];
        const eliteProbes: EliteWorkloadProbeFacts[] = [];
        const probe = (): void => {
          const countdown = document.querySelector('.ds-combat-countdown');
          probes.push({
            combatScreenVisible:
              document.querySelector('[data-testid="combat-screen"]') !== null,
            canvasCount: document.querySelectorAll('canvas').length,
            combatHudCount: document.querySelectorAll('.ds-combat-hud').length,
            countdownText: countdown === null ? null : countdown.textContent,
            dialogCount: document.querySelectorAll('[role="dialog"]').length,
            resultOverlayCount: document.querySelectorAll(
              '.ds-mission-result-overlay',
            ).length,
            gameOverScreenCount: document.querySelectorAll(
              '[data-testid="game-over-screen"]',
            ).length,
            operationsScreenCount: document.querySelectorAll(
              '[data-testid="operations-screen"]',
            ).length,
          });
          const elite = window.__shmupEliteWorkload__?.readEliteWorkload();
          if (elite !== undefined) {
            eliteProbes.push(elite);
          }
        };
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            tasks.push(entry.duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        probe();
        const start = performance.now();
        let last = start;
        let midRecorded = false;
        const tick = (): void => {
          const now = performance.now();
          collected.push(now - last);
          last = now;
          const elapsed = now - start;
          if (!midRecorded && elapsed >= sampleMs / 2) {
            midRecorded = true;
            probe();
          }
          if (elapsed < sampleMs) {
            requestAnimationFrame(tick);
          } else {
            probe();
            observer.disconnect();
            resolve({
              deltas: collected,
              longTasks: tasks,
              probes,
              eliteProbes,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    windowMs,
  );
}

/** The 32-bit FNV-1a over the ASCII RNG-input string (Technical Foundation §8):
 *  the canonical mission-seed derivation shared by both evidence passes. */
export function fnv1a32(input: string): number {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** The Combat Countdown text a valid Elite sample must show: the Elite is the
 *  authored Mission 03 final arrival, so the Countdown is exactly `00:00`. */
export const ELITE_FINAL_COUNTDOWN = '00:00';

/**
 * The canonical structured Elite workload scenario/fixed-step identity
 * (Epic §8.3.1, §9.4): the authored Mission 03 Elite Encounter created at the
 * `05:20` final arrival (`320 s * 60 = 19200`), simulated with the canonical
 * fixed `1/60 s` step and the authored phase lengths. Both Elite passes declare
 * this object so the comparator proves the two passes ran the same workload
 * method structurally instead of comparing free-form prose, and so a wrong
 * scenario or wrong fixed-step record is rejected.
 */
export const ELITE_SCENARIO_IDENTITY = {
  scenario: 'm03-e8',
  encounterId: 'interception-03-e8',
  creationStep: 19200,
  fixedStepId: '1/60',
  fixedStepsPerSecond: 60,
  armouredPhaseSteps: 720,
  vulnerablePhaseSteps: 360,
} as const;

/** Truthful description of what the scenario-only read surface is used for.
 *  The surface is read passively; the Aircraft sweep is a predetermined
 *  wall-clock path and is never adapted from hidden state. */
export const ELITE_IDENTITY_READ_PURPOSE =
  'the scenario-only read-only Elite workload identity surface is read passively for workload identity (Elite presence, phase, phase step, anchor row, cannon streams, active Cores) and to select when probes and the sample start; it never mutates simulation state, never steers the Aircraft, and the supported-input sweep is a predetermined wall-clock path';

/** Truthful pass-separation statement shared by both Elite records. */
export const ELITE_PASS_SEPARATION =
  'Pass A proves the workload identity and the complete 12 s Armoured plus 6 s Vulnerable cycle from per-step counters and makes no timing claim; Pass B owns frame timing and samples the unchanged 6000 ms interval from late Armoured into Vulnerable, observing both cannon streams and the permitted simultaneous two-Core cap';
