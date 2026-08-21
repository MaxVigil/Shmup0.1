import type { ReactElement, ReactNode } from 'react';
import { createSessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
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

/**
 * Wraps UI under the composition ApplicationContext with a fresh empty store
 * and the prepared-asset catalogue, so primitives that consume the catalogue
 * (Icon, Checkbox, SettingsButton) render deterministically in tests.
 */
export function WithApplication({
  children,
  assets = ALL_ICONS_READY,
}: {
  readonly children: ReactNode;
  readonly assets?: AssetPreloadResult;
}): ReactElement {
  const store = createSessionStore();
  return (
    <ApplicationContext.Provider value={{ store, preparedAssets: assets }}>
      {children}
    </ApplicationContext.Provider>
  );
}
