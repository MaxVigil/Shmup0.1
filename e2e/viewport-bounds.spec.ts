import { expect, test } from '@playwright/test';

/**
 * S03-WI02 regression coverage at the minimum supported viewport
 * (DS-AC-007, DS §6.7). The real application is measured, not a fixture:
 * document overflow and the focused Navigation Item focus-ring geometry are
 * asserted against the live document.scrollingElement and the focused
 * element's computed outline (2px ring + 2px positive offset).
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

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
});

test('Mission Details has no document overflow and a fully visible initial-action ring at 1280x600', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Interception' }).click();
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

  const measureFocusedRing = async (
    expectedText: string,
    ringOwnerSelector?: string,
  ): Promise<void> => {
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
            active?.getAttribute('aria-label')?.includes(expectedText) ===
              true ||
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
  };

  await measureFocusedRing('Hangar');

  await page.getByRole('button', { name: 'Change Weapon' }).click();
  await expect(page.getByRole('radio', { name: /Machine Gun/ })).toBeFocused();
  await measureFocusedRing('Machine Gun', '.ds-weapon-option');
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
