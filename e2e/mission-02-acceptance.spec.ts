import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';
import type { SourceFingerprint } from './evidence-ownership';

/**
 * V02-WI-05 M02-R01 — the single development-browser Interception 02
 * acceptance owner (Epic §6.2, §8.2–8.2.1, §13.2–13.3, §15.2–15.4, §17;
 * V02-AC-001/002/003/005/013/020/022/023).
 *
 * The REAL application runs at the minimum `1280 × 600` CSS viewport: the real
 * React shell, the real lazy Phaser Combat entry, the real fixed-step
 * simulation, the real IndexedDB campaign transaction, and the real blocking
 * Overlay contract. The vertical is driven entirely through the real UI — from
 * Operations (Interception 02 locked) through an accepted Mission 01 Success
 * and the newly available Interception 02 Mission Details to active Mission 02
 * Combat with its initial `04:20` Countdown, one committed Mission 02 Success,
 * `Continue` back to Operations, the completed/replayable Mission 02 point and
 * the exactly-once Interception 03 unlock.
 *
 * The committed Success is reached with the EXISTING authoritative development
 * Debug command (`Win Mission`) after the authored first Encounter and the
 * current-mission `Spawn E5` command have been observed; the shortcut is never
 * presented as proof of natural schedule timing — deterministic exact-step
 * timing, RNG order and terminal priority are owned by the Vitest evidence in
 * `src/application/mission/encounter-resolution.test.ts`,
 * `src/application/combat/combat-mission-02.test.ts` and
 * `src/application/mission/mission-02-progression.test.ts`. The three viewport
 * screenshots are supplementary evidence only.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');
const DB_NAME = 'shmup-v0.2';

interface DevObservability {
  readonly combatSeed: number;
  readonly missionTimeSeconds: number;
  readonly countdownSeconds: number;
  readonly currentEncounterId: string | null;
  readonly playerHullIntegrity: number;
  readonly activeEnemiesByType: Readonly<Record<string, number>>;
  readonly destroyedEnemiesByType: Readonly<Record<string, number>>;
  readonly escapedEnemiesByType: Readonly<Record<string, number>>;
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

interface CaptureMeta {
  readonly fileName: string;
  readonly state: string;
  readonly setup: string;
  readonly acIds: readonly string[];
}

interface CaptureEntry extends CaptureMeta {
  readonly path: string;
  readonly browser: string;
  readonly viewport: string;
  readonly capturedAt: string;
  readonly passed: boolean;
  readonly runId: string | null;
  readonly sourceFingerprint: SourceFingerprint | null;
}

const captures: CaptureEntry[] = [];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

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

/** Reads the raw persisted campaign row envelope through IndexedDB. */
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

/** Mirrors the canonical role-count formatting used by the Debug Overlay. */
function formatRoleCounts(counts: Readonly<Record<string, number>>): string {
  const parts: string[] = [];
  const basic = counts['basic-drone'] ?? 0;
  const ranged = counts['ranged-drone'] ?? 0;
  const hunter = counts['hunter-drone'] ?? 0;
  if (basic > 0) {
    parts.push(`Basic ${basic}`);
  }
  if (ranged > 0) {
    parts.push(`Ranged ${ranged}`);
  }
  if (hunter > 0) {
    parts.push(`Hunter ${hunter}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '0';
}

/** Parses a `Credits` row value such as `+7 Credits` or `0 Credits`. */
function parseCredits(value: string | undefined): number {
  const parsed = Number.parseInt((value ?? '').replace('+', ''), 10);
  expect(Number.isNaN(parsed)).toBe(false);
  return parsed;
}

/**
 * Captures one viewport screenshot and returns the commit callback that records
 * it as PASSED evidence after the state's assertions succeeded. A capture whose
 * assertions fail leaves no manifest entry.
 */
async function captureViewport(
  page: Page,
  browser: Browser,
  meta: CaptureMeta,
): Promise<() => void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(EVIDENCE_DIR, meta.fileName);
  await page.screenshot({ path });
  const capturedAt = new Date().toISOString();
  return () => {
    captures.push({
      ...meta,
      path,
      browser: `${browser.browserType().name()} ${browser.version()}`,
      viewport: '1280x600 CSS pixels (Playwright viewport screenshot)',
      capturedAt,
      passed: true,
      ...readEvidenceOwnership(),
    });
  };
}

test.afterAll(() => {
  if (captures.length === 0) {
    return;
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const ownership = readEvidenceOwnership();
  const manifest = {
    runId: ownership.runId,
    sourceFingerprint: ownership.sourceFingerprint,
    viewport: '1280x600 CSS pixels',
    browser: 'chromium (Playwright development project)',
    generatedAt: new Date().toISOString(),
    entries: captures,
  };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(
    join(EVIDENCE_DIR, 'mission-02-r01-capture-manifest.json'),
    json,
  );
  if (ownership.runId !== null && ownership.sourceFingerprint !== null) {
    writeFileSync(
      join(
        EVIDENCE_DIR,
        `mission-02-r01-capture-manifest-${ownership.runId}.json`,
      ),
      json,
    );
  }
});

test('the complete Interception 02 vertical: unlock, Mission 02 start, 04:20 Countdown, committed Success, replay and exactly-once Mission 03 unlock (V02-AC-001/002/003/005/013/020/022/023)', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  // --- New Game Operations: Interception 02 is visible and locked ------------
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 01' }),
  ).toBeEnabled();
  const locked02 = page.getByRole('button', {
    name: 'Interception 02 (Locked)',
  });
  await expect(locked02).toBeVisible();
  await expect(locked02).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Interception 03 (Locked)' }),
  ).toBeDisabled();
  await expect(page.getByText('Credits: 12')).toBeVisible();

  // --- Accepted Mission 01 Success through the real UI -----------------------
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Interception 01' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  // The Countdown is the CURRENT mission's final arrival: 03:10 for Mission 01.
  await expect(page.locator('.ds-combat-countdown')).toHaveText('03:10');
  // The first durable attempt identity of this campaign (the allocator's key
  // generator value is opaque, so later identities are asserted relative to it).
  const rowAtMission01Start = await readCampaignRow(page);
  const mission01AttemptId =
    rowAtMission01Start.value.missionInProgress?.attemptId ?? -1;
  expect(rowAtMission01Start.value.missionInProgress?.missionId).toBe(
    'interception-01',
  );
  expect(Number.isSafeInteger(mission01AttemptId)).toBe(true);
  expect(mission01AttemptId).toBeGreaterThanOrEqual(0);

  await page.keyboard.press('F1');
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Debug' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Win Mission' }).click();
  const mission01Result = page.getByRole('dialog');
  await expect(
    mission01Result.getByRole('heading', { name: 'MISSION COMPLETE' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    mission01Result.getByText('8 Credits', { exact: true }),
  ).toBeVisible();
  await mission01Result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Mission 01 completed; Interception 02 is now available; 03 stays locked.
  const available02 = page.getByRole('button', { name: 'Interception 02' });
  await expect(available02).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 01 (Completed)' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 03 (Locked)' }),
  ).toBeDisabled();
  await expect(page.getByText('Credits: 20')).toBeVisible();
  const rowAfterMission01 = await readCampaignRow(page);
  expect(rowAfterMission01.value.credits).toBe(20);
  expect(rowAfterMission01.value.completedMissionIds).toEqual([
    'interception-01',
  ]);
  expect(rowAfterMission01.value.unlockedMissionIds).toEqual([
    'interception-01',
    'interception-02',
  ]);
  expect(rowAfterMission01.value.missionInProgress).toBeNull();

  // Capture 1: Operations with Interception 02 Available (V02-AC-001/002).
  const commitOperationsCapture = await captureViewport(page, browser, {
    fileName: 'v02-wi-05-m02-operations-02-available.png',
    state:
      'Operations after the accepted Mission 01 Success: Interception 01 Completed, Interception 02 Available, Interception 03 Locked',
    setup:
      'Real UI: Interception 01 Mission Details → Start Mission → development Debug Win Mission → MISSION COMPLETE → Continue',
    acIds: ['V02-AC-001', 'V02-AC-002'],
  });
  commitOperationsCapture();

  // --- Mission 02 Mission Details and active Combat with the 04:20 Countdown --
  await available02.click();
  const details = page.getByRole('dialog');
  await expect(
    details.getByRole('heading', { name: 'Interception 02' }),
  ).toBeVisible();
  await expect(details).toContainText('Resolve the incoming enemy wave.');
  await expect(details.getByText('12 Credits', { exact: true })).toBeVisible();
  const startMission02 = details.getByRole('button', {
    name: 'Start Mission',
  });
  await expect(startMission02).toBeFocused();
  await startMission02.click();

  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  const countdown = page.locator('.ds-combat-countdown');
  // The visible Mission 02 Combat identity: its authored 04:20 final arrival.
  await expect(countdown).toHaveText('04:20');
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The durable marker carries the exact Mission 02 identity before Combat: a
  // fresh immutable attempt id, monotonically one greater than Mission 01's.
  const rowAtStart = await readCampaignRow(page);
  expect(rowAtStart.value.missionInProgress).toEqual({
    missionId: 'interception-02',
    attemptId: mission01AttemptId + 1,
  });
  expect(rowAtStart.value.credits).toBe(20);

  // Capture 2: active Mission 02 Combat with its 04:20 Countdown.
  const commitCombatCapture = await captureViewport(page, browser, {
    fileName: 'v02-wi-05-m02-combat-countdown-0420.png',
    state:
      'Active Interception 02 Combat with the initial 04:20 Combat Countdown',
    setup:
      'Real UI: Operations → Interception 02 Mission Details → Start Mission at 1280x600',
    acIds: ['V02-AC-003', 'V02-AC-022'],
  });
  commitCombatCapture();

  // The authored Interception 02 schedule is consumed by the real runtime: the
  // first Encounter creates on its exact 00:10 step.
  await expect
    .poll(async () => (await readObservability(page)).currentEncounterId, {
      timeout: 30000,
      intervals: [100, 200],
    })
    .toBe('interception-02-e1');
  const atFirstArrival = await readObservability(page);
  expect(atFirstArrival.missionTimeSeconds).toBeGreaterThanOrEqual(10);
  expect(
    atFirstArrival.activeEnemiesByType['basic-drone'],
  ).toBeGreaterThanOrEqual(1);
  // The Countdown keeps using the ceiling formula after the first arrival.
  await expect(countdown).toHaveText(/^04:0\d$/);

  // --- Development Debug: current-mission Encounter command and Win ----------
  await page.keyboard.press('F1');
  const debug = page.getByRole('dialog');
  await expect(debug.getByRole('heading', { name: 'Debug' })).toBeVisible();
  expect((await readFieldRows(debug)).get('Current Encounter')).toBe(
    'interception-02-e1',
  );

  // The development Spawn Encounter commands address the CURRENT mission: the
  // Mission 02 e5 Encounter (1 Basic + 1 Ranged + 1 Hunter) materializes through
  // the same authoritative command that was previously hard-coded to Mission 01.
  await debug.getByRole('button', { name: 'Spawn E5' }).click();
  await expect
    .poll(async () => (await readFieldRows(debug)).get('Current Encounter'), {
      timeout: 5000,
    })
    .toBe('interception-02-e5');
  const debugRowsAtE5 = await readFieldRows(debug);
  expect(debugRowsAtE5.get('Active Enemies')).toContain('Ranged 1');
  expect(debugRowsAtE5.get('Active Enemies')).toContain('Hunter 1');

  // The frozen simulation payload at the commitment instant (Debug pauses
  // Combat, so no time and therefore no economy advances until Win Mission).
  const frozenPayload = await readObservability(page);
  expect(frozenPayload.pendingCombatRewards).toBeGreaterThanOrEqual(0);
  expect(frozenPayload.pendingEscapePenalties).toBeGreaterThanOrEqual(0);

  // --- The committed Mission 02 Success result ---------------------------------
  await debug.getByRole('button', { name: 'Win Mission' }).click();
  const result = page.getByRole('dialog');
  await expect(
    result.getByRole('heading', { name: 'MISSION COMPLETE' }),
  ).toBeVisible({ timeout: 20000 });
  // Exactly one blocking result Overlay; the single Combat owner was disposed
  // with the resolved mission, so no second canvas, HUD, or Countdown remains.
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(page.locator('.ds-combat-countdown')).toHaveCount(0);

  const netCombat = Math.max(
    0,
    frozenPayload.pendingCombatRewards - frozenPayload.pendingEscapePenalties,
  );
  const expectedEarned = netCombat + 12;
  const resultRows = await readFieldRows(result);
  // Every presented value is derived from the frozen simulation payload plus
  // the authored Mission 02 completion reward; nothing is re-computed by the UI.
  expect(resultRows.get('Destroyed')).toBe(
    formatRoleCounts(frozenPayload.destroyedEnemiesByType),
  );
  expect(resultRows.get('Escaped')).toBe(
    formatRoleCounts(frozenPayload.escapedEnemiesByType),
  );
  expect(resultRows.get('Combat rewards')).toBe(
    `+${frozenPayload.pendingCombatRewards} Credits`,
  );
  expect(resultRows.get('Completion reward')).toBe('+12 Credits');
  expect(resultRows.get('Escape penalties')).toBe(
    frozenPayload.pendingEscapePenalties > 0
      ? `-${frozenPayload.pendingEscapePenalties} Credits`
      : '0 Credits',
  );
  expect(parseCredits(resultRows.get('Credits earned'))).toBe(expectedEarned);
  // Mission 03 is the only newly unlocked mission, shown exactly once.
  expect(resultRows.get('Mission unlocked')).toBe('Interception 03');
  await expect(result.getByText('Mission unlocked')).toHaveCount(1);

  // The committed campaign row: one coherent transaction, no duplicates.
  const committed = await readCampaignRow(page);
  expect(committed.value.credits).toBe(20 + expectedEarned);
  expect(committed.value.missionInProgress).toBeNull();
  expect(committed.value.completedMissionIds).toEqual([
    'interception-01',
    'interception-02',
  ]);
  expect(committed.value.unlockedMissionIds).toEqual([
    'interception-01',
    'interception-02',
    'interception-03',
  ]);

  // Capture 3: committed Mission 02 Success result and the Mission 03 unlock.
  const commitResultCapture = await captureViewport(page, browser, {
    fileName: 'v02-wi-05-m02-success-result-unlock-03.png',
    state:
      'Committed Mission 02 Success result: frozen payload rows, Credits earned and the Mission 03 unlock',
    setup:
      'Real UI: development Debug current-mission Encounter + Win Mission → committed campaign transaction → shared exit sequence',
    acIds: ['V02-AC-002', 'V02-AC-013', 'V02-AC-023'],
  });
  commitResultCapture();

  // --- Continue returns to Operations with the completed/replayable point -----
  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 01 (Completed)' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Completed)' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 03' }),
  ).toBeEnabled();
  await expect(page.getByText(`Credits: ${20 + expectedEarned}`)).toBeVisible();

  // No Combat residue and no second persistence mutation after Continue.
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(countdown).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  ).toBe('undefined');
  const afterContinue = await readCampaignRow(page);
  expect(afterContinue.value).toEqual(committed.value);

  // --- Completed Mission 02 stays replayable with a fresh attempt identity ----
  await page
    .getByRole('button', { name: 'Interception 02 (Completed)' })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Interception 02' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-countdown')).toHaveText('04:20');
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
  const replayRow = await readCampaignRow(page);
  // A fresh immutable attempt identity for the replay; progression unchanged.
  expect(replayRow.value.missionInProgress).toEqual({
    missionId: 'interception-02',
    attemptId: mission01AttemptId + 2,
  });
  expect(replayRow.value.credits).toBe(20 + expectedEarned);
  expect(replayRow.value.completedMissionIds).toEqual([
    'interception-01',
    'interception-02',
  ]);
  expect(replayRow.value.unlockedMissionIds).toEqual([
    'interception-01',
    'interception-02',
    'interception-03',
  ]);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
