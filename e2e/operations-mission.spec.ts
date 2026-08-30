import { expect, test } from '@playwright/test';

/**
 * S05 Operations and Mission Details (Base AC-007–014, AC-031, AC-035;
 * DS-AC-005/006/007/014). The real application is exercised at the minimum
 * supported viewport.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

test('Operations renders background, three Mission Points, Credits Panel, and Settings (Base AC-007, Epic §6.1, V02-AC-001)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // A New Game shows exactly the three visible points: 01 available, 02 and 03
  // locked (V02-AC-001).
  await expect(
    page.getByRole('button', { name: 'Interception 01' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Locked)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 03 (Locked)' }),
  ).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();

  // The three points share the horizontal content centre and are vertically
  // distinct within the foreground content area (the viewport safe area right
  // of Base Navigation); the middle point sits at the content 50% height.
  const layout = await page.evaluate(() => {
    const nav = document.querySelector('.ds-base-navigation');
    const points = Array.from(
      document.querySelectorAll<HTMLElement>('.ds-mission-point'),
    );
    if (nav === null || points.length !== 3) {
      return null;
    }
    return points.map((point) => {
      const rect = point.getBoundingClientRect();
      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    });
  });
  expect(layout).not.toBeNull();
  const contentCenterX =
    (await page.evaluate(() => {
      const nav = document.querySelector('.ds-base-navigation');
      return (
        (nav?.getBoundingClientRect().right ?? 0) +
        (window.innerWidth - (nav?.getBoundingClientRect().right ?? 0)) / 2
      );
    })) ?? 0;
  for (const point of layout!) {
    expect(point.centerX).toBeGreaterThan(contentCenterX - 4);
    expect(point.centerX).toBeLessThan(contentCenterX + 4);
  }
  // Vertical order: 01 (top), 02 (middle at 50%), 03 (bottom).
  expect(layout![0]!.centerY).toBeLessThan(layout![1]!.centerY);
  expect(layout![1]!.centerY).toBeLessThan(layout![2]!.centerY);
  const contentCenterY = await page.evaluate(() => window.innerHeight / 2);
  expect(layout![1]!.centerY).toBeGreaterThan(contentCenterY - 4);
  expect(layout![1]!.centerY).toBeLessThan(contentCenterY + 4);
});

test('a failed background keeps the solid dark fallback with functional controls (Base AC-008)', async ({
  page,
}) => {
  await page.route('**/backgrounds/operations-background.webp', (route) =>
    route.abort(),
  );
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  const background = page.locator('.ds-operations-background');
  expect(await background.evaluate((el) => el.style.backgroundImage)).toBe('');
  // The mission point and Credits stay functional.
  await expect(
    page.getByRole('button', { name: 'Interception 01' }),
  ).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('selecting the Mission Point opens Mission Details and blocks the underlying screen (Base AC-009)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Interception 01' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // The blocking Overlay makes the underlying Navigation non-interactive.
  await page.getByRole('button', { name: 'Hangar' }).click({ force: true });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('hangar-screen')).toBeHidden();
});

test('Mission Details content and action order match the spec (Base AC-010, DS §8.17)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Interception 01' }),
  ).toBeVisible();
  await expect(
    dialog.getByText('Resolve the incoming enemy wave.'),
  ).toBeVisible();
  await expect(dialog.getByText('Reward')).toBeVisible();
  await expect(dialog.getByText('8 Credits')).toBeVisible();
  const start = dialog.getByRole('button', { name: 'Start Mission' });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await expect(start).toBeVisible();
  await expect(cancel).toBeVisible();
  expect(await dialog.locator('button').count()).toBe(2);
  await expect(
    dialog.getByRole('button', { name: 'Open Hangar' }),
  ).toBeHidden();
  // Start Mission is placed on the left, Cancel on the right.
  const startBox = await start.boundingBox();
  const cancelBox = await cancel.boundingBox();
  expect(startBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(startBox!.x).toBeLessThan(cancelBox!.x);
});

test('initial focus in Mission Details is Start Mission (DS §10.4)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(
    page.getByRole('button', { name: 'Start Mission' }),
  ).toBeFocused();
});

test('Cancel and Esc close Mission Details and leave Operations unchanged (Base AC-011)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
});

test('clicking outside Mission Details does not close it (Base AC-012)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.mouse.click(10, 10);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Start Mission crosses into Combat without spending Credits (Base AC-013, §5.5; S07)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const start = page.getByRole('button', { name: 'Start Mission' });
  await start.click();
  // Base UI closes and Combat opens; Credits are untouched.
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.getByTestId('operations-screen')).toBeHidden();
  await expect(page.getByText('Credits: 12')).not.toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('locked Mission Points are skipped in keyboard focus order and can never reach Mission Details (Epic §6.1, DS §10.3, V02-AC-001)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Focus starts on the active Operations Navigation Item after Boot
  // (DS-AC-015). Tab moves through the available Mission Point (01); disabled
  // locked points (02/03) are skipped by sequential focus (DS §10.3).
  await page.getByRole('button', { name: 'Interception 01' }).focus();
  await expect(
    page.getByRole('button', { name: 'Interception 01' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  // The next focusable control after the available Mission Point is Settings:
  // the two disabled locked markers are omitted from the sequential order.
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();

  // The locked marker is disabled and cannot be activated by keyboard or
  // pointer to open Mission Details.
  const locked = page.getByRole('button', {
    name: 'Interception 03 (Locked)',
  });
  await expect(locked).toBeDisabled();
  await locked.click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('no document overflow on Operations or with Mission Details open at 1280x600 (Base AC-041, DS-AC-007)', async ({
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
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await noOverflow()).toBe(true);
});
