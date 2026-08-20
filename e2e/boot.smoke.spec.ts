import { expect, test } from '@playwright/test';

test('boot reaches Operations without page errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('operations-screen')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('boot reaches Operations when a non-critical asset fails', async ({
  page,
}) => {
  // MASTER-AC-003: one non-critical asset failure must not block startup;
  // the approved fallback path is used and Boot View does not remain active.
  await page.route('**/aircraft/german-fighter.png', (route) => route.abort());
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('operations-screen')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
