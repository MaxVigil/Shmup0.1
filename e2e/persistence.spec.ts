import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V02-WI-02 persistence and browser lifecycle evidence (Epic §13.6, §14.1–14.3,
 * V02-AC-017/018/020/021). Real Chromium IndexedDB is exercised through the
 * Dexie adapter: campaign persistence across reload, exactly-once active-mission
 * Defeat recovery, separately persisted Settings surviving reload and confirmed
 * New Game, the Save Data Error flow for a corrupt campaign, the Game Over
 * flow for an unaffordable Defeat, and single-record IndexedDB hygiene.
 *
 * Each Playwright test uses a fresh browser context, so IndexedDB is isolated
 * per test; reloads within a test share the context and therefore the durable
 * records.
 */
const MINIMUM_VIEWPORT = { width: 1280, height: 600 };

/** Exact database/table names owned by the Dexie adapter. */
const DB_NAME = 'shmup-v0.2';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(MINIMUM_VIEWPORT);
});

/** Replaces the persisted campaign record through IndexedDB (test seeding).
 *  The stored value is validated by the application on the next Boot, so a
 *  corrupt record exercises the non-overwriting Save Data Error path. */
async function writeCampaignRecord(page: Page, value: unknown): Promise<void> {
  await page.evaluate(
    async ({ dbName, record }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('campaign', 'readwrite');
        // A current-format row: the exact row-envelope provenance marker is
        // part of the platform CampaignRow envelope, outside CampaignStateV1
        // (V02-WI-02 C07). Value corruption inside a marked row still fails
        // current Domain validation.
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

/** Reads the stored campaign row envelope directly through IndexedDB (raw,
 *  unvalidated), including the row-format provenance marker. */
async function readStoredCampaign(page: Page): Promise<{
  rowFormatVersion?: unknown;
  value: {
    missionInProgress: { attemptId: number } | null;
    nextMissionAttemptId?: unknown;
    credits: number;
    hullIntegrity: number;
    runStatus: string;
  };
}> {
  return page.evaluate(
    async ({ dbName }) => {
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
      return row as {
        rowFormatVersion?: unknown;
        value: {
          missionInProgress: { attemptId: number } | null;
          nextMissionAttemptId?: unknown;
          credits: number;
          hullIntegrity: number;
        };
      };
    },
    { dbName: DB_NAME },
  );
}

/** The path-qualified diagnostic shape Boot records for an unreadable campaign
 *  (Epic §14.2, V02-DEC-034, V02-AC-021). Declared locally: `e2e/` never
 *  imports application or Domain modules. */
interface SaveDataDiagnostic {
  readonly path: string;
  readonly message: string;
}

/**
 * Captures the development-only Save Data Error diagnostics (V02-WI-07 D02-B).
 * Boot records them through ONE `console.warn('Save Data Error diagnostics:', …)`
 * call; the console arguments are read as data so a test asserts the exact
 * path-qualified causes instead of a formatted string. Register the returned
 * collector before navigating; it accumulates one entry per console call.
 */
function captureSaveDataDiagnostics(page: Page): SaveDataDiagnostic[] {
  const captured: SaveDataDiagnostic[] = [];
  page.on('console', (message) => {
    const args = message.args();
    if (args.length < 2) {
      return;
    }
    void (async () => {
      const [label, payload] = await Promise.all([
        args[0].jsonValue(),
        args[1].jsonValue(),
      ]);
      if (label === 'Save Data Error diagnostics:' && Array.isArray(payload)) {
        captured.push(...(payload as SaveDataDiagnostic[]));
      }
    })();
  });
  return captured;
}

test('a C03-shaped version-1 database upgrades, removes the obsolete counter, preserves Campaign and Settings, and allocates the first version-2 attempt id strictly above the legacy counter (V02-WI-02 C05)', async ({
  page,
}) => {
  // Create a REAL version-1 database (campaign + userSettings stores only) and
  // seed a genuine C03-shaped campaign: it carries the obsolete
  // `nextMissionAttemptId: 5` (legacy issued ids 0..4) and no marker.
  await page.addInitScript(
    ({ dbName, campaign, settings }) => {
      const created = new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('campaign')) {
            database.createObjectStore('campaign', { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains('userSettings')) {
            database.createObjectStore('userSettings', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ['campaign', 'userSettings'],
            'readwrite',
          );
          transaction
            .objectStore('campaign')
            .put({ id: 'current', value: campaign });
          transaction
            .objectStore('userSettings')
            .put({ id: 'current', value: settings });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      });
      (window as { __v1Created?: Promise<void> }).__v1Created = created;
    },
    {
      dbName: DB_NAME,
      campaign: {
        schemaVersion: 1,
        runStatus: 'active',
        credits: 40,
        aircraftId: 'german-fighter',
        hullIntegrity: 55,
        equippedWeapon: 'cannon',
        unlockedMissionIds: ['interception-01'],
        completedMissionIds: [],
        missionInProgress: null,
        nextMissionAttemptId: 5,
        pilotId: 'pilot-shevchenko',
      },
      settings: { mouseMovementEnabled: false },
    },
  );

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  // No Save Data Error; Boot hydrates the preserved campaign and Settings.
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 40')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mouse Movement Enabled' }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Close' }).click();

  // The stored campaign no longer carries the obsolete counter and the row
  // envelope carries the exact current-format provenance marker (C07); the
  // allocator store holds exactly the migration seed row (key = the legacy
  // high-water mark 4).
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBe(2);
  expect(stored.value.nextMissionAttemptId).toBeUndefined();
  expect(stored.value.credits).toBe(40);
  const allocatorState = await page.evaluate(
    async ({ dbName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const hasAllocator =
        database.objectStoreNames.contains('missionAttempts');
      let allocatorCount = -1;
      let maxKey = -1;
      if (hasAllocator) {
        const rows = await new Promise<Array<{ id: number }>>(
          (resolve, reject) => {
            const transaction = database.transaction(
              'missionAttempts',
              'readonly',
            );
            const store = transaction.objectStore('missionAttempts');
            const getAll = store.getAll();
            getAll.onsuccess = () =>
              resolve(
                (getAll.result as Array<{ id: number }>).map((row) => ({
                  id: row.id,
                })),
              );
            getAll.onerror = () => reject(getAll.error);
          },
        );
        allocatorCount = rows.length;
        maxKey = rows.reduce((max, row) => Math.max(max, row.id), -1);
      }
      database.close();
      return { hasAllocator, allocatorCount, maxKey };
    },
    { dbName: DB_NAME },
  );
  expect(allocatorState.hasAllocator).toBe(true);
  expect(allocatorState.allocatorCount).toBe(1);
  expect(allocatorState.maxKey).toBe(4);

  // The first version-2 mission allocates attempt id 5 — strictly above the
  // legacy high-water mark (counter next value 5 means ids 0..4 were issued).
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  const afterStart = await readStoredCampaign(page);
  expect(afterStart.rowFormatVersion).toBe(2);
  expect(afterStart.value.missionInProgress?.attemptId).toBe(5);
});

test('a C03-shaped version-1 database with a mission in progress upgrades, resolves the marker as startup Defeat, and only then allocates a strictly higher attempt id (V02-WI-02 C05)', async ({
  page,
}) => {
  // Seed a genuine C03-shaped campaign WITH a persisted mission in progress
  // (marker attempt id 2, counter next value 3 → legacy high-water mark 2).
  await page.addInitScript(
    ({ dbName, campaign, settings }) => {
      const created = new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('campaign')) {
            database.createObjectStore('campaign', { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains('userSettings')) {
            database.createObjectStore('userSettings', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ['campaign', 'userSettings'],
            'readwrite',
          );
          transaction
            .objectStore('campaign')
            .put({ id: 'current', value: campaign });
          transaction
            .objectStore('userSettings')
            .put({ id: 'current', value: settings });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      });
      (window as { __v1Created?: Promise<void> }).__v1Created = created;
    },
    {
      dbName: DB_NAME,
      campaign: {
        schemaVersion: 1,
        runStatus: 'active',
        credits: 12,
        aircraftId: 'german-fighter',
        hullIntegrity: 60,
        equippedWeapon: 'machine-gun',
        unlockedMissionIds: ['interception-01'],
        completedMissionIds: [],
        missionInProgress: {
          missionId: 'interception-01',
          attemptId: 2,
        },
        nextMissionAttemptId: 3,
        pilotId: 'pilot-shevchenko',
      },
      settings: { mouseMovementEnabled: true },
    },
  );

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  // No Save Data Error. Startup recovery is authoritative over the persisted
  // marker: it resolves exactly once as Defeat (8 Credits deducted, Hull 100,
  // marker cleared) — V02-AC-018.
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();
  const recovered = await readStoredCampaign(page);
  expect(recovered.rowFormatVersion).toBe(2);
  expect(recovered.value.missionInProgress).toBeNull();
  expect(recovered.value.hullIntegrity).toBe(100);
  expect(recovered.value.nextMissionAttemptId).toBeUndefined();

  // The next mission allocates attempt id 3 — strictly above the legacy
  // high-water mark 2 — proving the migration seeded the generator correctly.
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });
  const afterStart = await readStoredCampaign(page);
  expect(afterStart.rowFormatVersion).toBe(2);
  expect(afterStart.value.missionInProgress?.attemptId).toBe(3);
});

test('Settings persist across reload (V02-AC-017, Epic §14.1)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  const checkbox = page.getByRole('checkbox', {
    name: 'Mouse Movement Enabled',
  });
  await expect(checkbox).toBeChecked();
  await page.getByText('Mouse Movement Enabled').click();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mouse Movement Enabled' }),
  ).not.toBeChecked();
});

test('reload during an active mission resolves exactly once as Defeat with paid full Repair (V02-AC-018)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
  // Start Combat: the missionInProgress marker is persisted before Combat.
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();

  await page.reload();
  // Zero reward; exactly 8 Credits deducted; full Repair to Hull 100; Combat
  // is never restored.
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();

  // A second reload sees the cleared marker: no second deduction (exactly
  // once). The durable campaign record also stays a single 'current' row.
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 4')).toBeVisible();
  const rows = await page.evaluate(async (dbName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction('campaign', 'readonly');
      const request = transaction.objectStore('campaign').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return count;
  }, DB_NAME);
  expect(rows).toBe(1);
});

test('V02-WI-07 D02-A: the Debug campaign rows read the authoritative record, Set Credits: 7 applies atomically, and Reload for Recovery resolves the marker once as Game Over (V02-AC-016/018/020/026)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(1, {
    timeout: 15000,
  });

  // The development Debug surface reads the PERSISTED campaign, not the session.
  await page.keyboard.press('F1');
  const dialog = page.getByRole('dialog');
  const row = (label: string) =>
    dialog
      .locator('.ds-field-row')
      .filter({ has: page.getByText(label, { exact: true }) });
  const persisted = await readStoredCampaign(page);
  const marker = persisted.value.missionInProgress;
  expect(marker).not.toBeNull();
  await expect(row('Credits')).toContainText('12');
  await expect(row('missionInProgress')).toContainText(
    `interception-01 · attempt ${marker!.attemptId}`,
  );
  await expect(row('runStatus')).toContainText('active');

  // Set Credits: 7 (below the 8-Credit Repair cost) through the atomic campaign
  // transaction; the durable record is updated before the session reflects it.
  await dialog.getByRole('button', { name: 'Set Credits: 7' }).click();
  await expect(row('Credits')).toContainText('7');
  await expect
    .poll(async () => (await readStoredCampaign(page)).value.credits)
    .toBe(7);
  // The exact marker is untouched by a Credit change.
  expect((await readStoredCampaign(page)).value.missionInProgress).toEqual(
    marker,
  );

  // Reload for Recovery performs browser navigation only; Boot owns recovery.
  await dialog.getByRole('button', { name: 'Reload for Recovery' }).click();
  await expect(page.getByTestId('game-over-screen')).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText('GAME OVER')).toBeVisible();
  // No partial deduction, the exact marker cleared, and no Combat restored.
  await expect(page.locator('.ds-combat-canvas canvas')).toHaveCount(0);
  await expect(page.getByTestId('combat-screen')).toHaveCount(0);
  const afterRecovery = await readStoredCampaign(page);
  expect(afterRecovery.value.credits).toBe(7);
  expect(afterRecovery.value.runStatus).toBe('game-over');
  expect(afterRecovery.value.missionInProgress).toBeNull();
  await expect(page.getByTestId('game-over-screen')).toHaveCount(1);

  // A second reload is inert: the cleared marker is never re-resolved.
  await page.reload();
  await expect(page.getByTestId('game-over-screen')).toBeVisible();
  const afterSecond = await readStoredCampaign(page);
  expect(afterSecond.value.credits).toBe(7);
  expect(afterSecond.value.runStatus).toBe('game-over');
  expect(afterSecond.value.missionInProgress).toBeNull();
});
test('a Combat initialization failure clears the persisted marker, allows retry, and never deducts on reload (Base AC-014 correction)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();

  // Force the lazy Combat initialization to reject: the dynamic import of the
  // Combat presentation entry is blocked in the development server.
  await page.route('**/src/combat-presentation/entry.ts', (route) =>
    route.abort(),
  );
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();

  // The start persisted missionInProgress, then initialization rejected; the
  // application command cleared the marker and reconciled in-memory state.
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Unable to start mission.')).toBeVisible();

  // Reload: the failed start never becomes a paid Defeat (marker cleared, so
  // no 8-Credit deduction from the 12 Starting Credits).
  await page.unroute('**/src/combat-presentation/entry.ts');
  await page.reload();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();

  // A retry in the same session succeeds now that the lazy boundary is back.
  await page.getByRole('button', { name: 'Interception 01' }).click();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
});

test('an unaffordable Defeat recovery opens Game Over; confirmed New Game resets the run and keeps Settings (V02-AC-016/017)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Persist a distinct Settings value that must survive the New Game.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByText('Mouse Movement Enabled').click();
  await expect(
    page.getByRole('checkbox', { name: 'Mouse Movement Enabled' }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Close' }).click();

  // Seed an active mission with only 7 Credits (below the 8-Credit Repair
  // cost), then reload: the marker resolves as Defeat and the run enters Game
  // Over with no partial deduction.
  await writeCampaignRecord(page, {
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
  });
  await page.reload();
  await expect(page.getByTestId('game-over-screen')).toBeVisible();
  await expect(
    page.getByText('The aircraft cannot be repaired.'),
  ).toBeVisible();

  // Cancel leaves Game Over intact (nothing is silently deleted).
  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('game-over-screen')).toBeVisible();

  // Confirming the destructive New Game atomically replaces the run and
  // reopens Operations with 12 Starting Credits while Settings are preserved.
  await page.getByRole('button', { name: 'New Game' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
  // The confirmed replacement wrote a marked current-format row (C07) and the
  // allocator is never reset or seeded by a replacement.
  const replaced = await readStoredCampaign(page);
  expect(replaced.rowFormatVersion).toBe(2);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mouse Movement Enabled' }),
  ).not.toBeChecked();
});

test('a corrupt campaign opens the Save Data Error Screen and only a confirmed Start New Game replaces it (V02-AC-021)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // Corrupt the stored campaign (invalid Credits) directly in IndexedDB.
  await writeCampaignRecord(page, {
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

  // The unreadable record is never overwritten by a plain reload.
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();

  // Start New Game opens the blocking destructive confirmation.
  await page.getByRole('button', { name: 'Start New Game' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page
      .getByRole('dialog')
      .getByText('Start a new game? Current run progress will be reset.'),
  ).toBeVisible();
  // Cancel does not replace anything.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();

  // Confirming replaces the campaign atomically and opens Operations.
  await page.getByRole('button', { name: 'Start New Game' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
});

/** Reads the allocator store directly through IndexedDB (raw). Returns the
 *  store's existence, row count, and maximum key; the migration seed is the
 *  only row a valid legacy upgrade may write. */
async function readAllocatorState(page: Page): Promise<{
  hasAllocator: boolean;
  allocatorCount: number;
  maxKey: number;
}> {
  return page.evaluate(
    async ({ dbName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const hasAllocator =
        database.objectStoreNames.contains('missionAttempts');
      let allocatorCount = -1;
      let maxKey = -1;
      if (hasAllocator) {
        const rows = await new Promise<Array<{ id: number }>>(
          (resolve, reject) => {
            const transaction = database.transaction(
              'missionAttempts',
              'readonly',
            );
            const store = transaction.objectStore('missionAttempts');
            const getAll = store.getAll();
            getAll.onsuccess = () =>
              resolve(
                (getAll.result as Array<{ id: number }>).map((row) => ({
                  id: row.id,
                })),
              );
            getAll.onerror = () => reject(getAll.error);
          },
        );
        allocatorCount = rows.length;
        maxKey = rows.reduce((max, row) => Math.max(max, row.id), -1);
      }
      database.close();
      return { hasAllocator, allocatorCount, maxKey };
    },
    { dbName: DB_NAME },
  );
}

/** Seeds a REAL version-1 database (campaign + userSettings stores only) with
 *  a C03-shaped campaign before the application opens it. `settings` may seed
 *  a distinct value so preservation across confirmed replacement is provable. */
async function seedVersion1Database(
  page: Page,
  campaign: Record<string, unknown>,
  settings: { mouseMovementEnabled: boolean } = { mouseMovementEnabled: true },
): Promise<void> {
  await page.addInitScript(
    ({ dbName, campaign: seeded, settings }) => {
      const created = new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('campaign')) {
            database.createObjectStore('campaign', { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains('userSettings')) {
            database.createObjectStore('userSettings', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ['campaign', 'userSettings'],
            'readwrite',
          );
          transaction
            .objectStore('campaign')
            .put({ id: 'current', value: seeded });
          transaction
            .objectStore('userSettings')
            .put({ id: 'current', value: settings });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => {
          // On a reload the application has already opened this database at
          // version 2, so opening version 1 raises VersionError: nothing to
          // seed, resolve as a no-op.
          const error = request.error;
          if (error instanceof DOMException && error.name === 'VersionError') {
            resolve();
            return;
          }
          reject(error);
        };
      });
      (window as { __v1Created?: Promise<void> }).__v1Created = created;
    },
    {
      dbName: DB_NAME,
      campaign,
      settings,
    },
  );
}
/** Seeds a REAL version-1 database whose campaign row carries the EXACT given
 *  envelope (V02-WI-07 D02-B-C01 F1; V02-DEC-035). A wrong-marker fixture needs
 *  a `rowFormatVersion` property that the accepted C03 seeding helper never
 *  writes; every other acceptance rule (the application still opens version 2
 *  and still rejects the row) is unchanged. Playwright's argument serializer
 *  drops `undefined` property values, so `presentUndefinedMarker: true`
 *  reconstructs a present-undefined marker INSIDE the page instead of
 *  transporting it as data. */
async function seedVersion1CampaignRow(
  page: Page,
  row: Record<string, unknown>,
  settings: { mouseMovementEnabled: boolean } = { mouseMovementEnabled: true },
  presentUndefinedMarker = false,
): Promise<void> {
  await page.addInitScript(
    ({ dbName, row: seededRow, settings: seededSettings, undefinedMarker }) => {
      const envelope: Record<string, unknown> = undefinedMarker
        ? {
            id: seededRow.id,
            rowFormatVersion: undefined,
            value: seededRow.value,
          }
        : seededRow;
      const created = new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('campaign')) {
            database.createObjectStore('campaign', { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains('userSettings')) {
            database.createObjectStore('userSettings', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ['campaign', 'userSettings'],
            'readwrite',
          );
          transaction.objectStore('campaign').put(envelope);
          transaction
            .objectStore('userSettings')
            .put({ id: 'current', value: seededSettings });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => {
          const error = request.error;
          if (error instanceof DOMException && error.name === 'VersionError') {
            resolve();
            return;
          }
          reject(error);
        };
      });
      (window as { __v1Created?: Promise<void> }).__v1Created = created;
    },
    {
      dbName: DB_NAME,
      row,
      settings,
      undefinedMarker: presentUndefinedMarker,
    },
  );
}

/** Writes a campaign row whose `rowFormatVersion` property is PRESENT but
 *  `undefined` into the current database (V02-WI-07 D02-B-C01 F1 boundary) and
 *  reports whether the property survived the IndexedDB round trip. The property
 *  is constructed inside the page, so the real structured-clone semantics
 *  decide; Chromium keeps it. */
async function writePresentUndefinedMarkerRow(
  page: Page,
  value: Record<string, unknown>,
): Promise<boolean> {
  return page.evaluate(
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
          rowFormatVersion: undefined,
          value: record,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      const row = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const transaction = database.transaction('campaign', 'readonly');
          const get = transaction.objectStore('campaign').get('current');
          get.onsuccess = () => resolve(get.result as Record<string, unknown>);
          get.onerror = () => reject(get.error);
        },
      );
      database.close();
      return Object.hasOwn(row, 'rowFormatVersion');
    },
    { dbName: DB_NAME, record: value },
  );
}
/** A fully valid C03 persisted campaign value: the version-1 fixtures that must
 *  NOT be promoted by the shared envelope guard carry fields that would pass the
 *  complete legacy C03 validation (V02-DEC-035). */
function c03LikeValidValue(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 40,
    aircraftId: 'german-fighter',
    hullIntegrity: 55,
    equippedWeapon: 'cannon',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    nextMissionAttemptId: 5,
    pilotId: 'pilot-shevchenko',
  };
}

/** Reads the raw persisted Settings row through IndexedDB (V02-DEC-035 upgrade
 *  fixtures assert Settings preservation without entering the game). */
async function readStoredSettings(page: Page): Promise<{
  readonly value?: { readonly mouseMovementEnabled?: unknown };
}> {
  return page.evaluate(
    async ({ dbName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction('userSettings', 'readonly');
        const get = transaction.objectStore('userSettings').get('current');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      database.close();
      return row as {
        readonly value?: { readonly mouseMovementEnabled?: unknown };
      };
    },
    { dbName: DB_NAME },
  );
}

test('a C03 campaign with the forbidden marker/counter equality stays a Save Data Error and is neither rewritten nor used to seed the allocator (V02-WI-02 C06)', async ({
  page,
}) => {
  // C03-forbidden equality: the marker's attempt id equals the next counter
  // value (a marker id is always strictly below the next allocated counter).
  await seedVersion1Database(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 12,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: { missionId: 'interception-01', attemptId: 2 },
    nextMissionAttemptId: 2,
    pilotId: 'pilot-shevchenko',
  });

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  // The complete legacy validation rejects the record BEFORE any rewrite or
  // seed, and the raw record still carries the obsolete counter, so the
  // current validator keeps it a non-overwriting Save Data Error.
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBeUndefined();
  expect(stored.value.nextMissionAttemptId).toBe(2);
  expect(stored.value.missionInProgress?.attemptId).toBe(2);
  expect(stored.value.credits).toBe(12);

  // The allocator store exists (version 2 opened) but holds NO rows: the
  // invalid legacy record seeded nothing.
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.hasAllocator).toBe(true);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);

  // A plain reload never overwrites the unreadable record.
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  const afterReload = await readStoredCampaign(page);
  expect(afterReload.value.nextMissionAttemptId).toBe(2);
});

test('a C03 campaign with an invalid unrelated field is neither rewritten nor used to seed the allocator (V02-WI-02 C06)', async ({
  page,
}) => {
  // Structurally numeric marker/counter values are valid; the negative Credits
  // is an invalid C03 campaign field that must fail the complete validation.
  await seedVersion1Database(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: -5,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    nextMissionAttemptId: 5,
    pilotId: 'pilot-shevchenko',
  });

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBeUndefined();
  expect(stored.value.nextMissionAttemptId).toBe(5);
  expect(stored.value.credits).toBe(-5);

  // No campaign rewrite and no allocator seed inside the upgrade transaction.
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.hasAllocator).toBe(true);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);
});

test('a version-1 row missing its required C03 counter stays a Save Data Error and only confirmed Start New Game replaces it with a marked current row (V02-WI-02 C07)', async ({
  page,
}) => {
  // A C03-shaped campaign MISSING the obsolete counter: every value field is
  // otherwise valid, so only row-envelope provenance can distinguish it from
  // valid current progress.
  await seedVersion1Database(
    page,
    {
      schemaVersion: 1,
      runStatus: 'active',
      credits: 12,
      aircraftId: 'german-fighter',
      hullIntegrity: 100,
      equippedWeapon: 'machine-gun',
      unlockedMissionIds: ['interception-01'],
      completedMissionIds: [],
      missionInProgress: null,
      pilotId: 'pilot-shevchenko',
    },
    { mouseMovementEnabled: false },
  );

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  // The migration leaves the row untouched and writes NO current-format
  // marker, so Boot rejects it at the platform row envelope as a
  // non-overwriting Save Data Error.
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBeUndefined();
  expect(stored.value.nextMissionAttemptId).toBeUndefined();
  expect(stored.value.credits).toBe(12);
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.hasAllocator).toBe(true);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);

  // The raw row survives a plain reload unchanged (no overwrite, no marker).
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  const afterReload = await readStoredCampaign(page);
  expect(afterReload.rowFormatVersion).toBeUndefined();
  expect(afterReload.value.credits).toBe(12);

  // Confirmed Start New Game is the ONLY authorized replacement: it writes a
  // marked current-format row, opens Operations with 12 Starting Credits,
  // preserves Settings, and never seeds the allocator.
  await page.getByRole('button', { name: 'Start New Game' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await expect(page.getByText('Credits: 12')).toBeVisible();
  const replaced = await readStoredCampaign(page);
  expect(replaced.rowFormatVersion).toBe(2);
  expect(replaced.value.credits).toBe(12);
  const afterReplace = await readAllocatorState(page);
  expect(afterReplace.allocatorCount).toBe(0);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mouse Movement Enabled' }),
  ).not.toBeChecked();
});

test('V02-WI-07 D02-B: a rejected legacy C03 migration keeps its original field-specific console diagnostic (invalid Credits), stays byte-for-structure untouched, and never seeds the allocator (Epic §14.2, V02-DEC-034, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  // A genuine version-1 database whose C03-shaped campaign has an invalid
  // Credits field: the complete legacy validation rejects it, so the upgrade
  // leaves the raw row untouched — obsolete counter intact, no marker.
  await seedVersion1Database(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: -5,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    nextMissionAttemptId: 5,
    pilotId: 'pilot-shevchenko',
  });

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  // The existing Save Data Error flow opens with the generic player copy only.
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect(
    page.getByText('Saved game data could not be loaded.'),
  ).toBeVisible();
  // The development console reports the ORIGINAL failing field, not only the
  // row-envelope path.
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    { path: 'credits', message: 'credits must be a non-negative integer' },
  ]);

  // The unreadable row stays byte-for-structure untouched.
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBeUndefined();
  expect(stored.value.nextMissionAttemptId).toBe(5);
  expect(stored.value.credits).toBe(-5);
  // A rejected legacy row never allocates a mission attempt id.
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.hasAllocator).toBe(true);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);

  // A reload reports the same original cause once more and changes nothing.
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThanOrEqual(2);
  expect(diagnostics[1]).toEqual(diagnostics[0]);
  const afterReload = await readStoredCampaign(page);
  expect(afterReload.rowFormatVersion).toBeUndefined();
  expect(afterReload.value.nextMissionAttemptId).toBe(5);
  expect(afterReload.value.credits).toBe(-5);
});

test('V02-WI-07 D02-B: a rejected legacy C03 migration reports the marker/counter ordering cause at missionInProgress, never only the row-envelope path (Epic §14.2, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  // C03-forbidden equality: the marker's attempt id equals the next counter
  // value, so only the legacy ordering invariant rejects this row.
  await seedVersion1Database(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 12,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: { missionId: 'interception-01', attemptId: 2 },
    nextMissionAttemptId: 2,
    pilotId: 'pilot-shevchenko',
  });

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    {
      path: 'missionInProgress',
      message:
        'the mission attempt id is not strictly below the next mission attempt id',
    },
  ]);
  expect(diagnostics.map((entry) => entry.path)).not.toContain(
    'rowFormatVersion',
  );

  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBeUndefined();
  expect(stored.value.nextMissionAttemptId).toBe(2);
  expect(stored.value.missionInProgress?.attemptId).toBe(2);
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);
});

test('V02-WI-07 D02-B: an unmarked row without established legacy provenance reports the truthful current-row rejection, never a fabricated migration cause, and is replaced only by confirmed Start New Game (Epic §14.2, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  // A C03-shaped campaign MISSING the obsolete counter: every value is valid,
  // so the row's provenance cannot be established and no legacy cause may be
  // claimed for it.
  await seedVersion1Database(
    page,
    {
      schemaVersion: 1,
      runStatus: 'active',
      credits: 12,
      aircraftId: 'german-fighter',
      hullIntegrity: 100,
      equippedWeapon: 'machine-gun',
      unlockedMissionIds: ['interception-01'],
      completedMissionIds: [],
      missionInProgress: null,
      pilotId: 'pilot-shevchenko',
    },
    { mouseMovementEnabled: false },
  );

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    {
      path: 'rowFormatVersion',
      message: 'stored campaign row is not in the current format',
    },
  ]);

  // A plain reload never replaces or rewrites the unreadable row.
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  const unchanged = await readStoredCampaign(page);
  expect(unchanged.rowFormatVersion).toBeUndefined();
  expect(unchanged.value.credits).toBe(12);

  // Only the explicitly confirmed destructive action replaces it.
  await page.getByRole('button', { name: 'Start New Game' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  const replaced = await readStoredCampaign(page);
  expect(replaced.rowFormatVersion).toBe(2);
  expect(replaced.value.credits).toBe(12);
});

test('V02-WI-07 D02-B: a current-format row whose campaign value fails validation reports the failing field by path in the development console (Epic §14.2, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  // A marked current-format row whose VALUE fails campaign validation: the
  // current-campaign validation cause must reach the development console too.
  await writeCampaignRecord(page, {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 12,
    aircraftId: 'german-fighter',
    hullIntegrity: 500,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
  });

  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    {
      path: 'hullIntegrity',
      message: 'hullIntegrity must be an integer in 0..100',
    },
  ]);

  // The marked row survives the Save Data Error unchanged.
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBe(2);
  expect(stored.value.hullIntegrity).toBe(500);
});

/** A C03-like persisted campaign value whose Credits field is invalid: the
 *  complete legacy C03 validation rejects it, so it is the value probe used by
 *  the wrong-marker regressions (V02-WI-07 D02-B-C01 F1). */
function c03LikeInvalidCreditsValue(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    runStatus: 'active',
    credits: -5,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    nextMissionAttemptId: 5,
    pilotId: 'pilot-shevchenko',
  };
}

test('V02-WI-07 D02-B-C01: an explicit wrong row-format marker over a C03-like invalid value stays a row-format rejection, untouched, with no allocator allocation (F1, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  // A version-1 database whose campaign row carries an EXPLICIT non-current
  // marker (3) and a C03-like value with invalid Credits. The conflicting
  // envelope makes the provenance ambiguous, so the development console must
  // report the current-row format rejection instead of the value's field cause.
  await seedVersion1CampaignRow(page, {
    id: 'current',
    rowFormatVersion: 3,
    value: c03LikeInvalidCreditsValue(),
  });

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect(
    page.getByText('Saved game data could not be loaded.'),
  ).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    {
      path: 'rowFormatVersion',
      message: 'stored campaign row is not in the current format',
    },
  ]);

  // The row stays unreadable and byte-for-structure unchanged: its explicit
  // marker, obsolete counter, and invalid value are all preserved.
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBe(3);
  expect(stored.value.nextMissionAttemptId).toBe(5);
  expect(stored.value.credits).toBe(-5);
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.hasAllocator).toBe(true);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);

  // A reload reports the same rejection once more and changes nothing.
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThanOrEqual(2);
  expect(diagnostics[1]).toEqual(diagnostics[0]);
  const afterReload = await readStoredCampaign(page);
  expect(afterReload.rowFormatVersion).toBe(3);
  expect(afterReload.value.nextMissionAttemptId).toBe(5);
  expect(afterReload.value.credits).toBe(-5);
});

test('V02-WI-07 D02-B-C01: a present-undefined row-format marker is an explicit non-current claim and reports the row-format rejection (F1 boundary, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();

  // Chromium IndexedDB preserves a present `undefined` property, so this is a
  // real persisted row shape: the envelope claims a format it does not name.
  expect(
    await writePresentUndefinedMarkerRow(page, c03LikeInvalidCreditsValue()),
  ).toBe(true);

  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    {
      path: 'rowFormatVersion',
      message: 'stored campaign row is not in the current format',
    },
  ]);
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBeUndefined();
  expect(stored.value.credits).toBe(-5);
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);
});

test('V02-WI-07 D02-B-C02: the version-1 → version-2 upgrade does not promote a valid C03 row with an explicit wrong row-format marker (V02-DEC-035, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  // Every campaign field passes the complete legacy C03 validation, so only the
  // explicit conflicting marker can stop the upgrade from promoting this row.
  await seedVersion1CampaignRow(
    page,
    { id: 'current', rowFormatVersion: 1, value: c03LikeValidValue() },
    { mouseMovementEnabled: false },
  );

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  // Not promoted: the existing Save Data Error flow opens with the generic
  // player copy and the truthful development diagnostic.
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect(page.getByTestId('operations-screen')).toHaveCount(0);
  await expect(
    page.getByText('Saved game data could not be loaded.'),
  ).toBeVisible();
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    {
      path: 'rowFormatVersion',
      message: 'stored campaign row is not in the current format',
    },
  ]);

  // Byte-for-structure untouched: the explicit marker, the obsolete counter,
  // and every valid campaign field survive; no allocator identity is seeded.
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBe(1);
  expect(stored.value.nextMissionAttemptId).toBe(5);
  expect(stored.value.credits).toBe(40);
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.hasAllocator).toBe(true);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);
  // Settings survive the non-promotion unchanged.
  expect((await readStoredSettings(page)).value).toEqual({
    mouseMovementEnabled: false,
  });

  // A reload neither promotes nor rewrites the row.
  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  const afterReload = await readStoredCampaign(page);
  expect(afterReload.rowFormatVersion).toBe(1);
  expect(afterReload.value.nextMissionAttemptId).toBe(5);
  expect(afterReload.value.credits).toBe(40);
});

test('V02-WI-07 D02-B-C02: an exact current marker in a version-1 database is never playable and keeps the existing obsolete-counter diagnostic (V02-DEC-035, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  // The marker value alone cannot prove current provenance in a version-1
  // database: the row still carries its obsolete counter and stays unreadable.
  await seedVersion1CampaignRow(page, {
    id: 'current',
    rowFormatVersion: 2,
    value: c03LikeValidValue(),
  });

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect(page.getByTestId('operations-screen')).toHaveCount(0);
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  // The row is not rewritten, so the existing current-campaign validation still
  // rejects the obsolete counter by path.
  expect(diagnostics).toEqual([
    {
      path: 'nextMissionAttemptId',
      message:
        'obsolete legacy counter must be removed by the campaign migration',
    },
  ]);
  const stored = await readStoredCampaign(page);
  expect(stored.rowFormatVersion).toBe(2);
  expect(stored.value.nextMissionAttemptId).toBe(5);
  expect(stored.value.credits).toBe(40);
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);

  await page.reload();
  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
});

test('V02-WI-07 D02-B-C02: a present-undefined row-format marker blocks the version-1 → version-2 promotion (V02-DEC-035, V02-AC-021)', async ({
  page,
}) => {
  const diagnostics = captureSaveDataDiagnostics(page);
  // A present `undefined` marker is an own property (not an absent one), so the
  // shared guard must treat this valid C03 row as conflicting provenance. The
  // marker is reconstructed inside the page because Playwright's argument
  // serializer drops `undefined` property values.
  await seedVersion1CampaignRow(
    page,
    { id: 'current', value: c03LikeValidValue() },
    { mouseMovementEnabled: true },
    true,
  );

  await page.goto('/');
  await page.evaluate(
    () => (window as { __v1Created?: Promise<void> }).__v1Created,
  );

  await expect(page.getByTestId('save-data-error-screen')).toBeVisible();
  await expect(page.getByTestId('operations-screen')).toHaveCount(0);
  await expect.poll(() => diagnostics.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([
    {
      path: 'rowFormatVersion',
      message: 'stored campaign row is not in the current format',
    },
  ]);
  // The counter proves no migration ran; the row was not promoted.
  const stored = await readStoredCampaign(page);
  expect(stored.value.nextMissionAttemptId).toBe(5);
  expect(stored.value.credits).toBe(40);
  const allocatorState = await readAllocatorState(page);
  expect(allocatorState.allocatorCount).toBe(0);
  expect(allocatorState.maxKey).toBe(-1);
});

test('mission progression persists across reload: completed stays replayable, the unlocked next mission is available, and replay launches (Epic §6.2, V02-AC-001–002)', async ({
  page,
}) => {
  // Seed a persisted campaign after the first Success on Interception 01:
  // Interception 01 completed, Interception 02 unlocked, 03 locked.
  await page.goto('/');
  await expect(page.getByTestId('operations-screen')).toBeVisible();
  await writeCampaignRecord(page, {
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

  // Completed Interception 01 stays visible as Completed (replayable).
  const completed = page.getByRole('button', {
    name: 'Interception 01 (Completed)',
  });
  await expect(completed).toBeVisible();
  await expect(completed).toBeEnabled();
  // The unlocked next mission is available; 03 remains locked.
  await expect(
    page.getByRole('button', { name: 'Interception 02' }),
  ).toBeVisible();
  const locked = page.getByRole('button', {
    name: 'Interception 03 (Locked)',
  });
  await expect(locked).toBeVisible();
  await expect(locked).toBeDisabled();

  // Replay of the completed mission opens its Mission Details and can start.
  await completed.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Interception 01' }),
  ).toBeVisible();
  await expect(page.getByText('8 Credits')).toBeVisible();
  await page.getByRole('button', { name: 'Start Mission' }).click();
  await expect(page.getByTestId('combat-screen')).toBeVisible();
});
