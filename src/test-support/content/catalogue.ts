import { CONTENT_CATALOGUE } from '@content/index';
import type { ContentCatalogue } from '@content/index';

/**
 * Builds a catalogue variant by overriding selected collections of the
 * canonical catalogue. Used by validation tests to produce valid/invalid
 * catalogues without duplicating the canonical balance values (S01-TC-005).
 */
export function contentCatalogueWith(
  partial: Partial<ContentCatalogue>,
): ContentCatalogue {
  return {
    aircraft: partial.aircraft ?? CONTENT_CATALOGUE.aircraft,
    weapons: partial.weapons ?? CONTENT_CATALOGUE.weapons,
    enemies: partial.enemies ?? CONTENT_CATALOGUE.enemies,
    missions: partial.missions ?? CONTENT_CATALOGUE.missions,
    pilots: partial.pilots ?? CONTENT_CATALOGUE.pilots,
    projectile: partial.projectile ?? CONTENT_CATALOGUE.projectile,
  };
}
