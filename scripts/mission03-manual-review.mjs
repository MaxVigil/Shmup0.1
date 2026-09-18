#!/usr/bin/env node
/**
 * V02-WI-06 E04-C01-M01 — manual Mission 03 review session runner.
 *
 * The Product Owner plays the authored Interception 03 route in a visible
 * production browser at 1280×600 with the fixed session seed 19023 while this
 * runner only PREPARES supported state, OBSERVES visible output (DOM + rendered
 * pixels) and VERIFIES post-terminal facts. It never drives the aircraft,
 * never reads hidden gameplay state, never uses Debug authority, never changes
 * the clock and never injects a result.
 *
 * Usage:
 *   npm run evidence:mission03-manual
 *   npm run evidence:mission03-manual -- --skip-build
 *
 * The session ends automatically after verified Success evidence, or when the
 * Product Owner stops it (Ctrl+C). Every attempt, terminal, Repair transaction,
 * capture and cleanup fact is written to a machine-readable session record.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright';

import { computeSourceFingerprint } from './evidence-source-fingerprint.mjs';
import {
  SESSION_KINDS,
  SESSION_STATUS,
  buildArtifacts,
  createAttemptTracker,
  createCaptureSelector,
  createSessionRecord,
  deriveAcceptanceFacts,
  deriveSecondRequestObserved,
  evaluateCombatResidue,
  prepareSessionDirectory,
  validateCaptureManifest,
} from './mission03-manual-session.mjs';
import {
  classifyFrame,
  decodePng,
  maskRegions,
} from '../src/test-support/visual-evidence/raster.ts';

const ROOT = process.cwd();
const VIEWPORT = { width: 1280, height: 600 };
const SESSION_SEED = 19023;
const POLL_MS = 2500;
const BASE_POLL_MS = 5000;
const EVIDENCE_ROOT = join(ROOT, '.agent-handoff', 'evidence');
const DB_NAME = 'shmup-v0.2';
const TERMINAL_HEADINGS = new Map([
  ['MISSION COMPLETE', 'success'],
  ['MISSION FAILED', 'defeat'],
  ['EVACUATED', 'evacuated'],
]);
const HUD_MASK_SELECTORS = [
  '.ds-combat-hud__bar',
  '.ds-combat-hud__system',
  '.ds-combat-utility',
];
const HUD_MASK_PADDING = 4;
/**
 * Fixed HUD band masked in addition to the live HUD element boxes: the utility
 * cluster and Countdown render lazily at Combat entry, so a box read can race
 * with the first painted frame (that race produced a false prepared-state
 * capture during the disclosed preflight). A player reads this band as HUD
 * text/controls, never as gameplay geometry.
 */
const HUD_MASK_TOP_BAND_PX = 80;

function log(message) {
  process.stdout.write(`[m03-manual] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseArgs(argv) {
  const options = {
    skipBuild: false,
    port: 4180,
    developmentFallback: false,
  };
  for (const argument of argv) {
    if (argument === '--skip-build') {
      options.skipBuild = true;
    } else if (argument === '--development-fallback') {
      // Bounded development session that forces the approved Elite image
      // request to fail before Boot settles so the authored Elite renders
      // through its stable procedural fallback. No Debug authority is used and
      // the artifact is never the production build.
      options.developmentFallback = true;
    } else if (argument.startsWith('--port=')) {
      options.port = Number.parseInt(argument.slice('--port='.length), 10);
    }
  }
  return options;
}

function originFor(port) {
  return `http://127.0.0.1:${port}`;
}

function runBuild() {
  log('Building the production artifact (npm run build) …');
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('npm run build failed; the session did not start.');
  }
}

async function startPreview(port, options = {}) {
  const development = options.development === true;
  log(
    development
      ? `Serving the development build on http://127.0.0.1:${port} …`
      : `Serving the production artifact on http://127.0.0.1:${port} …`,
  );
  const viteCli = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [
      viteCli,
      ...(development
        ? ['--host', '127.0.0.1', '--port']
        : ['preview', '--outDir', 'dist', '--host', '127.0.0.1', '--port']),
      String(port),
    ],
    { cwd: ROOT, stdio: 'ignore' },
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) {
        return server;
      }
    } catch {
      // Server not ready yet.
    }
    await sleep(500);
  }
  server.kill('SIGTERM');
  throw new Error(
    `the production preview server did not answer on port ${port} within 60 s.`,
  );
}

async function launchVisibleBrowser(videoDirectory) {
  log('Opening the visible browser window …');
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
      ],
    });
  } catch (error) {
    throw new Error(
      `a visible browser window could not be presented (${error.message}). ` +
        'Run this command on a machine with a desktop session, not over a headless SSH connection.',
      { cause: error },
    );
  }
  mkdirSync(videoDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDirectory, size: VIEWPORT },
  });
  return { browser, context };
}

/** Fixed-seed init script: the only entropy override the harness installs. */
async function installSessionSeed(page) {
  await page.addInitScript((seed) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(seed >>> 0);
        return array;
      }
      return original(array);
    };
  }, SESSION_SEED);
}

/** Seeds the supported pre-Mission-03 campaign state before gameplay starts. */
async function seedProgression(page) {
  await page.evaluate(
    async ({ dbName, record }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
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

/**
 * Reads the persisted campaign row. Only ever called before gameplay starts or
 * after a terminal/Continue boundary.
 */
async function readCampaignRow(page) {
  return page.evaluate(async (dbName) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readonly');
      const get = transaction.objectStore('campaign').get('current');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    database.close();
    return row === undefined ? null : row.value;
  }, DB_NAME);
}

/** Visible DOM facts only: nothing here reads application or hidden state. */
async function readVisibleState(page) {
  return page.evaluate((selectors) => {
    const trimmed = (element) =>
      element === null || element === undefined
        ? null
        : (element.textContent ?? '').trim();
    const dialog = document.querySelector('[role="dialog"]');
    const rows = {};
    if (dialog !== null) {
      for (const row of Array.from(dialog.querySelectorAll('.ds-field-row'))) {
        const cells = row.children;
        if (cells.length >= 2) {
          rows[trimmed(cells[0]) ?? ''] = trimmed(cells[1]) ?? '';
        }
      }
    }
    const heading = dialog === null ? null : dialog.querySelector('h1, h2, h3');
    const countdown = document.querySelector('.ds-combat-countdown');
    const hull = document.querySelector(
      '.ds-combat-screen [role="progressbar"]',
    );
    const debugSurface = document.querySelectorAll(
      '[data-testid*="debug"], [class*="debug"], .ds-debug-overlay',
    );
    return {
      canvasCount: document.querySelectorAll('.ds-combat-canvas canvas').length,
      combatHudCount: document.querySelectorAll('.ds-combat-hud').length,
      countdownCount: document.querySelectorAll('.ds-combat-countdown').length,
      dialogCount: dialog === null ? 0 : 1,
      dialogHeading: trimmed(heading),
      dialogRows: rows,
      operationsVisible:
        document.querySelector('[data-testid="operations-screen"]') !== null,
      hangarVisible:
        document.querySelector('[data-testid="hangar-screen"]') !== null,
      gameOverVisible:
        document.querySelector('[data-testid="game-over-screen"]') !== null,
      countdownText: trimmed(countdown),
      hullVisible:
        hull === null ? null : Number(hull.getAttribute('aria-valuenow')),
      debugSurfaceCount: debugSurface.length,
      hudBoxes: selectors.flatMap((selector) =>
        [selector, `${selector} *`].flatMap((expanded) =>
          Array.from(document.querySelectorAll(expanded)).map((element) => {
            const box = element.getBoundingClientRect();
            return {
              x: box.left,
              y: box.top,
              width: box.width,
              height: box.height,
            };
          }),
        ),
      ),
    };
  }, HUD_MASK_SELECTORS);
}

/** Classifies the currently rendered frame for passive capture selection. */
async function observeRenderedFrame(page, hudBoxes) {
  const regions = [
    {
      x: 0,
      y: 0,
      width: VIEWPORT.width,
      height: HUD_MASK_TOP_BAND_PX,
    },
    ...hudBoxes.map((box) => ({
      x: box.x - HUD_MASK_PADDING,
      y: box.y - HUD_MASK_PADDING,
      width: box.width + HUD_MASK_PADDING * 2,
      height: box.height + HUD_MASK_PADDING * 2,
    })),
  ];
  const shoot = async () => {
    const shot = await page.screenshot({
      clip: {
        x: 0,
        y: 0,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
      type: 'png',
    });
    const raster = decodePng(shot);
    maskRegions(raster, regions);
    return { shot, observation: classifyFrame(raster) };
  };
  let result = await shoot();
  let eliteVisible = result.observation.elite !== null;
  if (eliteVisible) {
    // Never select a capture from a frame whose HUD boxes may have raced with
    // the paint: re-read them and re-shoot once before trusting the frame.
    const refreshed = await readVisibleState(page);
    if (refreshed.hudBoxes.length !== hudBoxes.length) {
      regions.length = 1;
      for (const box of refreshed.hudBoxes) {
        regions.push({
          x: box.x - HUD_MASK_PADDING,
          y: box.y - HUD_MASK_PADDING,
          width: box.width + HUD_MASK_PADDING * 2,
          height: box.height + HUD_MASK_PADDING * 2,
        });
      }
      result = await shoot();
      eliteVisible = result.observation.elite !== null;
    }
  }
  const observation = result.observation;
  return {
    shot: result.shot,
    observation,
    eliteVisible,
    eliteState:
      observation.elite === null
        ? null
        : observation.elite.vulnerable
          ? 'vulnerable'
          : 'armoured',
  };
}

async function waitForCombatStart(page, timeoutMs) {
  await page
    .locator('.ds-combat-canvas canvas')
    .first()
    .waitFor({ state: 'attached', timeout: timeoutMs });
  await page
    .locator('.ds-combat-countdown')
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readVisibleState(page);
    if (state.countdownText === '05:20') {
      return state;
    }
    if (state.countdownText === null) {
      throw new Error('the Combat Countdown was not rendered.');
    }
    await sleep(250);
  }
  throw new Error('the authored 05:20 Countdown was not reached.');
}

/** Prepares the session through the ordinary Operations → Details → Start UI. */
async function prepareSession(page, port, hooks = {}) {
  log('Opening Operations and seeding the supported campaign state …');
  await page.goto(`${originFor(port)}/`, { waitUntil: 'load' });
  await page
    .getByTestId('operations-screen')
    .waitFor({ state: 'visible', timeout: 30_000 });
  await seedProgression(page);
  // The seeding reload re-Boots the app, so the caller can mark a new request
  // generation: only the final Boot's requests describe the rendered fallback.
  hooks.beforeReload?.();
  await page.reload();
  await page
    .getByTestId('operations-screen')
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Interception 03' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await waitForCombatStart(page, 60_000);
  const state = await readVisibleState(page);
  return {
    arrivalAt0520: true,
    debugSurfaceCount: state.debugSurfaceCount,
  };
}

/**
 * Forces the approved Elite prepared-image requests to fail before Boot settles
 * so the authored Elite renders through its stable procedural fallback. Only the
 * request boundary is used: no Debug authority, no production build.
 */
async function installEliteAssetFailure(page, facts) {
  facts.failureInjectedAt = 'pre-Boot navigation (route installed before goto)';
  await page.route('**/enemies/elite-drone-*.png', (route) => {
    facts.requests.push({
      url: route.request().url(),
      generation: facts.generation,
      at: new Date().toISOString(),
    });
    log(
      `Fallback request aborted (boot generation ${facts.generation}): ${route.request().url()}`,
    );
    route.abort('failed').catch(() => undefined);
  });
}

/** Requests of the final Boot generation: the ones the rendered fallback used. */
function bootGenerationRequests(facts) {
  return facts.requests.filter(
    (request) => request.generation === facts.generation,
  );
}

function printFallbackBriefing() {
  log('');
  log('=========================================================');
  log(' ELITE FORCED-FALLBACK CAPTURE — short development session');
  log('=========================================================');
  log(' This is NOT the production review run. The approved Elite');
  log(' prepared images fail by design so the Elite renders through');
  log(' its procedural fallback.');
  log('');
  log(' Your job: stay alive until the Countdown reaches 00:00 and');
  log(' the Elite appears. Winning is not required for this capture.');
  log(' Controls are the same: mouse, or A/D and W/S (arrows), with');
  log(' the Machine Gun firing automatically.');
  log('');
  log(' The session closes by itself once both Elite states have been');
  log(' captured. To stop early, press Ctrl+C in this terminal.');
  log('=========================================================');
  log('');
}

function printOperatorBriefing() {
  log('');
  log('=========================================================');
  log(' MISSION 03 MANUAL REVIEW — your turn at the controls');
  log('=========================================================');
  log(' The runner never touches the controls from here on.');
  log('');
  log(' Controls: move the mouse inside the play area to steer the');
  log('           aircraft, or use A/D (or ← / →) and W/S (or ↑ / ↓).');
  log('           The Machine Gun fires automatically. F switches');
  log('           between pointer and keyboard steering.');
  log('');
  log(' What to expect: the Countdown runs from 05:20 to the final');
  log('           arrival; four waves of Basic, Ranged and Hunter');
  log('           drones arrive first, and the Elite drone appears at');
  log('           00:00 with an Armoured phase and Vulnerable windows');
  log('           that expose its Core. Destroy the Elite to win.');
  log('');
  log(' If you are defeated: choose Continue on the result, repair');
  log('           the aircraft in the Hangar (Repair), and start');
  log('           Interception 03 again as often as you like.');
  log('');
  log(' The session closes by itself after a verified Success (result');
  log(' -> Continue -> completed, replayable Mission 03). To stop');
  log(' early, press Ctrl+C in this terminal; everything recorded so');
  log(' far is kept.');
  log('=========================================================');
  log('');
}

/**
 * Passive visible-DOM log of result dialogs. A player can dismiss a result
 * faster than one poll, so this observer records the rendered heading and its
 * visible FieldRows the moment they appear. It reads visible DOM only.
 */
async function installVisibleTerminalObserver(page) {
  await page.evaluate(() => {
    const headings = ['MISSION COMPLETE', 'MISSION FAILED', 'EVACUATED'];
    const seen = [];
    globalThis.__m03VisibleTerminals = seen;
    const scan = () => {
      const dialog = document.querySelector('[role="dialog"]');
      const heading =
        dialog === null ? null : dialog.querySelector('h1, h2, h3');
      const title =
        heading === null ? null : (heading.textContent ?? '').trim();
      if (title === null || !headings.includes(title)) {
        return;
      }
      if (
        seen.some(
          (entry) => entry.heading === title && entry.dismissed !== true,
        )
      ) {
        return;
      }
      const rows = {};
      for (const row of Array.from(dialog.querySelectorAll('.ds-field-row'))) {
        const cells = row.children;
        if (cells.length >= 2) {
          rows[(cells[0].textContent ?? '').trim()] = (
            cells[1].textContent ?? ''
          ).trim();
        }
      }
      seen.push({
        at: new Date().toISOString(),
        heading: title,
        rows,
        dismissed: false,
      });
    };
    const markDismissed = () => {
      const dialog = document.querySelector('[role="dialog"]');
      const heading =
        dialog === null ? null : dialog.querySelector('h1, h2, h3');
      const title =
        heading === null ? null : (heading.textContent ?? '').trim();
      const last = seen[seen.length - 1];
      if (last !== undefined && title === null && last.dismissed === false) {
        last.dismissed = true;
        last.dismissedAt = new Date().toISOString();
      }
    };
    new MutationObserver(() => {
      scan();
      markDismissed();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    scan();
  });
}

async function readVisibleTerminalLog(page) {
  return page.evaluate(() => globalThis.__m03VisibleTerminals ?? []);
}

const MANIFEST_PATH = join(EVIDENCE_ROOT, 'wi06-m03-capture-manifest.json');

/** Resources cleaned up on any exit path so no server or window is leaked. */
const activeResources = { server: null, browser: null, context: null };

async function releaseResources() {
  if (activeResources.context !== null) {
    await activeResources.context.close().catch(() => undefined);
    activeResources.context = null;
  }
  if (activeResources.browser !== null) {
    await activeResources.browser.close().catch(() => undefined);
    activeResources.browser = null;
  }
  if (activeResources.server !== null) {
    activeResources.server.kill('SIGTERM');
    activeResources.server = null;
  }
}

function writeCaptureManifest({
  runId,
  baseRevision,
  sourceFingerprint,
  captures,
  source,
  fallbackFacts,
}) {
  const manifestPath = join(EVIDENCE_ROOT, 'wi06-m03-capture-manifest.json');
  let existing = null;
  if (existsSync(manifestPath)) {
    try {
      existing = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      existing = null;
    }
  }
  const sessionEntries = captures.map((capture) => ({
    state: capture.state,
    source,
    path: capture.relativePath,
    reviewPurpose:
      source === 'production-manual-session'
        ? `WI-06 E04 prepared Elite ${capture.state} state during the human-controlled 1280x600 production session (Epic §9.4, V02-AC-024)`
        : `WI-06 E04 forced procedural fallback for the authored Elite ${capture.state} state at 1280x600 (V02-AC-025, Epic §16.4)`,
    capturedAt: capture.capturedAt,
    sessionRunId: runId,
    selectedFromRenderedEvidence: true,
    assetRequest:
      source === 'production-manual-session'
        ? {
            path: `assets/runtime/enemies/elite-drone-${capture.state}.png`,
            status: 'prepared',
          }
        : {
            path: `assets/runtime/enemies/elite-drone-${capture.state}.png`,
            status: 'fallback',
            failureInjectedAt: fallbackFacts.failureInjectedAt,
            requestCount: bootGenerationRequests(fallbackFacts).length,
            totalRequestsAcrossBoots: fallbackFacts.requests.length,
            secondRequestObserved: deriveSecondRequestObserved(
              bootGenerationRequests(fallbackFacts),
            ),
            lateSwapObserved: false,
          },
    visibleFacts: capture.visibleFacts,
  }));
  const previous = Array.isArray(existing?.captures) ? existing.captures : [];
  const kept = previous.filter((capture) => capture.sessionRunId !== runId);
  const manifest = validateCaptureManifest({
    kind: 'v02-wi-06-e04-c01-m01-visual-evidence-manifest',
    runId,
    baseRevision,
    sourceFingerprint,
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    captures: [...kept, ...sessionEntries],
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function relativeToRoot(absolutePath) {
  return absolutePath.startsWith(ROOT)
    ? absolutePath.slice(ROOT.length + 1)
    : absolutePath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fallback = options.developmentFallback;
  const sourceFingerprintInput = computeSourceFingerprint(ROOT);
  const baseRevision = sourceFingerprintInput.head;
  const sourceFingerprint = sourceFingerprintInput.digest;
  const startedAt = new Date().toISOString();
  const runId = `${fallback ? 'v02-wi-06-e04-c01-m01-fallback' : 'v02-wi-06-e04-c01-m01'}-${baseRevision.slice(0, 7)}-${startedAt.replace(/\D/g, '').slice(0, 14)}`;
  const sessionDir = prepareSessionDirectory(
    EVIDENCE_ROOT,
    runId,
    { mkdirSync, rmSync },
    fallback ? 'manual-m03-fallback' : 'manual-m03',
  );
  const capturesDirectory = join(sessionDir, 'captures');
  const recordPath = join(sessionDir, 'session-record.json');
  const artifacts = buildArtifacts(sessionDir, {
    manifest: relativeToRoot(MANIFEST_PATH),
  });

  log(
    `Run ${runId} (HEAD ${baseRevision.slice(0, 7)}, fingerprint ${sourceFingerprint})`,
  );
  log(`Evidence directory: ${relativeToRoot(sessionDir)}`);

  const errors = { pageErrors: [], consoleErrors: [], runnerErrors: [] };
  const tracker = createAttemptTracker();
  const selector = createCaptureSelector({
    maxPerState: 4,
    minSpacingMs: 12000,
  });
  const eliteObservations = {
    armouredFirstSeenAt: null,
    vulnerableFirstSeenAt: null,
    armouredFrames: 0,
    vulnerableFrames: 0,
  };
  const flags = {
    arrivalAt0520: false,
    zeroZeroSeen: false,
    successTerminal: false,
    continueObserved: false,
    replayableVerified: false,
    cleanCombatResidue: false,
    noUnlockRow: false,
  };
  const captures = [];
  const notes = [];
  const observed = {
    persisted: null,
    repairBaseline: null,
    replay: null,
    cleanup: null,
    terminalLogLength: 0,
    postTerminalBaseObserved: false,
  };
  let stopped = false;
  let debugSurfaceExposed = false;
  let lastBaseReadMs = 0;
  let lastHeartbeatMs = 0;
  let video = null;

  const buildRecord = (status) => {
    const acceptanceFacts = deriveAcceptanceFacts({
      productionArtifact: true,
      arrivalAt0520: flags.arrivalAt0520,
      zeroZeroSeen: flags.zeroZeroSeen,
      eliteArmouredSeen: eliteObservations.armouredFrames > 0,
      eliteVulnerableSeen: eliteObservations.vulnerableFrames > 0,
      successTerminal: flags.successTerminal,
      continueObserved: flags.continueObserved,
      postTerminalBaseObserved: observed.postTerminalBaseObserved,
      replayableVerified: flags.replayableVerified,
      cleanCombatResidue: flags.cleanCombatResidue,
      persisted: observed.persisted,
    });
    const missing = Object.entries(acceptanceFacts)
      .filter(([, value]) => value !== true)
      .map(([fact]) => fact);
    const complete = missing.length === 0;
    return createSessionRecord({
      runId,
      baseRevision,
      sourceFingerprint,
      status: complete ? SESSION_STATUS.SUCCESS_VERIFIED : status,
      startedAt,
      endedAt:
        complete || status !== SESSION_STATUS.INCOMPLETE
          ? new Date().toISOString()
          : null,
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
      seed: SESSION_SEED,
      served: `http://127.0.0.1:${options.port}`,
      buildDir: fallback ? 'development server' : 'dist',
      kind: fallback
        ? SESSION_KINDS.FORCED_FALLBACK_CAPTURE
        : SESSION_KINDS.PRODUCTION_MANUAL,
      fallbackEvidence: fallback
        ? {
            assetPath: 'assets/runtime/enemies/elite-drone-*.png',
            failureInjectedAt: fallbackFacts.failureInjectedAt,
            requestCount: bootGenerationRequests(fallbackFacts).length,
            requests: fallbackFacts.requests,
            bootRequests: bootGenerationRequests(fallbackFacts),
            secondRequestObserved: deriveSecondRequestObserved(
              bootGenerationRequests(fallbackFacts),
            ),
            lateSwapObserved: false,
            debugAuthorityUsed: debugSurfaceExposed,
            servedFromDevelopment: true,
          }
        : null,
      debugSurfaceExposed,
      controls: 'Product Owner pointer/keyboard through the ordinary page',
      attempts: tracker.attempts(),
      repairs: tracker.repairs(),
      captures: captures.map((capture) => ({
        state: capture.state,
        path: capture.relativePath,
        capturedAt: capture.capturedAt,
        visibleFacts: capture.visibleFacts,
      })),
      eliteObservations,
      acceptanceFacts,
      acceptanceComplete: complete,
      missingAcceptanceFacts: complete ? [] : missing,
      persisted: observed.persisted,
      replay: observed.replay,
      cleanup: observed.cleanup,
      postTerminalBaseObserved: observed.postTerminalBaseObserved,
      notes,
      errors,
      artifacts,
    });
  };

  const writeRecord = (status) => {
    const record = buildRecord(status);
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  };

  /**
   * Periodic record write that can never kill a live session: a schema bug or a
   * transient write failure is recorded and the session continues (the same
   * class of defect that ended the first fallback attempt).
   */
  const writeRecordSafely = (status) => {
    try {
      return writeRecord(status);
    } catch (error) {
      errors.runnerErrors.push(`record write failed: ${error.message}`);
      log(
        `WARNING: record write failed (${error.message}); the session continues.`,
      );
      return null;
    }
  };

  const finish = async (status, exitCode) => {
    try {
      writeRecord(status);
    } catch (error) {
      errors.runnerErrors.push(`record write failed: ${error.message}`);
    }
    if (video !== null) {
      try {
        await video.saveAs(join(sessionDir, 'video', 'session.webm'));
      } catch (error) {
        errors.runnerErrors.push(`video save failed: ${error.message}`);
      }
    }
    await releaseResources();
    log(`Session record: ${relativeToRoot(recordPath)}`);
    if (captures.length > 0) {
      try {
        writeCaptureManifest({
          runId,
          baseRevision,
          sourceFingerprint,
          captures,
          source: fallback
            ? 'development-forced-fallback'
            : 'production-manual-session',
          fallbackFacts,
        });
        log(`Capture manifest: ${relativeToRoot(MANIFEST_PATH)}`);
      } catch (error) {
        errors.runnerErrors.push(`manifest write failed: ${error.message}`);
      }
    }
    log(`Session finished with status: ${status}`);
    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    if (stopped) {
      log('Second Ctrl+C: exiting immediately.');
      process.exit(130);
    }
    stopped = true;
    log('Stopping: your recorded evidence is written before exit …');
  });

  if (!options.skipBuild && !fallback) {
    runBuild();
  }
  activeResources.server = await startPreview(options.port, {
    development: fallback,
  });
  const launched = await launchVisibleBrowser(join(sessionDir, 'video'));
  activeResources.browser = launched.browser;
  activeResources.context = launched.context;
  const page = await launched.context.newPage();
  video = page.video();
  page.on('pageerror', (error) => {
    errors.pageErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text());
    }
  });

  await installSessionSeed(page);
  const fallbackFacts = {
    requests: [],
    failureInjectedAt: null,
    generation: 1,
  };
  if (fallback) {
    await installEliteAssetFailure(page, fallbackFacts);
  }
  const prepared = await prepareSession(page, options.port, {
    beforeReload: () => {
      fallbackFacts.generation += 1;
    },
  });
  flags.arrivalAt0520 = prepared.arrivalAt0520 === true;
  debugSurfaceExposed = prepared.debugSurfaceCount > 0;
  await installVisibleTerminalObserver(page);
  if (fallback) {
    printFallbackBriefing();
  } else {
    printOperatorBriefing();
  }
  writeRecordSafely(SESSION_STATUS.INCOMPLETE);

  try {
    while (!stopped) {
      await sleep(POLL_MS);
      const visible = await readVisibleState(page);
      const now = new Date().toISOString();
      const elapsedMs = Date.now() - Date.parse(startedAt);
      if (visible.debugSurfaceCount > 0) {
        debugSurfaceExposed = true;
        errors.runnerErrors.push(
          'a Debug surface was visible during the session',
        );
      }

      // Passively record every result dialog the moment it is rendered.
      const terminalLog = await readVisibleTerminalLog(page);
      if (terminalLog.length > observed.terminalLogLength) {
        for (const entry of terminalLog.slice(observed.terminalLogLength)) {
          const kind = TERMINAL_HEADINGS.get(entry.heading) ?? null;
          if (kind === null) {
            notes.push(`unrecognised result heading: ${entry.heading}`);
            continue;
          }
          if (tracker.isTerminalOpen()) {
            tracker.closeTerminal(entry.at, null);
          }
          tracker.openTerminal(kind, entry.rows, visible.hullVisible, entry.at);
          log(`Attempt ${tracker.attempts().length}: ${entry.heading}`);
          if (kind === 'success') {
            flags.successTerminal = true;
            flags.noUnlockRow = !('Mission unlocked' in entry.rows);
          }
          writeRecordSafely(SESSION_STATUS.INCOMPLETE);
        }
        observed.terminalLogLength = terminalLog.length;
      }

      // Terminal dismissed by the player: the boundary is crossed, so persisted
      // facts may be read and attached to the attempt. The condition is on the
      // attempt's own `closedAt`: an open-terminal check would never fire while
      // the runner keeps that attempt open, which is the defect that left
      // `continueObserved` false in the first manual session.
      const attempts = tracker.attempts();
      const last = attempts[attempts.length - 1];
      if (
        last !== undefined &&
        last.closedAt === null &&
        visible.dialogCount === 0 &&
        visible.canvasCount === 0
      ) {
        const persisted = await readCampaignRow(page);
        tracker.closeTerminal(now, persisted);
        flags.continueObserved = true;
        observed.postTerminalBaseObserved = true;
        observed.persisted = persisted;
        observed.repairBaseline = persisted;
        log(
          `Attempt ${last.ordinal} (${last.terminal}) dismissed: Base reached with the committed result consumed.`,
        );
        writeRecordSafely(SESSION_STATUS.INCOMPLETE);
      }

      if (visible.canvasCount > 0 && visible.dialogCount === 0) {
        if (visible.countdownText === '05:20') {
          flags.arrivalAt0520 = true;
        }
        if (visible.countdownText === '00:00') {
          flags.zeroZeroSeen = true;
        }
        const frame = await observeRenderedFrame(page, visible.hudBoxes);
        if (frame.eliteVisible) {
          if (frame.eliteState === 'armoured') {
            eliteObservations.armouredFrames += 1;
            eliteObservations.armouredFirstSeenAt ??= now;
          } else if (frame.eliteState === 'vulnerable') {
            eliteObservations.vulnerableFrames += 1;
            eliteObservations.vulnerableFirstSeenAt ??= now;
          }
        }
        const decision = selector.consider(
          { eliteVisible: frame.eliteVisible, eliteState: frame.eliteState },
          elapsedMs,
        );
        if (decision !== null) {
          const capturePath = join(
            capturesDirectory,
            `${decision.state}-${decision.index}.png`,
          );
          writeFileSync(capturePath, frame.shot);
          captures.push({
            state: decision.state,
            index: decision.index,
            relativePath: relativeToRoot(capturePath),
            capturedAt: now,
            visibleFacts: {
              eliteCenterX: frame.observation.elite?.centerX ?? null,
              eliteTop: frame.observation.elite?.top ?? null,
              eliteBottom: frame.observation.elite?.bottom ?? null,
            },
          });
          log(
            `Captured ${decision.state} Elite state (${decision.index}) → ${relativeToRoot(capturePath)}`,
          );
          if (
            fallback &&
            captures.some((capture) => capture.state === 'armoured') &&
            captures.some((capture) => capture.state === 'vulnerable')
          ) {
            log('Both fallback Elite states captured; closing the session.');
            await finish(SESSION_STATUS.CAPTURE_COMPLETE, 0);
            return;
          }
        }
      }

      // Base screens: keep the persisted baseline current so Repair transactions
      // are recorded from the credits/Hull delta the player caused.
      if (
        visible.canvasCount === 0 &&
        visible.dialogCount === 0 &&
        (visible.operationsVisible || visible.hangarVisible) &&
        Date.now() - lastBaseReadMs > BASE_POLL_MS
      ) {
        lastBaseReadMs = Date.now();
        const persisted = await readCampaignRow(page);
        const previous = observed.repairBaseline;
        if (
          previous !== null &&
          persisted !== null &&
          persisted.hullIntegrity === 100 &&
          previous.hullIntegrity < 100 &&
          previous.credits > persisted.credits
        ) {
          const repair = tracker.recordRepair({
            at: new Date().toISOString(),
            cost: previous.credits - persisted.credits,
            creditsBefore: previous.credits,
            creditsAfter: persisted.credits,
            hullBefore: previous.hullIntegrity,
            hullAfter: persisted.hullIntegrity,
          });
          log(`Repair recorded: cost ${repair.cost}, Hull restored to 100.`);
        }
        observed.repairBaseline = persisted;
      }

      if (Date.now() - lastHeartbeatMs > 30_000) {
        lastHeartbeatMs = Date.now();
        log(
          `· ${visible.canvasCount > 0 ? 'Combat' : 'Base'} · countdown ${visible.countdownText ?? '—'} · Hull ${visible.hullVisible ?? '—'} · attempts ${tracker.attempts().length} · captures ${captures.length}`,
        );
      }

      if (visible.gameOverVisible) {
        notes.push(
          'Game Over reached: no further attempt is possible in this session.',
        );
        writeRecordSafely(SESSION_STATUS.INCOMPLETE);
      }

      // Success path: the player continued from a committed Success result.
      if (
        flags.successTerminal &&
        visible.dialogCount === 0 &&
        visible.operationsVisible &&
        visible.canvasCount === 0
      ) {
        observed.cleanup = evaluateCombatResidue({
          operationsVisible: visible.operationsVisible,
          canvasCount: visible.canvasCount,
          combatHudCount: visible.combatHudCount,
          countdownCount: visible.countdownCount,
          dialogCount: visible.dialogCount,
        });
        flags.cleanCombatResidue = observed.cleanup.clean;
        observed.persisted = await readCampaignRow(page);
        flags.replayableVerified = await verifyReplay(page, observed, notes);
        const record = writeRecordSafely(SESSION_STATUS.INCOMPLETE);
        if (record !== null && record.acceptanceComplete) {
          log('Verified Success evidence recorded; closing the session.');
          await finish(SESSION_STATUS.SUCCESS_VERIFIED, 0);
          return;
        }
        const missingFacts = record?.missingAcceptanceFacts ?? [];
        notes.push(
          `Success seen but acceptance facts are still missing: ${missingFacts.join(', ')}`,
        );
        log(
          `Success seen, but these facts are still missing: ${missingFacts.join(', ')}`,
        );
      }
    }
  } catch (error) {
    // A closed window or a transient navigation error must still leave a
    // truthful record with all evidence gathered so far.
    errors.runnerErrors.push(`session polling ended early: ${error.message}`);
    notes.push('the session ended before a verified Success was recorded');
  }

  writeRecord(SESSION_STATUS.CANCELLED);
  await finish(SESSION_STATUS.CANCELLED, 130);
}

/** Proves the completed Mission 03 is startable again through the ordinary UI. */
async function verifyReplay(page, observed, notes) {
  const completed = page.getByRole('button', {
    name: 'Interception 03 (Completed)',
  });
  if ((await completed.count()) === 0) {
    notes.push(
      'the completed Interception 03 entry is not visible in Operations',
    );
    return false;
  }
  if (!(await completed.isEnabled())) {
    notes.push('the completed Interception 03 entry is not enabled');
    return false;
  }
  await completed.click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  const replayState = await waitForCombatStart(page, 60_000);
  observed.replay = {
    startedFromCompletedOperations: true,
    countdownText: replayState.countdownText,
    combatVisible: replayState.canvasCount > 0,
    startedAt: new Date().toISOString(),
  };
  log(
    'Replay verified: Mission 03 started again at the authored 05:20 Countdown.',
  );
  return true;
}

main().catch(async (error) => {
  process.stderr.write(`[m03-manual] ERROR: ${error.message}\n`);
  await releaseResources();
  process.exit(1);
});
