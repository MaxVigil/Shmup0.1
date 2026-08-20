import { expect, test } from '@playwright/test';

test('technical scaffold starts without page errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('technical-scaffold')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
