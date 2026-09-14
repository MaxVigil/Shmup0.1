import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';
import type { SourceFingerprint } from './evidence-ownership';

/**
 * V02-WI-05 Evacuation checkpoint E04 — the single Evacuation browser owner
 * (Epic §13.4, §13.7, §14.4, §15.1–15.5, V02-DEC-027/028/029/030;
 * V02-AC-014/015/019/020/022/023; slices §6 E04; DS §8.26; Verification §14.2).
 *
 * Everything here runs the REAL application at the minimum `1280 × 600` CSS
 * viewport: the real React shell, the real lazy Phaser Combat entry, the real
 * fixed-step simulation, the real IndexedDB campaign transaction, and the real
 * blocking-Overlay focus contract. No production test hook, shortcut, or bypass
 * is used or added. Pass/fail is numeric DOM/runtime geometry and authoritative
 * development observability; the four viewport screenshots are supplementary
 * evidence only.
 *
 * Short-circuit protection (assigned risk 1): the successful path proves the
 * EXACT zero step from the authoritative countdown element and the shared
 * centre-and-up exit before the result appears, using in-page
 * `performance.now()` sampling — never a fixed wait or a screenshot.
 *
 * The Save Error / Save Conflict paths use the supported development seam the
 * existing browser recovery tests already use (rewriting the persisted
 * `shmup-v0.2`/`campaign`/`current` row through IndexedDB) and never a
 * production hook.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');
const DB_NAME = 'shmup-v0.2';

const CONFIRMATION_BODY_ONE =
  'Evacuation takes 5 seconds. Combat continues during the countdown.';
const CONFIRMATION_BODY_TWO =
  'You will retain 50% of net combat rewards. The mission will not be completed and the next mission will not unlock.';

interface DevObservability {
  readonly missionTimeSeconds: number;
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
  readonly missionInProgress: unknown;
  readonly completedMissionIds: readonly string[];
  readonly unlockedMissionIds: readonly string[];
}

interface CampaignRow {
  readonly id: string;
  readonly rowFormatVersion: number;
  readonly value: CampaignValue;
}

interface EvacuationTimeline {
  zeroAt: number | null;
  firstDialogAt: number | null;
  resultAt: number | null;
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

// --- real-application drivers -----------------------------------------------

/** Opens the real application and starts one Interception mission. */
async function startCombat(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
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

/** Waits until the authoritative Mission Clock reaches `seconds`. */
async function waitForMissionTime(page: Page, seconds: number): Promise<void> {
  await expect
    .poll(async () => (await readObservability(page)).missionTimeSeconds, {
      timeout: 45000,
      intervals: [100, 200],
    })
    .toBeGreaterThanOrEqual(seconds);
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

/** Writes an exact row envelope back (restores a deleted campaign row). */
async function writeCampaignRow(page: Page, row: unknown): Promise<void> {
  await page.evaluate(
    async ({ dbName, record }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('campaign', 'readwrite');
        transaction.objectStore('campaign').put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { dbName: DB_NAME, record: row },
  );
}

/** Deletes the persisted campaign record (forces a `failed` commit outcome). */
async function deleteCampaignRow(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readwrite');
      transaction.objectStore('campaign').delete('current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, DB_NAME);
}

/** Clears the durable mission marker while keeping the row valid (forces an
 *  `inert` commit outcome: the transition sees no owned mission to resolve). */
async function clearMissionMarker(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readwrite');
      const store = transaction.objectStore('campaign');
      const get = store.get('current');
      get.onsuccess = () => {
        const row = get.result as {
          id: string;
          value: { missionInProgress: unknown };
        };
        store.put({ ...row, value: { ...row.value, missionInProgress: null } });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, DB_NAME);
}

// --- E04 evidence capture ---------------------------------------------------

/** Captures one viewport screenshot and returns the commit callback that
 *  records it as PASSED evidence after the state's assertions succeeded. A
 *  capture whose assertions fail leaves no manifest entry. */
async function captureViewport(
  page: Page,
  browser: Browser,
  meta: CaptureMeta,
): Promise<() => void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(EVIDENCE_DIR, meta.fileName);
  await page.screenshot({ path });
  // The recorded time is the actual screenshot instant — never a single later
  // timestamp assigned to every capture when the assertions finish.
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
    join(EVIDENCE_DIR, 'evacuation-e04-capture-manifest.json'),
    json,
  );
  // An ownership-bound copy survives a later gate re-run that has no injected
  // runId/fingerprint.
  if (ownership.runId !== null && ownership.sourceFingerprint !== null) {
    writeFileSync(
      join(
        EVIDENCE_DIR,
        `evacuation-e04-capture-manifest-${ownership.runId}.json`,
      ),
      json,
    );
  }
});

// --- shared DOM readers -----------------------------------------------------

/** Reads the exact `Field Row` label → value pairs of a rendered result. */
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

/** Mirrors the canonical Evacuation result role-count formatting. */
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

/** Parses a `Credits` row value such as `+3 Credits` or `0 Credits`. */
function parseCredits(value: string | undefined): number {
  const parsed = Number.parseInt((value ?? '').replace('+', ''), 10);
  expect(Number.isNaN(parsed)).toBe(false);
  return parsed;
}

/** The canonical Evacuation payout: floor(max(0, rewards - penalties) × 0.5). */
function retainedCredits(rewards: number, penalties: number): number {
  return Math.floor(Math.max(0, rewards - penalties) * 0.5);
}

/** Installs the in-page exit-timing sampler used by the E04 exit assertions. */
async function installEvacuationTimeline(page: Page): Promise<void> {
  await page.evaluate(() => {
    const timeline: EvacuationTimeline = {
      zeroAt: null,
      firstDialogAt: null,
      resultAt: null,
    };
    (
      window as Window & { __shmupE04Timeline__?: EvacuationTimeline }
    ).__shmupE04Timeline__ = timeline;
    const sample = (): void => {
      const countdown =
        document.querySelector('.ds-combat-countdown')?.textContent ?? '';
      if (countdown === 'EVACUATION 00:00' && timeline.zeroAt === null) {
        timeline.zeroAt = window.performance.now();
      }
      if (
        timeline.zeroAt !== null &&
        timeline.firstDialogAt === null &&
        document.querySelector('[role="dialog"]') !== null
      ) {
        timeline.firstDialogAt = window.performance.now();
      }
      const heading =
        document.querySelector('[role="dialog"] h2')?.textContent ?? '';
      if (heading === 'EVACUATED' && timeline.resultAt === null) {
        timeline.resultAt = window.performance.now();
      }
      if (timeline.resultAt === null) {
        window.requestAnimationFrame(sample);
      }
    };
    window.requestAnimationFrame(sample);
  });
}

async function readEvacuationTimeline(
  page: Page,
): Promise<EvacuationTimeline | null> {
  return page.evaluate(
    () =>
      (window as Window & { __shmupE04Timeline__?: EvacuationTimeline })
        .__shmupE04Timeline__ ?? null,
  );
}

test('the blocking Evacuate? confirmation is identical for the active-Combat and Pause origins at 1280x600 (V02-AC-014, DS §8.5/§8.26, DS-AC-005/013/014)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // The persistent active-Combat affordance: destructive text `Evacuate`
  // immediately before Pause and Settings (DS §8.26), same 2.5rem height.
  const utility = page.getByTestId('combat-utility');
  const utilityButtons = utility.getByRole('button');
  await expect(utilityButtons).toHaveCount(3);
  await expect(utilityButtons.nth(0)).toHaveText('Evacuate');
  await expect(utilityButtons.nth(0)).toHaveClass(/ds-button--destructive/);
  await expect(utilityButtons.nth(1)).toHaveAttribute('aria-label', 'Pause');
  await expect(utilityButtons.nth(2)).toHaveAttribute('aria-label', 'Settings');
  await expect(page.locator('canvas')).toHaveCount(1);

  // Native keyboard activation of the affordance opens the one blocking Overlay.
  const clusterEvacuate = utility.getByRole('button', { name: 'Evacuate' });
  await clusterEvacuate.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await expect(dialog).toContainText(CONFIRMATION_BODY_ONE);
  await expect(dialog).toContainText(CONFIRMATION_BODY_TWO);

  // Exact action order and approved variants; Cancel owns initial focus.
  const actions = dialog.getByRole('button');
  await expect(actions).toHaveCount(2);
  await expect(actions.nth(0)).toHaveText('Cancel');
  await expect(actions.nth(0)).toHaveClass(/ds-button--secondary/);
  await expect(actions.nth(1)).toHaveText('Confirm Evacuation');
  await expect(actions.nth(1)).toHaveClass(/ds-button--destructive/);
  await expect(actions.nth(0)).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Return to Base' }),
  ).toHaveCount(0);

  // The other blocking controls are visible but cannot be activated behind the
  // confirmation (one blocking Overlay at a time).
  await expect(
    utility.getByRole('button', { name: 'Evacuate' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeDisabled();

  // Tab / Shift+Tab stay inside the Overlay Surface (numeric active-element
  // containment, not visual appearance).
  await page.keyboard.press('Tab');
  await expect(actions.nth(1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(actions.nth(0)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(actions.nth(1)).toBeFocused();
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    ),
  ).toBe(true);

  // V02-WI-05 E04 C01: no native pointer default may be cancelled anywhere in
  // the blocking Overlay, so ordinary content keeps selection/scrollbar
  // behaviour. The probe runs last in the bubble phase, after every handler.
  await page.evaluate(() => {
    const target = window as Window & {
      __e04PointerDefaults__?: { surface: boolean; scrim: boolean };
    };
    target.__e04PointerDefaults__ = { surface: false, scrim: false };
    window.addEventListener('mousedown', (event) => {
      if (!event.defaultPrevented) {
        return;
      }
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element?.closest('.ds-overlay__scrim') !== null) {
        target.__e04PointerDefaults__!.scrim = true;
      } else if (element?.closest('.ds-overlay__surface') !== null) {
        target.__e04PointerDefaults__!.surface = true;
      }
    });
  });

  // Scrim interaction is inert (no close, no native default cancelled) and
  // containment is repaired, so `Esc` and `Tab` keep working.
  await page.locator('.ds-overlay__scrim').click({ position: { x: 4, y: 4 } });
  await expect(
    dialog.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    ),
  ).toBe(true);
  await expect(actions.nth(1)).toBeFocused();

  // Static confirmation content keeps its native pointer behaviour: a real drag
  // still selects the copy, and containment recovers afterwards.
  const bodyCopy = dialog.getByText(CONFIRMATION_BODY_TWO);
  const bodyLine = await bodyCopy.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getClientRects()[0];
    return rect === undefined
      ? null
      : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  expect(bodyLine).not.toBeNull();
  if (bodyLine !== null) {
    await page.mouse.move(bodyLine.x + 2, bodyLine.y + bodyLine.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      bodyLine.x + bodyLine.width - 2,
      bodyLine.y + bodyLine.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
  }
  expect(
    await page.evaluate(() => window.getSelection()?.toString().length ?? 0),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __e04PointerDefaults__?: { surface: boolean; scrim: boolean };
          }
        ).__e04PointerDefaults__ ?? null,
    ),
  ).toEqual({ surface: false, scrim: false });

  // Esc is Cancel: it restores the exact prior active-Combat state and returns
  // focus to the still-existing opening control.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  await expect(utility.getByRole('button', { name: 'Evacuate' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();

  // Pause origin: the Pause row is Resume plus the same destructive Evacuate,
  // and the same confirmation opens.
  await page.keyboard.press('KeyP');
  const pauseDialog = page.getByRole('dialog');
  await expect(
    pauseDialog.getByRole('heading', { name: 'Paused' }),
  ).toBeVisible();
  await expect(pauseDialog.getByRole('button')).toHaveCount(2);
  await expect(
    pauseDialog.getByRole('button', { name: 'Resume' }),
  ).toBeFocused();
  await expect(
    pauseDialog.getByRole('button', { name: 'Evacuate' }),
  ).toHaveCount(1);
  await expect(
    pauseDialog.getByRole('button', { name: 'Return to Base' }),
  ).toHaveCount(0);
  await pauseDialog.getByRole('button', { name: 'Evacuate' }).click();

  await expect(
    dialog.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await expect(dialog).toContainText(CONFIRMATION_BODY_ONE);
  await expect(dialog).toContainText(CONFIRMATION_BODY_TWO);
  await expect(dialog.getByRole('button').nth(0)).toHaveText('Cancel');
  await expect(dialog.getByRole('button').nth(1)).toHaveText(
    'Confirm Evacuation',
  );
  await expect(dialog.getByRole('button').nth(0)).toBeFocused();

  // Native Space activation of Cancel restores the exact prior Pause state.
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Evacuate?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button')).toHaveCount(2);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Resume' }),
  ).toBeFocused();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Evacuate' }),
  ).toHaveCount(1);

  // Resume returns to the same running runtime with the affordance intact.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Resume' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(utility.getByRole('button', { name: 'Evacuate' })).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test('a confirmed Evacuation replaces the Countdown, keeps Combat running, freezes under browser safety, and resolves only after the shared exit (V02-AC-014/015/019/022/023)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // Reach mission time past 00:05 so the commitment spans the authored `00:10`
  // Encounter; the spawn is asserted below, not assumed.
  await waitForMissionTime(page, 6);

  const utility = page.getByTestId('combat-utility');
  const countdown = page.locator('.ds-combat-countdown');
  await expect(countdown).toHaveCount(1);
  await expect(countdown).not.toContainText('EVACUATION');
  const commitCluster = await captureViewport(page, browser, {
    fileName: 'v02-wi-05-e04-active-evacuate-cluster.png',
    state: 'Active Combat with the eligible Evacuate affordance',
    setup:
      'Real Interception 01 Combat started from Operations at mission time > 00:06',
    acIds: ['V02-AC-014', 'V02-AC-022'],
  });

  await utility.getByRole('button', { name: 'Evacuate' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const commitConfirmation = await captureViewport(page, browser, {
    fileName: 'v02-wi-05-e04-evacuation-confirmation.png',
    state: 'Blocking Evacuate? confirmation with Cancel focused',
    setup: 'Opened from active Combat through the real UI',
    acIds: ['V02-AC-014'],
  });

  await installEvacuationTimeline(page);
  const beforeCommit = await readObservability(page);
  await dialog.getByRole('button', { name: 'Confirm Evacuation' }).click();

  // Authoritative HUD replacement on the ONE countdown element; the ordinary
  // Combat Countdown never survives beside it.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(countdown).toHaveCount(1);
  await expect(countdown).toHaveText('EVACUATION 00:05');
  await expect(page.getByText('03:10', { exact: true })).toHaveCount(0);
  const commitCountdown = await captureViewport(page, browser, {
    fileName: 'v02-wi-05-e04-evacuation-countdown.png',
    state: 'Authoritative EVACUATION 00:05 countdown HUD',
    setup: 'Immediately after Confirm Evacuation recorded the commitment',
    acIds: ['V02-AC-014', 'V02-AC-022'],
  });

  // V02-WI-05 E04 C01: the Evacuation Countdown keeps the canonical viewport
  // geometry — centred at the exact space-4 top offset, one line, and
  // independent of the Aircraft-anchored Hull bar.
  interface HudBox {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
    readonly lineCount: number;
    readonly lineHeight: number;
  }
  const readHudGeometry = (): Promise<{
    readonly viewportWidth: number;
    readonly countdown: HudBox | null;
    readonly bar: HudBox | null;
  }> =>
    page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          lineCount: range.getClientRects().length,
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      };
      return {
        viewportWidth: window.innerWidth,
        countdown: read('.ds-combat-countdown'),
        bar: read('.ds-combat-hud__bar'),
      };
    });

  const committedHud = await readHudGeometry();
  expect(committedHud.countdown).not.toBeNull();
  const evacuationCountdown = committedHud.countdown as HudBox;
  expect(evacuationCountdown.lineCount).toBe(1);
  expect(
    Math.abs(evacuationCountdown.height - evacuationCountdown.lineHeight),
  ).toBeLessThan(1);
  // space-4 is `1rem` = 16px at the approved 16px base font (DS §6.2).
  expect(Math.abs(evacuationCountdown.top - 16)).toBeLessThan(1);
  expect(
    Math.abs(
      (evacuationCountdown.left + evacuationCountdown.right) / 2 -
        committedHud.viewportWidth / 2,
    ),
  ).toBeLessThan(1);

  // The Aircraft still responds during the commitment: the Hull bar follows it
  // while the Evacuation Countdown keeps exactly the same geometry.
  await page.mouse.move(380, 520);
  await expect
    .poll(async () => (await readHudGeometry()).bar?.left ?? 0, {
      timeout: 5000,
    })
    .toBeLessThan(500);
  const movedHud = await readHudGeometry();
  expect(movedHud.bar).not.toBeNull();
  expect(movedHud.countdown).not.toBeNull();
  const movedBar = movedHud.bar as HudBox;
  const movedEvacuationCountdown = movedHud.countdown as HudBox;
  expect(
    Math.abs((committedHud.bar as HudBox).left - movedBar.left),
  ).toBeGreaterThan(50);
  expect(movedEvacuationCountdown.lineCount).toBe(1);
  for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
    expect(
      Math.abs(movedEvacuationCountdown[key] - evacuationCountdown[key]),
    ).toBeLessThan(0.5);
  }
  await expect(countdown).toHaveText(/^EVACUATION 00:0\d$/);

  // Normal Combat continues: the authoritative Mission Clock advances and the
  // authored `00:10` Encounter still spawns inside the commitment.
  await expect
    .poll(async () => (await readObservability(page)).missionTimeSeconds, {
      timeout: 5000,
    })
    .toBeGreaterThan(beforeCommit.missionTimeSeconds + 0.5);
  await expect
    .poll(async () => (await readObservability(page)).currentEncounterId, {
      timeout: 10000,
      intervals: [100, 200],
    })
    .toBe('interception-01-e1');
  await expect
    .poll(
      async () =>
        (await readObservability(page)).activeEnemiesByType['basic-drone'] ?? 0,
      { timeout: 10000, intervals: [100, 200] },
    )
    .toBeGreaterThan(0);

  // Evacuate is gone irreversibly from running Combat and from Pause.
  await expect(utility.getByRole('button', { name: 'Evacuate' })).toHaveCount(
    0,
  );
  await expect(utility.getByRole('button')).toHaveCount(2);
  await page.keyboard.press('KeyP');
  const paused = page.getByRole('dialog');
  await expect(paused.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(paused.getByRole('button')).toHaveCount(1);
  await expect(paused.getByRole('button', { name: 'Evacuate' })).toHaveCount(0);
  await expect(paused.getByRole('button', { name: 'Resume' })).toBeFocused();
  await expect(
    paused.getByRole('button', { name: 'Return to Base' }),
  ).toHaveCount(0);

  // Paused: the SAME authoritative value is frozen — no countdown owner in the
  // presentation and no authoritative time advance.
  const pausedText = (await countdown.textContent()) ?? '';
  const pausedMissionTime = (await readObservability(page)).missionTimeSeconds;
  await page.waitForTimeout(800);
  await expect(countdown).toHaveText(pausedText);
  expect((await readObservability(page)).missionTimeSeconds).toBeCloseTo(
    pausedMissionTime,
    3,
  );
  await paused.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Browser safety inside the commitment: focus loss and a hidden tab freeze
  // the same authoritative value and require an explicit Resume.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const safetyDialog = page.getByRole('dialog');
  await expect(
    safetyDialog.getByRole('heading', { name: 'Paused' }),
  ).toBeVisible();
  await expect(safetyDialog.getByRole('button')).toHaveCount(1);
  await expect(
    safetyDialog.getByRole('button', { name: 'Resume' }),
  ).toBeFocused();
  // The authoritative value is frozen as soon as the safety pause is committed:
  // read it after the Overlay exists so an in-flight step cannot be mistaken for
  // a countdown that advanced while hidden.
  const safetyText = (await countdown.textContent()) ?? '';
  const safetyMissionTime = (await readObservability(page)).missionTimeSeconds;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1200);
  await expect(countdown).toHaveText(safetyText);
  expect((await readObservability(page)).missionTimeSeconds).toBeCloseTo(
    safetyMissionTime,
    3,
  );
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>)['hidden'];
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    safetyDialog.getByRole('heading', { name: 'Paused' }),
  ).toBeVisible();
  await safetyDialog.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // The exact zero step resolves Evacuated: no result may open at 00:00; the
  // shared centre-and-up exit must complete first.
  await expect
    .poll(async () => (await countdown.textContent()) ?? '', {
      timeout: 30000,
      intervals: [50, 100],
    })
    .toBe('EVACUATION 00:00');
  const atZero = await readObservability(page);
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(0);
  // Enemies still active at the zero step are never converted into Escaped
  // counts or penalties: the frozen values are unchanged while the shared exit
  // is still running (and therefore before the result exists).
  expect(atZero.activeEnemiesByType['basic-drone'] ?? 0).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  const duringExit = await readObservability(page);
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(0);
  expect(duringExit.destroyedEnemiesByType).toEqual(
    atZero.destroyedEnemiesByType,
  );
  expect(duringExit.escapedEnemiesByType).toEqual(atZero.escapedEnemiesByType);
  expect(duringExit.pendingCombatRewards).toBe(atZero.pendingCombatRewards);
  expect(duringExit.pendingEscapePenalties).toBe(atZero.pendingEscapePenalties);
  const result = page.getByRole('dialog');
  await expect(result.getByRole('heading', { name: 'EVACUATED' })).toBeVisible({
    timeout: 15000,
  });
  const timeline = await readEvacuationTimeline(page);
  expect(timeline).not.toBeNull();
  if (timeline === null) {
    throw new Error('Evacuation exit timeline unavailable');
  }
  expect(timeline.zeroAt).not.toBeNull();
  expect(timeline.firstDialogAt).not.toBeNull();
  if (timeline.zeroAt === null || timeline.firstDialogAt === null) {
    throw new Error('Evacuation exit timeline incomplete');
  }
  // Numeric proof that the complete shared exit (0.5 s centring + 60% VH/s
  // upward) ran before the result: no dialog existed for at least 900 ms after
  // the zero step.
  expect(timeline.firstDialogAt - timeline.zeroAt).toBeGreaterThanOrEqual(900);

  // The committed result is immutable and contains only the canonical rows.
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(1);
  await expect(result.getByRole('button')).toHaveCount(1);
  await expect(result.getByRole('button', { name: 'Continue' })).toBeFocused();
  const commitResult = await captureViewport(page, browser, {
    fileName: 'v02-wi-05-e04-evacuated-result.png',
    state: 'Committed EVACUATED Mission Result Overlay',
    setup: 'Presented only after the shared Evacuation exit left the viewport',
    acIds: ['V02-AC-015', 'V02-AC-023'],
  });

  const rows = await readFieldRows(result);
  expect([...rows.keys()]).toEqual([
    'Destroyed',
    'Escaped',
    'Net combat rewards',
    'Retained 50%',
    'Credits earned',
  ]);
  expect(rows.get('Destroyed')).toBe(
    formatRoleCounts(atZero.destroyedEnemiesByType),
  );
  expect(rows.get('Escaped')).toBe(
    formatRoleCounts(atZero.escapedEnemiesByType),
  );
  expect(rows.get('Net combat rewards')).toBe(
    `+${atZero.pendingCombatRewards} Credits`,
  );
  const retained = retainedCredits(
    atZero.pendingCombatRewards,
    atZero.pendingEscapePenalties,
  );
  expect(rows.get('Retained 50%')).toBe(`+${retained} Credits`);
  expect(rows.get('Credits earned')).toBe(`${retained} Credits`);
  await expect(result).toContainText('Mission not completed');
  await expect(result.getByText('Completion reward')).toHaveCount(0);
  await expect(result.getByText('Mission unlocked')).toHaveCount(0);
  await expect(result.getByText('Mission reward')).toHaveCount(0);
  await expect(result.getByText('Repair cost')).toHaveCount(0);

  // The presented result owns the screen on its own: the Combat runtime, its
  // canvas, and the development observability surface are already gone (bounded
  // E04 cleanup observation, no extra state).
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  ).toBe('undefined');

  // The atomic campaign transaction committed exactly one Evacuation: retained
  // Hull, retained 50% payout, no completion, no unlock, no active mission.
  const persisted = await readCampaignRow(page);
  expect(persisted.value.credits).toBe(12 + retained);
  expect(persisted.value.hullIntegrity).toBe(atZero.playerHullIntegrity);
  expect(persisted.value.missionInProgress).toBeNull();
  expect(persisted.value.completedMissionIds).toEqual([]);
  expect(persisted.value.unlockedMissionIds).toEqual(['interception-01']);

  // Continue returns to Operations with no completion, no unlock, and no second
  // economy mutation.
  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(`Credits: ${12 + retained}`)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Locked)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 01 (Completed)' }),
  ).toHaveCount(0);
  const afterContinue = await readCampaignRow(page);
  expect(afterContinue.value.credits).toBe(12 + retained);
  expect(afterContinue.value.completedMissionIds).toEqual([]);
  expect(afterContinue.value.unlockedMissionIds).toEqual(['interception-01']);

  commitCluster();
  commitConfirmation();
  commitCountdown();
  commitResult();
  expect(pageErrors).toEqual([]);
});

test('a failed Evacuation terminal write opens the exact Save Error and Retry Save commits the same frozen payload exactly once (V02-AC-020/023, Epic §13.7)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);
  await waitForMissionTime(page, 5.5);

  const utility = page.getByTestId('combat-utility');
  const countdown = page.locator('.ds-combat-countdown');
  await utility.getByRole('button', { name: 'Evacuate' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();

  // Development/IndexedDB seam already used by the browser recovery tests: the
  // durable campaign row is removed while the commitment runs, so the terminal
  // transaction reports `failed`.
  const originalRow = await readCampaignRow(page);
  expect(originalRow.value.credits).toBe(12);
  await installEvacuationTimeline(page);
  await confirmation
    .getByRole('button', { name: 'Confirm Evacuation' })
    .click();
  await deleteCampaignRow(page);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Save Error' })).toBeVisible(
    {
      timeout: 25000,
    },
  );
  await expect(dialog).toContainText(
    'Mission result could not be saved. Combat remains paused.',
  );
  const retry = dialog.getByRole('button', { name: 'Retry Save' });
  await expect(retry).toBeFocused();

  // Combat is terminal and frozen: the zero step stays on screen, no exit
  // started, and no result exists.
  await expect(countdown).toHaveText('EVACUATION 00:00');
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(0);
  const frozen = await readObservability(page);

  // Esc cannot close the only continuation.
  await page.keyboard.press('Escape');
  await expect(
    dialog.getByRole('heading', { name: 'Save Error' }),
  ).toBeVisible();
  // Repeated Retry with the row still missing stays Save Error (single-flight).
  await retry.click();
  await expect(
    dialog.getByRole('heading', { name: 'Save Error' }),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(countdown).toHaveText('EVACUATION 00:00');
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(0);

  // Restore the exact durable row and Retry: the SAME frozen payload commits
  // once, and only then does the shared exit run.
  await writeCampaignRow(page, originalRow);
  const retryStartedAt = await page.evaluate(() => window.performance.now());
  await retry.click();
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toBeVisible({
    timeout: 20000,
  });
  const timeline = await readEvacuationTimeline(page);
  expect(timeline).not.toBeNull();
  if (timeline === null) {
    throw new Error('Evacuation exit timeline unavailable');
  }
  expect(timeline.zeroAt).not.toBeNull();
  expect(timeline.resultAt).not.toBeNull();
  if (timeline.resultAt === null || timeline.zeroAt === null) {
    throw new Error('Evacuation exit timeline incomplete');
  }
  // The shared exit started only after the successful Retry Save and ran to
  // completion before the result appeared.
  expect(timeline.resultAt - retryStartedAt).toBeGreaterThanOrEqual(900);
  // The presented result replaces the Combat runtime: no canvas, HUD,
  // countdown, or development observability surface survives it.
  await expect(countdown).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  ).toBe('undefined');

  // The presented result is the SAME frozen Evacuated payload captured at the
  // zero step — never a re-derived economy.
  const result = page.getByRole('dialog');
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(1);
  await expect(result).toContainText('Mission not completed');
  const expectedRetained = retainedCredits(
    frozen.pendingCombatRewards,
    frozen.pendingEscapePenalties,
  );
  const rows = await readFieldRows(result);
  expect(rows.get('Destroyed')).toBe(
    formatRoleCounts(frozen.destroyedEnemiesByType),
  );
  expect(rows.get('Escaped')).toBe(
    formatRoleCounts(frozen.escapedEnemiesByType),
  );
  expect(rows.get('Net combat rewards')).toBe(
    `+${frozen.pendingCombatRewards} Credits`,
  );
  expect(rows.get('Retained 50%')).toBe(`+${expectedRetained} Credits`);
  expect(rows.get('Credits earned')).toBe(`${expectedRetained} Credits`);
  expect(parseCredits(rows.get('Credits earned'))).toBe(expectedRetained);

  // Exactly one committed terminal transaction: one payout, no completion, no
  // unlock, no active mission.
  const persisted = await readCampaignRow(page);
  expect(persisted.value.credits).toBe(12 + expectedRetained);
  expect(persisted.value.missionInProgress).toBeNull();
  expect(persisted.value.completedMissionIds).toEqual([]);
  expect(persisted.value.unlockedMissionIds).toEqual(['interception-01']);

  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(
    page.getByText(`Credits: ${12 + expectedRetained}`),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('an inert Evacuation terminal commit opens the exact Reload-only Save Conflict and never starts the exit or shows a result (V02-AC-020, Epic §13.7)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);
  await waitForMissionTime(page, 2);

  const utility = page.getByTestId('combat-utility');
  const countdown = page.locator('.ds-combat-countdown');
  const before = await readCampaignRow(page);
  await utility.getByRole('button', { name: 'Evacuate' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();

  // Clear the durable mission marker so the atomic transition owns nothing to
  // resolve (forces `inert`).
  await clearMissionMarker(page);
  await confirmation
    .getByRole('button', { name: 'Confirm Evacuation' })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Save Conflict' }),
  ).toBeVisible({
    timeout: 25000,
  });
  await expect(dialog).toContainText(
    'Campaign data changed in another session. Reload to continue.',
  );
  const reload = dialog.getByRole('button', { name: 'Reload' });
  await expect(reload).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Retry Save' })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole('button', { name: 'Resume' })).toHaveCount(0);

  // An inert commit never starts the exit or presents a result.
  await expect(countdown).toHaveText('EVACUATION 00:00');
  await page.keyboard.press('Escape');
  await expect(
    dialog.getByRole('heading', { name: 'Save Conflict' }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(
    dialog.getByRole('heading', { name: 'Save Conflict' }),
  ).toBeVisible();
  await expect(countdown).toHaveText('EVACUATION 00:00');
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  // No local reward, result, campaign mutation, or unlock exists.
  const during = await readCampaignRow(page);
  expect(during.value.credits).toBe(before.value.credits);
  expect(during.value.completedMissionIds).toEqual([]);
  expect(during.value.unlockedMissionIds).toEqual(['interception-01']);

  // Reload is browser navigation only: Base opens with no cost, reward, unlock,
  // or result.
  await reload.click();
  await expect(page.getByTestId('operations-screen')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText(`Credits: ${before.value.credits}`),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Locked)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 01 (Completed)' }),
  ).toHaveCount(0);
  const afterReload = await readCampaignRow(page);
  expect(afterReload.value.credits).toBe(before.value.credits);
  expect(afterReload.value.missionInProgress).toBeNull();
  expect(afterReload.value.completedMissionIds).toEqual([]);
  expect(afterReload.value.unlockedMissionIds).toEqual(['interception-01']);
  expect(pageErrors).toEqual([]);
});

test('after Continue from EVACUATED there is no Combat residue and one subsequent mission creates exactly one fresh owner (V02-AC-027 bounded E04 checkpoint, V02-AC-023)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  const utility = page.getByTestId('combat-utility');
  const countdown = page.locator('.ds-combat-countdown');
  const startRow = await readCampaignRow(page);
  await utility.getByRole('button', { name: 'Evacuate' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Confirm Evacuation' })
    .click();

  await expect
    .poll(async () => (await countdown.textContent()) ?? '', {
      timeout: 30000,
      intervals: [50, 100],
    })
    .toBe('EVACUATION 00:00');
  const atZero = await readObservability(page);
  const expectedRetained = retainedCredits(
    atZero.pendingCombatRewards,
    atZero.pendingEscapePenalties,
  );
  const result = page.getByRole('dialog');
  await expect(result.getByRole('heading', { name: 'EVACUATED' })).toBeVisible({
    timeout: 15000,
  });
  await expect(result).toContainText('Mission not completed');
  const rows = await readFieldRows(result);
  expect(parseCredits(rows.get('Credits earned'))).toBe(expectedRetained);

  // Exactly one committed transaction before the cleanup observations.
  const committed = await readCampaignRow(page);
  expect(committed.value.credits).toBe(
    startRow.value.credits + expectedRetained,
  );
  expect(committed.value.missionInProgress).toBeNull();

  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(
    page.getByText(`Credits: ${startRow.value.credits}`),
  ).toBeVisible();

  // Complete post-Combat residue matrix from live DOM/runtime observations.
  await expect(page.getByTestId('combat-screen')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(countdown).toHaveCount(0);
  await expect(page.locator('.ds-overlay')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  ).toBe('undefined');

  // No retained Combat listener responds after the runtime is gone.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>)['hidden'];
  });

  // No duplicated terminal/result effect: no second payout, completion, or
  // unlock from the consumed result.
  const afterContinue = await readCampaignRow(page);
  expect(afterContinue.value.credits).toBe(
    startRow.value.credits + expectedRetained,
  );
  expect(afterContinue.value.completedMissionIds).toEqual([]);
  expect(afterContinue.value.unlockedMissionIds).toEqual(['interception-01']);

  // One subsequent available (replay) mission creates exactly one fresh
  // canvas/owner/HUD and exactly one lifecycle response.
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
  await expect(countdown).toHaveCount(1);
  await expect(page.getByTestId('combat-utility')).toHaveCount(1);
  await expect(
    page.getByTestId('combat-utility').getByRole('button'),
  ).toHaveCount(3);
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  ).toBe('function');
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Paused' }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Resume' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  await expect(countdown).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
