import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';

/**
 * V02-WI-07 D03 five-consecutive-mission mixed-outcome soak (Epic §13.2–13.7,
 * §§17–18, §20; V02-AC-026–027; MASTER §7.10; slices §8).
 *
 * ONE development-browser page and ONE session run five consecutive missions
 * with no reload and no New Game between them, through the real React shell, the
 * real lazy Phaser Combat entry, the real fixed-step simulation, the real
 * IndexedDB campaign transaction, and the accepted development Debug commands
 * only (never a second transition owner):
 *
 *   Interception 01 Success
 *   Interception 02 Evacuation (player-facing confirmation + full 5 s countdown)
 *   Interception 02 affordable-Repair Defeat (paid from the route's earned rewards)
 *   Interception 02 Success
 *   Interception 03 Evacuation (player-facing confirmation + full 5 s countdown)
 *
 * Every mission first starts a real Combat runtime and materialises one authored
 * Encounter through the deterministic `Spawn E<n>` Debug command, and the
 * authoritative live-entity baseline is captured while Debug holds the runtime
 * paused. Both Evacuations are resolved by the player-facing confirmation and the
 * complete five-second countdown — never by the forced `Evacuate Mission`
 * shortcut — and their payout is derived from the frozen authoritative payload at
 * the exact `EVACUATION 00:00` step.
 *
 * Between the five runs the test proves, before the next entry, that the old
 * runtime is gone: no Combat canvas/HUD/Combat shell, no blocking Overlay, no
 * development observability surface, no retained per-frame loop (a bounded
 * in-page `requestAnimationFrame` sample distinguishes an idle Base screen from a
 * surviving Phaser game loop), and no listener growth on `window`/`document`
 * (a bounded in-page `addEventListener`/`removeEventListener` ledger). It also
 * records one post-GC heap series and applies the already accepted S14-WI01
 * no-retained-runtime contract (first Combat = lazy-load warm-up; later samples
 * bounded by the documented per-mission noise allowance). Heap alone is never
 * presented as proof of every released resource; the per-resource evidence matrix
 * in `.agent-handoff/evidence/wi07-d03-cleanup-evidence.md` states which fact is
 * direct proof and which is inference.
 *
 * The durable row is only ever READ here (never mutated): it proves the
 * exactly-once terminal commitment, the cleared `missionInProgress` marker before
 * the next start, one fresh attempt identity per mission, and the exact
 * Credits/Hull/progression expectations of the route.
 */
const VIEWPORT = { width: 1366, height: 768 } as const;
/** Fixed session seed forced through the browser entropy adapter before Boot. */
const SESSION_SEED = 20260924;
const DB_NAME = 'shmup-v0.2';
const STARTING_CREDITS = 12;
const FULL_REPAIR_COST = 8;
const EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');
const RECORD_FILE = 'wi07-d03-five-mission-soak.json';
/** `window`/`document` listener types counted by the bounded ledger. */
const OBSERVED_LISTENER_TYPES = [
  'blur',
  'focus',
  'visibilitychange',
  'pagehide',
  'resize',
  'keydown',
  'keyup',
  'mousedown',
  'mouseup',
  'mousemove',
  'wheel',
  'contextmenu',
] as const;
const RAF_SAMPLE_WINDOW_MS = 1000;
/**
 * An idle Base screen must not request JavaScript animation frames. A surviving
 * Phaser Game/Scene loop would request about 60 per second, so this bound
 * separates the two by more than an order of magnitude.
 */
const RAF_IDLE_MAX_CALLS = 3;
/** A live Combat runtime must tick: positive control for the sampler above. */
const RAF_ACTIVE_MIN_CALLS = 20;
/**
 * S14-WI01 accepted no-retained-runtime contract (Master §7.10, V02-AC-027):
 * the first Combat is the lazy-load warm-up, every later post-cleanup sample is
 * compared with the warm-up sample. The allowances are the accepted values and
 * are never weakened to manufacture a pass.
 */
const WARMUP_ALLOWANCE_BYTES = 32 * 1024 * 1024;
const MISSION_NOISE_BYTES = 12 * 1024 * 1024;

type MissionId = 'interception-01' | 'interception-02' | 'interception-03';
type RoleKey = 'basic-drone' | 'ranged-drone' | 'hunter-drone' | 'elite-drone';
type TerminalKind = 'success' | 'evacuation' | 'defeat';

const ROLE_KEYS: readonly RoleKey[] = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
  'elite-drone',
];

const MISSION_IDS: readonly MissionId[] = [
  'interception-01',
  'interception-02',
  'interception-03',
];

const MISSION_LABELS: Readonly<Record<MissionId, string>> = {
  'interception-01': 'Interception 01',
  'interception-02': 'Interception 02',
  'interception-03': 'Interception 03',
};

/** One planned route step: real mission, live Debug Encounter, exact terminal. */
interface RouteStep {
  readonly missionId: MissionId;
  readonly terminal: TerminalKind;
  /** Accepted development Debug Encounter command (`Spawn E<n>` label). */
  readonly encounterLabel: string;
  readonly encounterId: string;
  /** Authored composition of that Encounter's members by role. */
  readonly encounterComposition: Partial<Record<RoleKey, number>>;
  /** Authored completion reward committed by a Success (§12.2). */
  readonly completionReward: number;
  readonly unlocksMissionId: MissionId | null;
}

/**
 * The assigned five-mission route. Each Debug Encounter is authored well after
 * the moment the baseline is captured and is never the mission's final Encounter,
 * so the natural authored schedule keeps its cursor and the live baseline is
 * exact rather than an approximation. The two Evacuations are the missions whose
 * committed five-second countdown must not be lost, so their spawned Encounter
 * holds no lethal contact threat (Basic/Ranged only).
 */
const ROUTE: readonly RouteStep[] = [
  {
    missionId: 'interception-01',
    terminal: 'success',
    encounterLabel: 'Spawn E4',
    encounterId: 'interception-01-e4',
    encounterComposition: { 'basic-drone': 3, 'hunter-drone': 1 },
    completionReward: 8,
    unlocksMissionId: 'interception-02',
  },
  {
    missionId: 'interception-02',
    terminal: 'evacuation',
    encounterLabel: 'Spawn E3',
    encounterId: 'interception-02-e3',
    encounterComposition: { 'basic-drone': 2, 'ranged-drone': 2 },
    completionReward: 12,
    unlocksMissionId: 'interception-03',
  },
  {
    missionId: 'interception-02',
    terminal: 'defeat',
    encounterLabel: 'Spawn E5',
    encounterId: 'interception-02-e5',
    encounterComposition: {
      'basic-drone': 1,
      'ranged-drone': 1,
      'hunter-drone': 1,
    },
    completionReward: 12,
    unlocksMissionId: 'interception-03',
  },
  {
    missionId: 'interception-02',
    terminal: 'success',
    encounterLabel: 'Spawn E4',
    encounterId: 'interception-02-e4',
    encounterComposition: { 'basic-drone': 4 },
    completionReward: 12,
    unlocksMissionId: 'interception-03',
  },
  {
    missionId: 'interception-03',
    terminal: 'evacuation',
    encounterLabel: 'Spawn E2',
    encounterId: 'interception-03-e2',
    encounterComposition: { 'basic-drone': 3 },
    completionReward: 16,
    unlocksMissionId: null,
  },
];

/** Browser-visible `typeof window.onblur` / `typeof window.onfocus` states. */
interface WindowFocusHandlerState {
  readonly onblur: string;
  readonly onfocus: string;
}

/** Read-only authoritative development observability snapshot. */
interface DevObservability {
  readonly combatSeed: number;
  readonly missionTimeSeconds: number;
  readonly countdownSeconds: number;
  readonly currentEncounterId: string | null;
  readonly playerHullIntegrity: number;
  readonly godModeEnabled: boolean;
  readonly activeEnemiesByType: Readonly<Record<RoleKey, number>>;
  readonly activeEnemyBounds: readonly { readonly type: RoleKey }[];
  readonly destroyedEnemiesByType: Readonly<Record<RoleKey, number>>;
  readonly escapedEnemiesByType: Readonly<Record<RoleKey, number>>;
  readonly pendingCombatRewards: number;
  readonly pendingEscapePenalties: number;
}

interface CampaignValue {
  readonly schemaVersion: number;
  readonly runStatus: string;
  readonly credits: number;
  readonly hullIntegrity: number;
  readonly missionInProgress: {
    readonly missionId: string;
    readonly attemptId: number;
  } | null;
  readonly completedMissionIds: readonly string[];
  readonly unlockedMissionIds: readonly string[];
}

interface CampaignRow {
  readonly id: string;
  readonly rowFormatVersion: number;
  readonly value: CampaignValue;
}

interface LedgerEntry {
  added: number;
  removed: number;
}

type ListenerLedger = Record<string, LedgerEntry>;

interface SoakObservers {
  readRafCalls: () => number;
  resetRafCalls: () => void;
  readListenerLedger: () => ListenerLedger;
}

/** Browser-visible facts that must be zero once a Combat runtime has exited. */
interface CleanupFacts {
  readonly canvasCount: number;
  readonly combatScreenCount: number;
  readonly hudCount: number;
  readonly countdownCount: number;
  readonly dialogCount: number;
  readonly devObservability: string;
}

/** One recorded mission of the soak (machine-readable evidence). */
interface StepRecord {
  readonly index: number;
  readonly missionId: MissionId;
  readonly terminal: TerminalKind;
  readonly startLabel: string;
  readonly attemptId: number;
  readonly combatSeed: number;
  readonly spawnLabel: string;
  readonly spawnedEncounterId: string | null;
  readonly baseline: {
    readonly missionTimeSeconds: number;
    readonly countdownSeconds: number;
    readonly playerHullIntegrity: number;
    readonly activeEnemiesByType: Readonly<Record<RoleKey, number>>;
    readonly activeEnemyBounds: number;
    readonly pendingCombatRewards: number;
    readonly pendingEscapePenalties: number;
  };
  readonly frozen: {
    readonly playerHullIntegrity: number;
    readonly pendingCombatRewards: number;
    readonly pendingEscapePenalties: number;
    readonly missionTimeSeconds: number;
  };
  readonly resultHeading: string;
  readonly countdownElapsedMs: number | null;
  readonly creditsBefore: number;
  readonly creditsAfter: number;
  readonly hullAfter: number;
  readonly completedAfter: readonly string[];
  readonly unlockedAfter: readonly string[];
  readonly exitCleanup: CleanupFacts;
  readonly operationsCleanup: CleanupFacts;
  readonly activeWindowFocusHandlers: WindowFocusHandlerState;
  readonly idleWindowFocusHandlers: WindowFocusHandlerState;
  readonly activeRafCalls: number;
  readonly idleRafCalls: number;
  readonly heapAfterGcBytes: number;
  readonly listenerLedger: ListenerLedger;
}

/**
 * Installs the two bounded in-page observations used where a resource is not
 * directly browser-visible, before any application script runs:
 *
 * - a `requestAnimationFrame` call counter (a surviving Phaser Game/Scene loop
 *   or fixed-step driver keeps requesting frames after its owner should be gone);
 * - an `addEventListener`/`removeEventListener` ledger for `window` and
 *   `document` (a subscription or browser-lifecycle listener that is never
 *   released grows the live count once per mission).
 *
 * Both are read-only observations: they never mutate product state, never add a
 * production hook, and exist only inside this Playwright page.
 */
async function installSoakObservers(page: Page): Promise<void> {
  await page.addInitScript(
    (observedTypes: readonly string[]) => {
      interface Entry {
        added: number;
        removed: number;
      }
      const ledger: Record<string, Entry> = {};
      const bump = (key: string, field: 'added' | 'removed'): void => {
        const entry = ledger[key] ?? { added: 0, removed: 0 };
        entry[field] += 1;
        ledger[key] = entry;
      };
      const targets: readonly (readonly [string, EventTarget])[] = [
        ['window', window],
        ['document', document],
      ];
      for (const [name, target] of targets) {
        const add = target.addEventListener.bind(target);
        const remove = target.removeEventListener.bind(target);
        target.addEventListener = ((
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions,
        ): void => {
          if (typeof type === 'string' && observedTypes.includes(type)) {
            bump(`${name}:${type}`, 'added');
          }
          add(type, listener, options);
        }) as EventTarget['addEventListener'];
        target.removeEventListener = ((
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | EventListenerOptions,
        ): void => {
          if (typeof type === 'string' && observedTypes.includes(type)) {
            bump(`${name}:${type}`, 'removed');
          }
          remove(type, listener, options);
        }) as EventTarget['removeEventListener'];
      }
      let rafCalls = 0;
      const originalRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = ((
        callback: FrameRequestCallback,
      ): number => {
        rafCalls += 1;
        return originalRaf(callback);
      }) as typeof window.requestAnimationFrame;
      const observers: SoakObservers = {
        readRafCalls: () => rafCalls,
        resetRafCalls: () => {
          rafCalls = 0;
        },
        readListenerLedger: () => ledger,
      };
      (
        window as Window & { __shmupSoakObservers__?: SoakObservers }
      ).__shmupSoakObservers__ = observers;
    },
    [...OBSERVED_LISTENER_TYPES],
  );
}

/** Resets the counter, waits one window, and returns the observed frame requests. */
async function sampleRafCalls(page: Page, windowMs: number): Promise<number> {
  await page.evaluate(() => {
    (
      window as Window & { __shmupSoakObservers__?: SoakObservers }
    ).__shmupSoakObservers__?.resetRafCalls();
  });
  await page.waitForTimeout(windowMs);
  return page.evaluate(
    () =>
      (
        window as Window & { __shmupSoakObservers__?: SoakObservers }
      ).__shmupSoakObservers__?.readRafCalls() ?? -1,
  );
}

async function readListenerLedger(page: Page): Promise<ListenerLedger> {
  return page.evaluate(
    () =>
      (
        window as Window & { __shmupSoakObservers__?: SoakObservers }
      ).__shmupSoakObservers__?.readListenerLedger() ?? {},
  );
}

/** Registered-minus-released listener counts per `target:type`. */
function liveListenerCounts(ledger: ListenerLedger): Record<string, number> {
  const live: Record<string, number> = {};
  for (const [key, entry] of Object.entries(ledger)) {
    live[key] = entry.added - entry.removed;
  }
  return live;
}

/** Reads the authoritative read-only development observability snapshot. */
async function readObservability(page: Page): Promise<DevObservability> {
  return page.evaluate(() => {
    const hook = (
      window as Window & {
        __shmupDevObservability__?: () => DevObservability;
      }
    ).__shmupDevObservability__;
    if (hook === undefined) {
      throw new Error('development observability is unavailable');
    }
    return hook();
  });
}

/** Reads the persisted campaign row through IndexedDB (READ ONLY). */
async function readCampaignRow(page: Page): Promise<CampaignRow> {
  return page.evaluate(async (dbName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readonly');
      const get = transaction.objectStore('campaign').get('current');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    database.close();
    return row as CampaignRow;
  }, DB_NAME);
}

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

/** Reads the exact `Field Row` label → value pairs of a rendered Overlay. */
async function readFieldRows(
  dialog: Locator,
): Promise<ReadonlyMap<string, string>> {
  const rows = await dialog.evaluate((element) =>
    Array.from(element.querySelectorAll('.ds-field-row')).map((row) => ({
      label: row.children[0]?.textContent?.trim() ?? '',
      value: row.children[1]?.textContent?.trim() ?? '',
    })),
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.label, row.value);
  }
  return map;
}

/**
 * Reads the browser-visible state of the framework's window focus handlers.
 * Phaser's `VisibilityHandler` overwrites both per Game, so a leftover handler
 * after the last Combat exit would be a browser lifecycle registration that
 * outlived its owner (and would keep the destroyed Game reachable).
 */
async function readWindowFocusHandlers(
  page: Page,
): Promise<WindowFocusHandlerState> {
  return page.evaluate(() => ({
    onblur: window.onblur === null ? 'none' : typeof window.onblur,
    onfocus: window.onfocus === null ? 'none' : typeof window.onfocus,
  }));
}

/** Browser-visible residue facts of the current frame. */
async function readCleanupFacts(page: Page): Promise<CleanupFacts> {
  return {
    canvasCount: await page.locator('canvas').count(),
    combatScreenCount: await page.locator('.ds-combat-screen').count(),
    hudCount: await page.locator('.ds-combat-hud').count(),
    countdownCount: await page.locator('.ds-combat-countdown').count(),
    dialogCount: await page.getByRole('dialog').count(),
    devObservability: await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  };
}

/** No Combat runtime may own any surface once a mission has exited. */
function expectNoCombatResidue(facts: CleanupFacts): void {
  expect(facts.canvasCount).toBe(0);
  expect(facts.combatScreenCount).toBe(0);
  expect(facts.hudCount).toBe(0);
  expect(facts.countdownCount).toBe(0);
  expect(facts.devObservability).toBe('undefined');
}

function sumRoleCounts(counts: Readonly<Record<RoleKey, number>>): number {
  return ROLE_KEYS.reduce((total, role) => total + (counts[role] ?? 0), 0);
}

/** Parses a `Credits` field value such as `+3 Credits` or `0 Credits`. */
function parseCredits(value: string | undefined): number {
  const parsed = Number.parseInt((value ?? '').replace('+', ''), 10);
  expect(Number.isNaN(parsed)).toBe(false);
  return parsed;
}

/**
 * Proves the Operations progression contract of the current run: every unlocked
 * mission point is launchable (`completed` stays replayable, V02-AC-002) and
 * every not-yet-unlocked mission point is structurally disabled.
 */
async function expectOperationsProgression(
  page: Page,
  completed: readonly MissionId[],
  unlocked: readonly MissionId[],
): Promise<void> {
  for (const missionId of MISSION_IDS) {
    const label = `${MISSION_LABELS[missionId]}${
      unlocked.includes(missionId)
        ? completed.includes(missionId)
          ? ' (Completed)'
          : ''
        : ' (Locked)'
    }`;
    const point = page.getByRole('button', { name: label, exact: true });
    await expect(point).toBeVisible();
    if (unlocked.includes(missionId)) {
      await expect(point).toBeEnabled();
    } else {
      await expect(point).toBeDisabled();
    }
  }
}

test('five consecutive mixed-outcome missions in one development page leave no retained Combat runtime (V02-AC-027, V02-WI-07 D03)', async ({
  page,
  context,
  browser,
}) => {
  // Five consecutive missions in one browser session: the budget covers the two
  // real five-second Evacuation commitments, five lazy Combat entries, and the
  // post-GC samples under full-suite load.
  test.setTimeout(900_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.setViewportSize({ ...VIEWPORT });
  await installSoakObservers(page);
  // One fixed session seed through the browser entropy adapter before bootstrap:
  // every mission seed and every authored variant of the route is reproducible.
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(value >>> 0);
        return array;
      }
      return original(array);
    };
  }, SESSION_SEED);

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Let the Boot/Base preload requests settle before the first heap sample.
  await page.waitForTimeout(1000);

  const bootListenerLedger = await readListenerLedger(page);
  const bootWindowFocusHandlers = await readWindowFocusHandlers(page);
  const baselineHeapBytes = await heapAfterGc(page, context);

  const steps: StepRecord[] = [];
  const heapSeries: number[] = [];
  const listenerLedgers: ListenerLedger[] = [];
  const idleRafSeries: number[] = [];
  const activeRafSeries: number[] = [];
  const missionSeeds: number[] = [];

  let credits = STARTING_CREDITS;
  let completed: MissionId[] = [];
  let unlocked: MissionId[] = ['interception-01'];
  let previousAttemptId: number | null = null;

  for (const [index, step] of ROUTE.entries()) {
    const creditsBefore = credits;
    const label = MISSION_LABELS[step.missionId];

    // --- Real Mission Start through the real UI ----------------------------
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: label }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Start Mission' }).click();
    await expect(page.getByTestId('combat-screen')).toBeVisible();
    // Exactly ONE settled Combat runtime owns this mission (the development
    // StrictMode transient is disposed): one canvas, shell, HUD, and Countdown.
    await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
      timeout: 15000,
    });
    await expect(page.locator('.ds-combat-screen')).toHaveCount(1);
    await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
    await expect(page.locator('.ds-combat-countdown')).toHaveCount(1);

    // The start transaction persisted exactly one fresh durable attempt marker
    // for this mission: no reused, duplicated, or stale identity.
    const startedRow = await readCampaignRow(page);
    expect(startedRow.value.missionInProgress?.missionId).toBe(step.missionId);
    const attemptId = startedRow.value.missionInProgress?.attemptId ?? -1;
    expect(Number.isSafeInteger(attemptId)).toBe(true);
    if (previousAttemptId !== null) {
      expect(attemptId).toBe(previousAttemptId + 1);
    }
    previousAttemptId = attemptId;

    // Positive control for the frame sampler below: the live Combat runtime
    // really is requesting animation frames, so an idle sample of zero is a
    // meaningful observation rather than a broken instrument.
    const activeRafCalls = await sampleRafCalls(page, RAF_SAMPLE_WINDOW_MS);
    expect(activeRafCalls).toBeGreaterThanOrEqual(RAF_ACTIVE_MIN_CALLS);
    // Positive control for the browser-handler observation: while the Game is
    // alive the framework owns the window focus handlers.
    const activeWindowFocusHandlers = await readWindowFocusHandlers(page);
    expect(activeWindowFocusHandlers.onblur).toBe('function');
    expect(activeWindowFocusHandlers.onfocus).toBe('function');

    // --- Live entity baseline through the accepted Debug authority ---------
    await page.keyboard.press('F1');
    const debug = page.getByRole('dialog');
    await expect(debug.getByRole('heading', { name: 'Debug' })).toBeVisible();
    await expect
      .poll(
        async () => (await readFieldRows(debug)).get('missionInProgress') ?? '',
        { timeout: 10000 },
      )
      .toBe(`${step.missionId} · attempt ${attemptId}`);
    await expect
      .poll(async () => (await readFieldRows(debug)).get('runStatus') ?? '', {
        timeout: 10000,
      })
      .toBe('active');
    await expect
      .poll(async () => (await readFieldRows(debug)).get('Credits') ?? '', {
        timeout: 10000,
      })
      .toBe(String(creditsBefore));

    const beforeSpawn = await readObservability(page);
    await debug
      .getByRole('button', { name: step.encounterLabel, exact: true })
      .click();
    // The command reached the CURRENT mission's authored Encounter: the
    // authoritative Current Encounter matches its exact id.
    await expect
      .poll(async () => (await readFieldRows(debug)).get('Current Encounter'), {
        timeout: 5000,
      })
      .toBe(step.encounterId);
    const liveBaseline = await readObservability(page);
    // The authored Encounter materialised exactly: per-role delta equals the
    // authored composition, and every live entity owns rendered bounds.
    for (const role of ROLE_KEYS) {
      expect(
        liveBaseline.activeEnemiesByType[role] -
          beforeSpawn.activeEnemiesByType[role],
      ).toBe(step.encounterComposition[role] ?? 0);
    }
    const activeEnemyCount = sumRoleCounts(liveBaseline.activeEnemiesByType);
    expect(activeEnemyCount).toBeGreaterThan(0);
    expect(liveBaseline.activeEnemyBounds).toHaveLength(activeEnemyCount);
    missionSeeds.push(liveBaseline.combatSeed);

    // --- Exact terminal resolution ----------------------------------------
    let frozen: DevObservability;
    let countdownElapsedMs: number | null = null;
    if (step.terminal === 'evacuation') {
      // The player-facing Evacuation: active Combat → Evacuate → confirmation →
      // the complete five-second authoritative countdown (never the forced
      // `Evacuate Mission` shortcut).
      await debug.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.ds-combat-countdown')).toHaveText(
        /^\d\d:\d\d$/,
      );
      await page
        .getByTestId('combat-utility')
        .getByRole('button', { name: 'Evacuate', exact: true })
        .click();
      const confirmation = page.getByRole('dialog');
      await expect(
        confirmation.getByRole('heading', { name: 'Evacuate?' }),
      ).toBeVisible();
      await confirmation
        .getByRole('button', { name: 'Confirm Evacuation' })
        .click();
      const countdown = page.locator('.ds-combat-countdown');
      await expect(countdown).toHaveText('EVACUATION 00:05');
      const commitStartedAt = Date.now();
      await expect
        .poll(async () => (await countdown.textContent()) ?? '', {
          timeout: 30000,
          intervals: [50, 100],
        })
        .toBe('EVACUATION 00:00');
      countdownElapsedMs = Date.now() - commitStartedAt;
      // The commitment really ran its full five seconds of authoritative time.
      expect(countdownElapsedMs).toBeGreaterThanOrEqual(4000);
      expect(countdownElapsedMs).toBeLessThanOrEqual(15000);
      // The frozen payload of the exact zero step is what the terminal commits.
      frozen = await readObservability(page);
    } else {
      // Accepted forced terminal through the same authoritative transition the
      // natural outcome uses (V02-AC-026). Debug holds Combat paused, so this
      // payload is exactly the economy and Hull the terminal commits.
      frozen = await readObservability(page);
      await debug
        .getByRole('button', {
          name: step.terminal === 'success' ? 'Win Mission' : 'Lose Mission',
          exact: true,
        })
        .click();
    }

    const headingText =
      step.terminal === 'success'
        ? 'MISSION COMPLETE'
        : step.terminal === 'defeat'
          ? 'MISSION FAILED'
          : 'EVACUATED';
    const result = page.getByRole('dialog');
    await expect(
      result.getByRole('heading', { name: headingText }),
    ).toBeVisible({
      timeout: 30000,
    });
    // The committed result is the ONLY blocking Overlay: the resolved Combat
    // runtime owns no canvas, shell, HUD, Countdown, or observability surface.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(result).toHaveClass(/ds-mission-result-overlay/);
    const exitCleanup = await readCleanupFacts(page);
    expect(exitCleanup.dialogCount).toBe(1);
    expectNoCombatResidue(exitCleanup);

    const resultRows = await readFieldRows(result);
    if (step.terminal === 'defeat') {
      expect(resultRows.get('Mission reward')).toBe('0 Credits');
      expect(resultRows.get('Repair cost')).toBe(
        `-${FULL_REPAIR_COST} Credits`,
      );
      credits = credits - FULL_REPAIR_COST;
    } else if (step.terminal === 'evacuation') {
      const retained = Math.floor(
        Math.max(
          0,
          frozen.pendingCombatRewards - frozen.pendingEscapePenalties,
        ) * 0.5,
      );
      expect(resultRows.get('Retained 50%')).toBe(`+${retained} Credits`);
      expect(resultRows.get('Credits earned')).toBe(`${retained} Credits`);
      await expect(result).toContainText('Mission not completed');
      credits = credits + retained;
    } else {
      const earned =
        Math.max(
          0,
          frozen.pendingCombatRewards - frozen.pendingEscapePenalties,
        ) + step.completionReward;
      expect(resultRows.get('Completion reward')).toBe(
        `+${step.completionReward} Credits`,
      );
      expect(parseCredits(resultRows.get('Credits earned'))).toBe(earned);
      if (step.unlocksMissionId !== null) {
        expect(resultRows.get('Mission unlocked')).toBe(
          MISSION_LABELS[step.unlocksMissionId],
        );
      } else {
        expect(resultRows.has('Mission unlocked')).toBe(false);
      }
      credits = credits + earned;
      completed = [...completed, step.missionId];
      if (step.unlocksMissionId !== null) {
        unlocked = [...unlocked, step.unlocksMissionId];
      }
    }
    const hullAfter =
      step.terminal === 'defeat' ? 100 : frozen.playerHullIntegrity;

    // The terminal campaign transaction committed exactly once, before
    // presentation: marker cleared, exact Credits/Hull, no duplicate write.
    const committed = await readCampaignRow(page);
    expect(committed.value.missionInProgress).toBeNull();
    expect(committed.value.runStatus).toBe('active');
    expect(committed.value.credits).toBe(credits);
    expect(committed.value.hullIntegrity).toBe(hullAfter);
    expect(committed.value.completedMissionIds).toEqual(completed);
    expect(committed.value.unlockedMissionIds).toEqual(unlocked);

    // Continue returns to Operations: the marker is gone, the unlock/replay
    // eligibility is exact, and no second mutation happened.
    await result.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(`Credits: ${credits}`)).toBeVisible();
    await expectOperationsProgression(page, completed, unlocked);

    // --- Post-exit cleanup proof before the next entry ---------------------
    // The Base screen is fully idle here: no Combat runtime owns any surface,
    // and no surviving per-frame loop or unreleased listener may remain.
    const operationsCleanup = await readCleanupFacts(page);
    expectNoCombatResidue(operationsCleanup);
    expect(operationsCleanup.dialogCount).toBe(0);
    await page.waitForTimeout(500);
    const idleRafCalls = await sampleRafCalls(page, RAF_SAMPLE_WINDOW_MS);
    expect(idleRafCalls).toBeLessThanOrEqual(RAF_IDLE_MAX_CALLS);
    // The framework's window focus handlers are released with the Game: the
    // browser-visible handler state returns exactly to its pre-Combat value.
    const idleWindowFocusHandlers = await readWindowFocusHandlers(page);
    expect(idleWindowFocusHandlers).toEqual(bootWindowFocusHandlers);
    const heapAfterGcBytes = await heapAfterGc(page, context);
    const listenerLedger = await readListenerLedger(page);

    activeRafSeries.push(activeRafCalls);
    idleRafSeries.push(idleRafCalls);
    heapSeries.push(heapAfterGcBytes);
    listenerLedgers.push(listenerLedger);

    steps.push({
      index,
      missionId: step.missionId,
      terminal: step.terminal,
      startLabel: label,
      attemptId,
      combatSeed: liveBaseline.combatSeed,
      spawnLabel: step.encounterLabel,
      spawnedEncounterId: liveBaseline.currentEncounterId,
      baseline: {
        missionTimeSeconds: liveBaseline.missionTimeSeconds,
        countdownSeconds: liveBaseline.countdownSeconds,
        playerHullIntegrity: liveBaseline.playerHullIntegrity,
        activeEnemiesByType: liveBaseline.activeEnemiesByType,
        activeEnemyBounds: liveBaseline.activeEnemyBounds.length,
        pendingCombatRewards: liveBaseline.pendingCombatRewards,
        pendingEscapePenalties: liveBaseline.pendingEscapePenalties,
      },
      frozen: {
        playerHullIntegrity: frozen.playerHullIntegrity,
        pendingCombatRewards: frozen.pendingCombatRewards,
        pendingEscapePenalties: frozen.pendingEscapePenalties,
        missionTimeSeconds: frozen.missionTimeSeconds,
      },
      resultHeading: headingText,
      countdownElapsedMs,
      creditsBefore,
      creditsAfter: credits,
      hullAfter,
      completedAfter: completed,
      unlockedAfter: unlocked,
      exitCleanup,
      operationsCleanup,
      activeWindowFocusHandlers,
      idleWindowFocusHandlers,
      activeRafCalls,
      idleRafCalls,
      heapAfterGcBytes,
      listenerLedger,
    });
  }

  // --- Cross-mission release contracts ------------------------------------
  // Every mission owned one fresh deterministic stream: a resumed, duplicated,
  // or replayed runtime would repeat an earlier mission's seed.
  expect(new Set(missionSeeds).size).toBe(missionSeeds.length);

  // No unreleased listener or subscription: the live count of every observed
  // `window`/`document` type does not grow across the five exits.
  const liveAfterExits = listenerLedgers.map(liveListenerCounts);
  const firstLive = liveAfterExits[0] ?? {};
  console.log(
    'V02-WI07-D03-LISTENERS',
    JSON.stringify({
      boot: liveListenerCounts(bootListenerLedger),
      afterExit: liveAfterExits,
      raw: listenerLedgers,
    }),
  );
  for (const live of liveAfterExits.slice(1)) {
    for (const key of new Set([
      ...Object.keys(firstLive),
      ...Object.keys(live),
    ])) {
      expect(live[key] ?? 0).toBeLessThanOrEqual(firstLive[key] ?? 0);
    }
  }

  // One post-GC heap series under the already accepted S14-WI01 contract: the
  // first Combat is the lazy-load warm-up and every later sample stays within
  // the documented per-mission noise allowance of it. Heap alone is not claimed
  // as proof of every released resource (see the per-resource evidence matrix).
  const warmupHeap = heapSeries[0] ?? 0;
  expect(warmupHeap).toBeLessThan(baselineHeapBytes + WARMUP_ALLOWANCE_BYTES);
  for (const laterHeap of heapSeries.slice(1)) {
    expect(laterHeap).toBeLessThan(warmupHeap + MISSION_NOISE_BYTES);
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  // --- Recorded evidence --------------------------------------------------
  const ownership = readEvidenceOwnership();
  const record = {
    label:
      'V02-WI-07 D03 five-consecutive-mission mixed-outcome soak — one page, one session (V02-AC-026–027; Epic §§12.4, 13.2–13.7, 17–18, 20; MASTER §7.10)',
    browser: `${browser.browserType().name()} ${browser.version()}`,
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: VIEWPORT,
    sessionSeed: SESSION_SEED,
    route: ROUTE.map((step, index) => ({
      index,
      missionId: step.missionId,
      terminal: step.terminal,
      encounterId: step.encounterId,
    })),
    steps,
    heapSeries: {
      baselineHeapBytes,
      postExitHeapBytes: heapSeries,
      warmupAllowanceBytes: WARMUP_ALLOWANCE_BYTES,
      missionNoiseBytes: MISSION_NOISE_BYTES,
    },
    listenerLedger: {
      bootLive: liveListenerCounts(bootListenerLedger),
      afterExitLive: liveAfterExits,
    },
    rafCallsPerWindow: {
      windowMs: RAF_SAMPLE_WINDOW_MS,
      activeCombat: activeRafSeries,
      idleBase: idleRafSeries,
      idleMax: RAF_IDLE_MAX_CALLS,
    },
    pageErrors,
    consoleErrors,
    runId: ownership.runId,
    sourceFingerprint: ownership.sourceFingerprint,
    generatedAt: new Date().toISOString(),
  };
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const json = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(EVIDENCE_DIR, RECORD_FILE), json);
  // An ownership-bound copy survives a later gate re-run that has no injected
  // runId/fingerprint (the same convention the other evidence specs use).
  if (ownership.runId !== null && ownership.sourceFingerprint !== null) {
    writeFileSync(
      join(EVIDENCE_DIR, `wi07-d03-five-mission-soak-${ownership.runId}.json`),
      json,
    );
  }
  console.log(
    'V02-WI07-D03-SOAK',
    JSON.stringify({
      credits,
      heapSeries,
      idleRafSeries,
      activeRafSeries,
    }),
  );
});
