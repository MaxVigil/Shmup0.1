import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S03-WI02 regression coverage at the minimum supported viewport
 * (DS-AC-007, DS §6.7). The real application is measured, not a fixture:
 * document overflow and the focused Navigation Item focus-ring geometry are
 * asserted against the live document.scrollingElement and the focused
 * element's computed outline (2px ring + 2px positive offset).
 *
 * V02-WI-05 M02-R01 extends the shared owner (Verification §14.2) with the
 * Interception 02 states exposed by this checkpoint: Operations with
 * Interception 02 available, active Mission 02 Combat with its `04:20`
 * Countdown, and the committed Mission 02 Success result with the Mission 03
 * unlock. The persisted campaign row is seeded through the same IndexedDB test
 * setup the existing Game Over and Save Data Error states already use; the
 * application reads it as normal durable campaign state and no production or
 * development hook is involved.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

/** Writes one exact persisted campaign row envelope (Boot reads it as durable
 *  progress; the application itself never exposes this test setup). */
async function seedCampaignRow(
  page: Page,
  value: Readonly<Record<string, unknown>>,
): Promise<void> {
  await page.evaluate(async (record) => {
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
        value: record,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, value);
}

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

test('Evacuation Confirmation has no document overflow and a fully visible Cancel ring at 1280x600 (V02-AC-014, DS-AC-007)', async ({
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

  // The blocking Evacuate? confirmation opened from active Combat: the initial
  // Cancel action owns focus and its complete focus ring (2px ring + 2px
  // positive offset) must stay inside the minimum viewport (Verification §14.2,
  // DS-AC-007).
  await page
    .getByTestId('combat-utility')
    .getByRole('button', { name: 'Evacuate' })
    .click();
  await expect(page.getByRole('heading', { name: 'Evacuate?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await measureFocusedRing(page, 'Cancel');

  // The destructive action is reachable by keyboard and its ring also fits.
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Confirm Evacuation' }),
  ).toBeFocused();
  await measureFocusedRing(page, 'Confirm Evacuation');
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

test('Operations with Interception 02 available has no document overflow and a fully visible Mission 02 ring at 1280x600 (V02-AC-001/002, DS-AC-007)', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Seed the persisted campaign after the accepted Mission 01 Success:
  // Interception 01 completed, Interception 02 available, 03 locked.
  await seedCampaignRow(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 20,
    aircraftId: 'german-fighter',
    hullIntegrity: 80,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01', 'interception-02'],
    completedMissionIds: ['interception-01'],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
  });
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // The newly exposed state is visible with its copy state and geometry.
  await expect(
    page.getByRole('button', { name: 'Interception 02' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 01 (Completed)' }),
  ).toBeVisible();

  const available = page.getByRole('button', { name: 'Interception 02' });
  await available.focus();
  await expect(available).toBeFocused();
  // Numeric no-overflow and complete focus-ring containment.
  await measureFocusedRing(page, 'Interception 02');

  // All three visible Mission Points remain inside the minimum viewport.
  const pointBounds = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const points = Array.from(
      document.querySelectorAll<HTMLElement>('.ds-mission-point'),
    );
    return {
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
      bounds: points.map((point) => {
        const rect = point.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
        };
      }),
    };
  });
  expect(pointBounds.bounds).toHaveLength(3);
  for (const bounds of pointBounds.bounds) {
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(pointBounds.clientWidth);
    expect(bounds.bottom).toBeLessThanOrEqual(pointBounds.clientHeight);
  }
});

test('active Interception 02 Combat has no document overflow, the 04:20 Countdown in place, and a fully visible utility ring at 1280x600 (V02-AC-003/022, DS-AC-007)', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await seedCampaignRow(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 20,
    aircraftId: 'german-fighter',
    hullIntegrity: 80,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01', 'interception-02'],
    completedMissionIds: ['interception-01'],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
  });
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Interception 02' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Interception 02' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });

  // The Mission 02 state exposes exactly one Countdown with its authored 04:20
  // value, one HUD, and no Overlay.
  const countdown = page.locator('.ds-combat-countdown');
  await expect(countdown).toHaveText('04:20');
  await expect(countdown).toHaveCount(1);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Numeric geometry: the Countdown and HUD stay fully inside the minimum
  // viewport and the Countdown keeps the canonical horizontal centre.
  const geometry = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const countdownElement = document.querySelector('.ds-combat-countdown');
    const hudElement = document.querySelector('.ds-combat-hud');
    const countdownRect = countdownElement?.getBoundingClientRect() ?? null;
    const hudRect = hudElement?.getBoundingClientRect() ?? null;
    return {
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
      countdown: countdownRect,
      hud: hudRect,
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight);
  expect(geometry.countdown).not.toBeNull();
  expect(geometry.hud).not.toBeNull();
  if (geometry.countdown === null || geometry.hud === null) {
    throw new Error('Expected Mission 02 Combat HUD geometry.');
  }
  expect(geometry.countdown.left).toBeGreaterThanOrEqual(0);
  expect(geometry.countdown.right).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.countdown.top).toBeGreaterThanOrEqual(0);
  expect(geometry.hud.left).toBeGreaterThanOrEqual(0);
  expect(geometry.hud.right).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.hud.bottom).toBeLessThanOrEqual(geometry.clientHeight);
  expect(
    Math.abs(
      (geometry.countdown.left + geometry.countdown.right) / 2 -
        geometry.clientWidth / 2,
    ),
  ).toBeLessThanOrEqual(1);

  // The utility cluster is the Mission 02-visible control surface: the
  // destructive Evacuate action keeps a fully visible focus ring.
  const evacuate = page
    .getByTestId('combat-utility')
    .getByRole('button', { name: 'Evacuate' });
  await evacuate.focus();
  await expect(evacuate).toBeFocused();
  await measureFocusedRing(page, 'Evacuate');
});

test('the committed Interception 02 Success result has no document overflow and a fully visible Continue ring at 1280x600 (V02-AC-023, DS-AC-007)', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await seedCampaignRow(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 20,
    aircraftId: 'german-fighter',
    hullIntegrity: 80,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01', 'interception-02'],
    completedMissionIds: ['interception-01'],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
  });
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Interception 02' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });

  // Reach the committed Mission 02 Success through the existing authoritative
  // development Debug command (the viewport state, not the timing, is measured
  // here; deterministic timing/terminal evidence lives in the Vitest suite).
  await page.keyboard.press('F1');
  await page.getByRole('button', { name: 'Win Mission' }).click();
  const result = page.getByRole('dialog');
  await expect(
    result.getByRole('heading', { name: 'MISSION COMPLETE' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(result.getByText('Mission unlocked')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const surface = document.querySelector('.ds-overlay__surface');
    const rect = surface?.getBoundingClientRect() ?? null;
    return {
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
      surface:
        rect === null
          ? null
          : {
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
            },
    };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
  expect(metrics.surface).not.toBeNull();
  if (metrics.surface === null) {
    throw new Error('Expected the result Overlay surface geometry.');
  }
  expect(metrics.surface.top).toBeGreaterThanOrEqual(0);
  expect(metrics.surface.left).toBeGreaterThanOrEqual(0);
  expect(metrics.surface.right).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.surface.bottom).toBeLessThanOrEqual(metrics.clientHeight);

  const continueButton = result.getByRole('button', { name: 'Continue' });
  await expect(continueButton).toBeFocused();
  await measureFocusedRing(page, 'Continue');
});
