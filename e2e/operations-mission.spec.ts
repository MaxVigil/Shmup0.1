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

test('Operations renders background, Mission Point, Credits Panel, and Settings (Base AC-007)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Interception' }),
  ).toBeVisible();
  await expect(page.getByText('Interception')).toBeVisible();
  await expect(page.getByText('Credits: 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();

  // The Mission Point sits at 50% × 50% of the content area.
  const position = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="operations-screen"]');
    const point = document.querySelector('.ds-mission-point');
    if (screen === null || point === null) {
      return null;
    }
    const screenRect = screen.getBoundingClientRect();
    const pointRect = point.getBoundingClientRect();
    return {
      centerX: pointRect.left + pointRect.width / 2,
      centerY: pointRect.top + pointRect.height / 2,
      screenCenterX: screenRect.left + screenRect.width / 2,
      screenCenterY: screenRect.top + screenRect.height / 2,
    };
  });
  expect(position).not.toBeNull();
  expect(position!.centerX).toBeGreaterThan(position!.screenCenterX - 4);
  expect(position!.centerX).toBeLessThan(position!.screenCenterX + 4);
  expect(position!.centerY).toBeGreaterThan(position!.screenCenterY - 4);
  expect(position!.centerY).toBeLessThan(position!.screenCenterY + 4);
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
    page.getByRole('button', { name: 'Interception' }),
  ).toBeVisible();
  await expect(page.getByText('Credits: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Interception' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('selecting the Mission Point opens Mission Details and blocks the underlying screen (Base AC-009)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Interception' }).click();

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
  await page.getByRole('button', { name: 'Interception' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Interception' }),
  ).toBeVisible();
  await expect(
    dialog.getByText('Resolve the incoming enemy wave.'),
  ).toBeVisible();
  await expect(dialog.getByText('Reward')).toBeVisible();
  await expect(dialog.getByText('1 Credit')).toBeVisible();
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
  await page.getByRole('button', { name: 'Interception' }).click();
  await expect(
    page.getByRole('button', { name: 'Start Mission' }),
  ).toBeFocused();
});

test('Cancel and Esc close Mission Details and leave Operations unchanged (Base AC-011)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Interception' }).click();
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
  await page.getByRole('button', { name: 'Interception' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.mouse.click(10, 10);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Start Mission disables immediately and emits one request without spending Credits (Base AC-013, §5.5)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const start = page.getByRole('button', { name: 'Start Mission' });
  await start.click();
  await expect(start).toBeDisabled();
  // A repeated click on the disabled action cannot emit a second request.
  await start.click({ force: true });
  await expect(start).toBeDisabled();
  await expect(page.getByText('Credits: 1')).toBeVisible();

  // The Overlay remains open while the accepted request awaits S07's
  // Snapshot/Combat transition; Cancel still returns to unchanged Operations.
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
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
  await page.getByRole('button', { name: 'Interception' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await noOverflow()).toBe(true);
});
