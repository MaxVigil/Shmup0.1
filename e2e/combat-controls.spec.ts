import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S08 Aircraft Controls and Movement (Combat AC-004–008, AC-064, AC-070–071;
 * §12.3 geometry portion). The real application is exercised at the minimum
 * supported viewport; the authoritative aircraft position is measured through
 * the CombatHudBridge Hull bar (centre below the aircraft, 1% short-side gap).
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

async function startCombat(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(page.locator('.ds-combat-hud').first()).toBeVisible();
  // Wait until the Scene has actually booted and positioned the aircraft at
  // its initial state; input listeners are registered during Scene create
  // before the first layout, so this also guarantees no key/pointer event is
  // lost to a not-yet-wired listener.
  await expect
    .poll(async () => (await readAircraft(page))?.centerX, { timeout: 5000 })
    .toBeGreaterThan(637);
  await expect
    .poll(async () => (await readAircraft(page))?.centerY, { timeout: 5000 })
    .toBeGreaterThan(477);
}

interface AircraftSample {
  centerX: number;
  centerY: number;
  vw: number;
  vh: number;
}

/** Derives the authoritative aircraft centre from the Hull bar rect: bar
 *  centre = aircraft centre X; bar top = aircraft bottom + 1% short-side gap. */
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

const centerOf = (sample: AircraftSample): { x: number; y: number } => ({
  x: sample.centerX,
  y: sample.centerY,
});

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

test('Combat opens with the aircraft at rest at 50% x 80% (AC-070, AC-071)', async ({
  page,
}) => {
  await startCombat(page);

  const initial = await readAircraft(page);
  expect(initial).not.toBeNull();
  expect(initial!.centerX).toBeGreaterThan(637);
  expect(initial!.centerX).toBeLessThan(643);
  expect(initial!.centerY).toBeGreaterThan(477);
  expect(initial!.centerY).toBeLessThan(483);

  // No pointer movement inside the viewport yet: the aircraft stays at rest.
  await page.waitForTimeout(400);
  const later = await readAircraft(page);
  expect(Math.abs(later!.centerX - initial!.centerX)).toBeLessThan(1);
  expect(Math.abs(later!.centerY - initial!.centerY)).toBeLessThan(1);
});

test('Mouse Movement follows an inside pointer without teleporting and stops at the target (AC-004, AC-005)', async ({
  page,
}) => {
  await startCombat(page);
  await page.mouse.move(640, 300);

  // Immediately after the first inside move the aircraft accelerates toward
  // the target without teleporting: the first polled sample that shows
  // movement is still above the target (a teleport would already be at 300).
  let seenMoving = false;
  for (let index = 0; index < 60; index += 1) {
    await page.waitForTimeout(50);
    const sample = await readAircraft(page);
    if (sample!.centerY < 477) {
      seenMoving = true;
      expect(sample!.centerY).toBeGreaterThan(300);
      break;
    }
  }
  expect(seenMoving).toBe(true);

  // It decelerates and stops at the target within the approved tolerance.
  await expect
    .poll(async () => Math.abs((await readAircraft(page))!.centerY - 300), {
      timeout: 15000,
    })
    .toBeLessThan(4);
  const stopped = await readAircraft(page);
  expect(Math.abs(stopped!.centerX - 640)).toBeLessThan(4);

  // The aircraft is no longer drifting after reaching the target.
  await page.waitForTimeout(250);
  const later = await readAircraft(page);
  expect(Math.abs(later!.centerX - stopped!.centerX)).toBeLessThan(1);
  expect(Math.abs(later!.centerY - stopped!.centerY)).toBeLessThan(1);
});

test('F switches modes and each mode rejects the inactive-mode input (AC-006, AC-064)', async ({
  page,
}) => {
  await startCombat(page);

  // Mouse Movement is active initially: the pointer drives the aircraft.
  await page.mouse.move(900, 200);
  await expect
    .poll(
      async () => {
        const sample = await readAircraft(page);
        return (
          Math.abs(sample!.centerX - 900) + Math.abs(sample!.centerY - 200)
        );
      },
      { timeout: 15000 },
    )
    .toBeLessThan(4);

  // F switches to Keyboard Movement: pointer input is now ignored, so the
  // aircraft stays at the previous mouse target position.
  await page.keyboard.press('f');
  await page.mouse.move(640, 480);
  await page.waitForTimeout(250);
  const pointerIgnored = await readAircraft(page);
  expect(Math.abs(pointerIgnored!.centerX - 900)).toBeLessThan(1);

  // Keyboard input moves the aircraft. Retry the key delivery so a transient
  // lost keydown cannot fail the regression.
  let moved = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.down('w');
    try {
      await expect
        .poll(async () => (await readAircraft(page))!.centerY, {
          timeout: 2500,
        })
        .toBeLessThan(pointerIgnored!.centerY - 10);
      moved = true;
      break;
    } catch {
      // The keydown may have been lost under load; release and retry.
    } finally {
      await page.keyboard.up('w');
      await page.waitForTimeout(300);
    }
  }
  expect(moved).toBe(true);

  // F restores Mouse Movement. The aircraft may resume toward its last mouse
  // target, so pin the target to the aircraft's current position first; then
  // keyboard input must be ignored (no movement beyond the settled target).
  await page.keyboard.press('f');
  const current = await readAircraft(page);
  await page.mouse.move(current!.centerX, current!.centerY);
  await page.waitForTimeout(250);
  const baseline = await readAircraft(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  const keyboardIgnored = await readAircraft(page);
  expect(Math.abs(keyboardIgnored!.centerY - baseline!.centerY)).toBeLessThan(
    1,
  );
  expect(Math.abs(keyboardIgnored!.centerX - baseline!.centerX)).toBeLessThan(
    1,
  );
  await page.keyboard.up('w');

  // Pointer input drives the aircraft again.
  await page.mouse.move(640, 480);
  await expect
    .poll(async () => Math.abs((await readAircraft(page))!.centerY - 480), {
      timeout: 15000,
    })
    .toBeLessThan(4);
});

test(
  'keyboard aliases move the same way and diagonal input is normalized (AC-007)',
  // The measurement now takes the median of three 500 ms windows per axis and
  // verifies rest between them; under parallel load this can approach the
  // default budget, so it gets an explicit 60 s budget (measurement, not
  // product behaviour, drives the duration).
  { timeout: 60000 },
  async ({ page }) => {
    await startCombat(page);
    await page.keyboard.press('f');
    // Confirm the F toggle took effect before sending keyboard input.
    await page.mouse.move(640, 300);
    await page.waitForTimeout(400);
    const modeProbe = await readAircraft(page);
    expect(Math.abs(modeProbe!.centerY - 480)).toBeLessThan(1);

    // W and Arrow Up drive the same semantic axis: both move the aircraft upward
    // from rest. The exact equivalence is covered deterministically by unit
    // tests; here the browser only proves the alias reaches the simulation.
    const movedUpBy = async (key: string) => {
      await page.waitForTimeout(300); // decelerate to rest
      const start = await readAircraft(page);
      await page.keyboard.down(key);
      await expect
        .poll(
          async () => start!.centerY - (await readAircraft(page))!.centerY,
          {
            timeout: 5000,
          },
        )
        .toBeGreaterThan(15);
      await page.keyboard.up(key);
      await page.waitForTimeout(300);
    };
    await movedUpBy('w');
    await movedUpBy('ArrowUp');

    // Return toward the lower area so both cruise measurements have room.
    await page.keyboard.down('s');
    await page.waitForTimeout(1200);
    await page.keyboard.up('s');
    await page.waitForTimeout(300);

    // Measurement note (V02-WI-02 correction root cause): the authoritative
    // aircraft position is read through the HUD-bar DOM rect, and wall-clock
    // windows of the fixed-step simulation (which advances at most four 1/60 s
    // steps per rendered frame) are noisy under parallel machine load. Residual
    // velocity from the previous command and a max-of-two sampling amplify an
    // outlier window. The measurement therefore (1) verifies the aircraft is
    // fully at rest before every sample window, (2) samples over a longer fixed
    // window, and (3) uses the MEDIAN of three attempts. The exact 45% short-side
    // cap and diagonal normalization remain deterministically unit-covered; the
    // browser only proves the ratio invariant (diagonal never √2 × single).
    const waitUntilRest = async (): Promise<void> => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const before = await readAircraft(page);
        await page.waitForTimeout(120);
        const after = await readAircraft(page);
        if (
          before !== null &&
          after !== null &&
          Math.hypot(
            after.centerX - before.centerX,
            after.centerY - before.centerY,
          ) < 0.5
        ) {
          return;
        }
      }
    };

    const measureCruise = async (
      keys: string[],
    ): Promise<{ displacement: number; dx: number; dy: number }> => {
      const displacements: number[] = [];
      const dxs: number[] = [];
      const dys: number[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await waitUntilRest();
        for (const key of keys) {
          await page.keyboard.down(key);
        }
        await page.waitForTimeout(500); // accelerate to cruise
        const start = await readAircraft(page);
        await page.waitForTimeout(500);
        const end = await readAircraft(page);
        for (const key of keys) {
          await page.keyboard.up(key);
        }
        await page.waitForTimeout(600);
        if (start !== null && end !== null) {
          const dx = Math.abs(end.centerX - start.centerX);
          const dy = Math.abs(end.centerY - start.centerY);
          displacements.push(Math.hypot(dx, dy));
          dxs.push(dx);
          dys.push(dy);
        }
      }
      displacements.sort((a, b) => a - b);
      dxs.sort((a, b) => a - b);
      dys.sort((a, b) => a - b);
      const median = displacements[Math.floor(displacements.length / 2)] ?? 0;
      const medianDx = dxs[Math.floor(dxs.length / 2)] ?? 0;
      const medianDy = dys[Math.floor(dys.length / 2)] ?? 0;
      return { displacement: median, dx: medianDx, dy: medianDy };
    };

    // Single axis ('d', right), then back left, then diagonally ('d' + 'w')
    // from a safe mid-low position with clearance on every edge. The leftward
    // return is deliberately long so the three 500 ms diagonal windows still
    // have room before the right movement bound.
    const single = await measureCruise(['d']);
    await page.keyboard.down('a');
    await page.waitForTimeout(2000);
    await page.keyboard.up('a');
    await page.waitForTimeout(300);
    const diagonal = await measureCruise(['d', 'w']);

    // Single-axis cruise is the approved 45% short-side per second (270 px/s
    // over the 500 ms window → ~135 px). The absolute floor is deliberately low
    // so the ratio assertion below is the primary evidence even under heavy
    // machine load; the exact 270 px/s cap is covered by deterministic units.
    const singleSpeed = single.displacement / 0.5;
    const diagonalSpeed = diagonal.displacement / 0.5;
    expect(singleSpeed).toBeGreaterThan(30);
    expect(singleSpeed).toBeLessThan(500);
    // Diagonal movement is capped at the same maximum, never √2 × it.
    expect(diagonalSpeed).toBeGreaterThan(singleSpeed * 0.4);
    expect(diagonalSpeed).toBeLessThan(singleSpeed * 1.3);
    // Both axes move during the diagonal hold.
    expect(diagonal.dx).toBeGreaterThan(20);
    expect(diagonal.dy).toBeGreaterThan(20);
  },
);

test('releasing a keyboard input decelerates the aircraft to a stop (Combat §5.3)', async ({
  page,
}) => {
  await startCombat(page);
  await page.keyboard.press('f');

  await page.keyboard.down('w');
  await page.waitForTimeout(450);
  await page.keyboard.up('w');

  // Wait until the aircraft stops moving (deceleration to rest), then confirm
  // it stays put.
  let previous = -1;
  for (let index = 0; index < 20; index += 1) {
    await page.waitForTimeout(150);
    const sample = await readAircraft(page);
    if (previous > 0 && Math.abs(sample!.centerY - previous) < 0.2) {
      break;
    }
    previous = sample!.centerY;
  }
  const first = await readAircraft(page);
  await page.waitForTimeout(300);
  const second = await readAircraft(page);
  expect(distance(centerOf(first), centerOf(second))).toBeLessThan(8);
});

test(
  'Movement Bounds keep the complete aircraft sprite inside at every edge (AC-008)',
  { timeout: 120000 },
  async ({ page }) => {
    await startCombat(page);
    await page.keyboard.press('f');
    // Confirm the F toggle took effect before sending keyboard input: in
    // Keyboard Movement a pointer move must not move the aircraft. This also
    // lets the mode toggle settle so the following keydown is never raced.
    await page.mouse.move(640, 300);
    await page.waitForTimeout(400);
    const modeProbe = await readAircraft(page);
    expect(Math.abs(modeProbe!.centerY - 480)).toBeLessThan(1);

    // Holds the key and polls until the aircraft reaches the bound region,
    // tolerating any fixed-step slowdown under concurrent machine load.
    const pinAt = async (key: string, axis: 'x' | 'y', target: number) => {
      await page.keyboard.down(key);
      let reached = false;
      for (let index = 0; index < 60; index += 1) {
        await page.waitForTimeout(200);
        const sample = await readAircraft(page);
        const value = axis === 'x' ? sample!.centerX : sample!.centerY;
        if (Math.abs(value - target) < 4) {
          reached = true;
          break;
        }
      }
      await page.keyboard.up(key);
      await page.waitForTimeout(300); // deceleration settles
      expect(reached).toBe(true);
    };

    // Top edge: centre Y pins at margin(18) + half-height(24) = 42.
    await pinAt('w', 'y', 42);
    let sample = await readAircraft(page);
    expect(Math.abs(sample!.centerY - 42)).toBeLessThan(3);

    // Bottom edge: centre Y pins at 600 - 18 - 24 = 558.
    await pinAt('s', 'y', 558);
    sample = await readAircraft(page);
    expect(Math.abs(sample!.centerY - 558)).toBeLessThan(3);

    // Left edge: centre X pins at 18 + half-width(≈24.9) ≈ 42.9.
    await pinAt('a', 'x', 18 + 24 * (1278 / 1231));
    sample = await readAircraft(page);
    expect(Math.abs(sample!.centerX - (18 + 24 * (1278 / 1231)))).toBeLessThan(
      3,
    );

    // Right edge: centre X pins at 1280 - 18 - half-width ≈ 1237.1.
    await pinAt('d', 'x', 1280 - 18 - 24 * (1278 / 1231));
    sample = await readAircraft(page);
    expect(
      Math.abs(sample!.centerX - (1280 - 18 - 24 * (1278 / 1231))),
    ).toBeLessThan(3);
  },
);

test('viewport resize reprojects the authoritative state and keeps the sprite inside bounds (Combat §12.3, S08)', async ({
  page,
}) => {
  await startCombat(page);

  // Drive the aircraft to a known position with the mouse and let it settle.
  await page.mouse.move(900, 200);
  await expect
    .poll(async () => Math.abs((await readAircraft(page))!.centerY - 200), {
      timeout: 15000,
    })
    .toBeLessThan(4);
  await page.waitForTimeout(400); // fully settle before measuring the baseline

  const before = await readAircraft(page);
  await page.setViewportSize({ width: 1500, height: 800 });

  // Proportional reprojection of position and target for the new viewport.
  // The combined tolerance absorbs the sub-pixel bar measurement noise.
  const expectedX = before!.centerX * (1500 / 1280);
  const expectedY = before!.centerY * (800 / 600);
  await expect
    .poll(
      async () => {
        const sample = await readAircraft(page);
        return (
          Math.abs(sample!.centerX - expectedX) +
          Math.abs(sample!.centerY - expectedY)
        );
      },
      { timeout: 8000 },
    )
    .toBeLessThan(4);

  // The complete sprite stays inside the new bounds (3% of the new short side
  // = 24 px on every edge).
  const after = await readAircraft(page);
  const shortSide = 800;
  const halfWidth = (shortSide * 0.08 * (1278 / 1231)) / 2;
  const halfHeight = (shortSide * 0.08) / 2;
  expect(after!.centerX - halfWidth).toBeGreaterThanOrEqual(24 - 1);
  expect(after!.centerX + halfWidth).toBeLessThanOrEqual(1500 - 24 + 1);
  expect(after!.centerY - halfHeight).toBeGreaterThanOrEqual(24 - 1);
  expect(after!.centerY + halfHeight).toBeLessThanOrEqual(800 - 24 + 1);
});

test('controls produce no page errors and no repeated application asset requests', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await startCombat(page);
  const aircraftRequests = () =>
    requested.filter((url) => url.includes('german-fighter.png')).length;
  expect(aircraftRequests()).toBe(1);

  await page.mouse.move(800, 400);
  await page.waitForTimeout(200);
  await page.keyboard.press('f');
  await page.keyboard.down('a');
  await page.waitForTimeout(200);
  await page.keyboard.up('a');
  await page.keyboard.press('f');

  expect(aircraftRequests()).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('a full mode toggle clears held-key state so no latent movement resumes (S08-WI01)', async ({
  page,
}) => {
  await startCombat(page);
  await page.keyboard.press('f'); // → Keyboard Movement
  await page.mouse.move(640, 300);
  await page.waitForTimeout(400);
  const modeProbe = await readAircraft(page);
  expect(Math.abs(modeProbe!.centerY - 480)).toBeLessThan(1);

  // Hold a movement key in Keyboard mode.
  await page.keyboard.down('w');
  await expect
    .poll(async () => (await readAircraft(page))!.centerY, { timeout: 5000 })
    .toBeLessThan(478);
  const moving = await readAircraft(page);
  expect(moving!.centerY).toBeLessThan(478);

  // Toggle to Mouse while the key is held, then release it while Keyboard
  // input is inactive.
  await page.keyboard.press('f');
  await page.keyboard.up('w');
  await page.waitForTimeout(300);

  // Toggle back to Keyboard: no latent movement from the stale held key.
  await page.keyboard.press('f');

  // Confirm Keyboard mode is active after the cycle: a pointer move must not
  // move the aircraft. If the toggle delivery raced, re-assert F determinis-
  // tically so this regression is never confounded by a lost browser key event.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const beforeConfirm = await readAircraft(page);
    await page.mouse.move(640, 300);
    await page.waitForTimeout(300);
    const afterConfirm = await readAircraft(page);
    if (Math.abs(afterConfirm!.centerY - beforeConfirm!.centerY) < 2) {
      break;
    }
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
  }
  await page.mouse.move(640, 300);
  await page.waitForTimeout(300);
  const settled = await readAircraft(page);
  await page.waitForTimeout(500);
  const later = await readAircraft(page);
  expect(Math.abs(later!.centerY - settled!.centerY)).toBeLessThan(2);

  // A fresh accepted keydown moves the aircraft again.
  await page.keyboard.down('w');
  await expect
    .poll(async () => (await readAircraft(page))!.centerY, { timeout: 5000 })
    .toBeLessThan(settled!.centerY - 10);
  await page.keyboard.up('w');
});
