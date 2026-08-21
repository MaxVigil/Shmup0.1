import { expect, test } from '@playwright/test';

/**
 * S03-WI02 regression coverage at the minimum supported viewport
 * (DS-AC-007, DS §6.7). The real application is measured, not a fixture:
 * document overflow and the focused heading focus-ring geometry are asserted
 * against the live document.scrollingElement and the focused element's
 * computed outline (2px ring + 2px positive offset).
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test('Operations has no document overflow and a fully visible heading ring at 1280x600', async ({
  page,
}) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const active = document.activeElement;
    const heading =
      active instanceof HTMLElement && active.tagName === 'H1' ? active : null;
    const rect = heading?.getBoundingClientRect() ?? null;
    const style = heading === null ? null : getComputedStyle(heading);
    const ext =
      style === null
        ? 0
        : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return {
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
      focusedHeadingText: heading?.textContent ?? null,
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

  // Programmatic focus is on the Operations heading (DS-AC-015).
  expect(metrics.focusedHeadingText).toBe('Operations');
  // No horizontal or vertical document overflow at the minimum viewport.
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);

  // The complete canonical focus outline, including the positive outline
  // offset, is inside the viewport and not clipped on any edge (DS-AC-004).
  const ring = metrics.ring;
  expect(ring).not.toBeNull();
  if (ring === null) {
    throw new Error('Expected focused-heading ring geometry.');
  }
  expect(ring.top).toBeGreaterThanOrEqual(0);
  expect(ring.left).toBeGreaterThanOrEqual(0);
  expect(ring.right).toBeLessThanOrEqual(metrics.clientWidth);
  expect(ring.bottom).toBeLessThanOrEqual(metrics.clientHeight);
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
