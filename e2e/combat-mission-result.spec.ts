import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S12 Mission Resolution and Return Loop — minimal wiring-level browser
 * evidence (Base §9.5, AC-032/033, MASTER-AC-005; v0.2 §12.4/§13.5/§15.4,
 * V02-AC-016/020). V02-WI-04 authored M01 staging (first arrival at 10 s)
 * removes the legacy natural early-Defeat seed; the deterministic dev-only
 * Debug `Lose Mission` action enters the same typed terminal-result relay the
 * v0.2 Defeat contract replaces. V02-WI-05 C03: the committed Defeat returns
 * through the lifecycle boundary and opens the paid full-Repair Result Overlay
 * only after the campaign transaction reports `committed` (no navigation
 * before the browser-safety boundary evaluates it). The test proves the
 * Defeat Mission Result Overlay opens and blocks with `MISSION FAILED`, the
 * `-8 Credits` Repair cost and full Hull 100 repair are committed, Continue
 * returns to Operations with Credits 12 − 8 = 4 and permits another mission
 * with a fresh runtime, and there are no page errors or duplicate canvases.
 * Exact result precedence, one-time commitment, Credit/Hull effects, and
 * duplicate-signal resistance are unit-covered.
 */
const DEFEAT_SESSION_SEED = 19023;

/** Approved runtime asset requests (Boot manifest): must not repeat across the
 *  mission repeat loop (S12-WI01 browser evidence). */
const RUNTIME_ASSET_REQUEST = /.*\/(fonts|icons|backgrounds|aircraft)\/.*/;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
});

async function startCombatWithSeed(
  page: Page,
  sessionSeed: number,
): Promise<void> {
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(value >>> 0);
        return array;
      }
      return original(array);
    };
  }, sessionSeed);
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

test(
  'a Defeat opens the paid full-Repair Result Overlay and Continue returns to Operations for the next mission',
  // The Debug-forced terminal commits deterministically; the committed Defeat
  // resolves through the lifecycle boundary once the campaign transaction
  // reports `committed`.
  {
    annotation: {
      type: 'runtime-budget',
      description: 'Natural fixed-step mission uses a 60 s test budget.',
    },
  },
  async ({ page }) => {
    test.setTimeout(60_000);

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const assetRequests: string[] = [];
    page.on('request', (request) => {
      if (RUNTIME_ASSET_REQUEST.test(request.url())) {
        assetRequests.push(request.url());
      }
    });

    await startCombatWithSeed(page, DEFEAT_SESSION_SEED);
    const requestsAfterFirstCombat = assetRequests.length;

    // The dev-only Debug `Lose Mission` action enters the normal terminal
    // relay: the paid full-Repair Result Overlay opens as the only
    // continuation point (v0.2 §15.4).
    await page.keyboard.press('F1');
    await page.getByRole('button', { name: 'Lose Mission' }).click();
    const dialog = page.getByRole('dialog');
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
      .toBe('MISSION FAILED');
    await expect(dialog.getByText('Reward')).toBeVisible();
    await expect(dialog.getByText('0 Credits')).toBeVisible();
    await expect(dialog.getByText('Repair cost')).toBeVisible();
    await expect(dialog.getByText('-8 Credits')).toBeVisible();
    const continueButton = dialog.getByRole('button', { name: 'Continue' });
    await expect(continueButton).toBeFocused();

    // Esc must not close the only continuation point.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(continueButton).toBeFocused();

    // While the Result is pending, Settings is disabled and command-guarded:
    // programmatic activation cannot create a second blocking Overlay.
    const settingsButton = page.getByRole('button', { name: 'Settings' });
    await expect(settingsButton).toBeDisabled();
    await settingsButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(
      0,
    );
    await expect(dialog).toBeVisible();

    // Navigation and Start Mission beneath the pending Result cannot bypass or
    // mutate the flow: programmatic activation of the underlying controls is
    // rejected by the command guards, and the blocking Overlay stays.
    await page.getByRole('button', { name: 'Hangar' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await expect(dialog).toBeVisible();
    await page
      .getByRole('button', { name: 'Interception 01' })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
      });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('combat-screen')).toHaveCount(0);

    // Continue returns to Operations with the committed paid-Repair Defeat
    // state: 12 starting Credits − 8 Repair cost = 4.
    await continueButton.click();
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await expect(page.getByText('Credits: 4')).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // The Mission Point is available again: start the next mission.
    await page.getByRole('button', { name: 'Interception 01' }).click();
    await page.getByRole('button', { name: 'Start Mission' }).click();
    await expect(page.getByTestId('combat-screen')).toBeVisible();
    await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
      timeout: 15000,
    });

    // The committed full-Repair Hull (100) drives the accessible Bar, and the
    // fresh runtime produced no stale Combat input or page errors.
    await expect
      .poll(
        async () =>
          page.locator('.ds-combat-hud__track').getAttribute('aria-valuenow'),
        {
          timeout: 5000,
        },
      )
      .toBe('100');
    await expect(page.locator('.ds-combat-hud')).toHaveCount(1);

    // The approved runtime assets are not requested again across the repeat loop:
    // the Boot manifest requests happened once before the first mission and the
    // fresh Combat runtime served the retained prepared texture without refetch.
    expect(assetRequests.length).toBe(requestsAfterFirstCombat);
    expect(pageErrors).toEqual([]);
  },
);
