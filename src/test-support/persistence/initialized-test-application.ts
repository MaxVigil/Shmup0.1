import { buildNewGameCampaign } from '@application/persistence';
import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import { CONTENT_CATALOGUE } from '@content/index';
import type { ContentCatalogue } from '@application/content';
import { InMemoryCampaignStore } from './in-memory-campaign-store';
import { InMemoryUserSettingsStore } from './in-memory-user-settings-store';
import { campaignSchemaContext } from './schema-context';

export interface InitializedTestApplication {
  readonly store: SessionStore;
  readonly campaignStore: InMemoryCampaignStore;
  readonly userSettingsStore: InMemoryUserSettingsStore;
}

/**
 * One coherent in-memory test application: an initialized Session Store
 * hydrated from the canonical v0.2 New Game session, plus in-memory campaign
 * and Settings stores pre-seeded with the matching persisted New Game campaign
 * (Boot persists the campaign before hydration; tests mirror that before-state
 * so command tests exercise the real persist-then-session ordering).
 */
export function createInitializedTestApplication(
  content: ContentCatalogue = CONTENT_CATALOGUE,
  sessionSeed = 3735928559,
): InitializedTestApplication {
  const store = createSessionStore();
  const session = initializeSession(sessionSeed, content);
  store.dispatch({ type: 'session/initialized', session });
  const campaignStore = new InMemoryCampaignStore(
    campaignSchemaContext(content),
  );
  const userSettingsStore = new InMemoryUserSettingsStore();
  void campaignStore.replace(buildNewGameCampaign(content, sessionSeed));
  return { store, campaignStore, userSettingsStore };
}
