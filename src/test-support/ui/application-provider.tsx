import type { ReactElement, ReactNode } from 'react';
import { createNewGameCommand } from '@application/persistence';
import { createSessionStore } from '@application/session';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import type { SessionSeedSource } from '@application/ports';
import type { ApplicationContextValue } from '@ui/application-context';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  InMemoryCampaignStore,
  InMemoryUserSettingsStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import { ApplicationContext } from '@ui/application-context';

/** All six approved Phosphor icons marked ready for UI tests. */
export const ALL_ICONS_READY: AssetPreloadResult = [
  {
    id: 'icon-gear',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/gear.svg',
    url: '/icons/gear.svg',
    status: 'ready',
  },
  {
    id: 'icon-pause',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/pause.svg',
    url: '/icons/pause.svg',
    status: 'ready',
  },
  {
    id: 'icon-crosshair',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/crosshair.svg',
    url: '/icons/crosshair.svg',
    status: 'ready',
  },
  {
    id: 'icon-map-trifold',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/map-trifold.svg',
    url: '/icons/map-trifold.svg',
    status: 'ready',
  },
  {
    id: 'icon-warehouse',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/warehouse.svg',
    url: '/icons/warehouse.svg',
    status: 'ready',
  },
  {
    id: 'icon-check',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/check.svg',
    url: '/icons/check.svg',
    status: 'ready',
  },
];

/** Deterministic seed source for UI tests. */
export const FIXED_SEED_SOURCE: SessionSeedSource = {
  getSessionSeed: () => 3735928559,
};

/**
 * Builds a complete composition ApplicationContext value with fresh in-memory
 * persistence ports so UI tests exercise the application command boundary
 * without touching IndexedDB. Callers override `store` and `preparedAssets`
 * as needed. The `newGame` command is bound to the FINAL (post-override)
 * ports so a test that replaces the store still exercises a coherent
 * composition-root-owned command.
 */
export function createApplicationContextValue(
  overrides: Partial<ApplicationContextValue> = {},
): ApplicationContextValue {
  const base: Omit<ApplicationContextValue, 'newGame'> = {
    store: createSessionStore(),
    preparedAssets: ALL_ICONS_READY,
    content: CONTENT_CATALOGUE,
    campaignStore: new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    ),
    userSettingsStore: new InMemoryUserSettingsStore(),
    sessionSeedSource: FIXED_SEED_SOURCE,
    ...overrides,
  };
  return {
    ...base,
    newGame: createNewGameCommand({
      store: base.store,
      campaignStore: base.campaignStore,
      userSettingsStore: base.userSettingsStore,
      content: base.content,
    }),
  };
}

/**
 * Wraps UI under the composition ApplicationContext with a fresh empty store,
 * the prepared-asset catalogue, and in-memory persistence ports, so primitives
 * that consume the catalogue (Icon, Checkbox, SettingsButton) render
 * deterministically in tests.
 */
export function WithApplication({
  children,
  assets = ALL_ICONS_READY,
  store = createSessionStore(),
}: {
  readonly children: ReactNode;
  readonly assets?: AssetPreloadResult;
  readonly store?: SessionStore;
}): ReactElement {
  const value = createApplicationContextValue({
    store,
    preparedAssets: assets,
  });
  return (
    <ApplicationContext.Provider value={value}>
      {children}
    </ApplicationContext.Provider>
  );
}
