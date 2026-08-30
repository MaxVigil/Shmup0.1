import { createContext, useContext } from 'react';
import type { AssetPreloadResult } from '@application/ports';
import type { SessionSeedSource } from '@application/ports';
import type {
  CampaignStorePort,
  NewGameCommand,
  UserSettingsStorePort,
} from '@application/persistence';
import type { ContentCatalogue } from '@application/content';
import type { SessionStore } from '@application/session';

/**
 * The successful Boot result delivered to the React tree at the composition
 * boundary (S02-WI01, V02-WI-02): the single application-owned Session Store,
 * the immutable prepared-asset availability result, the immutable validated
 * content catalogue, the application persistence ports (concrete Dexie
 * adapters injected at the composition root), and the composition-root-owned
 * confirmed New Game command. UI components dispatch application commands
 * that use these ports; they never touch Dexie or stored records directly.
 * `sessionSeedSource` provides a fresh seed draw for a confirmed New Game so
 * a new Pilot is selected with equal probability.
 */
export interface ApplicationContextValue {
  readonly store: SessionStore;
  readonly preparedAssets: AssetPreloadResult;
  readonly content: ContentCatalogue;
  readonly campaignStore: CampaignStorePort;
  readonly userSettingsStore: UserSettingsStorePort;
  readonly sessionSeedSource: SessionSeedSource;
  /** Composition-root-owned single-flight confirmed New Game command (Epic
   *  §13.6; the latch is per application instance, never module-global). */
  readonly newGame: NewGameCommand;
}

export const ApplicationContext = createContext<ApplicationContextValue | null>(
  null,
);

export function useApplication(): ApplicationContextValue {
  const value = useContext(ApplicationContext);
  if (value === null) {
    throw new Error(
      'ApplicationContext is missing: the composition root must provide it.',
    );
  }
  return value;
}
