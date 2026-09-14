import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cpus, platform, release, arch, totalmem } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { readEvidenceOwnership } from './evidence-ownership';

/** V02-WI-04 C03: 32-bit FNV-1a over the UTF-8 bytes of an input string — the
 *  exact canonical RNG-input derivation (Technical Foundation §8) used to
 *  compute the truthful mission seed recorded by the Pass B evidence record.
 *  The versioned input is ASCII, so UTF-8 encoding is identity here. */
function fnv1a32(input: string): number {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    const byte = input.charCodeAt(index);
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

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

/** V02-WI-04 C01 fresh runtime/performance evidence output directory. */
const EVIDENCE_DIR = join(process.cwd(), '.agent-handoff', 'evidence');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

async function startCombat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Interception 01' }).click();
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

test('the v0.1 Return to Base abort path is absent in production while the final Evacuate affordances are present (V02-WI-05 E01/E03)', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  // Active Combat owns the canonical top-right order: destructive text
  // Evacuate, then the Pause and Settings icon Buttons (DS §8.26).
  const utility = page.getByTestId('combat-utility');
  const utilityButtons = utility.getByRole('button');
  await expect(utilityButtons).toHaveCount(3);
  await expect(utilityButtons.nth(0)).toHaveText('Evacuate');
  await expect(utilityButtons.nth(1)).toHaveAttribute('aria-label', 'Pause');
  await expect(utilityButtons.nth(2)).toHaveAttribute('aria-label', 'Settings');

  await page.keyboard.press('KeyP');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  const dialog = page.getByRole('dialog');
  const resume = dialog.getByRole('button', { name: 'Resume' });
  await expect(resume).toBeFocused();
  // The v0.1 instant-Aborted Return to Base action does not exist; the final
  // v0.2 Pause row is Resume plus the destructive Evacuate action.
  await expect(
    dialog.getByRole('button', { name: 'Return to Base' }),
  ).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Evacuate' })).toHaveCount(1);
  await expect(dialog.getByRole('button')).toHaveCount(2);

  // Esc / Resume still restore running Combat; no free resolution exists.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  expect(pageErrors).toEqual([]);
});

test('a successful Evacuation resolves once through the production artifact and Continue returns to Operations without completion or unlock (V02-AC-014/015/023)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  // The production build offers the real destructive Evacuate affordance and the
  // same blocking confirmation. No development seam (Debug, dev observability,
  // IndexedDB rewrite) exists or is used in this test.
  const utility = page.getByTestId('combat-utility');
  await utility.getByRole('button', { name: 'Evacuate' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await expect(confirmation).toContainText(
    'Evacuation takes 5 seconds. Combat continues during the countdown.',
  );
  await expect(
    confirmation.getByRole('button', { name: 'Cancel' }),
  ).toBeFocused();
  await confirmation
    .getByRole('button', { name: 'Confirm Evacuation' })
    .click();

  // The authoritative HUD replacement and the irreversible commitment.
  const countdown = page.locator('.ds-combat-countdown');
  await expect(countdown).toHaveText('EVACUATION 00:05');
  await expect(utility.getByRole('button', { name: 'Evacuate' })).toHaveCount(
    0,
  );

  // The exact zero step is reached through the real 300-step countdown and no
  // result may open at 00:00: the shared exit runs first.
  await expect
    .poll(async () => (await countdown.textContent()) ?? '', {
      timeout: 30000,
      intervals: [50, 100],
    })
    .toBe('EVACUATION 00:00');
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(0);

  const result = page.getByRole('dialog');
  await expect(result.getByRole('heading', { name: 'EVACUATED' })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole('heading', { name: 'EVACUATED' })).toHaveCount(1);
  await expect(result).toContainText('Mission not completed');
  await expect(result.getByText('Completion reward')).toHaveCount(0);
  await expect(result.getByText('Mission unlocked')).toHaveCount(0);
  await expect(result.getByText('Mission reward')).toHaveCount(0);
  const creditsEarnedText = await result
    .locator('.ds-field-row', { hasText: 'Credits earned' })
    .textContent();
  const creditsEarned = Number.parseInt(
    /\d+/.exec(creditsEarnedText ?? '')?.[0] ?? '',
    10,
  );
  expect(Number.isNaN(creditsEarned)).toBe(false);

  // Continue returns to Operations with no completion, no unlock, and no second
  // economy mutation: the durable balance equals the single committed payout.
  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByText(`Credits: ${12 + creditsEarned}`)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Locked)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 01 (Completed)' }),
  ).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('a natural Defeat resolves once and Continue returns to Operations for the next mission (Delivery §7.5, Combat AC-010/028–036, MASTER-AC-005)', async ({
  page,
}) => {
  // V02-WI-04 authored M01 staging (first arrival at 10 s) removes the
  // legacy ~24 s natural Defeat seed. The deterministic natural Defeat now
  // requires the e2 Ranged (55 s) aimed shots plus the e3/e4 Hunter
  // contacts and resolves at ~147 s under the fixed-step clock; the explicit
  // 250 s budget covers the simulation plus residual load, not the
  // assertions.
  test.setTimeout(250_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
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
  // Park the aircraft off the x = 640 auto-fire column so the e2 Ranged
  // survives and its aimed shots land (first hit ~63 s); the e3/e4 Hunter
  // contacts complete the deterministic natural Defeat at ~147 s.
  await page.mouse.move(400, 480);

  // The natural Defeat commits with zero reward and the paid full Repair
  // (Epic §12.4): exactly 8 Credits are deducted, Hull becomes 100, and the
  // v0.2 failure Result Overlay opens (no emergency free recovery remains).
  const dialog = page.getByRole('dialog');
  await expect
    .poll(
      async () => {
        if ((await dialog.count()) === 0) {
          return null;
        }
        return dialog.getByRole('heading').textContent();
      },
      { timeout: 200000 },
    )
    .toBe('MISSION FAILED');
  await expect(dialog.getByText('Reward')).toBeVisible();
  await expect(dialog.getByText('0 Credits')).toBeVisible();
  await expect(dialog.getByText('Repair cost')).toBeVisible();
  await expect(dialog.getByText('-8 Credits')).toBeVisible();

  const continueButton = dialog.getByRole('button', { name: 'Continue' });
  await expect(continueButton).toBeFocused();
  await continueButton.click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();

  // The committed full-Repair Hull (100) drives the next mission.
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  await expect
    .poll(
      () => page.locator('.ds-combat-hud__track').getAttribute('aria-valuenow'),
      { timeout: 5000 },
    )
    .toBe('100');

  expect(pageErrors).toEqual([]);
});

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
  // Combat, Pause (Resume-only in V02-WI-05 E01), and back to running Combat.
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
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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

  // V02-WI-04 C03 artifact-hygiene regression (delta 7): the Pass A
  // instrumentation symbol/API, the development observability accessor, and
  // the evidence-only benchmark scenario must be completely absent from the
  // ordinary production bundle through build-time elimination.
  const jsContents = jsFiles
    .map((file) => readFileSync(join(assetsDir, file), 'utf8'))
    .join('\n');
  for (const symbol of [
    '__shmupEvidence__',
    '__shmupDevObservability__',
    'submitEvidenceBenchmark',
    'spawn-legacy-final-group',
  ]) {
    expect(jsContents.includes(symbol)).toBe(false);
  }

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

test('repeated fixed-seed Defeat/Game Over mission cycles leave no Combat residue and no persistent memory growth (V02-WI-05 E01 interim for V02-AC-027)', async ({
  page,
  context,
}) => {
  // V02-WI-05 E01: the v0.1 instant-Aborted seam is removed and Evacuation is
  // not delivered until E02/E03, so a repeated in-page mission cycle can only
  // end through the canonical terminal outcomes. Each cycle uses the
  // deterministic fixed-seed natural Defeat (~147 s sim time at the authored
  // timeline; the explicit budget covers headless full-suite slowdown). The
  // full five-mission Success/Evacuation/Defeat residue evidence remains owned
  // by V02-AC-027 once Evacuation exists; this interim keeps the same
  // in-page warm-up + no-growth contract truthful for the outcomes available.
  test.setTimeout(900_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
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
  // Let Boot/Base preload requests settle before the first mission.
  await page.waitForLoadState('networkidle');

  const baselineHeap = await heapAfterGc(page, context);
  const heapsAfterEach: number[] = [];

  /** Starts one mission and parks the aircraft off the auto-fire column so the
   *  deterministic fixed-seed Ranged/Hunter contact Defeat resolves. */
  const startDefeatRun = async (): Promise<void> => {
    await startCombat(page);
    await page.mouse.move(400, 480);
  };

  /** Waits for the natural Defeat resolution and returns to Operations through
   *  Continue (affordable Repair) or the confirmed New Game (Game Over). */
  const resolveDefeatToOperations = async (): Promise<void> => {
    // Affordable Repair (Credits >= 8) opens the MISSION FAILED Result Overlay;
    // an unaffordable Defeat opens the terminal Game Over Screen.
    await expect
      .poll(
        async () => {
          const failed = await page
            .getByRole('heading', { name: 'MISSION FAILED' })
            .count();
          const gameOver = await page.getByTestId('game-over-screen').count();
          return failed + gameOver;
        },
        { timeout: 420000, intervals: [250, 500, 1000] },
      )
      .toBeGreaterThan(0);
    if ((await page.getByTestId('game-over-screen').count()) > 0) {
      await page.getByRole('button', { name: 'New Game' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByTestId('operations-screen')).toBeVisible();
      await expect(page.getByText('Credits: 12')).toBeVisible();
      return;
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('operations-screen')).toBeVisible();
  };

  // Cycle 1: natural Defeat with affordable Repair (12 − 8 → 4 Credits).
  await startDefeatRun();
  await resolveDefeatToOperations();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  heapsAfterEach.push(await heapAfterGc(page, context));

  // Cycle 2: a second natural Defeat is unaffordable (4 < 8) and resolves as
  // Game Over; the confirmed New Game returns to Operations with 12 Credits.
  await startDefeatRun();
  await resolveDefeatToOperations();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  heapsAfterEach.push(await heapAfterGc(page, context));

  // Recorded series for evidence: post-Boot baseline then the post-GC values.
  console.log(
    'S14-HEAP-SERIES',
    JSON.stringify({ baselineHeap, heapsAfterEach }),
  );

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

/**
 * V02-WI-05 E02 C03 Pass B workload-integrity harness (Epic §20.1,
 * V02-AC-028). The independent review found that this record sampled 1.5 s
 * after the Combat Countdown reached `00:00` and then measured frame timing
 * without proving that Combat, the single canvas, the Combat HUD, and the
 * `00:00` Countdown remained active: the deterministic natural Mission 01 run
 * resolves Defeat ~4.7 s after the 03:10 final arrival, so the sample could
 * (and did) contain Base/terminal/Result Overlay frames and still record a
 * plausible FPS number.
 *
 * The corrected harness:
 * - drives the Aircraft with supported pointer input only — the canonical
 *   maximum-speed horizontal triangle sweep at `80% VH`, in short bursts
 *   released by the authored Combat Countdown values `01:28`, `00:45`, and
 *   `00:00` (the Countdown is the approved player-visible HUD and is derived
 *   from the mission clock, so the bursts stay aligned to the authored e3/e4/e5
 *   arrival windows independent of frame-rate load). This is the §9.2/§9.3
 *   counterplay (displace out of the projected firing line and provoke the
 *   committed Hunter run), keeps the Aircraft operational through the authored
 *   e5 window, and uses no Debug/evidence mutation, hidden entity-read API,
 *   time acceleration, threshold reduction, or smaller workload;
 * - proves the real Combat Screen, exactly one canvas, the Combat HUD, the
 *   `00:00` Combat Countdown, and the absence of any terminal/result/Base frame
 *   before the sample and at the start, middle, and end of the timing sample
 *   itself (in-page DOM probes inside the sampling loop);
 * - writes the COMPLETE raw observation — including the invalid-workload
 *   state — BEFORE any budget assertion can abort the test, so a failing run
 *   always leaves truthful evidence that `npm run evidence:compare` and
 *   `npm run evidence:mutation` reject.
 */
/** Duration of the pre-sample part of the final-arrival dodge burst (ms). */
const PASS_B_PRE_SAMPLE_MS = 1500;
const PASS_B_SAMPLE_WINDOW_MS = 6000;
const PASS_B_FLIGHT = {
  /** Aircraft hold/sweep altitude as a fraction of viewport height. */
  altitudeFraction: 0.8,
  minWidthFraction: 0.1,
  maxWidthFraction: 0.9,
  /** Pointer-move cadence for the sweep (real player-rate input). */
  moveIntervalMs: 50,
  /** Canonical maximum Aircraft speed (45% of the viewport short side). */
  speedRatioPerSecond: 0.45,
} as const;
/** The authored Combat Countdown values that release each dodge burst. */
const PASS_B_BURSTS = [
  { countdownText: '01:28', durationMs: 5000 },
  { countdownText: '00:45', durationMs: 5000 },
  { countdownText: '00:00', durationMs: 8000 },
] as const;
/**
 * The fixed, ordered Pass B observation contract consumed by
 * `scripts/compare-performance-evidence.mjs`: one pre-sample probe plus the
 * timing sample's start/middle/end probes. The validator validates each raw
 * probe's shape and values and derives every accepted workload fact from them.
 */
const PASS_B_PROBE_ORDER = [
  'pre-sample',
  'sample-start',
  'sample-mid',
  'sample-end',
] as const;

/** The player-visible Combat facts the harness must prove for a valid sample. */
interface CombatDomProbe {
  readonly combatScreenVisible: boolean;
  readonly canvasCount: number;
  readonly combatHudCount: number;
  readonly countdownText: string | null;
  readonly dialogCount: number;
  readonly resultOverlayCount: number;
  readonly gameOverScreenCount: number;
  readonly operationsScreenCount: number;
}

interface PassBSample {
  readonly deltas: number[];
  readonly longTasks: number[];
  readonly probes: CombatDomProbe[];
}

/** Reads the approved Combat presentation facts from the real DOM. */
function combatDomProbeExpression(): CombatDomProbe {
  const countdown = document.querySelector('.ds-combat-countdown');
  return {
    combatScreenVisible:
      document.querySelector('[data-testid="combat-screen"]') !== null,
    canvasCount: document.querySelectorAll('canvas').length,
    combatHudCount: document.querySelectorAll('.ds-combat-hud').length,
    countdownText: countdown === null ? null : countdown.textContent,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    resultOverlayCount: document.querySelectorAll('.ds-mission-result-overlay')
      .length,
    gameOverScreenCount: document.querySelectorAll(
      '[data-testid="game-over-screen"]',
    ).length,
    operationsScreenCount: document.querySelectorAll(
      '[data-testid="operations-screen"]',
    ).length,
  };
}

async function readCombatDomProbe(page: Page): Promise<CombatDomProbe> {
  return page.evaluate(combatDomProbeExpression);
}

/** Resolves the deterministic supported-input flight-path coordinates. */
function passBFlightCoordinates(viewport: {
  readonly width: number;
  readonly height: number;
}): {
  readonly minX: number;
  readonly maxX: number;
  readonly y: number;
  readonly legSeconds: number;
} {
  const minX = viewport.width * PASS_B_FLIGHT.minWidthFraction;
  const maxX = viewport.width * PASS_B_FLIGHT.maxWidthFraction;
  const y = viewport.height * PASS_B_FLIGHT.altitudeFraction;
  const speed =
    Math.min(viewport.width, viewport.height) *
    PASS_B_FLIGHT.speedRatioPerSecond;
  return { minX, maxX, y, legSeconds: (maxX - minX) / speed };
}

function passBSweepX(
  elapsedSeconds: number,
  legSeconds: number,
  minX: number,
  maxX: number,
): number {
  const phase = elapsedSeconds % (2 * legSeconds);
  const ratio =
    phase <= legSeconds ? phase / legSeconds : 2 - phase / legSeconds;
  return minX + (maxX - minX) * ratio;
}

/**
 * Runs one dodge burst: a canonical maximum-speed horizontal triangle sweep
 * between `10%` and `90% VW` at `80% VH`, emitted as real pointer input at a
 * player-rate cadence for `durationMs`, then released (the Aircraft settles at
 * the last commanded position and holds it until the next burst).
 */
async function runPassBBurst(
  page: Page,
  viewport: { readonly width: number; readonly height: number },
  durationMs: number,
): Promise<number> {
  const { minX, maxX, y, legSeconds } = passBFlightCoordinates(viewport);
  const startedAt = Date.now();
  let moves = 0;
  while (Date.now() - startedAt < durationMs) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    await page.mouse.move(
      passBSweepX(elapsedSeconds, legSeconds, minX, maxX),
      y,
    );
    moves += 1;
    await page.waitForTimeout(PASS_B_FLIGHT.moveIntervalMs);
  }
  return moves;
}

/** Holds the Aircraft at the initial pose while waiting for a Countdown value. */
async function waitForPassBCountdown(
  page: Page,
  expected: string,
  timeoutMs: number,
): Promise<{ readonly reached: boolean; readonly probe: CombatDomProbe }> {
  const deadline = Date.now() + timeoutMs;
  let probe = await readCombatDomProbe(page);
  while (Date.now() < deadline) {
    if (probe.countdownText === expected) {
      return { reached: true, probe };
    }
    if (
      probe.dialogCount > 0 ||
      probe.resultOverlayCount > 0 ||
      probe.gameOverScreenCount > 0 ||
      probe.operationsScreenCount > 0
    ) {
      // A terminal/result/Base frame appeared before the authored arrival the
      // burst belongs to: stop immediately and record the invalid workload.
      return { reached: false, probe };
    }
    await page.waitForTimeout(200);
    probe = await readCombatDomProbe(page);
  }
  return { reached: false, probe };
}

/**
 * Samples the real rendered frames for `sampleMs` while recording the approved
 * Combat DOM facts at the start, middle, and end of the sample. The probe is
 * the same `combatDomProbeExpression` fact set; it is inlined because an
 * in-page probe cannot receive a function argument.
 */
async function samplePassBFrames(
  page: Page,
  sampleMs: number,
): Promise<PassBSample> {
  return page.evaluate(
    (windowMs) =>
      new Promise<PassBSample>((resolve) => {
        const collected: number[] = [];
        const tasks: number[] = [];
        const probes: CombatDomProbe[] = [];
        const probe = (): CombatDomProbe => {
          const countdown = document.querySelector('.ds-combat-countdown');
          return {
            combatScreenVisible:
              document.querySelector('[data-testid="combat-screen"]') !== null,
            canvasCount: document.querySelectorAll('canvas').length,
            combatHudCount: document.querySelectorAll('.ds-combat-hud').length,
            countdownText: countdown === null ? null : countdown.textContent,
            dialogCount: document.querySelectorAll('[role="dialog"]').length,
            resultOverlayCount: document.querySelectorAll(
              '.ds-mission-result-overlay',
            ).length,
            gameOverScreenCount: document.querySelectorAll(
              '[data-testid="game-over-screen"]',
            ).length,
            operationsScreenCount: document.querySelectorAll(
              '[data-testid="operations-screen"]',
            ).length,
          };
        };
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            tasks.push(entry.duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        probes.push(probe());
        const start = performance.now();
        let last = start;
        let midRecorded = false;
        const tick = (): void => {
          const now = performance.now();
          collected.push(now - last);
          last = now;
          const elapsed = now - start;
          if (!midRecorded && elapsed >= windowMs / 2) {
            midRecorded = true;
            probes.push(probe());
          }
          if (elapsed < windowMs) {
            requestAnimationFrame(tick);
          } else {
            probes.push(probe());
            observer.disconnect();
            resolve({ deltas: collected, longTasks: tasks, probes });
          }
        };
        requestAnimationFrame(tick);
      }),
    sampleMs,
  );
}

test('records the uninstrumented Mission 01 regular-workload performance record in the production build (V02-AC-028, V02-WI-04 C03 Pass B)', async ({
  page,
  context,
}) => {
  // V02-WI-04 C03 Pass B owns frame-time / FPS / long-task / heap / cleanup /
  // request timing for the authored e5 encounter (3 Basic + 1 Ranged + 1
  // Hunter at 1366×768) in the ordinary production build. Entity/work maxima
  // are observed in the separate Pass A instrumented record — this record
  // never substitutes authored arithmetic for runtime reads.
  test.setTimeout(560_000);
  const viewport = { width: 1366, height: 768 };
  await page.setViewportSize(viewport);

  // Deterministic canonical session seed (Technical Foundation §8) fixed
  // through the browser entropy adapter before navigation — the SAME fixed seed
  // that derives the SAME canonical mission seed in the instrumented Pass A
  // record, so both records describe the identical authored e5 schedule,
  // placements, and fixed Ranged/Hunter RNG path.
  const sessionSeed = 19023;
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(value >>> 0);
        return array;
      }
      return original(array);
    };
  }, sessionSeed);

  const buildLines: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'info' &&
      message.text().startsWith('[shmup] build ')
    ) {
      buildLines.push(message.text());
    }
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const workloadRequests: string[] = [];
  page.on('request', (request) => workloadRequests.push(request.url()));

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await startCombat(page);

  // The Aircraft starts at its 50% VW / 80% VH hold pose; the flight path only
  // displaces it in short bursts released by the authored Countdown values.
  const flightError: { message: string | null } = { message: null };
  const burstRecords: { countdown: string; moves: number }[] = [];
  let arrivalReached = false;
  let arrivalProbe: CombatDomProbe | null = null;
  let failureProbe: CombatDomProbe | null = null;
  let preSampleProbe: CombatDomProbe | null = null;
  let sample: PassBSample | null = null;
  let sampleWindowMs = 0;
  let heapBeforeGcBytes: number | null = null;

  for (const burst of PASS_B_BURSTS) {
    try {
      const wait = await waitForPassBCountdown(
        page,
        burst.countdownText,
        420_000,
      );
      if (!wait.reached) {
        failureProbe = wait.probe;
        break;
      }
      if (burst.countdownText === '00:00') {
        // The final-arrival burst is INTERLEAVED with the timing sample: the
        // Aircraft must keep dodging for the whole sample, and the sample must
        // be provably active Combat at its start, middle, and end.
        arrivalReached = true;
        arrivalProbe = wait.probe;
        const preSampleMoves = await runPassBBurst(
          page,
          viewport,
          PASS_B_PRE_SAMPLE_MS,
        );
        preSampleProbe = await readCombatDomProbe(page);
        heapBeforeGcBytes = await heapAfterGc(page, context);
        const burstTask = runPassBBurst(
          page,
          viewport,
          burst.durationMs - PASS_B_PRE_SAMPLE_MS,
        );
        const sampleStartedAt = Date.now();
        sample = await samplePassBFrames(page, PASS_B_SAMPLE_WINDOW_MS);
        sampleWindowMs = Date.now() - sampleStartedAt;
        const sampleMoves = await burstTask;
        burstRecords.push({
          countdown: burst.countdownText,
          moves: preSampleMoves + sampleMoves,
        });
        break;
      }
      burstRecords.push({
        countdown: burst.countdownText,
        moves: await runPassBBurst(page, viewport, burst.durationMs),
      });
    } catch (error) {
      flightError.message =
        error instanceof Error ? error.message : String(error);
      break;
    }
  }

  const measuredHeapBeforeGcBytes =
    heapBeforeGcBytes ?? (await heapAfterGc(page, context));
  const measuredHeapAfterGcBytes =
    sample === null
      ? measuredHeapBeforeGcBytes
      : await heapAfterGc(page, context);

  // Post-run cleanup evidence (Epic §20.1, V02-AC-027; V02-WI-05 E01): the
  // temporary Return to Base seam is removed, so the running mission is
  // resolved through the canonical active-mission refresh Defeat recovery
  // (V02-AC-018) — reloading resolves the persisted marker exactly once and
  // opens Operations with no Combat entity, canvas, HUD bridge, or overlay
  // residue. The facts are MEASURED here and asserted only after the raw record
  // has been written.
  await page.reload();
  await page
    .waitForSelector('[data-testid="operations-screen"]', { timeout: 15000 })
    .catch(() => null);
  const cleanup = {
    operationsVisible: await page.getByTestId('operations-screen').isVisible(),
    canvasCount: await page.locator('canvas').count(),
    combatHudCount: await page.locator('.ds-combat-hud').count(),
    dialogOverlayCount: await page.getByRole('dialog').count(),
  };

  const deltas = sample?.deltas ?? [];
  const longTasks = sample?.longTasks ?? [];
  const rawProbeFacts = [
    ...(preSampleProbe === null ? [] : [preSampleProbe]),
    ...(sample?.probes ?? []),
  ];
  // The recorded probes carry their fixed contract labels so the evidence
  // package can validate the exact ordered observation structure. The summary
  // flags below are reporting conveniences only, derived from the same raw
  // probes; `npm run evidence:compare` recomputes every fact from the probes.
  const probes = rawProbeFacts.map((facts, index) => ({
    label: PASS_B_PROBE_ORDER[index] ?? `unexpected-${index}`,
    ...facts,
  }));
  const sorted = [...deltas].sort((a, b) => a - b);
  const percentile = (fraction: number): number =>
    sorted.length === 0
      ? 0
      : (sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
        ] ?? 0);
  const meanMs =
    deltas.length === 0
      ? 0
      : deltas.reduce((total, delta) => total + delta, 0) / deltas.length;

  // Sustained FPS over complete 1-second buckets (minimum sustained window
  // budget). A trailing partial bucket is not a full sustained window and is
  // excluded so a half-second remainder cannot skew the minimum.
  const sustainedWindowFps: number[] = [];
  {
    let bucketFrames = 0;
    let bucketTime = 0;
    for (const delta of deltas) {
      bucketFrames += 1;
      bucketTime += delta;
      if (bucketTime >= 1000) {
        sustainedWindowFps.push(bucketFrames / (bucketTime / 1000));
        bucketFrames = 0;
        bucketTime = 0;
      }
    }
  }
  const minSustainedWindowFps =
    sustainedWindowFps.length === 0
      ? 0
      : Number(Math.min(...sustainedWindowFps).toFixed(1));

  // Truthful canonical mission seed derived from the fixed session seed
  // (Technical Foundation §8: FNV-1a over the versioned RNG input string).
  // C04 delta 1: the derived canonical seed must match the ONE fixed value
  // shared with Pass A — the comparison package fails on any mismatch.
  const canonicalMissionSeed = fnv1a32(
    `shmup-mvp:rng-v1|${sessionSeed}|combat-mission|0`,
  );

  // C05: evidence ownership — the current control runId + source fingerprint.
  const ownership = readEvidenceOwnership();

  // The workload is ACCEPTED only when the authored `03:10` final arrival was
  // actually reached and every probe — before the sample, mid-sample, and at the
  // end of the sample — proved real active Combat with the `00:00` Countdown and
  // no terminal/result/Base frame. These facts are recorded BEFORE the budget
  // assertions so a failing run leaves truthful invalid-workload evidence.
  const combatActiveThroughout =
    rawProbeFacts.length > 0 &&
    rawProbeFacts.every(
      (probe) =>
        probe.combatScreenVisible &&
        probe.canvasCount === 1 &&
        probe.combatHudCount === 1,
    );
  const countdownRemainedFinal =
    rawProbeFacts.length > 0 &&
    rawProbeFacts.every((probe) => probe.countdownText === '00:00');
  const terminalOrResultSeen = rawProbeFacts.some(
    (probe) =>
      probe.dialogCount > 0 ||
      probe.resultOverlayCount > 0 ||
      probe.gameOverScreenCount > 0,
  );
  const baseOrOperationsSeen = rawProbeFacts.some(
    (probe) => probe.operationsScreenCount > 0,
  );
  const workloadValidity = {
    valid:
      arrivalReached &&
      flightError.message === null &&
      sample !== null &&
      combatActiveThroughout &&
      countdownRemainedFinal &&
      !terminalOrResultSeen &&
      !baseOrOperationsSeen,
    arrivalReached,
    flightInputError: flightError.message,
    combatActiveThroughout,
    countdownRemainedFinal,
    terminalOrResultSeen,
    baseOrOperationsSeen,
    probeCount: probes.length,
    probeOrder: [...PASS_B_PROBE_ORDER],
    probes,
    arrivalProbe,
    failureProbe,
  };

  const evidence = {
    label:
      'Pass B uninstrumented production build — non-reference local proxy evidence (V02-AC-028)',
    buildIdentifier: buildLines[0] ?? null,
    browser: await page.evaluate(() => navigator.userAgent),
    machine: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuCount: cpus().length,
      totalMemBytes: totalmem(),
    },
    viewport,
    workload:
      'Mission 01 authored run to the 03:10 e5 Encounter (3 Basic + 1 Ranged + 1 Hunter) with continuous automatic Machine Gun fire and the deterministic supported-input flight path',
    workloadIdentity: {
      description:
        'The SAME fixed session seed as the instrumented Pass A record derives the SAME canonical mission seed for Mission 01, so the authored e5 Arrival Group, its placed members, and the fixed Ranged/Hunter RNG path are identical; the run is the ordinary production artifact at 1366×768 with continuous automatic Machine Gun fire, and the Combat Countdown reaching 00:00 proves the exact 03:10 final arrival step executed.',
      sessionSeed,
      canonicalSeed: canonicalMissionSeed,
      width: viewport.width,
      height: viewport.height,
      productionArtifact: true,
      continuousAutomaticFire: true,
    },
    inputPath: {
      description:
        'Supported pointer input only: a canonical maximum-speed horizontal triangle sweep between 10% and 90% VW at 80% VH, in short bursts released by the authored Combat Countdown values 01:28, 00:45, and 00:00; between bursts the Aircraft holds its last commanded pose (starting at the 50% VW / 80% VH pose).',
      altitudeFraction: PASS_B_FLIGHT.altitudeFraction,
      minWidthFraction: PASS_B_FLIGHT.minWidthFraction,
      maxWidthFraction: PASS_B_FLIGHT.maxWidthFraction,
      speedRatioPerSecond: PASS_B_FLIGHT.speedRatioPerSecond,
      moveIntervalMs: PASS_B_FLIGHT.moveIntervalMs,
      bursts: burstRecords,
    },
    workloadValidity,
    sessionSeed,
    canonicalSeed: canonicalMissionSeed,
    sampleWindowMs,
    frameTimeMs: {
      count: deltas.length,
      mean: Number(meanMs.toFixed(3)),
      p95: Number(percentile(0.95).toFixed(3)),
      p99: Number(percentile(0.99).toFixed(3)),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    },
    sustainedFps: meanMs > 0 ? Number((1000 / meanMs).toFixed(1)) : 0,
    minimumSustainedWindowFps: minSustainedWindowFps,
    longTasks: {
      count: longTasks.length,
      maxMs: Number(
        longTasks.reduce((max, value) => Math.max(max, value), 0).toFixed(3),
      ),
    },
    heapUsedBeforeGcBytes: measuredHeapBeforeGcBytes,
    heapUsedAfterGcBytes: measuredHeapAfterGcBytes,
    requestsDuringRun: workloadRequests.length,
    consoleErrors: consoleErrors.slice(0, 20),
    runId: ownership.runId,
    sourceFingerprint: ownership.sourceFingerprint,
    pageErrors: pageErrors.length,
  };

  // The raw observation — including the invalid-workload state and every timing
  // field — is written BEFORE any budget assertion can abort the test, so a
  // failing run can never leave a plausible-looking record behind.
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(
    EVIDENCE_DIR,
    'v02-wi-04-uninstrumented-regular-workload.json',
  );
  const finalEvidence = { ...evidence, cleanup };
  writeFileSync(path, `${JSON.stringify(finalEvidence, null, 2)}\n`);
  console.log('V02-WI04-PASS-B-RECORD', JSON.stringify(finalEvidence));

  // ---- Integrity assertions (after the truthful record exists) --------------
  expect(workloadValidity.arrivalReached).toBe(true);
  expect(workloadValidity.combatActiveThroughout).toBe(true);
  expect(workloadValidity.countdownRemainedFinal).toBe(true);
  expect(workloadValidity.terminalOrResultSeen).toBe(false);
  expect(workloadValidity.baseOrOperationsSeen).toBe(false);
  expect(workloadValidity.valid).toBe(true);
  expect(workloadValidity.probeCount).toBeGreaterThanOrEqual(3);
  expect(workloadValidity.probes.map((probe) => probe.label)).toEqual([
    ...PASS_B_PROBE_ORDER,
  ]);
  expect(
    consoleErrors.filter((text) => text.includes('already in use')),
  ).toEqual([]);

  // ---- Budget assertions (Epic §20.1, V02-AC-028) ---------------------------
  // Representative sample size, the 50 FPS sustained / minimum-window floor,
  // and no uncaught page error. The thresholds are unchanged.
  expect(evidence.frameTimeMs.count).toBeGreaterThan(100);
  expect(evidence.sustainedFps).toBeGreaterThanOrEqual(50);
  expect(evidence.minimumSustainedWindowFps).toBeGreaterThanOrEqual(50);
  expect(pageErrors).toEqual([]);

  // C05 delta 2: the machine-readable cleanup object carries exact zero Combat
  // residue measured from the real post-cleanup state.
  expect(cleanup.operationsVisible).toBe(true);
  expect(cleanup.canvasCount).toBe(0);
  expect(cleanup.combatHudCount).toBe(0);
  expect(cleanup.dialogOverlayCount).toBe(0);
});
