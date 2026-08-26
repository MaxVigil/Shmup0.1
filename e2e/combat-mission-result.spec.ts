import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S12 Mission Resolution and Return Loop — minimal wiring-level browser
 * evidence (Base §9.5, AC-032/033, MASTER-AC-005). The session seed is fixed
 * through the existing crypto seed path so the natural mission produces a
 * deterministic Defeat at ~24 s (session seed 19023). The test proves the
 * Defeat Mission Result Overlay opens and blocks, Continue returns to
 * Operations with the committed state (Hull 25, Credits unchanged) and permits
 * another mission with a fresh runtime, and there are no page errors or
 * duplicate canvases. Exact result precedence, one-time commitment, Credit/Hull
 * effects, and duplicate-signal resistance are unit-covered.
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
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
}

test(
  'a natural Defeat opens the blocking Result Overlay and Continue returns to Operations for the next mission',
  // The natural mission simulates ~24 s under the fixed-step clock; under
  // parallel full-suite load the wall-clock Defeat poll can exceed the default
  // 30 s test budget, so this long-running simulation test gets an explicit
  // 60 s budget (the simulation, not the assertions, drives the duration).
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

    // The natural mission resolves in Defeat: the Mission Result Overlay opens
    // as the only continuation point.
    const dialog = page.getByRole('dialog');
    await expect
      .poll(
        async () => {
          if ((await dialog.count()) === 0) {
            return null;
          }
          return dialog.getByRole('heading').textContent();
        },
        { timeout: 50000 },
      )
      .toBe('Mission Failed');
    await expect(dialog.getByText('Reward')).toBeVisible();
    await expect(dialog.getByText('0 Credits')).toBeVisible();
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
      .getByRole('button', { name: 'Interception' })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
      });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('combat-screen')).toHaveCount(0);

    // Continue returns to Operations with the committed Defeat state.
    await continueButton.click();
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await expect(page.getByText('Credits: 1')).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // The Mission Point is available again: start the next mission.
    await page.getByRole('button', { name: 'Interception' }).click();
    await page.getByRole('button', { name: 'Start Mission' }).click();
    await expect(page.getByTestId('combat-screen')).toBeVisible();
    await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);

    // The retained emergency-recovery Hull (25) drives the accessible Bar, and
    // the fresh runtime produced no stale Combat input or page errors.
    await expect
      .poll(
        async () =>
          page.locator('.ds-combat-hud__track').getAttribute('aria-valuenow'),
        {
          timeout: 5000,
        },
      )
      .toBe('25');
    await expect(page.locator('.ds-combat-hud')).toHaveCount(1);

    // The approved runtime assets are not requested again across the repeat loop:
    // the Boot manifest requests happened once before the first mission and the
    // fresh Combat runtime served the retained prepared texture without refetch.
    expect(assetRequests.length).toBe(requestsAfterFirstCombat);
    expect(pageErrors).toEqual([]);
  },
);
