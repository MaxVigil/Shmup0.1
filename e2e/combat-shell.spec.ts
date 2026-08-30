import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S07 Mission Boundary and Combat Shell (Combat AC-001–003, AC-049, AC-053,
 * AC-056–057, AC-078, AC-081–082; MASTER-AC-010/014). The real application is
 * exercised at the minimum supported viewport; the lazy Phaser chunk is loaded
 * by the accepted mission start.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Opens Operations and accepts Start Mission, returning when Combat is visible
 *  and the settled single-game shell has mounted (the dev StrictMode transient
 *  disposes its first Game, so the assertions target the final single canvas). */
async function startMission(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

test('Combat opens full-viewport with a solid-black shell and no loading state (Combat AC-001, AC-002, AC-082)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await startMission(page);

  const canvas = page.locator('.ds-combat-canvas canvas');
  const size = await canvas.evaluate((el) => ({
    width: el.clientWidth,
    height: el.clientHeight,
  }));
  expect(size.width).toBeGreaterThanOrEqual(1280);
  expect(size.height).toBeGreaterThanOrEqual(600);

  // The gameplay area occupies the full viewport (Combat §4.1) and the screen
  // uses the solid-black approved canvas (Combat §4.2).
  const screenColor = await page
    .locator('.ds-combat-screen')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(screenColor).toBe('rgb(8, 11, 14)');

  // No loading Overlay, spinner, progress bar, or delayed replacement (Combat §12.7).
  await expect(
    page.locator('.ds-combat-screen [role="progressbar"]'),
  ).toHaveCount(1);
  await expect(page.locator('.ds-combat-screen .ds-overlay')).toHaveCount(0);
  await expect(page.getByText(/loading|progress/i)).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test('Combat shows only the Hull Integrity bar below the aircraft with approved geometry (Combat AC-003, AC-053, AC-057, AC-081)', async ({
  page,
}) => {
  await startMission(page);

  const hud = page.locator('.ds-combat-hud').first();
  await expect(hud).toBeVisible();
  const track = hud.locator('.ds-combat-hud__track');
  await expect(track).toHaveAttribute('role', 'progressbar');
  await expect(track).toHaveAttribute('aria-valuenow', '100');

  const geometry = await page.evaluate(() => {
    const hudElement = document.querySelector('.ds-combat-hud');
    const fillElement = document.querySelector('.ds-combat-hud__fill');
    if (hudElement === null || fillElement === null) {
      return null;
    }
    const rect = hudElement.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      fillWidthRatio: fillElement.clientWidth / hudElement.clientWidth,
    };
  });
  expect(geometry).not.toBeNull();
  // 1280x600: short side 600 → aircraft height 48, width 48 * 1278/1231,
  // bar width = 65% of that ≈ 32.4, gap = 1% short side = 6,
  // aircraft center (640, 480) → bar top ≈ 504 + 6 = 510.
  expect(geometry!.width).toBeGreaterThan(28);
  expect(geometry!.width).toBeLessThan(37);
  expect(Math.abs(geometry!.left + geometry!.width / 2 - 640)).toBeLessThan(3);
  expect(Math.abs(geometry!.top - 510)).toBeLessThan(3);
  expect(geometry!.height).toBeCloseTo(8, 0); // 0.5rem at the 16px base font
  expect(geometry!.fillWidthRatio).toBeCloseTo(1, 1);

  // No excluded HUD elements (Combat §4.3): no objectives, score, counters,
  // ammo, minimap, damage numbers, or weapon-name indicators.
  const hudText = await hud.evaluate((el) => el.textContent ?? '');
  expect(hudText).toBe('');
});

test('Combat recalibrates the canvas, aircraft, and Hull bar on viewport resize with no repeated asset requests (Combat AC-001, AC-053, AC-057, AC-081, AC-082, MASTER-AC-010)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await startMission(page);
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();

  const aircraftRequests = () =>
    requested.filter((url) => url.includes('german-fighter.png')).length;
  expect(aircraftRequests()).toBe(1); // prepared asset only

  const readCombat = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('.ds-combat-canvas canvas');
      const hud = document.querySelector('.ds-combat-hud');
      const fill = document.querySelector('.ds-combat-hud__fill');
      const track = document.querySelector('.ds-combat-hud__track');
      if (canvas === null || hud === null || fill === null || track === null) {
        return null;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      return {
        canvas: { width: canvasRect.width, height: canvasRect.height },
        hull: {
          left: hudRect.left,
          top: hudRect.top,
          width: hudRect.width,
          height: hudRect.height,
        },
        fillRatio: fill.clientWidth / hud.clientWidth,
        ariaNow: track.getAttribute('aria-valuenow'),
      };
    });

  // Resize 1 → 1280x900 (short side 900, aspect 1.42): aircraft height 72,
  // bar width ≈ 48.6, gap 9, aircraft centre (640, 720) → bar top ≈ 765.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect
    .poll(async () => (await readCombat())?.canvas, { timeout: 5000 })
    .toEqual({ width: 1280, height: 900 });
  let state = await readCombat();
  expect(state).not.toBeNull();
  expect(state!.hull.width).toBeGreaterThan(44);
  expect(state!.hull.width).toBeLessThan(53);
  expect(Math.abs(state!.hull.left + state!.hull.width / 2 - 640)).toBeLessThan(
    3,
  );
  expect(Math.abs(state!.hull.top - 765)).toBeLessThan(3);
  expect(state!.hull.height).toBeCloseTo(8, 0);
  expect(state!.fillRatio).toBeCloseTo(1, 1);
  expect(state!.ariaNow).toBe('100'); // Hull ratio retained across resize

  // Resize 2 → 1500x800 (short side 800, aspect 1.875): aircraft height 64,
  // bar width ≈ 43.2, gap 8, aircraft centre (750, 640) → bar top ≈ 680.
  await page.setViewportSize({ width: 1500, height: 800 });
  await expect
    .poll(async () => (await readCombat())?.canvas)
    .toEqual({ width: 1500, height: 800 });
  state = await readCombat();
  expect(state!.hull.width).toBeGreaterThan(39);
  expect(state!.hull.width).toBeLessThan(48);
  expect(Math.abs(state!.hull.left + state!.hull.width / 2 - 750)).toBeLessThan(
    3,
  );
  expect(Math.abs(state!.hull.top - 680)).toBeLessThan(3);
  expect(state!.hull.height).toBeCloseTo(8, 0);
  expect(state!.fillRatio).toBeCloseTo(1, 1);
  expect(state!.ariaNow).toBe('100');

  // The prepared texture is reused across resize — never fetched again.
  expect(aircraftRequests()).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('Combat uses the prepared aircraft asset without repeated application requests (Combat AC-082, §12.7, MASTER-AC-014)', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Let the Boot/Base preload and the shell icon requests settle before the
  // baseline, so Combat entry itself can be compared.
  await page.waitForLoadState('networkidle');
  const baseline = requested.length;
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Entering Combat must not fetch the manifest, fonts, icons, backgrounds, or
  // the aircraft again: the prepared preload already delivered them.
  const afterStart = requested.slice(baseline);
  const repeated = afterStart.filter(
    (url) =>
      /asset-manifest|\.woff2|\.webp|\.png|\.svg|\.css/i.test(url) &&
      !/combat-presentation|phaser|\.js/.test(url),
  );
  expect(repeated).toEqual([]);
});

test('the aircraft fallback renders when the prepared image fails without breaking Combat (Combat AC-056)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/aircraft/german-fighter.png', (route) => route.abort());
  await startMission(page);

  // Combat remains playable: canvas, Hull bar, no broken-image marker, no
  // error overlay, and no page errors.
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();
  await expect(page.locator('.ds-combat-screen .ds-overlay')).toHaveCount(0);

  // The fallback is reused across viewport resize without reload or errors.
  await page.setViewportSize({ width: 1500, height: 800 });
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
