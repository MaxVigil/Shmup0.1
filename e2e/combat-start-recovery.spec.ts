import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V02-DEC-031 Mission Start Recovery Error — deterministic browser wiring
 * evidence (Epic §13.2, V02-AC-020; DS §8.26). After a Start Mission persisted
 * `missionInProgress`, the lazy Combat owner initialization is blocked while
 * the persisted row is made unreadable, so the exact originating-marker
 * cleanup cannot be proven safe:
 *
 * - the immutable attempt stays in a frozen non-interactive Combat shell with
 *   exactly the blocking Mission Start Recovery Error Overlay; Retry Cleanup
 *   owns initial focus, Esc is inert, no canvas/runtime exists, and Pause /
 *   Settings are disabled;
 * - restoring the exact durable row makes the same single-flight Retry
 *   Cleanup clear the originating marker and return to that mission's Mission
 *   Details with `Unable to start mission.`; a reload afterwards never deducts
 *   the 8-Credit Repair (no paid startup Defeat);
 * - a Retry Cleanup that discovers a durable authority mismatch transitions to
 *   the exact Save Conflict / Reload-only Overlay.
 * - the loaded Combat entry module reaches real owner construction (all prior
 *   resources are acquired) and fails through a narrow DEV-only seam; the
 *   recovery shell then has no canvas/HUD/development-owner residue and the
 *   same Retry Cleanup resolves without the paid-Defeat deduction.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const DB_NAME = 'shmup-v0.2';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

async function readCampaignRow(page: Page): Promise<unknown> {
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
    return row;
  }, DB_NAME);
}

async function writeCampaignRow(page: Page, value: unknown): Promise<void> {
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
    { dbName: DB_NAME, record: value },
  );
}

/** Blocks the lazy Combat entry long enough to corrupt the durable row. */
async function blockCombatEntry(page: Page): Promise<void> {
  await page.route('**/src/combat-presentation/entry.ts', async (route) => {
    // The mission-start transaction commits first; the delayed abort lets the
    // test deterministically rewrite the persisted row before cleanup runs.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.abort();
  });
}

async function startMissionWithBlockedEntry(page: Page): Promise<unknown> {
  await blockCombatEntry(page);
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect
    .poll(async () => {
      const row = (await readCampaignRow(page)) as {
        value?: { missionInProgress?: unknown };
      };
      return row.value?.missionInProgress ?? null;
    })
    .not.toBeNull();
  return readCampaignRow(page);
}
test('a failed Combat initialization with unprovable cleanup opens the blocking Mission Start Recovery Error; Retry Cleanup returns to Mission Details and reload never deducts (V02-DEC-031)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  const original = (await startMissionWithBlockedEntry(page)) as {
    value: { credits: number };
  };

  // Make the persisted campaign record unreadable so the exact cleanup cannot
  // be proven safe.
  await writeCampaignRow(page, {
    schemaVersion: 1,
    credits: 'not-a-credit-balance',
  });

  const recoveryHeading = page.getByRole('heading', {
    name: 'Mission Start Recovery Error',
  });
  await expect(recoveryHeading).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByText(
      'Combat could not start, and the active mission could not be cleared safely.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Retry cleanup to return to Mission Details.'),
  ).toBeVisible();
  const retryCleanup = page.getByRole('button', { name: 'Retry Cleanup' });
  await expect(retryCleanup).toBeFocused();

  // Frozen non-interactive Combat shell: no canvas/runtime, utility disabled,
  // Esc and P cannot close or replace the blocking Overlay.
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyP');
  await expect(recoveryHeading).toBeVisible();

  // Restore the exact durable row; the same single-flight Retry Cleanup then
  // clears the originating marker and reconciles to Mission Details.
  await writeCampaignRow(page, original.value);
  await retryCleanup.click();
  await expect(page.getByTestId('operations-screen')).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText('Unable to start mission.')).toBeVisible();

  // Reload after the safe cleanup never resolves the failed start as a paid
  // Defeat: the marker was cleared, so no 8-Credit deduction occurs.
  await page.unroute('**/src/combat-presentation/entry.ts');
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
});
test('the loaded Combat entry fails owner construction after acquiring resources; the recovery shell has no residue and Retry Cleanup returns to Mission Details with no paid-Defeat deduction (V02-DEC-031 C01/C02)', async ({
  page,
}) => {
  // DEV-only construction-failure seam: the module loads and the real
  // createCombatSession acquires the HUD bridge, simulation runtime, window
  // surfaces and store subscription, then fails before Phaser owner creation.
  await page.addInitScript(() => {
    (
      window as Window & {
        __shmupTestForceCombatConstructionFailure__?: boolean;
      }
    ).__shmupTestForceCombatConstructionFailure__ = true;
  });
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Delay the lazy entry response (without aborting it) so the durable row can
  // be corrupted after the mission-start marker commits but before the
  // cleanup transaction runs.
  await page.route('**/src/combat-presentation/entry.ts', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect
    .poll(async () => {
      const row = (await readCampaignRow(page)) as {
        value?: { missionInProgress?: unknown };
      };
      return row.value?.missionInProgress ?? null;
    })
    .not.toBeNull();
  const original = (await readCampaignRow(page)) as {
    value: { credits: number };
  };

  // Make the persisted record unreadable so the first exact cleanup cannot be
  // proven safe and the blocking Mission Start Recovery Error shell opens.
  await writeCampaignRow(page, {
    schemaVersion: 1,
    credits: 'not-a-credit-balance',
  });

  const recoveryHeading = page.getByRole('heading', {
    name: 'Mission Start Recovery Error',
  });
  await expect(recoveryHeading).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText('Retry cleanup to return to Mission Details.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry Cleanup' }),
  ).toBeFocused();

  // The real module-loaded construction failure leaves no canvas/HUD/bridge
  // runtime residue and no development-owner surface in the shell. The check
  // crosses the Playwright boundary as a serializable string: a live function
  // would serialize as 'function', so the assertion fails whenever owner
  // cleanup is removed (a boolean/typeof discriminator, never the function
  // value itself which Playwright would serialize as undefined).
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas .ds-combat-hud')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas > *')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  ).toBe('undefined');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeDisabled();

  // Restore the exact durable row; the single-flight Retry Cleanup clears the
  // originating marker and reconciles to Mission Details.
  await writeCampaignRow(page, original.value);
  await page.getByRole('button', { name: 'Retry Cleanup' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText('Unable to start mission.')).toBeVisible();

  // Reload after the safe cleanup never resolves the failed start as a paid
  // Defeat (marker cleared, so no 8-Credit deduction).
  await page.unroute('**/src/combat-presentation/entry.ts');
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
});

test('a Retry Cleanup that finds a durable authority mismatch transitions to the Save Conflict Overlay, which is Reload-only (V02-DEC-031)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  const original = (await startMissionWithBlockedEntry(page)) as {
    value: { missionInProgress: { missionId: string; attemptId: number } };
  };

  // Force the initial cleanup to fail exactly like the first scenario.
  await writeCampaignRow(page, {
    schemaVersion: 1,
    credits: 'not-a-credit-balance',
  });
  const recoveryHeading = page.getByRole('heading', {
    name: 'Mission Start Recovery Error',
  });
  await expect(recoveryHeading).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByRole('button', { name: 'Retry Cleanup' }),
  ).toBeFocused();

  // Durable authority now belongs to ANOTHER attempt of the same mission
  // while this application still owns the originating snapshot.
  await writeCampaignRow(page, {
    ...original.value,
    missionInProgress: {
      missionId: original.value.missionInProgress.missionId,
      attemptId: original.value.missionInProgress.attemptId + 1,
    },
  });
  await page.getByRole('button', { name: 'Retry Cleanup' }).click();
  await expect(
    page.getByRole('heading', { name: 'Save Conflict' }),
  ).toBeVisible({ timeout: 5000 });
  await expect(recoveryHeading).toHaveCount(0);
  await expect(
    page.getByText(
      'Campaign data changed in another session. Reload to continue.',
    ),
  ).toBeVisible();
  // Reload is the only continuation: Esc and P leave Save Conflict open and
  // the only action is Reload.
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyP');
  await expect(
    page.getByRole('heading', { name: 'Save Conflict' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
});
