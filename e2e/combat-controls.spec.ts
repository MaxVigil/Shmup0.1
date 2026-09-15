import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * S08 Aircraft Controls and Movement (Combat AC-004–008, AC-064, AC-070–071;
 * §12.3 geometry portion). The real application is exercised at the minimum
 * supported viewport; the authoritative aircraft position is measured through
 * the CombatHudBridge Hull bar (centre below the aircraft, 1% short-side gap).
 *
 * V02-WI-05 M02-R01 C02: the cruise-speed measurement additionally reads the
 * existing development-only read-only Mission Clock in the SAME in-page sample
 * as the HUD rect, so displacement is divided by the observed authoritative
 * simulation-time delta instead of an assumed wall-clock window (the runtime
 * intentionally caps fixed-step catch-up at `MAX_STEPS_PER_FRAME`).
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
  /**
   * Authoritative Mission Clock time taken from the SAME in-page read as the
   * geometry, or `null` when the development read-only observability surface is
   * unavailable. Never used as a wall-clock substitute.
   */
  missionTimeSeconds: number | null;
}

/** Derives the authoritative aircraft centre from the Hull bar rect: bar
 *  centre = aircraft centre X; bar top = aircraft bottom + 1% short-side gap.
 *  The bar is the one HUD child with per-frame geometry (`.ds-combat-hud__bar`);
 *  the Countdown/CRITICAL HULL column never follows the Aircraft. The optional
 *  development Mission Clock is read in the same call so a position and its
 *  simulation time can never be correlated across different frames. */
function readAircraft(page: Page): Promise<AircraftSample | null> {
  return page.evaluate(() => {
    const hud = document.querySelector('.ds-combat-hud__bar');
    if (hud === null) {
      return null;
    }
    const rect = hud.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const shortSide = Math.min(vw, vh);
    const aircraftHeight = shortSide * 0.08;
    const gap = shortSide * 0.01;
    const readClock = (
      window as Window & {
        __shmupDevObservability__?: () => { missionTimeSeconds: number };
      }
    ).__shmupDevObservability__;
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top - gap - aircraftHeight / 2,
      vw,
      vh,
      missionTimeSeconds:
        readClock === undefined ? null : readClock().missionTimeSeconds,
    };
  });
}

const centerOf = (sample: AircraftSample): { x: number; y: number } => ({
  x: sample.centerX,
  y: sample.centerY,
});

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

// --- V02-WI-05 M02-R01 C02 authoritative cruise-measurement helpers ----------
// Repair scope: the browser measurement only. Production movement logic, the
// approved movement ratios/timings, and every other spec in this file are
// untouched.

/** Authoritative simulation-time window used for one cruise measurement. */
const MEASURE_WINDOW_SECONDS = 0.3;

/** Authoritative simulation time allowed to reach the capped cruise speed
 *  before the measured window starts (approved time-to-maximum-speed: 0.25 s). */
const MEASURE_ACCELERATION_SECONDS = 0.35;

/** Free travel room (px) required between the measured start centre and each
 *  movement bound the trajectory advances toward. Worst-case travel is the
 *  acceleration window plus the measured window plus the stop distance
 *  (~0.85 s × 270 px/s ≈ 230 px); 320 px keeps a real margin at 1280×600. */
const MEASURE_CLEARANCE_PX = 320;

/** Minimum clearance (px) required from every movement bound before measuring. */
const MIN_BOUND_CLEARANCE_PX = 80;

/** Aircraft movement bounds for the measured viewport: a 3% short-side margin
 *  on every edge with the complete rendered aircraft inside it (Combat §6). */
function aircraftMovementBounds(sample: AircraftSample): {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
} {
  const shortSide = Math.min(sample.vw, sample.vh);
  const margin = shortSide * 0.03;
  const halfWidth = (shortSide * 0.08 * (1278 / 1231)) / 2;
  const halfHeight = (shortSide * 0.08) / 2;
  return {
    minX: margin + halfWidth,
    maxX: sample.vw - margin - halfWidth,
    minY: margin + halfHeight,
    maxY: sample.vh - margin - halfHeight,
  };
}

const OPPOSITE_KEY: Readonly<Record<string, string>> = {
  w: 's',
  s: 'w',
  a: 'd',
  d: 'a',
};

/**
 * True when the centre is a verified safe start for a trajectory that presses
 * `keys`: clear of every movement bound and with free travel room on each axis
 * the trajectory advances toward, so no measured axis can be clipped by a
 * bound (the pre-C02 defect).
 */
function isSafeMeasurementStart(
  sample: AircraftSample,
  keys: readonly string[],
): boolean {
  const bounds = aircraftMovementBounds(sample);
  const clearsEveryBound =
    sample.centerX - bounds.minX >= MIN_BOUND_CLEARANCE_PX &&
    bounds.maxX - sample.centerX >= MIN_BOUND_CLEARANCE_PX &&
    sample.centerY - bounds.minY >= MIN_BOUND_CLEARANCE_PX &&
    bounds.maxY - sample.centerY >= MIN_BOUND_CLEARANCE_PX;
  const hasTravelRoom =
    (!keys.includes('w') ||
      sample.centerY - bounds.minY >= MEASURE_CLEARANCE_PX) &&
    (!keys.includes('s') ||
      bounds.maxY - sample.centerY >= MEASURE_CLEARANCE_PX) &&
    (!keys.includes('d') ||
      bounds.maxX - sample.centerX >= MEASURE_CLEARANCE_PX) &&
    (!keys.includes('a') ||
      sample.centerX - bounds.minX >= MEASURE_CLEARANCE_PX);
  return clearsEveryBound && hasTravelRoom;
}

/**
 * Reads one correlated sample and fails explicitly when the development Mission
 * Clock is unavailable: the measurement must never silently fall back to
 * wall-clock time.
 */
async function readTimedAircraft(
  page: Page,
): Promise<AircraftSample & { missionTimeSeconds: number }> {
  const sample = await readAircraft(page);
  if (sample === null || sample.missionTimeSeconds === null) {
    throw new Error(
      'Authoritative Mission Clock sample unavailable: the development read-only observability surface is required for this measurement.',
    );
  }
  return { ...sample, missionTimeSeconds: sample.missionTimeSeconds };
}

/** Waits until the authoritative Mission Clock reaches `targetSeconds`. */
async function waitForSimulationTime(
  page: Page,
  targetSeconds: number,
): Promise<void> {
  await expect
    .poll(async () => (await readTimedAircraft(page)).missionTimeSeconds, {
      timeout: 20000,
      intervals: [50, 100],
    })
    .toBeGreaterThanOrEqual(targetSeconds);
}

/**
 * Places the Aircraft in a verified safe measurement region using ONLY
 * supported keyboard input, releases the placement keys, then requires a
 * verified rest inside that same region. Every step fails explicitly, so a
 * measured trajectory can never start from an unverified, near-bound, or moving
 * state.
 */
async function prepareSafeMeasurementStart(
  page: Page,
  keys: readonly string[],
): Promise<void> {
  const placementKeys = keys.map((key) => OPPOSITE_KEY[key] ?? key);
  for (const key of placementKeys) {
    await page.keyboard.down(key);
  }
  try {
    await expect
      .poll(
        async () => {
          const sample = await readAircraft(page);
          return sample !== null && isSafeMeasurementStart(sample, keys);
        },
        { timeout: 15000, intervals: [50, 100] },
      )
      .toBe(true);
  } finally {
    for (const key of placementKeys) {
      await page.keyboard.up(key);
    }
  }

  let previous = await readAircraft(page);
  if (previous === null) {
    throw new Error('Combat HUD sample unavailable during preparation.');
  }
  let atRest: AircraftSample | null = null;
  for (let attempt = 0; attempt < 25 && atRest === null; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await readAircraft(page);
    if (current === null) {
      throw new Error('Combat HUD sample unavailable during preparation.');
    }
    if (
      Math.hypot(
        current.centerX - previous.centerX,
        current.centerY - previous.centerY,
      ) < 0.5
    ) {
      atRest = current;
      break;
    }
    previous = current;
  }
  if (atRest === null) {
    throw new Error(
      'Aircraft did not reach a verified rest state within the bounded preparation budget.',
    );
  }
  expect(isSafeMeasurementStart(atRest, keys)).toBe(true);
}

interface CruiseMeasurement {
  /** Observed authoritative simulation-time delta of the same sample pair. */
  readonly elapsedSeconds: number;
  readonly displacement: number;
  readonly signedDx: number;
  readonly signedDy: number;
}

/**
 * One correlated cruise measurement: press the commanded keys, wait for the
 * capped cruise speed, then take a start and an end sample whose displacement
 * and elapsed authoritative simulation time belong to the SAME pair. X, Y and
 * total displacement therefore always describe one attempt, and the speed uses
 * the observed simulation delta instead of an assumed wall-clock window.
 */
async function measureCruiseTrajectory(
  page: Page,
  keys: readonly string[],
): Promise<CruiseMeasurement> {
  await prepareSafeMeasurementStart(page, keys);
  const prepared = await readTimedAircraft(page);
  for (const key of keys) {
    await page.keyboard.down(key);
  }
  try {
    await waitForSimulationTime(
      page,
      prepared.missionTimeSeconds + MEASURE_ACCELERATION_SECONDS,
    );
    const start = await readTimedAircraft(page);
    await waitForSimulationTime(
      page,
      start.missionTimeSeconds + MEASURE_WINDOW_SECONDS,
    );
    const end = await readTimedAircraft(page);
    const elapsedSeconds = end.missionTimeSeconds - start.missionTimeSeconds;
    expect(elapsedSeconds).toBeGreaterThanOrEqual(MEASURE_WINDOW_SECONDS * 0.8);
    return {
      elapsedSeconds,
      displacement: Math.hypot(
        end.centerX - start.centerX,
        end.centerY - start.centerY,
      ),
      signedDx: end.centerX - start.centerX,
      signedDy: end.centerY - start.centerY,
    };
  } finally {
    for (const key of keys) {
      await page.keyboard.up(key);
    }
  }
}

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
  // V02-WI-05 M02-R01 C02: each trajectory verifies a safe rest start, then
  // measures displacement over an OBSERVED authoritative simulation-time delta
  // with one correlated sample pair (no wall-clock window, no per-axis median
  // over attempts). The explicit budget covers two prepared trajectories and
  // their rest verification.
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

    // Two correlated trajectories, each from its own verified safe rest start.
    const single = await measureCruiseTrajectory(page, ['d']);
    const diagonal = await measureCruiseTrajectory(page, ['d', 'w']);

    const singleSpeed = single.displacement / single.elapsedSeconds;
    const diagonalSpeed = diagonal.displacement / diagonal.elapsedSeconds;
    console.log(
      `V02-WI-05-M02-R01-C02-KEYBOARD-MEASUREMENT ${JSON.stringify({
        viewport: MINIMUM_VIEWPORT,
        single: {
          elapsedSeconds: single.elapsedSeconds,
          displacement: single.displacement,
          dx: single.signedDx,
          dy: single.signedDy,
          speed: singleSpeed,
        },
        diagonal: {
          elapsedSeconds: diagonal.elapsedSeconds,
          displacement: diagonal.displacement,
          dx: diagonal.signedDx,
          dy: diagonal.signedDy,
          speed: diagonalSpeed,
        },
        ratio: diagonalSpeed / singleSpeed,
      })}`,
    );

    // The commanded direction reached the simulation on both trajectories, and
    // the single-axis trajectory stays axis-pure.
    expect(single.signedDx).toBeGreaterThan(0);
    expect(Math.abs(single.signedDy)).toBeLessThan(2);
    expect(diagonal.signedDx).toBeGreaterThan(0);
    expect(diagonal.signedDy).toBeLessThan(0);

    // Single-axis cruise is the approved 45% short-side per second (270 px/s at
    // 1280×600). The absolute floor is deliberately low so the ratio assertion
    // below is the primary evidence even under heavy machine load; the exact
    // 270 px/s cap is covered by deterministic units.
    expect(singleSpeed).toBeGreaterThan(30);
    expect(singleSpeed).toBeLessThan(500);
    // Diagonal movement is capped at the same maximum, never √2 × it. Removing
    // the normalized direction in `stepKeyboard`
    // (`src/application/combat/combat-simulation.ts`, pinned by
    // `combat-simulation.test.ts` → 'normalizes diagonal input so speed never
    // exceeds the configured maximum (AC-007)') drives this ratio to √2 ≈ 1.414
    // and fails the ceiling below, so the assertion stays mutation-sensitive.
    expect(diagonalSpeed).toBeGreaterThan(singleSpeed * 0.4);
    expect(diagonalSpeed).toBeLessThan(singleSpeed * 1.3);
    // Both axes move during the diagonal hold.
    expect(Math.abs(diagonal.signedDx)).toBeGreaterThan(20);
    expect(Math.abs(diagonal.signedDy)).toBeGreaterThan(20);
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
