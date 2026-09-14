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

test('Combat shows the v0.2 HUD: top-centred Countdown, Hull Bar, and CRITICAL HULL (Combat AC-003, AC-053, AC-057, AC-081, v0.2 §15.2–15.3)', async ({
  page,
}) => {
  await startMission(page);

  const hud = page.locator('.ds-combat-hud').first();
  await expect(hud).toBeVisible();
  const track = hud.locator('.ds-combat-hud__track');
  await expect(track).toHaveAttribute('role', 'progressbar');
  await expect(track).toHaveAttribute('aria-valuenow', '100');

  const geometry = await page.evaluate(() => {
    const hudElement = document.querySelector('.ds-combat-hud__bar');
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

  // v0.2 HUD (Epic §15.2–15.3): the top-centred ceiling-formula Combat
  // Countdown shows the 190 s final arrival as `03:xx`, and the once-per-
  // Mission-Instance `CRITICAL HULL` message stays hidden at full Hull.
  const countdown = page.locator('.ds-combat-countdown');
  await expect(countdown).toBeVisible();
  await expect(countdown).toHaveText(/^03:0\d$/);
  await expect(page.locator('.ds-combat-critical-hull')).toBeHidden();

  // No excluded HUD elements (Combat §4.3): no objectives, score, counters,
  // ammo, minimap, damage numbers, or weapon-name indicators. The only HUD
  // text is the Countdown value plus the hidden CRITICAL HULL label.
  const hudText = await hud.evaluate((el) => el.textContent ?? '');
  expect(hudText.replace(/03:\d\d/g, '').replace(/CRITICAL HULL/g, '')).toBe(
    '',
  );
});

test('the v0.2 HUD anchors the Countdown to the viewport and the Hull bar to the Aircraft at 1280x600 (V02-AC-022, Epic §15.2–15.3, DS §8.26)', async ({
  page,
}) => {
  await startMission(page);

  interface HudBox {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
    readonly lineCount: number;
    readonly whiteSpace: string;
    readonly lineHeight: number;
  }

  interface HudGeometry {
    readonly viewportWidth: number;
    readonly countdown: HudBox | null;
    readonly bar: HudBox | null;
  }

  const readHud = (): Promise<HudGeometry> =>
    page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          lineCount: range.getClientRects().length,
          whiteSpace: style.whiteSpace,
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      };
      return {
        viewportWidth: window.innerWidth,
        countdown: read('.ds-combat-countdown'),
        bar: read('.ds-combat-hud__bar'),
      };
    });

  // Ordinary Combat Countdown: viewport-centred at the exact space-4 top offset
  // and exactly one line (the number that a nested-in-the-bar layout breaks).
  // space-4 is `1rem` = 16px at the approved 16px base font (DS §6.2).
  const initial = await readHud();
  expect(initial.countdown).not.toBeNull();
  const countdown = initial.countdown as HudBox;
  expect(countdown.width).toBeGreaterThan(0);
  expect(countdown.lineCount).toBe(1);
  expect(countdown.whiteSpace).toBe('nowrap');
  expect(Math.abs(countdown.height - countdown.lineHeight)).toBeLessThan(1);
  expect(Math.abs(countdown.top - 16)).toBeLessThan(1);
  expect(
    Math.abs(
      (countdown.left + countdown.right) / 2 - initial.viewportWidth / 2,
    ),
  ).toBeLessThan(1);

  // The Aircraft moves (pointer mode): the Hull bar follows it, while the
  // Countdown geometry stays exactly where it was.
  await page.mouse.move(320, 500);
  await expect
    .poll(async () => (await readHud()).bar?.left ?? 0)
    .toBeLessThan(500);
  const movedLeft = await readHud();
  await page.mouse.move(960, 500);
  await expect
    .poll(async () => (await readHud()).bar?.left ?? 0)
    .toBeGreaterThan(900);
  const movedRight = await readHud();

  expect(movedLeft.bar).not.toBeNull();
  expect(movedRight.bar).not.toBeNull();
  const leftBar = movedLeft.bar as HudBox;
  const rightBar = movedRight.bar as HudBox;
  // The bar tracked the Aircraft across more than 300 px of travel and stayed in
  // the lower half of the viewport, below the aircraft. 1280x600: short side
  // 600 → aircraft height 48, width 48 * 1278/1231 ≈ 49.8, bar 65% ≈ 32.4.
  expect(rightBar.left - leftBar.left).toBeGreaterThan(300);
  expect(Math.abs(leftBar.width - 32.4)).toBeLessThan(6);
  expect(Math.abs(rightBar.width - 32.4)).toBeLessThan(6);
  expect(leftBar.top).toBeGreaterThan(400);
  expect(rightBar.top).toBeGreaterThan(400);

  const movedCountdown = movedRight.countdown as HudBox;
  expect(movedCountdown.lineCount).toBe(1);
  for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
    expect(Math.abs(movedCountdown[key] - countdown[key])).toBeLessThan(0.5);
  }

  console.log(
    'V02-WI-05-E04-HUD-GEOMETRY',
    JSON.stringify({
      viewport: [initial.viewportWidth, 600],
      countdownTop: countdown.top,
      countdownCentreX: (countdown.left + countdown.right) / 2,
      countdownLines: countdown.lineCount,
      countdownHeight: countdown.height,
      barLeft: [leftBar.left, rightBar.left],
      barWidth: [leftBar.width, rightBar.width],
      barTop: [leftBar.top, rightBar.top],
    }),
  );
});

test('CRITICAL HULL sits directly below the Countdown with the exact space-2 gap at 1280x600 (Epic §15.3, DS §8.26)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Persist a surviving Hull below 25 through the persisted campaign row so the
  // real once-per-Mission-Instance CRITICAL HULL latch opens immediately on
  // Combat entry (Epic §15.3) — no production hook and no simulated message.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('shmup-v0.2');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readwrite');
      const store = transaction.objectStore('campaign');
      const get = store.get('current');
      get.onsuccess = () => {
        const row = get.result as {
          id: string;
          value: { hullIntegrity: number };
        };
        store.put({ ...row, value: { ...row.value, hullIntegrity: 20 } });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Capture the geometry while the real latch is visible from an in-page
  // frame sampler, so a slow boot can never turn a visible message into a
  // missed measurement.
  await page.evaluate(() => {
    const target = window as Window & { __criticalHullProbe__?: unknown };
    target.__criticalHullProbe__ = null;
    const sample = (): void => {
      const countdown = document.querySelector('.ds-combat-countdown');
      const critical = document.querySelector('.ds-combat-critical-hull');
      if (
        countdown !== null &&
        critical instanceof HTMLElement &&
        !critical.hidden
      ) {
        const countdownRect = countdown.getBoundingClientRect();
        const criticalRect = critical.getBoundingClientRect();
        if (countdownRect.height > 0 && criticalRect.height > 0) {
          target.__criticalHullProbe__ = {
            countdown: {
              left: countdownRect.left,
              top: countdownRect.top,
              right: countdownRect.right,
              bottom: countdownRect.bottom,
              height: countdownRect.height,
            },
            critical: {
              left: criticalRect.left,
              top: criticalRect.top,
              right: criticalRect.right,
              bottom: criticalRect.bottom,
              height: criticalRect.height,
            },
          };
          return;
        }
      }
      window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  });

  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  const criticalHull = page.locator('.ds-combat-critical-hull');
  await expect(criticalHull).toBeVisible({ timeout: 15000 });

  const probe = await page.evaluate(
    () =>
      (
        window as Window & {
          __criticalHullProbe__?: {
            readonly countdown: {
              readonly left: number;
              readonly top: number;
              readonly right: number;
              readonly bottom: number;
              readonly height: number;
            };
            readonly critical: {
              readonly left: number;
              readonly top: number;
              readonly right: number;
              readonly bottom: number;
              readonly height: number;
            };
          } | null;
        }
      ).__criticalHullProbe__ ?? null,
  );
  expect(probe).not.toBeNull();
  const measured = probe as NonNullable<typeof probe>;

  // Directly below the Countdown with the exact space-2 gap and no overlap.
  // space-2 is `0.5rem` = 8px at the approved 16px base font (DS §6.2).
  expect(measured.critical.height).toBeGreaterThan(0);
  expect(measured.critical.top).toBeGreaterThanOrEqual(
    measured.countdown.bottom,
  );
  expect(
    Math.abs(measured.critical.top - measured.countdown.bottom - 8),
  ).toBeLessThan(1);
  // Both lines share the viewport centre.
  expect(
    Math.abs(
      (measured.critical.left + measured.critical.right) / 2 -
        (measured.countdown.left + measured.countdown.right) / 2,
    ),
  ).toBeLessThan(1);

  console.log(
    'V02-WI-05-E04-CRITICAL-HULL-GEOMETRY',
    JSON.stringify({
      countdownBottom: measured.countdown.bottom,
      criticalTop: measured.critical.top,
      gap: measured.critical.top - measured.countdown.bottom,
      criticalHeight: measured.critical.height,
    }),
  );
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
      const hud = document.querySelector('.ds-combat-hud__bar');
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
