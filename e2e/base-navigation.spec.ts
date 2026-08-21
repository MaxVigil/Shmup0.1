import { expect, test } from '@playwright/test';

/**
 * S04 Base Navigation and Settings (Base AC-002–006, AC-036, AC-039,
 * AC-041–042, AC-044–049, AC-051–052; DS-AC-005/006/007/013/014/015).
 * The real application is exercised at the minimum supported viewport.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

/** Approved Boot preload asset URL prefixes (preload.ts). */
const RUNTIME_ASSET_REQUEST = /.*\/(fonts|icons|backgrounds|aircraft)\/.*/;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

test('Base Navigation renders Operations then Hangar with the active state', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Base Navigation' });
  const operations = nav.getByRole('button', { name: 'Operations' });
  const hangar = nav.getByRole('button', { name: 'Hangar' });
  await expect(operations).toHaveAttribute('aria-current', 'page');
  await expect(hangar).not.toHaveAttribute('aria-current', 'page');
  // Each item carries an icon and a text label (Base AC-002); no future
  // navigation placeholders exist.
  expect(await nav.locator('button').count()).toBe(2);
  expect(await operations.locator('.ds-icon').count()).toBe(1);
  expect(await hangar.locator('.ds-icon').count()).toBe(1);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('selecting Hangar opens it and moves focus to its heading (Base AC-004, AC-052)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Hangar' }).click();

  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await expect(page.getByTestId('operations-screen')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Hangar' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const activeText = await page.evaluate(
    () => document.activeElement?.textContent ?? '',
  );
  expect(activeText).toBe('Hangar');
});

test('selecting the active navigation item does not reload or reset the Screen (Base AC-003)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Operations' }).click();

  // The same Screen remains current; no reload or transition occurred.
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  expect(await page.evaluate(() => document.readyState)).toBe('complete');
});

test('navigation retains the shared session state (Base AC-037, AC-039)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Turn the shared setting off through the Settings Overlay.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByText('Mouse Movement Enabled').click();
  await page.getByRole('button', { name: 'Close' }).click();

  // Navigate away and back: the retained value is still off (AC-039).
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Operations' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

test('Settings opens with the checkbox focused and only the two approved controls (Base AC-006, DS §10.4)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  // Initial focus is the Mouse Movement Enabled checkbox.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
    'INPUT',
  );
  await expect(page.getByRole('checkbox')).toBeFocused();
  expect(await dialog.locator('button, input').count()).toBe(2);
  await expect(page.getByRole('checkbox')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
});

test('toggling the setting updates the shared value immediately (Base AC-044)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox')).toBeChecked();

  await page.getByText('Mouse Movement Enabled').click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

test('Close and Esc close Settings without changing the Screen or the setting (Base AC-006)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByText('Mouse Movement Enabled').click();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Esc is equivalent to Close.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  // The changed setting was retained (Esc closes; it does not reset).
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

test('clicking outside the Settings Overlay does not close it (Base AC-006)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Click far outside the centred Overlay surface, on the Scrim.
  await page.mouse.click(10, 10);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Base Navigation is blocked while the Settings Overlay is open (Base AC-005)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // The Scrim intercepts the pointer over the Navigation item.
  await page.getByRole('button', { name: 'Hangar' }).click({ force: true });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByTestId('hangar-screen')).toBeHidden();
});

test('closing Settings restores focus to the Settings button (Base AC-051)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
});

test('Base sequential focus order is Navigation, Screen actions, then Settings (Base AC-049)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Measure the approved sequential order from the first focusable control:
  // Base Navigation (Operations, Hangar), Operations Screen action (Mission
  // Point), then Settings (Base §9.9).
  await page.getByRole('button', { name: 'Operations' }).focus();
  await expect(page.getByRole('button', { name: 'Operations' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Hangar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Interception' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
});

test('pressing F on Base has no control-mode or Settings effect (Base AC-045)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.keyboard.press('f');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox')).toBeChecked();
});

test('the setting resets to enabled after a page refresh (Base AC-039)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByText('Mouse Movement Enabled').click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();

  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox')).toBeChecked();
});

test('no horizontal document overflow on either Base Screen or the open Overlay at 1280x600 (Base AC-041)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  const noOverflow = async (): Promise<boolean> =>
    page.evaluate(() => {
      const doc = document.scrollingElement as HTMLElement;
      return (
        doc.scrollWidth <= doc.clientWidth &&
        doc.scrollHeight <= doc.clientHeight
      );
    });

  expect(await noOverflow()).toBe(true);
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  expect(await noOverflow()).toBe(true);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await noOverflow()).toBe(true);
});

test('resize and visibility changes preserve the Base Screen without repeated asset requests (Base AC-046, AC-047, AC-048)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const assetRequests: string[] = [];
  page.on('request', (request) => {
    if (RUNTIME_ASSET_REQUEST.test(request.url())) {
      assetRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  const requestsAfterBoot = assetRequests.length;

  // Resize within and beyond the minimum supported viewport and back.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Hidden-tab focus/visibility continuity: Base must not open Pause or change
  // the Screen or shared state (Base AC-046).
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // No repeated application asset requests, no Screen recreation, no errors.
  expect(assetRequests.length).toBe(requestsAfterBoot);
  expect(pageErrors).toEqual([]);
});

test('resize and visibility preserve an open Settings Overlay and its shared value (Base AC-046, AC-047, AC-048)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const assetRequests: string[] = [];
  page.on('request', (request) => {
    if (RUNTIME_ASSET_REQUEST.test(request.url())) {
      assetRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByText('Mouse Movement Enabled').click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await dialog.evaluate((element) => {
    element.setAttribute('data-continuity-probe', 'same-overlay');
  });
  const requestsAfterOpen = assetRequests.length;

  // Reflow above and below the supported minimum, then return. The open
  // Overlay remains the same DOM instance and retains its shared value.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.setViewportSize(MINIMUM_VIEWPORT);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-continuity-probe', 'same-overlay');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  expect(assetRequests.length).toBe(requestsAfterOpen);
  expect(pageErrors).toEqual([]);
});
