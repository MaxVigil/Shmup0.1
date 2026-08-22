import { expect, test } from '@playwright/test';

/**
 * S07-WI02 human-checkpoint visual contract (Base AC-002, AC-007, AC-015,
 * AC-041–043; DS-AC-015). The real application is measured at the minimum
 * supported viewport and a materially larger viewport: no duplicate visible
 * Screen headings, the Screen background fills the complete viewport beneath a
 * transparent/borderless Base Navigation with opaque items, the Hangar German
 * Fighter sits exactly at the complete viewport centre without overlapping the
 * protected UI, and the document never overflows.
 */
const SMALL = { width: 1280, height: 600 };
const LARGE = { width: 1920, height: 1080 };

test('Base Screens have no duplicate visible heading and keep an accessible Screen name (Base AC-007, AC-015, DS-AC-015)', async ({
  page,
}) => {
  await page.setViewportSize(SMALL);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Operations' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('main', { name: 'Operations' })).toBeVisible();

  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hangar' })).toHaveCount(0);
  await expect(page.getByRole('main', { name: 'Hangar' })).toBeVisible();
});

test('the Operations background fills the complete viewport beneath a transparent, borderless Base Navigation (Base AC-002, AC-007)', async ({
  page,
}) => {
  await page.setViewportSize(SMALL);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const background = document.querySelector('.ds-operations-background');
    const nav = document.querySelector('.ds-base-navigation');
    const item = nav?.querySelector('.ds-navigation-item');
    if (
      background === null ||
      nav === null ||
      item === null ||
      !(background instanceof HTMLElement) ||
      !(nav instanceof HTMLElement) ||
      !(item instanceof HTMLElement)
    ) {
      return null;
    }
    const bg = background.getBoundingClientRect();
    const navStyle = getComputedStyle(nav);
    const itemStyle = getComputedStyle(item);
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      background: {
        left: bg.left,
        top: bg.top,
        right: bg.right,
        bottom: bg.bottom,
      },
      navLeft: nav.getBoundingClientRect().left,
      navRight: nav.getBoundingClientRect().right,
      navBackground: navStyle.backgroundColor,
      navBorderTop: navStyle.borderTopWidth,
      itemBackground: itemStyle.backgroundColor,
    };
  });
  expect(metrics).not.toBeNull();
  // The background covers the complete viewport, including beneath Navigation.
  expect(metrics!.background.left).toBeCloseTo(0, 0);
  expect(metrics!.background.top).toBeCloseTo(0, 0);
  expect(metrics!.background.right).toBeCloseTo(metrics!.vw, 0);
  expect(metrics!.background.bottom).toBeCloseTo(metrics!.vh, 0);
  // Navigation is a transparent, borderless layer; items are opaque.
  expect(metrics!.navBackground).toBe('rgba(0, 0, 0, 0)');
  expect(metrics!.navBorderTop).toBe('0px');
  expect(metrics!.itemBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(metrics!.navLeft).toBeLessThan(metrics!.navRight);
});

test('the Hangar German Fighter sits at the complete viewport centre without overlapping protected UI at 1280x600 and 1920x1080 (Base AC-015, §6.4, AC-041–043)', async ({
  page,
}) => {
  const overlaps = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number },
  ): boolean =>
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;

  for (const viewport of [SMALL, LARGE]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await page.getByRole('button', { name: 'Hangar' }).click();
    await expect(page.getByTestId('hangar-screen')).toBeVisible();
    await expect(page.locator('img.ds-hangar-aircraft')).toBeVisible();

    const state = await page.evaluate(() => {
      const img = document.querySelector('.ds-hangar-aircraft');
      const nav = document.querySelector('.ds-base-navigation');
      const panel = document.querySelector('.ds-aircraft-configuration-panel');
      const settings = document.querySelector('.ds-base-shell__settings');
      const doc = document.scrollingElement as HTMLElement;
      if (
        img === null ||
        nav === null ||
        panel === null ||
        settings === null ||
        !(img instanceof HTMLElement) ||
        !(nav instanceof HTMLElement) ||
        !(panel instanceof HTMLElement) ||
        !(settings instanceof HTMLElement)
      ) {
        return null;
      }
      const rect = (element: HTMLElement) => {
        const r = element.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const i = rect(img);
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        centerX: i.left + (i.right - i.left) / 2,
        centerY: i.top + (i.bottom - i.top) / 2,
        img: i,
        nav: rect(nav),
        panel: rect(panel),
        settings: rect(settings),
        scrollWidth: doc.scrollWidth,
        scrollHeight: doc.scrollHeight,
        clientWidth: doc.clientWidth,
        clientHeight: doc.clientHeight,
      };
    });
    expect(state).not.toBeNull();
    // Exact complete-viewport centre at every supported viewport.
    expect(Math.abs(state!.centerX - state!.vw / 2)).toBeLessThan(1);
    expect(Math.abs(state!.centerY - state!.vh / 2)).toBeLessThan(1);
    // The aircraft scales down rather than overlapping protected UI.
    expect(overlaps(state!.img, state!.nav)).toBe(false);
    expect(overlaps(state!.img, state!.panel)).toBe(false);
    expect(overlaps(state!.img, state!.settings)).toBe(false);
    // No document overflow at either viewport.
    expect(state!.scrollWidth).toBeLessThanOrEqual(state!.clientWidth);
    expect(state!.scrollHeight).toBeLessThanOrEqual(state!.clientHeight);
  }
});
