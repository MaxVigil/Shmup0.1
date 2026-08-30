import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { beginMission, createNewGameCampaign } from '@domain/index';
import { aircraftId } from '@domain/index';
import type {
  AssetPreloadResult,
  RuntimeAssetPreload,
  SessionSeedSource,
} from '../ports';
import { createBootRunner } from './boot';
import { createSessionStore } from './store';
import {
  InMemoryCampaignStore,
  InMemoryUserSettingsStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import type { CampaignStateV1 } from '@domain/index';

const READY_ASSETS: AssetPreloadResult = [
  {
    id: 'icon-gear',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/gear.svg',
    url: '/icons/gear.svg',
    status: 'ready',
  },
];

const FALLBACK_MANIFEST: AssetPreloadResult = [
  {
    id: 'icon-gear',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/gear.svg',
    url: '/icons/gear.svg',
    status: 'fallback',
  },
];

function seedSource(seed: number): SessionSeedSource {
  return { getSessionSeed: () => seed };
}

function preload(assets: AssetPreloadResult): RuntimeAssetPreload {
  return {
    preload: async () => assets,
    fallbackResult: () => FALLBACK_MANIFEST,
  };
}

interface BootTestDeps {
  readonly store: ReturnType<typeof createSessionStore>;
  readonly campaignStore: InMemoryCampaignStore;
  readonly userSettingsStore: InMemoryUserSettingsStore;
}

function bootDeps(
  deps: BootTestDeps,
  overrides: {
    readonly seedSource?: SessionSeedSource;
    readonly runtimeAssetPreload?: RuntimeAssetPreload;
  } = {},
) {
  return {
    store: deps.store,
    sessionSeedSource: overrides.seedSource ?? seedSource(3735928559),
    runtimeAssetPreload: overrides.runtimeAssetPreload ?? preload(READY_ASSETS),
    content: CONTENT_CATALOGUE,
    campaignStore: deps.campaignStore,
    userSettingsStore: deps.userSettingsStore,
  };
}

function emptyPersistence(): BootTestDeps {
  return {
    store: createSessionStore(),
    campaignStore: new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    ),
    userSettingsStore: new InMemoryUserSettingsStore(),
  };
}

function newGameCampaign(seed: number): CampaignStateV1 {
  return createNewGameCampaign({
    aircraftId: aircraftId('german-fighter'),
    maximumHullIntegrity: 100,
    pilotIds: CONTENT_CATALOGUE.pilots.map((pilot) => pilot.id),
    sessionSeed: seed,
  });
}

describe('createBootRunner (WI-02 persistence hydration)', () => {
  it('creates and persists the canonical v0.2 New Game state when no campaign exists', async () => {
    const deps = emptyPersistence();
    const outcome = await createBootRunner(bootDeps(deps)).run();
    expect(outcome.kind).toBe('ready');
    // The New Game was persisted before the session was hydrated.
    const persisted = deps.campaignStore.current;
    expect(persisted).not.toBeNull();
    expect(persisted?.credits).toBe(12);
    expect(persisted?.runStatus).toBe('active');
    expect(persisted?.unlockedMissionIds).toEqual(['interception-01']);
    const session = deps.store.getState();
    expect(session).not.toBeNull();
    expect(session?.credits).toBe(12);
    expect(session?.pilot.id).toBe(persisted?.pilotId);
  });

  it('hydrates from an existing persisted campaign and separately persisted Settings', async () => {
    const deps = emptyPersistence();
    deps.campaignStore.seed({
      ...newGameCampaign(3735928559),
      credits: 40,
      hullIntegrity: 55,
      equippedWeapon: 'cannon',
    });
    deps.userSettingsStore.seed({ mouseMovementEnabled: false });
    const outcome = await createBootRunner(bootDeps(deps)).run();
    expect(outcome.kind).toBe('ready');
    const session = deps.store.getState()!;
    expect(session.credits).toBe(40);
    expect(session.hullIntegrity).toBe(55);
    expect(session.equippedWeapon).toBe('cannon');
    expect(session.mouseMovementEnabled).toBe(false);
    // The persisted campaign was not recreated.
    expect(deps.campaignStore.current?.credits).toBe(40);
  });

  it('uses the approved default Settings when none are persisted', async () => {
    const deps = emptyPersistence();
    await createBootRunner(bootDeps(deps)).run();
    expect(deps.store.getState()?.mouseMovementEnabled).toBe(true);
  });

  it('resolves a persisted active mission exactly once as Defeat with paid full Repair', async () => {
    const deps = emptyPersistence();
    const inProgress = beginMission(
      newGameCampaign(3735928559),
      'interception-01',
      0,
    );
    if (inProgress.kind === 'rejected') {
      throw new Error('Expected the marker to be set.');
    }
    deps.campaignStore.seed(inProgress.campaign); // credits 12, marker set
    const outcome = await createBootRunner(bootDeps(deps)).run();
    expect(outcome.kind).toBe('ready');
    // Exactly 8 Credits deducted, Hull 100, marker cleared, run stays active.
    const persisted = deps.campaignStore.current!;
    expect(persisted.credits).toBe(12 - 8);
    expect(persisted.hullIntegrity).toBe(100);
    expect(persisted.missionInProgress).toBeNull();
    expect(persisted.runStatus).toBe('active');
    // Combat is never restored; the session opens Operations.
    expect(deps.store.getState()?.activeMission).toBe('none');
    expect(deps.store.getState()?.credits).toBe(12 - 8);
  });

  it('resolves a persisted active mission as Game Over when Repair cannot be paid', async () => {
    const deps = emptyPersistence();
    const inProgress = beginMission(
      newGameCampaign(3735928559),
      'interception-01',
      0,
    );
    if (inProgress.kind === 'rejected') {
      throw new Error('Expected the marker to be set.');
    }
    deps.campaignStore.seed({ ...inProgress.campaign, credits: 7 });
    const outcome = await createBootRunner(bootDeps(deps)).run();
    expect(outcome.kind).toBe('ready');
    const persisted = deps.campaignStore.current!;
    expect(persisted.runStatus).toBe('game-over');
    expect(persisted.credits).toBe(7); // no partial deduction
    expect(persisted.missionInProgress).toBeNull();
    expect(deps.store.getState()?.runStatus).toBe('game-over');
  });

  it('does not re-resolve a marker already cleared on a second startup', async () => {
    const deps = emptyPersistence();
    const inProgress = beginMission(
      newGameCampaign(3735928559),
      'interception-01',
      0,
    );
    if (inProgress.kind === 'rejected') {
      throw new Error('Expected the marker to be set.');
    }
    deps.campaignStore.seed(inProgress.campaign);
    await createBootRunner(bootDeps(deps)).run();
    const afterFirst = deps.campaignStore.current!;
    expect(afterFirst.credits).toBe(12 - 8);

    // A fresh page load reads the cleared marker: no second deduction.
    const second = emptyPersistence();
    second.campaignStore.seed(afterFirst);
    await createBootRunner(bootDeps(second)).run();
    expect(second.campaignStore.current?.credits).toBe(12 - 8);
    expect(second.campaignStore.current?.missionInProgress).toBeNull();
  });

  it('opens the Save Data Error state for an unreadable campaign without overwriting it', async () => {
    const deps = emptyPersistence();
    // A stored record that fails strict validation.
    deps.campaignStore.seed({
      ...newGameCampaign(3735928559),
      credits: -5,
    } as unknown as CampaignStateV1);
    const outcome = await createBootRunner(bootDeps(deps)).run();
    expect(outcome.kind).toBe('save-data-error');
    if (outcome.kind === 'save-data-error') {
      expect(outcome.diagnostics.length).toBeGreaterThan(0);
    }
    // The unreadable record is untouched and no session was created.
    expect(deps.campaignStore.current?.credits).toBe(-5);
    expect(deps.store.getState()).toBeNull();
  });

  it('treats an unsupported schema version as a non-overwriting Save Data Error', async () => {
    const deps = emptyPersistence();
    deps.campaignStore.seed({
      schemaVersion: 2,
      runStatus: 'active',
    } as unknown as CampaignStateV1);
    const outcome = await createBootRunner(bootDeps(deps)).run();
    expect(outcome.kind).toBe('save-data-error');
    expect(deps.store.getState()).toBeNull();
  });

  it('reports fatal when the seed source fails', async () => {
    const deps = emptyPersistence();
    const outcome = await createBootRunner(
      bootDeps(deps, {
        seedSource: {
          getSessionSeed: () => {
            throw new Error('no entropy');
          },
        },
      }),
    ).run();
    expect(outcome.kind).toBe('fatal');
    expect(deps.store.getState()).toBeNull();
  });

  it('reports fatal when the campaign store cannot be read', async () => {
    const deps = emptyPersistence();
    deps.campaignStore.read = async () => {
      throw new Error('IndexedDB unavailable');
    };
    const outcome = await createBootRunner(bootDeps(deps)).run();
    expect(outcome.kind).toBe('fatal');
    expect(deps.store.getState()).toBeNull();
  });

  it('yields the complete fallback manifest when the preload port rejects', async () => {
    const deps = emptyPersistence();
    const outcome = await createBootRunner(
      bootDeps(deps, {
        runtimeAssetPreload: {
          preload: async () => {
            throw new Error('preload infrastructure failure');
          },
          fallbackResult: () => FALLBACK_MANIFEST,
        },
      }),
    ).run();
    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.assets).toEqual(FALLBACK_MANIFEST);
    }
  });

  it('reuses a single in-progress boot for concurrent invocation', async () => {
    const deps = emptyPersistence();
    const seedDraws: number[] = [];
    let resolvePreload: ((value: AssetPreloadResult) => void) | undefined;
    const runner = createBootRunner(
      bootDeps(deps, {
        seedSource: {
          getSessionSeed: () => {
            seedDraws.push(1);
            return 3735928559;
          },
        },
        runtimeAssetPreload: {
          preload: () =>
            new Promise<AssetPreloadResult>((resolve) => {
              resolvePreload = resolve;
            }),
          fallbackResult: () => FALLBACK_MANIFEST,
        },
      }),
    );

    const first = runner.run();
    const second = runner.run();
    expect(seedDraws).toHaveLength(1);

    resolvePreload?.(READY_ASSETS);
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);
    expect(firstOutcome).toBe(secondOutcome);
    expect(seedDraws).toHaveLength(1);
    // Exactly one New Game campaign was persisted.
    expect(deps.campaignStore.current?.credits).toBe(12);
    expect(deps.store.getState()).not.toBeNull();
  });
});
