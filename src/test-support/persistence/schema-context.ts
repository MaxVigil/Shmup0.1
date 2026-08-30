import type { ContentCatalogue } from '@application/content';
import type { CampaignSchemaContext } from '@domain/index';

/** Default validated identity context derived from the canonical content. */
export function campaignSchemaContext(
  content: ContentCatalogue,
): CampaignSchemaContext {
  return {
    validAircraftIds: new Set(content.aircraft.map((aircraft) => aircraft.id)),
    validPilotIds: new Set(content.pilots.map((pilot) => pilot.id)),
  };
}
