import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * S14 production smoke (Delivery §7.1–7.9, DELIVERY-AC-001–005, Master
 * §7.10–7.11, MASTER-AC-014/016, Verification §9). This project runs only
 * against the fresh production build served by `vite preview`; the full
 * behavioural browser suite lives in the development project. The smoke
 * re-verifies the complete golden path on the built artifact and adds the
 * production-only boundaries: relative base paths, the distinct lazy Combat
 * chunk, Debug exclusion, a clean console with the build identifier, the
 * runtime request boundary, and artifact hygiene.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

/** Natural-Defeat session seed used by the deterministic fixed-seed path. */
const DEFEAT_SESSION_SEED = 19023;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

async function startCombat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Interception' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
}

test('cold page load reaches Operations with a clean console and a build identifier (DELIVERY-AC-003, Master §7.11)', async ({
  page,
}) => {
  const consoleMessages: { type: string; text: string }[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) =>
    consoleMessages.push({ type: message.type(), text: message.text() }),
  );
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // One build identifier is available in console diagnostics. S14-WI01: a
  // build of an uncommitted candidate must be labelled `-dirty` and can never
  // masquerade as a clean committed revision; both states are valid here
  // because the tested S14 delta is uncommitted until acceptance.
  const buildLine = consoleMessages.find(
    (message) =>
      message.type === 'info' && message.text.startsWith('[shmup] build '),
  );
  expect(buildLine).toBeDefined();
  expect(buildLine!.text).toMatch(
    /^\[shmup\] build shmup@0\.1\.0 \((unknown|[0-9a-f]{7,40}(-dirty)?)\)$/,
  );

  // Normal golden-path use produces no uncaught error or application warning.
  const appErrors = consoleMessages.filter(
    (message) => message.type === 'error' || message.type === 'warning',
  );
  expect(appErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('Operations and Hangar navigate with the active state preserved (Delivery §7.2, Base AC-002–004)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hangar' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('button', { name: 'Operations' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Operations' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('weapon selection and Repair availability rules work (Delivery §7.3, Base AC-019–025, AC-050)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();

  // Repair is hidden at full Hull Integrity (Base AC-025).
  await expect(page.getByRole('button', { name: 'Repair' })).toHaveCount(0);

  // The Weapon Selection transaction equips Cannon only after Confirm.
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
  await expect(
    page.locator('.ds-aircraft-configuration-panel').getByText('Cannon'),
  ).toBeVisible();
});

test('mission start lazily loads the distinct Combat chunk and reaches one canvas (Delivery §7.4, Combat AC-001, Verification §9)', async ({
  page,
}) => {
  const scriptPaths: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') {
      scriptPaths.push(new URL(request.url()).pathname);
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const scriptsAfterBoot = [...scriptPaths];
  expect(scriptsAfterBoot.length).toBeGreaterThanOrEqual(1);

  // The lazy Combat chunk must not be loaded during Boot or Base.
  await startCombat(page);
  await page.waitForLoadState('networkidle');

  const combatChunkPaths = scriptPaths
    .slice(scriptsAfterBoot.length)
    .filter((path) => !scriptsAfterBoot.includes(path));
  expect(combatChunkPaths.length).toBeGreaterThanOrEqual(1);
  for (const path of combatChunkPaths) {
    expect(path).toMatch(/^\/assets\/[^/]+\.js$/);
  }
});

test('Return to Base resolves Aborted with no reward and opens Operations directly (Delivery §7.6, Combat AC-037)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to Base' }).click();

  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test(
  'a natural Defeat resolves once and Continue returns to Operations for the next mission (Delivery §7.5, Combat AC-010/028–036, MASTER-AC-005)',
  // The natural mission simulates ~24 s under the fixed-step clock; the
  // explicit 60 s budget covers the simulation, not the assertions.
  { timeout: 60000 },
  async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript((value) => {
      const original = globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
      );
      globalThis.crypto.getRandomValues = (array) => {
        if (array instanceof Uint32Array) {
          array.fill(value >>> 0);
          return array;
        }
        return original(array);
      };
    }, DEFEAT_SESSION_SEED);

    await page.goto('/');
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await startCombat(page);

    const dialog = page.getByRole('dialog');
    await expect
      .poll(
        async () => {
          if ((await dialog.count()) === 0) {
            return null;
          }
          return dialog.getByRole('heading').textContent();
        },
        { timeout: 50000 },
      )
      .toBe('Mission Failed');
    await expect(dialog.getByText('Reward')).toBeVisible();
    await expect(dialog.getByText('0 Credits')).toBeVisible();

    const continueButton = dialog.getByRole('button', { name: 'Continue' });
    await expect(continueButton).toBeFocused();
    await continueButton.click();
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await expect(page.getByText('Credits: 12')).toBeVisible();

    // The committed emergency-recovery Hull (25) drives the next mission.
    await page.getByRole('button', { name: 'Interception' }).click();
    await page.getByRole('button', { name: 'Start Mission' }).click();
    await expect(page.getByTestId('combat-screen')).toBeVisible();
    await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
      timeout: 15000,
    });
    await expect
      .poll(
        () =>
          page.locator('.ds-combat-hud__track').getAttribute('aria-valuenow'),
        { timeout: 5000 },
      )
      .toBe('25');

    expect(pageErrors).toEqual([]);
  },
);

test('refresh during an active mission resolves exactly once as Defeat with paid full Repair (Epic §14.3, V02-AC-018)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('one representative asset-failure fallback keeps the app usable (Delivery §7.8, MASTER-AC-003)', async ({
  page,
}) => {
  await page.route('**/aircraft/german-fighter.png', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await expect(
    page.locator('.ds-hangar-aircraft-fallback').getByText('German Fighter'),
  ).toBeVisible();
});

test('production has no Debug UI, F1 has no effect, and no Debug label is reachable (Delivery §7.9, DELIVERY-AC-003)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  await page.keyboard.press('F1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText(/God Mode|Win Mission|Lose Mission/i),
  ).toHaveCount(0);

  // The non-Debug lifecycle shell is unaffected in production.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('runtime requests stay on localhost, request no prohibited asset, and load each manifest asset once (MASTER-AC-014, DELIVERY-AC-002)', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  // Complete golden-path traversal: Boot, Operations, Hangar, Overlays,
  // Combat, and Return to Base.
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Hangar' }).click();
  await expect(page.getByTestId('hangar-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Change Weapon' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
  await page.getByRole('button', { name: 'Operations' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);
  await page.keyboard.press('KeyP');
  await page.getByRole('button', { name: 'Return to Base' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.waitForLoadState('networkidle');

  const origin = new URL(page.url()).origin;
  const httpRequests = requests.filter((url) => url.startsWith('http'));
  // Client-only runtime: every request stays on the local static server.
  expect(httpRequests.every((url) => new URL(url).origin === origin)).toBe(
    true,
  );
  // No source JPEG, remote image, font CDN, or speculative asset.
  const prohibited = httpRequests.filter(
    (url) => /\/assets\/source\//.test(url) || /\.jpe?g$/i.test(url),
  );
  expect(prohibited).toEqual([]);

  // Each approved manifest asset is requested at most once per page load.
  const manifestPaths = [
    '/backgrounds/operations-background.webp',
    '/backgrounds/hangar-background.webp',
    '/aircraft/german-fighter.png',
    '/enemies/basic-drone.png',
    '/enemies/ranged-drone.png',
    '/enemies/hunter-drone.png',
    '/enemies/elite-drone-armoured.png',
    '/enemies/elite-drone-vulnerable.png',
    '/fonts/ibm-plex-mono-regular.woff2',
    '/fonts/ibm-plex-mono-medium.woff2',
    '/fonts/ibm-plex-mono-semibold.woff2',
    '/icons/gear.svg',
    '/icons/pause.svg',
    '/icons/crosshair.svg',
    '/icons/map-trifold.svg',
    '/icons/warehouse.svg',
    '/icons/check.svg',
  ];
  for (const path of manifestPaths) {
    const matches = httpRequests.filter(
      (url) => new URL(url).pathname === path,
    );
    expect(matches.length).toBeLessThanOrEqual(1);
  }
});

test('cold production Boot stays within the response-body and asset budgets and records proportional timing evidence (Master §7.10, Epic §16.1, V02-WI-01)', async ({
  page,
}) => {
  // V02-WI-01 evidence: a fresh context is a cold cache, so this measures the
  // proportional local cold-production-Boot response body and interactivity
  // for the seventeen-entry manifest including the five enemy images. The
  // machine-independent budgets are asserted strictly; the timing value is
  // recorded as non-reference proxy evidence (Combat §14.3, Master §7.10).
  const resourceTypes = new Set([
    'document',
    'script',
    'stylesheet',
    'font',
    'image',
    'fetch',
  ]);
  let bodyBytes = 0;
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      url.origin !== new URL(page.url()).origin &&
      url.origin !== 'http://127.0.0.1:4174'
    ) {
      return;
    }
    if (!resourceTypes.has(response.request().resourceType())) {
      return;
    }
    void response.body().then(
      (body) => {
        bodyBytes += body.byteLength;
      },
      () => {
        // A body that cannot be read is excluded; headers are not part of the
        // approved "response body" definition (Master §7.10).
      },
    );
  });

  const startMs = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  const interactiveMs = Date.now() - startMs;
  await page.waitForLoadState('networkidle');
  // Allow the response-body collection microtasks to flush.
  await page.waitForTimeout(250);

  const navigationDuration = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    return entry?.duration ?? -1;
  });

  // Machine-independent budgets: total cold Boot response body ≤ 3 MiB.
  expect(bodyBytes).toBeGreaterThan(0);
  expect(bodyBytes).toBeLessThanOrEqual(3 * 1024 * 1024);

  const dist = join(process.cwd(), 'dist');
  const enemyFiles = readdirSync(join(dist, 'enemies')).filter((file) =>
    file.endsWith('.png'),
  );
  const enemyPackBytes = enemyFiles.reduce(
    (total, file) => total + statSync(join(dist, 'enemies', file)).size,
    0,
  );
  expect(enemyPackBytes).toBeGreaterThan(0);
  expect(enemyPackBytes).toBeLessThanOrEqual(450_000);

  const listFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    });
  // Complete runtime assets in the artifact: everything except the build
  // entry (index.html) and the emitted JS/CSS under dist/assets.
  const runtimeAssetBytes = listFiles(dist)
    .filter((path) => {
      if (path.endsWith('index.html')) {
        return false;
      }
      if (
        path.includes(`${join('assets', '')}`) &&
        /\.[cm]?[jt]s$/.test(path)
      ) {
        return false;
      }
      if (path.endsWith('.css')) {
        return false;
      }
      return true;
    })
    .reduce((total, path) => total + statSync(path).size, 0);
  expect(runtimeAssetBytes).toBeGreaterThan(0);
  expect(runtimeAssetBytes).toBeLessThanOrEqual(2 * 1024 * 1024);

  // Recorded proportional evidence for the handoff (non-reference proxy).
  console.log(
    'V02-WI01-COLD-BOOT',
    JSON.stringify({
      bodyBytes,
      interactiveMs,
      navigationDurationMs: navigationDuration,
      enemyPackBytes,
      runtimeAssetBytes,
      budget: {
        bodyBytesMax: 3 * 1024 * 1024,
        enemyPackMax: 450_000,
        runtimeAssetMax: 2 * 1024 * 1024,
      },
      label: 'non-reference proxy evidence',
    }),
  );
});

test('relative base paths resolve every script, style, and runtime asset under the served origin (Delivery §5, DELIVERY-AC-002)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  const state = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(
      (element) => (element as HTMLScriptElement).src,
    );
    const links = Array.from(document.querySelectorAll('link[href]')).map(
      (element) => (element as HTMLLinkElement).href,
    );
    const background = document.querySelector('.ds-operations-background');
    return {
      base: document.baseURI,
      scripts,
      links,
      backgroundImage:
        background instanceof HTMLElement
          ? getComputedStyle(background).backgroundImage
          : '',
    };
  });

  const origin = new URL(page.url()).origin;
  expect(new URL(state.base).origin).toBe(origin);
  for (const url of [...state.scripts, ...state.links]) {
    expect(new URL(url).origin).toBe(origin);
  }
  // The prepared runtime background is reused as the prepared inline data URI
  // when ready (MASTER-AC-014, V02-WI-02 C02) or resolves through the served
  // base path; in both cases it is applied with no cross-origin dependency.
  if (state.backgroundImage.startsWith('url("data:image/webp;base64,')) {
    expect(state.backgroundImage).toContain('data:image/webp;base64,');
  } else {
    expect(state.backgroundImage).toContain('operations-background.webp');
    expect(new URL(state.backgroundImage, state.base).origin).toBe(origin);
  }
});

test('the production artifact is locally servable and hygienic with a distinct lazy Combat chunk (DELIVERY-AC-001/004, Verification §9)', () => {
  const dist = join(process.cwd(), 'dist');
  expect(existsSync(join(dist, 'index.html'))).toBe(true);

  // The built entry chunk is referenced by index.html; a distinct lazy Combat
  // chunk exists and is not part of the initial dependency graph.
  const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
  const entryMatch = indexHtml.match(/src="\.\/(assets\/[^"]+\.js)"/);
  expect(entryMatch).not.toBeNull();
  const entryPath = join(dist, entryMatch![1]!);
  expect(existsSync(entryPath)).toBe(true);

  const assetsDir = join(dist, 'assets');
  const jsFiles = readdirSync(assetsDir).filter((file) => file.endsWith('.js'));
  expect(jsFiles.length).toBeGreaterThanOrEqual(2);
  const entryFileName = entryMatch![1]!.split('/').pop()!;
  const lazyChunks = jsFiles.filter((file) => file !== entryFileName);
  expect(lazyChunks.length).toBeGreaterThanOrEqual(1);
  // Phaser dominates the lazy Combat chunk, so it is materially larger than
  // the initial application entry.
  const entrySize = statSync(entryPath).size;
  const lazySize = statSync(join(assetsDir, lazyChunks[0]!)).size;
  expect(lazySize).toBeGreaterThan(entrySize);

  // No production source maps, source JPEGs, test artifacts, or dependency
  // directories anywhere in the locally servable directory.
  const listFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    });
  const allFiles = listFiles(dist);
  expect(allFiles.some((file) => /\.map$/i.test(file))).toBe(false);
  expect(allFiles.some((file) => /\.jpe?g$/i.test(file))).toBe(false);
  expect(
    allFiles.some((file) => /\.test\./.test(file) || /\.spec\./.test(file)),
  ).toBe(false);
  expect(allFiles.some((file) => file.includes('node_modules'))).toBe(false);
  expect(
    allFiles.some((file) => file.includes(`${join('assets', 'source')}`)),
  ).toBe(false);

  // The approved runtime asset set is present and servable.
  const approvedAssets = [
    'aircraft/german-fighter.png',
    'backgrounds/operations-background.webp',
    'backgrounds/hangar-background.webp',
    'enemies/basic-drone.png',
    'enemies/ranged-drone.png',
    'enemies/hunter-drone.png',
    'enemies/elite-drone-armoured.png',
    'enemies/elite-drone-vulnerable.png',
    'fonts/ibm-plex-mono-regular.woff2',
    'fonts/ibm-plex-mono-medium.woff2',
    'fonts/ibm-plex-mono-semibold.woff2',
    'icons/gear.svg',
    'icons/pause.svg',
    'icons/crosshair.svg',
    'icons/map-trifold.svg',
    'icons/warehouse.svg',
    'icons/check.svg',
  ];
  for (const relative of approvedAssets) {
    expect(existsSync(join(dist, relative))).toBe(true);
  }
});

test('five consecutive aborted missions leave no Combat residue and no persistent memory growth (Combat AC-048, Master §7.10)', async ({
  page,
  context,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Let Boot/Base preload requests settle before the first mission.
  await page.waitForLoadState('networkidle');

  const baselineHeap = await heapAfterGc(page, context);
  const heapsAfterEach: number[] = [];
  for (let mission = 1; mission <= 5; mission += 1) {
    await startCombat(page);
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to Base' }).click();
    await expect(page.getByTestId('operations-screen')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    heapsAfterEach.push(await heapAfterGc(page, context));
  }
  // Recorded series for evidence: post-Boot baseline then five post-GC values.
  console.log(
    'S14-HEAP-SERIES',
    JSON.stringify({ baselineHeap, heapsAfterEach }),
  );

  // No obsolete Combat-owned DOM survives the fifth Abort.
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Bounded heap contract (S14-WI01): the first mission is the lazy-Combat
  // warm-up and legitimately retains the loaded Phaser runtime, so the contract
  // does NOT claim literal zero growth. It asserts (a) the warm-up footprint
  // stays within a documented warm-up allowance of the post-Boot baseline, and
  // (b) every later mission stays within a documented per-mission noise
  // allowance of the warm-up sample. A retained Phaser Game/Scene per mission
  // would add well above the noise allowance and fail (b) after one mission.
  const warmupHeap = heapsAfterEach[0] ?? 0;
  const warmupAllowanceBytes = 32 * 1024 * 1024;
  const missionNoiseBytes = 12 * 1024 * 1024;
  expect(warmupHeap).toBeLessThan(baselineHeap + warmupAllowanceBytes);
  for (const laterHeap of heapsAfterEach.slice(1)) {
    expect(laterHeap).toBeLessThan(warmupHeap + missionNoiseBytes);
  }

  expect(pageErrors).toEqual([]);
});

/** Forces a full V8 garbage collection and returns the used JS heap in bytes. */
async function heapAfterGc(
  page: Page,
  context: BrowserContext,
): Promise<number> {
  const client = await context.newCDPSession(page);
  await client.send('HeapProfiler.collectGarbage');
  const { usedSize } = await client.send('Runtime.getHeapUsage');
  await client.detach();
  return usedSize;
}
