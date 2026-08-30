import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S03-WI02 regression coverage at the minimum supported viewport
 * (DS-AC-007, DS §6.7). The real application is measured, not a fixture:
 * document overflow and the focused Navigation Item focus-ring geometry are
 * asserted against the live document.scrollingElement and the focused
 * element's computed outline (2px ring + 2px positive offset).
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

/** Asserts no document overflow and a fully visible canonical focus ring for
 *  the currently focused control (DS-AC-004, Verification §14.2). */
async function measureFocusedRing(
  page: Page,
  expectedText: string,
  ringOwnerSelector?: string,
): Promise<void> {
  const metrics = await page.evaluate(
    ({ expectedText, ringOwnerSelector }) => {
      const doc = document.scrollingElement as HTMLElement;
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const ringOwner =
        ringOwnerSelector === undefined
          ? active
          : (active?.closest<HTMLElement>(ringOwnerSelector) ?? null);
      const rect = ringOwner?.getBoundingClientRect() ?? null;
      const style = ringOwner === null ? null : getComputedStyle(ringOwner);
      const ext =
        style === null
          ? 0
          : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      return {
        matchesExpectedText:
          active?.textContent?.trim() === expectedText ||
          active?.getAttribute('aria-label')?.includes(expectedText) === true ||
          ringOwner?.textContent?.includes(expectedText) === true,
        scrollWidth: doc.scrollWidth,
        scrollHeight: doc.scrollHeight,
        clientWidth: doc.clientWidth,
        clientHeight: doc.clientHeight,
        ring:
          rect === null || style === null
            ? null
            : {
                top: rect.top - ext,
                left: rect.left - ext,
                right: rect.right + ext,
                bottom: rect.bottom + ext,
              },
      };
    },
    { expectedText, ringOwnerSelector },
  );

  expect(metrics.matchesExpectedText).toBe(true);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
  expect(metrics.ring).not.toBeNull();
  if (metrics.ring === null) {
    throw new Error(`Expected focused ${expectedText} ring geometry.`);
  }
  expect(metrics.ring.top).toBeGreaterThanOrEqual(0);
  expect(metrics.ring.left).toBeGreaterThanOrEqual(0);
  expect(metrics.ring.right).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.ring.bottom).toBeLessThanOrEqual(metrics.clientHeight);
}

test('Operations has no document overflow and a fully visible active Navigation Item ring at 1280x600', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const rect = active?.getBoundingClientRect() ?? null;
    const style = active === null ? null : getComputedStyle(active);
    const ext =
      style === null
        ? 0
        : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return {
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
      focusedText: active?.textContent?.trim() ?? null,
      focusedIsNavItem:
        active?.classList.contains('ds-navigation-item') ?? false,
      ring:
        rect === null || style === null
          ? null
          : {
              top: rect.top - ext,
              left: rect.left - ext,
              right: rect.right + ext,
              bottom: rect.bottom + ext,
            },
    };
  });

  // Programmatic focus is on the active Operations Navigation Item (AC-052,
  // DS-AC-015); no Screen heading is a focus target.
  expect(metrics.focusedIsNavItem).toBe(true);
  expect(metrics.focusedText).toBe('Operations');
  // No horizontal or vertical document overflow at the minimum viewport.
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);

  // The complete canonical focus outline, including the positive outline
  // offset, is inside the viewport and not clipped on any edge (DS-AC-004).
  const ring = metrics.ring;
  expect(ring).not.toBeNull();
  if (ring === null) {
    throw new Error('Expected focused Navigation Item ring geometry.');
  }
  expect(ring.top).toBeGreaterThanOrEqual(0);
  expect(ring.left).toBeGreaterThanOrEqual(0);
  expect(ring.right).toBeLessThanOrEqual(metrics.clientWidth);
  expect(ring.bottom).toBeLessThanOrEqual(metrics.clientHeight);

  // V02-WI-03 shared regression (Verification §14.2): all three visible
  // Mission Points are fully inside the minimum viewport without overlap and
  // without horizontal/vertical clipping.
  const pointBounds = await page.evaluate(() => {
    const points = Array.from(
      document.querySelectorAll<HTMLElement>('.ds-mission-point'),
    );
    return points.map((point) => {
      const rect = point.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      };
    });
  });
  expect(pointBounds).toHaveLength(3);
  for (const bounds of pointBounds) {
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(metrics.clientWidth);
    expect(bounds.bottom).toBeLessThanOrEqual(metrics.clientHeight);
  }
});

test('Mission Details has no document overflow and a fully visible initial-action ring at 1280x600', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await expect(
    page.getByRole('button', { name: 'Start Mission' }),
  ).toBeFocused();

  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const rect = active?.getBoundingClientRect() ?? null;
    const style = active === null ? null : getComputedStyle(active);
    const ext =
      style === null
        ? 0
        : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return {
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
      focusedControl: active?.textContent?.trim() ?? null,
      ring:
        rect === null || style === null
          ? null
          : {
              top: rect.top - ext,
              left: rect.left - ext,
              right: rect.right + ext,
              bottom: rect.bottom + ext,
            },
    };
  });

  expect(metrics.focusedControl).toBe('Start Mission');
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
  expect(metrics.ring).not.toBeNull();
  if (metrics.ring === null) {
    throw new Error('Expected focused Start Mission ring geometry.');
  }
  expect(metrics.ring.top).toBeGreaterThanOrEqual(0);
  expect(metrics.ring.left).toBeGreaterThanOrEqual(0);
  expect(metrics.ring.right).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.ring.bottom).toBeLessThanOrEqual(metrics.clientHeight);
});

test('Hangar and Weapon Selection keep destination focus rings inside 1280x600', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByRole('button', { name: 'Hangar' })).toBeFocused();

  await measureFocusedRing(page, 'Hangar');

  await page.getByRole('button', { name: 'Change Weapon' }).click();
  await expect(page.getByRole('radio', { name: /Machine Gun/ })).toBeFocused();
  await measureFocusedRing(page, 'Machine Gun', '.ds-weapon-option');
});

test('Boot View has no document overflow at 1280x600', async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  // Hold the approved Boot preload font requests pending so the Boot View
  // remains the current screen while its geometry is measured. The preload
  // resolves only when every manifest asset settles or the 5 s deadline
  // elapses, so holding the font requests keeps the Boot View on screen well
  // past the measurement. Filtering by resource type avoids intercepting the
  // application's own script/stylesheet requests.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'font') {
      await new Promise<void>(() => {});
      return;
    }
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('boot-view')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    return {
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
    };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
});

test('Pause Overlay has no document overflow and a fully visible Resume ring at 1280x600 (S13)', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });

  await page.keyboard.press('KeyP');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await measureFocusedRing(page, 'Resume');
});

test('Game Over Screen has no document overflow and a fully visible New Game ring at 1280x600 (V02-AC-016)', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Seed an unaffordable active mission (7 Credits) so the next Boot resolves
  // it as Defeat and opens the terminal Game Over Screen.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('shmup-v0.2');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readwrite');
      transaction.objectStore('campaign').put({
        id: 'current',
        rowFormatVersion: 2,
        value: {
          schemaVersion: 1,
          runStatus: 'active',
          credits: 7,
          aircraftId: 'german-fighter',
          hullIntegrity: 100,
          equippedWeapon: 'machine-gun',
          unlockedMissionIds: ['interception-01'],
          completedMissionIds: [],
          missionInProgress: { missionId: 'interception-01', attemptId: 0 },
          pilotId: 'pilot-shevchenko',
        },
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await expect(page.getByTestId('game-over-screen')).toBeVisible();

  const newGame = page.getByRole('button', { name: 'New Game' });
  await newGame.focus();
  await measureFocusedRing(page, 'New Game');
});

test('Save Data Error Screen has no document overflow and a fully visible Start New Game ring at 1280x600 (V02-AC-021)', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Corrupt the stored campaign so Boot opens the Save Data Error Screen.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('shmup-v0.2');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readwrite');
      transaction.objectStore('campaign').put({
        id: 'current',
        rowFormatVersion: 2,
        value: { schemaVersion: 1, credits: -5 },
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();

  const startNewGame = page.getByRole('button', { name: 'Start New Game' });
  await startNewGame.focus();
  await measureFocusedRing(page, 'Start New Game');
});
