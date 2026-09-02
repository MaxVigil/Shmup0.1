import { expect, test } from '@playwright/test';

/**
 * S06 Hangar, Weapon Selection and Repair (Base AC-015–030, AC-050;
 * DS-AC-005/006/007/014). The real application is exercised at the minimum
 * supported viewport. The damaged-aircraft Repair scenarios (AC-026–030) are
 * unit-covered at the component and store layers because a damaged session
 * requires a mission result (S12); AC-025 (Repair hidden at full Hull) and the
 * Weapon Selection transaction are covered here in the browser.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
});

test('Hangar shows the background, Configuration Panel, and centred aircraft (Base AC-015, AC-016)', async ({
  page,
}) => {
  // No duplicate visible Hangar heading; the Screen keeps its accessible name.
  await expect(page.getByRole('heading', { name: 'Hangar' })).toHaveCount(0);
  await expect(page.getByRole('main', { name: 'Hangar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hangar' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('German Fighter')).toBeVisible();
  await expect(page.getByText('Pilot')).toBeVisible();
  await expect(page.getByText('Hull Integrity')).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByText('100 / 100')).toBeVisible();
  await expect(page.getByText('Primary Weapon')).toBeVisible();
  await expect(page.getByText('Machine Gun')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Change Weapon' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  expect(await page.locator('img.ds-hangar-aircraft').getAttribute('alt')).toBe(
    'German Fighter',
  );
});

test('a failed aircraft image shows the neutral German Fighter placeholder (Base AC-017)', async ({
  page,
}) => {
  await page.route('**/aircraft/german-fighter.png', (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await expect(page.locator('img.ds-hangar-aircraft')).toHaveCount(0);
  await expect(
    page.locator('.ds-hangar-aircraft-fallback').getByText('German Fighter'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Change Weapon' }),
  ).toBeVisible();
});

test('Hangar provides no mission launch actions (Base AC-018)', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Start Mission' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Launch' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Hangar' })).toHaveCount(
    0,
  );
});

test('Repair is hidden at full Hull Integrity (Base AC-025)', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Repair' })).toHaveCount(0);
  await expect(page.getByText('Cost')).toHaveCount(0);
});

test('Change Weapon opens the Overlay with the equipped weapon selected (Base AC-019)', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Select Primary Weapon' }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: /Machine Gun/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Cannon/ })).not.toBeChecked();
  // Initial focus is the equipped weapon option (DS §10.4).
  await expect(page.getByRole('radio', { name: /Machine Gun/ })).toBeFocused();
});

test('Weapon Selection shows canonical statistics with Confirm left and Cancel right (Base AC-020)', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Machine Gun')).toBeVisible();
  await expect(dialog.getByText('Cannon')).toBeVisible();
  // v0.2 §10 weapon content: Machine Gun fires 5 shots/s, Cannon 1.5 shots/s.
  await expect(dialog.getByText('5 shots/s', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3 hits')).toBeVisible();
  await expect(dialog.getByText('1.5 shots/s', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 hit')).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Confirm' });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  const confirmBox = await confirm.boundingBox();
  const cancelBox = await cancel.boundingBox();
  expect(confirmBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(confirmBox!.x).toBeLessThan(cancelBox!.x);
});

test('keyboard selection changes only pending until Confirm equips it (Base AC-021, AC-022, AC-050)', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const panel = page.locator('.ds-aircraft-configuration-panel');

  // Arrow Down moves the pending radio selection to Cannon.
  await page.getByRole('radio', { name: /Machine Gun/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Cannon/ })).toBeChecked();
  // The equipped weapon is unchanged until Confirm.
  await expect(panel.getByText('Machine Gun')).toBeVisible();

  // Tab reaches Confirm; activating it equips Cannon and closes the Overlay.
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(panel.getByText('Cannon')).toBeVisible();
});

test('Cancel and Esc discard the pending selection (Base AC-023)', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  const panel = page.locator('.ds-aircraft-configuration-panel');
  await page.getByRole('radio', { name: /Machine Gun/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Cannon/ })).toBeChecked();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(panel.getByText('Machine Gun')).toBeVisible();
});

test('clicking outside Weapon Selection does not close it (Base AC-024)', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('no document overflow on Hangar or with the Weapon Selection Overlay open at 1280x600 (Base AC-041, DS-AC-007)', async ({
  page,
}) => {
  const noOverflow = async (): Promise<boolean> =>
    page.evaluate(() => {
      const doc = document.scrollingElement as HTMLElement;
      return (
        doc.scrollWidth <= doc.clientWidth &&
        doc.scrollHeight <= doc.clientHeight
      );
    });

  expect(await noOverflow()).toBe(true);
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await noOverflow()).toBe(true);
});
