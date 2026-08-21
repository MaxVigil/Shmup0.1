import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import type {
  AssetPreloadResult,
  RuntimeAssetPreload,
  SessionSeedSource,
} from '../ports';
import { createBootRunner } from './boot';
import { createSessionStore } from './store';

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

describe('createBootRunner', () => {
  it('creates exactly one session and reports ready after preload', async () => {
    const store = createSessionStore();
    const outcome = await createBootRunner({
      store,
      sessionSeedSource: seedSource(3735928559),
      runtimeAssetPreload: preload(READY_ASSETS),
      content: CONTENT_CATALOGUE,
    }).run();
    expect(outcome.kind).toBe('ready');
    expect(store.getState()).not.toBeNull();
    if (outcome.kind === 'ready') {
      expect(outcome.assets).toEqual(READY_ASSETS);
    }
  });

  it('reports fatal when the seed source fails', async () => {
    const store = createSessionStore();
    const outcome = await createBootRunner({
      store,
      sessionSeedSource: {
        getSessionSeed: () => {
          throw new Error('no entropy');
        },
      },
      runtimeAssetPreload: preload([]),
      content: CONTENT_CATALOGUE,
    }).run();
    expect(outcome.kind).toBe('fatal');
    expect(store.getState()).toBeNull();
  });

  it('yields the complete fallback manifest when the preload port rejects', async () => {
    // Runtime assets are non-critical (MASTER-AC-003): a rejected preload port
    // must produce the complete approved manifest with every entry marked
    // fallback, never `assets = []` and never Fatal Startup (S02-WI02).
    const store = createSessionStore();
    const outcome = await createBootRunner({
      store,
      sessionSeedSource: seedSource(3735928559),
      runtimeAssetPreload: {
        preload: async () => {
          throw new Error('preload infrastructure failure');
        },
        fallbackResult: () => FALLBACK_MANIFEST,
      },
      content: CONTENT_CATALOGUE,
    }).run();
    expect(outcome.kind).toBe('ready');
    expect(store.getState()).not.toBeNull();
    if (outcome.kind === 'ready') {
      expect(outcome.assets).toEqual(FALLBACK_MANIFEST);
    }
  });

  it('reuses a single in-progress boot for concurrent invocation', async () => {
    const store = createSessionStore();
    const seedDraws: number[] = [];
    const preloadCalls: number[] = [];
    let resolvePreload: ((value: AssetPreloadResult) => void) | undefined;
    const runner = createBootRunner({
      store,
      sessionSeedSource: {
        getSessionSeed: () => {
          seedDraws.push(1);
          return 3735928559;
        },
      },
      runtimeAssetPreload: {
        preload: () => {
          preloadCalls.push(1);
          return new Promise<AssetPreloadResult>((resolve) => {
            resolvePreload = resolve;
          });
        },
        fallbackResult: () => FALLBACK_MANIFEST,
      },
      content: CONTENT_CATALOGUE,
    });

    const first = runner.run();
    const second = runner.run();

    expect(seedDraws).toHaveLength(1);
    expect(preloadCalls).toHaveLength(1);

    resolvePreload?.(READY_ASSETS);
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

    expect(firstOutcome).toBe(secondOutcome);
    expect(seedDraws).toHaveLength(1);
    expect(preloadCalls).toHaveLength(1);
    expect(store.getState()).not.toBeNull();
  });

  it('reuses the completed result for invocation after completion', async () => {
    const store = createSessionStore();
    const seedDraws: number[] = [];
    const preloadCalls: number[] = [];
    const runner = createBootRunner({
      store,
      sessionSeedSource: {
        getSessionSeed: () => {
          seedDraws.push(1);
          return 3735928559;
        },
      },
      runtimeAssetPreload: {
        preload: async () => {
          preloadCalls.push(1);
          return READY_ASSETS;
        },
        fallbackResult: () => FALLBACK_MANIFEST,
      },
      content: CONTENT_CATALOGUE,
    });

    const first = await runner.run();
    const second = await runner.run();

    expect(first).toBe(second);
    expect(seedDraws).toHaveLength(1);
    expect(preloadCalls).toHaveLength(1);
    // The single initialized session (and its Pilot) is never recreated.
    expect(store.getState()?.pilot.name).toBe('Андрій Шевченко');
  });
});
