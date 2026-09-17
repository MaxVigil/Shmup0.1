import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V02-WI-06 E03 bounded Mission 03 browser wiring (Epic §6.2, §8.3–8.3.1,
 * §13.2/§13.4, §15.2; V02-AC-001/002/005/014/020/022).
 *
 * The REAL application runs at the minimum `1280 × 600` CSS viewport: the real
 * React shell, the real lazy Phaser Combat entry, the real fixed-step simulation
 * over the authored Mission 03 staging, the real IndexedDB campaign
 * transaction, and the real blocking Overlay contract.
 *
 * The bounded vertical starts from a supported persisted progression state
 * (Mission 01 and 02 completed, Mission 03 unlocked) written through the same
 * campaign store the application owns, then drives the ordinary UI: Operations →
 * Interception 03 Mission Details → Start Mission → active Combat with the
 * `05:20` Countdown and the authored `interception-03-e1` Encounter → the
 * production `Evacuate` commitment and its `EVACUATED` result → `Continue` back
 * to Operations with Mission 03 still incomplete/replayable and no Combat
 * residue.
 *
 * The complete `05:20` production playthrough, the real-scale Elite state
 * captures, and the final Success/replay evidence remain `V02-WI-06 E04`-owned
 * and are deliberately NOT simulated here through a hidden hook or a shortened
 * surrogate. Deterministic Elite creation, economy, terminal priority, and
 * presentation geometry are owned by the Vitest evidence in
 * `src/application/combat/combat-mission-03.test.ts`,
 * `src/application/mission/mission-03-progression.test.ts`, and
 * `src/combat-presentation/phaser/combat-scene-elite-visuals.test.ts`.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };
const DB_NAME = 'shmup-v0.2';

interface DevObservability {
  readonly combatSeed: number;
  readonly missionTimeSeconds: number;
  readonly countdownSeconds: number;
  readonly currentEncounterId: string | null;
  readonly playerHullIntegrity: number;
  readonly activeEnemiesByType: Readonly<Record<string, number>>;
  readonly pendingCombatRewards: number;
  readonly pendingEscapePenalties: number;
}

interface CampaignValue {
  readonly schemaVersion: number;
  readonly runStatus: string;
  readonly credits: number;
  readonly hullIntegrity: number;
  readonly missionInProgress: {
    readonly missionId: string;
    readonly attemptId: number;
  } | null;
  readonly completedMissionIds: readonly string[];
  readonly unlockedMissionIds: readonly string[];
}

interface CampaignRow {
  readonly id: string;
  readonly rowFormatVersion: number;
  readonly value: CampaignValue;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Reads the authoritative read-only development observability snapshot. */
async function readObservability(page: Page): Promise<DevObservability> {
  return page.evaluate(() => {
    const hook = (
      window as Window & {
        __shmupDevObservability__?: () => DevObservability;
      }
    ).__shmupDevObservability__;
    if (hook === undefined) {
      throw new Error('development observability is unavailable');
    }
    return hook();
  });
}

/** Reads the raw persisted campaign row envelope through IndexedDB. */
async function readCampaignRow(page: Page): Promise<CampaignRow> {
  return page.evaluate(async (dbName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
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
    return row as CampaignRow;
  }, DB_NAME);
}

/** Writes a supported persisted progression state through the campaign store
 *  envelope the application owns (schema-valid, current row format). */
async function seedProgression(
  page: Page,
  value: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    async ({ dbName, record }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
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
    },
    { dbName: DB_NAME, record: value },
  );
}

test('Mission 03 starts from the unlocked progression state with its 05:20 Countdown and reaches a supported terminal/cleanup path (V02-AC-001/002/005/014/020/022)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Seed the supported progression state: Mission 01 and 02 completed, so the
  // authored Mission 03 unlock is already persisted and 03 is available.
  await seedProgression(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 42,
    aircraftId: 'german-fighter',
    hullIntegrity: 55,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: [
      'interception-01',
      'interception-02',
      'interception-03',
    ],
    completedMissionIds: ['interception-01', 'interception-02'],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
  });
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 01 (Completed)' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 02 (Completed)' }),
  ).toBeEnabled();
  const mission03Point = page.getByRole('button', { name: 'Interception 03' });
  await expect(mission03Point).toBeVisible();
  await expect(mission03Point).toBeEnabled();
  await expect(page.getByText('Credits: 42')).toBeVisible();

  // --- Mission 03 Mission Details and active Combat with the 05:20 Countdown --
  await mission03Point.click();
  const details = page.getByRole('dialog');
  await expect(
    details.getByRole('heading', { name: 'Interception 03' }),
  ).toBeVisible();
  await expect(details).toContainText('Resolve the incoming enemy wave.');
  await expect(details.getByText('16 Credits', { exact: true })).toBeVisible();
  const startMission03 = details.getByRole('button', {
    name: 'Start Mission',
  });
  await expect(startMission03).toBeFocused();
  await startMission03.click();

  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  const countdown = page.locator('.ds-combat-countdown');
  // The authored Mission 03 final arrival is 05:20 (Epic §8.3/§15.2).
  await expect(countdown).toHaveText('05:20');
  await expect(page.locator('.ds-combat-hud')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // The durable Mission 03 marker is persisted before Combat starts.
  const rowAtStart = await readCampaignRow(page);
  expect(rowAtStart.value.missionInProgress?.missionId).toBe('interception-03');
  expect(
    Number.isSafeInteger(rowAtStart.value.missionInProgress?.attemptId),
  ).toBe(true);
  expect(rowAtStart.value.credits).toBe(42);
  expect(rowAtStart.value.hullIntegrity).toBe(55);

  // The authored Mission 03 schedule is consumed by the real runtime: the first
  // Encounter creates on its exact 00:10 step, and the Countdown keeps using the
  // ceiling formula afterwards.
  await expect
    .poll(async () => (await readObservability(page)).currentEncounterId, {
      timeout: 30000,
      intervals: [100, 200],
    })
    .toBe('interception-03-e1');
  const atFirstArrival = await readObservability(page);
  expect(atFirstArrival.missionTimeSeconds).toBeGreaterThanOrEqual(10);
  expect(
    atFirstArrival.activeEnemiesByType['basic-drone'],
  ).toBeGreaterThanOrEqual(1);
  await expect(countdown).toHaveText(/^05:1\d$/);

  // --- Supported terminal path through the real boundary: Evacuation ----------
  const evacuate = page.getByRole('button', { name: 'Evacuate' });
  await expect(evacuate).toBeVisible();
  await evacuate.click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', { name: 'Evacuate?' }),
  ).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Confirm Evacuation' })
    .click();
  // The normal Combat Countdown is replaced by the Evacuation Countdown.
  await expect(countdown).toHaveText('EVACUATION 00:05');
  const result = page.getByRole('dialog');
  await expect(result.getByRole('heading', { name: 'EVACUATED' })).toBeVisible({
    timeout: 30000,
  });
  await expect(result.getByText('Mission not completed')).toBeVisible();
  await expect(result.getByText('Retained 50%')).toBeVisible();
  await expect(result.getByRole('button', { name: 'Continue' })).toBeVisible();
  // The single Combat owner was disposed with the resolved mission.
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.ds-combat-hud')).toHaveCount(0);
  await expect(page.locator('.ds-combat-countdown')).toHaveCount(0);

  // The committed campaign row: marker cleared, Mission 03 still incomplete, and
  // no duplicate completion or unlock.
  const committed = await readCampaignRow(page);
  expect(committed.value.missionInProgress).toBeNull();
  expect(committed.value.completedMissionIds).toEqual([
    'interception-01',
    'interception-02',
  ]);
  expect(committed.value.unlockedMissionIds).toEqual([
    'interception-01',
    'interception-02',
    'interception-03',
  ]);

  // --- Continue returns to Operations with Mission 03 still replayable --------
  await result.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Interception 03' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Interception 03 (Completed)' }),
  ).toHaveCount(0);
  await expect(page.locator('.ds-combat-countdown')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        typeof (window as Window & { __shmupDevObservability__?: unknown })
          .__shmupDevObservability__,
    ),
  ).toBe('undefined');
  const afterContinue = await readCampaignRow(page);
  expect(afterContinue.value).toEqual(committed.value);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
