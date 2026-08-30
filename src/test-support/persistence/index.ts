import type { ContentCatalogue } from '@application/content';
import { InMemoryCampaignStore } from './in-memory-campaign-store';
import { InMemoryUserSettingsStore } from './in-memory-user-settings-store';
import { campaignSchemaContext } from './schema-context';

export { InMemoryCampaignStore } from './in-memory-campaign-store';
export { InMemoryUserSettingsStore } from './in-memory-user-settings-store';
export { campaignSchemaContext } from './schema-context';
export { createInitializedTestApplication } from './initialized-test-application';
export type { InitializedTestApplication } from './initialized-test-application';

export interface InMemoryPersistence {
  readonly campaignStore: InMemoryCampaignStore;
  readonly userSettingsStore: InMemoryUserSettingsStore;
}

/** One coherent in-memory persistence pair for application/UI tests. */
export function createInMemoryPersistence(
  content: ContentCatalogue,
): InMemoryPersistence {
  return {
    campaignStore: new InMemoryCampaignStore(campaignSchemaContext(content)),
    userSettingsStore: new InMemoryUserSettingsStore(),
  };
}
