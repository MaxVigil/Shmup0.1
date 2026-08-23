import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S13 Pause, Debug and Browser Lifecycle — proportional browser-owned evidence
 * (Combat AC-037–046, AC-052, AC-063–069, AC-079–080; MASTER-AC-008/009;
 * DELIVERY-AC-003). The development project (port 4173) exercises the Debug
 * surface; the production project (port 4174) proves F1 has no effect and the
 * Debug UI is excluded. Blur/visibility/effective-resize safety pause,
 * Settings restoration, Return to Base, refresh reset, and duplicate-canvas/
 * page-error hygiene are covered in both projects. Reducer permutations,
 * pause freeze, held-input hygiene, and Debug transforms are unit-covered.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Opens the real application and starts one Interception mission, waiting for
 *  the settled single Combat canvas (the dev StrictMode transient is disposed). */
async function startCombat(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
}

/** Reads the Field Row value for a Debug observability label. */
async function fieldValue(
  dialog: ReturnType<Page['getByRole']>,
  label: string,
): Promise<string> {
  const text =
    (await dialog.locator('.ds-field-row', { hasText: label }).textContent()) ??
    '';
  return text.replace(label, '').trim();
}

test('utility cluster and Pause Button/P/Esc open and resume the Pause Overlay (Combat AC-052, AC-079)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  const utility = page.getByTestId('combat-utility');
  await expect(utility.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(utility.getByRole('button', { name: 'Settings' })).toBeVisible();

  // The Pause Button opens the same Overlay as P/Esc; Resume is the initial
  // focus and the action row offers Return to Base.
  await utility.getByRole('button', { name: 'Pause' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Paused' })).toBeVisible();
  const resume = dialog.getByRole('button', { name: 'Resume' });
  await expect(resume).toBeFocused();
  await expect(
    dialog.getByRole('button', { name: 'Return to Base' }),
  ).toBeVisible();

  // Esc resumes the same runtime — no new canvas.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);

  // P toggles Pause both ways.
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Tab alone must not pause (focus movement only).
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test('Return to Base resolves Aborted with no reward and opens Operations directly (Combat AC-037)', async ({
  page,
}) => {
  await startCombat(page);
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to Base' }).click();

  // Operations opens directly; no Result Overlay and no reward.
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Credits: 1')).toBeVisible();

  // The current Combat Hull is retained and the mission is available again.
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect
    .poll(
      () => page.locator('.ds-combat-hud__track').getAttribute('aria-valuenow'),
      { timeout: 5000 },
    )
    .toBe('100');
});

test('Combat Settings reuses the shared Overlay, pauses, and resumes on Close (Combat AC-038, AC-063)', async ({
  page,
}) => {
  await startCombat(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const checkbox = dialog.getByRole('checkbox', {
    name: 'Mouse Movement Enabled',
  });
  await expect(checkbox).toBeChecked();

  // P is ignored while Settings is open (Combat §10.1, AC-063).
  await page.keyboard.press('KeyP');
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // Close resumes the same runtime.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
});

test('blur, hidden tab, and effective resize open one safety Pause and require Resume (Combat AC-044-045, AC-066-067)', async ({
  page,
}) => {
  await startCombat(page);

  // Blur during running Combat opens one Pause Overlay; Resume is required.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // A hidden tab latches the same one-Overlay behavior.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // An effective resize during running Combat pauses (AC-045) and reprojects.
  await page.setViewportSize({ width: 1500, height: 800 });
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Settings + blur latches manual Resume: closing Settings opens Pause.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
});

test('page refresh discards the session without reward and initializes Operations (Combat AC-046)', async ({
  page,
}) => {
  await startCombat(page);
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 1')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);

  // Hull 100 and the default weapon with the mission available after refresh.
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect
    .poll(
      () => page.locator('.ds-combat-hud__track').getAttribute('aria-valuenow'),
      { timeout: 5000 },
    )
    .toBe('100');
});

test('development F1 opens Debug, its actions mutate the paused simulation, and it resumes on close (Combat AC-039, AC-041-042, AC-061)', async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== 'development',
    'Debug is development-only',
  );
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startCombat(page);

  // F1 opens Debug from running Combat and pauses.
  await page.keyboard.press('F1');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Debug' })).toBeVisible();
  await expect(dialog.getByText('Mission Time')).toBeVisible();
  await expect(dialog.getByText('Player Hull')).toBeVisible();

  // God Mode is a canonical Checkbox.
  const godMode = dialog.getByRole('checkbox', { name: 'God Mode' });
  await expect(godMode).not.toBeChecked();

  // Set Hull: 100 changes the observable Player Hull immediately.
  await dialog.getByRole('button', { name: 'Set Hull: 100' }).click();
  await expect(
    dialog.locator('.ds-field-row', { hasText: 'Player Hull' }),
  ).toContainText('100');

  // Enabling God Mode sets Hull to maximum and disables the Hull controls.
  await godMode.check({ force: true });
  await expect(godMode).toBeChecked();
  await expect(
    dialog.getByRole('button', { name: 'Set Hull: 25' }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Set Hull: 100' }),
  ).toBeDisabled();

  // Spawn Standard Enemy adds exactly one drone (Active Enemies +1).
  const activeBefore = Number(await fieldValue(dialog, 'Active Enemies'));
  await dialog.getByRole('button', { name: 'Spawn Standard Enemy' }).click();
  const activeAfter = Number(await fieldValue(dialog, 'Active Enemies'));
  expect(activeAfter).toBe(activeBefore + 1);

  // Spawn Final Group is one-use and disables itself.
  const finalGroup = dialog.getByRole('button', { name: 'Spawn Final Group' });
  await finalGroup.click();
  await expect(finalGroup).toBeDisabled();

  // F1 closes Debug from the running origin and resumes.
  await page.keyboard.press('F1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test('development Debug Win/Lose enter the normal S12 result flow exactly once (Combat AC-043, AC-068)', async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== 'development',
    'Debug is development-only',
  );
  await startCombat(page);

  // Win Mission resolves as a normal one-time Success (+1 Credit).
  await page.keyboard.press('F1');
  await page.getByRole('button', { name: 'Win Mission' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mission Complete' }),
  ).toBeVisible();
  await expect(page.getByText('Reward')).toBeVisible();
  await expect(page.getByText('1 Credit')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 2')).toBeVisible();

  // A second mission can start on the same single page.
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);

  // Lose Mission resolves as a normal Defeat with emergency recovery to 25.
  await page.keyboard.press('F1');
  await page.getByRole('button', { name: 'Lose Mission' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mission Failed' }),
  ).toBeVisible();
  await expect(page.getByText('Reward')).toBeVisible();
  await expect(page.getByText('0 Credits')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 2')).toBeVisible();

  // The emergency recovery (25 Hull) drives the next mission's accessible Bar.
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect
    .poll(
      () => page.locator('.ds-combat-hud__track').getAttribute('aria-valuenow'),
      { timeout: 5000 },
    )
    .toBe('25');
});

test('production has no Debug UI, F1 has no effect, and no Debug label is reachable (DELIVERY-AC-003)', async ({
  page,
}) => {
  test.skip(
    test.info().project.name === 'development',
    'Production exclusion evidence',
  );
  await startCombat(page);
  await page.keyboard.press('F1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText(/God Mode|Win Mission|Lose Mission/i),
  ).toHaveCount(0);

  // The non-Debug lifecycle shell is unaffected in production.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
