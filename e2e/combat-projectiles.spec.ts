import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S09 Player Weapons and Projectiles — representative cross-layer wiring and
 * browser-only evidence (Combat §8, AC-019, AC-021/022, AC-050, AC-076–077).
 * Exact cadence, velocity, lifetime, and geometry are covered by deterministic
 * unit tests; the browser proves only that the default Machine Gun path and
 * the Hangar-selected Cannon path each visibly render a projectile without any
 * firing input, that the solid `text-primary` projectile appears above the
 * aircraft, and that presentation survives resize without
 * duplicates, repeated asset requests, or page errors. Disposal has no user
 * path in S09 (mission end is S12); it is covered by the deterministic unit
 * layer plus the single-settled-canvas/HUD assertions below.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

interface AircraftSample {
  centerX: number;
  centerY: number;
  vw: number;
  vh: number;
}

/** Derives the authoritative aircraft centre from the Hull bar rect. */
function readAircraft(page: Page): Promise<AircraftSample | null> {
  return page.evaluate(() => {
    const hud = document.querySelector('.ds-combat-hud');
    if (hud === null) {
      return null;
    }
    const rect = hud.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const shortSide = Math.min(vw, vh);
    const aircraftHeight = shortSide * 0.08;
    const gap = shortSide * 0.01;
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top - gap - aircraftHeight / 2,
      vw,
      vh,
    };
  });
}

/** Screenshots the canvas and counts `text-primary` projectile pixels in the
 *  clear-sky band above the aircraft top edge. A single coarse presence
 *  sample, not a wall-clock motion inference. */
function projectilePixelCount(
  page: Page,
  width: number,
  height: number,
  skyBottom: number,
): Promise<number> {
  return page
    .locator('.ds-combat-canvas canvas')
    .screenshot()
    .then((shot) => {
      const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;
      return page.evaluate(
        ({ dataUrl: source, width: w, height: h, bottom }) => {
          const image = new Image();
          image.src = source;
          return image.decode().then(() => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', {
              willReadFrequently: true,
            });
            if (ctx === null) {
              return 0;
            }
            ctx.drawImage(image, 0, 0);
            const top = Math.floor(h * 0.03);
            const left = Math.floor(w * 0.2);
            const right = Math.floor(w * 0.8);
            const band = Math.max(top, bottom - top);
            const data = ctx.getImageData(left, top, right - left, band).data;
            let count = 0;
            for (let index = 0; index < data.length; index += 4) {
              const r = data[index];
              const g = data[index + 1];
              const b = data[index + 2];
              if (
                Math.abs(r - 241) <= 3 &&
                Math.abs(g - 245) <= 3 &&
                Math.abs(b - 247) <= 3
              ) {
                count += 1;
              }
            }
            return count;
          });
        },
        { dataUrl, width, height, bottom: skyBottom },
      );
    });
}

/** Reads the aircraft, computes its top edge, and counts projectile pixels in
 *  the clear sky band between the top of the viewport and the aircraft. */
async function readProjectilePixels(page: Page): Promise<number> {
  const aircraft = await readAircraft(page);
  if (aircraft === null) {
    return 0;
  }
  const shortSide = Math.min(aircraft.vw, aircraft.vh);
  const aircraftTop = aircraft.centerY - (shortSide * 0.08) / 2;
  const skyBottom = Math.max(30, Math.floor(aircraftTop - 10));
  return projectilePixelCount(page, aircraft.vw, aircraft.vh, skyBottom);
}

async function startCombat(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();
  // Settle until the Scene has booted and positioned the aircraft.
  await expect
    .poll(async () => (await readAircraft(page))?.centerY, { timeout: 5000 })
    .toBeGreaterThan(477);
}

test('the default Machine Gun creates a visible projectile without firing input (Combat §8, AC-019)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await startCombat(page);

  // No firing input exists in the routing table: the projectiles appear
  // purely from the deterministic fixed-step schedule.
  await expect
    .poll(async () => readProjectilePixels(page), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  // Representative browser-only resize wiring. Exact projectile reprojection,
  // geometry, speed, and identity are deterministic unit-test responsibilities.
  await page.setViewportSize({ width: 1500, height: 800 });
  await expect
    .poll(
      async () =>
        page
          .locator('.ds-combat-canvas canvas')
          .evaluate((element) => element.clientWidth),
      { timeout: 5000 },
    )
    .toBe(1500);
  await expect
    .poll(async () => readProjectilePixels(page), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  // A single settled Game/Scene: no duplicate canvas or HUD bridge.
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);

  // The prepared aircraft texture is fetched exactly once for Combat entry.
  const aircraftFetches = requested.filter((url) =>
    /aircraft\/german-fighter\.png$/.test(url),
  ).length;
  expect(aircraftFetches).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('the Hangar-selected Cannon profile reaches Combat and creates a projectile (AC-021/022, AC-050)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Hangar → Change Weapon → select Cannon → Confirm (Base AC-021/022/050).
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('radio', { name: /Machine Gun/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Cannon/ })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const panel = page.locator('.ds-aircraft-configuration-panel');
  await expect(panel.getByText('Cannon')).toBeVisible();

  // Back to Operations and into Combat with the equipped Cannon.
  await page.getByRole('button', { name: 'Operations' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1);
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();

  // The Cannon profile renders its projectile visibly (no firing input).
  await expect
    .poll(async () => readProjectilePixels(page), { timeout: 5000 })
    .toBeGreaterThanOrEqual(10);

  expect(pageErrors).toEqual([]);
});
