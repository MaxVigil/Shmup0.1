import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V02-WI-04 C02 terminal-persistence recovery — deterministic browser wiring
 * evidence (Epic §13.3/§13.5, V02-AC-020; DS §8.24). The commit of the
 * authoritative terminal result reports one typed outcome:
 *
 * - `failed` (the persisted campaign row is missing/invalid at commit time)
 *   opens the blocking Save Error overlay; `Retry Save` re-runs the SAME
 *   frozen terminal payload through the idempotent command and closes Save
 *   Error only when the commit actually succeeds — a repeated failure keeps
 *   Save Error open and may be retried again (single-flight);
 * - `inert` (the durable mission marker no longer belongs to this attempt)
 *   opens the blocking Save Conflict overlay; `Reload` is the only
 *   continuation and performs browser navigation without any local reward,
 *   result, campaign mutation, or exit animation.
 *
 * The campaign is persisted through IndexedDB (`shmup-v0.2`/`campaign`/
 * `current`); the tests delete or rewrite that record while Combat is paused
 * in the Debug Overlay to force the exact command outcomes deterministically.
 * Reducer permutations and the outcome mapping are unit-covered.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const DB_NAME = 'shmup-v0.2';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

async function startCombat(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

/** Reads the raw persisted campaign row envelope through IndexedDB. */
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

/** Writes an exact row envelope back (restores the deleted campaign). */
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

test('a failed terminal commit opens Save Error; repeated Retry keeps it open, and Retry after the record is restored commits and resolves the Defeat (V02-WI-04 C02, V02-AC-020)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // Freeze the sim in Debug, then delete the campaign record so the commit
  // cannot find the durable transition (forces `failed`).
  await page.keyboard.press('F1');
  const originalRow = await readCampaignRow(page);
  expect(originalRow).not.toBeUndefined();
  await deleteCampaignRow(page);

  // Force the terminal: the commit reports `failed`, so no result is
  // dispatched and the blocking Save Error overlay is the only surface.
  await page.getByRole('button', { name: 'Lose Mission' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Save Error' }),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      'Mission result could not be saved. Combat remains paused.',
    ),
  ).toBeVisible();
  const retry = dialog.getByRole('button', { name: 'Retry Save' });
  await expect(retry).toBeFocused();

  // Esc must not close the only continuation point.
  await page.keyboard.press('Escape');
  await expect(
    dialog.getByRole('heading', { name: 'Save Error' }),
  ).toBeVisible();

  // The record is still missing, so a Retry fails again and Save Error stays
  // open (the frozen payload is re-run, single-flight, and may be retried).
  await retry.click();
  await expect(
    dialog.getByRole('heading', { name: 'Save Error' }),
  ).toBeVisible();

  // Restore the durable row and Retry: the commit now succeeds, the Defeat
  // resolves immediately (v0.1 seam), and the Result Overlay is the only
  // continuation point.
  await writeCampaignRow(page, originalRow);
  await retry.click();
  await expect
    .poll(
      async () => {
        if ((await dialog.count()) === 0) {
          return null;
        }
        return dialog.getByRole('heading').textContent();
      },
      { timeout: 5000 },
    )
    .toBe('Mission Failed');

  expect(pageErrors).toEqual([]);
});

test('an inert terminal commit opens Save Conflict and Reload is the only continuation (V02-WI-04 C02, V02-AC-020)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // Freeze the sim in Debug, then clear the durable mission marker so the
  // atomic transition sees no owned mission to resolve (forces `inert`).
  await page.keyboard.press('F1');
  await clearMissionMarker(page);

  await page.getByRole('button', { name: 'Lose Mission' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Save Conflict' }),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      'Campaign data changed in another session. Reload to continue.',
    ),
  ).toBeVisible();
  const reload = dialog.getByRole('button', { name: 'Reload' });
  await expect(reload).toBeFocused();

  // Esc must not close Save Conflict; no Retry/Resume/Return exists.
  await page.keyboard.press('Escape');
  await expect(
    dialog.getByRole('heading', { name: 'Save Conflict' }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Retry Save' })).toHaveCount(
    0,
  );

  // Reload performs browser navigation back to Base: no combat canvas, no
  // result overlay, and no reward/result was ever produced locally.
  await reload.click();
  await expect(page.getByTestId('combat-screen')).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(
    page.getByRole('button', { name: 'Interception 01' }),
  ).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test('a committed Success that resolves while the tab is hidden is held by the Resume-only terminal-exit Pause (V02-WI-04 C03, V02-AC-019/023)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // Freeze the sim in Debug, then delete the durable campaign record so the
  // forced Success commit reports `failed` (opens Save Error with Retry).
  await page.keyboard.press('F1');
  const originalRow = await readCampaignRow(page);
  expect(originalRow).not.toBeUndefined();
  await deleteCampaignRow(page);

  // Force a Success terminal: the commit fails and the blocking Save Error
  // overlay opens with Retry Save as the only continuation.
  await page.getByRole('button', { name: 'Win Mission' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Save Error' }),
  ).toBeVisible();

  // A browser-safety event while Save Error is open latches manual Resume
  // WITHOUT closing the Overlay; the retry commit may still resolve later.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(
    dialog.getByRole('heading', { name: 'Save Error' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Retry Save' }),
  ).toBeFocused();

  // Restore the durable row and Retry Save: the commit now succeeds while the
  // safety latch is set, so Save Error closes into the terminal-exit Pause
  // instead of automatically starting the committed exit.
  await writeCampaignRow(page, originalRow);
  await dialog.getByRole('button', { name: 'Retry Save' }).click();
  await expect(dialog.getByRole('heading', { name: 'Paused' })).toBeVisible({
    timeout: 5000,
  });
  await expect(
    dialog.getByText(
      'Mission result saved. Combat remains paused — select Resume to finish.',
    ),
  ).toBeVisible();
  const resume = dialog.getByRole('button', { name: 'Resume' });
  await expect(resume).toBeFocused();

  // After the immutable Success commit no invalid post-commit action exists:
  // no Return to Base, Settings, Debug, Retry, Reload, or result action.
  await expect(
    dialog.getByRole('button', { name: 'Return to Base' }),
  ).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Retry Save' })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole('button', { name: 'Reload' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Settings' })).toHaveCount(0);

  // Returning to the foreground does NOT auto-resume the committed exit.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(dialog.getByRole('heading', { name: 'Paused' })).toBeVisible();

  // Only the explicit Resume starts the committed Success exit, and the
  // result commits exactly once.
  await resume.click();
  await expect
    .poll(
      async () => {
        if ((await dialog.count()) === 0) {
          return null;
        }
        return dialog.getByRole('heading').textContent();
      },
      { timeout: 8000 },
    )
    .toBe('MISSION COMPLETE');
  await expect(
    page.getByRole('heading', { name: 'MISSION COMPLETE' }),
  ).toHaveCount(1);

  expect(pageErrors).toEqual([]);
});
