import { writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { evidenceDirectory } from '../scripts/evidence-output.mjs';
import { readEvidenceOwnership } from './evidence-ownership';

/**
 * V021-PATCH-STAB-01 C02-SIMPLE — one six-second ORDINARY-PRODUCTION Mission 01
 * performance spot check (patch specification §7 / V021-DEC-008, Verification
 * §11 and §18.1 step 5, V021-AC-006).
 *
 * This case is intentionally thin. It runs the ordinary production artifact
 * (no Debug, no invulnerability, no shortened clock, no scenario hook, no
 * application evidence bridge and no per-step recorder), drives one fresh
 * isolated origin through the supported player path, holds the Aircraft at the
 * §7 early-formation observation point with supported pointer input, and takes
 * exactly one six-second sample under continuous automatic fire once the
 * Countdown first shows `02:58`.
 *
 * Every raw fact is written to `patch-dense-raw.json` beside the start/middle/
 * end screenshots BEFORE any assertion runs, so a failed or invalid sample is
 * retained rather than re-timed. Both unchanged absolute floors are `>= 50`:
 * the sustained FPS and the minimum complete one-second-window FPS.
 *
 * The observation is bounded: it establishes one populated early Mission 01
 * scene. It is not a worst-case or combined-Elite certification, not a
 * no-regression comparison, not a full-mission test and not a physical-device
 * claim.
 */
const EVIDENCE_DIR = evidenceDirectory();

/** §7/V021-DEC-008 fixed setup. */
const VIEWPORT = { width: 1366, height: 768 } as const;
const SAMPLE_MS = 6_000;
const FPS_FLOOR = 50;
/** Supported pointer placement: approximately `10% VW / 80% VH`. */
const AIRCRAFT_POINT = {
  x: Math.round(VIEWPORT.width * 0.1),
  y: Math.round(VIEWPORT.height * 0.8),
};
/** The authored early-formation anchor: Countdown `02:59` → `02:58`. */
const PRE_SAMPLE_COUNTDOWN = '02:59';
const SAMPLE_START_COUNTDOWN = '02:58';

const RECORD_FILE = 'patch-dense-raw.json';
const SHOT_START = 'patch-dense-sample-start.png';
const SHOT_MIDDLE = 'patch-dense-sample-middle.png';
const SHOT_END = 'patch-dense-sample-end.png';

/** The Combat scene facts recorded at the sample start, middle and end. */
interface SceneProbe {
  readonly combatScreenVisible: boolean;
  readonly combatCanvasCount: number;
  readonly combatHudCount: number;
  readonly countdownText: string | null;
  readonly dialogCount: number;
  readonly resultOverlayCount: number;
  readonly gameOverScreenCount: number;
  readonly operationsScreenCount: number;
}

/**
 * The ONE scene-probe source. An in-page probe cannot receive a function
 * argument, so this exact source is interpolated into both the point-in-time
 * read and the in-page sampler.
 */
const SCENE_PROBE_SOURCE = `{
  combatScreenVisible: document.querySelector('[data-testid="combat-screen"]') !== null,
  combatCanvasCount: document.querySelectorAll('.ds-combat-canvas canvas').length,
  combatHudCount: document.querySelectorAll('.ds-combat-hud').length,
  countdownText: document.querySelector('.ds-combat-countdown')?.textContent ?? null,
  dialogCount: document.querySelectorAll('[role="dialog"]').length,
  resultOverlayCount: document.querySelectorAll('.ds-mission-result-overlay').length,
  gameOverScreenCount: document.querySelectorAll('[data-testid="game-over-screen"]').length,
  operationsScreenCount: document.querySelectorAll('[data-testid="operations-screen"]').length,
}`;

async function readScene(page: Page): Promise<SceneProbe> {
  return (await page.evaluate(
    `(() => (${SCENE_PROBE_SOURCE}))()`,
  )) as SceneProbe;
}

/** One raw sample: frame deltas, long tasks and the start/middle/end probes. */
interface RawSample {
  readonly deltas: readonly number[];
  readonly longTasks: readonly number[];
  readonly probes: readonly SceneProbe[];
}

interface TimingFacts {
  readonly frames: number;
  readonly spanMs: number;
  readonly sustainedFps: number;
  readonly completeOneSecondWindows: number;
  readonly minimumWindowFps: number;
  readonly windowFps: readonly number[];
  readonly frameTimeMs: {
    readonly min: number;
    readonly mean: number;
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
  };
  readonly longTasks: {
    readonly count: number;
    readonly totalMs: number;
    readonly maxMs: number;
  };
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

/**
 * The existing measurement derivation: raw frame deltas give the sustained FPS
 * (the mean frame time), and complete one-second buckets give the minimum
 * sustained window FPS. A trailing partial bucket is excluded, so a remainder
 * cannot skew the minimum.
 */
function deriveTiming(sample: RawSample): TimingFacts {
  const { deltas, longTasks } = sample;
  const sorted = [...deltas].sort((a, b) => a - b);
  const percentile = (fraction: number): number =>
    sorted.length === 0
      ? 0
      : (sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
        ] ?? 0);
  const total = deltas.reduce((sum, delta) => sum + delta, 0);
  const meanMs = deltas.length === 0 ? 0 : total / deltas.length;
  const windowFps: number[] = [];
  let bucketFrames = 0;
  let bucketTime = 0;
  for (const delta of deltas) {
    bucketFrames += 1;
    bucketTime += delta;
    if (bucketTime >= 1000) {
      windowFps.push(round1(bucketFrames / (bucketTime / 1000)));
      bucketFrames = 0;
      bucketTime = 0;
    }
  }
  return {
    frames: deltas.length,
    spanMs: round1(total),
    sustainedFps: meanMs > 0 ? round1(1000 / meanMs) : 0,
    completeOneSecondWindows: windowFps.length,
    minimumWindowFps: windowFps.length === 0 ? 0 : Math.min(...windowFps),
    windowFps,
    frameTimeMs: {
      min: round1(sorted[0] ?? 0),
      mean: round1(meanMs),
      p50: round1(percentile(0.5)),
      p95: round1(percentile(0.95)),
      p99: round1(percentile(0.99)),
      max: round1(sorted[sorted.length - 1] ?? 0),
    },
    longTasks: {
      count: longTasks.length,
      totalMs: round1(longTasks.reduce((sum, task) => sum + task, 0)),
      maxMs: round1(longTasks.length === 0 ? 0 : Math.max(...longTasks)),
    },
  };
}

/** True while the frame is real, populated, running Combat — never paused or terminal. */
function isActiveCombatScene(probe: SceneProbe): boolean {
  return (
    probe.combatScreenVisible &&
    probe.combatCanvasCount === 1 &&
    probe.combatHudCount >= 1 &&
    probe.dialogCount === 0 &&
    probe.resultOverlayCount === 0 &&
    probe.gameOverScreenCount === 0 &&
    probe.operationsScreenCount === 0 &&
    probe.countdownText !== null
  );
}

function describeScene(label: string, probe: SceneProbe): string {
  return `${label}: ${JSON.stringify(probe)}`;
}

function requireSample(sample: RawSample | null): RawSample {
  if (sample === null) {
    throw new Error('The six-second sample was not recorded.');
  }
  return sample;
}

function requireProbe(probe: SceneProbe | null, label: string): SceneProbe {
  if (probe === null) {
    throw new Error(`The ${label} scene probe was not recorded.`);
  }
  return probe;
}

test('one six-second ordinary-production Mission 01 spot check (V021-AC-006, V021-DEC-008)', async ({
  page,
}) => {
  const consoleMessages: { type: string; text: string }[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) =>
    consoleMessages.push({ type: message.type(), text: message.text() }),
  );
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const gathered: {
    sample: RawSample | null;
    startProbe: SceneProbe | null;
    cleanup: SceneProbe | null;
    resultHeading: string | null;
    buildIdentifier: string | null;
    browserVersion: string | null;
    userAgent: string | null;
    devicePixelRatio: number | null;
  } = {
    sample: null,
    startProbe: null,
    cleanup: null,
    resultHeading: null,
    buildIdentifier: null,
    browserVersion: null,
    userAgent: null,
    devicePixelRatio: null,
  };
  const ownership = readEvidenceOwnership();

  /** One small raw record, written before every assertion. */
  const writeRecord = (stage: string, failure: string | null): void => {
    const sample = gathered.sample;
    const record = {
      case: 'v021-performance-spot-check',
      stage,
      failure,
      generatedAt: new Date().toISOString(),
      identity: {
        ownership,
        buildIdentifier: gathered.buildIdentifier,
        browser: gathered.browserVersion,
        userAgent: gathered.userAgent,
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        devicePixelRatio: gathered.devicePixelRatio,
        host: {
          platform: platform(),
          release: release(),
          arch: arch(),
          cpus: cpus().length,
        },
      },
      setup: {
        route:
          'fresh isolated origin → Operations → Interception 01 → Start Mission',
        control: 'default mouse movement (supported pointer input)',
        pointerPlacement: AIRCRAFT_POINT,
        sampleMs: SAMPLE_MS,
        sampleAnchor: `Countdown ${PRE_SAMPLE_COUNTDOWN} → ${SAMPLE_START_COUNTDOWN}`,
        fpsFloor: FPS_FLOOR,
      },
      screenshots: [SHOT_START, SHOT_MIDDLE, SHOT_END],
      sample:
        sample === null
          ? null
          : {
              startCountdown: gathered.startProbe?.countdownText ?? null,
              probes: sample.probes,
              rawFrameIntervalsMs: sample.deltas,
              longTasksMs: sample.longTasks,
            },
      timing: sample === null ? null : deriveTiming(sample),
      cleanup: gathered.cleanup,
      terminalHeading: gathered.resultHeading,
      pageErrors,
      consoleErrors: consoleMessages.filter(
        (message) => message.type === 'error',
      ),
    };
    writeFileSync(
      join(EVIDENCE_DIR, RECORD_FILE),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  };

  try {
    await page.goto('/');
    await expect(page.getByTestId('operations-screen')).toBeVisible();

    // Supported player path on a fresh isolated origin: Mission 01 is available
    // without any fixture, unlock or injected state.
    await page.getByRole('button', { name: 'Interception 01' }).click();
    const details = page.getByRole('dialog');
    await expect(
      details.getByRole('heading', { name: 'Interception 01' }),
    ).toBeVisible();
    await details.getByRole('button', { name: 'Start Mission' }).click();
    await expect(page.getByTestId('combat-screen')).toBeVisible();
    await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
      timeout: 15_000,
    });

    gathered.buildIdentifier =
      consoleMessages.find(
        (message) =>
          message.type === 'info' && message.text.startsWith('[shmup] build '),
      )?.text ?? null;
    gathered.browserVersion = page.context().browser()?.version() ?? null;
    gathered.userAgent = await page.evaluate('navigator.userAgent');
    gathered.devicePixelRatio = await page.evaluate('window.devicePixelRatio');

    // Supported pointer placement at approximately 10% VW / 80% VH, held
    // through the whole observation; the player weapon fires automatically.
    await page.mouse.move(AIRCRAFT_POINT.x, AIRCRAFT_POINT.y);

    // The authored early-formation anchor: the Countdown first shows 02:58
    // here, one second after 02:59 (≈ Mission Clock 00:12).
    await expect(page.locator('.ds-combat-countdown')).toHaveText(
      PRE_SAMPLE_COUNTDOWN,
      { timeout: 90_000 },
    );
    await expect(page.locator('.ds-combat-countdown')).toHaveText(
      SAMPLE_START_COUNTDOWN,
      { timeout: 15_000 },
    );
    gathered.startProbe = await readScene(page);

    await page.screenshot({ path: join(EVIDENCE_DIR, SHOT_START) });
    const sampler = sampleFrames(page, SAMPLE_MS);
    await page.waitForTimeout(SAMPLE_MS / 2);
    await page.screenshot({ path: join(EVIDENCE_DIR, SHOT_MIDDLE) });
    gathered.sample = await sampler;
    await page.screenshot({ path: join(EVIDENCE_DIR, SHOT_END) });

    // Cleanup through the existing Evacuation/Continue lifecycle. The sample
    // already disconnected its measurement observer, so nothing keeps
    // measuring while the removed Combat surfaces are checked.
    await page
      .getByTestId('combat-utility')
      .getByRole('button', { name: 'Evacuate' })
      .click();
    const confirmation = page.getByRole('dialog');
    await expect(
      confirmation.getByRole('heading', { name: 'Evacuate?' }),
    ).toBeVisible();
    await confirmation
      .getByRole('button', { name: 'Confirm Evacuation' })
      .click();
    const result = page.getByRole('dialog');
    await expect(result).toBeVisible({ timeout: 40_000 });
    gathered.resultHeading = (
      (await result.getByRole('heading').first().textContent()) ?? ''
    ).trim();
    await result.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    gathered.cleanup = await readScene(page);
  } catch (error) {
    writeRecord(
      'failed',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  // Raw evidence is on disk before any assertion runs.
  writeRecord('sampled', null);

  const sample = requireSample(gathered.sample);
  const timing = deriveTiming(sample);
  const startProbe = requireProbe(gathered.startProbe, 'start');
  const cleanup = requireProbe(gathered.cleanup, 'cleanup');
  const probes = sample.probes;
  expect(probes).toHaveLength(3);
  const sampleStart = probes[0];
  const sampleMiddle = probes[1];
  const sampleEnd = probes[2];

  // The scene is real, populated and running Combat for the whole sample:
  // active Combat canvas and HUD with a live Countdown, and no dialog, result,
  // Game Over or Operations frame. A paused, empty or terminal sample is
  // invalid rather than acceptable.
  expect(startProbe.countdownText).toBe(SAMPLE_START_COUNTDOWN);
  expect(
    sampleStart !== undefined && isActiveCombatScene(sampleStart),
    describeScene('sample start', sampleStart ?? startProbe),
  ).toBe(true);
  expect(
    sampleMiddle !== undefined && isActiveCombatScene(sampleMiddle),
    describeScene('sample middle', sampleMiddle ?? startProbe),
  ).toBe(true);
  expect(
    sampleEnd !== undefined && isActiveCombatScene(sampleEnd),
    describeScene('sample end', sampleEnd ?? startProbe),
  ).toBe(true);
  expect(sampleMiddle?.countdownText?.startsWith('02:5')).toBe(true);
  expect(sampleEnd?.countdownText?.startsWith('02:5')).toBe(true);

  // The sample really ran one six-second wall-clock window.
  expect(timing.frames).toBeGreaterThan(0);
  expect(timing.spanMs).toBeGreaterThanOrEqual(SAMPLE_MS - 500);
  expect(timing.spanMs).toBeLessThanOrEqual(SAMPLE_MS + 2_500);

  // Both unchanged absolute floors.
  expect(timing.completeOneSecondWindows).toBeGreaterThanOrEqual(5);
  expect(timing.sustainedFps).toBeGreaterThanOrEqual(FPS_FLOOR);
  expect(timing.minimumWindowFps).toBeGreaterThanOrEqual(FPS_FLOOR);

  expect(pageErrors).toEqual([]);
  expect(consoleMessages.filter((message) => message.type === 'error')).toEqual(
    [],
  );

  // Post-Combat cleanup on the ordinary Operations screen: zero Combat canvas,
  // zero Combat HUD (which owns the Countdown) and no blocking Overlay.
  expect(cleanup.combatCanvasCount).toBe(0);
  expect(cleanup.combatHudCount).toBe(0);
  expect(cleanup.countdownText).toBeNull();
  expect(cleanup.dialogCount).toBe(0);
  expect(cleanup.resultOverlayCount).toBe(0);
  expect(cleanup.gameOverScreenCount).toBe(0);
  expect(cleanup.operationsScreenCount).toBe(1);
  expect(['EVACUATED', 'MISSION FAILED', 'MISSION COMPLETE']).toContain(
    gathered.resultHeading,
  );
});

/**
 * Samples the real rendered frames for `windowMs` (the existing measurement
 * method: raw frame deltas through `requestAnimationFrame`, long tasks through
 * a `PerformanceObserver`, and the same scene probe at the start, middle and
 * end). The observer is disconnected before the promise resolves, so no
 * measurement observer survives into the cleanup check.
 */
async function sampleFrames(page: Page, windowMs: number): Promise<RawSample> {
  return (await page.evaluate(`(() => new Promise((resolve) => {
    const probe = () => (${SCENE_PROBE_SOURCE});
    const deltas = [];
    const longTasks = [];
    const probes = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
    probes.push(probe());
    const start = performance.now();
    let last = start;
    let midRecorded = false;
    const tick = () => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      const elapsed = now - start;
      if (!midRecorded && elapsed >= ${windowMs} / 2) {
        midRecorded = true;
        probes.push(probe());
      }
      if (elapsed < ${windowMs}) {
        requestAnimationFrame(tick);
      } else {
        probes.push(probe());
        observer.disconnect();
        resolve({ deltas, longTasks, probes });
      }
    };
    requestAnimationFrame(tick);
  }))()`)) as RawSample;
}
