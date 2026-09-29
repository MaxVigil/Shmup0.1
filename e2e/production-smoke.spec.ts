import { execSync } from 'node:child_process';
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
import {
  classifyFrame,
  decodePng,
  maskRegions,
} from '../src/test-support/visual-evidence/raster';
import { computeSourceFingerprint } from '../scripts/evidence-source-fingerprint.mjs';
import { computeD04CandidateIdentity } from '../scripts/evidence-d04-candidate.mjs';

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

/** Writes the exact persisted campaign row envelope (V02-WI-05 M02-R01 test
 *  setup: the production application reads it as normal durable campaign
 *  progress; no Debug, dev observability, or product hook is involved). */
async function seedPersistedCampaign(
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

/** Reads the raw persisted campaign row envelope through IndexedDB. */
async function readPersistedCampaign(page: Page): Promise<{
  readonly value: {
    readonly credits: number;
    readonly missionInProgress: {
      readonly missionId: string;
      readonly attemptId: number;
    } | null;
    readonly completedMissionIds: readonly string[];
    readonly unlockedMissionIds: readonly string[];
  };
}> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('shmup-v0.2');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readonly');
      const get = transaction.objectStore('campaign').get('current');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    database.close();
    return row as never;
  });
}

/**
 * V02-WI-05 M02-R01 C01 production-browser evidence for the SELECTED Mission 02
 * production path (Epic §6.1, §13.2, §13.4, §15.4, V02-AC-003/015/020/023).
 *
 * What this test owns: the production artifact resolves the selected Mission 02
 * identity and starts it through the real mission-start transaction, exposes
 * the authored `04:20` Countdown, contains no Debug surface, resolves ONE
 * supported non-Debug terminal result (the real `Evacuate` affordance and its
 * `5.0 s` countdown), commits that result exactly once with its cleanup, and
 * returns to Operations with the negative progression rule intact (Mission 02
 * incomplete, Mission 03 still locked, no completion reward, no unlock row).
 *
 * What this test does NOT own: Mission 02 Success, its economy, or the Mission
 * 03 unlock. Those are owned by the deterministic simulation/application
 * evidence (`src/application/combat/combat-mission-02.test.ts`,
 * `src/application/mission/mission-02-progression.test.ts`) and by the real
 * development browser vertical (`e2e/mission-02-acceptance.spec.ts`), which is
 * the only place a player-facing Mission 02 Success is driven end to end.
 */
test('a selected Mission 02 starts and resolves through the supported production Evacuation terminal exactly once with no Debug surface, no completion and no Mission 03 unlock (V02-AC-003/015/020/023)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Durable setup: Mission 01 completed, Interception 02 available, 03 locked.
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await seedPersistedCampaign(page, {
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

  // The selected Mission 02 identity is visible in Operations and Mission
  // Details before any start transaction.
  const mission02 = page.getByRole('button', { name: 'Interception 02' });
  await expect(mission02).toBeEnabled();
  await mission02.click();
  const details = page.getByRole('dialog');
  await expect(
    details.getByRole('heading', { name: 'Interception 02' }),
  ).toBeVisible();
  await expect(details.getByText('12 Credits', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Start Mission' }).click();

  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  const countdown = page.locator('.ds-combat-countdown');
  await expect(countdown).toHaveText('04:20');
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
  // The durable marker belongs to the exact selected Mission 02 attempt.
  const atStart = await readPersistedCampaign(page);
  expect(atStart.value.missionInProgress?.missionId).toBe('interception-02');
  expect(atStart.value.credits).toBe(20);
  expect(atStart.value.completedMissionIds).toEqual(['interception-01']);
  expect(atStart.value.unlockedMissionIds).toEqual([
    'interception-01',
    'interception-02',
  ]);

  // No Debug surface exists in the production artifact.
  await page.keyboard.press('F1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText(/God Mode|Win Mission|Lose Mission/i),
  ).toHaveCount(0);

  // The only terminal this path uses is the supported non-Debug Evacuation:
  // the real destructive affordance, its blocking confirmation, and the exact
  // 5.0 s commitment.
  const utility = page.getByTestId('combat-utility');
  await utility.getByRole('button', { name: 'Evacuate' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Confirm Evacuation' })
    .click();
  await expect(countdown).toHaveText('EVACUATION 00:05');
  await expect
    .poll(async () => (await countdown.textContent()) ?? '', {
      timeout: 30000,
      intervals: [50, 100],
    })
    .toBe('EVACUATION 00:00');

  const result = page.getByRole('dialog');
  await expect(result.getByRole('heading', { name: 'EVACUATED' })).toBeVisible({
    timeout: 20000,
  });
  // The committed result explicitly reports no completion and no unlock.
  await expect(result).toContainText('Mission not completed');
  await expect(result.getByText('Completion reward')).toHaveCount(0);
  await expect(result.getByText('Mission unlocked')).toHaveCount(0);
  const creditsRow = await result
    .locator('.ds-field-row', { hasText: 'Credits earned' })
    .textContent();
  const creditsEarned = Number.parseInt(
    /\d+/.exec(creditsRow ?? '')?.[0] ?? '',
    10,
  );
  expect(Number.isNaN(creditsEarned)).toBe(false);

  // Continue returns to Operations with exactly one committed economy change
  // (the retained 50% payout), no completion, no unlock and no Combat residue.
  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(`Credits: ${20 + creditsEarned}`)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 02' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Completed)' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Interception 03 (Locked)' }),
  ).toBeDisabled();
  const afterContinue = await readPersistedCampaign(page);
  expect(afterContinue.value.credits).toBe(20 + creditsEarned);
  expect(afterContinue.value.missionInProgress).toBeNull();
  expect(afterContinue.value.completedMissionIds).toEqual(['interception-01']);
  expect(afterContinue.value.unlockedMissionIds).toEqual([
    'interception-01',
    'interception-02',
  ]);
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
    page.getByText(
      /God Mode|Win Mission|Lose Mission|Evacuate Mission|Elite: Armoured|Elite: Vulnerable|Spawn Elite|Elite Phase|Set Credits|missionInProgress|runStatus|Reload for Recovery/i,
    ),
  ).toHaveCount(0);
  // The development observability global and the evidence workload surfaces
  // stay compile-time absent from the ordinary production artifact.
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & Record<string, unknown>)
          .__shmupDevObservability__,
    ),
  ).toBe('undefined');
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & Record<string, unknown>)
          .__shmupEliteWorkload__,
    ),
  ).toBe('undefined');

  // The non-Debug lifecycle shell is unaffected in production.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('production keeps the unreadable-campaign copy generic and emits no technical save-data diagnostic (V02-AC-021, DELIVERY-AC-003)', async ({
  page,
}) => {
  const consoleMessages: { type: string; text: string }[] = [];
  page.on('console', (message) =>
    consoleMessages.push({ type: message.type(), text: message.text() }),
  );
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // A current-format row whose value fails campaign validation drives the real
  // non-overwriting Save Data Error path in the production artifact.
  await seedPersistedCampaign(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: -5,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
  });
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect(
    page.getByText('Saved game data could not be loaded.'),
  ).toBeVisible();

  // The development diagnostic surface (and every technical save-data cause) is
  // absent from production output; the player copy stays generic.
  const technicalOutput = consoleMessages.filter((message) =>
    /Save Data Error diagnostics|rowFormatVersion|credits must be a non-negative integer|nextMissionAttemptId/i.test(
      message.text,
    ),
  );
  expect(technicalOutput).toEqual([]);
  expect(pageErrors).toEqual([]);
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
    // V02-WI-06 E04-C02: the Elite workload identity surface, its read API and
    // observation field names, the evidence-only Elite workload
    // scenario/preparation, and the Pass A Elite workload counter contract must
    // ALSO be compile-time absent from the ordinary production artifact.
    '__shmupEliteWorkload__',
    'readEliteWorkload',
    'buildEliteWorkloadObservation',
    'prepareEliteWorkloadBenchmark',
    'eliteWorkload',
    'maxActiveHomingCores',
    'elitePhaseStepsElapsed',
    'eliteAnchorRowAligned',
    'eliteActivated',
    'eliteCount',
    'activeCannonLeft',
    'activeCannonRight',
    'activeHomingCores',
    // V02-WI-07 D04-C03: the isolated real-renderer rendering fixture, its
    // fixture-only snapshot injection API and the DOM stage marker must never
    // reach the ordinary production artifact.
    'wi07-render-stage',
    '__wi07Fixture',
    'rendering-fixture',
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

// ---------------------------------------------------------------------------
// V02-WI-07 D04 — three-mission production asset traversal (V02-AC-025)
//
// The final ordinary production artifact is served unchanged and traversed
// through the real Operations → Mission Details → Start Mission flow. Only
// player-visible facts are read: the Combat Countdown text, the Hull Bar, the
// blocking Overlays, the raw local HTTP request ledger, and the rendered Combat
// canvas pixels (the same pure classifier the accepted Mission 03 review runner
// uses). No Debug, development observability, evidence-only scenario build,
// shortened clock, hidden state write, or production-only hook is used.
// ---------------------------------------------------------------------------

/** The minimum supported CSS viewport (with the file-wide beforeEach). */
const D04_VIEWPORT = { width: 1280, height: 600 };

/**
 * Fixed session seed for the bounded D04 production routes (disclosed). The
 * canonical fixed-seed path is the accepted way to make an authored route
 * reproducible; it changes only explicitly random variants such as Hunter
 * left/right entry (Epic §8).
 */
const D04_SESSION_SEED = 19023;

/**
 * Aircraft observation point used by every D04 route (disclosed): a fixed
 * bottom-left position chosen so the authored centre-lane arrivals are not
 * destroyed by the aircraft's own auto-fire before they can be observed.
 */
const D04_AIRCRAFT_POINT = { x: 96, y: 540 };

/** The approved seventeen-entry Boot manifest (Master §5.6, Epic §16.1). */
const D04_MANIFEST_PATHS = [
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
] as const;

/** The five approved prepared enemy runtime paths (Epic §16.1). */
const D04_ENEMY_PATHS = [
  '/enemies/basic-drone.png',
  '/enemies/ranged-drone.png',
  '/enemies/hunter-drone.png',
  '/enemies/elite-drone-armoured.png',
  '/enemies/elite-drone-vulnerable.png',
] as const;

/** The approved §16.4 prepared dimensions (width × height) per file name. */
const D04_ENEMY_DIMENSIONS: Record<string, readonly [number, number]> = {
  'basic-drone.png': [192, 101],
  'ranged-drone.png': [224, 163],
  'hunter-drone.png': [114, 192],
  'elite-drone-armoured.png': [214, 320],
  'elite-drone-vulnerable.png': [281, 320],
};

/** The approved five-file pack and complete-manifest byte budgets (§16.1). */
const D04_ENEMY_PACK_BUDGET_BYTES = 450_000;
const D04_MANIFEST_BUDGET_BYTES = 2 * 1024 * 1024;
/** The previously recorded §16.4 facts, used only to report the difference. */
const D04_HISTORIC_ENEMY_PACK_BYTES = 221_772;
const D04_HISTORIC_MANIFEST_BYTES = 1_800_725;

interface D04RequestEntry {
  readonly url: string;
  readonly resourceType: string;
}

/** One enemy observed in the rendered Combat canvas plus its pixel metrics. */
interface D04RenderedEnemy {
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly top: number;
  readonly bottom: number;
  /** Exact craft-pixel bounding box around the detected shape (px). */
  readonly refinedWidth: number;
  readonly refinedHeight: number;
  /** Distinct non-background RGB colours inside the observed bounds. */
  readonly distinctColours: number;
  /** Non-background pixels inside the observed bounds. */
  readonly sampledPixels: number;
}

/** Forces the disclosed fixed session seed before the measured page load. */
async function forceD04SessionSeed(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (array) => {
      if (array instanceof Uint32Array) {
        array.fill(value >>> 0);
        return array;
      }
      return original(array);
    };
  }, D04_SESSION_SEED);
}

/** Counts local HTTP requests whose pathname equals `pathname`. */
function countPathRequests(
  ledger: readonly D04RequestEntry[],
  pathname: string,
): number {
  return ledger.filter(
    (entry) =>
      entry.url.startsWith('http') && new URL(entry.url).pathname === pathname,
  ).length;
}

/** Starts one mission through the real Operations → Mission Details flow. */
async function enterMission(page: Page, missionName: string): Promise<void> {
  await page.getByRole('button', { name: missionName }).click();
  const details = page.getByRole('dialog');
  await expect(
    details.getByRole('heading', { name: missionName }),
  ).toBeVisible();
  await details.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  // Hold the disclosed observation point.
  await page.mouse.move(D04_AIRCRAFT_POINT.x, D04_AIRCRAFT_POINT.y);
}

/**
 * Resolves one mission through the supported player-facing terminal path
 * (`Evacuate` → confirmation → the real 5 s commitment) and returns the actual
 * committed result heading. Combat continues during the commitment, so a
 * natural Defeat can legitimately win the race; either outcome is a real
 * terminal, and `Continue` returns to Operations in both cases.
 */
async function resolveMissionToOperations(page: Page): Promise<string> {
  await page
    .getByTestId('combat-utility')
    .getByRole('button', { name: 'Evacuate' })
    .click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Confirm Evacuation' })
    .click();
  const result = page.getByRole('dialog');
  const committed = result.getByRole('heading').first();
  await expect(result).toBeVisible({ timeout: 40000 });
  const heading = (await committed.textContent()) ?? '';
  expect(['EVACUATED', 'MISSION FAILED', 'MISSION COMPLETE']).toContain(
    heading,
  );
  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  return heading;
}

/** Waits until the Combat Countdown shows one exact authored `MM:SS` value. */
async function waitForCountdown(
  page: Page,
  text: string,
  timeoutMs = 180000,
): Promise<void> {
  await expect(page.locator('.ds-combat-countdown')).toHaveText(text, {
    timeout: timeoutMs,
  });
}

/** A wide, short silhouette: the approved Basic Drone role signature. */
function isD04BasicSignature(enemy: D04RenderedEnemy): boolean {
  return enemy.width >= 24 && enemy.height <= 18;
}

/** A wide, taller silhouette: the approved Ranged Drone role signature. */
function isD04RangedSignature(enemy: D04RenderedEnemy): boolean {
  return enemy.width >= 24 && enemy.height >= 20;
}

/** A narrow, tall silhouette: the approved Hunter Drone role signature. */
function isD04HunterSignature(enemy: D04RenderedEnemy): boolean {
  return enemy.width <= 20 && enemy.height >= 22;
}

/**
 * A prepared enemy PNG renders as a shaded prepared image (many distinct
 * colours); the approved procedural fallback is drawn from a few flat Design
 * System token fills. Measured on the accepted production artifact: prepared
 * images ≥ 137 distinct colours, approved fallback = 4.
 */
function isD04PreparedImage(enemy: D04RenderedEnemy): boolean {
  return enemy.distinctColours >= 20;
}

function isD04ProceduralFallback(enemy: D04RenderedEnemy): boolean {
  return enemy.distinctColours <= 8 && enemy.sampledPixels >= 40;
}

/** Writes one D04 production evidence record. */
function writeD04Evidence(name: string, value: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

/**
 * V02-WI-07 D04-C01 correction delta 4: every D04 production evidence record is
 * bound to the same exact final candidate. HEAD plus a dirty flag cannot
 * identify the uncommitted D04 repair, so each record carries the full HEAD, the
 * canonical source fingerprint, the D04 working-tree candidate digest, the
 * ordinary build identity read from the served artifact, one stable runId, and
 * the evidence viewport.
 */
function d04CandidateIdentity(): Record<string, unknown> {
  const source = computeSourceFingerprint(process.cwd());
  const candidate = computeD04CandidateIdentity(process.cwd());
  return {
    runId: `v02-wi-07-d04-c01-${source.head.slice(0, 7)}-${candidate.digest}`,
    baseRevision: source.head,
    sourceFingerprint: source.digest,
    candidateDigest: candidate.digest,
    candidateDigestMethod: candidate.method,
    candidateWorkingTreePaths: candidate.workingTreePaths,
    viewport: { width: D04_VIEWPORT.width, height: D04_VIEWPORT.height },
  };
}

/** Captures the ordinary build identifier emitted by the served artifact. */
function installD04BuildIdentityCapture(page: Page): () => string {
  let value = 'unknown';
  page.on('console', (message) => {
    const text = message.text();
    if (value === 'unknown' && text.startsWith('[shmup] build ')) {
      value = text;
    }
  });
  return () => value;
}

/** The persisted campaign fixture used before every measured D04 page load. */
function d04UnlockedCampaign(): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 42,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: [
      'interception-01',
      'interception-02',
      'interception-03',
    ],
    completedMissionIds: ['interception-01', 'interception-02'],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
  };
}

/**
 * Prepares one measured D04 page load: seeds the schema-valid persisted unlock
 * fixture through the application's own campaign store, then reloads so the
 * measured load starts from that durable progression (disclosed fixture, never
 * Debug or a hidden state write). The ledger, when supplied, is cleared so the
 * measured load's requests are counted alone.
 */
async function prepareD04MeasuredLoad(
  target: Page,
  ledger?: D04RequestEntry[],
): Promise<void> {
  await target.goto('/');
  await expect(target.getByTestId('operations-screen')).toBeVisible();
  await target.waitForLoadState('networkidle');
  await seedPersistedCampaign(target, d04UnlockedCampaign());
  if (ledger !== undefined) {
    ledger.length = 0;
  }
  await target.reload();
  await expect(target.getByTestId('operations-screen')).toBeVisible();
  await target.waitForLoadState('networkidle');
}

/**
 * Captures the rendered Combat canvas and classifies only what a player sees.
 * The HUD boxes and the fixed top HUD band are masked exactly like the accepted
 * Mission 03 review runner; the per-enemy colour metric distinguishes a prepared
 * image (many shaded colours) from the approved procedural fallback (a few flat
 * Design System token fills).
 */
async function observeD04CombatFrame(page: Page): Promise<{
  readonly enemies: readonly D04RenderedEnemy[];
  readonly shot: Buffer;
}> {
  const hudBoxes = await page.evaluate(() => {
    const box = (
      selector: string,
    ): {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null => {
      const element = document.querySelector(selector);
      if (element === null) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x - 4,
        y: rect.y - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      };
    };
    return [
      box('.ds-combat-hud__bar'),
      box('.ds-combat-hud__system'),
      box('.ds-combat-utility'),
    ].filter((value) => value !== null);
  });
  const shot = await page.screenshot();
  const raster = decodePng(shot);
  maskRegions(raster, [
    ...hudBoxes,
    { x: 0, y: 0, width: D04_VIEWPORT.width, height: 80 },
  ]);
  const observation = classifyFrame(raster);
  const enemies = observation.enemies.map((shape): D04RenderedEnemy => {
    const left = Math.max(0, Math.floor(shape.centerX - shape.width / 2));
    const right = Math.min(
      raster.width,
      Math.ceil(shape.centerX + shape.width / 2),
    );
    const top = Math.max(0, Math.floor(shape.top));
    const bottom = Math.min(raster.height, Math.ceil(shape.bottom));
    const colours = new Set<string>();
    let sampledPixels = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const base = (y * raster.width + x) * 4;
        const r = raster.data[base] ?? 0;
        const g = raster.data[base + 1] ?? 0;
        const b = raster.data[base + 2] ?? 0;
        if (Math.max(r, g, b) < 26) {
          continue;
        }
        sampledPixels += 1;
        colours.add(`${r},${g},${b}`);
      }
    }
    // Exact craft-pixel box inside a bounded window around the detected shape:
    // the window is wider than any enemy footprint but narrow enough that the
    // authored lanes do not overlap, and danger/accent projectile pixels are
    // excluded so a projectile can never inflate the measured bounds.
    const windowLeft = Math.max(0, Math.floor(shape.centerX - 40));
    const windowRight = Math.min(raster.width, Math.ceil(shape.centerX + 40));
    const windowTop = Math.max(0, Math.floor(shape.centerY - 24));
    const windowBottom = Math.min(raster.height, Math.ceil(shape.centerY + 24));
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let y = windowTop; y < windowBottom; y += 1) {
      for (let x = windowLeft; x < windowRight; x += 1) {
        const base = (y * raster.width + x) * 4;
        const r = raster.data[base] ?? 0;
        const g = raster.data[base + 1] ?? 0;
        const b = raster.data[base + 2] ?? 0;
        const maximum = Math.max(r, g, b);
        const minimum = Math.min(r, g, b);
        if (maximum < 40) {
          continue;
        }
        const danger = r > 110 && r > g + 40 && r > b + 40;
        const accent = b > 105 && b > r + 25;
        if (danger || accent) {
          continue;
        }
        if (maximum - minimum > 90) {
          continue;
        }
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const refinedWidth = Number.isFinite(minX) ? maxX - minX + 1 : 0;
    const refinedHeight = Number.isFinite(minY) ? maxY - minY + 1 : 0;
    return {
      width: shape.width,
      height: shape.height,
      centerX: shape.centerX,
      centerY: shape.centerY,
      top: shape.top,
      bottom: shape.bottom,
      refinedWidth,
      refinedHeight,
      distinctColours: colours.size,
      sampledPixels,
    };
  });
  return { enemies, shot };
}

/*
 * V02-WI-07 D04-C03: the C02 long-running production flash sampler that used to
 * live here is WITHDRAWN from mandatory production acceptance. It sampled 303-396
 * sparse driver screenshots, observed no near-white blob of any kind (including
 * the unconditional destroyed-enemy control square) and therefore could neither
 * accept nor reject the repaired hit feedback; its failed record is preserved at
 * `.agent-handoff/evidence/v02-wi-07-d04-c02-flash-rendering.json`. The flash
 * presentation is now proven by real-renderer pixels in
 * `e2e/wi07-d04-rendering.spec.ts`, the authoritative 3-step hit state by the
 * accepted simulation/collision tests, and normal-application wiring by the
 * checks below. See `.agent-handoff/evidence/wi07-d04-c03-coverage-map.md`.
 */

test('V02-WI-07 D04 the ordinary production build enters Interception 01–03 through the real flow, renders each authored encounter from the prepared sprites, and requests every approved asset at most once per page load (V02-AC-024/025)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const readBuildIdentity = installD04BuildIdentityCapture(page);
  const ledger: D04RequestEntry[] = [];
  page.on('request', (request) =>
    ledger.push({ url: request.url(), resourceType: request.resourceType() }),
  );
  await forceD04SessionSeed(page);
  // Disclosed setup: the schema-valid persisted unlock fixture is written
  // through the application's own campaign store before the measured page load,
  // then the measured load starts from that durable progression.
  await prepareD04MeasuredLoad(page, ledger);

  // --- Boot: the approved seventeen-entry manifest, once per page load ------
  for (const path of D04_MANIFEST_PATHS) {
    expect(
      countPathRequests(ledger, path),
      `Boot manifest request count for ${path}`,
    ).toBe(1);
  }
  expect(
    D04_ENEMY_PATHS.reduce(
      (total, path) => total + countPathRequests(ledger, path),
      0,
    ),
  ).toBe(5);

  const observations: Record<string, unknown> = {};

  // --- Interception 01 — Contact: Basic (`00:10`) ---------------------------
  await enterMission(page, 'Interception 01');
  await waitForCountdown(page, '03:10');
  await waitForCountdown(page, '02:58');
  const m01BasicFrames = [
    await observeD04CombatFrame(page),
    await waitForCountdown(page, '02:56').then(() =>
      observeD04CombatFrame(page),
    ),
    await waitForCountdown(page, '02:54').then(() =>
      observeD04CombatFrame(page),
    ),
  ];
  const m01BasicWindow = m01BasicFrames
    .flatMap((frame) => frame.enemies)
    .filter(isD04PreparedImage);
  // The authored e1 arrival creates four wide, short Basic silhouettes; every
  // observed prepared image in this window is a Basic Drone and none is a
  // Ranged or Hunter signature.
  expect(m01BasicWindow.length).toBeGreaterThanOrEqual(2);
  for (const enemy of m01BasicWindow) {
    expect(enemy.height).toBeLessThanOrEqual(18);
  }
  expect(m01BasicWindow.filter(isD04RangedSignature)).toEqual([]);
  expect(m01BasicWindow.filter(isD04HunterSignature)).toEqual([]);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m01-basic.png'),
    m01BasicFrames[1]!.shot,
  );
  observations['interception-01-e1-basic'] = m01BasicWindow;

  // --- Interception 01 — the Ranged Drone enters `+2 s` at `00:57` ----------
  await waitForCountdown(page, '02:12');
  const m01RangedFrames = [await observeD04CombatFrame(page)];
  for (const expected of ['02:10', '02:08', '02:06', '02:04']) {
    await waitForCountdown(page, expected);
    m01RangedFrames.push(await observeD04CombatFrame(page));
  }
  const m01RangedWindow = m01RangedFrames
    .flatMap((frame) => frame.enemies)
    .filter(isD04PreparedImage);
  expect(m01RangedWindow.some(isD04RangedSignature)).toBe(true);
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m01-ranged.png'),
    m01RangedFrames[m01RangedFrames.length - 1]!.shot,
  );
  observations['interception-01-e2-ranged'] = m01RangedWindow;

  // --- Interception 01 — the Hunter Drone enters at `01:40` ----------------
  await waitForCountdown(page, '01:28');
  const m01HunterFrames = [await observeD04CombatFrame(page)];
  for (const expected of ['01:26', '01:24', '01:22', '01:20', '01:18']) {
    await waitForCountdown(page, expected);
    m01HunterFrames.push(await observeD04CombatFrame(page));
  }
  const m01HunterWindow = m01HunterFrames
    .flatMap((frame) => frame.enemies)
    .filter(isD04PreparedImage);
  expect(m01HunterWindow.some(isD04HunterSignature)).toBe(true);
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m01-hunter.png'),
    m01HunterFrames[m01HunterFrames.length - 1]!.shot,
  );
  observations['interception-01-e3-hunter'] = m01HunterWindow;
  observations['interception-01-terminal'] =
    await resolveMissionToOperations(page);

  // --- Interception 02 — Pressure: the authored `00:10` Basic formation ----
  await enterMission(page, 'Interception 02');
  await waitForCountdown(page, '04:20');
  await waitForCountdown(page, '04:06');
  const m02Frame = await observeD04CombatFrame(page);
  const m02Window = m02Frame.enemies.filter(isD04PreparedImage);
  expect(m02Window.some(isD04BasicSignature)).toBe(true);
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m02-basic.png'),
    m02Frame.shot,
  );
  observations['interception-02-e1-basic'] = m02Window;
  observations['interception-02-terminal'] =
    await resolveMissionToOperations(page);

  // --- Interception 03 — Breakthrough: Basic (`00:10`) and Ranged (`+2 s`) --
  await enterMission(page, 'Interception 03');
  await waitForCountdown(page, '05:20');
  await waitForCountdown(page, '05:08');
  const m03BasicFrame = await observeD04CombatFrame(page);
  const m03BasicWindow = m03BasicFrame.enemies.filter(isD04PreparedImage);
  expect(m03BasicWindow.some(isD04BasicSignature)).toBe(true);
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m03-basic.png'),
    m03BasicFrame.shot,
  );
  await waitForCountdown(page, '05:04');
  const m03RangedFrame = await observeD04CombatFrame(page);
  const m03RangedWindow = m03RangedFrame.enemies.filter(isD04PreparedImage);
  expect(m03RangedWindow.some(isD04RangedSignature)).toBe(true);
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m03-ranged.png'),
    m03RangedFrame.shot,
  );
  observations['interception-03-e1-basic-ranged'] = m03RangedWindow;
  observations['interception-03-terminal'] =
    await resolveMissionToOperations(page);

  // --- One measured page-load session: exactly one request per asset --------
  for (const path of D04_ENEMY_PATHS) {
    expect(
      countPathRequests(ledger, path),
      `enemy sprite request count for ${path}`,
    ).toBe(1);
  }
  const origin = new URL(page.url()).origin;
  for (const entry of ledger.filter((item) => item.url.startsWith('http'))) {
    expect(new URL(entry.url).origin).toBe(origin);
  }
  expect(ledger.some((entry) => /\/assets\/source\//.test(entry.url))).toBe(
    false,
  );
  expect(ledger.some((entry) => /\.jpe?g($|\?)/i.test(entry.url))).toBe(false);

  writeD04Evidence('v02-wi-07-d04-traversal.json', {
    scopeId: 'V02-WI-07-D04',
    ...d04CandidateIdentity(),
    buildIdentity: readBuildIdentity(),
    recordedAt: new Date().toISOString(),
    build: 'the ordinary locally served `dist/` production artifact',
    sessionSeed: D04_SESSION_SEED,
    route:
      'persisted schema-valid unlock fixture before the measured load; real Operations → Mission Details → Start Mission for Interception 01, 02, and 03; supported Evacuate → Continue terminal between missions',
    observations,
    requestingLedger: {
      total: ledger.length,
      nonLocal: ledger.filter((entry) => new URL(entry.url).origin !== origin)
        .length,
      manifestPathCounts: Object.fromEntries(
        D04_MANIFEST_PATHS.map((path) => [
          path,
          countPathRequests(ledger, path),
        ]),
      ),
    },
    pageErrors,
  });

  expect(pageErrors).toEqual([]);
});

test('V02-WI-07 D04 a controlled Basic Drone asset failure selects the approved procedural fallback for the page-load session and keeps it across mission entry and re-entry with no retry (V02-AC-025)', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const readBuildIdentity = installD04BuildIdentityCapture(page);

  // --- Reference load: the same authored encounter with the sprite ready ----
  const referencePage = await context.newPage();
  await referencePage.setViewportSize(MINIMUM_VIEWPORT);
  await forceD04SessionSeed(referencePage);
  await prepareD04MeasuredLoad(referencePage);
  await enterMission(referencePage, 'Interception 01');
  await waitForCountdown(referencePage, '03:10');
  await waitForCountdown(referencePage, '02:58');
  const referenceFrames = [await observeD04CombatFrame(referencePage)];
  for (const expected of ['02:56', '02:54']) {
    await waitForCountdown(referencePage, expected);
    referenceFrames.push(await observeD04CombatFrame(referencePage));
  }
  const referenceBasic = referenceFrames
    .flatMap((frame) => frame.enemies)
    .filter(isD04PreparedImage)
    .filter(isD04BasicSignature);
  expect(referenceBasic.length).toBeGreaterThanOrEqual(2);
  const referenceWidth = Math.max(
    ...referenceBasic.map((enemy) => enemy.refinedWidth),
  );
  const referenceHeight = Math.max(
    ...referenceBasic.map((enemy) => enemy.refinedHeight),
  );
  await referencePage.close();

  // --- Measured load: the approved prepared request fails before Boot settles
  await page.route('**/enemies/basic-drone.png', (route) => route.abort());
  const ledger: D04RequestEntry[] = [];
  page.on('request', (request) =>
    ledger.push({ url: request.url(), resourceType: request.resourceType() }),
  );
  await forceD04SessionSeed(page);
  await prepareD04MeasuredLoad(page, ledger);

  // The failed sprite was requested exactly once (aborted at Boot) and every
  // other approved manifest asset was requested exactly once.
  expect(countPathRequests(ledger, '/enemies/basic-drone.png')).toBe(1);
  for (const path of D04_MANIFEST_PATHS) {
    if (path === '/enemies/basic-drone.png') {
      continue;
    }
    expect(
      countPathRequests(ledger, path),
      `manifest request count for ${path}`,
    ).toBe(1);
  }

  await enterMission(page, 'Interception 01');
  await waitForCountdown(page, '03:10');
  await waitForCountdown(page, '02:58');
  const fallbackFrames = [await observeD04CombatFrame(page)];
  for (const expected of ['02:56', '02:54']) {
    await waitForCountdown(page, expected);
    fallbackFrames.push(await observeD04CombatFrame(page));
  }
  const fallbackEnemies = fallbackFrames.flatMap((frame) => frame.enemies);
  const fallbackBasics = fallbackEnemies.filter(isD04ProceduralFallback);
  expect(fallbackBasics.length).toBeGreaterThanOrEqual(2);
  // The failed kind never renders as a prepared image in this session.
  expect(
    fallbackEnemies.filter(
      (enemy) => isD04PreparedImage(enemy) && isD04BasicSignature(enemy),
    ),
  ).toEqual([]);
  // The approved fallback preserves the role's gameplay-scale complete rendered
  // bounds: measured against the ready render of the same authored encounter on
  // the same viewport and session seed.
  for (const enemy of fallbackBasics) {
    expect(Math.abs(enemy.refinedWidth - referenceWidth)).toBeLessThanOrEqual(
      6,
    );
    expect(Math.abs(enemy.refinedHeight - referenceHeight)).toBeLessThanOrEqual(
      6,
    );
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m01-basic-fallback.png'),
    fallbackFrames[1]!.shot,
  );

  // --- Re-entry keeps the same fixed session fallback and sends no request --
  const firstTerminal = await resolveMissionToOperations(page);
  await enterMission(page, 'Interception 01');
  await waitForCountdown(page, '03:10');
  await waitForCountdown(page, '02:58');
  const reEntryFrames = [await observeD04CombatFrame(page)];
  for (const expected of ['02:56', '02:54']) {
    await waitForCountdown(page, expected);
    reEntryFrames.push(await observeD04CombatFrame(page));
  }
  const reEntryEnemies = reEntryFrames.flatMap((frame) => frame.enemies);
  const reEntryBasics = reEntryEnemies.filter(isD04ProceduralFallback);
  writeD04Evidence('v02-wi-07-d04-asset-failure.json', {
    scopeId: 'V02-WI-07-D04',
    ...d04CandidateIdentity(),
    buildIdentity: readBuildIdentity(),
    recordedAt: new Date().toISOString(),
    failedRequestPath: '/enemies/basic-drone.png',
    referenceBasicBounds: {
      widestWidth: referenceWidth,
      tallestHeight: referenceHeight,
      preparedDistinctColours: referenceBasic.map(
        (enemy) => enemy.distinctColours,
      ),
    },
    fallbackBasicBounds: fallbackBasics,
    reEntryFallbackBounds: reEntryBasics,
    requestCounts: {
      failedPath: countPathRequests(ledger, '/enemies/basic-drone.png'),
      approvedManifestPaths: Object.fromEntries(
        D04_MANIFEST_PATHS.map((path) => [
          path,
          countPathRequests(ledger, path),
        ]),
      ),
    },
    firstTerminal,
    pageErrors,
  });
  expect(reEntryBasics.length).toBeGreaterThanOrEqual(2);
  for (const enemy of reEntryBasics) {
    expect(Math.abs(enemy.refinedWidth - referenceWidth)).toBeLessThanOrEqual(
      6,
    );
    expect(Math.abs(enemy.refinedHeight - referenceHeight)).toBeLessThanOrEqual(
      6,
    );
  }
  expect(countPathRequests(ledger, '/enemies/basic-drone.png')).toBe(1);
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m01-basic-fallback-reentry.png'),
    reEntryFrames[reEntryFrames.length - 1]!.shot,
  );

  expect(pageErrors).toEqual([]);
});

test('V02-WI-07 D04 a Basic Drone response that completes after the bounded Boot deadline stays inert: the approved fallback renders before and after the late completion with no second request and no late swap (V02-AC-025, MASTER-AC-013)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const readBuildIdentity = installD04BuildIdentityCapture(page);
  await forceD04SessionSeed(page);

  // Setup load without the delayed response so the fixture write settles.
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await seedPersistedCampaign(page, d04UnlockedCampaign());

  // Measured load: the approved sprite response completes 40 s after its
  // request, far past the bounded 5 s Boot deadline, and is therefore inert.
  await page.route('**/enemies/basic-drone.png', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 40_000));
    await route.continue();
  });
  const ledger: D04RequestEntry[] = [];
  page.on('request', (request) =>
    ledger.push({ url: request.url(), resourceType: request.resourceType() }),
  );
  ledger.length = 0;
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible({
    timeout: 30000,
  });

  await enterMission(page, 'Interception 01');
  await waitForCountdown(page, '03:10');
  await waitForCountdown(page, '02:58');
  const earlyFrames = [await observeD04CombatFrame(page)];
  for (const expected of ['02:56', '02:54']) {
    await waitForCountdown(page, expected);
    earlyFrames.push(await observeD04CombatFrame(page));
  }
  const earlyEnemies = earlyFrames.flatMap((frame) => frame.enemies);
  const earlyFallback = earlyEnemies.filter(isD04ProceduralFallback);
  expect(earlyFallback.length).toBeGreaterThanOrEqual(2);
  // The failed kind never renders as a prepared image before the late arrival.
  expect(
    earlyEnemies.filter(
      (enemy) => isD04PreparedImage(enemy) && isD04BasicSignature(enemy),
    ),
  ).toEqual([]);

  // The authored `00:55` group is rendered after the late response arrived: the
  // session result is still the approved procedural fallback, because the Boot
  // deadline already fixed it and a late completion cannot replace it.
  await waitForCountdown(page, '02:12');
  const lateFrames = [await observeD04CombatFrame(page)];
  for (const expected of ['02:10', '02:08']) {
    await waitForCountdown(page, expected);
    lateFrames.push(await observeD04CombatFrame(page));
  }
  const lateEnemies = lateFrames.flatMap((frame) => frame.enemies);
  const lateFallback = lateEnemies.filter(isD04ProceduralFallback);
  expect(lateFallback.length).toBeGreaterThanOrEqual(1);
  expect(
    lateEnemies.filter(
      (enemy) => isD04PreparedImage(enemy) && isD04BasicSignature(enemy),
    ),
  ).toEqual([]);
  // No retry and no second request after the late completion.
  expect(countPathRequests(ledger, '/enemies/basic-drone.png')).toBe(1);

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, 'v02-wi-07-d04-m01-basic-late-completion.png'),
    lateFrames[lateFrames.length - 1]!.shot,
  );
  writeD04Evidence('v02-wi-07-d04-late-completion.json', {
    scopeId: 'V02-WI-07-D04',
    ...d04CandidateIdentity(),
    buildIdentity: readBuildIdentity(),
    recordedAt: new Date().toISOString(),
    delayedResponseMs: 40_000,
    bootDeadlineMs: 5_000,
    earlyFallback,
    lateFallback,
    requestCounts: {
      failedPath: countPathRequests(ledger, '/enemies/basic-drone.png'),
      approvedManifestPaths: Object.fromEntries(
        D04_MANIFEST_PATHS.map((path) => [
          path,
          countPathRequests(ledger, path),
        ]),
      ),
    },
    pageErrors,
  });

  expect(pageErrors).toEqual([]);
});

test('V02-WI-07 D04 controlled Elite sprite failures keep each Elite asset to one Boot request with no late retry and leave the ordinary production artifact playable (V02-AC-025)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const readBuildIdentity = installD04BuildIdentityCapture(page);
  const elitePaths = [
    '/enemies/elite-drone-armoured.png',
    '/enemies/elite-drone-vulnerable.png',
  ];
  await page.route('**/enemies/elite-drone-*.png', (route) => route.abort());
  const ledger: D04RequestEntry[] = [];
  page.on('request', (request) =>
    ledger.push({ url: request.url(), resourceType: request.resourceType() }),
  );
  await forceD04SessionSeed(page);
  await prepareD04MeasuredLoad(page, ledger);

  // Both Elite state sprites failed at Boot; the complete five-sprite pack is
  // still exactly five requests for the page load.
  for (const path of elitePaths) {
    expect(countPathRequests(ledger, path)).toBe(1);
  }
  expect(
    D04_ENEMY_PATHS.reduce(
      (total, path) => total + countPathRequests(ledger, path),
      0,
    ),
  ).toBe(5);

  // The ordinary artifact stays playable: Mission 03 starts through the real
  // flow and renders its authored first encounter from the prepared sprites.
  await enterMission(page, 'Interception 03');
  await waitForCountdown(page, '05:20');
  await waitForCountdown(page, '05:08');
  const frame = await observeD04CombatFrame(page);
  expect(
    frame.enemies.filter(isD04PreparedImage).some(isD04BasicSignature),
  ).toBe(true);
  // Combat entry and rendering issued no late Elite retry.
  for (const path of elitePaths) {
    expect(countPathRequests(ledger, path)).toBe(1);
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  // Correction delta 1: this frame is the authored PRE-Elite Mission 03 first
  // encounter rendered while both approved Elite sprite requests failed at Boot.
  // It is deliberately NOT named or recorded as an Elite fallback frame and must
  // never be read as Elite production proof; the natural Elite fallback frames
  // are captured by the D04-C01 player-controlled production session.
  const preEliteFramePath = join(
    EVIDENCE_DIR,
    'v02-wi-07-d04-m03-pre-elite-basic-encounter-under-elite-asset-failure.png',
  );
  writeFileSync(preEliteFramePath, frame.shot);
  writeD04Evidence('v02-wi-07-d04-elite-asset-failure.json', {
    scopeId: 'V02-WI-07-D04',
    ...d04CandidateIdentity(),
    buildIdentity: readBuildIdentity(),
    recordedAt: new Date().toISOString(),
    failedRequestPaths: elitePaths,
    screenshot: {
      path: '.agent-handoff/evidence/v02-wi-07-d04-m03-pre-elite-basic-encounter-under-elite-asset-failure.png',
      semantics:
        'the authored pre-Elite Mission 03 first encounter (Basic Drones) rendered by the ordinary production artifact while both approved Elite sprite requests failed at Boot; it is not an Elite fallback frame and provides no Elite rendering evidence',
    },
    eliteRenderingEvidence:
      'captured by the D04-C01 player-controlled production sessions (prepared and forced-fallback) recorded under .agent-handoff/evidence/manual-m03-d04*/',
    requestCounts: Object.fromEntries(
      elitePaths.map((path) => [path, countPathRequests(ledger, path)]),
    ),
    pageErrors,
  });

  expect(pageErrors).toEqual([]);
});

test('V02-WI-07 D04 the final ordinary dist artifact ships exactly the five approved prepared enemy PNGs, no source original, within the pack and manifest byte budgets (V02-AC-025, Epic §16.1/§16.4)', () => {
  const dist = join(process.cwd(), 'dist');
  expect(existsSync(join(dist, 'index.html'))).toBe(true);

  const distEnemyDirectory = join(dist, 'enemies');
  const enemyFiles = readdirSync(distEnemyDirectory)
    .filter((file) => file.endsWith('.png'))
    .sort();
  expect(enemyFiles).toEqual(Object.keys(D04_ENEMY_DIMENSIONS).sort());

  const perFile: Record<string, unknown> = {};
  let enemyPackBytes = 0;
  for (const file of enemyFiles) {
    const distPath = join(distEnemyDirectory, file);
    const sourcePath = join(
      process.cwd(),
      'assets',
      'runtime',
      'enemies',
      file,
    );
    const distBytes = readFileSync(distPath);
    // The artifact ships exactly the approved prepared file, byte for byte.
    expect(distBytes.equals(readFileSync(sourcePath))).toBe(true);
    // Format and real alpha: 8-bit RGBA PNG with genuinely transparent pixels.
    expect(distBytes.readUInt8(24)).toBe(8);
    expect(distBytes.readUInt8(25)).toBe(6);
    const raster = decodePng(distBytes);
    const [expectedWidth, expectedHeight] = D04_ENEMY_DIMENSIONS[file] ?? [
      0, 0,
    ];
    expect(raster.width).toBe(expectedWidth);
    expect(raster.height).toBe(expectedHeight);
    let transparentPixels = 0;
    for (let index = 3; index < raster.data.length; index += 4) {
      if ((raster.data[index] ?? 255) < 255) {
        transparentPixels += 1;
      }
    }
    expect(transparentPixels).toBeGreaterThan(0);
    const bytes = statSync(distPath).size;
    enemyPackBytes += bytes;
    perFile[file] = {
      bytes,
      width: raster.width,
      height: raster.height,
      transparentPixels,
    };
  }
  expect(enemyPackBytes).toBeLessThanOrEqual(D04_ENEMY_PACK_BUDGET_BYTES);

  const listFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    });
  const allFiles = listFiles(dist);
  // No source originals, no JPEG source material, no source maps.
  expect(
    allFiles.some(
      (path) =>
        path.includes(join('assets', 'source')) ||
        /\.jpe?g$/i.test(path) ||
        /\.map$/i.test(path),
    ),
  ).toBe(false);

  // The complete runtime asset manifest as served (everything except the entry
  // document and the emitted JS/CSS).
  const runtimeAssetBytes = allFiles
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
      return !path.endsWith('.css');
    })
    .reduce((total, path) => total + statSync(path).size, 0);
  expect(runtimeAssetBytes).toBeGreaterThan(0);
  expect(runtimeAssetBytes).toBeLessThanOrEqual(D04_MANIFEST_BUDGET_BYTES);

  const revision = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const workingTree = execSync('git status --porcelain', {
    encoding: 'utf8',
  }).trim();
  const identity = d04CandidateIdentity();
  // The audit's own revision read must agree with the bound candidate identity.
  expect(identity.baseRevision).toBe(revision);
  writeD04Evidence('v02-wi-07-d04-artifact-audit.json', {
    scopeId: 'V02-WI-07-D04',
    ...identity,
    revision,
    dirty: workingTree.length > 0,
    workingTreeEntries: workingTree.split('\n').filter((line) => line !== ''),
    enemyFiles: perFile,
    enemyPackBytes,
    enemyPackBudgetBytes: D04_ENEMY_PACK_BUDGET_BYTES,
    enemyPackHistoricBytes: D04_HISTORIC_ENEMY_PACK_BYTES,
    enemyPackDeltaVsHistoric: enemyPackBytes - D04_HISTORIC_ENEMY_PACK_BYTES,
    runtimeAssetBytes,
    runtimeAssetBudgetBytes: D04_MANIFEST_BUDGET_BYTES,
    manifestHistoricBytes: D04_HISTORIC_MANIFEST_BYTES,
    manifestDeltaVsHistoric: runtimeAssetBytes - D04_HISTORIC_MANIFEST_BYTES,
  });
  console.log(
    'V02-WI07-D04-ARTIFACT',
    JSON.stringify({
      revision,
      enemyPackBytes,
      runtimeAssetBytes,
      enemyPackDelta: enemyPackBytes - D04_HISTORIC_ENEMY_PACK_BYTES,
      manifestDelta: runtimeAssetBytes - D04_HISTORIC_MANIFEST_BYTES,
    }),
  );
});
