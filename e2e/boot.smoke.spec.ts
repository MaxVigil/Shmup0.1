import { expect, test } from '@playwright/test';

test('boot reaches Operations without page errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('operations-screen')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('boot moves programmatic focus to the active Operations Navigation Item', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('operations-screen')).toBeVisible();
  const active = await page.evaluate(() => {
    const element = document.activeElement;
    return {
      text: element?.textContent?.trim() ?? '',
      isNavItem:
        element instanceof HTMLElement &&
        element.classList.contains('ds-navigation-item'),
    };
  });
  expect(active.isNavItem).toBe(true);
  expect(active.text).toBe('Operations');
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

test('boot requests each approved enemy image exactly once through the bounded preload (V02-WI-01, MASTER-AC-014)', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) =>
    requested.push(new URL(request.url()).pathname),
  );

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.waitForLoadState('networkidle');

  // The five approved enemy sprites start in parallel with the existing
  // non-critical runtime assets and are requested no more than once per page
  // load by application loading logic (Epic §16.1, V02-DEC-015).
  const enemyPaths = [
    '/enemies/basic-drone.png',
    '/enemies/ranged-drone.png',
    '/enemies/hunter-drone.png',
    '/enemies/elite-drone-armoured.png',
    '/enemies/elite-drone-vulnerable.png',
  ];
  for (const path of enemyPaths) {
    expect(requested.filter((url) => url === path)).toHaveLength(1);
  }
});

test('boot reaches Operations when every enemy image fails (V02-WI-01, MASTER-AC-003)', async ({
  page,
}) => {
  // All five enemy images are non-critical: failure must not block startup
  // or keep Boot View active; the stable procedural fallback contract is
  // unit-tested at the preload layer and reviewed by the visual fixture.
  await page.route('**/enemies/*.png', (route) => route.abort());
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('operations-screen')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
